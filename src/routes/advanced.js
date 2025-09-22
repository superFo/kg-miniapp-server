import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

function buildClauseFromRule(rule, params, idxSeed) {
  const { field, op, value } = rule || {};
  const idx = idxSeed.count++;
  const key = `p${idx}`;
  switch (field) {
    case 'kw': {
      if (!value) return { sql: '1=1' };
      params[key] = String(value);
      params[`${key}_like`] = String(value);
      return { sql: '(MATCH(title, abstract) AGAINST(:' + key + ' IN NATURAL LANGUAGE MODE) OR title LIKE CONCAT("%", :' + key + '_like, "%") OR abstract LIKE CONCAT("%", :' + key + '_like, "%"))' };
    }
    case 'apply_year': {
      const n = Number(value);
      if (!Number.isFinite(n)) return { sql: '1=1' };
      params[key] = n;
      if (op === '>=') return { sql: 'apply_year >= :' + key };
      if (op === '<=') return { sql: 'apply_year <= :' + key };
      if (op === '=') return { sql: 'apply_year = :' + key };
      return { sql: '1=1' };
    }
    case 'ipc_prefix': {
      if (!value) return { sql: '1=1' };
      params[key] = String(value);
      return { sql: 'ipc_main_prefix LIKE CONCAT(:' + key + ', "%")' };
    }
    case 'patent_type': {
      if (!value) return { sql: '1=1' };
      params[key] = String(value);
      return { sql: 'patent_type = :' + key };
    }
    case 'applicant': {
      if (!value) return { sql: '1=1' };
      params[key] = String(value);
      return { sql: 'applicants_current LIKE CONCAT("%", :' + key + ', "%")' };
    }
    default:
      return { sql: '1=1' };
  }
}

function buildWhereFromTree(tree, params, idxSeed) {
  // tree: { logic: 'AND'|'OR', rules: [ {field,op,value} | subtree ] }
  if (!tree || !Array.isArray(tree.rules) || tree.rules.length === 0) return '1=1';
  const logic = (String(tree.logic || 'AND').toUpperCase() === 'OR') ? 'OR' : 'AND';
  const parts = [];
  for (const r of tree.rules) {
    if (r && r.rules) {
      parts.push('(' + buildWhereFromTree(r, params, idxSeed) + ')');
    } else {
      const { sql } = buildClauseFromRule(r, params, idxSeed);
      parts.push(sql);
    }
  }
  return parts.length ? parts.join(' ' + logic + ' ') : '1=1';
}

// POST /api/advanced/search  { tree, page, pageSize, orderBy }
router.post('/advanced/search', async (req, res) => {
  const pool = getPool();
  try {
    const { tree = null, page = 1, pageSize = 20, orderBy = 'pub_date_desc' } = req.body || {};
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const ps = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const offset = (p - 1) * ps;

    const params = {};
    const idxSeed = { count: 1 };
    const where = buildWhereFromTree(tree, params, idxSeed);

    let orderSql = 'ORDER BY pub_date DESC';
    if (orderBy === 'year_desc') orderSql = 'ORDER BY apply_year DESC';
    else if (orderBy === 'year_asc') orderSql = 'ORDER BY apply_year ASC';

    const countSql = `SELECT COUNT(1) AS total FROM patents WHERE ${where}`;
    const [cRows] = await pool.execute(countSql, params);
    const total = cRows?.[0]?.total || 0;

    const listSql = `
      SELECT pub_no, app_no, title,
             LEFT(abstract, 160) AS abstract_snippet,
             apply_year, pub_date, applicants_current,
             patent_type, grant_flag, ipc_main, ipc_main_prefix
      FROM patents
      WHERE ${where}
      ${orderSql}
      LIMIT :offset, :ps
    `;
    const [rows] = await pool.execute(listSql, { ...params, offset, ps });

    res.json({ total, list: rows || [] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  }
});

export default router;


