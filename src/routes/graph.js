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


