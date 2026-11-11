const BASE_URL = import.meta.env.VITE_API_BASE_URL !== undefined 
  ? import.meta.env.VITE_API_BASE_URL 
  : (typeof window !== 'undefined'
      ? (window.location.port === '5173'
          ? '' // Dùng proxy Vite chuyển tiếp về backend 8000
          : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ? 'http://localhost:8000' : ''))
      : 'http://localhost:8000');

function authHeaders() {
  const id = localStorage.getItem('userId');
  return id ? { 'X-User-Id': id } : {};
}

async function fetchWithTimeout(url, options, timeoutMs = 18000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

async function request(path, { method = 'GET', body, auth = false, retries = 1, timeoutMs = 30000 } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) Object.assign(headers, authHeaders());

  const fetchOptions = {
    method,
    headers,
    body: typeof body === 'string' ? body : (body ? JSON.stringify(body) : undefined),
  };

  let res = null;
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetchWithTimeout(`${BASE_URL}${path}`, fetchOptions, timeoutMs);
      if (res.ok || attempt === retries || !['GET', 'HEAD'].includes(method.toUpperCase())) {
        break;
      }
      if ([502, 503, 504].includes(res.status)) {
        await new Promise(r => setTimeout(r, 1200));
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (attempt < retries && ['GET', 'HEAD'].includes(method.toUpperCase())) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw new Error(
        err.name === 'AbortError' ? 'Kết nối máy chủ quá hạn (Timeout). Vui lòng thử lại.' : 'Mạng không ổn định hoặc máy chủ đang phản hồi chậm.',
        { cause: err }
      );
    }
  }

  if (!res) throw lastError || new Error('Không thể kết nối máy chủ.');

  let data = null;
  try { data = await res.json(); } catch { /* phản hồi rỗng */ }

  if (!res.ok) {
    let errorMsg = 'Đã có lỗi xảy ra, vui lòng thử lại.';
    if (typeof data?.detail === 'string') {
      errorMsg = data.detail;
    } else if (Array.isArray(data?.detail)) {
      errorMsg = data.detail.map(d => d.msg || (typeof d === 'string' ? d : JSON.stringify(d))).join(', ');
    } else if (data?.detail && typeof data.detail === 'object') {
      errorMsg = data.detail.msg || JSON.stringify(data.detail);
    } else if (data?.message) {
      errorMsg = data.message;
    }
    throw new Error(errorMsg);
  }
  return data;
}

const req = (path, opts = {}) => request(path, { auth: true, ...opts });

let _dashboardAllPromise = null;

export const api = {
  register: (payload) => request('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => request('/api/auth/login', { method: 'POST', body: payload }),

  createPost: (noi_dung_tho) => request('/api/posts', { method: 'POST', body: { noi_dung_tho }, auth: true }),
  listPosts: () => request('/api/posts', { auth: true }),
  updatePost: (id, noi_dung_tho) => request(`/api/posts/${id}`, { method: 'PUT', body: { noi_dung_tho }, auth: true }),
  deletePost: (id) => request(`/api/posts/${id}`, { method: 'DELETE', auth: true }),
  retryPost: (id) => request(`/api/posts/${id}/retry`, { method: 'POST', auth: true, timeoutMs: 60000 }),
  processNow: () => request('/api/posts/process-now', { method: 'POST', auth: true, timeoutMs: 60000 }),
  retryAllPosts: () => request('/api/posts/retry-all', { method: 'POST', auth: true, timeoutMs: 60000 }),
  retryFailedPosts: () => request('/api/posts/retry-all', { method: 'POST', auth: true, timeoutMs: 60000 }),
  reindexIds: () => request('/api/posts/reindex-ids', { method: 'POST', auth: true }),

  runMatching: () => request('/api/matching/run', { method: 'POST', auth: true }),
  dashboardAll: () => {
    if (!_dashboardAllPromise) {
      _dashboardAllPromise = request('/api/dashboard/all', { auth: true })
        .finally(() => {
          setTimeout(() => { _dashboardAllPromise = null; }, 1500);
        });
    }
    return _dashboardAllPromise;
  },
  stats: () => request('/api/stats', { auth: true }),
  locationStats: () => request('/api/stats/locations', { auth: true }),
  crawlerStatus: () => request('/api/crawler/status', { auth: true }),
  crawlerAction: (platform, action) => {
    let path;
    if (platform === 'all') {
      path = action === 'start' ? '/api/crawler/start-all' : '/api/crawler/stop-all';
    } else if (platform === 'facebook') {
      path = action === 'start' ? '/api/crawler/start' : '/api/crawler/stop';
    } else {
      path = `/api/crawler/${platform}/${action}`;
    }
    return request(path, { method: 'POST', auth: true });
  },

  createTrip: (payload) => request('/api/trips', { method: 'POST', body: payload, auth: true }),
  listTrips: (mine = false) => request(`/api/trips${mine ? '?mine=1' : ''}`, { auth: true }),
  searchTrips: (payload) => request('/api/trips/search', { method: 'POST', body: payload, auth: true }),
  updateTripStatus: (tripId, data) => req(`/api/trips/${tripId}/status`, { method: 'PUT', body: JSON.stringify(data) }),

  createRequest: (payload) => request('/api/requests', { method: 'POST', body: payload, auth: true }),
  listRequests: (mine = false) => request(`/api/requests${mine ? '?mine=1' : ''}`, { auth: true }),
  cancelRequest: (requestId) => request(`/api/requests/${requestId}/cancel`, { method: 'POST', auth: true }),
  acceptRequest: (requestId, payload = {}) => request(`/api/requests/${requestId}/accept`, { method: 'POST', body: payload, auth: true }),
  reclassifyRequests: () => request('/api/admin/reclassify-requests', { method: 'POST', auth: true }),

  joinTrip: (tripId, payload) => request(`/api/trips/${tripId}/join`, { method: 'POST', body: payload, auth: true }),
  completeMatch: (matchId) => request(`/api/matches/${matchId}/complete`, { method: 'POST', auth: true }),
  cancelMatch: (matchId) => request(`/api/matches/${matchId}/cancel`, { method: 'POST', auth: true }),
  reviewMatch: (matchId, data) => request(`/api/matches/${matchId}/review`, { method: 'POST', body: data, auth: true }),
  getDriverRating: (driverId) => request(`/api/drivers/${driverId}/rating`, { auth: true }),

  listMatches: (mine = false) => request(`/api/matches${mine ? '?mine=1' : ''}`, { auth: true }),

  adminListUsers: (params) => req('/api/admin/users' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  adminCreateUser: (data) => req('/api/admin/users', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateUser: (userId, data) => req('/api/admin/users/' + userId, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteUser: (userId) => req('/api/admin/users/' + userId, { method: 'DELETE' }),
  adminUpdateTripStatus: (tripId, data) => req(`/api/admin/trips/${tripId}/status`, { method: 'PUT', body: data }),
  adminUpdateRequestStatus: (requestId, data) => req(`/api/admin/requests/${requestId}/status`, { method: 'PUT', body: data }),
  getProfile: () => req('/api/user/profile'),
  updateProfile: (data) => req('/api/user/profile', { method: 'PUT', body: JSON.stringify(data) }),
};

export function saveSession({ id, hoTen, role, sdt, avatar_url }) {
  localStorage.setItem('userId', id);
  localStorage.setItem('userName', hoTen);
  localStorage.setItem('userRole', role);
  if (sdt) {
    localStorage.setItem('userSdt', sdt);
  } else {
    localStorage.removeItem('userSdt');
  }
  if (avatar_url) {
    localStorage.setItem('userAvatar', avatar_url);
  } else if (avatar_url === '') {
    localStorage.removeItem('userAvatar');
  }
}

export function clearSession() {
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  localStorage.removeItem('userRole');
  localStorage.removeItem('userSdt');
  localStorage.removeItem('userAvatar');
  localStorage.removeItem('xeghep_role_mode');
}

export function getSession() {
  return {
    id: localStorage.getItem('userId'),
    hoTen: localStorage.getItem('userName') || 'Người dùng',
    role: localStorage.getItem('userRole') || 'passenger',
    sdt: localStorage.getItem('userSdt') || '',
    avatarUrl: localStorage.getItem('userAvatar') || '',
  };
}
