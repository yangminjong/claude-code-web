import { resolve } from 'path';
import { mkdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { getDb } from '../db/connection.js';
import { cleanupSession, cancelProcess } from './processManager.js';
import { auditLog } from './auditLogger.js';
import { getProfile, validateRemotePath } from './sshProfileManager.js';
import { deleteClaudeCliSession } from '../utils/claudeSessionCleaner.js';

const WORKSPACE_ROOT = () => resolve(process.env.WORKSPACE_ROOT || '../workspace');
const MAX_SESSIONS = () => parseInt(process.env.MAX_SESSIONS_PER_USER || '3', 10);
const IDLE_TIMEOUT = () => parseInt(process.env.IDLE_TIMEOUT_MINUTES || '30', 10) * 60 * 1000;

export function createSession(userId, { name, workMode = 'server', projectPath = 'default', sshProfileId = null, absoluteWorkDir = null }) {
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

  let workDir;

  if (workMode === 'ssh') {
    // Validate SSH profile
    if (!sshProfileId) {
      const err = new Error('SSH 모드에서는 SSH 프로필을 선택해야 합니다');
      err.code = 'VALIDATION_ERROR';
      err.status = 400;
      throw err;
    }

    const profile = getProfile(sshProfileId, userId);
    if (!profile) {
      const err = new Error('SSH 프로필을 찾을 수 없습니다');
      err.code = 'PROFILE_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    // Validate remote path against allowed paths
    if (!validateRemotePath(profile, projectPath)) {
      const err = new Error('허용되지 않은 원격 경로입니다');
      err.code = 'PATH_NOT_ALLOWED';
      err.status = 403;
      throw err;
    }

    workDir = projectPath; // remote path as-is
  } else if (absoluteWorkDir) {
    // Adopt mode: use the absolute path directly (e.g. from CLI session)
    workDir = absoluteWorkDir;
    mkdirSync(workDir, { recursive: true });
  } else {
    // Local mode: resolve and create workspace directory
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(userId);
    const username = user.email.split('@')[0];
    workDir = resolve(WORKSPACE_ROOT(), username, projectPath);
    mkdirSync(workDir, { recursive: true });
  }

  // Insert session record
  const result = db.prepare(
    'INSERT INTO sessions (user_id, name, work_mode, project_path, status, ssh_profile_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(userId, name, workMode, workDir, 'active', sshProfileId);

  const sessionId = result.lastInsertRowid;

  auditLog(userId, 'session_create', { sessionId, name, workDir, workMode, sshProfileId });

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

export function updateSessionName(sessionId, name) {
  getDb().prepare('UPDATE sessions SET name = ? WHERE id = ?').run(name, sessionId);
}

export function updateClaudeSessionId(sessionId, claudeSessionId) {
  getDb().prepare('UPDATE sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, sessionId);
}

export function resumeSession(sessionId, userId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  if (session.user_id !== userId) return null;

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

  // Reactivate
  db.prepare(
    "UPDATE sessions SET status = 'active', ended_at = NULL, last_activity_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(sessionId);

  auditLog(userId, 'session_resume', { sessionId });

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
}

export function addMessage(sessionId, role, content, parentMessageId = null) {
  const db = getDb();
  const last = db.prepare(
    'SELECT MAX(seq_order) as maxSeq FROM messages WHERE session_id = ?'
  ).get(sessionId);
  const seqOrder = (last.maxSeq || 0) + 1;

  // Calculate branch_index among siblings with same parent
  let branchIndex = 0;
  if (parentMessageId !== null) {
    const siblingCount = db.prepare(
      'SELECT COUNT(*) as count FROM messages WHERE parent_message_id = ?'
    ).get(parentMessageId).count;
    branchIndex = siblingCount; // 0-based: first child = 0, second = 1, etc.
  }

  const result = db.prepare(
    'INSERT INTO messages (session_id, role, content, seq_order, parent_message_id, branch_index) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(sessionId, role, content, seqOrder, parentMessageId, branchIndex);

  db.prepare('UPDATE sessions SET last_activity_at = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);

  return { id: Number(result.lastInsertRowid), branchIndex };
}

// Get the full message tree for a session
export function getMessageTree(sessionId) {
  const db = getDb();
  return db.prepare(
    'SELECT id, role, content, parent_message_id, branch_index, created_at FROM messages WHERE session_id = ? ORDER BY seq_order ASC'
  ).all(sessionId);
}

// Get active branch selections for a session
export function getBranchSelections(sessionId) {
  const db = getDb();
  return db.prepare(
    'SELECT parent_message_id, active_branch_index FROM branch_selections WHERE session_id = ?'
  ).all(sessionId);
}

// Set active branch at a fork point
export function setBranchSelection(sessionId, parentMessageId, activeBranchIndex) {
  const db = getDb();
  db.prepare(`
    INSERT INTO branch_selections (session_id, parent_message_id, active_branch_index)
    VALUES (?, ?, ?)
    ON CONFLICT(session_id, parent_message_id) DO UPDATE SET active_branch_index = excluded.active_branch_index
  `).run(sessionId, parentMessageId, activeBranchIndex);
}

// Get children of a message
export function getMessageChildren(messageId) {
  const db = getDb();
  return db.prepare(
    'SELECT id, role, content, branch_index, created_at FROM messages WHERE parent_message_id = ? ORDER BY branch_index ASC'
  ).all(messageId);
}

// Get the active path from root to leaf (following branch selections)
export function getActivePath(sessionId) {
  const db = getDb();

  const allMessages = db.prepare(
    'SELECT id, role, content, parent_message_id, branch_index, created_at FROM messages WHERE session_id = ? ORDER BY seq_order ASC'
  ).all(sessionId);

  const selections = db.prepare(
    'SELECT parent_message_id, active_branch_index FROM branch_selections WHERE session_id = ?'
  ).all(sessionId);

  const selectionMap = new Map(selections.map(s => [s.parent_message_id, s.active_branch_index]));

  // Build children lookup: parentId -> [children sorted by branch_index]
  const childrenMap = new Map();
  let rootMsg = null;

  for (const msg of allMessages) {
    if (msg.parent_message_id === null) {
      if (!rootMsg) rootMsg = msg;
    } else {
      if (!childrenMap.has(msg.parent_message_id)) {
        childrenMap.set(msg.parent_message_id, []);
      }
      childrenMap.get(msg.parent_message_id).push(msg);
    }
  }

  // Walk from root following active branch at each fork
  const path = [];
  let current = rootMsg;

  while (current) {
    const children = childrenMap.get(current.id) || [];
    const siblingCount = children.length;

    // Add sibling count info for branch navigation
    path.push({
      ...current,
      siblingCount: 0, // root has no siblings in this context
      siblingIndex: 0,
    });

    if (children.length === 0) break;

    const activeBranch = selectionMap.get(current.id) || 0;
    const safeIndex = Math.min(activeBranch, children.length - 1);
    current = children[safeIndex];

    // Update the last-pushed item's child fork info is not needed;
    // Instead annotate the CHILD with its sibling info
    path[path.length - 1] = {
      ...path[path.length - 1],
      childCount: children.length,
    };
  }

  // Annotate each message with its sibling info (for ◀ 1/N ▶ navigator)
  for (const msg of path) {
    if (msg.parent_message_id !== null) {
      const siblings = childrenMap.get(msg.parent_message_id) || [];
      msg.siblingCount = siblings.length;
      msg.siblingIndex = msg.branch_index;
    }
  }

  return path;
}

// Delete a message and all its descendants
export function deleteMessageBranch(messageId) {
  const db = getDb();

  const collectDescendants = (id) => {
    const children = db.prepare('SELECT id FROM messages WHERE parent_message_id = ?').all(id);
    let ids = [id];
    for (const child of children) {
      ids = ids.concat(collectDescendants(child.id));
    }
    return ids;
  };

  const idsToDelete = collectDescendants(messageId);

  db.transaction(() => {
    const placeholders = idsToDelete.map(() => '?').join(',');
    db.prepare(`DELETE FROM branch_selections WHERE parent_message_id IN (${placeholders})`).run(...idsToDelete);
    db.prepare(`DELETE FROM messages WHERE id IN (${placeholders})`).run(...idsToDelete);
  })();

  return idsToDelete.length;
}

export function deleteSessionPermanently(sessionId, userId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session || session.user_id !== userId) return null;

  cleanupSession(sessionId);

  // Delete Claude CLI session files if claude_session_id exists
  if (session.claude_session_id) {
    try { deleteClaudeCliSession(session.claude_session_id); } catch {}
  }

  db.prepare('DELETE FROM messages WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

  auditLog(userId, 'session_delete', { sessionId });
  return session;
}

export function getSessionMetadata(sessionId) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;

  // Calculate message content size
  const sizeResult = db.prepare(
    'SELECT COALESCE(SUM(LENGTH(content)), 0) as totalBytes, COUNT(*) as messageCount FROM messages WHERE session_id = ?'
  ).get(sessionId);

  // Check JSONL file size if claude_session_id exists
  let jsonlSizeBytes = 0;
  if (session.claude_session_id) {
    try {
      const cwdEncoded = session.project_path.replace(/\//g, '-');
      const homeDir = process.env.HOME || '/home/' + (process.env.USER || 'root');
      const jsonlPath = resolve(homeDir, '.claude/projects', cwdEncoded, `${session.claude_session_id}.jsonl`);
      const stat = statSync(jsonlPath);
      jsonlSizeBytes = stat.size;
    } catch {}
  }

  // Get git info from project_path
  let gitInfo = null;
  if (session.work_mode === 'server' && session.project_path) {
    try {
      const remote = execSync('git remote get-url origin 2>/dev/null', {
        cwd: session.project_path, timeout: 3000, stdio: 'pipe'
      }).toString().trim();
      const branch = execSync('git branch --show-current 2>/dev/null', {
        cwd: session.project_path, timeout: 3000, stdio: 'pipe'
      }).toString().trim();
      gitInfo = { remote, branch };
    } catch {}
  }

  // Time since last activity
  const lastActivityAt = session.last_activity_at;

  return {
    messageSizeBytes: sizeResult.totalBytes,
    messageCount: sizeResult.messageCount,
    sessionSizeBytes: jsonlSizeBytes,
    gitInfo,
    lastActivityAt,
    projectPath: session.project_path,
    workMode: session.work_mode,
    claudeSessionId: session.claude_session_id
  };
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
