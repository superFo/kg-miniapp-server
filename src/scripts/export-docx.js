/*
  导出全量小程序与后端代码到 Word 文档（Times New Roman，小四=12pt）
  使用方法：
    1) cd kg-miniapp/server
    2) npm i docx@8 fs-extra@11 globby@13
    3) node src/scripts/export-docx.js
*/
import path from 'path';
import fs from 'fs-extra';
import { globby } from 'globby';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } from 'docx';

const ROOT = path.resolve(process.cwd(), '../..'); // knowledge/
const MINI = path.join(ROOT, 'kg-miniapp', 'miniprogram');
const SERVER = path.join(ROOT, 'kg-miniapp', 'server');
const OUT = path.join(ROOT, '代码.docx');

const fontName = 'Times New Roman';
const size = 24; // docx 单位为 half-point，24=12pt（小四）

function title(text, level=HeadingLevel.HEADING_2){
  return new Paragraph({
    heading: level,
    spacing: { before: 200, after: 120 },
    children: [ new TextRun({ text, bold: true, font: fontName }) ]
  });
}

function codeBlock(code){
  // 将多行代码按段落写入，保持字体
  const lines = String(code).split(/\r?\n/);
  return lines.map(l => new Paragraph({ children:[ new TextRun({ text:l||' ', font: fontName, size }) ] }));
}

async function collectFiles(){
  const patterns = [
    path.join(MINI, '**/*.{js,json,wxml,wxss}'),
    path.join(SERVER, 'Dockerfile'),
    path.join(SERVER, 'package.json'),
    path.join(SERVER, 'schema.sql'),
    path.join(SERVER, 'src', '**/*.{js,sql}')
  ];
  const files = await globby(patterns, { dot:false });
  // 排序：先 miniprogram，再 server
  return files.sort();
}

async function main(){
  const sections = [];
  // 标题页
  sections.push({ children:[ title('小程序与后端代码（软著提交稿）', HeadingLevel.HEADING_1) ] });

  const files = await collectFiles();
  for (const f of files){
    const rel = path.relative(ROOT, f);
    const content = await fs.readFile(f, 'utf8');
    sections.push({ children:[ title(rel, HeadingLevel.HEADING_2), ...codeBlock(content), new Paragraph({ children:[new PageBreak()] }) ] });
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: fontName, size } },
        heading1: { run: { font: fontName, size: size+2 } },
        heading2: { run: { font: fontName, size: size+1 } }
      }
    },
    sections
  });

  const buf = await Packer.toBuffer(doc);
  await fs.writeFile(OUT, buf);
  console.log('导出成功：', OUT);
}

main().catch(e => { console.error(e); process.exit(1); });


