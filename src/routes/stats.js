import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

// GET /api/stats/domain/applications?domain=&from=&to=
router.get('/stats/domain/applications', async (req, res) => {
  const { domain = '', from = '', to = '' } = req.query;
  const pool = getPool();
  try {
    const where = [];
    const params = {};
    if (domain) { where.push('ipc_main_prefix = :ipc'); params.ipc = String(domain); }
    if (from) { where.push('apply_year >= :fromY'); params.fromY = Number(from); }
    if (to) { where.push('apply_year <= :toY'); params.toY = Number(to); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT apply_year AS year, COUNT(1) AS count FROM patents ${whereSql} GROUP BY apply_year ORDER BY apply_year`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/stats/domain/grant_rate?domain=&from=&to=
router.get('/stats/domain/grant_rate', async (req, res) => {
  const { domain = '', from = '', to = '' } = req.query;
  const pool = getPool();
  try {
    const where = [];
    const params = {};
    if (domain) { where.push('ipc_main_prefix = :ipc'); params.ipc = String(domain); }
    if (from) { where.push('apply_year >= :fromY'); params.fromY = Number(from); }
    if (to) { where.push('apply_year <= :toY'); params.toY = Number(to); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT apply_year AS year,
      SUM(CASE WHEN grant_flag=1 THEN 1 ELSE 0 END) / NULLIF(COUNT(1),0) AS grantRate
      FROM patents ${whereSql} GROUP BY apply_year ORDER BY apply_year`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows.map(r => ({ year: r.year, grantRate: Number(r.grantRate || 0) })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/stats/org/count?org=&from=&to=
router.get('/stats/org/count', async (req, res) => {
  const { org = '', from = '', to = '' } = req.query;
  const pool = getPool();
  try {
    const where = [];
    const params = {};
    if (org) {
      // 兼容多分隔符：空格/分号/顿号/竖线 → 逗号
      where.push('FIND_IN_SET(:org, REPLACE(REPLACE(REPLACE(REPLACE(applicants_current, " ", ","), ";", ","), "、", ","), "|", ","))');
      params.org = String(org);
    }
    if (from) { where.push('apply_year >= :fromY'); params.fromY = Number(from); }
    if (to) { where.push('apply_year <= :toY'); params.toY = Number(to); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT apply_year AS year, COUNT(1) AS count FROM patents ${whereSql} GROUP BY apply_year ORDER BY apply_year`;
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});


