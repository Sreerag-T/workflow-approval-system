require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

(async () => {
  const { DB_HOST = '127.0.0.1', DB_PORT = 3306, DB_USER, DB_PASSWORD, DB_NAME = 'workflow_approval' } = process.env;
  const root = await mysql.createConnection({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD });
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();

  const conn = await mysql.createConnection({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD, database: DB_NAME, multipleStatements: true,
  });
  await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const dir = path.join(__dirname, '..', 'database', 'migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const [done] = await conn.query('SELECT 1 FROM schema_migrations WHERE name = ?', [file]);
    if (done.length) { console.log(`- skipped ${file}`); continue; }
    await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
    console.log(`+ applied ${file}`);
  }
  await conn.end();
  console.log('Migration complete.');
})().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
