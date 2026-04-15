import { Router } from 'express';
import bcrypt from 'bcrypt';
import { resolve, dirname } from 'path';
import { mkdirSync, copyFileSync, renameSync, unlinkSync, existsSync, createReadStream } from 'fs';
import multer from 'multer';
import { getDb } from '../db/connection.js';
import { signToken } from '../utils/jwt.js';
import { authenticate } from '../middleware/authenticate.js';
import { auditLog } from '../services/auditLogger.js';
import { generateCode, sendVerificationEmail } from '../utils/mailer.js';

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
    const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);

    if (existing && existing.email_verified) {
      return res.status(409).json({
        ok: false,
        error: { code: 'DUPLICATE_EMAIL', message: '이미 등록된 이메일입니다' }
      });
    }

    let userId;
    if (existing && !existing.email_verified) {
      // Re-register: update password/displayName for unverified user
      const passwordHash = await bcrypt.hash(password, 10);
      db.prepare('UPDATE users SET password_hash = ?, display_name = ? WHERE id = ?')
        .run(passwordHash, displayName, existing.id);
      userId = existing.id;
    } else {
      const passwordHash = await bcrypt.hash(password, 10);
      const result = db.prepare(
        'INSERT INTO users (email, password_hash, display_name, email_verified) VALUES (?, ?, ?, 0)'
      ).run(email, passwordHash, displayName);
      userId = result.lastInsertRowid;
    }

    // Invalidate previous codes
    db.prepare('UPDATE email_verifications SET used = 1 WHERE email = ? AND used = 0').run(email);

    // Generate and send verification code
    const code = generateCode();
    const expireMinutes = parseInt(process.env.EMAIL_VERIFY_EXPIRE_MINUTES || '10', 10);
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();
    db.prepare('INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)')
      .run(email, code, expiresAt);

    await sendVerificationEmail(email, code);
    auditLog(userId, 'register', { email }, req.ip);

    res.status(201).json({
      ok: true,
      data: { needsVerification: true, email }
    });
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

    if (!user.email_verified) {
      return res.status(403).json({
        ok: false,
        error: { code: 'EMAIL_NOT_VERIFIED', message: '이메일 인증이 필요합니다' }
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

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '이메일과 인증 코드를 입력해주세요' }
      });
    }

    const db = getDb();
    const verification = db.prepare(
      'SELECT * FROM email_verifications WHERE email = ? AND code = ? AND used = 0 ORDER BY created_at DESC LIMIT 1'
    ).get(email, code);

    if (!verification) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_CODE', message: '유효하지 않은 인증 코드입니다' }
      });
    }

    if (new Date(verification.expires_at) < new Date()) {
      return res.status(400).json({
        ok: false,
        error: { code: 'CODE_EXPIRED', message: '인증 코드가 만료되었습니다. 재발송해주세요' }
      });
    }

    // Mark code as used and verify user
    db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?').run(verification.id);
    db.prepare('UPDATE users SET email_verified = 1 WHERE email = ?').run(email);

    // Auto-login after verification
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const token = signToken({ userId: user.id });
    db.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    auditLog(user.id, 'email_verified', { email }, req.ip);

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
    console.error('[auth] Verify email error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '이메일을 입력해주세요' }
      });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);

    if (!user) {
      // Don't reveal whether user exists
      return res.json({ ok: true, data: { sent: true } });
    }

    if (user.email_verified) {
      return res.status(400).json({
        ok: false,
        error: { code: 'ALREADY_VERIFIED', message: '이미 인증된 이메일입니다' }
      });
    }

    // Rate limit: check last sent time
    const lastSent = db.prepare(
      'SELECT created_at FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1'
    ).get(email);

    if (lastSent) {
      const elapsed = Date.now() - new Date(lastSent.created_at).getTime();
      if (elapsed < 60 * 1000) {
        return res.status(429).json({
          ok: false,
          error: { code: 'RATE_LIMITED', message: '1분 후에 다시 시도해주세요' }
        });
      }
    }

    // Invalidate previous codes
    db.prepare('UPDATE email_verifications SET used = 1 WHERE email = ? AND used = 0').run(email);

    const code = generateCode();
    const expireMinutes = parseInt(process.env.EMAIL_VERIFY_EXPIRE_MINUTES || '10', 10);
    const expiresAt = new Date(Date.now() + expireMinutes * 60 * 1000).toISOString();
    db.prepare('INSERT INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)')
      .run(email, code, expiresAt);

    await sendVerificationEmail(email, code);

    res.json({ ok: true, data: { sent: true } });
  } catch (err) {
    console.error('[auth] Resend verification error:', err);
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
