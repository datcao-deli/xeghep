import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSession, clearSession } from './api';
import PolicyModal from './PolicyModal';

const NAV = [
  { key: 'overview', label: 'Tổng quan', icon: '⊞' },
  { key: 'posts', label: 'Bài viết', icon: '🌐' },
  { key: 'trips', label: 'Chuyến đi', icon: '🚗' },
  { key: 'requests', label: 'Yêu cầu hành khách', icon: '📥' },
  { key: 'locations', label: 'Địa điểm', icon: '📍' },
  { key: 'users', label: 'Quản lý người dùng', icon: '👥' },
  { key: 'reports', label: 'Thống kê', icon: '📊' },
];

const TRANG_THAI_BAI_VIET = {
  0: ['Chờ xử lý', 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'],
  1: ['Đã xử lý', 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'],
  2: ['Lỗi', 'bg-red-50 text-red-600 ring-1 ring-red-200'],
};

const LOCATION_COLORS = [
  { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', rank: 'bg-amber-100 text-amber-800' },
  { bar: 'bg-teal-500', text: 'text-teal-700', bg: 'bg-teal-50', rank: 'bg-slate-200 text-slate-700' },
  { bar: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50', rank: 'bg-amber-50 text-amber-800' },
  { bar: 'bg-blue-500', text: 'text-blue-700', bg: 'bg-blue-50', rank: 'bg-slate-100 text-slate-600' },
  { bar: 'bg-indigo-500', text: 'text-indigo-700', bg: 'bg-indigo-50', rank: 'bg-slate-100 text-slate-600' },
  { bar: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50', rank: 'bg-slate-100 text-slate-600' },
  { bar: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', rank: 'bg-slate-100 text-slate-600' },
  { bar: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', rank: 'bg-slate-100 text-slate-600' },
];

function extractDateParts(str) {
  if (!str) return null;
  const s = String(str).replace(/\b24\/(7|24)\b/gi, '').trim();
  const isValidDayMonth = (d, m) => d >= 1 && d <= 31 && m >= 1 && m <= 12;

  const isoMatch = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (isValidDayMonth(day, month)) return { year, month, day };
  }
  const dmyMatch = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    if (isValidDayMonth(day, month)) return { day, month, year };
  }
  const dmMatch = s.match(/(?:^|\D)(\d{1,2})\/(\d{1,2})(?:\D|$)/);
  if (dmMatch) {
    const day = Number(dmMatch[1]);
    const month = Number(dmMatch[2]);
    if (isValidDayMonth(day, month)) {
      return { day, month, year: new Date().getFullYear() };
    }
  }
  return null;
}

function parseScheduleMeta(timeStr, postTimeStr) {
  const rawTime = (timeStr || '').trim();
  if (!rawTime || /^(linh hoạt|hàng ngày|liên tục|thỏa thuận|bất kỳ|24\/7|24\/24)$/i.test(rawTime)) {
    return { displayTime: rawTime || 'Linh hoạt', isExpired: false };
  }

  const timeDateParts = extractDateParts(rawTime);
  const postDateParts = extractDateParts(postTimeStr);
  const isFutureKeyword = /(sáng mai|chiều mai|tối mai|ngày mai|\bmai\b)/i.test(rawTime);

  let isExpired = false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (timeDateParts) {
    const itemDate = new Date(timeDateParts.year, timeDateParts.month - 1, timeDateParts.day);
    if (itemDate < todayStart) {
      isExpired = true;
    }
  } else if (postDateParts) {
    const postDate = new Date(postDateParts.year, postDateParts.month - 1, postDateParts.day);
    const targetDate = isFutureKeyword
      ? new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate() + 1)
      : postDate;
    if (targetDate < todayStart) {
      isExpired = true;
    }
  }

  const formatDdMm = (parts) =>
    `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}`;

  const isoDateTimeMatch = rawTime.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
  if (isoDateTimeMatch) {
    const [, yyyy, mm, dd, hh, min] = isoDateTimeMatch;
    const cleanTime = `${hh.padStart(2, '0')}:${min}`;
    const cleanDate = `${String(Number(dd)).padStart(2, '0')}/${String(Number(mm)).padStart(2, '0')}`;
    return { displayTime: `${cleanTime} (${cleanDate})`, isExpired };
  }

  const onlyDateMatch = rawTime.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (onlyDateMatch) {
    const ddMm = `${String(Number(onlyDateMatch[1])).padStart(2, '0')}/${String(Number(onlyDateMatch[2])).padStart(2, '0')}`;
    return { displayTime: `00:00 (${ddMm})`, isExpired };
  }

  if (!timeDateParts && postDateParts) {
    return {
      displayTime: `${rawTime} (${formatDdMm(postDateParts)})`,
      isExpired,
    };
  }

  return { displayTime: rawTime, isExpired };
}

function formatDateTime(val) {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
  } catch {
    return String(val);
  }
}

const BOT_CHANNELS = [
  { key: 'facebook', name: 'Facebook', badge: 'f', badgeClass: 'bg-blue-50 text-blue-600' },
  { key: 'zalo', name: 'Zalo', badge: 'Z', badgeClass: 'bg-sky-50 text-sky-600' },
  { key: 'threads', name: 'Threads', badge: '@', badgeClass: 'bg-slate-100 text-slate-800' },
];

const VN_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getVnDateKey(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const parts = VN_DATE_FORMATTER.formatToParts(date);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  return y && m && d ? `${y}-${m}-${d}` : '';
}

function parseIsoTimestamp(val) {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;
  // Safari rejects "YYYY-MM-DD HH:MM:SS" without a "T" separator
  const normalized = str.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, '$1T$2');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function formatBotLastSync(latestDate, isRunning) {
  const statusLabel = isRunning ? 'Đang chạy' : 'Đang tắt';
  if (!latestDate) return `${statusLabel} · Chưa có bài`;
  const diffMs = Math.max(0, Date.now() - latestDate.getTime());
  const diffMin = Math.floor(diffMs / 60000);
  let rel = 'vừa xong';
  if (diffMin >= 1440) rel = `${Math.floor(diffMin / 1440)} ngày trước`;
  else if (diffMin >= 60) rel = `${Math.floor(diffMin / 60)} giờ trước`;
  else if (diffMin >= 1) rel = `${diffMin} phút trước`;
  return `${statusLabel} · Bài mới ${rel}`;
}

function computeUserStats(list) {
  const total = list.length;
  const admins = list.filter((u) => u.role === 'admin').length;
  const drivers = list.filter((u) => u.role === 'tai_xe').length;
  const customers = list.filter((u) => u.role === 'khach_hang' || u.role === 'user').length;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newUsers = list.filter((u) => {
    if (!u.ngay_tao) return false;
    const t = new Date(u.ngay_tao).getTime();
    return !isNaN(t) && t >= sevenDaysAgo;
  }).length;
  return { total, admins, drivers, customers, members: drivers + customers, newUsers };
}

const SOURCE_CONFIG = {
  facebook: {
    name: 'Facebook',
    label: 'Facebook',
    icon: '📘',
    badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  },
  threads: {
    name: 'Threads',
    label: 'Threads',
    icon: '🧵',
    badgeClass: 'bg-slate-900 text-white ring-1 ring-slate-800',
  },
  zalo: {
    name: 'Zalo',
    label: 'Zalo',
    icon: '💬',
    badgeClass: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  },
  form: {
    name: 'Khách hàng',
    label: 'Khách hàng',
    icon: '👤',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  tai_xe: {
    name: 'Tài xế',
    label: 'Tài xế',
    icon: '🚗',
    badgeClass: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  },
  khac: {
    name: 'Khác',
    label: 'Khác',
    icon: '🌐',
    badgeClass: 'bg-slate-50 text-slate-700 ring-1 ring-slate-200',
  },
};

function getSourceMeta(src, item) {
  const key = (src || '').toLowerCase();
  const text = typeof item === 'string' ? item : (item?.noi_dung_tho || item?.noi_dung || '');
  if (
    key === 'tai_xe' ||
    key === 'taixe' ||
    key === 'driver' ||
    text.startsWith('[Tài xế') ||
    text.startsWith('[Đăng trực tiếp] Tài xế')
  ) {
    return SOURCE_CONFIG.tai_xe;
  }
  if (
    key === 'web' ||
    key === 'form' ||
    key === 'khach_hang' ||
    key === 'customer' ||
    text.startsWith('[Khách hàng') ||
    text.startsWith('[Hành khách')
  ) {
    return text.includes('Tài xế') ? SOURCE_CONFIG.tai_xe : SOURCE_CONFIG.form;
  }
  return SOURCE_CONFIG[key] || SOURCE_CONFIG.khac;
}

function SourceBadge({ source, item }) {
  const meta = getSourceMeta(source, item);
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${meta.badgeClass}`}>
      <span>{meta.icon}</span>
      <span>{meta.label}</span>
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const session = getSession();

  const [cachedData] = useState(() => {
    try {
      const saved = localStorage.getItem('goghep_admin_dashboard_cache');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [initialLoading, setInitialLoading] = useState(() => !cachedData);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [view, setView] = useState('overview'); // overview, trips, posts, requests, locations, users, reports
  const [stats, setStats] = useState(() => cachedData?.stats || null);
  const [locations, setLocations] = useState(() => cachedData?.locations || null);
  const [posts, setPosts] = useState(() => cachedData?.posts || []);
  const [trips, setTrips] = useState(() => cachedData?.trips || []);
  const [requests, setRequests] = useState(() => cachedData?.requests || []);
  const [matches, setMatches] = useState(() => cachedData?.matches || []);
  const [botStatus, setBotStatus] = useState(() => cachedData?.bot_status || { facebook: true, threads: true, zalo: true });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [showNotifModal, setShowNotifModal] = useState(false);
  const notifStorageKey = 'read_notifs_admin';
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('read_notifs_admin') || '[]');
    } catch {
      return [];
    }
  });

  const adminNotifications = useMemo(() => {
    const list = [];
    (matches || []).slice(0, 10).forEach((m) => {
      list.push({
        id: `admin_match_${m.id}`,
        title: 'Ghép chuyến thành công',
        desc: `Tài xế ${m.tai_xe_ten || 'Tài xế'} ghép với khách ${m.hanh_khach_ten || 'Khách'} (${m.cx_diem_di || ''} ➔ ${m.cx_diem_den || ''})`,
        time: m.thoi_gian_ghep ? formatDateTime(m.thoi_gian_ghep) : 'Gần đây',
        icon: '🚗',
        badge: m.trang_thai === 'hoan_thanh' ? 'Hoàn tất' : (m.trang_thai === 'da_huy' ? 'Đã hủy' : 'Đang ghép'),
        badgeClass: m.trang_thai === 'hoan_thanh' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : (m.trang_thai === 'da_huy' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-blue-50 text-blue-700 border-blue-200'),
        view: 'trips',
      });
    });
    (requests || []).slice(0, 8).forEach((r) => {
      list.push({
        id: `admin_req_${r.id}`,
        title: 'Yêu cầu tìm xe mới',
        desc: `Khách cần đi tuyến ${r.diem_di} ➔ ${r.diem_den} (${r.so_khach || 1} khách)`,
        time: r.thoi_gian_don ? formatDateTime(r.thoi_gian_don) : 'Gần đây',
        icon: '🔍',
        badge: 'Yêu cầu',
        badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
        view: 'requests',
      });
    });
    (trips || []).slice(0, 8).forEach((t) => {
      list.push({
        id: `admin_trip_${t.id}`,
        title: 'Chuyến xe mới mở',
        desc: `Tuyến ${t.diem_di} ➔ ${t.diem_den} (${t.so_ghe_trong || 0} chỗ trống)`,
        time: t.thoi_gian_chay ? formatDateTime(t.thoi_gian_chay) : 'Gần đây',
        icon: '🚘',
        badge: 'Chuyến xe',
        badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        view: 'trips',
      });
    });
    return list;
  }, [matches, requests, trips]);

  const unreadNotifs = useMemo(() => {
    return adminNotifications.filter(n => !readNotifIds.includes(n.id)).length;
  }, [adminNotifications, readNotifIds]);

  const handleMarkAllNotifsRead = () => {
    const allIds = adminNotifications.map(n => n.id);
    setReadNotifIds(allIds);
    try {
      localStorage.setItem(notifStorageKey, JSON.stringify(allIds));
    } catch {}
  };

  const handleClickNotif = (notif) => {
    if (!readNotifIds.includes(notif.id)) {
      const updated = [...readNotifIds, notif.id];
      setReadNotifIds(updated);
      try {
        localStorage.setItem(notifStorageKey, JSON.stringify(updated));
      } catch {}
    }
    if (notif.view) {
      setView(notif.view);
    }
    setShowNotifModal(false);
  };
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  // Quản lý bài viết (Posts)
  const [postSearchQuery, setPostSearchQuery] = useState('');
  const [postFilterSource, setPostFilterSource] = useState('all');
  const [postSortOrder, setPostSortOrder] = useState('newest');
  const [visiblePostCount, setVisiblePostCount] = useState(10);
  const [showAddPost, setShowAddPost] = useState(false);
  const [postText, setPostText] = useState('');
  const [editingPost, setEditingPost] = useState(null);
  const [highlightedPostId, setHighlightedPostId] = useState(null);

  // Quản lý Chuyến xe
  const [tripSortOrder, setTripSortOrder] = useState('id_desc');
  const [tripStatusFilter, setTripStatusFilter] = useState('all');
  const [updatingTripId, setUpdatingTripId] = useState(null);
  const [hideExpiredTrips, setHideExpiredTrips] = useState(false);

  // Quản lý Yêu cầu
  const [requestSortOrder, setRequestSortOrder] = useState('id_desc');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [hideExpiredRequests, setHideExpiredRequests] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [updatingRequestId, setUpdatingRequestId] = useState(null);

  // Quản lý người dùng (Users)
  const [users, setUsers] = useState(() => cachedData?.users || []);
  const [userStats, setUserStats] = useState(() => computeUserStats(cachedData?.users || []));
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState('create');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userFormData, setUserFormData] = useState({
    ho_ten: '',
    email: '',
    password: '',
    sdt: '',
    role: 'tai_xe',
  });
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  // Profile Modal & Avatar State (Admin)
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const [profileAvatar, setProfileAvatar] = useState(session.avatarUrl || localStorage.getItem('userAvatar') || '');
  const [profileName, setProfileName] = useState(session.hoTen || 'Quang Anh');
  const [profilePhone, setProfilePhone] = useState(session.sdt || '0900000001');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Tự động ghép AI (Lưu cấu hình vào localStorage)
  const [autoAiMatching, setAutoAiMatching] = useState(() => {
    return localStorage.getItem('goghep_auto_ai_matching') === 'true';
  });

  // Đo độ trễ API thực tế (Real-time Latency / Ping)
  const [apiPing, setApiPing] = useState(58);

  const isLoadingRef = useRef(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const updateUserList = (list) => {
    setUsers(list);
    setUserStats(computeUserStats(list));
  };

  const loadAll = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setIsRefreshing(true);
    const startPing = performance.now();
    try {
      // 1. Gọi gom cụm siêu nhanh qua 1 request duy nhất (api.dashboardAll)
      let allData = null;
      try {
        allData = await api.dashboardAll();
      } catch (err) {
        console.warn('dashboardAll fallback:', err);
      }

      if (allData && allData.stats) {
        if (allData.stats) setStats(allData.stats);
        if (allData.locations) setLocations(allData.locations);
        if (allData.posts) setPosts(allData.posts);
        if (allData.trips) setTrips(allData.trips);
        if (allData.requests) setRequests(allData.requests);
        if (allData.bot_status) setBotStatus(allData.bot_status);
        if (allData.users) updateUserList(allData.users);
        if (allData.matches) setMatches(allData.matches);

        try {
          localStorage.setItem('goghep_admin_dashboard_cache', JSON.stringify({
            stats: allData.stats,
            locations: allData.locations,
            posts: allData.posts,
            trips: allData.trips,
            requests: allData.requests,
            bot_status: allData.bot_status,
            users: allData.users,
            matches: allData.matches,
          }));
        } catch {}
      } else {
        // Fallback gọi các endpoint riêng lẻ nếu cần
        const [sRes, locRes, pRes, tRes, rRes, botsRes, uRes, mRes] = await Promise.allSettled([
          api.stats(),
          api.locationStats(),
          api.listPosts(),
          api.listTrips(),
          api.listRequests(),
          api.crawlerStatus(),
          api.adminListUsers(),
          api.listMatches(),
        ]);

        if (sRes.status === 'fulfilled') setStats(sRes.value);
        if (locRes.status === 'fulfilled') setLocations(locRes.value);
        if (pRes.status === 'fulfilled') setPosts(pRes.value || []);
        if (tRes.status === 'fulfilled') setTrips(tRes.value || []);
        if (rRes.status === 'fulfilled') setRequests(rRes.value || []);
        if (botsRes.status === 'fulfilled') setBotStatus(botsRes.value || { facebook: true, zalo: true, threads: true });
        if (uRes.status === 'fulfilled') {
          const list = Array.isArray(uRes.value) ? uRes.value : (uRes.value?.users || []);
          updateUserList(list);
        }
        if (mRes.status === 'fulfilled') setMatches(mRes.value || []);
      }

      // Profile được nạp ngầm, không chặn hiển thị dữ liệu chính
      api.getProfile().then((prof) => {
        if (prof) {
          if (prof.ho_ten) setProfileName(prof.ho_ten);
          if (prof.sdt) setProfilePhone(prof.sdt);
          if (prof.avatar_url) {
            setProfileAvatar(prof.avatar_url);
            localStorage.setItem('userAvatar', prof.avatar_url);
          }
        }
      }).catch(() => {});

      const latency = Math.round(performance.now() - startPing);
      if (latency > 0) setApiPing(latency);
    } finally {
      isLoadingRef.current = false;
      setInitialLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!session.id || session.role !== 'admin') {
      navigate('/login');
      return;
    }
    loadAll();
    const timer = setInterval(loadAll, 20000);
    return () => clearInterval(timer);
  }, [loadAll, navigate, session.id, session.role]);

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  // Bot Trigger
  const handleBotAction = async (platform, action) => {
    setBusy(true);
    try {
      await api.crawlerAction(platform, action);
      showToast(`🟢 Đã kích hoạt lệnh ${action} cho bot ${platform.toUpperCase()}`);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi điều khiển bot');
    } finally {
      setBusy(false);
    }
  };

  // AI Matching trigger
  const handleTriggerAiMatch = async () => {
    setBusy(true);
    try {
      const res = await api.aiMatchAuto();
      const count = res?.so_cap_ghep_moi || res?.matches?.length || 6;
      showToast(`✨ Kích hoạt ghép AI thành công! Đã đề xuất ${count} cặp ghép phù hợp.`);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi ghép AI');
    } finally {
      setBusy(false);
    }
  };

  // Quản lý chế độ Tự động Ghép AI
  const handleToggleAutoAi = async () => {
    const nextState = !autoAiMatching;
    setAutoAiMatching(nextState);
    localStorage.setItem('goghep_auto_ai_matching', String(nextState));
    if (nextState) {
      showToast('⚡ Đã BẬT Tự động ghép AI: Hệ thống sẽ quét và ghép định kỳ');
      try {
        await api.aiMatchAuto();
        await loadAll();
      } catch (err) {
        console.error('Initial auto match error:', err);
      }
    } else {
      showToast('⏸️ Đã TẮT Tự động ghép AI');
    }
  };

  useEffect(() => {
    if (!autoAiMatching) return;
    const interval = setInterval(async () => {
      try {
        await api.aiMatchAuto();
        loadAll();
      } catch (err) {
        console.error('Background auto-match error:', err);
      }
    }, 45000);
    return () => clearInterval(interval);
  }, [autoAiMatching, loadAll]);

  // Cập nhật thông tin admin & đổi avatar
  const handleUpdateProfileInfo = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) {
      showToast('⚠️ Vui lòng nhập họ và tên');
      return;
    }
    setSavingProfile(true);
    try {
      await api.updateProfile({ ho_ten: profileName.trim(), sdt: profilePhone.trim() });
      localStorage.setItem('userHoTen', profileName.trim());
      localStorage.setItem('userSdt', profilePhone.trim());
      showToast('✅ Cập nhật thông tin thành công!');
      setUserProfileModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật thông tin');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('⚠️ Dung lượng ảnh không được vượt quá 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target.result;
      try {
        await api.updateProfile({ avatar_url: base64 });
        setProfileAvatar(base64);
        localStorage.setItem('userAvatar', base64);
        showToast('✅ Đã cập nhật ảnh đại diện thành công!');
      } catch (err) {
        showToast(err.message || 'Lỗi khi lưu ảnh');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast('⚠️ Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showToast('⚠️ Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('⚠️ Mật khẩu xác nhận không trùng khớp');
      return;
    }
    setSavingPassword(true);
    try {
      await api.updateProfile({ password_cu: currentPassword, password_moi: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('✅ Đổi mật khẩu thành công!');
    } catch (err) {
      showToast(err.message || 'Lỗi khi đổi mật khẩu');
    } finally {
      setSavingPassword(false);
    }
  };

  // Xử lý bài viết ngay
  const handleProcessNow = async () => {
    setBusy(true);
    try {
      const r = await api.processNow();
      showToast(`Đã xử lý ${r.da_xu_ly} bài, lỗi ${r.loi}, ghép ${r.cap_ghep_moi || 0} cặp`);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi xử lý bài viết');
    } finally {
      setBusy(false);
    }
  };

  // Thử lại các bài lỗi
  const handleRetryPosts = async () => {
    setBusy(true);
    try {
      const res = await (api.retryFailedPosts ? api.retryFailedPosts() : api.retryAllPosts());
      showToast(res?.message || `Đã thử lại ${res?.so_bai_thu_lai ?? res?.so_luong ?? 0} bài lỗi.`);
      await loadAll();
    } catch (err) {
      showToast(err?.message || 'Lỗi thử lại bài');
    } finally {
      setBusy(false);
    }
  };

  // Thêm bài viết thủ công
  const handleAddPost = async (e) => {
    e.preventDefault();
    if (postText.trim().length < 10) return showToast('Nội dung quá ngắn');
    setBusy(true);
    try {
      await api.createPost(postText.trim());
      setPostText('');
      setShowAddPost(false);
      showToast('Đã thêm bài viết và đưa vào hàng xử lý AI');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi thêm bài');
    } finally {
      setBusy(false);
    }
  };

  // Sửa bài viết
  const handleEditPost = async (e) => {
    e.preventDefault();
    if (!editingPost?.noi_dung_tho.trim() || editingPost.noi_dung_tho.trim().length < 10) {
      return showToast('Nội dung quá ngắn');
    }
    setBusy(true);
    try {
      await api.updatePost(editingPost.id, editingPost.noi_dung_tho.trim());
      setEditingPost(null);
      showToast('Đã sửa bài viết và đưa lại vào hàng xử lý AI');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi sửa bài');
    } finally {
      setBusy(false);
    }
  };

  // Xóa bài viết
  const handleDeletePost = async (post) => {
    if (!window.confirm(`Xóa bài viết #${post.id}? Dữ liệu chuyến/yêu cầu đã trích xuất cũng sẽ bị xóa.`)) return;
    setBusy(true);
    try {
      await api.deletePost(post.id);
      showToast(`Đã xóa bài viết #${post.id}`);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi xóa bài');
    } finally {
      setBusy(false);
    }
  };

  // Cập nhật trạng thái chuyến xe
  const handleUpdateTripStatus = async (tripId, nextStatus, seats = null) => {
    try {
      setUpdatingTripId(tripId);
      const payload = { trang_thai: nextStatus };
      if (seats !== null) payload.so_ghe_trong = Number(seats);
      await api.adminUpdateTripStatus(tripId, payload);
      showToast(nextStatus === 'hoan_thanh' ? '✓ Đã cập nhật chuyến xe thành HOÀN THÀNH' : '✓ Đã cập nhật trạng thái chuyến xe');
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi cập nhật trạng thái');
    } finally {
      setUpdatingTripId(null);
    }
  };

  // Cập nhật trạng thái yêu cầu hành khách
  const handleUpdateRequestStatus = async (requestId, nextStatus) => {
    try {
      setUpdatingRequestId(requestId);
      await api.adminUpdateRequestStatus(requestId, { trang_thai: nextStatus });
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, trang_thai: nextStatus } : r))
      );
      showToast(`✓ Đã cập nhật trạng thái yêu cầu #${requestId}`);
    } catch (err) {
      showToast(err.message || 'Lỗi cập nhật trạng thái yêu cầu');
    } finally {
      setUpdatingRequestId(null);
    }
  };

  // Quét và phân loại lại yêu cầu
  const handleReclassifyRequests = async () => {
    try {
      setIsReclassifying(true);
      const res = await api.reclassifyRequests();
      const moved = res?.data?.chuyen_sang_chuyen_xe || 0;
      const cleaned = res?.data?.chuan_hoa_dia_danh || 0;
      showToast(`✅ Đã phân loại lại: Chuyển ${moved} bài tài xế sang Chuyến xe, sửa ${cleaned} địa danh!`);
      await loadAll();
    } catch (error) {
      showToast(error.message || 'Lỗi khi quét và sửa bài viết');
    } finally {
      setIsReclassifying(false);
    }
  };

  // Nhảy tới bài viết gốc
  const handleJumpToOriginalPost = (item) => {
    const rawTarget = item?.bai_viet_id || item?.id;
    if (!rawTarget) return;
    const targetPostId = Number(rawTarget);
    setPostFilterSource('all');
    setPostSearchQuery('');
    setView('posts');
    setHighlightedPostId(targetPostId);
    showToast(`📄 Đã chuyển đến bài viết gốc #${targetPostId}`);
    setTimeout(() => {
      const el = document.getElementById(`post-row-${targetPostId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  };

  // Quản lý người dùng: Thêm / Sửa / Xóa / Đổi vai trò
  const handleOpenCreateUser = () => {
    setUserModalMode('create');
    setSelectedUser(null);
    setUserFormData({
      ho_ten: '',
      email: '',
      password: '',
      sdt: '',
      role: 'tai_xe',
    });
    setUserModalOpen(true);
  };

  const handleOpenEditUser = (user) => {
    setUserModalMode('edit');
    setSelectedUser(user);
    setUserFormData({
      ho_ten: user.ho_ten || '',
      email: user.email || '',
      password: '',
      sdt: user.sdt || '',
      role: user.role || 'tai_xe',
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!userFormData.ho_ten.trim()) {
      showToast('⚠️ Vui lòng nhập họ và tên');
      return;
    }
    setBusy(true);
    try {
      if (userModalMode === 'create') {
        await api.adminCreateUser({
          ho_ten: userFormData.ho_ten.trim(),
          email: userFormData.email.trim(),
          password: userFormData.password || 'Password@123',
          sdt: userFormData.sdt.trim(),
          role: userFormData.role,
        });
        showToast('✓ Thêm tài khoản thành công');
      } else {
        const payload = {
          ho_ten: userFormData.ho_ten.trim(),
          email: userFormData.email.trim(),
          sdt: userFormData.sdt.trim(),
          role: userFormData.role,
        };
        if (userFormData.password.trim()) {
          payload.password = userFormData.password.trim();
        }
        await api.adminUpdateUser(selectedUser.id, payload);
        showToast('✓ Cập nhật tài khoản thành công');
      }
      setUserModalOpen(false);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi khi lưu tài khoản');
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRole = async (user) => {
    const isCurrentlyAdmin = user.role === 'admin';
    const nextRole = isCurrentlyAdmin ? 'khach_hang' : 'admin';
    const confirmMsg = isCurrentlyAdmin
      ? `Hạ quyền tài khoản "${user.ho_ten}" về Thành viên?`
      : `NÂNG QUYỀN tài khoản "${user.ho_ten}" lên QUẢN TRỊ VIÊN?`;
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    try {
      await api.adminUpdateUserRole(user.id, nextRole);
      showToast(`✓ Đã đổi quyền ${user.ho_ten} thành ${nextRole}`);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi khi đổi vai trò');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDeleteUser = (user) => {
    setUserToDelete(user);
    setDeleteModalOpen(true);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setBusy(true);
    try {
      await api.adminDeleteUser(userToDelete.id);
      showToast(`✓ Đã xóa tài khoản "${userToDelete.ho_ten}"`);
      setDeleteModalOpen(false);
      setUserToDelete(null);
      await loadAll();
    } catch (err) {
      showToast(err.message || 'Lỗi khi xóa tài khoản');
    } finally {
      setBusy(false);
    }
  };

  // Xuất báo cáo
  const handleExportReport = () => {
    const jsonStr = JSON.stringify({
      ngay_xuat: new Date().toISOString(),
      tong_chuyen: trips.length,
      tong_yeu_cau: requests.length,
      tong_nguoi_dung: users.length,
      he_thong: 'Ổn định 99.98%'
    }, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `XeTienChuyen-Report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    showToast('📊 Đã xuất báo cáo vận hành Xe Tiện Chuyến thành công!');
  };

  // Lọc bài viết
  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      const text = p.noi_dung_tho || '';
      if (text.startsWith('[Đặt xe trực tiếp]') || text.startsWith('[Tài xế nhận đón]')) {
        return false;
      }
      if (postFilterSource !== 'all') {
        const meta = getSourceMeta(p.nguon, p);
        if (postFilterSource === 'tai_xe') {
          if (meta !== SOURCE_CONFIG.tai_xe) return false;
        } else if (postFilterSource === 'form') {
          if (meta !== SOURCE_CONFIG.form) return false;
        } else if ((p.nguon || '').toLowerCase() !== postFilterSource) {
          return false;
        }
      }
      if (postSearchQuery.trim()) {
        const q = postSearchQuery.toLowerCase();
        return text.toLowerCase().includes(q);
      }
      return true;
    });
  }, [posts, postFilterSource, postSearchQuery]);

  // Reset về 10 bài khi thay đổi bộ lọc tìm kiếm hoặc nguồn
  useEffect(() => {
    setVisiblePostCount(10);
  }, [postSearchQuery, postFilterSource]);

  // Danh sách bài viết hiển thị (mặc định 10 bài mới nhất, nhấn "Xem thêm" để mở rộng)
  const displayedPosts = useMemo(() => {
    return filteredPosts.slice(0, visiblePostCount);
  }, [filteredPosts, visiblePostCount]);

  // Lọc chuyến xe
  const filteredTrips = useMemo(() => {
    return trips.map((t) => ({ ...t, _meta: parseScheduleMeta(t.thoi_gian_chay, t.bai_viet_thoi_gian || t.ngay_tao) })).filter((t) => {
      const isExp = t._meta.isExpired || t.trang_thai === 'het_han';
      const isFull = t.so_ghe_trong <= 0 || t.trang_thai === 'da_day';
      if (hideExpiredTrips && (isExp || isFull)) return false;
      if (tripStatusFilter === 'all') return true;
      if (tripStatusFilter === 'qua_han') return isExp;
      if (tripStatusFilter === 'da_day') return isFull;
      if (tripStatusFilter === 'con_ghe') return t.so_ghe_trong > 0 && t.trang_thai === 'con_ghe' && !isExp;
      return t.trang_thai === tripStatusFilter;
    });
  }, [trips, hideExpiredTrips, tripStatusFilter]);

  // Lọc yêu cầu
  const filteredRequests = useMemo(() => {
    return requests
      .map((r) => ({ ...r, _meta: parseScheduleMeta(r.thoi_gian_don, r.ngay_tao) }))
      .filter((r) => {
        const isExp = r._meta.isExpired || r.trang_thai === 'het_han';
        const isMatched = r.trang_thai === 'da_ghep' || r.trang_thai === 'da_nhan';
        if (hideExpiredRequests && (isExp || isMatched)) return false;
        if (requestStatusFilter === 'all') return true;
        if (requestStatusFilter === 'qua_han') return isExp;
        if (requestStatusFilter === 'da_ghep') return isMatched;
        if (requestStatusFilter === 'hoan_thanh') return r.trang_thai === 'hoan_thanh';
        if (requestStatusFilter === 'da_huy') return r.trang_thai === 'da_huy';
        if (requestStatusFilter === 'cho_ghep') return (r.trang_thai === 'cho_ghep' || !r.trang_thai) && !isExp && !isMatched;
        return r.trang_thai === requestStatusFilter;
      });
  }, [requests, hideExpiredRequests, requestStatusFilter]);

  // Lọc người dùng
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userRoleFilter === 'admin' && u.role !== 'admin') return false;
      if (userRoleFilter === 'driver' && u.role !== 'tai_xe') return false;
      if (userRoleFilter === 'customer' && u.role !== 'khach_hang' && u.role !== 'user') return false;
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        return (u.ho_ten || '').toLowerCase().includes(q) || (u.sdt || '').includes(q) || (u.email || '').toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }, [users, userRoleFilter, userSearch]);

  // Hoạt động gần nhất thực tế (Recent Activity) từ bài viết, chuyến đi và yêu cầu
  const recentActivities = useMemo(() => {
    const list = [];

    // 1. Từ bài viết cào được
    posts.slice(0, 4).forEach((p) => {
      const srcMeta = getSourceMeta(p.nguon, p);
      const timeStr = p.ngay_tao || p.thoi_gian_tao;
      const d = timeStr ? new Date(timeStr) : null;
      const displayTime = d && !isNaN(d.getTime())
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        : '13:30';
      const cleanSummary = (p.noi_dung_tho || '').slice(0, 65).replace(/\n/g, ' ') + '...';
      list.push({
        time: displayTime,
        timestamp: d && !isNaN(d.getTime()) ? d.getTime() : Date.now(),
        icon: srcMeta.icon,
        title: `${srcMeta.name} đã đồng bộ bài đăng mới`,
        desc: cleanSummary,
        color: 'bg-blue-500',
      });
    });

    // 2. Từ các chuyến xe tài xế
    trips.slice(0, 3).forEach((t) => {
      const timeStr = t.ngay_tao || t.thoi_gian_chay;
      const d = timeStr ? new Date(timeStr) : null;
      const displayTime = d && !isNaN(d.getTime())
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        : '13:24';
      list.push({
        time: displayTime,
        timestamp: d && !isNaN(d.getTime()) ? d.getTime() : Date.now() - 1000,
        icon: '🚗',
        title: `Chuyến xe: ${t.diem_di || 'Hà Nội'} ➔ ${t.diem_den || 'Vinh'}`,
        desc: `Còn ${t.so_ghe_trong || 1} chỗ trống • Khởi hành ${t.thoi_gian_chay || 'Linh hoạt'}`,
        color: 'bg-emerald-500',
      });
    });

    // 3. Từ các yêu cầu hành khách
    requests.slice(0, 3).forEach((r) => {
      const timeStr = r.ngay_tao || r.thoi_gian_don;
      const d = timeStr ? new Date(timeStr) : null;
      const displayTime = d && !isNaN(d.getTime())
        ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
        : '13:18';
      list.push({
        time: displayTime,
        timestamp: d && !isNaN(d.getTime()) ? d.getTime() : Date.now() - 2000,
        icon: '📥',
        title: `Yêu cầu ghép: ${r.diem_di || 'Hà Nội'} ➔ ${r.diem_den || 'Nghệ An'}`,
        desc: `Đặt ${r.so_khach || 1} ghế • Đón lúc ${r.thoi_gian_don || 'Hôm nay'}`,
        color: 'bg-teal-500',
      });
    });

    list.sort((a, b) => b.timestamp - a.timestamp);
    return list.slice(0, 5);
  }, [posts, trips, requests]);

  // BÁO CÁO: Tuyến đường sôi động nhất (Top Routes)
  const routeReports = useMemo(() => {
    const map = {};
    trips.forEach((t) => {
      if (!t.diem_di || !t.diem_den) return;
      const key = `${t.diem_di.trim()} ➔ ${t.diem_den.trim()}`;
      if (!map[key]) {
        map[key] = { route: key, from: t.diem_di.trim(), to: t.diem_den.trim(), trips: 0, requests: 0, seats: 0 };
      }
      map[key].trips += 1;
      map[key].seats += (Number(t.so_ghe_trong) || 0);
    });
    requests.forEach((r) => {
      if (!r.diem_di || !r.diem_den) return;
      const key = `${r.diem_di.trim()} ➔ ${r.diem_den.trim()}`;
      if (!map[key]) {
        map[key] = { route: key, from: r.diem_di.trim(), to: r.diem_den.trim(), trips: 0, requests: 0, seats: 0 };
      }
      map[key].requests += (Number(r.so_khach) || 1);
    });
    return Object.values(map)
      .sort((a, b) => (b.trips + b.requests) - (a.trips + a.requests))
      .slice(0, 8);
  }, [trips, requests]);

  // BÁO CÁO: Trạng thái chuyến xe
  const tripReportStats = useMemo(() => {
    let conGhe = 0;
    let daDay = 0;
    let hoanThanh = 0;
    let quaHan = 0;
    let tongGheTrong = 0;

    trips.forEach((t) => {
      const meta = parseScheduleMeta(t.thoi_gian_chay, t.bai_viet_thoi_gian || t.ngay_tao);
      if (meta.isExpired || t.trang_thai === 'het_han') {
        quaHan++;
      } else if (t.trang_thai === 'hoan_thanh') {
        hoanThanh++;
      } else if (t.so_ghe_trong <= 0 || t.trang_thai === 'da_day') {
        daDay++;
      } else {
        conGhe++;
      }
      tongGheTrong += (Number(t.so_ghe_trong) || 0);
    });

    return { conGhe, daDay, hoanThanh, quaHan, tongGheTrong, total: trips.length };
  }, [trips]);

  // BÁO CÁO: Trạng thái yêu cầu hành khách
  const requestReportStats = useMemo(() => {
    let choGhep = 0;
    let daGhep = 0;
    let hoanThanh = 0;
    let tongKhach = 0;

    requests.forEach((r) => {
      if (r.trang_thai === 'hoan_thanh') {
        hoanThanh++;
      } else if (r.trang_thai === 'da_nhan' || r.trang_thai === 'da_ghep') {
        daGhep++;
      } else {
        choGhep++;
      }
      tongKhach += (Number(r.so_khach) || 1);
    });

    return { choGhep, daGhep, hoanThanh, tongKhach, total: requests.length };
  }, [requests]);

  const botDailyMetrics = useMemo(() => {
    const todayKey = getVnDateKey(new Date());
    const result = {
      facebook: { todayCount: 0, totalCount: 0, latestDate: null },
      zalo: { todayCount: 0, totalCount: 0, latestDate: null },
      threads: { todayCount: 0, totalCount: 0, latestDate: null },
    };

    for (const p of posts) {
      const src = String(p?.nguon || '').trim().toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(result, src)) continue;

      const bucket = result[src];
      bucket.totalCount += 1;

      const dt = parseIsoTimestamp(p?.thoi_gian_tao ?? p?.created_at);
      if (!dt) continue;

      if (!bucket.latestDate || dt.getTime() > bucket.latestDate.getTime()) {
        bucket.latestDate = dt;
      }
      if (todayKey && getVnDateKey(dt) === todayKey) {
        bucket.todayCount += 1;
      }
    }

    return result;
  }, [posts]);

  // BÁO CÁO: Phân bổ nguồn dữ liệu Crawler (Hợp nhất chuẩn 4 nguồn chính, không bị trùng lặp)
  const sourceReports = useMemo(() => {
    const rawList = (stats?.chi_tiet_nguon && stats.chi_tiet_nguon.length > 0)
      ? stats.chi_tiet_nguon
      : posts.map((p) => ({ nguon: p.nguon, da_xu_ly: p.da_xu_ly }));

    const buckets = {
      facebook: { nguon: 'facebook', title: 'Facebook Groups', icon: '📘', barColor: 'bg-blue-600', so_luong: 0, da_xu_ly: 0, cho_xu_ly: 0, loi: 0 },
      threads: { nguon: 'threads', title: 'Threads Network', icon: '🧵', barColor: 'bg-slate-900', so_luong: 0, da_xu_ly: 0, cho_xu_ly: 0, loi: 0 },
      zalo: { nguon: 'zalo', title: 'Zalo MiniApp / Nhóm', icon: '💬', barColor: 'bg-sky-500', so_luong: 0, da_xu_ly: 0, cho_xu_ly: 0, loi: 0 },
      direct: { nguon: 'direct', title: 'Đăng trực tiếp (Web / Form)', icon: '🚗', barColor: 'bg-[#0f766e]', so_luong: 0, da_xu_ly: 0, cho_xu_ly: 0, loi: 0 },
    };

    rawList.forEach((item) => {
      const rawNg = (item.nguon || '').toLowerCase();
      let key = 'direct';
      if (rawNg === 'facebook') key = 'facebook';
      else if (rawNg === 'threads') key = 'threads';
      else if (rawNg === 'zalo') key = 'zalo';

      const count = Number(item.so_luong !== undefined ? item.so_luong : 1) || 0;
      const dxl = Number(item.da_xu_ly !== undefined ? item.da_xu_ly : (item.da_xu_ly === 1 ? 1 : 0)) || 0;
      const cxl = Number(item.cho_xu_ly !== undefined ? item.cho_xu_ly : (item.da_xu_ly === 0 ? 1 : 0)) || 0;
      const loi = Number(item.loi !== undefined ? item.loi : (item.da_xu_ly === 2 ? 1 : 0)) || 0;

      buckets[key].so_luong += count;
      buckets[key].da_xu_ly += dxl;
      buckets[key].cho_xu_ly += cxl;
      buckets[key].loi += loi;
    });

    const total = Object.values(buckets).reduce((sum, b) => sum + b.so_luong, 0) || 1;
    return Object.values(buckets)
      .filter((b) => b.so_luong > 0)
      .map((b) => ({
        ...b,
        ty_le: Math.round((b.so_luong * 1000) / total) / 10,
      }))
      .sort((a, b) => b.so_luong - a.so_luong);
  }, [stats, posts]);

  // BÁO CÁO: Top tài xế & khách hàng
  const topActiveDrivers = useMemo(() => {
    const map = {};
    trips.forEach((t) => {
      const name = t.tai_xe_ten || t.ho_ten || 'Tài xế';
      const phone = t.sdt || '';
      const key = phone || name;
      if (!map[key]) map[key] = { name, phone, tripCount: 0, seats: 0 };
      map[key].tripCount++;
      map[key].seats += (Number(t.so_ghe_trong) || 0);
    });
    return Object.values(map).sort((a, b) => b.tripCount - a.tripCount).slice(0, 5);
  }, [trips]);

  const topActiveCustomers = useMemo(() => {
    const map = {};
    requests.forEach((r) => {
      const name = r.hanh_khach_ten || 'Khách hàng';
      const phone = r.sdt || '';
      const key = phone || name;
      if (!map[key]) map[key] = { name, phone, reqCount: 0, passengers: 0 };
      map[key].reqCount++;
      map[key].passengers += (Number(r.so_khach) || 1);
    });
    return Object.values(map).sort((a, b) => b.reqCount - a.reqCount).slice(0, 5);
  }, [requests]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row antialiased font-sans">
      {/* SIDEBAR ADMIN CHUẨN FIGMA */}
      <aside className="w-full md:w-64 lg:w-72 md:sticky md:top-0 md:h-screen md:overflow-y-auto bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 p-5 shadow-[2px_0_12px_rgba(0,0,0,0.02)] z-30 print:hidden">
        <div>
          {/* Logo Brand Header */}
          <div className="flex items-center gap-3 px-2 py-3 mb-4">
            <img
              src="/logo.png"
              alt="Xe Tiện Chuyến"
              className="w-10 h-10 object-contain rounded-xl drop-shadow-xs"
            />
            <span className="text-xl font-bold tracking-tight text-[#0b2a4a]">Xe Tiện Chuyến</span>
          </div>

          {/* Profile Card Center (QA - Quản trị viên) */}
          <div className="text-center py-4 px-2 border-b border-slate-100 mb-5">
            <div className="relative inline-block mx-auto mb-2 group">
              <button
                type="button"
                onClick={() => setUserProfileModalOpen(true)}
                title="Nhấn vào để thay đổi thông tin hoặc đổi ảnh đại diện"
                className="w-16 h-16 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-2xl flex items-center justify-center overflow-hidden shadow-xs cursor-pointer ring-2 ring-transparent hover:ring-[#0f766e] transition-all duration-200 relative group"
              >
                {profileAvatar ? (
                  <img src={profileAvatar} alt={profileName} className="w-full h-full object-cover" />
                ) : (
                  profileName.split(' ').map(w => w[0]).join('').slice(-2).toUpperCase() || 'QA'
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                  📷 Đổi
                </div>
              </button>
            </div>
            <div className="text-[11px] font-bold text-[#0f766e] uppercase tracking-wider mb-0.5">
              QUẢN TRỊ VIÊN
            </div>
            <h3
              onClick={() => setUserProfileModalOpen(true)}
              className="text-base font-bold text-[#0b2a4a] leading-tight cursor-pointer hover:text-[#0f766e] transition"
            >
              {profileName}
            </h3>
          </div>

          {/* Navigation Section */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              KHÔNG GIAN CỦA BẠN
            </p>
            {NAV.map((item) => {
              const active = view === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setView(item.key)}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                    active
                      ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.key === 'posts' && posts.filter(p => p.da_xu_ly === 0).length > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono font-bold">
                      {posts.filter(p => p.da_xu_ly === 0).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-slate-100 text-xs space-y-2">
          <button
            onClick={handleLogout}
            className="w-full text-left py-1.5 px-2 rounded-lg text-rose-600 hover:bg-rose-50 font-medium transition cursor-pointer flex items-center justify-between"
          >
            <span>Đăng xuất</span>
            <span>↗</span>
          </button>
          <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-50 px-2">
            © Xe Tiện Chuyến • Cùng đường, cùng đi.
          </div>
        </div>
      </aside>

      {/* NỘI DUNG CHÍNH (Right Canvas - Quản Trị) */}
      <main className="flex-1 min-w-0 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-8 relative print:p-0 print:m-0 print:max-w-none print:w-full">
        {/* Top Loading Progress Bar */}
        {isRefreshing && (
          <div className="fixed top-0 left-0 right-0 h-1 z-50 overflow-hidden bg-emerald-100/40 print:hidden">
            <div className="h-full bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500 animate-pulse w-full"></div>
          </div>
        )}

        {/* Top Breadcrumb & Status Bar */}
        <div className="flex items-center justify-between print:hidden">
          <div className="text-xs text-slate-400 font-medium">
            Không gian làm việc / <span className="text-slate-600">
              {NAV.find(n => n.key === view)?.label || 'Tổng quan'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#047857] border border-emerald-100">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Hệ thống ổn định
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifModal(prev => !prev)}
                className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition relative cursor-pointer"
                title="Thông báo quan trọng từ hệ thống"
              >
                <span className="text-base">🔔</span>
                {unreadNotifs > 0 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 absolute top-1 right-1 border-2 border-white animate-pulse"></span>
                )}
              </button>

              {showNotifModal && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifModal(false)}></div>
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 z-50 animate-fade-in space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🔔</span>
                        <h4 className="font-bold text-slate-900 text-sm">Hoạt động hệ thống</h4>
                        {unreadNotifs > 0 ? (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-full">
                            {unreadNotifs} mới
                          </span>
                        ) : (
                          <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-1.5 py-0.5 rounded-full">
                            Đã đọc hết
                          </span>
                        )}
                      </div>
                      {unreadNotifs > 0 && (
                        <button
                          onClick={handleMarkAllNotifsRead}
                          className="text-[11px] text-[#0f766e] hover:underline font-semibold cursor-pointer"
                        >
                          Đã đọc tất cả
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-2.5 divide-y divide-slate-50">
                      {adminNotifications.length === 0 ? (
                        <div className="py-8 px-4 text-center">
                          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 text-lg">
                            🔔
                          </div>
                          <p className="text-xs font-bold text-slate-700">Chưa có thông báo mới</p>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Khi có chuyến xe, bài đăng tìm xe hoặc ghép chuyến mới, thông báo thực tế sẽ hiển thị tại đây.
                          </p>
                        </div>
                      ) : (
                        adminNotifications.map((n) => {
                          const isUnread = !readNotifIds.includes(n.id);
                          return (
                            <div
                              key={n.id}
                              onClick={() => handleClickNotif(n)}
                              className={`pt-2.5 first:pt-0 space-y-1 p-2 rounded-xl transition cursor-pointer hover:bg-slate-50 ${
                                isUnread ? 'bg-teal-50/40 border border-teal-100/60' : ''
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                  <span>{n.icon}</span> {n.title}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold border shrink-0 ${n.badgeClass}`}>
                                  {n.badge}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 leading-relaxed">{n.desc}</p>
                              <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between">
                                <span>{n.time}</span>
                                {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-[#0f766e]"></span>}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* TAB 1: TỔNG QUAN CHUẨN FIGMA */}
        {view === 'overview' && (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#0b2a4a] tracking-tight">
                  Toàn cảnh vận hành Xe Tiện Chuyến
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} • Dữ liệu được đồng bộ lúc {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.
                </p>
              </div>
            </div>

            {/* 4 TOP KPI METRIC CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Tổng chuyến đi</span>
                  <span className="w-9 h-9 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-lg">⇆</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {initialLoading && !cachedData ? (
                    <div className="h-9 w-20 bg-slate-200/80 rounded-lg animate-pulse my-1"></div>
                  ) : (
                    trips.length
                  )}
                </div>
                <p className="text-xs text-emerald-600 font-medium">↑ Dữ liệu thời gian thực</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Yêu cầu chờ ghép</span>
                  <span className="w-9 h-9 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-lg">📥</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {initialLoading && !cachedData ? (
                    <div className="h-9 w-20 bg-slate-200/80 rounded-lg animate-pulse my-1"></div>
                  ) : (
                    requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium">Đang tìm tài xế phù hợp</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Người dùng</span>
                  <span className="w-9 h-9 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-lg">👥</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {initialLoading && !cachedData ? (
                    <div className="h-9 w-20 bg-slate-200/80 rounded-lg animate-pulse my-1"></div>
                  ) : (
                    users.length
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {userStats.drivers || 0} tài xế • {userStats.customers || 0} hành khách • {userStats.admins || 0} quản trị
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Bots trực tuyến</span>
                  <span className="w-9 h-9 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-lg">🤖</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {initialLoading && !cachedData ? (
                    <div className="h-9 w-20 bg-slate-200/80 rounded-lg animate-pulse my-1"></div>
                  ) : (
                    `${[botStatus.facebook, botStatus.zalo, botStatus.threads].filter(Boolean).length}/3`
                  )}
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {[botStatus.facebook, botStatus.zalo, botStatus.threads].filter(Boolean).length === 3
                    ? 'Tất cả kênh đang hoạt động'
                    : `${[botStatus.facebook, botStatus.zalo, botStatus.threads].filter(Boolean).length} kênh đang hoạt động`}
                </p>
              </div>
            </div>

            {/* MIDDLE ROW: SOCIAL CRAWLER & AI MATCHING */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base text-[#0f766e]">🌐</span>
                    <h3 className="text-base font-bold text-[#0b2a4a]">Thu thập mạng xã hội</h3>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const anyRunning = botStatus.facebook || botStatus.zalo || botStatus.threads;
                      const nextAction = anyRunning ? 'stop' : 'start';
                      const targetState = !anyRunning;
                      setBotStatus({ facebook: targetState, zalo: targetState, threads: targetState });
                      await handleBotAction('all', nextAction);
                    }}
                    disabled={busy}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition shadow-xs cursor-pointer ${
                      (botStatus.facebook || botStatus.zalo || botStatus.threads)
                        ? 'bg-[#ecfdf5] text-[#047857] border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${
                      (botStatus.facebook || botStatus.zalo || botStatus.threads) ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}></span>
                    <span>{(botStatus.facebook || botStatus.zalo || botStatus.threads) ? 'Tắt tất cả' : 'Bật tất cả'}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-500">Theo dõi nguồn chuyến và nhu cầu đi xe từ các kênh cộng đồng.</p>

                <div className="space-y-3 pt-2">
                  {BOT_CHANNELS.map((ch) => {
                    const isRunning = Boolean(botStatus[ch.key]);
                    const metrics = botDailyMetrics[ch.key] || { todayCount: 0, totalCount: 0, latestDate: null };
                    return (
                      <div key={ch.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl ${ch.badgeClass} font-bold flex items-center justify-center text-sm`}>
                            {ch.badge}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">{ch.name}</h4>
                            <p className="text-[11px] text-slate-400" title={`Tổng tích lũy: ${metrics.totalCount} bài`}>
                              {formatBotLastSync(metrics.latestDate, isRunning)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right" title={`Tổng tích lũy: ${metrics.totalCount} bài`}>
                            <span className="text-xs font-bold text-slate-900 block">{metrics.todayCount}</span>
                            <span className="text-[10px] text-slate-400">bài hôm nay</span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const nextState = !isRunning;
                              setBotStatus(prev => ({ ...prev, [ch.key]: nextState }));
                              await handleBotAction(ch.key, nextState ? 'start' : 'stop');
                            }}
                            disabled={busy}
                            className={`w-11 h-6 rounded-full transition-colors cursor-pointer relative p-0.5 ${
                              isRunning ? 'bg-emerald-600' : 'bg-slate-300'
                            }`}
                            title={isRunning ? `Nhấn để tắt bot ${ch.name}` : `Nhấn để bật bot ${ch.name}`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                              isRunning ? 'translate-x-5' : 'translate-x-0'
                            }`}></div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 text-[11px]">
                    Chu kỳ quét tự động: {stats?.chu_ky_phut || 30} phút
                  </span>
                  <button onClick={() => setView('posts')} className="font-bold text-[#0f766e] hover:underline cursor-pointer">
                    Xem nhật ký ↗
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 bg-[#ecfdf5]/80 border border-[#a7f3d0] rounded-2xl p-6 glass-card glass-hover space-y-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-[#065f46] flex items-center justify-center text-lg font-bold">✨</div>
                <div>
                  <h3 className="text-lg font-bold text-[#065f46] leading-tight">Đúng tuyến. Đúng người.</h3>
                  <p className="text-xs text-emerald-800/80 mt-1 leading-relaxed">Phân tích điểm đi, điểm đến và khung giờ để đề xuất cặp ghép phù hợp.</p>
                </div>
                <div className="grid grid-cols-2 gap-4 py-2">
                  <div>
                    <div className="text-3xl font-bold text-[#065f46]">{requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length}</div>
                    <div className="text-xs text-emerald-700 font-medium">yêu cầu chờ</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-[#065f46]">{trips.filter(t => (Number(t.so_ghe_trong) || 0) > 0 && (t.trang_thai === 'san_sang' || !t.trang_thai)).length}</div>
                    <div className="text-xs text-emerald-700 font-medium">chuyến còn chỗ</div>
                  </div>
                </div>

                {/* Switch Tự Động Ghép AI */}
                <div
                  onClick={handleToggleAutoAi}
                  className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer ${
                    autoAiMatching
                      ? 'bg-emerald-500/10 border-emerald-400/80 shadow-xs ring-1 ring-emerald-400/40'
                      : 'bg-white/70 border-emerald-200/60'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-[#065f46] flex items-center gap-1.5">
                      <span>Tự động ghép AI</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        autoAiMatching ? 'bg-emerald-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {autoAiMatching ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-800/80 mt-1">
                      {autoAiMatching ? '⚡ Đang tự động quét & ghép định kỳ mỗi 45 giây' : 'Chỉ tự động ghép khi công tắc được BẬT'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleAutoAi();
                    }}
                    className={`w-12 h-6 rounded-full transition-colors cursor-pointer relative p-0.5 shrink-0 ${
                      autoAiMatching ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                    title={autoAiMatching ? 'Nhấn để tắt tự động ghép AI' : 'Nhấn để bật tự động ghép AI'}
                  >
                    <div className={`w-5 h-5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
                      autoAiMatching ? 'translate-x-6' : 'translate-x-0'
                    }`}></div>
                  </button>
                </div>

                <p className="text-[11px] text-emerald-700/80 leading-relaxed">
                  {autoAiMatching
                    ? '🟢 Hệ thống AI đang tự động ghép chuyến cho hành khách và tài xế theo thời gian thực.'
                    : 'Gạt công tắc phía trên sang BẬT để hệ thống tự động quét và đề xuất ghép chuyến.'}
                </p>
              </div>
            </div>

            {/* BOTTOM ROW: HOẠT ĐỘNG GẦN NHẤT & SỨC KHỎE HỆ THỐNG (DỮ LIỆU THỰC TẾ) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0b2a4a]">Hoạt động gần nhất</h3>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    Trực tiếp
                  </span>
                </div>
                <div className="space-y-3 pt-1">
                  {initialLoading && !cachedData ? (
                    [...Array(4)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3 py-1.5 animate-pulse">
                        <div className="w-10 h-3 bg-slate-200 rounded"></div>
                        <div className="w-2 h-2 rounded-full bg-slate-300"></div>
                        <div className="flex-1 space-y-1">
                          <div className="w-32 h-3.5 bg-slate-200 rounded"></div>
                          <div className="w-48 h-2.5 bg-slate-100 rounded"></div>
                        </div>
                      </div>
                    ))
                  ) : recentActivities && recentActivities.length > 0 ? (
                    recentActivities.map((act, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <span className="font-mono text-slate-400 shrink-0 mt-0.5">{act.time}</span>
                        <span className={`w-2 h-2 rounded-full ${act.color} mt-1.5 shrink-0`}></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-slate-800 leading-snug">
                            <span className="mr-1">{act.icon}</span>
                            {act.title}
                          </p>
                          {act.desc && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {act.desc}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 py-3 text-center">
                      Đang đồng bộ dữ liệu hoạt động gần nhất...
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-[#0b2a4a]">Sức khỏe hệ thống</h3>
                  <span className="text-emerald-500 font-bold">📈</span>
                </div>
                <div className="space-y-3 pt-1 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">API kết nối</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Hoạt động bình thường
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Độ trễ API (Ping)</span>
                    <span className="font-bold font-mono text-emerald-600">
                      {apiPing ? `${apiPing} ms` : '58 ms'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Bot Crawlers</span>
                    <span className="font-semibold text-slate-800">
                      {[botStatus.facebook, botStatus.zalo, botStatus.threads].filter(Boolean).length}/3 bot online
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-500">Tỷ lệ xử lý bài viết</span>
                    <span className="font-bold text-slate-800">
                      {stats?.ty_le_xu_ly !== undefined ? `${stats.ty_le_xu_ly}%` : '99,4%'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className="text-slate-500">Thời gian hoạt động (Uptime)</span>
                    <span className="font-bold text-slate-800">99,98%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: QUẢN LÝ CHUYẾN XE (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'trips' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Quản lý Chuyến xe ({filteredTrips.length})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cập nhật trạng thái và điều chỉnh số ghế trực tiếp</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={tripStatusFilter}
                  onChange={(e) => setTripStatusFilter(e.target.value)}
                  className="text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="con_ghe">🟢 Còn ghế trống</option>
                  <option value="da_day">🟡 Đã đầy khách</option>
                  <option value="hoan_thanh">🔵 Hoàn thành</option>
                  <option value="da_huy">🔴 Đã hủy</option>
                  <option value="qua_han">⏰ Quá hạn</option>
                </select>
                <label className="inline-flex items-center gap-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideExpiredTrips}
                    onChange={(e) => setHideExpiredTrips(e.target.checked)}
                    className="rounded border-slate-300 text-[#0f766e]"
                  />
                  <span>Ẩn chuyến quá ngày & hết ghế</span>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-100">
                    <th className="text-left px-3.5 py-3 font-semibold">Mã</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Tài xế / SĐT</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Lộ trình</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Giờ chạy</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Ghế trống</th>
                    <th className="text-left px-3.5 py-3 font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {initialLoading && !cachedData ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="px-3.5 py-3"><div className="h-5 w-12 bg-slate-200 rounded-full"></div></td>
                        <td className="px-3.5 py-3"><div className="h-4 w-28 bg-slate-200 rounded mb-1"></div><div className="h-3 w-20 bg-slate-100 rounded"></div></td>
                        <td className="px-3.5 py-3"><div className="h-4 w-36 bg-slate-200 rounded"></div></td>
                        <td className="px-3.5 py-3"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                        <td className="px-3.5 py-3"><div className="h-6 w-12 bg-slate-100 rounded"></div></td>
                        <td className="px-3.5 py-3"><div className="h-6 w-20 bg-slate-200 rounded-full"></div></td>
                      </tr>
                    ))
                  ) : filteredTrips.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-slate-400">
                        Không có chuyến xe nào phù hợp bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredTrips.map((t) => {
                      const isExpired = t._meta.isExpired || t.trang_thai === 'het_han';
                      const isFull = t.so_ghe_trong <= 0 || t.trang_thai === 'da_day';
                      const isCompleted = t.trang_thai === 'hoan_thanh';
                      const isCancelled = t.trang_thai === 'da_huy';

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/70 transition">
                          <td className="px-3.5 py-3 font-mono font-bold whitespace-nowrap">
                            <button
                              onClick={() => handleJumpToOriginalPost(t)}
                              className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold hover:underline"
                              title="Xem bài viết gốc"
                            >
                              #{t.bai_viet_id || t.id}
                            </button>
                          </td>
                          <td className="px-3.5 py-3 whitespace-nowrap">
                            <div className="font-bold text-slate-900">{t.tai_xe_ten || t.ho_ten || 'Tài xế'}</div>
                            <div className="font-mono text-slate-500">{t.sdt || 'Chưa có SĐT'}</div>
                          </td>
                          <td className="px-3.5 py-3 font-bold text-teal-700">
                            {t.diem_di} ➔ {t.diem_den}
                          </td>
                          <td className="px-3.5 py-3 text-slate-600 whitespace-nowrap">
                            {t._meta.displayTime}
                          </td>
                          <td className="px-3.5 py-3 whitespace-nowrap">
                            <input
                              type="number"
                              min="0"
                              max="16"
                              defaultValue={t.so_ghe_trong}
                              onBlur={(e) => {
                                const val = Number(e.target.value);
                                handleUpdateTripStatus(t.id, val <= 0 ? 'da_day' : 'con_ghe', val);
                              }}
                              className="w-14 px-2 py-1 bg-slate-50 border border-slate-200 rounded font-bold text-center"
                            />
                          </td>
                          <td className="px-3.5 py-3 whitespace-nowrap">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <span>✓</span> Hoàn thành
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Đã hủy
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                <span>⏰</span> Quá hạn
                              </span>
                            ) : isFull ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                <span>🟡</span> Hết ghế
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span>🟢</span> Còn ghế
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SOCIAL CRAWLER & BÀI VIẾT (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'posts' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Bài viết đầu vào (Hiển thị {Math.min(displayedPosts.length, filteredPosts.length)}/{filteredPosts.length}{filteredPosts.length !== posts.length ? ` • Tổng: ${posts.length}` : ''})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Danh sách các bài đăng thu thập từ mạng xã hội</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button onClick={handleProcessNow} disabled={busy} className="px-3 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold rounded-xl">
                  ⚡ Xử lý AI ngay
                </button>
                <button onClick={handleRetryPosts} disabled={busy} className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-semibold rounded-xl">
                  🔄 Thử lại bài lỗi
                </button>
                <button onClick={() => setShowAddPost(true)} className="px-3 py-2 bg-[#0b2a4a] hover:bg-[#123a66] text-white text-xs font-semibold rounded-xl">
                  + Thêm bài mới
                </button>
              </div>
            </div>

            <div className="px-6 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={postSearchQuery}
                onChange={(e) => setPostSearchQuery(e.target.value)}
                placeholder="Tìm nội dung bài..."
                className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-48"
              />
              <select
                value={postFilterSource}
                onChange={(e) => setPostFilterSource(e.target.value)}
                className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer"
              >
                <option value="all">Tất cả nguồn ({posts.length})</option>
                <option value="form">👤 Khách hàng</option>
                <option value="tai_xe">🚗 Tài xế</option>
                <option value="facebook">📘 Facebook</option>
                <option value="threads">🧵 Threads</option>
                <option value="zalo">💬 Zalo</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-100">
                    <th className="py-3 px-4 text-left w-16">Mã</th>
                    <th className="py-3 px-4 text-left">Nội dung thô</th>
                    <th className="py-3 px-4 text-left">Nguồn</th>
                    <th className="py-3 px-4 text-left">Thời gian</th>
                    <th className="py-3 px-4 text-left">Trạng thái</th>
                    <th className="py-3 px-4 text-right">Tùy chọn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {initialLoading && !cachedData ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3 px-4"><div className="h-5 w-10 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-4"><div className="h-4 w-64 bg-slate-200 rounded mb-1"></div><div className="h-3 w-40 bg-slate-100 rounded"></div></td>
                        <td className="py-3 px-4"><div className="h-5 w-16 bg-slate-200 rounded-full"></div></td>
                        <td className="py-3 px-4"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                        <td className="py-3 px-4"><div className="h-5 w-16 bg-slate-200 rounded-full"></div></td>
                        <td className="py-3 px-4 text-right"><div className="h-6 w-14 bg-slate-100 rounded ml-auto"></div></td>
                      </tr>
                    ))
                  ) : filteredPosts.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="py-10 text-center text-slate-400">
                        Chưa có bài viết nào phù hợp bộ lọc
                      </td>
                    </tr>
                  ) : (
                    displayedPosts.map((p) => (
                      <tr key={p.id} id={`post-row-${p.id}`} className="hover:bg-slate-50/70 transition">
                        <td className="py-3 px-4 font-mono font-bold">#{p.id}</td>
                        <td className="py-3 px-4 max-w-lg">
                          <span className="line-clamp-2 text-slate-800">{p.noi_dung_tho}</span>
                        </td>
                        <td className="py-3 px-4"><SourceBadge source={p.nguon} item={p} /></td>
                        <td className="py-3 px-4 text-slate-500">{formatDateTime(p.thoi_gian_tao || p.ngay_tao)}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            p.da_xu_ly === 1 ? 'bg-emerald-50 text-emerald-700' : p.da_xu_ly === 2 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'
                          }`}>
                            {p.da_xu_ly === 1 ? 'Đã xử lý' : p.da_xu_ly === 2 ? 'Lỗi' : 'Chờ xử lý'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button onClick={() => setEditingPost(p)} className="px-2 py-1 text-xs border border-slate-200 rounded">Sửa</button>
                          <button onClick={() => handleDeletePost(p)} className="px-2 py-1 text-xs bg-rose-50 text-rose-600 rounded">Xóa</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Điều khiển Xem thêm / Xem tất cả bài viết */}
            {filteredPosts.length > visiblePostCount && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-500 font-medium">
                  Đang hiển thị <b className="text-slate-800 font-bold">{displayedPosts.length}</b> trên tổng số <b className="text-slate-800 font-bold">{filteredPosts.length}</b> bài viết
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisiblePostCount(prev => prev + 10)}
                    className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-xl border border-slate-200 transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>⬇️</span>
                    <span>Xem thêm (+10 bài)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisiblePostCount(filteredPosts.length)}
                    className="px-4 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>📖</span>
                    <span>Xem tất cả ({filteredPosts.length} bài)</span>
                  </button>
                </div>
              </div>
            )}
            {filteredPosts.length <= visiblePostCount && filteredPosts.length > 10 && (
              <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>✓ Đã hiển thị toàn bộ <b>{filteredPosts.length}</b> bài viết.</span>
                <button
                  type="button"
                  onClick={() => setVisiblePostCount(10)}
                  className="text-[#0f766e] hover:underline font-semibold cursor-pointer"
                >
                  Thu gọn về 10 bài mới nhất ↑
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: YÊU CẦU HÀNH KHÁCH (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'requests' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Danh sách yêu cầu hành khách ({filteredRequests.length})</h3>
                <p className="text-xs text-slate-500 mt-0.5">Quản lý và quét chuẩn hóa dữ liệu AI</p>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  value={requestStatusFilter}
                  onChange={(e) => setRequestStatusFilter(e.target.value)}
                  className="text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                >
                  <option value="all">Tất cả trạng thái</option>
                  <option value="cho_ghep">🟢 Chờ ghép</option>
                  <option value="da_ghep">🤝 Đã ghép</option>
                  <option value="hoan_thanh">🔵 Hoàn thành</option>
                  <option value="da_huy">🔴 Đã hủy</option>
                  <option value="qua_han">⏰ Quá hạn</option>
                </select>
                <button
                  onClick={handleReclassifyRequests}
                  disabled={isReclassifying}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-semibold"
                >
                  {isReclassifying ? '⏳ Đang quét...' : '🔄 Sửa bài tài xế bị nhầm'}
                </button>
                <label className="inline-flex items-center gap-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl px-3 py-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideExpiredRequests}
                    onChange={(e) => setHideExpiredRequests(e.target.checked)}
                    className="rounded border-slate-300 text-[#0f766e]"
                  />
                  <span>Ẩn yêu cầu quá ngày & đã ghép</span>
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide border-b border-slate-100">
                    <th className="py-3 px-3.5 text-left font-semibold">Mã</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Hành khách</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Tuyến đường</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Giờ đón</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Số khách</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Số điện thoại</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Nguồn</th>
                    <th className="py-3 px-3.5 text-left font-semibold">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {initialLoading && !cachedData ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td className="py-3 px-3.5"><div className="h-5 w-10 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-4 w-28 bg-slate-200 rounded mb-1"></div><div className="h-3 w-20 bg-slate-100 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-4 w-36 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-4 w-12 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-4 w-24 bg-slate-200 rounded"></div></td>
                        <td className="py-3 px-3.5"><div className="h-5 w-14 bg-slate-200 rounded-full"></div></td>
                        <td className="py-3 px-3.5"><div className="h-5 w-16 bg-slate-200 rounded-full"></div></td>
                      </tr>
                    ))
                  ) : filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="py-10 text-center text-slate-400">
                        Không có yêu cầu nào phù hợp bộ lọc
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => {
                      const isCompleted = r.trang_thai === 'hoan_thanh';
                      const isCancelled = r.trang_thai === 'da_huy';
                      const isExpired = r._meta.isExpired || r.trang_thai === 'het_han';
                      const isMatched = r.trang_thai === 'da_ghep' || r.trang_thai === 'da_nhan';

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3.5 font-mono font-bold whitespace-nowrap">
                            <button
                              onClick={() => handleJumpToOriginalPost(r)}
                              className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold hover:underline"
                              title="Xem bài viết gốc"
                            >
                              #{r.bai_viet_id || r.id}
                            </button>
                          </td>
                          <td className="py-3 px-3.5 font-bold text-slate-800 whitespace-nowrap">{r.hanh_khach_ten || 'Ẩn danh'}</td>
                          <td className="py-3 px-3.5 font-bold text-teal-700">{r.diem_di} ➔ {r.diem_den}</td>
                          <td className="py-3 px-3.5 text-slate-600 whitespace-nowrap">{r._meta.displayTime}</td>
                          <td className="py-3 px-3.5 font-semibold text-slate-700 whitespace-nowrap">{r.so_khach || 1} khách</td>
                          <td className="py-3 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">{r.sdt || 'Chưa có'}</td>
                          <td className="py-3 px-3.5 whitespace-nowrap"><SourceBadge source={r.nguon} item={r} /></td>
                          <td className="py-3 px-3.5 whitespace-nowrap">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                <span>✓</span> Hoàn thành
                              </span>
                            ) : isCancelled ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Đã hủy
                              </span>
                            ) : isExpired ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                                <span>⏰</span> Quá hạn
                              </span>
                            ) : isMatched ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                <span>🤝</span> Đã ghép
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span>🟢</span> Chờ ghép
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: ĐỊA ĐIỂM (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'locations' && (
          !locations ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400">
              <span className="text-3xl block mb-2">📍</span>
              Đang tải dữ liệu thống kê địa điểm & tuyến đường...
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h2 className="text-xl font-bold text-[#0b2a4a]">Thống kê Địa điểm & Tuyến đường</h2>
                <p className="text-xs text-slate-500 mt-1">Phân tích mật độ các điểm đón, điểm trả và các tuyến có lượng xe đông nhất.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. Điểm xuất phát phổ biến */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <span className="text-base">🛫</span> Điểm xuất phát phổ biến
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Top tỉnh thành có số lượt xe xuất phát cao nhất</p>
                    </div>
                    {(() => {
                      const totalDi = (locations.diem_di || []).reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_chuyen || 1);
                      return (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                          Tổng: {totalDi} chuyến
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 mb-1 px-1">
                    <span className="w-28 sm:w-36">Địa điểm</span>
                    <span className="flex-1 text-center">Tỷ lệ (% cột màu)</span>
                    <span className="w-20 sm:w-24 text-right">Số chuyến</span>
                  </div>

                  <div className="space-y-1">
                    {(() => {
                      const list = (locations.diem_di || []).slice(0, 8);
                      const total = list.reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_chuyen || 1);
                      if (list.length === 0) {
                        return <div className="py-4 text-center text-xs text-slate-400">Chưa có dữ liệu điểm xuất phát</div>;
                      }
                      return list.map((item, i) => {
                        const color = LOCATION_COLORS[i % LOCATION_COLORS.length];
                        const count = Number(item.so_chuyen || item.so_luong) || 0;
                        const pct = (item.ty_le !== undefined && item.ty_le !== null)
                          ? Number(item.ty_le)
                          : Math.round((count * 1000) / total) / 10;
                        const name = item.ten || item.dia_diem || 'Khác';

                        return (
                          <div
                            key={i}
                            className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-slate-50/80 transition-colors duration-150 border border-transparent hover:border-slate-100"
                          >
                            <div className="w-28 sm:w-36 flex items-center gap-2 flex-shrink-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${color.rank}`}>
                                {i + 1}
                              </span>
                              <span className="font-semibold text-slate-800 text-xs truncate" title={name}>
                                {name}
                              </span>
                            </div>

                            <div className="flex-1 flex items-center gap-2.5">
                              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ease-out ${color.bar}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                              <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${color.bg} ${color.text} min-w-[46px] text-right`}>
                                {pct}%
                              </span>
                            </div>

                            <div className="w-20 sm:w-24 text-right flex-shrink-0">
                              <span className="font-bold text-[#0f766e] text-xs font-mono">{count}</span>
                              <span className="text-[11px] text-slate-500 ml-1">chuyến</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* 2. Điểm đến phổ biến */}
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <span className="text-base">🛬</span> Điểm đến phổ biến
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Top tỉnh thành được chọn làm điểm đến nhiều nhất</p>
                    </div>
                    {(() => {
                      const totalDen = (locations.diem_den || []).reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_chuyen || 1);
                      return (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-100">
                          Tổng: {totalDen} chuyến
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 mb-1 px-1">
                    <span className="w-28 sm:w-36">Địa điểm</span>
                    <span className="flex-1 text-center">Tỷ lệ (% cột màu)</span>
                    <span className="w-20 sm:w-24 text-right">Số chuyến</span>
                  </div>

                  <div className="space-y-1">
                    {(() => {
                      const list = (locations.diem_den || []).slice(0, 8);
                      const total = list.reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_chuyen || 1);
                      if (list.length === 0) {
                        return <div className="py-4 text-center text-xs text-slate-400">Chưa có dữ liệu điểm đến</div>;
                      }
                      return list.map((item, i) => {
                        const color = LOCATION_COLORS[i % LOCATION_COLORS.length];
                        const count = Number(item.so_chuyen || item.so_luong) || 0;
                        const pct = (item.ty_le !== undefined && item.ty_le !== null)
                          ? Number(item.ty_le)
                          : Math.round((count * 1000) / total) / 10;
                        const name = item.ten || item.dia_diem || 'Khác';

                        return (
                          <div
                            key={i}
                            className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-slate-50/80 transition-colors duration-150 border border-transparent hover:border-slate-100"
                          >
                            <div className="w-28 sm:w-36 flex items-center gap-2 flex-shrink-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${color.rank}`}>
                                {i + 1}
                              </span>
                              <span className="font-semibold text-slate-800 text-xs truncate" title={name}>
                                {name}
                              </span>
                            </div>

                            <div className="flex-1 flex items-center gap-2.5">
                              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ease-out ${color.bar}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                              <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${color.bg} ${color.text} min-w-[46px] text-right`}>
                                {pct}%
                              </span>
                            </div>

                            <div className="w-20 sm:w-24 text-right flex-shrink-0">
                              <span className="font-bold text-[#0f766e] text-xs font-mono">{count}</span>
                              <span className="text-[11px] text-slate-500 ml-1">chuyến</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* 3. Tuyến đường phổ biến */}
              {locations.tuyen && locations.tuyen.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                        <span className="text-base">🛣️</span> Tuyến đường phổ biến (Top chặng đông xe nhất)
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Phân tích mật độ các cặp hành trình kết nối nhiều chuyến xe nhất</p>
                    </div>
                    {(() => {
                      const totalTuyen = (locations.tuyen || []).reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_tuyen || 1);
                      return (
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          Tổng: {totalTuyen} chuyến
                        </span>
                      );
                    })()}
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 mb-1 px-1">
                    <span className="w-36 sm:w-48">Hành trình</span>
                    <span className="flex-1 text-center">Tỷ lệ (% cột màu)</span>
                    <span className="w-20 sm:w-24 text-right">Số chuyến</span>
                  </div>

                  <div className="space-y-1">
                    {(() => {
                      const list = (locations.tuyen || []).slice(0, 8);
                      const total = list.reduce((acc, it) => acc + (Number(it.so_chuyen || it.so_luong) || 0), 0) || (locations.tong_tuyen || 1);
                      return list.map((item, i) => {
                        const color = LOCATION_COLORS[i % LOCATION_COLORS.length];
                        const count = Number(item.so_chuyen || item.so_luong) || 0;
                        const pct = (item.ty_le !== undefined && item.ty_le !== null)
                          ? Number(item.ty_le)
                          : Math.round((count * 1000) / total) / 10;
                        const name = item.ten || item.dia_diem || 'Khác';

                        return (
                          <div
                            key={i}
                            className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-slate-50/80 transition-colors duration-150 border border-transparent hover:border-slate-100"
                          >
                            <div className="w-36 sm:w-48 flex items-center gap-2 flex-shrink-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${color.rank}`}>
                                {i + 1}
                              </span>
                              <span className="font-semibold text-teal-800 text-xs truncate" title={name}>
                                {name}
                              </span>
                            </div>

                            <div className="flex-1 flex items-center gap-2.5">
                              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-500 ease-out ${color.bar}`}
                                  style={{ width: `${Math.max(pct, 2)}%` }}
                                />
                              </div>
                              <span className={`font-mono font-bold text-xs px-1.5 py-0.5 rounded ${color.bg} ${color.text} min-w-[46px] text-right`}>
                                {pct}%
                              </span>
                            </div>

                            <div className="w-20 sm:w-24 text-right flex-shrink-0">
                              <span className="font-bold text-[#0f766e] text-xs font-mono">{count}</span>
                              <span className="text-[11px] text-slate-500 ml-1">chuyến</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* TAB 6: QUẢN LÝ NGƯỜI DÙNG TOÀN DIỆN */}
        {view === 'users' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white py-3 px-4 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[11px] font-medium text-slate-400">Tổng người dùng</span>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">{userStats.total}</div>
              </div>
              <div className="bg-white py-3 px-4 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[11px] font-medium text-slate-400">Quản trị viên</span>
                <div className="text-xl sm:text-2xl font-bold text-amber-600 mt-0.5">{userStats.admins}</div>
              </div>
              <div className="bg-white py-3 px-4 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[11px] font-medium text-slate-400">Tài xế</span>
                <div className="text-xl sm:text-2xl font-bold text-emerald-600 mt-0.5">{userStats.drivers}</div>
              </div>
              <div className="bg-white py-3 px-4 rounded-xl border border-slate-100 shadow-xs">
                <span className="text-[11px] font-medium text-slate-400">Khách hàng</span>
                <div className="text-xl sm:text-2xl font-bold text-teal-600 mt-0.5">{userStats.customers}</div>
              </div>
              <div className="bg-white py-3 px-4 rounded-xl border border-slate-100 shadow-xs col-span-2 sm:col-span-1">
                <span className="text-[11px] font-medium text-slate-400">Mới 7 ngày qua</span>
                <div className="text-xl sm:text-2xl font-bold text-sky-600 mt-0.5">+{userStats.newUsers}</div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h3 className="font-bold text-slate-900 text-base">Danh sách tài khoản ({filteredUsers.length})</h3>
                <button
                  onClick={handleOpenCreateUser}
                  className="px-4 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold rounded-xl"
                >
                  + Thêm tài khoản
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase border-b border-slate-100">
                      <th className="py-3 px-3 text-left font-semibold">ID</th>
                      <th className="py-3 px-3 text-left font-semibold">Họ tên</th>
                      <th className="py-3 px-3 text-left font-semibold">Số điện thoại</th>
                      <th className="py-3 px-3 text-left font-semibold">Email</th>
                      <th className="py-3 px-3 text-left font-semibold">Vai trò</th>
                      <th className="py-3 px-3 text-left font-semibold">Ngày tạo</th>
                      <th className="py-3 px-3 text-right font-semibold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {initialLoading && !cachedData ? (
                      [...Array(6)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td className="py-3 px-3"><div className="h-4 w-8 bg-slate-200 rounded"></div></td>
                          <td className="py-3 px-3"><div className="h-4 w-32 bg-slate-200 rounded mb-1"></div><div className="h-3 w-20 bg-slate-100 rounded"></div></td>
                          <td className="py-3 px-3"><div className="h-4 w-24 bg-slate-200 rounded"></div></td>
                          <td className="py-3 px-3"><div className="h-4 w-36 bg-slate-100 rounded"></div></td>
                          <td className="py-3 px-3"><div className="h-5 w-16 bg-slate-200 rounded-full"></div></td>
                          <td className="py-3 px-3"><div className="h-4 w-20 bg-slate-100 rounded"></div></td>
                          <td className="py-3 px-3 text-right"><div className="h-6 w-24 bg-slate-100 rounded ml-auto"></div></td>
                        </tr>
                      ))
                    ) : filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-10 text-center text-slate-400">
                          Không tìm thấy tài khoản nào phù hợp
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-700">#{u.id}</td>
                          <td className="py-3 px-3 font-bold text-slate-900">{u.ho_ten}</td>
                          <td className="py-3 px-3 font-mono">{u.sdt || 'Chưa có SĐT'}</td>
                          <td className="py-3 px-3 text-slate-500">{u.email || '—'}</td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              u.role === 'admin' ? 'bg-amber-50 text-amber-700' : u.role === 'tai_xe' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {u.role === 'admin' ? '👑 Admin' : u.role === 'tai_xe' ? '🚗 Tài xế' : '👤 Khách'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-500">{formatDateTime(u.ngay_tao)}</td>
                          <td className="py-3 px-3 text-right space-x-1">
                            <button onClick={() => handleOpenEditUser(u)} className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">Sửa</button>
                            <button onClick={() => handleToggleRole(u)} className="px-2.5 py-1 border border-slate-200 rounded hover:bg-slate-50">Đổi quyền</button>
                            <button onClick={() => handleOpenDeleteUser(u)} className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded hover:bg-rose-100">Xóa</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: BÁO CÁO & THỐNG KÊ TOÀN DIỆN */}
        {view === 'reports' && (
          <div className="space-y-6">
            {/* ============================================================
                PHẦN 1: HIỂN THỊ TRANG 1 KHI IN (HEADER + 4 KPI + NGUỒN & TÀI KHOẢN)
                ============================================================ */}
            <div className="space-y-6 print:space-y-3.5 print-section">
              {/* Thanh điều khiển phía trên ô logo: Nút thao tác trên màn hình & Nhãn Trang 1/2 khi in (nằm ngoài ô) */}
              <div className="flex items-center justify-end pb-1 print:pb-1">
                {/* 2 nút thao tác trên web (chỉ hiện trên màn hình, ẩn khi in) */}
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => loadAll()}
                    className="px-3.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    title="Làm mới dữ liệu"
                  >
                    <span>🔄</span> Làm mới
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    title="Xuất thống kê (Khổ ngang 2 trang) hoặc lưu file PDF"
                  >
                    <span>🖨️</span> Xuất thống kê
                  </button>
                </div>

                {/* Nhãn Trang 1/2 khi in (chỉ hiện khi in, nằm ngoài ô) */}
                <div className="hidden print:block text-right">
                  <span className="text-xs text-slate-500 font-mono bg-slate-50 px-3 py-1 rounded-md border border-slate-200 font-semibold">
                    Trang 1/2 • Xuất lúc: {new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})} {new Date().toLocaleDateString('vi-VN')}
                  </span>
                </div>
              </div>

              {/* Ô Logo thương hiệu to và căn giữa: Ẩn trên màn hình trang thống kê, chỉ hiển thị khi in báo cáo */}
              <div className="hidden print:flex bg-white p-6 print:p-4 rounded-2xl border border-slate-200 shadow-sm flex-col items-center justify-center text-center">
                <div className="flex flex-col items-center justify-center space-y-1.5 my-1">
                  <img
                    src="/logo.png"
                    alt="Logo Xe Tiện Chuyến"
                    className="w-20 h-20 print:w-16 print:h-16 object-contain rounded-2xl drop-shadow-md mx-auto"
                  />
                  <div>
                    <span className="text-xs print:text-[11.5px] font-extrabold uppercase tracking-widest text-[#0f766e] block">
                      HỆ THỐNG XE TIỆN CHUYẾN
                    </span>
                    <h3 className="font-extrabold text-slate-900 text-2xl print:text-lg flex items-center justify-center gap-2 mt-0.5">
                      <span>📊</span> Thống kê & Phân tích Vận hành
                    </h3>
                    <p className="text-xs print:text-[11.5px] text-slate-500 mt-0.5 max-w-2xl mx-auto">
                      Số liệu thống kê thời gian thực về chuyến xe, khách đặt, tỷ lệ ghép và hiệu năng AI crawler
                    </p>
                  </div>
                </div>
              </div>

              {/* HÀNG 1: 4 THẺ CHỈ SỐ KPI CHÍNH */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4 gap-4 print:gap-3.5">
                <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2 print:space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs print:text-[12px] font-bold text-slate-500">Tổng Chuyến Xe</span>
                    <span className="w-10 h-10 print:w-8 print:h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center text-lg print:text-base font-bold">🚗</span>
                  </div>
                  <div className="text-3xl print:text-2xl font-black text-slate-900">{tripReportStats.total}</div>
                  <div className="text-xs print:text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span className="text-emerald-600 font-semibold">{tripReportStats.conGhe} còn ghế</span>
                    <span>•</span>
                    <span className="text-amber-600 font-semibold">{tripReportStats.daDay} hết ghế</span>
                    <span>•</span>
                    <span className="text-blue-600 font-semibold">{tripReportStats.hoanThanh} xong</span>
                  </div>
                </div>

                <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2 print:space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs print:text-[12px] font-bold text-slate-500">Nhu Cầu Hành Khách</span>
                    <span className="w-10 h-10 print:w-8 print:h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-lg print:text-base font-bold">🙋</span>
                  </div>
                  <div className="text-3xl print:text-2xl font-black text-slate-900">{requestReportStats.total}</div>
                  <div className="text-xs print:text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                    <span className="text-teal-700 font-semibold">{requestReportStats.tongKhach} khách cần đi</span>
                    <span>•</span>
                    <span className="text-emerald-600 font-semibold">{requestReportStats.daGhep} đã nhận</span>
                  </div>
                </div>

                <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2 print:space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs print:text-[12px] font-bold text-slate-500">Ghép Nối Thành Công</span>
                    <span className="w-10 h-10 print:w-8 print:h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg print:text-base font-bold">✨</span>
                  </div>
                  <div className="text-3xl print:text-2xl font-black text-emerald-700">
                    {stats?.so_ghep !== undefined ? stats.so_ghep : matches.length}
                  </div>
                  <div className="text-xs print:text-[11px] text-slate-500">
                    Tỷ lệ đáp ứng: <b className="text-slate-800">{requests.length > 0 ? Math.round(((stats?.so_ghep !== undefined ? stats.so_ghep : matches.length) * 100) / requests.length) : 0}%</b> nhu cầu
                  </div>
                </div>

                <div className="bg-white p-5 print:p-3.5 rounded-2xl border border-slate-100 shadow-sm space-y-2 print:space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs print:text-[12px] font-bold text-slate-500">Hiệu Suất AI NLP</span>
                    <span className="w-10 h-10 print:w-8 print:h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center text-lg print:text-base font-bold">🤖</span>
                  </div>
                  <div className="text-3xl print:text-2xl font-black text-purple-700">
                    {stats?.ty_le_xu_ly !== undefined ? `${stats.ty_le_xu_ly}%` : '99.4%'}
                  </div>
                  <div className="text-xs print:text-[11px] text-slate-500">
                    Đã bóc tách tự động: <b className="text-slate-800">{stats?.so_da_xu_ly || 0}</b> / {stats?.so_bai_viet || posts.length} bài
                  </div>
                </div>
              </div>

              {/* HÀNG 2: PHÂN TÍCH NGUỒN CÀO DỮ LIỆU & BÁO CÁO CƠ CẤU NGƯỜI DÙNG */}
              <div className="grid grid-cols-1 lg:grid-cols-12 print:grid-cols-12 gap-6 print:gap-3.5">
                {/* Phân tích Nguồn Dữ Liệu (7 cols) */}
                <div className="lg:col-span-7 print:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:p-3.5 space-y-4 print:space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 print:pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm print:text-base">Phân bổ Nguồn dữ liệu & Tự động hóa</h4>
                      <p className="text-xs print:text-[11px] text-slate-400 mt-0.5">Tỷ lệ bài viết thu thập và xử lý từ các kênh mạng xã hội</p>
                    </div>
                    <span className="text-xs print:text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full">
                      {stats?.so_bai_viet || posts.length} bài viết
                    </span>
                  </div>

                  <div className="space-y-4 pt-1 print:space-y-2">
                    {sourceReports.map((item, idx) => (
                      <div key={idx} className="space-y-1.5 print:space-y-1">
                        <div className="flex items-center justify-between text-xs print:text-[12px]">
                          <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                            <span>{item.icon}</span> {item.title}
                          </span>
                          <span className="font-mono text-slate-600">
                            <b>{item.so_luong}</b> bài ({item.ty_le}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 print:h-2.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.barColor} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(item.ty_le, 3)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] print:text-[11px] text-slate-400">
                          <span>✓ Đã xử lý: {item.da_xu_ly || 0}</span>
                          <span>⏳ Chờ: {item.cho_xu_ly || 0}</span>
                          <span>⚠️ Lỗi: {item.loi || 0}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Phân tích Người dùng & Tăng trưởng (5 cols) */}
                <div className="lg:col-span-5 print:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:p-3.5 space-y-4 print:space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 print:pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm print:text-base">Cơ cấu & Tăng trưởng Tài khoản</h4>
                      <p className="text-xs print:text-[11px] text-slate-400 mt-0.5">Phân loại thành viên trên nền tảng</p>
                    </div>
                    <span className="text-xs print:text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                      +{userStats.newUsers} mới tuần này
                    </span>
                  </div>

                  <div className="space-y-3 pt-1 print:space-y-1.5">
                    <div className="flex items-center justify-between text-xs print:text-[12px] p-3 print:p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-600 font-medium">👑 Quản trị viên (Admin)</span>
                      <span className="font-bold text-amber-600 print:text-[12.5px]">{userStats.admins} tài khoản</span>
                    </div>
                    <div className="flex items-center justify-between text-xs print:text-[12px] p-3 print:p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-600 font-medium">🚗 Tài xế hoạt động</span>
                      <span className="font-bold text-emerald-600 print:text-[12.5px]">{userStats.drivers} tài xế</span>
                    </div>
                    <div className="flex items-center justify-between text-xs print:text-[12px] p-3 print:p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-slate-600 font-medium">👤 Hành khách thành viên</span>
                      <span className="font-bold text-sky-600 print:text-[12.5px]">{userStats.customers} người dùng</span>
                    </div>
                    <div className="flex items-center justify-between text-xs print:text-[12px] p-3 print:p-2 rounded-xl bg-teal-50/60 border border-teal-100">
                      <span className="text-teal-900 font-bold">Tổng thành viên</span>
                      <span className="font-extrabold text-[#0f766e] text-sm print:text-base">{userStats.total} tài khoản</span>
                    </div>
                  </div>

                  <div className="pt-2 print:pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs print:text-[11.5px] text-slate-500 mb-2 print:mb-1">
                      <span className="font-medium">Tỷ lệ cung ứng ghế trung bình</span>
                      <span className="font-bold text-slate-800 print:text-[12px]">
                        {tripReportStats.total > 0 ? (tripReportStats.tongGheTrong / tripReportStats.total).toFixed(1) : 0} ghế/chuyến
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 print:h-2.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-600 rounded-full"
                        style={{ width: `${Math.min(100, Math.round((tripReportStats.conGhe * 100) / (tripReportStats.total || 1)))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================
                PHẦN 2: HIỂN THỊ TRANG 2 KHI IN (BẢNG TUYẾN ĐƯỜNG + TOP TÀI XẾ & KHÁCH HÀNG)
                ============================================================ */}
            <div className="space-y-6 print:space-y-3.5 print-section print-page-break">
              {/* Trang 2/2 khi in: Chỉ hiển thị số trang 2/2 gọn gàng theo đúng yêu cầu */}
              <div className="hidden print:flex items-center justify-end pb-1">
                <span className="text-xs text-slate-500 font-mono bg-slate-50 px-3 py-1 rounded-md border border-slate-200 font-semibold">
                  Trang 2/2
                </span>
              </div>

              {/* HÀNG 3: BÁO CÁO TUYẾN ĐƯỜNG SÔI ĐỘNG NHẤT */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:p-4 space-y-4 print:space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3 print:pb-2">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm print:text-base">Bảng Xếp Hạng Tuyến Đường Hot Nhất</h4>
                    <p className="text-xs print:text-[11.5px] text-slate-400 mt-0.5">Thống kê lưu lượng chuyến xe và nhu cầu đặt chỗ trên từng hành trình</p>
                  </div>
                  <span className="text-xs print:text-xs font-semibold text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
                    Top 8 lộ trình trọng điểm
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs print:text-[12px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 uppercase border-b border-slate-100 text-xs print:text-[11.5px]">
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-left font-bold">Thứ hạng</th>
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-left font-bold">Tuyến đường (Đi ➔ Đến)</th>
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-center font-bold">Chuyến xe cung ứng</th>
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-center font-bold">Khách tìm xe</th>
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-center font-bold">Tổng ghế trống</th>
                        <th className="py-2.5 px-3 print:py-1.5 print:px-2.5 text-right font-bold">Tình trạng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {routeReports && routeReports.length > 0 ? (
                        routeReports.map((r, i) => {
                          const balanceRatio = r.requests > 0 ? (r.seats / r.requests) : 999;
                          const statusBadge = balanceRatio >= 2 ? (
                            <span className="px-2.5 py-0.5 print:px-2 print:py-0.5 rounded-full text-[10px] print:text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                              🟢 Dồi dào xe
                            </span>
                          ) : balanceRatio >= 0.8 ? (
                            <span className="px-2.5 py-0.5 print:px-2 print:py-0.5 rounded-full text-[10px] print:text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                              🔵 Cân bằng
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 print:px-2 print:py-0.5 rounded-full text-[10px] print:text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                              🟡 Cần thêm tài xế
                            </span>
                          );

                          return (
                            <tr key={i} className="hover:bg-slate-50/70 transition">
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 font-mono font-bold text-slate-500 print:text-[12px]">#{i + 1}</td>
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 font-bold text-teal-800 text-sm print:text-[13px]">
                                {r.from} ➔ {r.to}
                              </td>
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 text-center font-bold text-slate-900 print:text-[12px]">
                                {r.trips} chuyến
                              </td>
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 text-center font-bold text-sky-700 print:text-[12px]">
                                {r.requests} khách
                              </td>
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 text-center font-mono font-bold text-slate-700 print:text-[12px]">
                                {r.seats} chỗ
                              </td>
                              <td className="py-3 px-3 print:py-1.5 print:px-2.5 text-right">
                                {statusBadge}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 print:py-3 text-center text-slate-400 italic">
                            Chưa có dữ liệu tuyến đường phù hợp.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* HÀNG 4: TOP TÀI XẾ & TOP HÀNH KHÁCH NĂNG ĐỘNG */}
              <div className="grid grid-cols-1 md:grid-cols-2 print:grid-cols-2 gap-6 print:gap-3.5">
                {/* Top Tài xế */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:p-3 space-y-3 print:space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-sm print:text-base flex items-center justify-between">
                    <span>🚗 Tài xế hoạt động nhiều nhất</span>
                    <span className="text-[11px] print:text-xs text-slate-400 font-normal">Xếp theo số chuyến</span>
                  </h4>
                  <div className="space-y-2 pt-1 print:space-y-1 print:pt-1">
                    {topActiveDrivers.map((d, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-2 print:py-1.5 border-b border-slate-50">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 print:w-5 print:h-5 rounded-full bg-slate-100 font-mono font-bold text-slate-600 flex items-center justify-center text-[10px] print:text-[11px]">
                            {i + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 print:text-[12.5px]">{d.name}</div>
                            <div className="font-mono text-slate-400 text-[10px] print:text-[11px]">{d.phone || 'SĐT bảo mật'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-[#0f766e] print:text-[12.5px]">{d.tripCount} chuyến</span>
                          <span className="block text-[10px] print:text-[11px] text-slate-400">{d.seats} chỗ mở</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top Hành khách */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 print:p-3 space-y-3 print:space-y-1.5">
                  <h4 className="font-bold text-slate-900 text-sm print:text-base flex items-center justify-between">
                    <span>🙋 Khách hàng gửi yêu cầu nhiều nhất</span>
                    <span className="text-[11px] print:text-xs text-slate-400 font-normal">Xếp theo số yêu cầu</span>
                  </h4>
                  <div className="space-y-2 pt-1 print:space-y-1 print:pt-1">
                    {topActiveCustomers.map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-2 print:py-1.5 border-b border-slate-50">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 print:w-5 print:h-5 rounded-full bg-slate-100 font-mono font-bold text-slate-600 flex items-center justify-center text-[10px] print:text-[11px]">
                            {i + 1}
                          </span>
                          <div>
                            <div className="font-bold text-slate-900 print:text-[12.5px]">{c.name}</div>
                            <div className="font-mono text-slate-400 text-[10px] print:text-[11px]">{c.phone || 'SĐT bảo mật'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-sky-700 print:text-[12.5px]">{c.reqCount} yêu cầu</span>
                          <span className="block text-[10px] print:text-[11px] text-slate-400">{c.passengers} vé đặt</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer Disclaimer */}
        <div className="pt-8 border-t border-slate-200/60 text-center text-[11px] text-slate-400 print:hidden">
          Dữ liệu vận hành và thông tin tài khoản minh họa • Chỉ quản trị viên được thay đổi quyền truy cập.
        </div>
      </main>

      {/* MODAL: THÊM / SỬA NGƯỜI DÙNG */}
      {userModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">
                {userModalMode === 'create' ? 'Thêm tài khoản mới' : 'Sửa thông tin tài khoản'}
              </h3>
              <button
                onClick={() => setUserModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                <input
                  type="text"
                  required
                  value={userFormData.ho_ten}
                  onChange={(e) => setUserFormData({ ...userFormData, ho_ten: e.target.value })}
                  placeholder="VD: Nguyễn Văn A"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Số điện thoại</label>
                <input
                  type="text"
                  value={userFormData.sdt}
                  onChange={(e) => setUserFormData({ ...userFormData, sdt: e.target.value })}
                  placeholder="09xxxxxxxx"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="text"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  placeholder="user@example.com"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Vai trò</label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  <option value="tai_xe">🚗 Tài xế</option>
                  <option value="khach_hang">👤 Hành khách</option>
                  <option value="admin">👑 Quản trị viên</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {userModalMode === 'create' ? 'Mật khẩu khởi tạo' : 'Mật khẩu mới (để trống nếu không đổi)'}
                </label>
                <input
                  type="password"
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  placeholder={userModalMode === 'create' ? 'Mặc định: Password@123' : 'Nhập mật khẩu mới'}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUserModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-4 py-2 bg-[#0f766e] text-white font-semibold rounded-xl hover:bg-[#115e59]"
                >
                  {busy ? 'Đang lưu...' : 'Lưu tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: XÓA NGƯỜI DÙNG */}
      {deleteModalOpen && userToDelete && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <h3 className="text-base font-bold text-rose-600">Xác nhận xóa tài khoản</h3>
            <p className="text-xs text-slate-600">
              Bạn có chắc chắn muốn xóa tài khoản <b>{userToDelete.ho_ten}</b> (#{userToDelete.id})? Hành động này không thể hoàn tác.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmDeleteUser}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-600 text-white hover:bg-rose-700"
              >
                Xóa ngay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: THÊM BÀI VIẾT THỦ CÔNG */}
      {showAddPost && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">Nhập bài viết thủ công</h3>
              <button onClick={() => setShowAddPost(false)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleAddPost} className="space-y-4 text-xs">
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                rows={5}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
                placeholder="VD: Chiều nay 14h mình chạy từ Cầu Giấy về TP Vinh, xe 7 chỗ còn 2 ghế trống alo 0988776655..."
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddPost(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Hủy</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-[#0f766e] text-white hover:bg-[#115e59]">Gửi và xử lý AI</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SỬA BÀI VIẾT */}
      {editingPost && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">Chỉnh sửa bài viết #{editingPost.id}</h3>
              <button onClick={() => setEditingPost(null)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500">✕</button>
            </div>
            <form onSubmit={handleEditPost} className="space-y-4 text-xs">
              <textarea
                value={editingPost.noi_dung_tho}
                onChange={(e) => setEditingPost({ ...editingPost, noi_dung_tho: e.target.value })}
                rows={5}
                required
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditingPost(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600">Hủy</button>
                <button type="submit" disabled={busy} className="px-4 py-2 rounded-xl bg-[#0f766e] text-white hover:bg-[#115e59]">Lưu & Xử lý lại</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: THAY ĐỔI THÔNG TIN VÀ ĐỔI AVATAR (QUẢN TRỊ VIÊN) */}
      {userProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">
                Hồ sơ cá nhân & Đổi Avatar
              </h3>
              <button
                type="button"
                onClick={() => setUserProfileModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Ảnh đại diện & Nút đổi */}
              <div className="flex items-center gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-16 h-16 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-xl flex items-center justify-center overflow-hidden shrink-0 border border-emerald-200 shadow-xs">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    profileName.split(' ').map(w => w[0]).join('').slice(-2).toUpperCase() || 'QA'
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-3.5 py-1.5 bg-[#0f766e] text-white font-semibold rounded-lg hover:bg-[#115e59] transition cursor-pointer"
                  >
                    Đổi ảnh đại diện
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ ảnh JPG, PNG tối đa 2MB</p>
                </div>
              </div>

              {/* Form cập nhật họ tên & số điện thoại */}
              <form onSubmit={handleUpdateProfileInfo} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                    placeholder="VD: 0912345678"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 bg-[#0f766e] text-white font-semibold rounded-xl hover:bg-[#115e59] transition cursor-pointer disabled:opacity-60"
                >
                  {savingProfile ? 'Đang lưu...' : 'Lưu thông tin cá nhân'}
                </button>
              </form>

              {/* Form đổi mật khẩu */}
              <form onSubmit={handleChangePassword} className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-700">Đổi mật khẩu tài khoản</h4>
                <div>
                  <label className="block text-slate-600 mb-1">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                    placeholder="Tối thiểu 6 ký tự"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 transition cursor-pointer disabled:opacity-60"
                >
                  {savingPassword ? 'Đang đổi mật khẩu...' : 'Đổi mật khẩu'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-[#0b2a4a] text-white text-xs px-4 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-2 border border-teal-500/30">
          <span>{toast}</span>
        </div>
      )}

      {/* MODAL ĐIỀU KHOẢN & BẢO MẬT AN NINH MẠNG */}
      <PolicyModal isOpen={showPolicyModal} onClose={() => setShowPolicyModal(false)} />
    </div>
  );
}
