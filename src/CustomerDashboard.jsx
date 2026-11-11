import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSession, clearSession } from './api';
import PolicyModal from './PolicyModal';

const TRANG_THAI_CHUYEN = {
  con_ghe: ['Còn ghế trống', 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'],
  da_day: ['Đã đầy', 'bg-amber-50 text-amber-700 border border-amber-200/60'],
  da_khoi_hanh: ['Đã khởi hành', 'bg-gray-100 text-gray-600'],
  da_ghep: ['Đang chạy', 'bg-teal-50 text-teal-800 border border-teal-200/60'],
  hoan_thanh: ['Hoàn thành', 'bg-blue-50 text-blue-700'],
  da_huy: ['Đã hủy', 'bg-red-50 text-red-600'],
};
const TRANG_THAI_YEU_CAU = {
  cho_ghep: ['Đang chờ ghép', 'bg-gray-100 text-gray-600'],
  da_ghep: ['Đã ghép', 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'],
  hoan_thanh: ['Hoàn thành', 'bg-blue-50 text-blue-700'],
  het_han: ['Hết hạn', 'bg-red-50 text-red-600'],
  da_huy: ['Đã hủy', 'bg-red-50 text-red-600'],
};
const TRANG_THAI_GHEP = {
  de_xuat: ['Đã ghép', 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'],
  da_ghep: ['Đã ghép', 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'],
  hoan_thanh: ['Đã hoàn thành', 'bg-blue-50 text-blue-700'],
  da_huy: ['Đã hủy', 'bg-red-50 text-red-600'],
};

function Badge({ map, value }) {
  const [label, cls] = map[value] || [value, 'bg-gray-100 text-gray-600'];
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${cls}`}>{label}</span>;
}

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

function isDateInPast(timeStr, postTimeStr) {
  const rawTime = (timeStr || '').trim();
  if (!rawTime || /(linh hoạt|hàng ngày|liên tục|thỏa thuận|bất kỳ|24\/7|24\/24)/i.test(rawTime)) {
    return false;
  }
  const timeDateParts = extractDateParts(rawTime);
  const postDateParts = extractDateParts(postTimeStr);
  const isFutureKeyword = /(sáng mai|chiều mai|tối mai|ngày mai|\bmai\b)/i.test(rawTime);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (timeDateParts) {
    const itemDate = new Date(timeDateParts.year, timeDateParts.month - 1, timeDateParts.day);
    return itemDate < todayStart;
  }

  if (postDateParts) {
    const postDate = new Date(postDateParts.year, postDateParts.month - 1, postDateParts.day);
    const targetDate = isFutureKeyword
      ? new Date(postDate.getFullYear(), postDate.getMonth(), postDate.getDate() + 1)
      : postDate;
    return targetDate < todayStart;
  }

  const isCurrentDayKeyword = /(hôm nay|chiều nay|tối nay|trưa nay|sáng nay|bây giờ|ngay bây giờ)/i.test(rawTime);
  if (isCurrentDayKeyword) return false;

  return false;
}

export default function CustomerDashboard() {
  const navigate = useNavigate();
  const session = getSession();

  const [showNotifModal, setShowNotifModal] = useState(false);
  const notifStorageKey = `read_notifs_cust_${session?.id || 'guest'}`;
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`read_notifs_cust_${session?.id || 'guest'}`) || '[]');
    } catch {
      return [];
    }
  });
  const [view, setView] = useState('overview'); // overview, search, post-request, activity, history, favorites
  const [filterSeatType, setFilterSeatType] = useState('all'); // all, 4cho, 7cho, verified
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [trips, setTrips] = useState([]);
  const [requests, setRequests] = useState([]);
  const [matches, setMatches] = useState([]);

  // Form tìm kiếm
  const [sDiemDi, setSDiemDi] = useState('');
  const [sDiemDen, setSDiemDen] = useState('');
  const [sThoiGian, setSThoiGian] = useState('');
  const [sSdt, setSSdt] = useState(session.sdt || '');
  const [ketQuaTim, setKetQuaTim] = useState(null);

  // Form đăng yêu cầu
  const [rDiemDi, setRDiemDi] = useState('');
  const [rDiemDen, setRDiemDen] = useState('');
  const [rThoiGian, setRThoiGian] = useState('');
  const [rSoKhach, setRSoKhach] = useState(1);
  const [rSdt, setRSdt] = useState(session.sdt || '');
  const isLoadingRef = useRef(false);

  // Modal quản lý tài khoản & ảnh đại diện
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const [profileAvatar, setProfileAvatar] = useState(session.avatarUrl || localStorage.getItem('userAvatar') || '');
  const [currentName, setCurrentName] = useState(session.hoTen || 'Khách hàng');
  const [profileName, setProfileName] = useState(session.hoTen || 'Khách hàng');
  const [profilePhone, setProfilePhone] = useState(session.sdt || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Modal đánh giá tài xế & hoàn thành chuyến
  const [ratingModalMatch, setRatingModalMatch] = useState(null);
  const [reviewStars, setReviewStars] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Quản lý tuyến yêu thích
  const [favoriteRoutes, setFavoriteRoutes] = useState(() => {
    try {
      const saved = localStorage.getItem('goghep_fav_routes');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      { from: 'Hà Nội', to: 'Vinh' },
      { from: 'Hà Nội', to: 'Hải Phòng' },
      { from: 'Hà Nội', to: 'Nam Định' },
    ];
  });
  const [favFrom, setFavFrom] = useState('');
  const [favTo, setFavTo] = useState('');

  const saveFavorites = (newList) => {
    setFavoriteRoutes(newList);
    localStorage.setItem('goghep_fav_routes', JSON.stringify(newList));
  };

  const handleAddFavorite = (e) => {
    if (e) e.preventDefault();
    if (!favFrom.trim() || !favTo.trim()) {
      showToast('⚠️ Vui lòng nhập đầy đủ Điểm đi và Điểm đến');
      return;
    }
    const exists = favoriteRoutes.some(
      (r) => r.from.toLowerCase() === favFrom.trim().toLowerCase() && r.to.toLowerCase() === favTo.trim().toLowerCase()
    );
    if (exists) {
      showToast('Tuyến này đã có trong danh sách yêu thích!');
      return;
    }
    const updated = [...favoriteRoutes, { from: favFrom.trim(), to: favTo.trim() }];
    saveFavorites(updated);
    setFavFrom('');
    setFavTo('');
    showToast('⭐ Đã thêm tuyến yêu thích thành công!');
  };

  const handleRemoveFavorite = (index) => {
    const updated = favoriteRoutes.filter((_, i) => i !== index);
    saveFavorites(updated);
    showToast('Đã xóa tuyến khỏi danh sách yêu thích');
  };

  const handleSelectFavoriteAndSearch = (from, to) => {
    setSDiemDi(from);
    setSDiemDen(to);
    setView('search');
    api.searchTrips({ diem_di: from, diem_den: to, thoi_gian: '' })
      .then((res) => {
        const list = Array.isArray(res) ? res : (res?.chuyen_xe || []);
        setKetQuaTim(list);
        showToast(`Đã lọc được ${list.length} chuyến xe tuyến ${from} ⇄ ${to}`);
      })
      .catch(() => {});
  };

  const displayUserName = currentName || session.hoTen || 'Khách hàng';
  const displayPhone = profilePhone || session.sdt || 'Chưa cập nhật';
  const myId = Number(session.id);

  const activePassengerMatch = matches.find(
    (m) => Number(m.hanh_khach_id) === myId && (m.trang_thai === 'da_ghep' || m.trang_thai === 'de_xuat')
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const syncPhone = (val) => {
    if (!val) return;
    setSSdt(val);
    setRSdt(val);
    setProfilePhone(val);
    localStorage.setItem('userSdt', val);
  };

  const loadData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const [tRes, rRes, mRes, pRes] = await Promise.allSettled([
        api.listTrips(false),
        api.listRequests(true),
        api.listMatches(true),
        api.getProfile(),
      ]);
      if (tRes.status === 'fulfilled') setTrips(tRes.value || []);
      if (rRes.status === 'fulfilled') setRequests(rRes.value || []);
      if (mRes.status === 'fulfilled') setMatches(mRes.value || []);
      if (pRes.status === 'fulfilled' && pRes.value) {
        if (pRes.value.ho_ten) {
          setCurrentName(pRes.value.ho_ten);
          setProfileName(pRes.value.ho_ten);
          localStorage.setItem('userName', pRes.value.ho_ten);
        }
        if (pRes.value.sdt) {
          syncPhone(pRes.value.sdt);
        }
        if (pRes.value.avatar_url) {
          setProfileAvatar(pRes.value.avatar_url);
          localStorage.setItem('userAvatar', pRes.value.avatar_url);
        }
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!session.id) {
      navigate('/login');
      return;
    }
    loadData();
    const iv = setInterval(loadData, 5000);
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [session.id, navigate, loadData]);

  // Tìm kiếm chuyến xe
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (sThoiGian) {
      const pickedDate = new Date(sThoiGian);
      const now = new Date();
      const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const pickedZero = new Date(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
      if (pickedZero < todayZero) {
        showToast('⚠️ Không thể chọn ngày trong quá khứ! Vui lòng chọn ngày từ hôm nay trở đi.');
        return;
      }
    }
    setBusy(true);
    try {
      const res = await api.searchTrips({ diem_di: sDiemDi, diem_den: sDiemDen, thoi_gian: sThoiGian });
      const tripList = Array.isArray(res) ? res : (res?.chuyen_xe || []);
      setKetQuaTim(tripList);
      syncPhone(sSdt);
      showToast(`Đã tìm thấy ${tripList.length} chuyến xe phù hợp`);
    } catch (err) {
      showToast(err.message || 'Lỗi tìm kiếm');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRoute = () => {
    setSDiemDi('Hà Nội');
    setSDiemDen('Vinh');
    showToast('Đã chọn tuyến yêu thích: Hà Nội ⇄ Vinh');
  };

  // Đặt xe / Ghép chuyến
  const handleJoinTrip = async (t) => {
    if (activePassengerMatch) {
      showToast(`Bạn đang có chuyến đi chưa hoàn thành (${activePassengerMatch.cx_diem_di} → ${activePassengerMatch.cx_diem_den}). Vui lòng hoàn thành hoặc hủy chuyến trước khi đặt chuyến mới.`);
      setView('activity');
      return;
    }

    let sdtToUse = (session.sdt || sSdt || profilePhone || '').trim();
    if (!sdtToUse || !/^0\d{9}$/.test(sdtToUse)) {
      const inputPhone = window.prompt('Vui lòng nhập số điện thoại liên hệ (10 số, bắt đầu bằng 0) để tài xế đón bạn:');
      if (!inputPhone || !/^0\d{9}$/.test(inputPhone.trim())) {
        showToast('Cần có số điện thoại 10 số hợp lệ để tài xế liên hệ ghép chuyến');
        return;
      }
      sdtToUse = inputPhone.trim();
    }
    syncPhone(sdtToUse);
    setBusy(true);
    try {
      const res = await api.joinTrip(t.id, {
        sdt: sdtToUse,
        so_khach: 1,
        diem_di: sDiemDi || t.diem_di || '',
        diem_den: sDiemDen || t.diem_den || '',
        thoi_gian_don: sThoiGian || t.thoi_gian_chay || '',
      });

      const rawPhone = (t.sdt || '').replace(/\D/g, '');
      const zaloUrl = res?.zalo_url || t?.zalo_url || (rawPhone ? `https://zalo.me/${rawPhone}` : '');
      if (zaloUrl) {
        showToast('🎉 Đặt xe thành công! Đang chuyển sang Zalo với tài xế...');
        window.open(zaloUrl, '_blank', 'noopener,noreferrer');
      } else {
        showToast('🎉 Đặt xe thành công! Tài xế sẽ chủ động liên hệ qua SĐT của bạn.');
      }
      setView('activity');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi ghép chuyến');
    } finally {
      setBusy(false);
    }
  };

  // Đăng yêu cầu tìm xe
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (activePassengerMatch) {
      showToast(`Bạn đang có chuyến đi chưa hoàn thành (${activePassengerMatch.cx_diem_di} → ${activePassengerMatch.cx_diem_den}). Vui lòng hoàn thành hoặc hủy chuyến trước khi đăng yêu cầu mới.`);
      setView('activity');
      return;
    }
    if (rSdt && !/^0\d{9}$/.test(rSdt.trim())) {
      showToast('Số điện thoại phải gồm đúng 10 số và bắt đầu bằng số 0');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createRequest({
        diem_di: rDiemDi,
        diem_den: rDiemDen,
        thoi_gian_don: rThoiGian,
        so_khach: Number(rSoKhach),
        sdt: rSdt,
      });
      syncPhone(rSdt);
      setRDiemDi('');
      setRDiemDen('');
      setRThoiGian('');
      setRSoKhach(1);
      await loadData();
      showToast(res?.so_cap_ghep_moi > 0 ? `Đã đăng yêu cầu và tìm thấy ngay ${res.so_cap_ghep_moi} chuyến phù hợp!` : 'Đã đăng yêu cầu tìm xe thành công — AI đang tìm chuyến phù hợp');
      setView('post-request');
    } catch (err) {
      showToast(err.message || 'Lỗi gửi yêu cầu');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenRatingModal = (match) => {
    setRatingModalMatch(match);
    setReviewStars(5);
    setReviewComment('');
  };

  // Hoàn thành chuyến (Khách) - Mở modal đánh giá
  const handleHoanThanhChuyen = async (matchId) => {
    const targetMatch = matches.find(m => m.id === matchId) || { id: matchId };
    handleOpenRatingModal(targetMatch);
  };

  // Gửi đánh giá tài xế & hoàn thành chuyến
  const handleSubmitReview = async (e) => {
    if (e) e.preventDefault();
    if (!ratingModalMatch) return;
    setSubmittingReview(true);
    try {
      await api.reviewMatch(ratingModalMatch.id, {
        so_sao: Number(reviewStars),
        nhan_xet: reviewComment.trim(),
      });
      showToast('🎉 Cảm ơn bạn đã gửi đánh giá chuyến đi!');
      setRatingModalMatch(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi gửi đánh giá');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Bỏ qua đánh giá và chỉ đánh dấu hoàn thành
  const handleSkipReviewAndComplete = async () => {
    if (!ratingModalMatch) return;
    setSubmittingReview(true);
    try {
      await api.completeMatch(ratingModalMatch.id);
      showToast('Đã xác nhận hoàn thành chuyến đi!');
      setRatingModalMatch(null);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi hoàn thành chuyến');
    } finally {
      setSubmittingReview(false);
    }
  };

  // Hủy chuyến (Khách)
  const handleHuyChuyen = async (matchId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy chuyến đi này? Chỗ ngồi sẽ được hoàn trả lại cho chuyến xe trên hệ thống.')) return;
    setBusy(true);
    try {
      const res = await api.cancelMatch(matchId);
      showToast(res?.message || 'Đã hủy chuyến thành công!');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi hủy chuyến');
    } finally {
      setBusy(false);
    }
  };

  // Hủy yêu cầu tìm xe (Khách)
  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy yêu cầu tìm xe này?')) return;
    setBusy(true);
    try {
      await api.cancelRequest(requestId);
      showToast('Đã hủy yêu cầu tìm xe thành công!');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi hủy yêu cầu');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  // Cập nhật thông tin khách
  const handleUpdateProfileInfo = async (e) => {
    e.preventDefault();
    const cleanPhone = profilePhone.trim().replace(/\D/g, '');
    if (!/^0\d{9}$/.test(cleanPhone)) {
      showToast('⚠️ Số điện thoại phải gồm 10 chữ số và bắt đầu bằng số 0.');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.updateProfile({ ho_ten: profileName.trim(), sdt: cleanPhone });
      syncPhone(cleanPhone);
      setCurrentName(res?.ho_ten || profileName.trim());
      showToast('✅ Đã lưu thông tin hành khách thành công!');
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật thông tin');
    } finally {
      setSavingProfile(false);
    }
  };

  // Đổi mật khẩu
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*(),.?":{}|<>\-_+=\[\]\\\/]/.test(newPassword)) {
      showToast('⚠️ Mật khẩu mới phải tối thiểu 8 ký tự, gồm chữ hoa, số và ký tự đặc biệt.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('⚠️ Mật khẩu xác nhận không khớp!');
      return;
    }
    setSavingPassword(true);
    try {
      await api.updateProfile({ password_cu: currentPassword, password_moi: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('✅ Cập nhật mật khẩu thành công!');
    } catch (err) {
      showToast(err.message || 'Lỗi khi đổi mật khẩu');
    } finally {
      setSavingPassword(false);
    }
  };

  // Thay đổi avatar
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
        showToast('✅ Đã cập nhật ảnh đại diện!');
      } catch (err) {
        showToast(err.message || 'Lỗi khi lưu ảnh');
      }
    };
    reader.readAsDataURL(file);
  };

  const formatTime = (timeStr) => {
    if (!timeStr) return 'Linh hoạt';
    const str = String(timeStr).trim();
    if (!str) return 'Linh hoạt';

    // 1. Dạng ISO YYYY-MM-DDTHH:mm hoặc YYYY-MM-DD HH:mm
    const isoTime = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
    if (isoTime) {
      const [, y, m, d, hh, mm] = isoTime;
      return `${hh.padStart(2, '0')}:${mm} (${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y})`;
    }

    // 2. Dạng chỉ có ngày YYYY-MM-DD
    const isoDate = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoDate) {
      const [, y, m, d] = isoDate;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }

    // 3. Chuỗi ISO Date chuẩn bất kỳ có thể parse bằng Date
    if (str.includes('T') || (str.includes('-') && str.includes(':'))) {
      try {
        const dt = new Date(str);
        if (!isNaN(dt.getTime())) {
          const dd = String(dt.getDate()).padStart(2, '0');
          const mm = String(dt.getMonth() + 1).padStart(2, '0');
          const yyyy = dt.getFullYear();
          const hh = String(dt.getHours()).padStart(2, '0');
          const min = String(dt.getMinutes()).padStart(2, '0');
          return `${hh}:${min} (${dd}/${mm}/${yyyy})`;
        }
      } catch (e) {}
    }

    return str;
  };

  // Thông báo thực tế 100% dựa trên các chuyến xe và yêu cầu của người dùng (Không dùng mock)
  const userNotifications = useMemo(() => {
    const list = [];

    // 1. Chuyến xe đã ghép (matches)
    (matches || []).forEach((m) => {
      const routeText = `${m.cx_diem_di || m.kh_diem_don || 'Điểm đón'} ➔ ${m.cx_diem_den || m.kh_diem_tra || 'Điểm trả'}`;
      const timeStr = m.cx_thoi_gian || m.thoi_gian_ghep ? formatTime(m.cx_thoi_gian || m.thoi_gian_ghep) : 'Hôm nay';
      const driverInfo = m.tai_xe_ten ? `Bác tài ${m.tai_xe_ten}${m.cx_sdt ? ` (${m.cx_sdt})` : ''}` : 'Bác tài';

      if (m.trang_thai === 'hoan_thanh') {
        list.push({
          id: `match_${m.id}_done`,
          title: 'Chuyến đi hoàn tất',
          desc: `Chuyến ${routeText} đã kết thúc an toàn cùng ${driverInfo}.${m.danh_gia_sao ? ` Bạn đã đánh giá ${m.danh_gia_sao}⭐.` : ' Hãy gửi đánh giá cho bác tài nhé.'}`,
          time: timeStr,
          icon: '✅',
          badge: 'Hoàn tất',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          view: 'history',
        });
      } else if (m.trang_thai === 'da_huy') {
        list.push({
          id: `match_${m.id}_cancel`,
          title: 'Chuyến xe đã hủy',
          desc: `Chuyến xe ${routeText} đã bị hủy. Bạn có thể tìm chuyến mới bất kỳ lúc nào.`,
          time: timeStr,
          icon: '❌',
          badge: 'Đã hủy',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          view: 'history',
        });
      } else {
        list.push({
          id: `match_${m.id}_active`,
          title: 'Ghép xe thành công!',
          desc: `${driverInfo} đã nhận chở bạn tuyến ${routeText}. Giờ khởi hành: ${timeStr}.`,
          time: timeStr,
          icon: '🚗',
          badge: 'Đang đi',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
          view: 'history',
        });
      }
    });

    // 2. Yêu cầu tìm xe của khách (requests)
    (requests || []).forEach((r) => {
      const routeText = `${r.diem_di || 'Điểm đón'} ➔ ${r.diem_den || 'Điểm đến'}`;
      const timeStr = r.thoi_gian_don || r.thoi_gian ? formatTime(r.thoi_gian_don || r.thoi_gian) : 'Sắp tới';

      if (r.trang_thai === 'cho_ghep' || !r.trang_thai) {
        list.push({
          id: `req_${r.id}_waiting`,
          title: 'Yêu cầu tìm xe đang mở',
          desc: `Yêu cầu tuyến ${routeText} (${r.so_khach || 1} khách) đang chờ bác tài nhận ghép.`,
          time: timeStr,
          icon: '🔍',
          badge: 'Chờ ghép',
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
          view: 'post-request',
        });
      } else if (r.trang_thai === 'da_huy') {
        list.push({
          id: `req_${r.id}_cancelled`,
          title: 'Yêu cầu tìm xe đã hủy',
          desc: `Bạn đã hủy bài đăng tìm xe tuyến ${routeText}.`,
          time: timeStr,
          icon: '⚪',
          badge: 'Đã hủy',
          badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
          view: 'post-request',
        });
      }
    });

    return list;
  }, [matches, requests]);

  const unreadNotifs = useMemo(() => {
    return userNotifications.filter(n => !readNotifIds.includes(n.id)).length;
  }, [userNotifications, readNotifIds]);

  const handleMarkAllNotifsRead = () => {
    const allIds = userNotifications.map(n => n.id);
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

  const todayMinStr = new Date().toISOString().slice(0, 16);

  // Chuẩn hóa và tổng hợp danh sách chuyến thực tế (100% dữ liệu thật từ database, không mock)
  const formatTripForCustomer = useCallback((t) => {
    if (!t) return null;
    const rawPhone = (t.sdt || '').replace(/\D/g, '');
    const formattedTime = formatTime(t.thoi_gian_chay);
    return {
      id: t.id,
      tai_xe_ten: t.tai_xe_ten || t.ho_ten || `Tài xế #${t.id}`,
      tai_xe_initials: (t.tai_xe_ten || t.ho_ten || 'TX').slice(0, 2).toUpperCase(),
      xe: t.bien_so ? `${t.loai_xe || 'Xe tiện chuyến'} • ${t.bien_so}` : (t.loai_xe || 'Xe tiện chuyến'),
      so_ghe_trong: Number(t.so_ghe_trong) || 0,
      gio_di: formattedTime,
      diem_di: t.diem_di || 'Chưa cập nhật',
      diem_di_chi_tiet: t.diem_don || '',
      gio_den: '',
      diem_den: t.diem_den || 'Chưa cập nhật',
      diem_den_chi_tiet: t.diem_tra || '',
      thoi_gian_chay: formattedTime,
      ngay_chay: t.ngay_chay || 'Hôm nay',
      nguon: t.nguon ? (t.nguon.charAt(0).toUpperCase() + t.nguon.slice(1)) : 'Hệ thống',
      sdt: t.sdt || '',
      zalo_url: t.zalo_url || (rawPhone ? `https://zalo.me/${rawPhone}` : ''),
      tien_ich: ['Điều hòa mát', 'Cốp hành lý', 'Không hút thuốc'],
      xe_loai: (t.loai_xe && t.loai_xe.includes('7')) || Number(t.so_ghe_trong) >= 7 ? '7cho' : '4cho',
      da_xac_minh: Boolean(t.sdt),
      rawTrip: t
    };
  }, []);

  const effectiveTrips = useMemo(() => {
    const sourceList = ketQuaTim ? ketQuaTim : trips.filter(t => !isDateInPast(t.thoi_gian_chay, t.bai_viet_thoi_gian || t.ngay_tao));
    return sourceList.map(formatTripForCustomer).filter(Boolean);
  }, [ketQuaTim, trips, formatTripForCustomer]);

  const displayTrips = useMemo(() => {
    return effectiveTrips.filter(t => {
      if (filterSeatType === '4cho') return t.xe_loai === '4cho';
      if (filterSeatType === '7cho') return t.xe_loai === '7cho';
      if (filterSeatType === 'verified') return t.da_xac_minh;
      return true;
    });
  }, [effectiveTrips, filterSeatType]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row antialiased font-sans">
      {/* SIDEBAR BẢN THIẾT KẾ MỚI */}
      <aside className="w-full md:w-64 lg:w-72 md:sticky md:top-0 md:h-screen md:overflow-y-auto bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 p-5 shadow-[2px_0_12px_rgba(0,0,0,0.02)] z-30">
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

          {/* Profile Card Center */}
          <div className="text-center py-4 px-2 border-b border-slate-100 mb-5">
            <div className="relative inline-block mx-auto mb-2 group">
              <button
                type="button"
                onClick={() => setUserProfileModalOpen(true)}
                title="Nhấn vào để thay đổi thông tin hoặc đổi ảnh đại diện"
                className="w-16 h-16 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-2xl flex items-center justify-center overflow-hidden shadow-xs cursor-pointer ring-2 ring-transparent hover:ring-[#0f766e] transition-all duration-200 relative group"
              >
                {profileAvatar ? (
                  <img src={profileAvatar} alt={displayUserName} className="w-full h-full object-cover" />
                ) : (
                  displayUserName.split(' ').map(w => w[0]).join('').slice(-2).toUpperCase() || 'HK'
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                  📷 Đổi
                </div>
              </button>
            </div>
            <div className="text-[11px] font-bold text-[#0f766e] uppercase tracking-wider mb-0.5">
              HÀNH KHÁCH
            </div>
            <h3
              onClick={() => setUserProfileModalOpen(true)}
              className="text-base font-bold text-[#0b2a4a] leading-tight cursor-pointer hover:text-[#0f766e] transition"
            >
              {displayUserName}
            </h3>
          </div>

          {/* Navigation Section */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              KHÔNG GIAN CỦA BẠN
            </p>
            <button
              onClick={() => { setView('overview'); setKetQuaTim(null); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${
                view === 'overview'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl">⊞</span>
              <span>Tổng quan</span>
            </button>

            <button
              onClick={() => { setView('search'); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${
                view === 'search'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl">🔍</span>
              <span>Tìm chuyến xe</span>
            </button>

            <button
              onClick={() => { setView('post-request'); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                view === 'post-request'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🙋</span>
                <span>Đăng yêu cầu tìm xe</span>
              </div>
              {requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono font-bold">
                  {requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setView('activity'); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                view === 'activity'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🎫</span>
                <span>Chuyến đi của tôi</span>
              </div>
              {matches.filter(m => m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh').length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">
                  {matches.filter(m => m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh').length}
                </span>
              )}
            </button>

            <button
              onClick={() => { setView('favorites'); }}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${
                view === 'favorites'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl">♡</span>
              <span>Tuyến yêu thích</span>
            </button>
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

      {/* NỘI DUNG CHÍNH (Right Canvas) */}
      <main className="flex-1 min-w-0 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-8">
        {/* Top Breadcrumb & Status Bar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 font-medium">
            Không gian làm việc / <span className="text-slate-600">
              {view === 'overview' ? 'Tổng quan' : view === 'search' ? 'Tìm chuyến xe' : view === 'favorites' ? 'Tuyến yêu thích' : view === 'post-request' ? 'Đăng yêu cầu' : 'Chuyến đi của tôi'}
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
                title="Thông báo của bạn"
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
                        <h4 className="font-bold text-slate-900 text-sm">Thông báo của bạn</h4>
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
                      {userNotifications.length === 0 ? (
                        <div className="py-8 px-4 text-center">
                          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 text-lg">
                            🔔
                          </div>
                          <p className="text-xs font-bold text-slate-700">Chưa có thông báo nào</p>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Khi bạn đăng yêu cầu tìm xe hoặc có bác tài nhận chuyến, thông báo thực tế sẽ hiển thị tại đây.
                          </p>
                        </div>
                      ) : (
                        userNotifications.map((n) => {
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

        {/* TAB 1: TỔNG QUAN HÀNH KHÁCH */}
        {view === 'overview' && (
          <div className="space-y-8">
            {/* Greeting Heading & CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#0b2a4a] tracking-tight">
                  Chào {displayUserName.split(' ').slice(-1)[0] || 'bạn'}, hôm nay mình đi đâu?
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Nền tảng kết nối trực tiếp xe tiện chuyến — Tiết kiệm, an toàn và đón trả tận nơi.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setView('search')}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🔍</span>
                  <span>Tìm chuyến</span>
                </button>
                <button
                  onClick={() => setView('post-request')}
                  className="shrink-0 px-4 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white text-sm font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Đăng nhu cầu</span>
                </button>
              </div>
            </div>

            {/* 3 TOP KPI METRIC CARDS THẬT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Chuyến xe sẵn sàng</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-sm">🚗</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {trips.filter(t => (Number(t.so_ghe_trong) || 0) > 0).length}
                </div>
                <p className="text-xs text-emerald-600 font-medium">Chuyến xe đang mở nhận khách</p>
              </div>

              <div 
                onClick={() => setView('post-request')}
                className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover cursor-pointer hover:border-teal-300 transition"
                title="Bấm để xem và quản lý yêu cầu tìm xe"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Yêu cầu tìm xe của bạn</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-sm">📥</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {requests.length}
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length} yêu cầu đang chờ ghép
                </p>
              </div>

              <div 
                onClick={() => setView('activity')}
                className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover cursor-pointer hover:border-teal-300 transition"
                title="Bấm để xem danh sách chuyến đi của bạn"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Chuyến xe đã kết nối</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-sm">🎫</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {matches.length}
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {activePassengerMatch ? '1 chuyến đang hoạt động' : 'Tất cả cuốc xe của bạn'}
                </p>
              </div>
            </div>

            {/* 2-COLUMN SECTION: HÀNH TRÌNH HIỆN TẠI & CHUYẾN XE MỚI / WIDGET PHẢI */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-8 space-y-6">
                {/* Card: Hành trình hiện tại */}
                {activePassengerMatch ? (
                  <div className="bg-white rounded-2xl border border-emerald-200/80 shadow-[0_4px_16px_rgba(16,185,129,0.08)] p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <h3 className="text-base font-bold text-[#0b2a4a]">Chuyến đi đang hoạt động</h3>
                      </div>
                      <Badge map={TRANG_THAI_GHEP} value={activePassengerMatch.trang_thai} />
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-lg font-bold text-[#0b2a4a]">
                            {activePassengerMatch.cx_diem_di} ➔ {activePassengerMatch.cx_diem_den}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Khởi hành: <b>{formatTime(activePassengerMatch.cx_thoi_gian_chay || activePassengerMatch.thoi_gian_ghep)}</b>
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {activePassengerMatch.so_khach || 1} ghế đã đặt
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-sm flex items-center justify-center shrink-0">
                            {(activePassengerMatch.tai_xe_ten || 'TX').slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900">{activePassengerMatch.tai_xe_ten || 'Bác tài'}</div>
                            <div className="text-[11px] font-mono text-slate-500">{(activePassengerMatch.tx_sdt || activePassengerMatch.cx_sdt) || 'Đã có tài xế'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {(activePassengerMatch.tx_sdt || activePassengerMatch.cx_sdt) && (
                            <a
                              href={`tel:${(activePassengerMatch.tx_sdt || activePassengerMatch.cx_sdt)}`}
                              className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white transition flex items-center gap-1"
                            >
                              <span>📞 Gọi</span>
                            </a>
                          )}
                          {(activePassengerMatch.tx_sdt || activePassengerMatch.cx_sdt) && (
                            <a
                              href={`https://zalo.me/${(activePassengerMatch.tx_sdt || activePassengerMatch.cx_sdt).replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3.5 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-xs font-semibold text-white transition shadow-xs flex items-center gap-1"
                            >
                              <span>💬 Chat Zalo</span>
                            </a>
                          )}
                          <button
                            onClick={() => handleHoanThanhChuyen(activePassengerMatch.id)}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition cursor-pointer"
                          >
                            ✓ Hoàn thành
                          </button>
                          <button
                            onClick={() => handleHuyChuyen(activePassengerMatch.id)}
                            className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : requests.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#0b2a4a]">Yêu cầu tìm xe mới nhất của bạn</h3>
                      <Badge map={TRANG_THAI_YEU_CAU} value={requests[0].trang_thai} />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <div>
                        <h4 className="text-base font-bold text-slate-900">
                          {requests[0].diem_di} ➔ {requests[0].diem_den}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Giờ đón: <b>{formatTime(requests[0].thoi_gian_don)}</b> • {requests[0].so_khach || 1} người
                        </p>
                      </div>
                      <button
                        onClick={() => setView('post-request')}
                        className="px-3.5 py-1.5 text-xs font-semibold text-[#0f766e] bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                      >
                        Quản lý yêu cầu ➔
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gradient-to-r from-teal-50/80 to-emerald-50/80 rounded-2xl border border-teal-100 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="text-base font-bold text-[#065f46]">Bạn chưa có lịch trình nào hôm nay</h3>
                      <p className="text-xs text-emerald-800/80 mt-1 max-w-lg">
                        Tìm ngay một chuyến xe tiện chuyến có sẵn hoặc đăng nhu cầu để các bác tài đón bạn tận nơi.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setView('search')}
                        className="px-4 py-2 bg-white text-[#0f766e] border border-teal-200 font-semibold text-xs rounded-xl shadow-xs hover:bg-teal-50 transition cursor-pointer"
                      >
                        Tìm chuyến ngay
                      </button>
                      <button
                        onClick={() => setView('post-request')}
                        className="px-4 py-2 bg-[#0f766e] text-white font-semibold text-xs rounded-xl shadow-xs hover:bg-[#115e59] transition cursor-pointer"
                      >
                        + Đăng nhu cầu
                      </button>
                    </div>
                  </div>
                )}

                {/* Card: Chuyến xe sẵn sàng mới nhất */}
                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-[#0b2a4a]">Chuyến xe tiện chuyến đang nhận khách</h3>
                      <p className="text-xs text-slate-400 mt-0.5">Dữ liệu thời gian thực từ cộng đồng tài xế</p>
                    </div>
                    <button
                      onClick={() => setView('search')}
                      className="text-xs font-semibold text-[#0f766e] hover:underline cursor-pointer"
                    >
                      Xem tất cả ({effectiveTrips.length}) ➔
                    </button>
                  </div>

                  {effectiveTrips.length === 0 ? (
                    <div className="p-8 text-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">
                      Hiện tại chưa có chuyến xe nào mở nhận khách. Bạn hãy là người đầu tiên đăng yêu cầu tìm xe!
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {effectiveTrips.slice(0, 4).map((t) => (
                        <div key={t.id} className="p-4 rounded-xl bg-slate-50/70 border border-slate-100 hover:border-slate-200 transition space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-xs flex items-center justify-center shrink-0">
                                {t.tai_xe_initials}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">{t.tai_xe_ten}</span>
                                <span className="text-[11px] text-slate-400">{t.xe}</span>
                              </div>
                            </div>
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                              • Còn {t.so_ghe_trong} chỗ
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs py-1">
                            <div>
                              <span className="font-bold text-slate-900">{t.diem_di}</span>
                              <span className="text-slate-400 mx-1.5">➔</span>
                              <span className="font-bold text-slate-900">{t.diem_den}</span>
                            </div>
                            <div className="text-slate-500 font-medium">
                              🕒 {t.gio_di}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                            <span className="text-[11px] text-slate-400">Nguồn: {t.nguon}</span>
                            <div className="flex items-center gap-2">
                              {t.sdt && (
                                <a
                                  href={`tel:${t.sdt}`}
                                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition"
                                >
                                  📞 Gọi
                                </a>
                              )}
                              <button
                                onClick={() => handleJoinTrip(t.rawTrip || t)}
                                className="px-3.5 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold transition shadow-2xs cursor-pointer"
                              >
                                Đặt xe ngay ➔
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* CỘT PHẢI (4 cols): TUYẾN YÊU THÍCH & LƯU Ý */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-800 text-xs font-bold">
                      <span className="text-[#0f766e]">♡</span>
                      <span>Tuyến quen thuộc</span>
                    </div>
                    <button
                      onClick={() => setView('favorites')}
                      className="text-xs text-[#0f766e] font-semibold hover:underline cursor-pointer"
                    >
                      Quản lý ➔
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {favoriteRoutes.slice(0, 3).map((fav, i) => {
                      const liveCount = trips.filter(t =>
                        (t.diem_di?.toLowerCase().includes(fav.from.toLowerCase()) && t.diem_den?.toLowerCase().includes(fav.to.toLowerCase())) ||
                        (t.diem_di?.toLowerCase().includes(fav.to.toLowerCase()) && t.diem_den?.toLowerCase().includes(fav.from.toLowerCase()))
                      ).length;
                      return (
                        <div key={i} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center justify-between">
                          <div>
                            <h5 className="text-xs font-bold text-slate-800">{fav.from} ⇄ {fav.to}</h5>
                            <span className="text-[10px] text-emerald-600 font-medium">
                              {liveCount > 0 ? `${liveCount} chuyến đang chạy` : 'Chưa có chuyến'}
                            </span>
                          </div>
                          <button
                            onClick={() => handleSelectFavoriteAndSearch(fav.from, fav.to)}
                            className="px-2.5 py-1 bg-white border border-slate-200 hover:border-[#0f766e] text-xs font-semibold text-[#0f766e] rounded-lg transition cursor-pointer"
                          >
                            Xem ➔
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-3">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#065f46] flex items-center justify-center text-sm font-bold">
                    🛡️
                  </div>
                  <h4 className="text-xs font-bold text-[#065f46]">An tâm trên mọi cung đường</h4>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Hệ thống hỗ trợ kết nối trực tiếp không qua trung gian. Hãy liên hệ với tài xế qua Zalo hoặc SĐT để thống nhất trước thời gian và điểm đón tại nhà.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TÌM CHUYẾN XE (MODUM TÌM KIẾM RIÊNG BIỆT) */}
        {view === 'search' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#0b2a4a] tracking-tight">Tìm chuyến xe tiện chuyến</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Nhập điểm đón, điểm trả hoặc chọn ngày để tìm các chuyến xe đang sẵn sàng.
                </p>
              </div>
              <button
                onClick={() => setView('post-request')}
                className="shrink-0 px-4 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>+</span>
                <span>Đăng nhu cầu tìm xe</span>
              </button>
            </div>

            {/* Form tìm kiếm */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6">
              <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    ĐIỂM ĐI
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">📍</span>
                    <input
                      type="text"
                      value={sDiemDi}
                      onChange={(e) => setSDiemDi(e.target.value)}
                      placeholder="VD: Hà Nội"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    ĐIỂM ĐẾN
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">📍</span>
                    <input
                      type="text"
                      value={sDiemDen}
                      onChange={(e) => setSDiemDen(e.target.value)}
                      placeholder="VD: Vinh, Hải Phòng..."
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    NGÀY ĐI
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">📅</span>
                    <input
                      type="date"
                      value={sThoiGian}
                      onChange={(e) => setSThoiGian(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] transition text-slate-700"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 py-2.5 px-4 bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    <span>🔍</span>
                    <span>{busy ? 'Đang tìm...' : 'Tìm chuyến'}</span>
                  </button>
                  {ketQuaTim && (
                    <button
                      type="button"
                      onClick={() => { setKetQuaTim(null); setSDiemDi(''); setSDiemDen(''); setSThoiGian(''); }}
                      className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-sm rounded-xl transition cursor-pointer"
                      title="Đặt lại bộ lọc"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Kết quả tìm kiếm */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-base font-bold text-[#0b2a4a]">
                  {ketQuaTim ? `Kết quả tìm kiếm (${displayTrips.length} chuyến)` : `Tất cả chuyến xe có sẵn (${displayTrips.length} chuyến)`}
                </h2>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setFilterSeatType('all')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      filterSeatType === 'all'
                        ? 'bg-[#dcfce7] text-[#065f46] border border-emerald-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    • Tất cả
                  </button>
                  <button
                    onClick={() => setFilterSeatType('4cho')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      filterSeatType === '4cho'
                        ? 'bg-[#dcfce7] text-[#065f46] border border-emerald-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Xe 4 chỗ
                  </button>
                  <button
                    onClick={() => setFilterSeatType('7cho')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                      filterSeatType === '7cho'
                        ? 'bg-[#dcfce7] text-[#065f46] border border-emerald-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    Xe 7 chỗ
                  </button>
                </div>
              </div>

              {displayTrips.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-10 text-center space-y-3">
                  <div className="text-3xl">🚗</div>
                  <h3 className="text-base font-bold text-slate-800">Không tìm thấy chuyến xe phù hợp</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    Hiện tại chưa có bác tài nào đăng chuyến xe trên lộ trình này. Bạn hãy đăng nhu cầu tìm xe để các tài xế chủ động liên hệ đón bạn tận nơi!
                  </p>
                  <button
                    onClick={() => setView('post-request')}
                    className="px-4 py-2.5 bg-[#0f766e] text-white text-xs font-semibold rounded-xl hover:bg-[#115e59] transition shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <span>🙋</span>
                    <span>Đăng nhu cầu tìm xe ngay</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {displayTrips.map((t) => (
                    <div
                      key={t.id}
                      className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover"
                    >
                      {/* Top Driver Row */}
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-sm flex items-center justify-center shrink-0">
                            {t.tai_xe_initials || 'TX'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <h3 className="text-sm font-bold text-slate-900">{t.tai_xe_ten}</h3>
                              <span className="text-[#0f766e] text-xs font-bold" title="Đã xác thực">✓</span>
                            </div>
                            <p className="text-xs text-slate-400 font-medium">{t.xe}</p>
                          </div>
                        </div>
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#047857] border border-emerald-100">
                          • Còn {t.so_ghe_trong} chỗ
                        </span>
                      </div>

                      {/* Horizontal Timeline Row */}
                      <div className="grid grid-cols-12 items-center gap-2 py-4 border-y border-slate-50 my-2">
                        <div className="col-span-5 text-left">
                          <div className="text-base md:text-lg font-bold text-[#0b2a4a] leading-none">{t.diem_di}</div>
                          {t.diem_di_chi_tiet && t.diem_di_chi_tiet !== t.diem_di && (
                            <div className="text-[11px] text-slate-400 mt-1 truncate">{t.diem_di_chi_tiet}</div>
                          )}
                        </div>

                        <div className="col-span-2 px-1 text-center">
                          <div className="relative flex items-center justify-center">
                            <div className="w-full h-[1.5px] bg-slate-200"></div>
                            <span className="w-2 h-2 rounded-full border-2 border-emerald-500 bg-white absolute left-1/2 -top-[3px]"></span>
                            <span className="absolute right-0 -top-1.5 text-slate-300 text-xs">➔</span>
                          </div>
                          <div className="text-[10px] text-emerald-700 font-medium mt-1">Tiện chuyến</div>
                        </div>

                        <div className="col-span-5 text-right">
                          <div className="text-base md:text-lg font-bold text-[#0b2a4a] leading-none">{t.diem_den}</div>
                          {t.diem_den_chi_tiet && t.diem_den_chi_tiet !== t.diem_den && (
                            <div className="text-[11px] text-slate-400 mt-1 truncate">{t.diem_den_chi_tiet}</div>
                          )}
                        </div>
                      </div>

                      {/* Contact Footer */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-slate-100">
                        <div className="text-xs text-slate-500">
                          🕒 Khởi hành: <b>{t.gio_di}</b> • Nguồn: {t.nguon}
                        </div>
                        <div className="flex items-center gap-2">
                          {t.sdt && (
                            <a
                              href={`tel:${t.sdt}`}
                              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 transition"
                            >
                              Gọi điện
                            </a>
                          )}
                          <button
                            onClick={() => handleJoinTrip(t.rawTrip || t)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-[#115e59] shadow-xs transition flex items-center gap-1 cursor-pointer"
                          >
                            <span>Liên hệ Zalo / Đặt xe</span>
                            <span>↗</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: TUYẾN YÊU THÍCH (MODUM QUẢN LÝ RIÊNG BIỆT) */}
        {view === 'favorites' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#0b2a4a] tracking-tight">Tuyến đường yêu thích</h1>
                <p className="text-xs text-slate-500 mt-1">
                  Lưu các tuyến bạn thường xuyên di chuyển để tra cứu nhanh chuyến xe thật và nhận thông báo khi có chuyến mới.
                </p>
              </div>
            </div>

            {/* Form thêm tuyến yêu thích mới */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                + Thêm tuyến đường yêu thích mới
              </h3>
              <form onSubmit={handleAddFavorite} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Điểm đi</label>
                  <input
                    type="text"
                    value={favFrom}
                    onChange={(e) => setFavFrom(e.target.value)}
                    placeholder="VD: Hà Nội"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Điểm đến</label>
                  <input
                    type="text"
                    value={favTo}
                    onChange={(e) => setFavTo(e.target.value)}
                    placeholder="VD: Hải Phòng, Vinh..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]/30"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2.5 px-4 bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>⭐</span>
                  <span>Lưu tuyến yêu thích</span>
                </button>
              </form>
            </div>

            {/* Danh sách các tuyến đã lưu */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-[#0b2a4a]">
                Tuyến đường đã lưu ({favoriteRoutes.length})
              </h3>

              {favoriteRoutes.length === 0 ? (
                <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400 text-xs">
                  Chưa có tuyến yêu thích nào. Hãy nhập điểm đi và điểm đến ở trên để thêm tuyến quen thuộc của bạn.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {favoriteRoutes.map((fav, i) => {
                    const liveCount = trips.filter(t =>
                      (t.diem_di?.toLowerCase().includes(fav.from.toLowerCase()) && t.diem_den?.toLowerCase().includes(fav.to.toLowerCase())) ||
                      (t.diem_di?.toLowerCase().includes(fav.to.toLowerCase()) && t.diem_den?.toLowerCase().includes(fav.from.toLowerCase()))
                    ).length;

                    return (
                      <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-base text-rose-500">♡</span>
                          <button
                            onClick={() => handleRemoveFavorite(i)}
                            className="text-xs text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Xóa tuyến này"
                          >
                            ✕ Xóa
                          </button>
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-[#0b2a4a]">{fav.from} ⇄ {fav.to}</h4>
                          <p className="text-xs text-slate-400 mt-1">
                            {liveCount > 0 ? (
                              <span className="text-emerald-600 font-semibold">• Có {liveCount} chuyến đang chạy</span>
                            ) : (
                              '• Hiện chưa có chuyến xe'
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSelectFavoriteAndSearch(fav.from, fav.to)}
                          className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-[#065f46] text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <span>Tìm chuyến trên tuyến này</span>
                          <span>➔</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ĐĂNG YÊU CẦU TÌM XE (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'post-request' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 md:p-8 space-y-6">
              <div>
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#047857] border border-emerald-100 mb-2">
                  Dành cho Hành khách
                </span>
                <h2 className="text-2xl font-bold text-[#0b2a4a]">
                  Đăng yêu cầu tìm chuyến xe
                </h2>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Nếu chưa tìm thấy chuyến xe phù hợp, hãy đăng yêu cầu tại đây. Hệ thống AI sẽ tự động phân tích và kết nối tài xế đón bạn.
                </p>
              </div>

              <form onSubmit={handleSubmitRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Điểm đón (Tỉnh / Huyện / Địa chỉ)</label>
                  <input
                    type="text"
                    required
                    value={rDiemDi}
                    onChange={(e) => setRDiemDi(e.target.value)}
                    placeholder="VD: Cầu Giấy, Hà Nội"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Điểm đến (Tỉnh / Huyện / Điểm trả)</label>
                  <input
                    type="text"
                    required
                    value={rDiemDen}
                    onChange={(e) => setRDiemDen(e.target.value)}
                    placeholder="VD: TP. Vinh, Nghệ An"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Thời gian mong muốn đón</label>
                  <input
                    type="datetime-local"
                    min={todayMinStr}
                    value={rThoiGian}
                    onChange={(e) => setRThoiGian(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng hành khách</label>
                  <input
                    type="number"
                    min="1"
                    max="16"
                    value={rSoKhach}
                    onChange={(e) => setRSoKhach(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại liên hệ (10 số)</label>
                  <input
                    type="tel"
                    required
                    value={rSdt}
                    onChange={(e) => setRSdt(e.target.value)}
                    placeholder="09xxxxxxxx"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                  />
                </div>

                <div className="md:col-span-2 pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setView('overview')}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
                  >
                    Quay lại
                  </button>
                  <button
                    type="submit"
                    disabled={busy || activePassengerMatch}
                    className="px-6 py-2.5 bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold text-xs rounded-xl transition shadow-sm cursor-pointer disabled:opacity-60"
                  >
                    {busy ? 'Đang gửi yêu cầu...' : '🙋 Gửi yêu cầu tìm xe'}
                  </button>
                </div>
              </form>
            </div>

            {/* Danh sách yêu cầu tìm xe hiện tại của bạn */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-[#0b2a4a] text-sm flex items-center gap-2">
                  <span>📋</span>
                  <span>Danh sách yêu cầu tìm xe của bạn ({requests.length})</span>
                </h3>
                <span className="text-xs text-slate-500">
                  {requests.filter(r => r.trang_thai === 'cho_ghep' || !r.trang_thai).length} yêu cầu đang chờ ghép
                </span>
              </div>

              {requests.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="font-bold text-slate-600 text-sm">Bạn chưa đăng yêu cầu tìm xe nào</p>
                  <p className="text-slate-400 mt-1">
                    Điền biểu mẫu phía trên và bấm "Gửi yêu cầu tìm xe" để đăng bài viết tìm chuyến.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {requests.map((r) => (
                    <div key={r.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            Yêu cầu #{r.id}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.trang_thai === 'cho_ghep' || !r.trang_thai
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : r.trang_thai === 'da_ghep'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : r.trang_thai === 'da_huy'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {r.trang_thai === 'cho_ghep' || !r.trang_thai 
                              ? '⏳ Đang chờ ghép' 
                              : r.trang_thai === 'da_ghep' 
                              ? '✅ Đã ghép chuyến' 
                              : r.trang_thai === 'da_huy'
                              ? '❌ Đã hủy'
                              : r.trang_thai}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#0b2a4a]">
                          {r.diem_di} ➔ {r.diem_den}
                        </h4>
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <span>🕒 {r.thoi_gian_don || r.thoi_gian ? formatTime(r.thoi_gian_don || r.thoi_gian) : 'Khởi hành sớm'}</span>
                          <span>👥 {r.so_khach || 1} khách</span>
                          <span>📞 {r.sdt}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {(r.trang_thai === 'cho_ghep' || !r.trang_thai) && (
                          <button
                            type="button"
                            onClick={() => handleCancelRequest(r.id)}
                            disabled={busy}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            Hủy yêu cầu
                          </button>
                        )}
                        {r.trang_thai === 'da_ghep' && (
                          <button
                            type="button"
                            onClick={() => setView('activity')}
                            className="px-3.5 py-1.5 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-bold rounded-xl transition cursor-pointer"
                          >
                            Xem chuyến đi ➔
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: CHUYẾN ĐI CỦA TÔI (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'activity' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6">
              <h2 className="text-xl font-bold text-[#0b2a4a]">
                Chuyến xe & Yêu cầu của tôi
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Theo dõi trạng thái các yêu cầu tìm xe và danh sách chuyến đi đã được ghép nối thành công.
              </p>
            </div>

            {/* Chuyến đi đang ghép hoạt động */}
            {matches.filter(m => m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh').length > 0 ? (
              <div className="space-y-4">
                <h3 className="font-bold text-[#0b2a4a] text-sm flex items-center gap-2">
                  <span>🚗</span>
                  <span>Chuyến đi đang hoạt động ({matches.filter(m => m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh').length})</span>
                </h3>
                {matches.filter(m => m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh').map((m) => (
                  <div key={m.id} className="bg-white rounded-2xl border-2 border-[#0f766e]/30 shadow-sm p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-0.5 rounded-full">
                          Mã ghép #{m.id}
                        </span>
                        <Badge map={TRANG_THAI_GHEP} value={m.trang_thai} />
                      </div>
                      <h4 className="text-base font-bold text-[#0b2a4a]">
                        {m.cx_diem_di || 'Điểm đón'} → {m.cx_diem_den || 'Điểm trả'}
                      </h4>
                      <p className="text-xs text-slate-600 mt-1">
                        🕒 Giờ khởi hành: <b>{formatTime(m.cx_thoi_gian || m.thoi_gian_ghep)}</b>
                      </p>
                      <p className="text-xs text-slate-600">
                        👤 Tài xế: <b>{m.tai_xe_ten || 'Tài xế'}</b> · SĐT: <span className="font-mono font-bold text-slate-800">{m.cx_sdt || 'Chưa cập nhật'}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {m.cx_sdt && (
                        <>
                          <a
                            href={`tel:${m.cx_sdt}`}
                            className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition"
                          >
                            📞 Gọi tài xế
                          </a>
                          <a
                            href={`https://zalo.me/${m.cx_sdt.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-bold rounded-xl transition shadow-xs"
                          >
                            💬 Chat Zalo
                          </a>
                        </>
                      )}
                      <button
                        onClick={() => handleHoanThanhChuyen(m.id)}
                        disabled={busy}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        ✓ Hoàn thành
                      </button>
                      <button
                        onClick={() => handleHuyChuyen(m.id)}
                        disabled={busy}
                        className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition cursor-pointer"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : matches.length > 0 ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-50 text-[#0f766e] flex items-center justify-center text-lg shrink-0">
                    🚗
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-[#0b2a4a]">Hiện không có chuyến đi nào đang diễn ra</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Các chuyến xe trước đó của bạn đã hoàn thành hoặc đã hủy ở danh sách bên dưới.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setView('search')}
                    className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
                  >
                    🔍 Tìm chuyến xe
                  </button>
                  <button
                    onClick={() => setView('post-request')}
                    className="px-3.5 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    🙋 Đăng yêu cầu mới
                  </button>
                </div>
              </div>
            ) : null}

            {/* Lịch sử chuyến đi đã hoàn thành & Đánh giá */}
            {matches.filter(m => m.trang_thai === 'hoan_thanh').length > 0 && (
              <div className="space-y-4">
                <h3 className="font-bold text-[#0b2a4a] text-sm flex items-center gap-1.5">
                  <span>🎉</span>
                  <span>Chuyến đi đã hoàn thành ({matches.filter(m => m.trang_thai === 'hoan_thanh').length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matches.filter(m => m.trang_thai === 'hoan_thanh').map((m) => (
                    <div key={m.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-500">Mã ghép #{m.id}</span>
                        <Badge map={TRANG_THAI_GHEP} value={m.trang_thai} />
                      </div>
                      <h4 className="text-base font-bold text-[#0b2a4a]">
                        {m.cx_diem_di || 'Điểm đón'} ➔ {m.cx_diem_den || 'Điểm trả'}
                      </h4>
                      <div className="text-xs text-slate-600 space-y-1">
                        <p>🕒 Giờ khởi hành: <b>{formatTime(m.cx_thoi_gian || m.thoi_gian_ghep)}</b></p>
                        <p>👤 Bác tài: <b>{m.tai_xe_ten || 'Tài xế'}</b></p>
                      </div>

                      <div className="pt-2 border-t border-slate-100 space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg font-medium border border-emerald-100">
                          <span>✅</span>
                          <span>Chuyến đi đã hoàn tất</span>
                        </div>
                        {m.danh_gia_sao ? (
                          <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200/60 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-600 flex items-center gap-1">
                                <span>{'★'.repeat(m.danh_gia_sao)}{'☆'.repeat(5 - m.danh_gia_sao)}</span>
                                <span>({m.danh_gia_sao}/5 sao)</span>
                              </span>
                              <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold border border-emerald-100">
                                Đã đánh giá
                              </span>
                            </div>
                            {m.nhan_xet && (
                              <p className="text-slate-700 text-xs italic mt-1 font-medium">"{m.nhan_xet}"</p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => handleOpenRatingModal(m)}
                            className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>⭐</span>
                            <span>Đánh giá dịch vụ tài xế (tùy chọn)</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lịch sử chuyến đi đã hủy */}
            {matches.filter(m => m.trang_thai === 'da_huy').length > 0 && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-600 text-sm flex items-center gap-1.5">
                  <span>❌</span>
                  <span>Chuyến đi đã hủy ({matches.filter(m => m.trang_thai === 'da_huy').length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {matches.filter(m => m.trang_thai === 'da_huy').map((m) => (
                    <div key={m.id} className="bg-white rounded-2xl border border-rose-100 shadow-sm p-5 space-y-2 opacity-85">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-slate-400">Mã ghép #{m.id}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          Đã hủy
                        </span>
                      </div>
                      <h4 className="text-base font-bold text-slate-500 line-through">
                        {m.cx_diem_di || 'Điểm đón'} ➔ {m.cx_diem_den || 'Điểm trả'}
                      </h4>
                      <div className="text-xs text-slate-500 space-y-1">
                        <p>🕒 Giờ: {formatTime(m.cx_thoi_gian || m.thoi_gian_ghep)}</p>
                        <p>👤 Bác tài: {m.tai_xe_ten || 'Tài xế'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Khi không có chuyến nào */}
            {matches.length === 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-500 text-xs">
                Bạn chưa có chuyến đi nào. Hãy đăng yêu cầu hoặc tìm kiếm chuyến xe để trải nghiệm dịch vụ nhé!
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: CÀI ĐẶT TÀI KHOẢN, AVATAR & ĐỔI MẬT KHẨU */}
      {userProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">
                Hồ sơ & Tài khoản hành khách
              </h3>
              <button
                onClick={() => setUserProfileModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Ảnh đại diện */}
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-14 h-14 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-xl flex items-center justify-center overflow-hidden shrink-0">
                  {profileAvatar ? (
                    <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    'LA'
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="px-3 py-1.5 bg-[#0f766e] text-white font-semibold rounded-lg hover:bg-[#115e59] transition cursor-pointer"
                  >
                    Thay ảnh đại diện
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ JPG, PNG tối đa 2MB</p>
                </div>
              </div>

              {/* Form 1: Cập nhật thông tin */}
              <form onSubmit={handleUpdateProfileInfo} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Số điện thoại liên hệ</label>
                  <input
                    type="text"
                    required
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 bg-[#0f766e] text-white font-semibold rounded-xl hover:bg-[#115e59] transition"
                >
                  {savingProfile ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
              </form>

              {/* Form 2: Đổi mật khẩu */}
              <form onSubmit={handleChangePassword} className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-bold text-slate-700">Đổi mật khẩu</h4>
                <div>
                  <label className="block text-slate-600 mb-1">Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Mật khẩu mới (hoa, số, ký tự đặc biệt)</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1">Xác nhận mật khẩu mới</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full py-2.5 bg-[#0b2a4a] text-white font-semibold rounded-xl hover:bg-[#123a66] transition"
                >
                  {savingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                </button>
              </form>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={handleLogout}
                  className="text-rose-600 font-bold hover:underline"
                >
                  Đăng xuất
                </button>
                <button
                  onClick={() => setUserProfileModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-medium"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ĐÁNH GIÁ CHUYẾN ĐI & TÀI XẾ */}
      {ratingModalMatch && (() => {
        const isAlreadyCompleted = ratingModalMatch.trang_thai === 'hoan_thanh';
        return (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-xl">⭐</span>
                  <h3 className="text-base font-bold text-[#0b2a4a]">
                    {isAlreadyCompleted ? 'Đánh giá dịch vụ tài xế' : 'Đánh giá tài xế & chuyến đi'}
                  </h3>
                </div>
                <button
                  onClick={() => setRatingModalMatch(null)}
                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs text-slate-700">
                <p className="font-bold text-slate-900">
                  {ratingModalMatch.cx_diem_di || 'Điểm đón'} ➔ {ratingModalMatch.cx_diem_den || 'Điểm trả'}
                </p>
                <p className="text-slate-500">
                  Tài xế: <b>{ratingModalMatch.tai_xe_ten || 'Bác tài'}</b>
                </p>
                {isAlreadyCompleted && (
                  <p className="text-[11px] font-semibold text-emerald-700 mt-1">
                    ✅ Chuyến đi này đã được hoàn tất thành công.
                  </p>
                )}
              </div>

              <form onSubmit={handleSubmitReview} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2 text-center">
                    Bạn đánh giá dịch vụ thế nào?
                  </label>
                  <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewStars(star)}
                        className="text-3xl transition-transform hover:scale-125 cursor-pointer focus:outline-none"
                      >
                        <span className={star <= reviewStars ? 'text-amber-400' : 'text-slate-200'}>
                          ★
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="text-center text-xs font-semibold text-amber-700 mt-1.5">
                    {reviewStars === 5 && 'Tuyệt vời (5/5) 🤩'}
                    {reviewStars === 4 && 'Rất tốt (4/5) 😊'}
                    {reviewStars === 3 && 'Bình thường (3/5) 😐'}
                    {reviewStars === 2 && 'Chưa hài lòng (2/5) 🙁'}
                    {reviewStars === 1 && 'Rất tệ (1/5) 😡'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhận xét của bạn (tùy chọn)
                  </label>
                  <textarea
                    rows={3}
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Bác tài nhiệt tình, đón đúng giờ, lái xe an toàn..."
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-[#0f766e] focus:outline-none transition resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={isAlreadyCompleted ? () => setRatingModalMatch(null) : handleSkipReviewAndComplete}
                    disabled={submittingReview}
                    className="px-3.5 py-2 rounded-xl text-xs text-slate-500 hover:bg-slate-100 font-semibold cursor-pointer"
                  >
                    {isAlreadyCompleted ? 'Để sau' : 'Bỏ qua đánh giá'}
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-5 py-2 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    {submittingReview
                      ? 'Đang gửi...'
                      : isAlreadyCompleted
                      ? 'Gửi đánh giá dịch vụ ➔'
                      : 'Gửi đánh giá & Hoàn tất chuyến ➔'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

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
