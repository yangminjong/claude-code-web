import { useEffect, useRef, useCallback, useState } from 'react';

export function useWebSocket(sessionId, token) {
  const wsRef = useRef(null);
  const heartbeatRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const onCompleteRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.host;
    const url = `${protocol}://${host}/ws?token=${token}&sessionId=${sessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connected':
            setConnected(true);
            break;
          case 'assistant_start':
            setThinking(true);
            setStreamingText('');
            break;
          case 'assistant_chunk':
            setThinking(false);
            setStreamingText((prev) => prev + msg.content);
            break;
          case 'assistant_end':
            setThinking(false);
            setStreamingText('');
            // Notify that the full response is done
            onCompleteRef.current?.(msg.content);
            break;
          case 'assistant_cancelled':
            setThinking(false);
            setStreamingText('');
            break;
          case 'error':
            setThinking(false);
            onCompleteRef.current?.({ error: msg.message });
            break;
          case 'heartbeat_ack':
            break;
        }
      } catch {}
    };

    ws.onerror = () => setConnected(false);
    ws.onclose = () => {
      setConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      ws.close();
      setConnected(false);
      setThinking(false);
      setStreamingText('');
    };
  }, [sessionId, token]);

  const sendMessage = useCallback((content) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', content }));
    }
  }, []);

  const cancelResponse = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'cancel' }));
    }
  }, []);

  const onComplete = useCallback((fn) => {
    onCompleteRef.current = fn;
  }, []);

  return { connected, thinking, streamingText, sendMessage, cancelResponse, onComplete };
}
