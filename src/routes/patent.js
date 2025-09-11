import { Router } from 'express';
import { getPool } from '../db/mysql.js';

export const router = Router();

router.get('/patent/:pub_no', async (req, res) => {
  const pool = getPool();
  const { pub_no } = req.params;
  try {
    const [rows] = await pool.execute('SELECT * FROM patents WHERE pub_no = :pub_no LIMIT 1', { pub_no });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'not_found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
  }
});


