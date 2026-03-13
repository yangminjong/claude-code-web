import { getDb } from '../db/connection.js';

const VALID_ACTIONS = [
  'login', 'login_fail', 'logout', 'token_expire',
  'session_create', 'session_end', 'session_error',
  'file_upload', 'file_download', 'ws_disconnect'
];

export function auditLog(userId, action, detail = {}, ipAddress = null) {
  // Fire-and-forget: logging failure must not block main logic
  try {
    if (!VALID_ACTIONS.includes(action)) {
      console.warn(`[audit] Unknown action: ${action}`);
    }
    const db = getDb();
    db.prepare(
      'INSERT INTO audit_logs (user_id, action, detail, ip_address) VALUES (?, ?, ?, ?)'
    ).run(userId, action, JSON.stringify(detail), ipAddress);
  } catch (err) {
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

export function getAuditLogs(userId, { page = 1, limit = 50, action } = {}) {
  const db = getDb();
  const offset = (page - 1) * limit;

  let where = 'WHERE user_id = ?';
  const params = [userId];

  if (action) {
    where += ' AND action = ?';
    params.push(action);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM audit_logs ${where}`).get(...params).count;
  const logs = db.prepare(
    `SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return { logs, total };
}
