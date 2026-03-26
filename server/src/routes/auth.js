import { Router } from 'express';
import bcrypt from 'bcrypt';
import { resolve, dirname } from 'path';
import { mkdirSync, copyFileSync, renameSync, unlinkSync, existsSync, createReadStream } from 'fs';
import multer from 'multer';
import { getDb } from '../db/connection.js';
import { signToken } from '../utils/jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { auditLog } from '../services/auditLogger.js';

const router = Router();
const ALLOWED_THEMES = new Set(['dark', 'dimmed', 'light', 'solarized', 'nord', 'monokai']);

const AVATAR_DIR = () => resolve(process.env.AVATAR_DIR || resolve(process.env.WORKSPACE_ROOT || '../workspace', '../avatars'));
const avatarUpload = multer({
  dest: '/tmp/claude-code-web-avatars',
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('이미지 파일만 업로드할 수 있습니다 (JPEG, PNG, GIF, WebP)'));
    }
  }
});

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

    const user = { id: result.lastInsertRowid, email, displayName, avatarUrl: null, theme: 'dark' };
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
        user: {
          id: user.id,
          email: user.email,
          displayName: user.display_name,
          avatarUrl: user.avatar_url || null,
          theme: user.theme || 'dark'
        },
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
        displayName: req.user.display_name,
        avatarUrl: req.user.avatar_url || null,
        theme: req.user.theme || 'dark'
      }
    }
  });
});

// PUT /api/auth/theme
router.put('/theme', authenticate, (req, res) => {
  try {
    const theme = String(req.body?.theme || '').trim();
    if (!ALLOWED_THEMES.has(theme)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '유효하지 않은 테마입니다' }
      });
    }

    const db = getDb();
    db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(theme, req.user.id);

    res.json({
      ok: true,
      data: {
        user: {
          id: req.user.id,
          email: req.user.email,
          displayName: req.user.display_name,
          avatarUrl: req.user.avatar_url || null,
          theme
        }
      }
    });
  } catch (err) {
    console.error('[auth] Theme update error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
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

// POST /api/auth/avatar — upload profile avatar
router.post('/avatar', authenticate, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '이미지 파일이 필요합니다' }
      });
    }

    const avatarDir = AVATAR_DIR();
    mkdirSync(avatarDir, { recursive: true });

    // Delete old avatar if exists
    const db = getDb();
    const oldAvatar = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    if (oldAvatar?.avatar_url) {
      const oldPath = resolve(avatarDir, oldAvatar.avatar_url);
      if (existsSync(oldPath)) {
        try { unlinkSync(oldPath); } catch {}
      }
    }

    // Save with unique name (copyFile + unlink for cross-device support)
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const filename = `${req.user.id}_${Date.now()}.${ext}`;
    const targetPath = resolve(avatarDir, filename);
    copyFileSync(req.file.path, targetPath);
    try { unlinkSync(req.file.path); } catch {}

    // Update DB
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(filename, req.user.id);

    res.json({
      ok: true,
      data: { avatarUrl: `/api/auth/avatar/${filename}` }
    });
  } catch (err) {
    console.error('[auth] Avatar upload error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/auth/avatar — remove profile avatar
router.delete('/avatar', authenticate, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
    if (user?.avatar_url) {
      const avatarPath = resolve(AVATAR_DIR(), user.avatar_url);
      if (existsSync(avatarPath)) {
        try { unlinkSync(avatarPath); } catch {}
      }
    }
    db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[auth] Avatar delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/auth/avatar/:filename — serve avatar image
router.get('/avatar/:filename', (req, res) => {
  try {
    const avatarDir = AVATAR_DIR();
    const filename = req.params.filename.replace(/[^a-zA-Z0-9_.\-]/g, '');
    const filePath = resolve(avatarDir, filename);

    if (!filePath.startsWith(avatarDir) || !existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '아바타를 찾을 수 없습니다' } });
    }

    const ext = filename.split('.').pop().toLowerCase();
    const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
    res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[auth] Avatar serve error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
