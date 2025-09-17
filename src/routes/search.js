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

    // Append thumbnail url without DB migration: map by IPC prefix/hash
    const thumbs = [
      'https://7072-prod-8g3u2rxd90ea9c7a-1378315181.tcb.qcloud.la/pic/junzi.png?sign=2e3a0d42225c1815ec69043d744d42c8&t=1757580086',
      'https://7072-prod-8g3u2rxd90ea9c7a-1378315181.tcb.qcloud.la/pic/turang.png?sign=7ca489a3dd7e11c6c5c8ebe252260a2f&t=1757580115',
      'https://7072-prod-8g3u2rxd90ea9c7a-1378315181.tcb.qcloud.la/pic/maisui.png?sign=0d0f99c4d2f8e065fbec2481f2b9a4ef&t=1757580123'
    ];
    const pickThumb = (row) => {
      const key = String(row.ipc_main_prefix || row.ipc_main || row.pub_no || '').toUpperCase();
      let sum = 0; for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i)) % 997;
      return thumbs[sum % thumbs.length];
    };
    const withThumbs = (listRows || []).map(r => ({ ...r, thumb_url: pickThumb(r) }));

    res.json({ total, list: withThumbs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});


