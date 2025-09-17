import { Router } from 'express';
import crypto from 'crypto';
import { getPool } from '../db/mysql.js';

export const router = Router();

function hashPassword(pwd) {
  return crypto.createHash('sha256').update(String(pwd || '')).digest('hex');
}

// 初始化表（若不存在）
async function ensureUserTable() {
  const pool = getPool();
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(64) NOT NULL UNIQUE,
      password_hash CHAR(64) NOT NULL,
      display_name VARCHAR(128) NULL,
      email VARCHAR(128) NULL,
      avatar_url VARCHAR(255) NULL,
      role ENUM('user','admin') NOT NULL DEFAULT 'user',
      status TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    CREATE TABLE IF NOT EXISTS user_sessions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      token CHAR(64) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NULL,
      INDEX idx_sessions_user(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id BIGINT NOT NULL,
      token CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMP NOT NULL,
      INDEX idx_reset_user(user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

router.use(async (req, _res, next) => {
  try { await ensureUserTable(); } catch (e) {}
  // seed root admin
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT id FROM users WHERE username="root" LIMIT 1');
    if (!rows || rows.length === 0) {
      await pool.execute('INSERT INTO users (username, password_hash, display_name, role) VALUES ("root", :p, "超级管理员", "admin")', { p: hashPassword('123456') });
    }
  } catch (e) {}
  next();
});

// POST /api/user/register { username, password, displayName }
router.post('/user/register', async (req, res) => {
  const { username = '', password = '', displayName = '' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username_password_required' });
  try {
    const pool = getPool();
    await pool.execute('INSERT INTO users (username, password_hash, display_name) VALUES (:u, :p, :d)', {
      u: String(username).trim(),
      p: hashPassword(password),
      d: String(displayName || username).trim()
    });
    res.json({ ok: true });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'username_exists' });
    res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/user/login { username, password }
router.post('/user/login', async (req, res) => {
  const { username = '', password = '' } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username_password_required' });
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT id, username, password_hash, display_name, role FROM users WHERE username = :u AND status=1 LIMIT 1', { u: String(username).trim() });
    const u = rows && rows[0];
    if (!u || u.password_hash !== hashPassword(password)) return res.status(401).json({ error: 'invalid_credentials' });
    // 生成并保存会话 token（64位hex）
    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30*24*3600*1000); // 30天
    await pool.execute('INSERT INTO user_sessions (user_id, token, expires_at) VALUES (:uid, :t, :exp)', { uid: u.id, t: raw, exp: expiresAt });
    res.json({ token: raw, user: { id: u.id, username: u.username, display_name: u.display_name, role: u.role } });
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

function parseToken(auth) {
  try {
    if (!auth) return null;
    const b64 = auth.replace(/^Bearer\s+/i, '');
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    const [id, username] = raw.split('.', 3);
    return { id: Number(id), username };
  } catch { return null; }
}

// GET /api/user/me  Authorization: Bearer <token>
router.get('/user/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const b = header.replace(/^Bearer\s+/i, '');
  try {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT u.id, u.username, u.display_name FROM user_sessions s JOIN users u ON s.user_id=u.id WHERE s.token=:t AND (s.expires_at IS NULL OR s.expires_at>NOW()) LIMIT 1', { t: b });
    if (!rows || rows.length === 0) return res.status(401).json({ error: 'unauthorized' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/user/logout
router.post('/user/logout', async (req, res) => {
  const header = req.headers.authorization || '';
  const t = header.replace(/^Bearer\s+/i, '');
  try {
    const pool = getPool();
    await pool.execute('DELETE FROM user_sessions WHERE token = :t', { t });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/user/request_reset { username }
router.post('/user/request_reset', async (req, res) => {
  const { username='' } = req.body || {};
  const pool = getPool();
  try {
    const [rows] = await pool.execute('SELECT id FROM users WHERE username=:u LIMIT 1', { u: username });
    if (!rows.length) return res.json({ ok: true }); // 不暴露用户是否存在
    const uid = rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 3600*1000); // 1小时
    await pool.execute('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (:uid,:t,:e) ON DUPLICATE KEY UPDATE token=:t, expires_at=:e', { uid, t: token, e: exp });
    res.json({ ok: true, token }); // 先返回 token，后续可接入邮件发送
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/user/reset_password { token, newPassword }
router.post('/user/reset_password', async (req, res) => {
  const { token='', newPassword='' } = req.body || {};
  if (!token || !newPassword) return res.status(400).json({ error: 'params_required' });
  const pool = getPool();
  try {
    const [rows] = await pool.execute('SELECT user_id FROM password_reset_tokens WHERE token=:t AND expires_at>NOW() LIMIT 1', { t: token });
    if (!rows.length) return res.status(400).json({ error: 'invalid_or_expired' });
    const uid = rows[0].user_id;
    await pool.execute('UPDATE users SET password_hash=:p WHERE id=:id', { p: hashPassword(newPassword), id: uid });
    await pool.execute('DELETE FROM password_reset_tokens WHERE token=:t', { t: token });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'internal_error' }); }
});

export default router;

// 管理端 APIs（需admin）
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const t = header.replace(/^Bearer\s+/i, '');
  if (!t) return res.status(401).json({ error: 'unauthorized' });
  const pool = getPool();
  pool.execute('SELECT u.id,u.role FROM user_sessions s JOIN users u ON s.user_id=u.id WHERE s.token=:t LIMIT 1', { t })
    .then(([rows]) => {
      if (!rows || rows.length === 0 || rows[0].role !== 'admin') return res.status(403).json({ error: 'forbidden' });
      req.adminId = rows[0].id; next();
    })
    .catch(()=>res.status(500).json({ error: 'internal_error' }));
}

// GET /api/admin/users?kw=&role=&page=&pageSize=
router.get('/admin/users', requireAdmin, async (req, res) => {
  const { kw='', role='', page='1', pageSize='20' } = req.query;
  const p = Math.max(parseInt(page,10)||1,1); const ps = Math.min(Math.max(parseInt(pageSize,10)||20,1),100);
  const offset = (p-1)*ps; const where=[]; const params={};
  if (kw) { where.push('(username LIKE CONCAT("%",:kw,"%") OR email LIKE CONCAT("%",:kw,"%"))'); params.kw=kw; }
  if (role) { where.push('role=:role'); params.role=role; }
  const whereSql = where.length?`WHERE ${where.join(' AND ')}`:'';
  try {
    const pool = getPool();
    const [cRows] = await pool.execute(`SELECT COUNT(1) AS total FROM users ${whereSql}`, params);
    const [list] = await pool.execute(`SELECT id,username,display_name,email,role,status,created_at FROM users ${whereSql} ORDER BY id DESC LIMIT :offset,:ps`, { ...params, offset, ps });
    res.json({ total: cRows[0].total||0, list });
  } catch(e){ res.status(500).json({ error: 'internal_error' }); }
});

// POST /api/admin/users  { username, password, display_name, email, role }
router.post('/admin/users', requireAdmin, async (req, res) => {
  const { username='', password='', display_name='', email='', role='user' } = req.body||{};
  if(!username||!password) return res.status(400).json({ error:'params_required' });
  try{ const pool=getPool();
    await pool.execute('INSERT INTO users (username,password_hash,display_name,email,role) VALUES (:u,:p,:d,:e,:r)',{u:username,p:hashPassword(password),d:display_name||username,e:email,r:role});
    res.json({ ok:true });
  }catch(e){ if(e && e.code==='ER_DUP_ENTRY') return res.status(409).json({ error:'username_exists' }); res.status(500).json({ error:'internal_error' }); }
});

// PATCH /api/admin/users/:id  { display_name,email,role,status }
router.patch('/admin/users/:id', requireAdmin, async (req,res)=>{
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  const { display_name, email, role, status } = req.body||{}; const fields=[]; const p={ id };
  if(display_name!==undefined){ fields.push('display_name=:d'); p.d=display_name; }
  if(email!==undefined){ fields.push('email=:e'); p.e=email; }
  if(role!==undefined){ fields.push('role=:r'); p.r=role; }
  if(status!==undefined){ fields.push('status=:s'); p.s=Number(status); }
  if(!fields.length) return res.json({ ok:true });
  try{ const pool=getPool(); await pool.execute(`UPDATE users SET ${fields.join(', ')} WHERE id=:id`, p); res.json({ ok:true }); } catch(e){ res.status(500).json({ error:'internal_error' }); }
});

// DELETE /api/admin/users/:id
router.delete('/admin/users/:id', requireAdmin, async (req,res)=>{
  const id = Number(req.params.id||0); if(!id) return res.status(400).json({ error:'bad_id' });
  try{ const pool=getPool(); await pool.execute('DELETE FROM users WHERE id=:id', { id }); res.json({ ok:true }); } catch(e){ res.status(500).json({ error:'internal_error' }); }
});


