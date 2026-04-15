import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  createSession, destroySession, getUserSessions,
  getSession, getSessionMessages, updateSessionName, resumeSession,
  deleteSessionPermanently, getSessionMetadata,
  getMessageTree, getActivePath, getBranchSelections, setBranchSelection,
  getMessageChildren
} from '../services/sessionManager.js';

const router = Router();

// GET /api/sessions — list my sessions
router.get('/', authenticate, (req, res) => {
  try {
    const sessions = getUserSessions(req.user.id);
    res.json({ ok: true, data: { sessions } });
  } catch (err) {
    console.error('[sessions] List error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/sessions — create session
router.post('/', authenticate, (req, res) => {
  try {
    const { name, workMode, projectPath, sshProfileId } = req.body;
    const session = createSession(req.user.id, {
      name: name || '새 채팅',
      workMode: workMode || 'server',
      projectPath: projectPath || 'default',
      sshProfileId: sshProfileId || null
    });
    res.status(201).json({ ok: true, data: { session } });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_EXCEEDED') {
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message }
      });
    }
    console.error('[sessions] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/sessions/:id — session detail
router.get('/:id', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' }
      });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: '다른 사용자의 세션에 접근할 수 없습니다' }
      });
    }
    res.json({ ok: true, data: { session } });
  } catch (err) {
    console.error('[sessions] Detail error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// PATCH /api/sessions/:id/name — rename session
router.patch('/:id/name', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' }
      });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' }
      });
    }
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '세션 이름을 입력해주세요' }
      });
    }
    updateSessionName(session.id, name);
    res.json({ ok: true, data: { name } });
  } catch (err) {
    console.error('[sessions] Rename error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/sessions/:id/resume — resume ended session
router.post('/:id/resume', authenticate, (req, res) => {
  try {
    const session = resumeSession(parseInt(req.params.id, 10), req.user.id);
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없거나 권한이 없습니다' }
      });
    }
    res.json({ ok: true, data: { session } });
  } catch (err) {
    if (err.code === 'SESSION_LIMIT_EXCEEDED') {
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message }
      });
    }
    console.error('[sessions] Resume error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/sessions/:id — end session
router.delete('/:id', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' }
      });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: '다른 사용자의 세션을 종료할 수 없습니다' }
      });
    }
    destroySession(session.id, req.user.id);
    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[sessions] Delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/sessions/:id/metadata — session metadata
router.get('/:id/metadata', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' }
      });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' }
      });
    }
    const metadata = getSessionMetadata(session.id);
    res.json({ ok: true, data: metadata });
  } catch (err) {
    console.error('[sessions] Metadata error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/sessions/:id/permanent — permanently delete session
router.delete('/:id/permanent', authenticate, (req, res) => {
  try {
    const result = deleteSessionPermanently(parseInt(req.params.id, 10), req.user.id);
    if (!result) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없거나 권한이 없습니다' }
      });
    }
    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[sessions] Permanent delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/sessions/:id/messages — conversation history
router.get('/:id/messages', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({
        ok: false,
        error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' }
      });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({
        ok: false,
        error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' }
      });
    }

    const page = parseInt(req.query.page || '1', 10);
    const limit = parseInt(req.query.limit || '50', 10);
    const { messages, total } = getSessionMessages(session.id, { page, limit });

    res.json({ ok: true, data: { messages, total } });
  } catch (err) {
    console.error('[sessions] Messages error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// === Conversation Branching APIs ===

// GET /api/sessions/:id/messages/tree — full message tree
router.get('/:id/messages/tree', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' } });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' } });
    }
    const tree = getMessageTree(session.id);
    const selections = getBranchSelections(session.id);
    res.json({ ok: true, data: { tree, selections } });
  } catch (err) {
    console.error('[sessions] Tree error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/sessions/:id/messages/active-path — active conversation path
router.get('/:id/messages/active-path', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' } });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' } });
    }
    const path = getActivePath(session.id);
    res.json({ ok: true, data: { messages: path } });
  } catch (err) {
    console.error('[sessions] Active path error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// PUT /api/sessions/:id/branches — set active branch at a fork point
router.put('/:id/branches', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' } });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' } });
    }
    const { parentMessageId, branchIndex } = req.body;
    if (parentMessageId == null || branchIndex == null) {
      return res.status(400).json({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'parentMessageId와 branchIndex가 필요합니다' } });
    }
    setBranchSelection(session.id, parentMessageId, branchIndex);
    const path = getActivePath(session.id);
    res.json({ ok: true, data: { messages: path } });
  } catch (err) {
    console.error('[sessions] Branch select error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/sessions/:id/messages/:msgId/children — get children of a message
router.get('/:id/messages/:msgId/children', authenticate, (req, res) => {
  try {
    const session = getSession(parseInt(req.params.id, 10));
    if (!session) {
      return res.status(404).json({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: '세션을 찾을 수 없습니다' } });
    }
    if (session.user_id !== req.user.id) {
      return res.status(403).json({ ok: false, error: { code: 'FORBIDDEN', message: '접근 권한이 없습니다' } });
    }
    const children = getMessageChildren(parseInt(req.params.msgId, 10));
    res.json({ ok: true, data: { children } });
  } catch (err) {
    console.error('[sessions] Children error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

export default router;
