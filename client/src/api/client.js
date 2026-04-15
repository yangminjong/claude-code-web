const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token');
}

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  const data = await res.json();
  if (!data.ok) {
    const err = new Error(data.error?.message || 'Request failed');
    err.code = data.error?.code;
    err.status = res.status;
    throw err;
  }
  return data.data;
}

export const api = {
  // Auth
  register: (body) => request('POST', '/auth/register', body),
  verifyEmail: (body) => request('POST', '/auth/verify-email', body),
  resendVerification: (body) => request('POST', '/auth/resend-verification', body),
  login: (body) => request('POST', '/auth/login', body),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),
  changePassword: (body) => request('PUT', '/auth/password', body),
  updateTheme: (body) => request('PUT', '/auth/theme', body),
  uploadAvatar: async (file) => {
    const form = new FormData();
    form.append('avatar', file);
    const token = getToken();
    const res = await fetch(`${API_BASE}/auth/avatar`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.error?.message || 'Upload failed');
      err.code = data.error?.code;
      throw err;
    }
    return data.data;
  },
  deleteAvatar: () => request('DELETE', '/auth/avatar'),

  // Sessions
  getSessions: () => request('GET', '/sessions'),
  createSession: (body) => request('POST', '/sessions', body),
  getSession: (id) => request('GET', `/sessions/${id}`),
  deleteSession: (id) => request('DELETE', `/sessions/${id}`),
  renameSession: (id, name) => request('PATCH', `/sessions/${id}/name`, { name }),
  syncCliSessions: () => request('POST', '/sessions/sync-cli'),
  getSessionMetadata: (id) => request('GET', `/sessions/${id}/metadata`),
  deleteSessionPermanently: (id) => request('DELETE', `/sessions/${id}/permanent`),
  forkSession: (id, afterSeq, restoreCode = false) =>
    request('POST', `/sessions/${id}/fork`, { afterSeq, restoreCode }),
  getSiblings: (id) => request('GET', `/sessions/${id}/siblings`),
  getBranchTree: (id) => request('GET', `/sessions/${id}/branch-tree`),
  getMessages: (id, page = 1, limit = 50) =>
    request('GET', `/sessions/${id}/messages?page=${page}&limit=${limit}`),
  getMessageTree: (id) => request('GET', `/sessions/${id}/messages/tree`),
  getActivePath: (id) => request('GET', `/sessions/${id}/messages/active-path`),
  setBranch: (id, parentMessageId, branchIndex) =>
    request('PUT', `/sessions/${id}/branches`, { parentMessageId, branchIndex }),
  getMessageChildren: (sessionId, msgId) =>
    request('GET', `/sessions/${sessionId}/messages/${msgId}/children`),

  // Files
  listFiles: (path = '.') => request('GET', `/files?path=${encodeURIComponent(path)}`),
  createFile: (path) => request('POST', '/files/create', { path }),
  createDir: (path) => request('POST', '/files/mkdir', { path }),
  renameFile: (oldPath, newPath) => request('POST', '/files/rename', { oldPath, newPath }),
  deleteFile: (path) => request('DELETE', `/files?path=${encodeURIComponent(path)}`),
  readFileContent: (path) => request('GET', `/files/read?path=${encodeURIComponent(path)}`),
  writeFileContent: (path, content) => request('PUT', '/files/write', { path, content }),
  uploadFile: async (file, path = '.') => {
    const form = new FormData();
    form.append('file', file);
    form.append('path', path);

    const token = getToken();
    const res = await fetch(`${API_BASE}/files/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form
    });
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.error?.message || 'Upload failed');
      err.code = data.error?.code;
      throw err;
    }
    return data.data;
  },
  downloadFile: async (path) => {
    const token = getToken();
    const url = `${API_BASE}/files/download?path=${encodeURIComponent(path)}`;
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      let msg = 'Download failed';
      try { const data = await res.json(); msg = data.error?.message || msg; } catch {}
      throw new Error(msg);
    }
    return res.blob();
  },

  // SSH Profiles
  getSshProfiles: () => request('GET', '/ssh-profiles'),
  createSshProfile: (body) => request('POST', '/ssh-profiles', body),
  getSshProfile: (id) => request('GET', `/ssh-profiles/${id}`),
  updateSshProfile: (id, body) => request('PUT', `/ssh-profiles/${id}`, body),
  deleteSshProfile: (id) => request('DELETE', `/ssh-profiles/${id}`),
  testSshProfile: (id) => request('POST', `/ssh-profiles/${id}/test`),
  browseSshProfile: (id, path) => request('POST', `/ssh-profiles/${id}/browse`, { path }),

  // Logs
  getLogs: (page = 1, limit = 50, action) => {
    let url = `/logs?page=${page}&limit=${limit}`;
    if (action) url += `&action=${action}`;
    return request('GET', url);
  }
};
