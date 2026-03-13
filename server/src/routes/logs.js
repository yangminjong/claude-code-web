import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { getAuditLogs } from '../services/auditLogger.js';

const router = Router();

// GET /api/logs — my audit logs
router.get('/', authenticate, (req, res) => {
  try {
    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const action = req.query.action || undefined;

    const { logs, total } = getAuditLogs(req.user.id, { page, limit, action });
    res.json({ ok: true, data: { logs, total } });
  } catch (err) {
    console.error('[logs] List error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
