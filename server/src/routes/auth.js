import { Router } from 'express';
import bcrypt from 'bcrypt';
import { getDb } from '../db/connection.js';
import { signToken } from '../utils/jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { auditLog } from '../services/auditLogger.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '모든 필드를 입력해주세요' }
      });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: { code: 'DUPLICATE_EMAIL', message: '이미 등록된 이메일입니다' }
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash, display_name) VALUES (?, ?, ?)'
    ).run(email, passwordHash, displayName);

    const user = { id: result.lastInsertRowid, email, displayName };
    const token = signToken({ userId: user.id });

    res.status(201).json({ ok: true, data: { user, token } });
  } catch (err) {
    console.error('[auth] Register error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const ip = req.ip;
  try {
    const { email, password } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      auditLog(user?.id || null, 'login_fail', { email }, ip);
      return res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: '이메일 또는 비밀번호가 올바르지 않습니다' }
      });
    }

    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    auditLog(user.id, 'login', {}, ip);

    const token = signToken({ userId: user.id });
    res.json({
      ok: true,
      data: {
        user: { id: user.id, email: user.email, displayName: user.display_name },
        token
      }
    });
  } catch (err) {
    console.error('[auth] Login error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  auditLog(req.user.id, 'logout', {}, req.ip);
  res.json({ ok: true, data: { ok: true } });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({
    ok: true,
    data: {
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.display_name
      }
    }
  });
});

// PUT /api/auth/password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_PASSWORD', message: '현재 비밀번호가 올바르지 않습니다' }
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);

    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[auth] Password change error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
