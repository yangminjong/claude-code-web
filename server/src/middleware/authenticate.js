import { verifyToken } from '../utils/jwt.js';
import { getDb } from '../db/connection.js';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  if (!authHeader?.startsWith('Bearer ') && !queryToken) {
    console.log('[auth] FAIL: no token for', req.method, req.path);
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: '인증 토큰이 필요합니다' }
    });
  }

  try {
    const token = authHeader ? authHeader.slice(7) : queryToken;
    const payload = verifyToken(token);
    const user = getDb().prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(payload.userId);
    if (!user) {
      console.log('[auth] FAIL: user not found for', req.method, req.path, 'userId:', payload.userId);
      return res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: '사용자를 찾을 수 없습니다' }
      });
    }
    req.user = user;
    next();
  } catch (err) {
    console.log('[auth] FAIL: token invalid for', req.method, req.path, err.message);
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: '유효하지 않거나 만료된 토큰입니다' }
    });
  }
}
