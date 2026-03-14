import { spawn } from 'child_process';

// webSessionId -> { claudeSessionId, activeProcess }
const sessions = new Map();

/**
 * Send a message to Claude Code CLI in print mode.
 * Spawns `claude -p "message" --output-format stream-json [--resume ID]`
 * Returns the child process (caller reads stdout for streaming JSON).
 */
export function sendMessage(webSessionId, message, cwd, claudeSessionId) {
  const entry = sessions.get(webSessionId);
  if (entry?.activeProcess) {
    const err = new Error('이전 응답이 완료되지 않았습니다');
    err.code = 'PROCESS_BUSY';
    throw err;
  }

  const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }

  const proc = spawn('claude', args, {
    cwd,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  sessions.set(webSessionId, {
    claudeSessionId,
    activeProcess: proc
  });

  proc.on('close', () => {
    const s = sessions.get(webSessionId);
    if (s) s.activeProcess = null;
  });

  proc.on('error', (err) => {
    console.error(`[process] spawn error for session ${webSessionId}:`, err.message);
    const s = sessions.get(webSessionId);
    if (s) s.activeProcess = null;
  });

  return proc;
}

export function getClaudeSessionId(webSessionId) {
  return sessions.get(webSessionId)?.claudeSessionId || null;
}

export function setClaudeSessionId(webSessionId, id) {
  const entry = sessions.get(webSessionId);
  if (entry) {
    entry.claudeSessionId = id;
  } else {
    sessions.set(webSessionId, { claudeSessionId: id, activeProcess: null });
  }
}

export function isProcessBusy(webSessionId) {
  return !!sessions.get(webSessionId)?.activeProcess;
}

export function cancelProcess(webSessionId) {
  const entry = sessions.get(webSessionId);
  if (entry?.activeProcess) {
    entry.activeProcess.kill('SIGTERM');
    entry.activeProcess = null;
    return true;
  }
  return false;
}

export function cleanupSession(webSessionId) {
  cancelProcess(webSessionId);
  sessions.delete(webSessionId);
}
