import { Router } from 'express';
import { resolve, basename } from 'path';
import { readdirSync, statSync, createReadStream, mkdirSync, renameSync, writeFileSync, rmSync, existsSync, copyFileSync, unlinkSync } from 'fs';
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

    // multer는 originalname을 latin1로 디코딩하므로 UTF-8로 복원
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');

    const targetPath = resolve(resolvedDir, originalName);
    // Validate final path is still within userRoot
    validatePath(userRoot, targetDir + '/' + originalName);

    // Move file from temp to target (copyFileSync + unlinkSync to avoid EXDEV cross-device error)
    copyFileSync(req.file.path, targetPath);
    unlinkSync(req.file.path);

    auditLog(req.user.id, 'file_upload', {
      filename: originalName,
      size: req.file.size,
      path: targetDir
    }, req.ip);

    res.json({
      ok: true,
      data: {
        file: {
          name: originalName,
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

    const fileName = requestedPath.split('/').pop();
    const encodedName = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`);
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

// POST /api/files/mkdir — create directory
router.post('/mkdir', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const { path: dirPath } = req.body;
    if (!dirPath) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '경로가 필요합니다' }
      });
    }

    const resolvedPath = validatePath(userRoot, dirPath);
    if (existsSync(resolvedPath)) {
      return res.status(409).json({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: '이미 존재하는 경로입니다' }
      });
    }

    mkdirSync(resolvedPath, { recursive: true });

    auditLog(req.user.id, 'file_create', { type: 'directory', path: dirPath }, req.ip);

    res.json({ ok: true, data: { path: dirPath } });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[files] Mkdir error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/files/create — create empty file
router.post('/create', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '경로가 필요합니다' }
      });
    }

    const resolvedPath = validatePath(userRoot, filePath);
    if (existsSync(resolvedPath)) {
      return res.status(409).json({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: '이미 존재하는 파일입니다' }
      });
    }

    // 부모 디렉토리 생성
    const parentDir = resolve(resolvedPath, '..');
    mkdirSync(parentDir, { recursive: true });
    writeFileSync(resolvedPath, '', 'utf8');

    auditLog(req.user.id, 'file_create', { type: 'file', path: filePath }, req.ip);

    res.json({ ok: true, data: { path: filePath } });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[files] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/files/rename — rename file or directory
router.post('/rename', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'oldPath, newPath가 필요합니다' }
      });
    }

    const resolvedOld = validatePath(userRoot, oldPath);
    const resolvedNew = validatePath(userRoot, newPath);

    if (!existsSync(resolvedOld)) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다' }
      });
    }

    if (existsSync(resolvedNew)) {
      return res.status(409).json({
        ok: false,
        error: { code: 'ALREADY_EXISTS', message: '대상 경로가 이미 존재합니다' }
      });
    }

    renameSync(resolvedOld, resolvedNew);

    auditLog(req.user.id, 'file_rename', { oldPath, newPath }, req.ip);

    res.json({ ok: true, data: { oldPath, newPath } });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[files] Rename error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/files — delete file or directory
router.delete('/', authenticate, (req, res) => {
  try {
    const userRoot = getUserRoot(req.user);
    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'path 파라미터가 필요합니다' }
      });
    }

    const resolvedPath = validatePath(userRoot, filePath);
    if (!existsSync(resolvedPath)) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: '파일을 찾을 수 없습니다' }
      });
    }

    const stat = statSync(resolvedPath);
    rmSync(resolvedPath, { recursive: true, force: true });

    auditLog(req.user.id, 'file_delete', {
      type: stat.isDirectory() ? 'directory' : 'file',
      path: filePath
    }, req.ip);

    res.json({ ok: true, data: { path: filePath } });
  } catch (err) {
    if (err.code === 'PATH_TRAVERSAL_DENIED') {
      return res.status(403).json({ ok: false, error: { code: err.code, message: err.message } });
    }
    console.error('[files] Delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
