import { spawn, execSync } from 'child_process';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// webSessionId -> { claudeSessionId, activeProcess, mountPoint, sshfsProcess }
const sessions = new Map();

const MOUNT_BASE = resolve(process.env.SSHFS_MOUNT_BASE || '/tmp/claude-sshfs');

function checkBusy(webSessionId) {
  const entry = sessions.get(webSessionId);
  if (entry?.activeProcess) {
    const err = new Error('이전 응답이 완료되지 않았습니다');
    err.code = 'PROCESS_BUSY';
    throw err;
  }
}

function buildArgs(message, claudeSessionId) {
  const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--dangerously-skip-permissions'];
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }
  return args;
}

function trackProcess(webSessionId, proc, claudeSessionId) {
  const existing = sessions.get(webSessionId);
  const mountPoint = existing?.mountPoint || null;
  const sshfsProcess = existing?.sshfsProcess || null;
  sessions.set(webSessionId, { claudeSessionId, activeProcess: proc, mountPoint, sshfsProcess });

  proc.on('close', () => {
    const s = sessions.get(webSessionId);
    if (s) s.activeProcess = null;
  });

  proc.on('error', (err) => {
    console.error(`[process] error for session ${webSessionId}:`, err.message);
    const s = sessions.get(webSessionId);
    if (s) s.activeProcess = null;
  });
}

function shellEscape(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

/**
 * Check if a path is currently a mountpoint by reading /proc/mounts.
 */
function isMounted(mountPath) {
  try {
    const mounts = execSync('cat /proc/mounts', { timeout: 2000, stdio: 'pipe' }).toString();
    return mounts.includes(mountPath);
  } catch {
    return false;
  }
}

/**
 * Force unmount without accessing the mount point.
 */
function forceUnmount(mountPath) {
  try {
    execSync(`fusermount -uz ${shellEscape(mountPath)}`, { timeout: 5000, stdio: 'pipe' });
  } catch {}
  try {
    execSync(`rm -rf ${shellEscape(mountPath)}`, { timeout: 5000, stdio: 'pipe' });
  } catch {}
}

/**
 * Mount remote filesystem via SSHFS using foreground mode (-f).
 * sshfs runs as a child process managed by Node, not as a daemon.
 * Returns a Promise that resolves with the mount path once verified.
 */
function ensureSSHFSMount(webSessionId, remotePath, sshConfig) {
  const existing = sessions.get(webSessionId);

  // If already mounted, reuse
  if (existing?.sshfsProcess && !existing.sshfsProcess.killed && isMounted(existing.mountPoint)) {
    try {
      execSync(`ls ${shellEscape(existing.mountPoint)} > /dev/null 2>&1`, { timeout: 3000 });
      console.log(`[sshfs] Reusing existing mount: ${existing.mountPoint}`);
      return existing.mountPoint;
    } catch {
      console.log(`[sshfs] Stale mount, remounting`);
      killSshfs(webSessionId);
    }
  } else if (existing?.sshfsProcess) {
    killSshfs(webSessionId);
  }

  const mountPoint = resolve(MOUNT_BASE, String(webSessionId));

  if (isMounted(mountPoint)) {
    forceUnmount(mountPoint);
  } else if (existsSync(mountPoint)) {
    try { execSync(`rm -rf ${shellEscape(mountPoint)}`, { timeout: 5000, stdio: 'pipe' }); } catch {}
  }

  mkdirSync(mountPoint, { recursive: true });

  // Convert Windows path to SFTP format
  let sftpRemotePath = remotePath;
  if (sshConfig.remoteOs === 'windows' && /^[A-Za-z]:/.test(remotePath)) {
    sftpRemotePath = '/' + remotePath.replace(/\\/g, '/');
  }

  const remote = `${sshConfig.username}@${sshConfig.host}:${sftpRemotePath}`;

  // Write credential to temp file
  const credPath = resolve(MOUNT_BASE, `cred_${webSessionId}`);
  writeFileSync(credPath, sshConfig.credential, { mode: 0o600 });

  // Build sshfs args with -f (foreground mode — keeps sshfs as a child process)
  const sshfsArgs = [
    '-f',  // foreground — critical! prevents daemon fork issues
    remote, mountPoint,
    '-p', String(sshConfig.port),
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=/dev/null',
    '-o', 'cache=no'
  ];

  if (sshConfig.authMethod === 'key') {
    sshfsArgs.push('-o', `IdentityFile=${credPath}`);
  }

  const sshfsCmd = sshConfig.authMethod === 'password' ? 'sshpass' : 'sshfs';
  const sshfsFinalArgs = sshConfig.authMethod === 'password'
    ? ['-f', credPath, 'sshfs', ...sshfsArgs]
    : sshfsArgs;

  console.log(`[sshfs] Mounting ${remote} → ${mountPoint} (foreground mode)`);

  const sshfsProc = spawn(sshfsCmd, sshfsFinalArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  sshfsProc.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[sshfs:${webSessionId}] ${msg}`);
  });

  sshfsProc.on('close', (code) => {
    console.log(`[sshfs] Process exited for session ${webSessionId} (code: ${code})`);
    const s = sessions.get(webSessionId);
    if (s) {
      s.sshfsProcess = null;
      s.mountPoint = null;
    }
  });

  // Store sshfs process
  const entry = sessions.get(webSessionId) || { claudeSessionId: null, activeProcess: null, mountPoint: null, sshfsProcess: null };
  entry.mountPoint = mountPoint;
  entry.sshfsProcess = sshfsProc;
  sessions.set(webSessionId, entry);

  // Wait for mount to appear in /proc/mounts
  const startTime = Date.now();
  const maxWait = 10000; // 10 seconds max
  while (Date.now() - startTime < maxWait) {
    if (isMounted(mountPoint)) {
      try {
        execSync(`ls ${shellEscape(mountPoint)} > /dev/null 2>&1`, { timeout: 3000 });
        console.log(`[sshfs] Mounted and verified: ${mountPoint}`);
        return mountPoint;
      } catch {}
    }
    execSync('sleep 0.5');
  }

  // Failed
  killSshfs(webSessionId);
  const error = new Error('원격 파일시스템 마운트 실패: 마운트 대기 시간 초과');
  error.code = 'SSHFS_MOUNT_FAILED';
  throw error;
}

/**
 * Kill sshfs process and unmount.
 */
function killSshfs(webSessionId) {
  const entry = sessions.get(webSessionId);
  if (!entry) return;

  if (entry.sshfsProcess && !entry.sshfsProcess.killed) {
    entry.sshfsProcess.kill('SIGTERM');
    entry.sshfsProcess = null;
  }

  if (entry.mountPoint) {
    forceUnmount(entry.mountPoint);
    entry.mountPoint = null;
  }

  const credPath = resolve(MOUNT_BASE, `cred_${webSessionId}`);
  try { rmSync(credPath, { force: true }); } catch {}
}

/**
 * Send a message to Claude Code CLI locally.
 */
export function sendMessage(webSessionId, message, cwd, claudeSessionId) {
  checkBusy(webSessionId);

  const args = buildArgs(message, claudeSessionId);
  const proc = spawn('claude', args, {
    cwd,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  trackProcess(webSessionId, proc, claudeSessionId);
  return proc;
}

/**
 * Send a message to Claude Code CLI with remote filesystem via SSHFS.
 * Claude runs LOCALLY on the server, working on SSHFS-mounted remote directory.
 */
export function sendMessageSSH(webSessionId, message, remotePath, claudeSessionId, sshConfig) {
  checkBusy(webSessionId);

  const mountPoint = ensureSSHFSMount(webSessionId, remotePath, sshConfig);

  if (!isMounted(mountPoint)) {
    const error = new Error('원격 파일시스템 연결이 끊어졌습니다. 다시 시도해주세요.');
    error.code = 'SSHFS_DISCONNECTED';
    throw error;
  }

  const args = buildArgs(message, claudeSessionId);
  console.log(`[ssh] Running local claude in SSHFS mount: ${mountPoint}`);

  const proc = spawn('claude', args, {
    cwd: mountPoint,
    env: { ...process.env, TERM: 'dumb' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  trackProcess(webSessionId, proc, claudeSessionId);
  return proc;
}

export function getClaudeSessionId(webSessionId) {
  return sessions.get(webSessionId)?.claudeSessionId || null;
}

export function setClaudeSessionId(webSessionId, id) {
  const entry = sessions.get(webSessionId);
  if (entry) {
    entry.claudeSessionId = id;
  } else {
    sessions.set(webSessionId, { claudeSessionId: id, activeProcess: null, mountPoint: null, sshfsProcess: null });
  }
}

export function isProcessBusy(webSessionId) {
  return !!sessions.get(webSessionId)?.activeProcess;
}

export function cancelProcess(webSessionId) {
  const entry = sessions.get(webSessionId);
  if (entry?.activeProcess) {
    entry.activeProcess.kill('SIGTERM');
    entry.activeProcess = null;
    return true;
  }
  return false;
}

export function cleanupSession(webSessionId) {
  cancelProcess(webSessionId);
  killSshfs(webSessionId);
  sessions.delete(webSessionId);
}

/**
 * Cleanup all SSHFS mounts on shutdown/startup.
 */
export function cleanupAllMounts() {
  // Kill all sshfs child processes
  for (const [id] of sessions) {
    killSshfs(id);
  }
  // Also unmount anything left from previous runs
  try {
    const mounts = execSync('cat /proc/mounts', { timeout: 2000, stdio: 'pipe' }).toString();
    const ourMounts = mounts.split('\n')
      .filter(line => line.includes(MOUNT_BASE))
      .map(line => line.split(' ')[1]);
    for (const mp of ourMounts) {
      forceUnmount(mp);
    }
  } catch {}
  // Kill any orphan sshfs processes pointing to our mount base
  try {
    execSync(`pkill -f 'sshfs.*${MOUNT_BASE}'`, { timeout: 3000, stdio: 'pipe' });
  } catch {}

  for (const [, entry] of sessions) {
    if (entry) {
      entry.mountPoint = null;
      entry.sshfsProcess = null;
    }
  }
  console.log('[sshfs] All mounts cleaned up');
}
