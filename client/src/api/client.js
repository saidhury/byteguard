/**
 * ByteGuard API Client — communicates with Flask backend.
 * Handles JWT auth, JSON requests, and multipart file uploads.
 */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('bg_token');
}

function setToken(token) {
  localStorage.setItem('bg_token', token);
}

function clearToken() {
  localStorage.removeItem('bg_token');
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (!options._multipart) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Session expired');
  }

  // For binary downloads
  if (options._binary) {
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Request failed');
    }
    return res;
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  getToken,
  setToken,
  clearToken,

  // ── Auth ───────────────────────────────────────
  register: (researcherId, password, kyberPublicKey) =>
    request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ researcherId, password, kyberPublicKey })
    }),

  login: (researcherId, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ researcherId, password })
    }),

  logout: () =>
    request('/auth/logout', { method: 'POST' }),

  getSession: () =>
    request('/auth/session'),

  updateKyberKey: (kyberPublicKey) =>
    request('/auth/kyber-key', {
      method: 'PUT',
      body: JSON.stringify({ kyberPublicKey })
    }),

  searchUsers: (q) =>
    request(`/auth/search?q=${encodeURIComponent(q)}`),

  getPublicKey: (researcherId) =>
    request(`/auth/pubkey/${encodeURIComponent(researcherId)}`),

  // ── Files ──────────────────────────────────────
  uploadFile: (formData) =>
    request('/files/upload', {
      method: 'POST',
      body: formData,
      _multipart: true,
    }),

  downloadFile: (fileId) =>
    request(`/files/download/${fileId}`, { _binary: true }),

  viewFile: (fileId) =>
    request(`/files/view/${fileId}`, { _binary: true }),

  getFileMeta: (fileId) =>
    request(`/files/${fileId}/meta`),

  myFiles: () =>
    request('/files/my-files'),

  // ── Sharing ────────────────────────────────────
  shareFile: (data) =>
    request('/files/share', { method: 'POST', body: JSON.stringify(data) }),

  getShared: () => request('/files/shared'),

  getReceived: () => request('/files/received'),

  getShareByCode: (shareCode) =>
    request(`/files/share/${shareCode}`),

  revokeShare: (id) =>
    request(`/files/shared/${id}`, { method: 'DELETE' }),

  // ── History ────────────────────────────────────
  getHistory: () => request('/files/history'),

  addHistory: (entry) =>
    request('/files/history', { method: 'POST', body: JSON.stringify(entry) }),

  deleteHistory: (id) =>
    request(`/files/history/${id}`, { method: 'DELETE' }),

  clearHistory: () =>
    request('/files/history', { method: 'DELETE' }),

  // ── Settings ───────────────────────────────────
  getSettings: () => request('/settings/'),

  updateSettings: (settings) =>
    request('/settings/', { method: 'PUT', body: JSON.stringify(settings) }),

  // ── Groups ─────────────────────────────────────
  listGroups: () => request('/groups/'),

  createGroup: (name, description) =>
    request('/groups/create', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    }),

  getGroup: (groupId) =>
    request(`/groups/${groupId}`),

  deleteGroup: (groupId) =>
    request(`/groups/${groupId}`, { method: 'DELETE' }),

  addGroupMember: (groupId, researcherId, role = 'member') =>
    request(`/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ researcherId, role })
    }),

  removeGroupMember: (groupId, userId) =>
    request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),

  getGroupPubkeys: (groupId) =>
    request(`/groups/${groupId}/pubkeys`),

  shareFileWithGroup: (groupId, fileId, kemCiphertexts) =>
    request(`/groups/${groupId}/share-file`, {
      method: 'POST',
      body: JSON.stringify({ fileId, kemCiphertexts })
    }),

  listGroupSharedFiles: () =>
    request('/groups/shared-files'),
};

export default api;
