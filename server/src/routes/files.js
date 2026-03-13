import { Router } from 'express';
import { resolve } from 'path';
import { readdirSync, statSync, createReadStream, mkdirSync, renameSync } from 'fs';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate.js';
import { pathGuard } from '../middleware/pathGuard.js';
import { validatePath } from '../utils/pathValidator.js';
import { auditLog } from '../services/auditLogger.js';

const router = Router();

const WORKSPACE_ROOT = () => resolve(process.env.WORKSPACE_ROOT || '../workspace');
const MAX_UPLOAD = () => parseInt(process.env.MAX_UPLOAD_SIZE_MB || '50', 10) * 1024 * 1024;

function getUserRoot(user) {
  const username = user.email.split('@')[0];
  const root = resolve(WORKSPACE_ROOT(), username);
  mkdirSync(root, { recursive: true });
  return root;
}

// Configure multer for temp storage
const upload = multer({
  dest: '/tmp/claude-code-web-uploads',
  limits: { fileSize: MAX_UPLOAD() }
});

// GET /api/files — list directory
router.get('/', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const requestedPath = req.query.path || '.';
    const resolvedPath = validatePath(userRoot, requestedPath);

    const entries = readdirSync(resolvedPath, { withFileTypes: true });
    const items = entries.map(entry => {
      const fullPath = resolve(resolvedPath, entry.name);
      const stat = statSync(fullPath);
      return {
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      };
    });

    res.json({ ok: true, data: { items } });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    if (err.code === 'ENOENT') {
      return res.json({ ok: true, data: { items: [] } });
    }
    console.error('[files] List error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/files/upload
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '파일이 없습니다' }
      });
    }

    const userRoot = getUserRoot(req.user);
    const targetDir = req.body.path || '.';
    const resolvedDir = validatePath(userRoot, targetDir);
    mkdirSync(resolvedDir, { recursive: true });

    const targetPath = resolve(resolvedDir, req.file.originalname);
    // Validate final path is still within userRoot
    validatePath(userRoot, targetDir + '/' + req.file.originalname);

    // Move file from temp to target
    renameSync(req.file.path, targetPath);

    auditLog(req.user.id, 'file_upload', {
      filename: req.file.originalname,
      size: req.file.size,
      path: targetDir
    }, req.ip);

    res.json({
      ok: true,
      data: {
        file: {
          name: req.file.originalname,
          size: req.file.size,
          path: targetDir
        }
      }
    });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        ok: false,
        error: { code: 'FILE_TOO_LARGE', message: '파일 크기가 제한을 초과했습니다' }
      });
    }
    console.error('[files] Upload error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/files/download
router.get('/download', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const requestedPath = req.query.path;
    if (!requestedPath) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'path 파라미터가 필요합니다' }
      });
    }

    const resolvedPath = validatePath(userRoot, requestedPath);
    const stat = statSync(resolvedPath);
    if (stat.isDirectory()) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '디렉토리는 다운로드할 수 없습니다' }
      });
    }

    auditLog(req.user.id, 'file_download', {
      filename: requestedPath,
      size: stat.size
    }, req.ip);

    res.setHeader('Content-Disposition', `attachment; filename="${requestedPath.split('/').pop()}"`);
    createReadStream(resolvedPath).pipe(res);
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    if (err.code === 'ENOENT') {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다' }
      });
    }
    console.error('[files] Download error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
