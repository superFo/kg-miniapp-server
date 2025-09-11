import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

router.get('/search', async (req, res) => {
  const pool = getPool();
  try {
    const {
      kw = '',
      yearStart = '',
      yearEnd = '',
      type = '',
      ipcPrefix = '',
      applicant = '',
      page = '1',
      pageSize = '20'
    } = req.query;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const sizeNum = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 100);
    const offset = (pageNum - 1) * sizeNum;

    const whereClauses = [];
    const params = {};

    if (kw && String(kw).trim()) {
      // Prefer FULLTEXT if present; also fallback to LIKE
      whereClauses.push('(MATCH(title, abstract) AGAINST(:kw IN NATURAL LANGUAGE MODE) OR title LIKE CONCAT("%", :kw_like, "%") OR abstract LIKE CONCAT("%", :kw_like, "%"))');
      params.kw = kw;
      params.kw_like = kw;
    }
    if (yearStart) {
      whereClauses.push('apply_year >= :ys');
      params.ys = Number(yearStart);
    }
    if (yearEnd) {
      whereClauses.push('apply_year <= :ye');
      params.ye = Number(yearEnd);
    }
    if (type) {
      // comma separated values
      whereClauses.push('(FIND_IN_SET(patent_type, :ptype) > 0)');
      params.ptype = String(type);
    }
    if (ipcPrefix) {
      whereClauses.push('ipc_main_prefix LIKE CONCAT(:ipc, "%")');
      params.ipc = String(ipcPrefix);
    }
    if (applicant) {
      whereClauses.push('applicants_current LIKE CONCAT("%", :app, "%")');
      params.app = String(applicant);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const selectSql = `
      SELECT pub_no, app_no, title,
             LEFT(abstract, 120) AS abstract_snippet,
             apply_year, pub_date, applicants_current,
             patent_type, grant_flag, ipc_main
      FROM patents
      ${whereSql}
      ORDER BY pub_date DESC
      LIMIT :offset, :pageSize
    `;

    const countSql = `SELECT COUNT(1) AS total FROM patents ${whereSql}`;

    const [countRows] = await pool.execute(countSql, params);
    const total = countRows?.[0]?.total || 0;

    const [listRows] = await pool.execute(selectSql, { ...params, offset, pageSize: sizeNum });

    res.json({ total, list: listRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});


