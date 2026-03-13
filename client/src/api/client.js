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
  login: (body) => request('POST', '/auth/login', body),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/auth/me'),
  changePassword: (body) => request('PUT', '/auth/password', body),

  // Sessions
  getSessions: () => request('GET', '/sessions'),
  createSession: (body) => request('POST', '/sessions', body),
  getSession: (id) => request('GET', `/sessions/${id}`),
  deleteSession: (id) => request('DELETE', `/sessions/${id}`),
  getMessages: (id, page = 1, limit = 50) =>
    request('GET', `/sessions/${id}/messages?page=${page}&limit=${limit}`),

  // Files
  listFiles: (path = '.') => request('GET', `/files?path=${encodeURIComponent(path)}`),
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
  downloadFile: (path) => {
    const token = getToken();
    const url = `${API_BASE}/files/download?path=${encodeURIComponent(path)}`;
    // Return a URL with auth for download
    return fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    }).then(res => res.blob());
  },

  // Logs
  getLogs: (page = 1, limit = 50, action) => {
    let url = `/logs?page=${page}&limit=${limit}`;
    if (action) url += `&action=${action}`;
    return request('GET', url);
  }
};
