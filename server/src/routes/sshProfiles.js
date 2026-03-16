import { Router } from 'express';
import { Client } from 'ssh2';
import { authenticate } from '../middleware/authenticate.js';
import {
  createProfile, getProfiles, getProfile, updateProfile,
  deleteProfile, getProfileWithCredential
} from '../services/sshProfileManager.js';

const router = Router();

// GET /api/ssh-profiles
router.get('/', authenticate, (req, res) => {
  try {
    const profiles = getProfiles(req.user.id);
    res.json({ ok: true, data: { profiles } });
  } catch (err) {
    console.error('[ssh-profiles] List error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/ssh-profiles
router.post('/', authenticate, (req, res) => {
  try {
    const { name, host, port, username, authMethod, credential, allowedPaths, remoteOs } = req.body;

    if (!name || !host || !username || !credential) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '이름, 호스트, 사용자명, 인증 정보는 필수입니다' }
      });
    }

    if (port !== undefined && (port < 1 || port > 65535)) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: '포트는 1-65535 범위여야 합니다' }
      });
    }

    const profile = createProfile(req.user.id, {
      name, host, port: port || 22, username,
      authMethod: authMethod || 'key', credential,
      allowedPaths: allowedPaths || [],
      remoteOs: remoteOs || 'linux'
    });

    res.status(201).json({ ok: true, data: { profile } });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({
        ok: false,
        error: { code: 'DUPLICATE_NAME', message: '같은 이름의 SSH 프로필이 이미 존재합니다' }
      });
    }
    console.error('[ssh-profiles] Create error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// GET /api/ssh-profiles/:id
router.get('/:id', authenticate, (req, res) => {
  try {
    const profile = getProfile(parseInt(req.params.id, 10), req.user.id);
    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'SSH 프로필을 찾을 수 없습니다' }
      });
    }
    res.json({ ok: true, data: { profile } });
  } catch (err) {
    console.error('[ssh-profiles] Detail error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// PUT /api/ssh-profiles/:id
router.put('/:id', authenticate, (req, res) => {
  try {
    const { name, host, port, username, authMethod, credential, allowedPaths, remoteOs } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (host !== undefined) updates.host = host;
    if (port !== undefined) updates.port = port;
    if (username !== undefined) updates.username = username;
    if (authMethod !== undefined) updates.auth_method = authMethod;
    if (remoteOs !== undefined) updates.remote_os = remoteOs;
    if (credential) updates.credential = credential;
    if (allowedPaths !== undefined) updates.allowedPaths = allowedPaths;

    const profile = updateProfile(parseInt(req.params.id, 10), req.user.id, updates);
    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'SSH 프로필을 찾을 수 없습니다' }
      });
    }
    res.json({ ok: true, data: { profile } });
  } catch (err) {
    console.error('[ssh-profiles] Update error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// DELETE /api/ssh-profiles/:id
router.delete('/:id', authenticate, (req, res) => {
  try {
    const profile = deleteProfile(parseInt(req.params.id, 10), req.user.id);
    if (!profile) {
      return res.status(404).json({
        ok: false,
        error: { code: 'PROFILE_NOT_FOUND', message: 'SSH 프로필을 찾을 수 없습니다' }
      });
    }
    res.json({ ok: true, data: { ok: true } });
  } catch (err) {
    console.error('[ssh-profiles] Delete error:', err);
    res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: '서버 오류' } });
  }
});

// POST /api/ssh-profiles/:id/browse — browse remote directories via SFTP
router.post('/:id/browse', authenticate, (req, res) => {
  const profileData = getProfileWithCredential(parseInt(req.params.id, 10), req.user.id);
  if (!profileData) {
    return res.status(404).json({
      ok: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'SSH 프로필을 찾을 수 없습니다' }
    });
  }

  const { path: remotePath } = req.body;
  const isWindows = profileData.remote_os === 'windows';

  // SFTP uses forward slashes even on Windows OpenSSH
  // Windows OpenSSH exposes drives as /C:, /D: etc at root
  let sftpPath;
  if (!remotePath) {
    sftpPath = '/';
  } else if (isWindows && /^[A-Za-z]:\\/.test(remotePath)) {
    // Convert C:\Users\... → /C:/Users/...
    sftpPath = '/' + remotePath.replace(/\\/g, '/');
  } else if (isWindows && /^[A-Za-z]:$/.test(remotePath)) {
    // Convert C: → /C:/
    sftpPath = '/' + remotePath + '/';
  } else {
    sftpPath = remotePath;
  }

  const conn = new Client();
  let responded = false;

  const timeout = setTimeout(() => {
    if (!responded) {
      responded = true;
      conn.end();
      res.status(504).json({
        ok: false,
        error: { code: 'SSH_TIMEOUT', message: '연결 시간이 초과되었습니다 (15초)' }
      });
    }
  }, 15000);

  conn.on('ready', () => {
    conn.sftp((sftpErr, sftp) => {
      if (sftpErr) {
        clearTimeout(timeout);
        if (!responded) {
          responded = true;
          conn.end();
          res.status(500).json({
            ok: false,
            error: { code: 'SFTP_ERROR', message: `SFTP 세션 실패: ${sftpErr.message}` }
          });
        }
        return;
      }

      sftp.readdir(sftpPath, (readErr, list) => {
        clearTimeout(timeout);
        conn.end();
        if (responded) return;
        responded = true;

        if (readErr) {
          return res.status(400).json({
            ok: false,
            error: { code: 'BROWSE_ERROR', message: `디렉토리를 읽을 수 없습니다: ${readErr.message}` }
          });
        }

        // Filter directories only
        let dirs = list
          .filter(item => item.attrs.isDirectory())
          .filter(item => item.filename !== '.' && item.filename !== '..')
          .map(item => {
            let dirPath;
            if (isWindows) {
              if (sftpPath === '/') {
                // Root level: items are drive letters like "C:"
                dirPath = item.filename;
              } else {
                // Convert SFTP path back to Windows path
                // /C:/Users/name → C:\Users\name\childDir
                const winBase = sftpPath.replace(/^\//, '').replace(/\//g, '\\').replace(/\\+$/, '');
                dirPath = winBase + '\\' + item.filename;
              }
            } else {
              dirPath = sftpPath === '/' ? '/' + item.filename : sftpPath.replace(/\/+$/, '') + '/' + item.filename;
            }
            return { name: item.filename, path: dirPath };
          });

        // Filter hidden dirs on unix
        if (!isWindows) {
          dirs = dirs.filter(d => !d.name.startsWith('.'));
        }

        dirs.sort((a, b) => a.name.localeCompare(b.name));

        // Build display path
        let displayPath;
        if (isWindows) {
          if (sftpPath === '/') {
            displayPath = '/';
          } else {
            displayPath = sftpPath.replace(/^\//, '').replace(/\//g, '\\').replace(/\\+$/, '');
          }
        } else {
          displayPath = sftpPath;
        }

        res.json({
          ok: true,
          data: {
            currentPath: displayPath,
            directories: dirs
          }
        });
      });
    });
  });

  conn.on('error', (err) => {
    clearTimeout(timeout);
    if (!responded) {
      responded = true;
      res.status(400).json({
        ok: false,
        error: { code: 'SSH_CONNECTION_FAILED', message: `SSH 연결 실패: ${err.message}` }
      });
    }
  });

  const connectOpts = {
    host: profileData.host,
    port: profileData.port,
    username: profileData.username,
    readyTimeout: 15000
  };

  if (profileData.auth_method === 'key') {
    connectOpts.privateKey = profileData.credential;
  } else {
    connectOpts.password = profileData.credential;
  }

  conn.connect(connectOpts);
});

// POST /api/ssh-profiles/:id/test
router.post('/:id/test', authenticate, (req, res) => {
  const profileData = getProfileWithCredential(parseInt(req.params.id, 10), req.user.id);
  if (!profileData) {
    return res.status(404).json({
      ok: false,
      error: { code: 'PROFILE_NOT_FOUND', message: 'SSH 프로필을 찾을 수 없습니다' }
    });
  }

  const conn = new Client();
  const timeout = setTimeout(() => {
    conn.end();
    res.status(504).json({
      ok: false,
      error: { code: 'SSH_TIMEOUT', message: '연결 시간이 초과되었습니다 (10초)' }
    });
  }, 10000);

  conn.on('ready', () => {
    clearTimeout(timeout);
    conn.exec('claude --version', (err, stream) => {
      if (err) {
        conn.end();
        return res.json({
          ok: true,
          data: { connected: true, claudeAvailable: false, message: 'SSH 연결 성공, claude CLI 확인 실패' }
        });
      }
      let output = '';
      stream.on('data', (data) => { output += data.toString(); });
      stream.on('close', () => {
        conn.end();
        res.json({
          ok: true,
          data: {
            connected: true,
            claudeAvailable: true,
            claudeVersion: output.trim(),
            message: `SSH 연결 성공, Claude ${output.trim()}`
          }
        });
      });
    });
  });

  conn.on('error', (err) => {
    clearTimeout(timeout);
    res.status(400).json({
      ok: false,
      error: { code: 'SSH_CONNECTION_FAILED', message: `SSH 연결 실패: ${err.message}` }
    });
  });

  const connectOpts = {
    host: profileData.host,
    port: profileData.port,
    username: profileData.username,
    readyTimeout: 10000
  };

  if (profileData.auth_method === 'key') {
    connectOpts.privateKey = profileData.credential;
  } else {
    connectOpts.password = profileData.credential;
  }

  conn.connect(connectOpts);
});

export default router;
