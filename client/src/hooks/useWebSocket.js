import { useEffect, useRef, useCallback, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore.js';

/**
 * WebSocket connection states
 */
const WS_STATE = {
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  DISCONNECTED: 'disconnected',
};

/**
 * Exponential backoff config
 */
const BACKOFF = {
  INITIAL_MS: 1000,
  MAX_MS: 30000,
  FACTOR: 2,
  MAX_RETRIES: 20,
};

let msgIdCounter = 0;
function generateMessageId() {
  return `msg_${Date.now()}_${++msgIdCounter}`;
}

export function useWebSocket(sessionId, token) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const stabilityTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const messageQueueRef = useRef([]);
  const sessionIdRef = useRef(sessionId);
  const tokenRef = useRef(token);

  // messageId tracking — only accept responses that match the active request
  const activeMessageIdRef = useRef(null);

  const [connState, setConnState] = useState(WS_STATE.DISCONNECTED);
  const [retryCount, setRetryCount] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const onCompleteRef = useRef(null);

  const renameSession = useSessionStore((s) => s.renameSession);

  // Keep refs in sync
  useEffect(() => {
    sessionIdRef.current = sessionId;
    tokenRef.current = token;
  }, [sessionId, token]);

  const clearHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearStabilityTimer = useCallback(() => {
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback((ws) => {
    clearHeartbeat();
    heartbeatRef.current = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 30000);
  }, [clearHeartbeat]);

  /**
   * Flush queued messages after reconnect
   */
  const flushMessageQueue = useCallback((ws) => {
    while (messageQueueRef.current.length > 0) {
      const msg = messageQueueRef.current.shift();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      } else {
        messageQueueRef.current.unshift(msg);
        break;
      }
    }
  }, []);

  /**
   * Calculate backoff delay with jitter
   */
  const getBackoffDelay = useCallback(() => {
    const delay = Math.min(
      BACKOFF.INITIAL_MS * Math.pow(BACKOFF.FACTOR, retryCountRef.current),
      BACKOFF.MAX_MS
    );
    const jitter = delay * 0.1 * Math.random();
    return delay + jitter;
  }, []);

  /**
   * Check if a response message matches the active request
   */
  const isActiveMessage = useCallback((msg) => {
    // If server doesn't include messageId (backward compat), accept all
    if (!msg.messageId) return true;
    // If we have no active request, accept (e.g., reconnect recovery)
    if (!activeMessageIdRef.current) return true;
    return msg.messageId === activeMessageIdRef.current;
  }, []);

  /**
   * Core connect function — used for both initial connect and reconnect
   */
  const connect = useCallback(() => {
    const sid = sessionIdRef.current;
    const tok = tokenRef.current;
    if (!sid || !tok) return;

    // Close existing connection if any
    if (wsRef.current) {
      const old = wsRef.current;
      wsRef.current = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      if (old.readyState === WebSocket.OPEN || old.readyState === WebSocket.CONNECTING) {
        old.close();
      }
    }

    const isReconnect = retryCountRef.current > 0;
    setConnState(isReconnect ? WS_STATE.RECONNECTING : WS_STATE.CONNECTING);

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${protocol}://${host}/ws?token=${tok}&sessionId=${sid}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      startHeartbeat(ws);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connected':
            setConnState(WS_STATE.CONNECTED);
            flushMessageQueue(ws);
            clearStabilityTimer();
            stabilityTimerRef.current = setTimeout(() => {
              stabilityTimerRef.current = null;
              retryCountRef.current = 0;
              setRetryCount(0);
            }, 5000);
            break;

          case 'assistant_start':
            // Only accept if this response is for our active request
            if (isActiveMessage(msg)) {
              setThinking(true);
              setStreamingText('');
            } else {
              console.log('[ws] Ignoring stale assistant_start for', msg.messageId);
            }
            break;

          case 'assistant_chunk':
            if (isActiveMessage(msg)) {
              setThinking(false);
              setStreamingText((prev) => prev + msg.content);
            }
            break;

          case 'assistant_end':
            if (isActiveMessage(msg)) {
              setThinking(false);
              setStreamingText('');
              activeMessageIdRef.current = null;
              onCompleteRef.current?.(msg.content, {
                dbMessageId: msg.dbMessageId,
                userDbMessageId: msg.userDbMessageId,
                isRegenerate: msg.isRegenerate || false,
              });
            } else {
              console.log('[ws] Ignoring stale assistant_end for', msg.messageId);
            }
            break;

          case 'assistant_cancelled':
            if (isActiveMessage(msg)) {
              setThinking(false);
              setStreamingText('');
              activeMessageIdRef.current = null;
            }
            break;

          case 'error':
            if (isActiveMessage(msg)) {
              setThinking(false);
              activeMessageIdRef.current = null;
              onCompleteRef.current?.({ error: msg.message });
            }
            break;

          case 'session_renamed':
            renameSession(sid, msg.name);
            break;

          case 'heartbeat_ack':
            break;
        }
      } catch {}
    };

    ws.onerror = () => {};

    ws.onclose = (event) => {
      clearHeartbeat();
      clearStabilityTimer();

      if (wsRef.current !== ws) return;
      wsRef.current = null;

      if (intentionalCloseRef.current) {
        setConnState(WS_STATE.DISCONNECTED);
        return;
      }

      if (event.code === 4001 || event.code === 4003 || event.code === 4004) {
        setConnState(WS_STATE.DISCONNECTED);
        return;
      }

      if (retryCountRef.current < BACKOFF.MAX_RETRIES) {
        const delay = getBackoffDelay();
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        setConnState(WS_STATE.RECONNECTING);

        console.log(`[ws] Reconnecting in ${Math.round(delay)}ms (attempt ${retryCountRef.current}/${BACKOFF.MAX_RETRIES})`);

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, delay);
      } else {
        console.log('[ws] Max reconnect attempts reached');
        setConnState(WS_STATE.DISCONNECTED);
      }
    };
  }, [startHeartbeat, clearHeartbeat, clearStabilityTimer, flushMessageQueue, getBackoffDelay, isActiveMessage, renameSession]);

  /**
   * Main effect: connect when sessionId/token changes, cleanup on unmount
   */
  useEffect(() => {
    if (!sessionId || !token) {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      clearStabilityTimer();
      clearHeartbeat();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnState(WS_STATE.DISCONNECTED);
      setThinking(false);
      setStreamingText('');
      retryCountRef.current = 0;
      setRetryCount(0);
      messageQueueRef.current = [];
      activeMessageIdRef.current = null;
      return;
    }

    intentionalCloseRef.current = false;
    retryCountRef.current = 0;
    setRetryCount(0);
    messageQueueRef.current = [];
    activeMessageIdRef.current = null;
    setThinking(false);
    setStreamingText('');

    connect();

    return () => {
      intentionalCloseRef.current = true;
      clearReconnectTimer();
      clearStabilityTimer();
      clearHeartbeat();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnState(WS_STATE.DISCONNECTED);
      setThinking(false);
      setStreamingText('');
    };
  }, [sessionId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Send a message — queues if not connected.
   * Returns the messageId so caller can track it.
   * @param {string} content
   * @param {number|null} parentMessageId - DB message ID of the parent (for tree linking)
   */
  const sendMessage = useCallback((content, parentMessageId = null) => {
    const messageId = generateMessageId();
    activeMessageIdRef.current = messageId;
    const msg = { type: 'message', content, messageId };
    if (parentMessageId != null) msg.parentMessageId = parentMessageId;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      messageQueueRef.current.push(msg);
      console.log('[ws] Message queued (not connected):', messageId);
    }

    return messageId;
  }, []);

  /**
   * Regenerate — request a new alternative assistant response for a user message.
   * @param {number} userMessageId - DB id of the user message to regenerate from
   */
  const regenerate = useCallback((userMessageId) => {
    const messageId = generateMessageId();
    activeMessageIdRef.current = messageId;
    const msg = { type: 'regenerate', messageId, userMessageId };

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }

    return messageId;
  }, []);

  const cancelResponse = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'cancel',
        messageId: activeMessageIdRef.current
      }));
    }
  }, []);

  const onComplete = useCallback((fn) => {
    onCompleteRef.current = fn;
  }, []);

  const reconnect = useCallback(() => {
    clearReconnectTimer();
    retryCountRef.current = 0;
    setRetryCount(0);
    intentionalCloseRef.current = false;
    connect();
  }, [connect, clearReconnectTimer]);

  const connected = connState === WS_STATE.CONNECTED;

  return {
    connected,
    connState,
    retryCount,
    thinking,
    streamingText,
    sendMessage,
    regenerate,
    cancelResponse,
    onComplete,
    reconnect,
  };
}

export { WS_STATE };
