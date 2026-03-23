import {
  sendMessage, sendMessageSSH, getClaudeSessionId, setClaudeSessionId,
  isProcessBusy, cancelProcess
} from '../services/processManager.js';
import { addMessage, getSession, updateSessionName, updateClaudeSessionId } from '../services/sessionManager.js';
import { getDb } from '../db/connection.js';
import { auditLog } from '../services/auditLogger.js';
import { getProfileWithCredential, updateLastConnected } from '../services/sshProfileManager.js';

/**
 * Extract displayable text from a stream-json line object.
 * Handles multiple possible output formats from Claude Code CLI.
 */
function extractText(obj) {
  // stream_event with text_delta — token-level streaming
  if (obj.type === 'stream_event' && obj.event?.type === 'content_block_delta'
      && obj.event.delta?.type === 'text_delta') {
    return obj.event.delta.text;
  }
  // {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
  if (obj.type === 'content_block_delta' && obj.delta?.text) {
    return obj.delta.text;
  }
  // Skip partial assistant messages (already handled via stream_event deltas)
  // Only use the final assistant message if no stream_event deltas were received
  if (obj.type === 'assistant' && obj.message?.content) {
    return null;
  }
  // {"type":"text","text":"..."}
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

export function handleConnection(ws, userId, sessionId) {
  const session = getSession(sessionId);
  if (!session || session.user_id !== userId) {
    ws.send(JSON.stringify({ type: 'error', message: '세션을 찾을 수 없습니다' }));
    ws.close();
    return;
  }

  // Allow connecting to ended/error sessions (for resume)
  // The actual resume happens via POST /api/sessions/:id/resume before WS connect

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

  ws.send(JSON.stringify({ type: 'connected', sessionId }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'message':
          handleUserMessage(ws, sessionId, session, msg.content);
          break;

        case 'cancel':
          if (cancelProcess(sessionId)) {
            ws.send(JSON.stringify({ type: 'assistant_cancelled' }));
          }
          break;

        case 'heartbeat':
          lastHeartbeat = Date.now();
          ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
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
    auditLog(userId, 'ws_disconnect', { sessionId });
  });

  ws.on('error', (err) => {
    console.error(`[ws] Error for session ${sessionId}:`, err.message);
  });
}

function handleUserMessage(ws, sessionId, session, content) {
  if (!content || typeof content !== 'string') {
    ws.send(JSON.stringify({ type: 'error', message: '메시지 내용이 비어있습니다' }));
    return;
  }

  if (isProcessBusy(sessionId)) {
    ws.send(JSON.stringify({ type: 'error', message: '이전 응답이 완료되지 않았습니다. 잠시 후 다시 시도하세요.' }));
    return;
  }

  // Auto-rename session on first message (if still "새 채팅")
  if (session.name === '새 채팅') {
    const autoName = content.length > 30 ? content.substring(0, 30) + '...' : content;
    updateSessionName(sessionId, autoName);
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'session_renamed', name: autoName }));
    }
  }

  // Save user message to DB
  addMessage(sessionId, 'user', content);

  // Notify client that assistant is thinking
  ws.send(JSON.stringify({ type: 'assistant_start' }));

  // Use DB-persisted claude_session_id first, fall back to in-memory
  const dbSession = getSession(sessionId);
  const claudeSessionId = getClaudeSessionId(sessionId) || dbSession?.claude_session_id || null;

  let proc;
  try {
    if (session.work_mode === 'ssh') {
      const profile = getProfileWithCredential(session.ssh_profile_id, session.user_id);
      if (!profile) {
        ws.send(JSON.stringify({ type: 'error', message: 'SSH 프로필을 찾을 수 없습니다' }));
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
    ws.send(JSON.stringify({ type: 'error', message: err.message }));
    return;
  }

  let fullResponse = '';
  let lineBuffer = '';
  let capturedSessionId = false;

  proc.stdout.on('data', (chunk) => {
    lineBuffer += chunk.toString();
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop(); // keep incomplete last line

    for (const line of lines) {
      processJsonLine(line);
    }
  });

  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    // Claude Code may output progress/status info to stderr — ignore or log
    console.error(`[claude stderr] ${text.trim()}`);
  });

  proc.on('close', (code) => {
    // Process remaining buffer
    if (lineBuffer.trim()) {
      processJsonLine(lineBuffer);
    }

    // Save assistant response to DB
    if (fullResponse) {
      addMessage(sessionId, 'assistant', fullResponse);
    }

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'assistant_end',
        content: fullResponse,
        exitCode: code
      }));
    }
  });

  proc.on('error', (err) => {
    ws.send(JSON.stringify({
      type: 'error',
      message: `프로세스 오류: ${err.message}`
    }));
  });

  function processJsonLine(line) {
    if (!line.trim()) return;
    try {
      const obj = JSON.parse(line);

      // Capture claude session ID for --resume on next message
      if (!capturedSessionId) {
        const sid = extractSessionId(obj);
        if (sid) {
          setClaudeSessionId(sessionId, sid);
          updateClaudeSessionId(sessionId, sid);
          capturedSessionId = true;
        }
      }

      // Fallback: if result has text and we got nothing from streaming
      if (obj.type === 'result' && obj.result && !fullResponse) {
        fullResponse = obj.result;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'assistant_chunk', content: obj.result }));
        }
        return;
      }

      // Extract text and send to client
      const text = extractText(obj);
      if (text) {
        fullResponse += text;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'assistant_chunk', content: text }));
        }
      }
    } catch {
      // Not valid JSON — ignore non-JSON output
    }
  }
}
