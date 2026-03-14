import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Client as SSHClient } from 'ssh2';

// webSessionId -> { claudeSessionId, activeProcess, sshConnection }
const sessions = new Map();

function checkBusy(webSessionId) {
  const entry = sessions.get(webSessionId);
  if (entry?.activeProcess) {
    const err = new Error('이전 응답이 완료되지 않았습니다');
    err.code = 'PROCESS_BUSY';
    throw err;
  }
}

function buildArgs(message, claudeSessionId) {
  const args = ['-p', message, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
  if (claudeSessionId) {
    args.push('--resume', claudeSessionId);
  }
  return args;
}

function trackProcess(webSessionId, proc, claudeSessionId, sshConnection = null) {
  sessions.set(webSessionId, { claudeSessionId, activeProcess: proc, sshConnection });

  proc.on('close', () => {
    const s = sessions.get(webSessionId);
    if (s) {
      s.activeProcess = null;
      if (s.sshConnection) {
        s.sshConnection.end();
        s.sshConnection = null;
      }
    }
  });

  proc.on('error', (err) => {
    console.error(`[process] error for session ${webSessionId}:`, err.message);
    const s = sessions.get(webSessionId);
    if (s) {
      s.activeProcess = null;
      if (s.sshConnection) {
        s.sshConnection.end();
        s.sshConnection = null;
      }
    }
  });
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
 * Wrapper that mimics ChildProcess interface for SSH command execution.
 */
class SSHProcessWrapper extends EventEmitter {
  constructor() {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this._killed = false;
  }

  kill() {
    this._killed = true;
    this.emit('close', 1);
  }
}

function shellEscapeUnix(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function shellEscapeWindows(s) {
  // cmd.exe: wrap in double quotes, escape inner double quotes with \"
  return '"' + s.replace(/"/g, '\\"') + '"';
}

function buildRemoteCmd(args, remotePath, remoteOs) {
  if (remoteOs === 'windows') {
    const escaped = args.map(a => shellEscapeWindows(a)).join(' ');
    return `cd /d ${shellEscapeWindows(remotePath)} && claude ${escaped}`;
  }
  const escaped = args.map(a => shellEscapeUnix(a)).join(' ');
  return `cd ${shellEscapeUnix(remotePath)} && claude ${escaped}`;
}

/**
 * Send a message to Claude Code CLI on a remote server via SSH.
 */
export function sendMessageSSH(webSessionId, message, remotePath, claudeSessionId, sshConfig) {
  checkBusy(webSessionId);

  const wrapper = new SSHProcessWrapper();
  const conn = new SSHClient();

  const args = buildArgs(message, claudeSessionId);
  const remoteCmd = buildRemoteCmd(args, remotePath, sshConfig.remoteOs || 'linux');

  conn.on('ready', () => {
    conn.exec(remoteCmd, (err, stream) => {
      if (err) {
        wrapper.emit('error', err);
        conn.end();
        return;
      }

      stream.on('data', (data) => {
        wrapper.stdout.emit('data', data);
      });

      stream.stderr.on('data', (data) => {
        wrapper.stderr.emit('data', data);
      });

      stream.on('close', (code) => {
        wrapper.emit('close', code);
        conn.end();
      });
    });
  });

  conn.on('error', (err) => {
    wrapper.emit('error', err);
  });

  const connectOpts = {
    host: sshConfig.host,
    port: sshConfig.port,
    username: sshConfig.username,
    readyTimeout: 10000
  };

  if (sshConfig.authMethod === 'key') {
    connectOpts.privateKey = sshConfig.credential;
  } else {
    connectOpts.password = sshConfig.credential;
  }

  conn.connect(connectOpts);

  trackProcess(webSessionId, wrapper, claudeSessionId, conn);
  return wrapper;
}

export function getClaudeSessionId(webSessionId) {
  return sessions.get(webSessionId)?.claudeSessionId || null;
}

export function setClaudeSessionId(webSessionId, id) {
  const entry = sessions.get(webSessionId);
  if (entry) {
    entry.claudeSessionId = id;
  } else {
    sessions.set(webSessionId, { claudeSessionId: id, activeProcess: null, sshConnection: null });
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
    if (entry.sshConnection) {
      entry.sshConnection.end();
      entry.sshConnection = null;
    }
    return true;
  }
  return false;
}

export function cleanupSession(webSessionId) {
  cancelProcess(webSessionId);
  sessions.delete(webSessionId);
}
