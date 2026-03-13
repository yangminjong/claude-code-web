import {
  sendMessage, getClaudeSessionId, setClaudeSessionId,
  isProcessBusy, cancelProcess
} from '../services/processManager.js';
import { addMessage, getSession } from '../services/sessionManager.js';
import { auditLog } from '../services/auditLogger.js';

/**
 * Extract displayable text from a stream-json line object.
 * Handles multiple possible output formats from Claude Code CLI.
 */
function extractText(obj) {
  // {"type":"assistant","content":"text"}
  if (obj.type === 'assistant' && typeof obj.content === 'string') {
    return obj.content;
  }
  // {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
  if (obj.type === 'content_block_delta' && obj.delta?.text) {
    return obj.delta.text;
  }
  // {"type":"text","text":"..."}
  if (obj.type === 'text' && typeof obj.text === 'string') {
    return obj.text;
  }
  // content is array of {type:"text",text:"..."}
  if (Array.isArray(obj.content)) {
    const texts = obj.content
      .filter(c => c.type === 'text' && c.text)
      .map(c => c.text);
    if (texts.length > 0) return texts.join('');
  }
  // {"message":{"content":[...]}}
  if (obj.message?.content) {
    return extractText({ content: obj.message.content });
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

  if (session.status === 'ended' || session.status === 'error') {
    ws.send(JSON.stringify({ type: 'error', message: '이미 종료된 세션입니다' }));
    ws.close();
    return;
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

  // Save user message to DB
  addMessage(sessionId, 'user', content);

  // Notify client that assistant is thinking
  ws.send(JSON.stringify({ type: 'assistant_start' }));

  const claudeSessionId = getClaudeSessionId(sessionId);

  let proc;
  try {
    proc = sendMessage(sessionId, content, session.project_path, claudeSessionId);
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

    ws.send(JSON.stringify({
      type: 'assistant_end',
      content: fullResponse,
      exitCode: code
    }));
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
          capturedSessionId = true;
        }
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
      // Not valid JSON — might be plain text output from claude
      // Send it as-is if it looks like content
      if (line.trim() && !line.startsWith('{')) {
        fullResponse += line;
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({ type: 'assistant_chunk', content: line }));
        }
      }
    }
  }
}
