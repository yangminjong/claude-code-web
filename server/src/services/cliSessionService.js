import { readFileSync, statSync, existsSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import { execSync } from 'child_process';
import { createSession } from './sessionManager.js';
import { getDb } from '../db/connection.js';
import { deleteClaudeCliSession } from '../utils/claudeSessionCleaner.js';

const HOME = process.env.HOME || '/home/' + (process.env.USER || 'root');
const PROJECTS_DIR = resolve(HOME, '.claude/projects');
const WORKSPACE_ROOT = () => resolve(process.env.WORKSPACE_ROOT || '../workspace');
const CACHE_TTL = 60 * 1000;

let _cache = null;
let _cacheTime = 0;

/**
 * Scan all JSONL session files under ~/.claude/projects/
 * instead of relying on history.jsonl (which misses -p mode sessions).
 */
function scanAllSessions() {
  const sessions = [];

  if (!existsSync(PROJECTS_DIR)) return sessions;

  // Each subdirectory under projects/ is an encoded project path
  let projectDirs;
  try {
    projectDirs = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return sessions;
  }

  for (const encodedDir of projectDirs) {
    const dirPath = resolve(PROJECTS_DIR, encodedDir);

    // Decode project path: "-home-forelink-claude" → "/home/forelink/claude"
    const projectPath = encodedDir.replace(/^-/, '/').replace(/-/g, '/');

    // Find all .jsonl files (each is a session)
    let jsonlFiles;
    try {
      jsonlFiles = readdirSync(dirPath)
        .filter(f => f.endsWith('.jsonl') && !f.includes('/'));
    } catch {
      continue;
    }

    for (const file of jsonlFiles) {
      const sessionId = basename(file, '.jsonl');
      const filePath = resolve(dirPath, file);

      let stat;
      try {
        stat = statSync(filePath);
      } catch {
        continue;
      }

      // Extract session name from last-prompt or first user message
      const info = extractSessionInfo(filePath);

      sessions.push({
        session_id: sessionId,
        session_name: info.name || '(untitled)',
        project: projectPath,
        timestamp: stat.mtimeMs,
        date: new Date(stat.mtimeMs).toISOString().slice(0, 16).replace('T', ' '),
        message_count: info.messageCount,
        size_bytes: stat.size,
        git_info: null // filled later per project
      });
    }
  }

  // Get git info per project (deduplicated)
  const projectGit = {};
  for (const rec of sessions) {
    const proj = rec.project;
    if (!proj || proj in projectGit) continue;
    projectGit[proj] = getGitInfo(proj);
  }
  for (const rec of sessions) {
    rec.git_info = projectGit[rec.project] || null;
  }

  return sessions;
}

/**
 * Extract session name and message count from a JSONL file.
 * Reads only the lines needed (last-prompt, customTitle, first user message).
 */
function extractSessionInfo(filePath) {
  let name = '';
  let messageCount = 0;

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let obj;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }

      // Count user messages
      if (obj.type === 'user' && obj.message?.role === 'user') {
        messageCount++;
        // Use first user message as fallback name
        if (!name) {
          const msgContent = obj.message.content;
          if (typeof msgContent === 'string') {
            name = msgContent.slice(0, 100);
          } else if (Array.isArray(msgContent)) {
            const textBlock = msgContent.find(b => b.type === 'text');
            if (textBlock?.text) name = textBlock.text.slice(0, 100);
          }
        }
      }

      // Count assistant messages
      if (obj.type === 'assistant') {
        messageCount++;
      }

      // customTitle takes priority
      if (obj.type === 'custom-title' && obj.customTitle) {
        name = obj.customTitle;
      }

      // last-prompt as fallback title (usually the first prompt)
      if (obj.type === 'last-prompt' && obj.lastPrompt && !name) {
        name = obj.lastPrompt.slice(0, 100);
      }
    }

    // If we found a last-prompt, prefer it over first user message for naming
    // (re-scan for last-prompt since it's at the end of the file)
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 5); i--) {
      const trimmed = lines[i]?.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === 'last-prompt' && obj.lastPrompt) {
          name = obj.lastPrompt.slice(0, 100);
          break;
        }
        if (obj.type === 'custom-title' && obj.customTitle) {
          name = obj.customTitle;
          break;
        }
      } catch {}
    }
  } catch {}

  return { name, messageCount };
}

function getGitInfo(projectPath) {
  try {
    if (!existsSync(projectPath)) return null;
    const remote = execSync('git remote get-url origin 2>/dev/null', {
      cwd: projectPath, timeout: 3000, stdio: 'pipe'
    }).toString().trim();
    const branch = execSync('git branch --show-current 2>/dev/null', {
      cwd: projectPath, timeout: 3000, stdio: 'pipe'
    }).toString().trim();
    return { remote, branch };
  } catch {
    return null;
  }
}

function getCachedSessions(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cache && (now - _cacheTime) < CACHE_TTL) {
    return _cache;
  }
  _cache = scanAllSessions();
  _cacheTime = now;
  return _cache;
}

export function getCliSessions({ project, find, limit, sort, refresh, username } = {}) {
  let records = getCachedSessions(!!refresh);

  // Filter by user's workspace path
  if (username) {
    const userRoot = resolve(WORKSPACE_ROOT(), username);
    records = records.filter(r => r.project && r.project.startsWith(userRoot));
  }

  if (project) {
    records = records.filter(r => r.project === project);
  }

  if (find) {
    const keyword = find.toLowerCase();
    records = records.filter(r =>
      (r.session_name || '').toLowerCase().includes(keyword) ||
      (r.session_id || '').toLowerCase().includes(keyword)
    );
  }

  // Sort (default: newest first)
  const sortField = sort || '-timestamp';
  const desc = sortField.startsWith('-');
  const field = desc ? sortField.slice(1) : sortField;
  records.sort((a, b) => {
    const av = a[field] || 0;
    const bv = b[field] || 0;
    return desc ? (bv > av ? 1 : bv < av ? -1 : 0) : (av > bv ? 1 : av < bv ? -1 : 0);
  });

  if (limit) {
    records = records.slice(0, parseInt(limit, 10));
  }

  return records;
}

export function getCliSessionStats(forceRefresh = false, username = null) {
  let records = getCachedSessions(forceRefresh);

  if (username) {
    const userRoot = resolve(WORKSPACE_ROOT(), username);
    records = records.filter(r => r.project && r.project.startsWith(userRoot));
  }

  const projects = new Set();
  let totalSize = 0;

  for (const r of records) {
    if (r.project) projects.add(r.project);
    totalSize += r.size_bytes || 0;
  }

  return {
    totalSessions: records.length,
    totalSizeBytes: totalSize,
    projectCount: projects.size
  };
}

export function adoptCliSession(sessionId, sessionName, project, userId) {
  const db = getDb();
  const existing = db.prepare(
    'SELECT * FROM sessions WHERE claude_session_id = ? AND user_id = ?'
  ).get(sessionId, userId);

  if (existing) {
    return existing;
  }

  const session = createSession(userId, {
    name: sessionName || 'CLI 세션',
    workMode: 'server',
    projectPath: 'default',
    absoluteWorkDir: project || null
  });

  db.prepare('UPDATE sessions SET claude_session_id = ? WHERE id = ?').run(sessionId, session.id);

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
}

/**
 * Delete a Claude CLI session and invalidate cache
 */
export function deleteCliSession(claudeSessionId) {
  deleteClaudeCliSession(claudeSessionId);
  _cache = null;
  _cacheTime = 0;
}
