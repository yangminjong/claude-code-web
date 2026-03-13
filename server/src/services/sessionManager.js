import { resolve } from 'path';
import { mkdirSync } from 'fs';
import { getDb } from '../db/connection.js';
import { cleanupSession, cancelProcess } from './processManager.js';
import { auditLog } from './auditLogger.js';

const WORKSPACE_ROOT = () => resolve(process.env.WORKSPACE_ROOT || '../workspace');
const MAX_SESSIONS = () => parseInt(process.env.MAX_SESSIONS_PER_USER || '3', 10);
const IDLE_TIMEOUT = () => parseInt(process.env.IDLE_TIMEOUT_MINUTES || '30', 10) * 60 * 1000;

export function createSession(userId, { name, workMode = 'server', projectPath = 'default' }) {
  const db = getDb();

  // Check session limit
  const activeCount = db.prepare(
    "SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND status IN ('active', 'idle')"
  ).get(userId).count;

  if (activeCount >= MAX_SESSIONS()) {
    const err = new Error(`최대 동시 세션 수(${MAX_SESSIONS()})를 초과했습니다`);
    err.code = 'SESSION_LIMIT_EXCEEDED';
    err.status = 429;
    throw err;
  }

  // Resolve and create workspace directory
  const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
  const username = user.email.split('@')[0];
  const workDir = resolve(WORKSPACE_ROOT(), username, projectPath);
  mkdirSync(workDir, { recursive: true });

  // Insert session record (no process spawned yet — spawned per-message)
  const result = db.prepare(
    'INSERT INTO sessions (user_id, name, work_mode, project_path, status) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, name, workMode, workDir, 'active');

  const sessionId = result.lastInsertRowid;

  auditLog(userId, 'session_create', { sessionId, name, workDir });

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

export function destroySession(sessionId, userId = null) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  // Cancel any running process
  cleanupSession(sessionId);

  db.prepare(
    "UPDATE sessions SET status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(sessionId);

  auditLog(userId || session.user_id, 'session_end', { sessionId });

  return session;
}

export function getUserSessions(userId) {
  return getDb().prepare(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
}

export function getSession(sessionId) {
  return getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

export function getSessionMessages(sessionId, { page = 1, limit = 50 } = {}) {
  const db = getDb();
  const offset = (page - 1) * limit;
  const total = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?').get(sessionId).count;
  const messages = db.prepare(
    'SELECT * FROM messages WHERE session_id = ? ORDER BY seq_order ASC LIMIT ? OFFSET ?'
  ).all(sessionId, limit, offset);
  return { messages, total };
}

export function addMessage(sessionId, role, content) {
  const db = getDb();
  const last = db.prepare(
    'SELECT MAX(seq_order) as maxSeq FROM messages WHERE session_id = ?'
  ).get(sessionId);
  const seqOrder = (last.maxSeq || 0) + 1;

  db.prepare(
    'INSERT INTO messages (session_id, role, content, seq_order) VALUES (?, ?, ?, ?)'
  ).run(sessionId, role, content, seqOrder);

  // Update session last_activity
  db.prepare('UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
}

// Idle timeout checker — marks inactive sessions as ended
export function startHeartbeatChecker() {
  const interval = parseInt(process.env.HEARTBEAT_INTERVAL_SEC || '30', 10) * 1000;

  setInterval(() => {
    const db = getDb();
    const activeSessions = db.prepare(
      "SELECT * FROM sessions WHERE status IN ('active', 'idle')"
    ).all();

    const now = Date.now();

    for (const session of activeSessions) {
      const lastActivity = new Date(session.last_activity_at).getTime();
      if (now - lastActivity > IDLE_TIMEOUT()) {
        destroySession(session.id);
      }
    }
  }, interval);
}
