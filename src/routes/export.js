import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool } from '../db/mysql.js';

export const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, '../../exports');
if (!fs.existsSync(OUT_DIR)) { try { fs.mkdirSync(OUT_DIR, { recursive: true }); } catch {} }

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

// POST /api/export/request { tree }
router.post('/export/request', auth, async (req, res) => {
  const { tree=null } = req.body||{};
  const pool = getPool();
  try {
    const [r] = await pool.execute('INSERT INTO export_tasks (user_id, params_json, status) VALUES (:u,:p,\'pending\')', { u:req.userId, p: JSON.stringify({ tree }) });
    const id = r?.insertId;
    // 简化：同步执行导出，落地 CSV
    await pool.execute('UPDATE export_tasks SET status=\'processing\' WHERE id=:id', { id });
    const file = path.join(OUT_DIR, `export_${id}.csv`);
    // 选择部分字段导出
    const [rows] = await pool.execute('SELECT pub_no, title, applicants_current, ipc_main, pub_date FROM patents ORDER BY pub_date DESC LIMIT 1000');
    const header = 'pub_no,title,applicants_current,ipc_main,pub_date\n';
    const body = (rows||[]).map(r => [r.pub_no, r.title, r.applicants_current, r.ipc_main, r.pub_date].map(x => '"' + String(x||'').replace(/"/g, '""') + '"').join(',')).join('\n');
    fs.writeFileSync(file, header + body);
    await pool.execute('UPDATE export_tasks SET status=\'done\', file_path=:f WHERE id=:id', { id, f: file });
    res.json({ taskId: id });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
});

// GET /api/export/status/:id
router.get('/export/status/:id', auth, async (req, res) => {
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  try {
    const pool=getPool();
    const [rows] = await pool.execute('SELECT id, status FROM export_tasks WHERE id=:id AND user_id=:u LIMIT 1', { id, u:req.userId });
    if (!rows || !rows.length) return res.status(404).json({ error:'not_found' });
    res.json(rows[0]);
  } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

// GET /api/export/download/:id
router.get('/export/download/:id', auth, async (req, res) => {
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  try {
    const pool=getPool();
    const [rows] = await pool.execute('SELECT file_path, status FROM export_tasks WHERE id=:id AND user_id=:u LIMIT 1', { id, u:req.userId });
    if (!rows || !rows.length) return res.status(404).json({ error:'not_found' });
    const r = rows[0]; if (r.status !== 'done' || !r.file_path || !fs.existsSync(r.file_path)) return res.status(400).json({ error:'not_ready' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=export_${id}.csv`);
    fs.createReadStream(r.file_path).pipe(res);
  } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

export default router;


