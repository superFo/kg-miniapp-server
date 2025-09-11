import mysql from 'mysql2/promise';

function resolveMysqlConfig() {
  // 兼容云托管常见环境变量：MYSQL_ADDRESS(host:port)、MYSQL_USERNAME、MYSQL_PASSWORD、MYSQL_DATABASE
  const address = process.env.MYSQL_ADDRESS || '';
  let host = process.env.DB_HOST || '127.0.0.1';
  let port = Number(process.env.DB_PORT || 3306);
  if (address && address.includes(':')) {
    const [h, p] = address.split(':');
    if (h) host = h;
    if (p) port = Number(p);
  }
  const user = process.env.MYSQL_USERNAME || process.env.DB_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || process.env.DB_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || process.env.DB_NAME || 'kg_patents';
  return { host, port, user, password, database };
}

const { host, port, user, password, database } = resolveMysqlConfig();

const pool = mysql.createPool({
  host,
  port,
  user,
  password,
  database,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  charset: 'utf8mb4'
});

export function getPool() {
  return pool;
}


