import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import xlsx from 'xlsx';
import { getPool } from '../db/mysql.js';

function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim().replace(/\./g, '-').replace(/\//g, '-');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function derivePatentType(pubNo) {
  if (!pubNo) return null;
  const last = String(pubNo).trim().toUpperCase().slice(-1);
  if (last === 'U') return '实用新型';
  if (last === 'S') return '外观设计';
  if (last === 'A' || last === 'B') return '发明';
  return null;
}

function ipcPrefix(main) {
  if (!main) return null;
  const t = String(main).toUpperCase().replace(/\s+/g, '');
  const m = t.match(/[A-Z]\d{2}[A-Z]?/);
  return m ? m[0] : t.slice(0, 4);
}

function normalizeApplicant(a) {
  if (!a) return null;
  return String(a).replace(/[\|;；、\s]+/g, ',').replace(/,+/g, ',').replace(/^,|,$/g, '');
}

function isGranted(legalStatus) {
  if (!legalStatus) return 0;
  return /授权/.test(String(legalStatus)) ? 1 : 0;
}

async function main() {
  const pool = getPool();
  const xlsxPath = process.env.XLSX_PATH || path.resolve(process.cwd(), '../../数据库表.XLSX');
  if (!fs.existsSync(xlsxPath)) {
    console.error('XLSX 文件不存在:', xlsxPath);
    process.exit(1);
  }

  console.log('Loading XLSX:', xlsxPath);
  const wb = xlsx.readFile(xlsxPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);
  console.log('Rows:', rows.length);

  const insertSql = `
    INSERT INTO patents (
      pub_no, app_no, title, abstract, app_date, pub_date,
      inventors, inventor_count, applicants_current, applicants_current_count,
      ipc, ipc_main, ipc_main_prefix, non_patent_citations, legal_status,
      cited_by, cites, apply_year, patsnap_family_count, office,
      patent_type, grant_flag
    ) VALUES (
      :pub_no, :app_no, :title, :abstract, :app_date, :pub_date,
      :inventors, :inventor_count, :applicants_current, :applicants_current_count,
      :ipc, :ipc_main, :ipc_main_prefix, :non_patent_citations, :legal_status,
      :cited_by, :cites, :apply_year, :patsnap_family_count, :office,
      :patent_type, :grant_flag
    )
    ON DUPLICATE KEY UPDATE
      title = VALUES(title),
      abstract = VALUES(abstract),
      pub_date = VALUES(pub_date),
      applicants_current = VALUES(applicants_current),
      ipc_main = VALUES(ipc_main),
      ipc_main_prefix = VALUES(ipc_main_prefix),
      patent_type = VALUES(patent_type),
      grant_flag = VALUES(grant_flag)
  `;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let i = 0;
    for (const r of rows) {
      const pubNo = r['公开(公告)号'] || r['公开号'] || r['公告号'];
      if (!pubNo) continue;
      const appNo = r['申请号'] || null;
      const title = r['标题'] || '';
      const abstract = r['摘要'] || null;
      const appDate = parseDate(r['申请日']);
      const pubDate = parseDate(r['公开(公告)日']);
      const inventors = r['发明人'] || null;
      const inventorCount = Number(r['发明人数量'] || 0) || null;
      const applicants = normalizeApplicant(r['[标]当前申请(专利权)人'] || r['申请(专利权)人']);
      const applicantsCount = Number(r['当前申请(专利权)人数量'] || 0) || null;
      const ipc = r['IPC分类号'] || null;
      const ipcMain = r['IPC主分类号'] || null;
      const ipcMainPrefix = ipcPrefix(ipcMain);
      const npc = Number(r['非专利引用文献数量'] || 0) || null;
      const legal = r['法律状态/事件'] || null;
      const citedBy = r['被引用专利'] || null;
      const cites = r['引用专利'] || null;
      const applyYear = Number(r['申请年'] || 0) || (appDate ? Number(String(appDate).slice(0,4)) : null);
      const familyCount = Number(r['Patsnap同族专利申请数量'] || 0) || null;
      const office = r['受理局'] || null;
      const ptype = derivePatentType(pubNo);
      const grant = isGranted(legal);

      await conn.execute(insertSql, {
        pub_no: String(pubNo),
        app_no: appNo ? String(appNo) : null,
        title: String(title),
        abstract,
        app_date: appDate,
        pub_date: pubDate,
        inventors,
        inventor_count: inventorCount,
        applicants_current: applicants,
        applicants_current_count: applicantsCount,
        ipc,
        ipc_main: ipcMain,
        ipc_main_prefix: ipcMainPrefix,
        non_patent_citations: npc,
        legal_status: legal,
        cited_by: citedBy,
        cites: cites,
        apply_year: applyYear,
        patsnap_family_count: familyCount,
        office,
        patent_type: ptype,
        grant_flag: grant
      });

      i += 1;
      if (i % 500 === 0) {
        console.log(`Imported ${i} rows...`);
      }
    }
    await conn.commit();
    console.log('Import done:', i, 'rows');
  } catch (e) {
    await conn.rollback();
    console.error('Import failed:', e);
    process.exit(1);
  } finally {
    conn.release();
  }
}

main().then(() => process.exit(0));


