import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

// GET /api/compare?pub_nos=CN1,CN2,CN3
router.get('/compare', async (req, res) => {
  const raw = String(req.query.pub_nos || '').trim();
  if (!raw) return res.status(400).json({ error: 'pub_nos_required' });
  const ids = Array.from(new Set(raw.split(/[\s,，;；]+/).filter(Boolean))).slice(0, 3);
  if (!ids.length) return res.json({ list: [] });
  try {
    const pool = getPool();
    const placeholders = ids.map((_, i) => `:p${i}`).join(',');
    const params = ids.reduce((acc, v, i) => (acc[`p${i}`] = v, acc), {});
    const [rows] = await pool.execute(`
      SELECT pub_no, app_no, title, abstract, app_date, pub_date,
             inventors, inventor_count, applicants_current, applicants_current_count,
             ipc, ipc_main, ipc_main_prefix, patent_type, grant_flag
      FROM patents
      WHERE pub_no IN (${placeholders})
    `, params);
    res.json({ list: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;


