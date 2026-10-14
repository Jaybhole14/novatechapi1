const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(process.env.DATABASE_PATH || path.join(dataDir, 'tasks.db'));
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
module.exports = db;
