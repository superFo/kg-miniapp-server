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

// POST /api/note/create { pub_no, content }
router.post('/note/create', auth, async (req, res) => {
  const { pub_no='', content='' } = req.body||{};
  if(!pub_no || !content) return res.status(400).json({ error:'params_required' });
  try {
    const pool = getPool();
    await pool.execute('INSERT INTO user_notes (user_id, pub_no, content) VALUES (:u,:p,:c)', { u:req.userId, p:pub_no, c:String(content).slice(0,4000) });
    res.json({ ok:true });
  } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

// GET /api/note/list?pub_no=&page=&pageSize=
router.get('/note/list', auth, async (req, res) => {
  const { pub_no='', page='1', pageSize='50' } = req.query||{}; if(!pub_no) return res.status(400).json({ error:'pub_no_required' });
  const p=Math.max(parseInt(page,10)||1,1); const ps=Math.min(Math.max(parseInt(pageSize,10)||50,1),100); const offset=(p-1)*ps;
  try {
    const pool=getPool();
    const [cRows] = await pool.execute('SELECT COUNT(1) AS total FROM user_notes WHERE user_id=:u AND pub_no=:p', { u:req.userId, p:pub_no });
    const [list] = await pool.execute('SELECT id, content, updated_at FROM user_notes WHERE user_id=:u AND pub_no=:p ORDER BY id DESC LIMIT :offset,:ps', { u:req.userId, p:pub_no, offset, ps });
    res.json({ total: cRows?.[0]?.total||0, list: list||[] });
  } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

// PATCH /api/note/:id { content }
router.patch('/note/:id', auth, async (req, res) => {
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  const { content='' } = req.body||{}; if(!content) return res.json({ ok:true });
  try{ const pool=getPool(); await pool.execute('UPDATE user_notes SET content=:c WHERE id=:id AND user_id=:u', { c:String(content).slice(0,4000), id, u:req.userId }); res.json({ ok:true }); } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

// DELETE /api/note/:id
router.delete('/note/:id', auth, async (req, res) => {
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  try{ const pool=getPool(); await pool.execute('DELETE FROM user_notes WHERE id=:id AND user_id=:u', { id, u:req.userId }); res.json({ ok:true }); } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

export default router;


