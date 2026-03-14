import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db;

export function getDb() {
  if (db) return db;

  const dbPath = resolve(process.env.DB_PATH || join(__dirname, '../../../data/app.db'));
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Migrations
  const sessionCols = db.pragma('table_info(sessions)').map(c => c.name);
  if (!sessionCols.includes('ssh_profile_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN ssh_profile_id INTEGER REFERENCES ssh_profiles(id)');
  }

  const sshCols = db.pragma('table_info(ssh_profiles)').map(c => c.name);
  if (sshCols.length > 0 && !sshCols.includes('remote_os')) {
    db.exec("ALTER TABLE ssh_profiles ADD COLUMN remote_os TEXT NOT NULL DEFAULT 'linux' CHECK(remote_os IN ('linux', 'windows'))");
  }

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
