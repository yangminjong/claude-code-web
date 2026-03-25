import {
  sendMessage, sendMessageSSH, getClaudeSessionId, setClaudeSessionId,
  isProcessBusy, cancelProcess
} from '../services/processManager.js';
import { addMessage, getSession, updateSessionName, updateClaudeSessionId } from '../services/sessionManager.js';
import { getDb } from '../db/connection.js';
import { auditLog } from '../services/auditLogger.js';
import { getProfileWithCredential, updateLastConnected } from '../services/sshProfileManager.js';

/**
 * Active WebSocket connections per session.
 * sessionId -> { ws, heartbeatCheck, pendingProc, activeMessageId, fullResponse, ... }
 */
const activeConnections = new Map();

/**
 * Extract displayable text from a stream-json line object.
 */
function extractText(obj) {
  if (obj.type === 'stream_event' && obj.event?.type === 'content_block_delta'
      && obj.event.delta?.type === 'text_delta') {
    return obj.event.delta.text;
  }
  if (obj.type === 'content_block_delta' && obj.delta?.text) {
    return obj.delta.text;
  }
  if (obj.type === 'assistant' && obj.message?.content) {
    return null;
  }
  if (obj.type === 'text' && typeof obj.text === 'string') {
    return obj.text;
  }
  return null;
}

/**
 * Extract Claude session ID from stream-json output.
 */
function extractSessionId(obj) {
  return obj.session_id || obj.sessionId || obj.message?.session_id || null;
}

/**
 * Safe send — only sends if ws is OPEN
 */
function safeSend(ws, data) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  }
  return false;
}

export function handleConnection(ws, userId, sessionId) {
  const session = getSession(sessionId);
  if (!session || session.user_id !== userId) {
    ws.send(JSON.stringify({ type: 'error', message: '세션을 찾을 수 없습니다' }));
    ws.close();
    return;
  }

  // --- Handle reconnection: replace old WS for same session ---
  const existing = activeConnections.get(sessionId);
  if (existing) {
    console.log(`[ws] Session ${sessionId}: replacing existing connection (reconnect)`);
    if (existing.heartbeatCheck) {
      clearInterval(existing.heartbeatCheck);
    }
    if (existing.ws) {
      try {
        if (existing.ws.readyState === existing.ws.OPEN) {
          existing.ws.close(4000, 'replaced');
        }
        existing.ws.removeAllListeners?.();
      } catch {}
    }
  }

  // Restore claude_session_id from DB to memory (for resumed sessions)
  if (session.claude_session_id && !getClaudeSessionId(sessionId)) {
    setClaudeSessionId(sessionId, session.claude_session_id);
  }

  // Heartbeat
  let lastHeartbeat = Date.now();
  const heartbeatCheck = setInterval(() => {
    if (Date.now() - lastHeartbeat > 90000) {
      ws.close();
    }
  }, 30000);

  // Store connection — carry over pending state from old connection
  const connEntry = {
    ws,
    heartbeatCheck,
    pendingProc: existing?.pendingProc || null,
    activeMessageId: existing?.activeMessageId || null,
    fullResponse: existing?.fullResponse || '',
    capturedSessionId: existing?.capturedSessionId || false,
    unsentEnd: existing?.unsentEnd || null,
  };
  activeConnections.set(sessionId, connEntry);

  safeSend(ws, { type: 'connected', sessionId });

  // Case 1: Process still running — re-pipe its output
  if (connEntry.pendingProc) {
    console.log(`[ws] Session ${sessionId}: re-attaching to pending process (messageId: ${connEntry.activeMessageId})`);
    safeSend(ws, { type: 'assistant_start', messageId: connEntry.activeMessageId });
    if (connEntry.fullResponse) {
      safeSend(ws, { type: 'assistant_chunk', content: connEntry.fullResponse, messageId: connEntry.activeMessageId });
    }
  }
  // Case 2: Process finished while disconnected — deliver the saved response
  else if (connEntry.unsentEnd) {
    console.log(`[ws] Session ${sessionId}: delivering response that completed while disconnected`);
    const { content, exitCode, messageId } = connEntry.unsentEnd;
    safeSend(ws, { type: 'assistant_start', messageId });
    if (content) {
      safeSend(ws, { type: 'assistant_chunk', content, messageId });
    }
    safeSend(ws, { type: 'assistant_end', content, exitCode, messageId });
    connEntry.unsentEnd = null;
    activeConnections.delete(sessionId);
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'message':
          handleUserMessage(ws, sessionId, session, msg.content, msg.messageId);
          break;

        case 'cancel':
          if (cancelProcess(sessionId)) {
            const conn = activeConnections.get(sessionId);
            const mid = conn?.activeMessageId || msg.messageId;
            safeSend(ws, { type: 'assistant_cancelled', messageId: mid });
            if (conn) {
              conn.pendingProc = null;
              conn.fullResponse = '';
              conn.activeMessageId = null;
            }
          }
          break;

        case 'heartbeat':
          lastHeartbeat = Date.now();
          safeSend(ws, { type: 'heartbeat_ack' });
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('[ws] Message parse error:', err.message);
    }
  });

  ws.on('close', () => {
    clearInterval(heartbeatCheck);

    const conn = activeConnections.get(sessionId);
    if (conn && conn.ws === ws) {
      if (conn.pendingProc) {
        console.log(`[ws] Session ${sessionId}: WS closed but process still running, keeping entry for reconnect`);
        conn.ws = null;
        conn.heartbeatCheck = null;
      } else {
        activeConnections.delete(sessionId);
      }
    }

    auditLog(userId, 'ws_disconnect', { sessionId });
  });

  ws.on('error', (err) => {
    console.error(`[ws] Error for session ${sessionId}:`, err.message);
  });
}

function handleUserMessage(ws, sessionId, session, content, messageId) {
  if (!content || typeof content !== 'string') {
    safeSend(ws, { type: 'error', message: '메시지 내용이 비어있습니다', messageId });
    return;
  }

  if (isProcessBusy(sessionId)) {
    safeSend(ws, { type: 'error', message: '이전 응답이 완료되지 않았습니다. 잠시 후 다시 시도하세요.', messageId });
    return;
  }

  // Auto-rename session on first message (if still "새 채팅")
  if (session.name === '새 채팅') {
    const autoName = content.length > 30 ? content.substring(0, 30) + '...' : content;
    updateSessionName(sessionId, autoName);
    safeSend(ws, { type: 'session_renamed', name: autoName });
  }

  // Save user message to DB
  addMessage(sessionId, 'user', content);

  // Notify client — tag with messageId so client knows which question this answers
  safeSend(ws, { type: 'assistant_start', messageId });

  console.log(`[ws] Session ${sessionId}: processing message ${messageId} — "${content.slice(0, 50)}"`);

  // Use DB-persisted claude_session_id first, fall back to in-memory
  const dbSession = getSession(sessionId);
  const claudeSessionId = getClaudeSessionId(sessionId) || dbSession?.claude_session_id || null;

  let proc;
  try {
    if (session.work_mode === 'ssh') {
      const profile = getProfileWithCredential(session.ssh_profile_id, session.user_id);
      if (!profile) {
        safeSend(ws, { type: 'error', message: 'SSH 프로필을 찾을 수 없습니다', messageId });
        return;
      }
      proc = sendMessageSSH(sessionId, content, session.project_path, claudeSessionId, {
        host: profile.host,
        port: profile.port,
        username: profile.username,
        authMethod: profile.auth_method,
        credential: profile.credential,
        remoteOs: profile.remote_os || 'linux'
      });
      updateLastConnected(profile.id);
      auditLog(session.user_id, 'ssh_connect', { profileId: profile.id, host: profile.host });
    } else {
      proc = sendMessage(sessionId, content, session.project_path, claudeSessionId);
    }
  } catch (err) {
    safeSend(ws, { type: 'error', message: err.message, messageId });
    return;
  }

  // Track pending process + messageId for reconnect recovery
  const conn = activeConnections.get(sessionId);
  if (conn) {
    conn.pendingProc = proc;
    conn.activeMessageId = messageId;
    conn.fullResponse = '';
    conn.capturedSessionId = false;
  }

  let lineBuffer = '';

  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop();

    for (const line of lines) {
      processJsonLine(line);
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    console.error(`[claude stderr] ${text.trim()}`);
  });

  proc.on('close', (code) => {
    if (lineBuffer.trim()) {
      processJsonLine(lineBuffer);
    }

    const conn = activeConnections.get(sessionId);
    const fullResponse = conn?.fullResponse || '';

    // Save assistant response to DB
    if (fullResponse) {
      addMessage(sessionId, 'assistant', fullResponse);
    }

    // Clear pending proc
    if (conn) {
      conn.pendingProc = null;
    }

    // Send completion — tagged with messageId
    const currentWs = conn?.ws;
    const sent = safeSend(currentWs, {
      type: 'assistant_end',
      content: fullResponse,
      exitCode: code,
      messageId
    });

    if (conn && !conn.ws) {
      if (!sent && fullResponse) {
        console.log(`[ws] Session ${sessionId}: process finished while disconnected, saving response for reconnect`);
        conn.unsentEnd = { content: fullResponse, exitCode: code, messageId };
        setTimeout(() => {
          const c = activeConnections.get(sessionId);
          if (c && c.unsentEnd && !c.ws) {
            activeConnections.delete(sessionId);
          }
        }, 60000);
      } else {
        activeConnections.delete(sessionId);
      }
    }

    if (conn) {
      conn.activeMessageId = null;
    }

    console.log(`[ws] Session ${sessionId}: message ${messageId} completed (${fullResponse.length} chars)`);
  });

  proc.on('error', (err) => {
    const conn = activeConnections.get(sessionId);
    if (conn) {
      conn.pendingProc = null;
      conn.activeMessageId = null;
    }
    const currentWs = conn?.ws;
    safeSend(currentWs, {
      type: 'error',
      message: `프로세스 오류: ${err.message}`,
      messageId
    });
  });

  function processJsonLine(line) {
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);

      const conn = activeConnections.get(sessionId);

      // Capture claude session ID for --resume on next message
      if (conn && !conn.capturedSessionId) {
        const sid = extractSessionId(obj);
        if (sid) {
          setClaudeSessionId(sessionId, sid);
          updateClaudeSessionId(sessionId, sid);
          conn.capturedSessionId = true;
        }
      }

      // Fallback: if result has text and we got nothing from streaming
      if (obj.type === 'result' && obj.result && conn && !conn.fullResponse) {
        conn.fullResponse = obj.result;
        const currentWs = conn?.ws;
        safeSend(currentWs, { type: 'assistant_chunk', content: obj.result, messageId });
        return;
      }

      // Extract text and send to client — tagged with messageId
      const text = extractText(obj);
      if (text) {
        if (conn) conn.fullResponse += text;
        const currentWs = conn?.ws;
        safeSend(currentWs, { type: 'assistant_chunk', content: text, messageId });
      }
    } catch {
      // Not valid JSON — ignore non-JSON output
    }
  }
}
