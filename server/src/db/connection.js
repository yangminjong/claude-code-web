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

  // Add avatar_url column to users table
  const userCols = db.pragma('table_info(users)').map(c => c.name);
  if (!userCols.includes('avatar_url')) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_url TEXT');
  }

  if (!userCols.includes('theme')) {
    db.exec("ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark'");
  }

  // Add claude_session_id column to sessions table (for --resume support)
  if (!sessionCols.includes('claude_session_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN claude_session_id TEXT');
  }

  // === Conversation branching support ===
  const msgCols = db.pragma('table_info(messages)').map(c => c.name);

  if (!msgCols.includes('parent_message_id')) {
    db.exec('ALTER TABLE messages ADD COLUMN parent_message_id INTEGER REFERENCES messages(id)');
  }

  if (!msgCols.includes('branch_index')) {
    db.exec('ALTER TABLE messages ADD COLUMN branch_index INTEGER NOT NULL DEFAULT 0');
  }

  // Migrate existing linear messages to tree structure (one-time)
  const unmigrated = db.prepare(
    `SELECT COUNT(*) as count FROM messages
     WHERE parent_message_id IS NULL AND seq_order > 1`
  ).get().count;

  if (unmigrated > 0) {
    const sessions = db.prepare(
      'SELECT DISTINCT session_id FROM messages'
    ).all();

    const updateParent = db.prepare(
      'UPDATE messages SET parent_message_id = ? WHERE id = ?'
    );

    const migrateTransaction = db.transaction(() => {
      for (const { session_id } of sessions) {
        const msgs = db.prepare(
          'SELECT id, seq_order FROM messages WHERE session_id = ? ORDER BY seq_order ASC'
        ).all(session_id);

        for (let i = 1; i < msgs.length; i++) {
          updateParent.run(msgs[i - 1].id, msgs[i].id);
        }
      }
    });
    migrateTransaction();
  }

  // Branch selections table — tracks active branch at each fork point
  db.exec(`
    CREATE TABLE IF NOT EXISTS branch_selections (
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      parent_message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      active_branch_index INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, parent_message_id)
    )
  `);

  // Index for tree queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_message_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(session_id, parent_message_id, branch_index)');

  // Email verification
  if (!userCols.includes('email_verified')) {
    db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0");
    // Mark existing users as verified so they are not locked out
    db.exec("UPDATE users SET email_verified = 1");
  }

  db.exec(`CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email)');

  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
