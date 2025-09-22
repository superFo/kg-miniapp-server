import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const t = header.replace(/^Bearer\s+/i, '');
  if (!t) return res.status(401).json({ error: 'unauthorized' });
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT u.id FROM user_sessions s JOIN users u ON s.user_id=u.id WHERE s.token=:t AND (s.expires_at IS NULL OR s.expires_at>NOW()) LIMIT 1', { t });
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'unauthorized' });
    req.userId = rows[0].id; next();
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
}

// POST /api/fav/toggle { pub_no }
router.post('/fav/toggle', auth, async (req, res) => {
  const { pub_no='' } = req.body||{};
  if(!pub_no) return res.status(400).json({ error:'pub_no_required' });
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT id FROM user_favorites WHERE user_id=:u AND pub_no=:p LIMIT 1', { u: req.userId, p: pub_no });
    if (rows && rows.length) {
      await pool.execute('DELETE FROM user_favorites WHERE id=:id', { id: rows[0].id });
      return res.json({ favored: false });
    }
    await pool.execute('INSERT INTO user_favorites (user_id, pub_no) VALUES (:u,:p)', { u: req.userId, p: pub_no });
    res.json({ favored: true });
  } catch (e) { res.status(500).json({ error:'internal_error' }); }
});

// GET /api/fav/list?page=&pageSize=
router.get('/fav/list', auth, async (req, res) => {
  const { page='1', pageSize='20' } = req.query||{}; const p=Math.max(parseInt(page,10)||1,1); const ps=Math.min(Math.max(parseInt(pageSize,10)||20,1),100); const offset=(p-1)*ps;
  try {
    const pool=getPool();
    const [cRows] = await pool.execute('SELECT COUNT(1) AS total FROM user_favorites WHERE user_id=:u', { u:req.userId });
    const [list] = await pool.execute(`
      SELECT f.pub_no, p.title, p.ipc_main, p.pub_date
      FROM user_favorites f LEFT JOIN patents p ON f.pub_no=p.pub_no
      WHERE f.user_id=:u ORDER BY f.id DESC LIMIT :offset,:ps
    `, { u:req.userId, offset, ps });
    res.json({ total: cRows?.[0]?.total||0, list: list||[] });
  } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

export default router;


