import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

function splitToArray(text, limit = 10) {
  if (!text) return [];
  const arr = String(text)
    .split(/[;,，；、\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
  return limit > 0 ? arr.slice(0, limit) : arr;
}

function buildWhereFromQuery(q) {
  const whereClauses = [];
  const params = {};
  const { kw = '', yearStart = '', yearEnd = '', type = '', ipcPrefix = '', applicant = '' } = q || {};
  if (kw && String(kw).trim()) {
    whereClauses.push('(MATCH(title, abstract) AGAINST(:kw IN NATURAL LANGUAGE MODE) OR title LIKE CONCAT("%", :kw_like, "%") OR abstract LIKE CONCAT("%", :kw_like, "%"))');
    params.kw = kw; params.kw_like = kw;
  }
  if (yearStart) { whereClauses.push('apply_year >= :ys'); params.ys = Number(yearStart); }
  if (yearEnd) { whereClauses.push('apply_year <= :ye'); params.ye = Number(yearEnd); }
  if (type) { whereClauses.push('(FIND_IN_SET(patent_type, :ptype) > 0)'); params.ptype = String(type); }
  if (ipcPrefix) { whereClauses.push('ipc_main_prefix LIKE CONCAT(:ipc, "%")'); params.ipc = String(ipcPrefix); }
  if (applicant) { whereClauses.push('applicants_current LIKE CONCAT("%", :app, "%")'); params.app = String(applicant); }
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params };
}

// GET /api/graph/neighbor?pub_no=&limit=50
router.get('/graph/neighbor', async (req, res) => {
  const { pub_no = '', limit = '50' } = req.query;
  if (!pub_no) return res.status(400).json({ error: 'pub_no_required' });
  const pool = getPool();
  try {
    const [rows] = await pool.execute('SELECT * FROM patents WHERE pub_no = :pub_no LIMIT 1', { pub_no });
    if (!rows || rows.length === 0) return res.json({ nodes: [], edges: [] });
    const p = rows[0];

    const nodes = [];
    const edges = [];
    const centerId = `patent:${p.pub_no}`;
    nodes.push({ id: centerId, label: p.title || p.pub_no, type: 'patent' });

    // applicants (organizations)
    splitToArray(p.applicants_current, 5).forEach(org => {
      const id = `org:${org}`;
      nodes.push({ id, label: org, type: 'organization' });
      edges.push({ source: centerId, target: id, rel: 'APPLIED_BY' });
    });

    // inventors (persons)
    splitToArray(p.inventors, 5).forEach(person => {
      const id = `inv:${person}`;
      nodes.push({ id, label: person, type: 'inventor' });
      edges.push({ source: centerId, target: id, rel: 'INVENTED_BY' });
    });

    // domain (ipc prefix)
    if (p.ipc_main_prefix) {
      const id = `ipc:${p.ipc_main_prefix}`;
      nodes.push({ id, label: p.ipc_main_prefix, type: 'domain' });
      edges.push({ source: centerId, target: id, rel: 'BELONGS_TO' });
    }

    // Trim result size
    const lim = Math.max(1, Math.min(parseInt(String(limit), 10) || 50, 200));
    const limitedNodes = nodes.slice(0, lim);
    const nodeIds = new Set(limitedNodes.map(n => n.id));
    const limitedEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    res.json({ nodes: limitedNodes, edges: limitedEdges });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/graph/path?src=&dst=&maxLen=4
router.get('/graph/path', async (req, res) => {
  const { src = '', dst = '', maxLen = '4' } = req.query;
  if (!src || !dst) return res.status(400).json({ error: 'src_dst_required' });
  const pool = getPool();
  try {
    const [aRows] = await pool.execute('SELECT pub_no, title, applicants_current, ipc_main_prefix FROM patents WHERE pub_no = :pub_no LIMIT 1', { pub_no: src });
    const [bRows] = await pool.execute('SELECT pub_no, title, applicants_current, ipc_main_prefix FROM patents WHERE pub_no = :pub_no LIMIT 1', { pub_no: dst });
    if (!aRows.length || !bRows.length) return res.json({ paths: [] });
    const a = aRows[0];
    const b = bRows[0];

    const aOrgs = new Set(splitToArray(a.applicants_current, 20));
    const bOrgs = new Set(splitToArray(b.applicants_current, 20));
    const orgShared = [...aOrgs].find(x => bOrgs.has(x));
    const ipcShared = (a.ipc_main_prefix && b.ipc_main_prefix && a.ipc_main_prefix === b.ipc_main_prefix) ? a.ipc_main_prefix : null;

    const path = { nodes: [], edges: [] };
    const aId = `patent:${a.pub_no}`;
    const bId = `patent:${b.pub_no}`;
    path.nodes.push({ id: aId, label: a.title || a.pub_no, type: 'patent' });
    path.nodes.push({ id: bId, label: b.title || b.pub_no, type: 'patent' });

    if (orgShared) {
      const mId = `org:${orgShared}`;
      path.nodes.push({ id: mId, label: orgShared, type: 'organization' });
      path.edges.push({ source: aId, target: mId, rel: 'APPLIED_BY' });
      path.edges.push({ source: mId, target: bId, rel: 'APPLIED_BY' });
      return res.json({ paths: [path] });
    }
    if (ipcShared) {
      const mId = `ipc:${ipcShared}`;
      path.nodes.push({ id: mId, label: ipcShared, type: 'domain' });
      path.edges.push({ source: aId, target: mId, rel: 'BELONGS_TO' });
      path.edges.push({ source: mId, target: bId, rel: 'BELONGS_TO' });
      return res.json({ paths: [path] });
    }
    // no simple path found
    res.json({ paths: [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/graph/org_collab?kw=&yearStart=&yearEnd=&type=&ipcPrefix=&applicant=&topN=80&minWeight=1&sampleLimit=5000
router.get('/graph/org_collab', async (req, res) => {
  const pool = getPool();
  const topN = Math.max(10, Math.min(parseInt(String(req.query.topN || '80'), 10) || 80, 300));
  const minWeight = Math.max(1, Math.min(parseInt(String(req.query.minWeight || '1'), 10) || 1, 1000));
  const sampleLimit = Math.max(100, Math.min(parseInt(String(req.query.sampleLimit || '5000'), 10) || 5000, 20000));
  try {
    const { whereSql, params } = buildWhereFromQuery(req.query || {});
    const sql = `SELECT applicants_current FROM patents ${whereSql} LIMIT :lim`;
    const [rows] = await pool.execute(sql, { ...params, lim: sampleLimit });

    // 累计节点与边权重
    const nodeCount = new Map();
    const edgeCount = new Map();

    for (const r of (rows || [])) {
      const orgs = splitToArray(r.applicants_current, 20);
      if (!orgs || orgs.length < 2) continue;
      // 去重同一专利中的重复机构名
      const uniq = Array.from(new Set(orgs));
      // 节点计数
      uniq.forEach(o => nodeCount.set(o, (nodeCount.get(o) || 0) + 1));
      // 两两组合计边
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i]; const b = uniq[j];
          const [s, t] = a < b ? [a, b] : [b, a];
          const key = s + '|||'+ t;
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        }
      }
    }

    // 选择前 topN 节点
    const topNodes = Array.from(nodeCount.entries())
      .sort((a,b) => b[1]-a[1])
      .slice(0, topN)
      .map(([name, cnt]) => ({ name, cnt }));
    const allowed = new Set(topNodes.map(n => n.name));

    // 过滤边：两端均在前 topN 且权重 >= minWeight
    const edges = [];
    for (const [key, w] of edgeCount.entries()) {
      if (w < minWeight) continue;
      const [a, b] = key.split('|||');
      if (allowed.has(a) && allowed.has(b)) {
        edges.push({ a, b, w });
      }
    }

    // 构造返回
    const nodes = topNodes.map(n => ({ id: `org:${n.name}`, label: n.name, type: 'organization', count: n.cnt }));
    const rels = edges.map(e => ({ source: `org:${e.a}`, target: `org:${e.b}`, rel: 'COLLAB_WITH', weight: e.w }));

    res.json({ nodes, edges: rels });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});


