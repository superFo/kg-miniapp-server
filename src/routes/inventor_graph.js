import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

function splitToArray(text, limit = 20) {
  if (!text) return [];
  const arr = String(text)
    .split(/[\|;,，；、\s]+/)
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

// GET /api/graph/inventor_collab?topN=100&minWeight=1&sampleLimit=5000
router.get('/graph/inventor_collab', async (req, res) => {
  const pool = getPool();
  const topN = Math.max(10, Math.min(parseInt(String(req.query.topN || '100'), 10) || 100, 400));
  const minWeight = Math.max(1, Math.min(parseInt(String(req.query.minWeight || '1'), 10) || 1, 1000));
  const sampleLimit = Math.max(100, Math.min(parseInt(String(req.query.sampleLimit || '5000'), 10) || 5000, 20000));
  try {
    const { whereSql, params } = buildWhereFromQuery(req.query || {});
    const sql = `SELECT pub_no, inventors FROM patents ${whereSql} LIMIT :lim`;
    const [rows] = await pool.execute(sql, { ...params, lim: sampleLimit });

    const nodeData = new Map(); // inventor -> { count, pubs:Set }
    const edgeCount = new Map(); // 'a|||b' -> weight

    const clean = (name) => {
      if (!name) return '';
      let s = String(name)
        .replace(/[|]+/g, '')
        .replace(/[，；;、]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!s || s.length <= 1) return '';
      if (/^[._-]+$/.test(s)) return '';
      return s;
    };

    for (const r of (rows || [])) {
      const invs = splitToArray(r.inventors, 20).map(clean).filter(Boolean);
      if (!invs || invs.length < 2) continue;
      const uniq = Array.from(new Set(invs));
      uniq.forEach(p => {
        if (!nodeData.has(p)) nodeData.set(p, { count: 0, pubs: new Set() });
        const nd = nodeData.get(p);
        nd.count += 1;
        if (r.pub_no && nd.pubs.size < 5) nd.pubs.add(String(r.pub_no));
      });
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i]; const b = uniq[j];
          const [s, t] = a < b ? [a, b] : [b, a];
          const key = s + '|||'+ t;
          edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        }
      }
    }

    const topNodes = Array.from(nodeData.entries())
      .sort((a,b) => b[1].count - a[1].count)
      .slice(0, topN)
      .map(([name, d]) => ({ name, cnt: d.count, pubs: Array.from(d.pubs) }));
    const allowed = new Set(topNodes.map(n => n.name));

    const edges = [];
    for (const [key, w] of edgeCount.entries()) {
      if (w < minWeight) continue;
      const [a, b] = key.split('|||');
      if (allowed.has(a) && allowed.has(b)) edges.push({ a, b, w });
    }

    const nodes = topNodes.map(n => ({ id: `inv:${n.name}`, label: n.name, type: 'inventor', count: n.cnt, pubs: n.pubs }));
    const rels = edges.map(e => ({ source: `inv:${e.a}`, target: `inv:${e.b}`, rel: 'COINVENT_WITH', weight: e.w }));
    res.json({ nodes, edges: rels });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;


