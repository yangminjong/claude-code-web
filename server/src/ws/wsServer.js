import { WebSocketServer } from 'ws';
import { parse } from 'url';
import { verifyToken } from '../utils/jwt.js';
import { getDb } from '../db/connection.js';
import { handleConnection } from './wsHandler.js';

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    try {
      const { query } = parse(req.url, true);
      const { token, sessionId } = query;

      if (!token || !sessionId) {
        ws.send(JSON.stringify({ type: 'error', message: '토큰과 세션ID가 필요합니다' }));
        ws.close();
        return;
      }

      // Verify JWT
      let payload;
      try {
        payload = verifyToken(token);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: '유효하지 않은 토큰입니다' }));
        ws.close();
        return;
      }

      // Verify user exists
      const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(payload.userId);
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', message: '사용자를 찾을 수 없습니다' }));
        ws.close();
        return;
      }

      handleConnection(ws, user.id, parseInt(sessionId, 10));
    } catch (err) {
      console.error('[ws] Connection setup error:', err);
      ws.close();
    }
  });

  return wss;
}
