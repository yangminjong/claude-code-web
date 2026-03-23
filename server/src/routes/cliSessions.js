import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getCliSessions, getCliSessionStats, adoptCliSession, deleteCliSession } from '../services/cliSessionService.js';

const router = Router();

// GET /api/cli-sessions — list CLI sessions
router.get('/', authenticate, (req, res) => {
  try {
    const { project, find, limit, sort, refresh } = req.query;
    const sessions = getCliSessions({ project, find, limit, sort, refresh });
    res.json({ ok: true, data: { sessions } });
  } catch (err) {
    console.error('[cli-sessions] List error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/cli-sessions/stats — session statistics
router.get('/stats', authenticate, (req, res) => {
  try {
    const { refresh } = req.query;
    const stats = getCliSessionStats(!!refresh);
    res.json({ ok: true, data: stats });
  } catch (err) {
    console.error('[cli-sessions] Stats error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/cli-sessions/adopt — adopt CLI session as web session
router.post('/adopt', authenticate, (req, res) => {
  try {
    const { sessionId, sessionName, project } = req.body;
    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '세션 ID가 필요합니다' }
      });
    }
    const session = adoptCliSession(sessionId, sessionName, project, req.user.id);
    res.json({ ok: true, data: { session } });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_EXCEEDED') {
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message }
      });
    }
    console.error('[cli-sessions] Adopt error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/cli-sessions/:sessionId — delete Claude CLI session
router.delete('/:sessionId', authenticate, (req, res) => {
  try {
    deleteCliSession(req.params.sessionId);
    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[cli-sessions] Delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
