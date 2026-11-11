import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSession, clearSession } from './api';

const TRANG_THAI_CHUYEN = {
  con_ghe: ['Còn ghế trống', 'bg-emerald-100 text-emerald-700'],
  da_day: ['Đã đầy', 'bg-amber-100 text-amber-700'],
  da_khoi_hanh: ['Đã khởi hành', 'bg-gray-100 text-gray-600'],
  da_ghep: ['Đang chạy (Đã ghép)', 'bg-teal-100 text-teal-800'],
  hoan_thanh: ['Hoàn thành', 'bg-blue-100 text-blue-700'],
  da_huy: ['Đã hủy', 'bg-red-100 text-red-600'],
};
const TRANG_THAI_YEU_CAU = {
  cho_ghep: ['Đang chờ ghép', 'bg-gray-100 text-gray-600'],
  da_ghep: ['Đã ghép', 'bg-emerald-100 text-emerald-700'],
  hoan_thanh: ['Hoàn thành', 'bg-blue-100 text-blue-700'],
  het_han: ['Hết hạn', 'bg-red-100 text-red-600'],
  da_huy: ['Đã hủy', 'bg-red-100 text-red-600'],
};
const TRANG_THAI_GHEP = {
  de_xuat: ['Đã ghép', 'bg-emerald-100 text-emerald-700'],
  da_ghep: ['Đã ghép', 'bg-emerald-100 text-emerald-700'],
  hoan_thanh: ['Đã hoàn thành', 'bg-blue-100 text-blue-700'],
  da_huy: ['Đã hủy', 'bg-red-100 text-red-600'],
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

const NAV_PASSENGER = [
  { key: 'search', label: '🔍 Tìm chuyến xe', desc: 'Tìm xe tiện chuyến' },
  { key: 'post-request', label: '🙋 Đăng yêu cầu tìm xe', desc: 'Nhờ AI tìm tài xế' },
  { key: 'activity', label: '📋 Chuyến xe của tôi', desc: 'Lịch sử & chuyến đã đặt' },
];

const NAV_DRIVER = [
  { key: 'driver-trips', label: '🚗 Chuyến xe tôi chạy', desc: 'Quản lý chuyến & số ghế' },
  { key: 'post-trip', label: '➕ Đăng chuyến xe mới', desc: 'Mở chuyến cho khách' },
  { key: 'passenger-requests', label: '👥 Khách hàng cần đón', desc: 'Danh sách khách cần xe' },
  { key: 'activity', label: '📋 Lịch sử nhận chở', desc: 'Lịch sử các cặp ghép' },
];

export default function UserDashboard() {
  const navigate = useNavigate();
  const session = getSession();

  // Chế độ vai trò: 'khach_hang' (Hành khách) hoặc 'tai_xe' (Tài xế)
  const [roleMode, setRoleMode] = useState(() => localStorage.getItem('xeghep_role_mode') || 'khach_hang');
  const navList = roleMode === 'tai_xe' ? NAV_DRIVER : NAV_PASSENGER;

  const [view, setView] = useState(() => (roleMode === 'tai_xe' ? 'driver-trips' : 'search'));
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [trips, setTrips] = useState([]);
  const [requests, setRequests] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [reqFilterText, setReqFilterText] = useState('');

  // Form đăng chuyến
  const [tDiemDi, setTDiemDi] = useState('');
  const [tDiemDen, setTDiemDen] = useState('');
  const [tThoiGian, setTThoiGian] = useState('');
  const [tGhe, setTGhe] = useState(1);
  const [tSdt, setTSdt] = useState(session.sdt || '');

  // Form tìm chuyến
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
  const [currentName, setCurrentName] = useState(session.hoTen || '');
  const [profileData, setProfileData] = useState(null);
  const [profileName, setProfileName] = useState(session.hoTen || '');
  const [profilePhone, setProfilePhone] = useState(session.sdt || '');
  const [profileEmail, setProfileEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const userName = currentName || session.hoTen || 'Thành viên';
  const firstLetter = (userName || 'U').charAt(0).toUpperCase();
  const myId = Number(session.id);

  const activePassengerMatch = matches.find(
    m => Number(m.hanh_khach_id) === myId && m.trang_thai !== 'hoan_thanh' && m.trang_thai !== 'da_huy'
  );

  const [expandedMatches, setExpandedMatches] = useState(false);
  const [acceptingReq, setAcceptingReq] = useState(null);
  const [selectedTripIdForAccept, setSelectedTripIdForAccept] = useState('');
  const [acceptPhone, setAcceptPhone] = useState('');
  const [acceptBusy, setAcceptBusy] = useState(false);

  // Phân loại lượt ghép chuyến theo đúng vai trò đang chọn (Khách hàng vs Tài xế)
  const relevantMatches = useMemo(() => {
    return matches.filter((m) => {
      const laTaiXe = Number(m.tai_xe_id) === myId;
      if (roleMode === 'tai_xe') {
        // Tài xế: chỉ hiển thị ở tab lịch sử những lượt đã hoàn thành hoặc đã hủy
        return laTaiXe && (m.trang_thai === 'hoan_thanh' || m.trang_thai === 'da_huy');
      }
      return !laTaiXe;
    });
  }, [matches, roleMode, myId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleSwitchRole = (newRole) => {
    setRoleMode(newRole);
    localStorage.setItem('xeghep_role_mode', newRole);
    if (newRole === 'tai_xe') {
      setView('driver-trips');
      showToast('🚗 Đã chuyển sang chế độ Tài xế');
    } else {
      setView('search');
      showToast('🙋 Đã chuyển sang chế độ Khách hàng');
    }
  };

  const loadData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const [tRes, rRes, mRes, pRes, allReqRes] = await Promise.allSettled([
        api.listTrips(true),
        api.listRequests(true),
        api.listMatches(true),
        api.getProfile(),
        api.listRequests(false),
      ]);
      if (tRes.status === 'fulfilled') setTrips(tRes.value);
      if (rRes.status === 'fulfilled') setRequests(rRes.value);
      if (mRes.status === 'fulfilled') setMatches(mRes.value);
      if (allReqRes.status === 'fulfilled' && Array.isArray(allReqRes.value)) {
        setAllRequests(allReqRes.value);
      }
      if (pRes.status === 'fulfilled' && pRes.value) {
        setProfileData(pRes.value);
        if (pRes.value.ho_ten) {
          setProfileName(pRes.value.ho_ten);
          setCurrentName(pRes.value.ho_ten);
        }
        if (pRes.value.sdt) setProfilePhone(pRes.value.sdt);
        if (pRes.value.email) setProfileEmail(pRes.value.email);
        if (pRes.value.avatar_url) {
          setProfileAvatar(pRes.value.avatar_url);
          localStorage.setItem('userAvatar', pRes.value.avatar_url);
        }
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!session.id) {
      navigate('/');
      return;
    }
    const initTimer = setTimeout(loadData, 0);
    const timer = setInterval(loadData, 15000);
    return () => {
      clearTimeout(initTimer);
      clearInterval(timer);
    };
  }, [loadData, navigate, session.id]);

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  const syncPhone = (phone) => {
    const clean = (phone || '').trim();
    if (clean) {
      localStorage.setItem('userSdt', clean);
      setTSdt(clean);
      setSSdt(clean);
      setRSdt(clean);
      setProfilePhone(clean);
    }
  };

  // Xử lý đổi ảnh đại diện
  const handleAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Vui lòng chọn tệp hình ảnh hợp lệ (JPG, PNG, WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', 0.85);

        try {
          setSavingProfile(true);
          await api.updateProfile({ avatar_url: base64 });
          setProfileAvatar(base64);
          localStorage.setItem('userAvatar', base64);
          showToast('🎉 Đã cập nhật ảnh đại diện thành công!');
        } catch (err) {
          showToast(err.message || 'Lỗi khi cập nhật ảnh đại diện');
        } finally {
          setSavingProfile(false);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  // Cập nhật thông tin cá nhân
  const handleUpdateProfileInfo = async (e) => {
    e.preventDefault();
    const cleanName = profileName.trim();
    const cleanPhone = profilePhone.trim();
    if (!cleanName) {
      showToast('Vui lòng nhập họ và tên');
      return;
    }
    if (cleanPhone && !/^0\d{9}$/.test(cleanPhone)) {
      showToast('Số điện thoại phải gồm đúng 10 số và bắt đầu bằng số 0');
      return;
    }

    setSavingProfile(true);
    try {
      await api.updateProfile({ ho_ten: cleanName, sdt: cleanPhone });
      localStorage.setItem('userName', cleanName);
      if (cleanPhone) localStorage.setItem('userSdt', cleanPhone);
      else localStorage.removeItem('userSdt');
      setCurrentName(cleanName);
      syncPhone(cleanPhone);
      setProfileData((prev) => (prev ? { ...prev, ho_ten: cleanName, sdt: cleanPhone } : { ho_ten: cleanName, sdt: cleanPhone }));
      showToast('🎉 Đã cập nhật thông tin cá nhân thành công!');
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật thông tin');
    } finally {
      setSavingProfile(false);
    }
  };

  // Đổi mật khẩu
  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      showToast('Vui lòng nhập mật khẩu hiện tại');
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      showToast('Mật khẩu mới phải có tối thiểu 8 ký tự');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      showToast('Mật khẩu mới phải có ít nhất 1 chữ in hoa (A-Z)');
      return;
    }
    if (!/\d/.test(newPassword)) {
      showToast('Mật khẩu mới phải có ít nhất 1 chữ số (0-9)');
      return;
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      showToast('Mật khẩu mới phải có ít nhất 1 ký tự đặc biệt (!@#$...)');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('Xác nhận mật khẩu mới không khớp');
      return;
    }

    setSavingPassword(true);
    try {
      await api.updateProfile({
        password_cu: currentPassword,
        password_moi: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('🔒 Đổi mật khẩu tài khoản thành công!');
    } catch (err) {
      showToast(err.message || 'Lỗi khi đổi mật khẩu');
    } finally {
      setSavingPassword(false);
    }
  };

  const formatTime = (val) => {
    if (!val) return 'Linh hoạt';
    const match = String(val).match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})/);
    if (match) {
      const [, y, m, d, hh, min] = match;
      return `${hh.padStart(2, '0')}:${min} (${String(Number(d)).padStart(2, '0')}/${String(Number(m)).padStart(2, '0')})`;
    }
    return val;
  };

  // Đăng chuyến (Tài xế)
  const handleSubmitTrip = async (e) => {
    e.preventDefault();
    if (tSdt && !/^0\d{9}$/.test(tSdt.trim())) {
      showToast('Số điện thoại phải gồm đúng 10 số và bắt đầu bằng số 0');
      return;
    }
    setBusy(true);
    try {
      const res = await api.createTrip({
        diem_di: tDiemDi,
        diem_den: tDiemDen,
        thoi_gian_chay: tThoiGian,
        so_ghe_trong: Number(tGhe),
        sdt: tSdt,
      });
      syncPhone(tSdt);
      setTDiemDi('');
      setTDiemDen('');
      setTThoiGian('');
      setTGhe(1);
      showToast(res?.so_cap_ghep_moi > 0 ? `Đã đăng chuyến và ghép tự động ${res.so_cap_ghep_moi} hành khách!` : 'Đã đăng chuyến xe — AI đang tự tìm hành khách phù hợp');
      setView('driver-trips');
      await loadData();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Tìm chuyến (Hành khách)
  const handleSearch = async (e) => {
    e.preventDefault();
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
      syncPhone(sSdt);
      const ket_qua = await api.searchTrips({ diem_di: sDiemDi, diem_den: sDiemDen, thoi_gian: sThoiGian });
      
      // Lọc nghiêm ngặt trên client: loại bỏ chuyến đã quá ngày, và nếu tìm ngày 28 thì tuyệt đối không hiển thị chuyến ngày 27
      let filtered = Array.isArray(ket_qua) ? ket_qua : [];
      filtered = filtered.filter((t) => {
        if (isDateInPast(t.thoi_gian_chay, t.bai_viet_thoi_gian || t.ngay_tao)) return false;
        if (sThoiGian) {
          const searchDate = new Date(sThoiGian);
          const sDay = searchDate.getDate();
          const isFlex = !t.thoi_gian_chay || /(linh hoạt|hàng ngày|liên tục|thỏa thuận|bất kỳ|24\/7|24\/24)/i.test(t.thoi_gian_chay);
          const tParts = extractDateParts(t.thoi_gian_chay);
          if (isFlex || !tParts) return true; // Chuyến giờ linh hoạt
          return tParts.day === sDay && tParts.month === sMonth;
        }
        return true;
      });

      setKetQuaTim(filtered);
      if (filtered.length === 0) {
        showToast('Chưa có chuyến nào phù hợp vào ngày bạn chọn. Thử đăng yêu cầu để hệ thống thông báo khi có xe!');
      }
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Đặt xe
  const handleChonChuyen = async (t) => {
    if (activePassengerMatch) {
      showToast(`Bạn đang có chuyến đi chưa hoàn thành (${activePassengerMatch.cx_diem_di} → ${activePassengerMatch.cx_diem_den}). Vui lòng hoàn thành hoặc hủy chuyến trước khi đặt chuyến mới.`);
      setView('activity');
      return;
    }
    let sdtToUse = (sSdt || session.sdt || tSdt || rSdt || '').trim();
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

      const zaloUrl = res?.zalo_url || t?.zalo_url || (t.sdt ? `https://zalo.me/${t.sdt.replace(/\D/g, '')}` : '');
      if (zaloUrl) {
        showToast('🎉 Đặt xe thành công! Đang chuyển sang Zalo với tài xế...');
        try {
          window.open(zaloUrl, '_blank', 'noopener,noreferrer');
        } catch {
          window.location.assign(zaloUrl);
        }
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

  // Đăng yêu cầu tìm xe (Hành khách)
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
    if (rThoiGian) {
      const pickedDate = new Date(rThoiGian);
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
      showToast(res?.so_cap_ghep_moi > 0 ? `Đã gửi yêu cầu và tìm thấy ngay ${res.so_cap_ghep_moi} chuyến phù hợp!` : 'Đã gửi yêu cầu di chuyển — AI đang tự tìm chuyến phù hợp');
      setView('activity');
      await loadData();
    } catch (err) {
      showToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Hoàn thành chuyến (Ghép)
  const handleHoanThanhChuyen = async (matchId) => {
    if (!window.confirm('Xác nhận bạn đã hoàn thành chuyến đi này?')) return;
    setBusy(true);
    try {
      const res = await api.completeMatch(matchId);
      showToast(res?.message || 'Đã xác nhận hoàn thành chuyến đi!');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi xác nhận hoàn thành');
    } finally {
      setBusy(false);
    }
  };

  // Hủy chuyến (Ghép)
  const handleHuyChuyen = async (matchId) => {
    if (!window.confirm('Bạn có chắc chắn muốn hủy chuyến đi này? Chỗ ngồi sẽ được hoàn trả lại cho chuyến xe trên hệ thống.')) return;
    setBusy(true);
    try {
      const res = await api.cancelMatch(matchId);
      showToast(res?.message || 'Đã hủy chuyến và hoàn trả chỗ ngồi thành công!');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi hủy chuyến');
    } finally {
      setBusy(false);
    }
  };

  // Tài xế cập nhật trạng thái chuyến xe của mình
  const handleUpdateDriverTrip = async (tripId, newStatus) => {
    const statusLabels = {
      con_ghe: 'Mở lại Còn ghế trống',
      da_day: 'Đánh dấu Đã đầy khách',
      hoan_thanh: 'Xác nhận Hoàn thành chuyến',
      da_huy: 'Hủy chuyến xe này',
    };
    if (!window.confirm(`Bạn có chắc muốn ${statusLabels[newStatus] || newStatus} cho chuyến #${tripId}?`)) return;
    setBusy(true);
    try {
      await api.updateTripStatus(tripId, { trang_thai: newStatus });
      showToast(`✅ Đã cập nhật trạng thái chuyến #${tripId}!`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi cập nhật chuyến xe');
    } finally {
      setBusy(false);
    }
  };

  // Mở modal chốt nhận khách
  const handleOpenAcceptModal = (reqItem) => {
    setAcceptingReq(reqItem);
    setAcceptPhone((session.sdt || tSdt || sSdt || '').trim());
    const activeDriverTrips = trips.filter(
      (t) => (t.trang_thai === 'con_ghe' || !t.trang_thai) && (t.so_ghe_trong === undefined || t.so_ghe_trong > 0)
    );
    const matchedTrip = activeDriverTrips.find(
      (t) =>
        t.diem_di &&
        t.diem_den &&
        reqItem.diem_di &&
        reqItem.diem_den &&
        (t.diem_di.toLowerCase().includes(reqItem.diem_di.toLowerCase()) ||
          reqItem.diem_di.toLowerCase().includes(t.diem_di.toLowerCase()))
    );
    setSelectedTripIdForAccept(matchedTrip ? String(matchedTrip.id) : (activeDriverTrips[0] ? String(activeDriverTrips[0].id) : ''));
  };

  // Xác nhận chốt nhận khách từ tài xế
  const handleConfirmAcceptRequest = async (e) => {
    if (e) e.preventDefault();
    if (!acceptingReq) return;

    let phoneToUse = acceptPhone.trim();
    if (phoneToUse && !/^0\d{9}$/.test(phoneToUse)) {
      showToast('⚠️ Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).');
      return;
    }

    setAcceptBusy(true);
    try {
      const payload = {
        chuyen_xe_id: selectedTripIdForAccept ? Number(selectedTripIdForAccept) : null,
        sdt: phoneToUse,
      };
      const res = await api.acceptRequest(acceptingReq.id, payload);
      showToast(res.message || '🎉 Đã nhận đơn thành công!');
      setAcceptingReq(null);
      await loadData();
      setView('driver-trips');
    } catch (err) {
      showToast(err.message || 'Lỗi khi nhận đơn');
    } finally {
      setAcceptBusy(false);
    }
  };

  // Lọc danh sách khách hàng cần đón
  const filteredPassengerRequests = allRequests.filter((r) => {
    if (r.trang_thai === 'hoan_thanh' || r.trang_thai === 'da_huy' || r.trang_thai === 'het_han' || r.trang_thai === 'da_ghep') return false;
    if (isDateInPast(r.thoi_gian_don, r.bai_viet_thoi_gian || r.ngay_tao)) return false;
    if (!reqFilterText.trim()) return true;
    const q = reqFilterText.trim().toLowerCase();
    return (
      (r.diem_di && r.diem_di.toLowerCase().includes(q)) ||
      (r.diem_den && r.diem_den.toLowerCase().includes(q)) ||
      (r.sdt && r.sdt.includes(q))
    );
  });

  const todayMinStr = new Date().toLocaleDateString('en-CA') + 'T00:00';

  return (
    <div className="min-h-screen bg-[#f3f6fb] flex font-sans text-slate-800">
      {/* Hidden file input for Avatar selection */}
      <input
        type="file"
        ref={avatarInputRef}
        accept="image/*"
        onChange={handleAvatarFileSelect}
        className="hidden"
      />

      {/* ASIDE SIDEBAR (DESKTOP) */}
      <aside className="w-64 bg-[#0b2a4a] text-white flex flex-col hidden md:flex shrink-0 h-screen sticky top-0 overflow-y-auto z-30 shadow-md">
        <div>
          <div className="p-5 flex items-center space-x-3 border-b border-white/10 shrink-0">
            <img src="/logo.png" alt="Logo Xe Tiện Chuyến" className="w-10 h-10 object-contain drop-shadow-md rounded-2xl" />
            <div>
              <span className="text-lg font-black text-white tracking-tight block">Xe Tiện Chuyến</span>
              <span className="text-[10px] font-bold text-teal-400 tracking-widest uppercase block -mt-1">
                {roleMode === 'tai_xe' ? 'DÀNH CHO TÀI XẾ' : 'DÀNH CHO HÀNH KHÁCH'}
              </span>
            </div>
          </div>

          {/* Toggle Role Banner in Sidebar */}
          <div className="p-3.5 mx-3 my-3 bg-white/5 border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Chế độ giao diện</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30">
                {roleMode === 'tai_xe' ? 'Tài xế' : 'Khách hàng'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1 bg-black/30 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleSwitchRole('khach_hang')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                  roleMode === 'khach_hang'
                    ? 'bg-[#0f766e] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🙋 Khách</span>
              </button>
              <button
                type="button"
                onClick={() => handleSwitchRole('tai_xe')}
                className={`py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1 ${
                  roleMode === 'tai_xe'
                    ? 'bg-[#0f766e] text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span>🚗 Tài xế</span>
              </button>
            </div>
          </div>

          {/* Sidebar Nav */}
          <nav className="p-3 space-y-1">
            {navList.map((item) => (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer flex flex-col ${
                  view === item.key
                    ? 'bg-gradient-to-r from-teal-500/25 to-white/10 text-white font-bold shadow-xs border-l-4 border-teal-400 pl-3'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-slate-400 font-normal mt-0.5">{item.desc}</span>
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top gradient stripe matching landing page */}
        <div className="h-[3px] bg-gradient-to-r from-teal-500 via-[#0f766e] to-[#0b2a4a] w-full shrink-0" />

        {/* HEADER */}
        <header className="bg-white/90 backdrop-blur-md border-b border-slate-200 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-20">
          <div className="flex items-center space-x-2 md:hidden">
            <img src="/logo.png" alt="Logo Xe Tiện Chuyến" className="w-8 h-8 object-contain" />
            <span className="text-base font-black text-[#0b2a4a] leading-none block">Xe Tiện Chuyến</span>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <span className="text-lg font-black text-[#0b2a4a] tracking-tight">{navList.find((n) => n.key === view)?.label}</span>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${roleMode === 'tai_xe' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-teal-50 text-teal-800 border border-teal-200'}`}>
              {roleMode === 'tai_xe' ? '🚗 Tài xế' : '🙋 Khách hàng'}
            </span>
          </div>

          {/* Action Buttons: Switch Role + User Avatar */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Segmented role switch toggle in Header */}
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => handleSwitchRole('khach_hang')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  roleMode === 'khach_hang' ? 'bg-[#0b2a4a] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🙋 Khách hàng
              </button>
              <button
                type="button"
                onClick={() => handleSwitchRole('tai_xe')}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                  roleMode === 'tai_xe' ? 'bg-[#0b2a4a] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🚗 Tài xế
              </button>
            </div>

            {/* Mobile quick switch button */}
            <button
              onClick={() => handleSwitchRole(roleMode === 'tai_xe' ? 'khach_hang' : 'tai_xe')}
              className="sm:hidden px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[#0b2a4a] text-white shadow-xs"
            >
              {roleMode === 'tai_xe' ? '🙋 Khách' : '🚗 Tài xế'}
            </button>

            {/* Clickable Avatar button -> Opens Account Modal */}
            <button
              onClick={() => setUserProfileModalOpen(true)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition border border-transparent hover:border-slate-200 cursor-pointer"
              title="Nhấn vào để Quản lý tài khoản & đổi ảnh đại diện"
            >
              {profileAvatar ? (
                <img
                  src={profileAvatar}
                  alt={userName}
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-teal-500"
                />
              ) : (
                <div className="w-8 h-8 bg-[#0b2a4a] text-white rounded-full flex items-center justify-center font-black text-xs ring-2 ring-teal-500/40">
                  {firstLetter}
                </div>
              )}
              <span className="text-xs font-bold text-slate-700 hidden sm:inline max-w-[110px] truncate">{userName}</span>
            </button>

            <button
              onClick={handleLogout}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition cursor-pointer"
              title="Đăng xuất khỏi hệ thống"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        {/* MOBILE NAVIGATION BAR */}
        <div className="md:hidden bg-white border-b border-slate-200 px-3 py-2 flex gap-2 overflow-x-auto shrink-0 shadow-xs">
          {navList.map((item) => (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                view === item.key ? 'bg-[#0b2a4a] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* MAIN BODY CONTENT */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl w-full mx-auto space-y-6">
          {/* ============================================================== */}
          {/* TAB 1: TÌM CHUYẾN XE (KHÁCH HÀNG) */}
          {/* ============================================================== */}
          {view === 'search' && (
            <>
              {activePassengerMatch && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 text-sm shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">⚠️</span>
                    <div>
                      <p className="font-bold text-amber-950">
                        Bạn đang có chuyến đi đang hoạt động: {activePassengerMatch.cx_diem_di} → {activePassengerMatch.cx_diem_den}
                      </p>
                      <p className="text-xs text-amber-800 mt-1">
                        Mỗi hành khách chỉ được tham gia 1 chuyến tại một thời điểm. Vui lòng hoàn thành hoặc hủy chuyến hiện tại trước khi đặt chuyến mới.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView('activity')}
                    className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-sm"
                  >
                    Quản lý chuyến đi →
                  </button>
                </div>
              )}

              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
                <div className="mb-6">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block mb-2">
                    Kết nối trực tiếp · Tiết kiệm 40% - 50%
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black text-[#0b2a4a] tracking-tight">
                    Tìm chuyến xe ghép cùng tuyến
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-1">
                    Nhập điểm đi, điểm đến và ngày mong muốn. Hệ thống sẽ lọc chính xác chuyến xe còn chỗ chạy trong ngày đó.
                  </p>
                </div>
                <form onSubmit={handleSearch} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Điểm đi (Tỉnh / Huyện / Điểm đón)">
                    <input
                      value={sDiemDi}
                      onChange={(e) => setSDiemDi(e.target.value)}
                      required
                      placeholder="VD: Cầu Giấy, Hà Nội"
                      className="inp"
                    />
                  </Field>
                  <Field label="Điểm đến (Tỉnh / Huyện / Điểm trả)">
                    <input
                      value={sDiemDen}
                      onChange={(e) => setSDiemDen(e.target.value)}
                      required
                      placeholder="VD: Sân bay Nội Bài hoặc Việt Trì"
                      className="inp"
                    />
                  </Field>
                  <Field label="Thời gian khởi hành (Từ hôm nay trở đi)">
                    <input
                      type="datetime-local"
                      min={todayMinStr}
                      value={sThoiGian}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          const picked = new Date(val);
                          const now = new Date();
                          const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                          const pickedZero = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
                          if (pickedZero < todayZero) {
                            showToast('⚠️ Không thể chọn ngày trong quá khứ! Vui lòng chọn ngày từ hôm nay trở đi.');
                            return;
                          }
                        }
                        setSThoiGian(val);
                      }}
                      className="inp"
                    />
                  </Field>
                  <Field label="Số điện thoại liên hệ">
                    <input
                      value={sSdt}
                      onChange={(e) => setSSdt(e.target.value)}
                      required
                      placeholder="09xxxxxxxx (10 số)"
                      maxLength={10}
                      className="inp font-mono"
                    />
                  </Field>
                  <button
                    disabled={busy}
                    type="submit"
                    className="md:col-span-2 py-3.5 text-white font-extrabold bg-[#0b2a4a] rounded-xl hover:bg-[#123a66] transition disabled:opacity-60 shadow-md hover:shadow-lg cursor-pointer text-sm"
                  >
                    {busy ? 'Đang tìm kiếm chuyến xe...' : '🔍 Tìm chuyến xe phù hợp'}
                  </button>
                </form>
              </div>

              {ketQuaTim !== null && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
                  <h3 className="font-black text-[#0b2a4a] text-lg mb-4 flex items-center justify-between">
                    <span>
                      {ketQuaTim.length > 0 ? `🎉 Tìm thấy ${ketQuaTim.length} chuyến xe phù hợp` : 'Chưa có chuyến xe nào đúng ngày/tuyến bạn chọn'}
                    </span>
                    {sThoiGian && (
                      <span className="text-xs font-semibold text-slate-500 font-mono">
                        Ngày tìm kiếm: {formatTime(sThoiGian)}
                      </span>
                    )}
                  </h3>
                  <div className="space-y-3">
                    {ketQuaTim.map((t) => (
                      <div
                        key={t.id}
                        className="p-5 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-teal-500 hover:shadow-md transition-all bg-gradient-to-b from-slate-50/50 to-white"
                      >
                        <div>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 text-xs">{t.diem_phu_hop}% phù hợp</span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-sm font-black text-slate-900">{t.tai_xe_ten || 'Tài xế'}</span>
                          </div>
                          <p className="text-base font-black text-[#0b2a4a] flex items-center gap-2">
                            <span>{t.diem_di}</span>
                            <span className="text-teal-600">⇄</span>
                            <span>{t.diem_den}</span>
                          </p>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            🕒 {formatTime(t.thoi_gian_chay)} · 🪑 còn <b className="text-teal-700">{t.so_ghe_trong} ghế trống</b>
                          </p>
                        </div>
                        <button
                          onClick={() => handleChonChuyen(t)}
                          disabled={busy}
                          className={`shrink-0 flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-xl transition shadow-sm cursor-pointer ${
                            activePassengerMatch
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-[#0b2a4a] hover:bg-[#123a66] text-white disabled:opacity-60'
                          }`}
                        >
                          <span>{activePassengerMatch ? '⚠️ Đang có chuyến' : '🚗 Đặt xe ngay'}</span>
                        </button>
                      </div>
                    ))}
                    {ketQuaTim.length === 0 && (
                      <div className="p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-center text-sm text-slate-600">
                        <p className="font-bold text-slate-700 mb-1">Không tìm thấy chuyến xe nào chạy đúng ngày này.</p>
                        <p className="text-xs text-slate-500 mb-4">
                          Bạn có thể đăng một yêu cầu di chuyển để tài xế trên hệ thống chủ động gọi điện đón bạn!
                        </p>
                        <button
                          onClick={() => setView('post-request')}
                          className="px-5 py-2.5 bg-[#0b2a4a] hover:bg-[#123a66] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                        >
                          🙋 Đăng yêu cầu tìm xe ngay
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ============================================================== */}
          {/* TAB 2: ĐĂNG YÊU CẦU TÌM XE (KHÁCH HÀNG) */}
          {/* ============================================================== */}
          {view === 'post-request' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
              {activePassengerMatch && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-900 text-sm shadow-sm">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl leading-none">⚠️</span>
                    <div>
                      <p className="font-bold text-amber-950">
                        Bạn đang có chuyến đi đang hoạt động: {activePassengerMatch.cx_diem_di} → {activePassengerMatch.cx_diem_den}
                      </p>
                      <p className="text-xs text-amber-800 mt-1">
                        Hệ thống tạm khóa đăng yêu cầu mới cho đến khi bạn xác nhận hoàn thành hoặc hủy chuyến đi hiện tại.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setView('activity')}
                    className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition shadow-sm cursor-pointer"
                  >
                    Quản lý chuyến đi →
                  </button>
                </div>
              )}
              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block mb-2">
                  Đón trả tận nơi tại nhà
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-[#0b2a4a] tracking-tight">
                  Đăng yêu cầu tìm xe di chuyển
                </h2>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Bạn cần xe đi đâu? Đăng yêu cầu để các tài xế tiện chuyến chủ động liên hệ đón bạn qua điện thoại hoặc Zalo.
                </p>
              </div>
              <form onSubmit={handleSubmitRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Điểm đi (Đón tại)">
                  <input
                    value={rDiemDi}
                    onChange={(e) => setRDiemDi(e.target.value)}
                    required
                    placeholder="VD: Cầu Giấy, Hà Nội"
                    className="inp"
                  />
                </Field>
                <Field label="Điểm đến (Trả tại)">
                  <input
                    value={rDiemDen}
                    onChange={(e) => setRDiemDen(e.target.value)}
                    required
                    placeholder="VD: Sân bay Nội Bài hoặc TP Nam Định"
                    className="inp"
                  />
                </Field>
                <Field label="Thời gian mong muốn đón (Từ hôm nay trở đi)">
                  <input
                    type="datetime-local"
                    min={todayMinStr}
                    value={rThoiGian}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const picked = new Date(val);
                        const now = new Date();
                        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const pickedZero = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
                        if (pickedZero < todayZero) {
                          showToast('⚠️ Không thể chọn ngày trong quá khứ! Vui lòng chọn ngày từ hôm nay trở đi.');
                          return;
                        }
                      }
                      setRThoiGian(val);
                    }}
                    required
                    className="inp"
                  />
                </Field>
                <Field label="Số hành khách">
                  <input
                    type="number"
                    min={1}
                    max={4}
                    value={rSoKhach}
                    onChange={(e) => setRSoKhach(e.target.value)}
                    required
                    className="inp"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Số điện thoại liên hệ đón (10 số)">
                    <input
                      value={rSdt}
                      onChange={(e) => setRSdt(e.target.value)}
                      required
                      placeholder="09xxxxxxxx (10 số, bắt đầu bằng 0)"
                      maxLength={10}
                      className="inp"
                    />
                  </Field>
                </div>
                <button
                  disabled={busy}
                  type="submit"
                  className="md:col-span-2 py-3.5 text-white font-extrabold bg-[#0b2a4a] rounded-xl hover:bg-[#123a66] transition disabled:opacity-60 shadow-md hover:shadow-lg cursor-pointer text-sm"
                >
                  {busy ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu tìm xe'}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: CHUYẾN XE TÔI CHẠY (TÀI XẾ) */}
          {/* ============================================================== */}
          {view === 'driver-trips' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block mb-2">
                    Dành cho Tài xế
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black text-[#0b2a4a] tracking-tight">
                    Chuyến xe tôi đang chạy
                  </h2>
                  <p className="text-xs md:text-sm text-slate-500 mt-1">
                    Quản lý ghế trống, trạng thái chuyến đi và danh sách khách hàng đã ghép trên các chuyến của bạn.
                  </p>
                </div>
                <button
                  onClick={() => setView('post-trip')}
                  className="px-5 py-3 bg-[#0b2a4a] hover:bg-[#123a66] text-white font-bold text-xs rounded-xl transition shadow-sm flex items-center gap-2 shrink-0 cursor-pointer"
                >
                  <span>➕ Đăng chuyến mới</span>
                </button>
              </div>

              {(() => {
                const activeDriverTrips = trips.filter((t) => t.trang_thai !== 'hoan_thanh' && t.trang_thai !== 'da_huy');
                if (activeDriverTrips.length === 0) {
                  return (
                    <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                      <p className="text-base font-bold text-slate-700 mb-1">Hiện không có chuyến xe nào đang chạy</p>
                      <p className="text-xs text-slate-400 mb-5">
                        Bạn có thể vào mục "Khách hàng cần đón" để bấm "Nhận đơn" hoặc bấm nút bên dưới để đăng chuyến xe mới.
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-3">
                        <button
                          onClick={() => setView('passenger-requests')}
                          className="px-5 py-2.5 bg-[#0f766e] hover:bg-teal-700 text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
                        >
                          👥 Xem Khách hàng cần đón →
                        </button>
                        <button
                          onClick={() => setView('post-trip')}
                          className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          ➕ Đăng chuyến xe mới
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    {activeDriverTrips.map((t) => {
                      const tripPassengers = matches.filter(
                        (m) => Number(m.chuyen_xe_id) === Number(t.id) && m.trang_thai !== 'da_huy' && m.trang_thai !== 'hoan_thanh'
                      );

                      return (
                        <div key={t.id} className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-7 hover:border-teal-300 transition">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                                #{t.id}
                              </span>
                              <Badge map={TRANG_THAI_CHUYEN} value={t.trang_thai} />
                            </div>
                            <span className="text-xs font-mono text-slate-500">
                              Khởi hành: <b className="text-slate-800">{formatTime(t.thoi_gian_chay)}</b>
                            </span>
                          </div>

                          <div className="mb-4">
                            <h3 className="text-lg font-black text-[#0b2a4a] flex items-center gap-2">
                              <span>{t.diem_di}</span>
                              <span className="text-teal-600">⇄</span>
                              <span>{t.diem_den}</span>
                            </h3>
                            <p className="text-xs text-slate-600 mt-1.5">
                              Ghế trống: <b className="text-[#0f766e] bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">{t.so_ghe_trong} chỗ</b> · SĐT liên hệ: <span className="font-mono font-bold text-slate-800">{t.sdt}</span>
                            </p>
                          </div>

                          {/* Danh sách hành khách đã ghép vào chuyến này */}
                          {tripPassengers.length > 0 && (
                            <div className="mb-4 p-4 bg-slate-50/70 rounded-2xl border border-slate-200/80">
                              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                <span>👥 Khách đã nhận đón vào chuyến ({tripPassengers.length})</span>
                              </h4>
                              <div className="space-y-2">
                                {tripPassengers.map((m) => (
                                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white p-3.5 rounded-xl border border-slate-200">
                                    <div>
                                      <span className="font-bold text-slate-800">{m.hanh_khach_ten || 'Hành khách'}</span>
                                      <span className="text-slate-400 mx-1.5">·</span>
                                      <span className="font-mono text-slate-700 font-semibold">{m.yc_sdt || 'Chưa có SĐT'}</span>
                                      <span className="text-slate-400 mx-1.5">·</span>
                                      <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full">{m.so_khach || 1} khách</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {m.yc_sdt && (
                                        <>
                                          <a
                                            href={`tel:${m.yc_sdt}`}
                                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                                          >
                                            📞 Gọi
                                          </a>
                                          <a
                                            href={`https://zalo.me/${m.yc_sdt.replace(/\D/g, '')}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-1.5 bg-[#0b2a4a] hover:bg-[#123a66] text-white font-bold rounded-xl transition"
                                          >
                                            💬 Zalo
                                          </a>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Các nút cập nhật trạng thái chuyến xe */}
                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                            {t.trang_thai === 'con_ghe' && (
                              <button
                                onClick={() => handleUpdateDriverTrip(t.id, 'da_day')}
                                disabled={busy}
                                className="px-3.5 py-2 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl transition cursor-pointer"
                              >
                                🔴 Đánh dấu Đã đầy khách
                              </button>
                            )}
                            {t.trang_thai === 'da_day' && (
                              <button
                                onClick={() => handleUpdateDriverTrip(t.id, 'con_ghe')}
                                disabled={busy}
                                className="px-3.5 py-2 text-xs font-bold bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl transition cursor-pointer"
                              >
                                🟢 Mở lại Còn ghế trống
                              </button>
                            )}
                            <button
                              onClick={() => handleUpdateDriverTrip(t.id, 'hoan_thanh')}
                              disabled={busy}
                              className="px-3.5 py-2 text-xs font-bold bg-[#0b2a4a] hover:bg-[#123a66] text-white rounded-xl transition shadow-xs cursor-pointer"
                            >
                              ✓ Hoàn thành chuyến xe
                            </button>
                            <button
                              onClick={() => handleUpdateDriverTrip(t.id, 'da_huy')}
                              disabled={busy}
                              className="px-3.5 py-2 text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl transition cursor-pointer"
                            >
                              ✕ Hủy chuyến xe
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: ĐĂNG CHUYẾN XE MỚI (TÀI XẾ) */}
          {/* ============================================================== */}
          {view === 'post-trip' && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
              <div className="mb-6">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block mb-2">
                  Tối ưu ghế trống · Tăng thu nhập
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-[#0b2a4a] tracking-tight">
                  Đăng chuyến xe mới
                </h2>
                <p className="text-xs md:text-sm text-slate-500 mt-1">
                  Bạn có xe chạy tuyến nào? Đăng thông tin chuyến để hệ thống tự động tìm và ghép khách hàng có nhu cầu tương ứng.
                </p>
              </div>
              <form onSubmit={handleSubmitTrip} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Điểm đi (Nơi xuất phát)">
                  <input
                    value={tDiemDi}
                    onChange={(e) => setTDiemDi(e.target.value)}
                    required
                    placeholder="VD: Cầu Giấy, Hà Nội"
                    className="inp"
                  />
                </Field>
                <Field label="Điểm đến (Nơi đến)">
                  <input
                    value={tDiemDen}
                    onChange={(e) => setTDiemDen(e.target.value)}
                    required
                    placeholder="VD: Sân bay Nội Bài hoặc TP Hải Phòng"
                    className="inp"
                  />
                </Field>
                <Field label="Thời gian khởi hành (Từ hôm nay trở đi)">
                  <input
                    type="datetime-local"
                    min={todayMinStr}
                    value={tThoiGian}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val) {
                        const picked = new Date(val);
                        const now = new Date();
                        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        const pickedZero = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate());
                        if (pickedZero < todayZero) {
                          showToast('⚠️ Không thể chọn ngày trong quá khứ! Vui lòng chọn ngày từ hôm nay trở đi.');
                          return;
                        }
                      }
                      setTThoiGian(val);
                    }}
                    required
                    className="inp"
                  />
                </Field>
                <Field label="Số ghế trống nhận chở">
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={tGhe}
                    onChange={(e) => setTGhe(e.target.value)}
                    required
                    className="inp"
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Số điện thoại tài xế (10 số)">
                    <input
                      value={tSdt}
                      onChange={(e) => setTSdt(e.target.value)}
                      required
                      placeholder="09xxxxxxxx (10 số, bắt đầu bằng 0)"
                      maxLength={10}
                      className="inp font-mono"
                    />
                  </Field>
                </div>
                <button
                  disabled={busy}
                  type="submit"
                  className="md:col-span-2 py-3.5 text-white font-extrabold bg-[#0b2a4a] rounded-xl hover:bg-[#123a66] transition disabled:opacity-60 shadow-md hover:shadow-lg cursor-pointer text-sm"
                >
                  {busy ? 'Đang đăng chuyến...' : 'Đăng chuyến xe'}
                </button>
              </form>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 5: KHÁCH HÀNG CẦN ĐÓN (TÀI XẾ) */}
          {/* ============================================================== */}
          {view === 'passenger-requests' && (
            <div className="space-y-6">
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[#0f766e] bg-teal-50 px-3 py-1 rounded-full border border-teal-200 inline-block mb-2">
                      Dữ liệu thời gian thực
                    </span>
                    <h2 className="text-2xl font-black text-[#0b2a4a] tracking-tight">
                      Danh sách khách hàng cần xe
                    </h2>
                    <p className="text-xs md:text-sm text-slate-500 mt-1">
                      Các yêu cầu tìm xe đang chờ ghép. Bạn có thể gọi điện hoặc nhắn Zalo đón khách ngay!
                    </p>
                  </div>
                  <span className="text-xs font-bold px-3 py-1.5 bg-teal-50 text-teal-800 rounded-full border border-teal-200 self-start sm:self-auto shrink-0">
                    {filteredPassengerRequests.length} yêu cầu đang chờ
                  </span>
                </div>

                <input
                  type="text"
                  value={reqFilterText}
                  onChange={(e) => setReqFilterText(e.target.value)}
                  placeholder="🔎 Lọc theo điểm đi, điểm đến hoặc SĐT..."
                  className="inp"
                />
              </div>

              {filteredPassengerRequests.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  <p className="text-sm font-bold text-slate-700">Chưa có yêu cầu nào phù hợp</p>
                  <p className="text-xs text-slate-400 mt-1">Hãy quay lại sau hoặc thử xóa bộ lọc tìm kiếm.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredPassengerRequests.map((r) => (
                    <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between hover:border-teal-400 hover:shadow-md transition-all">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">#{r.id}</span>
                          <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                            {r.so_khach || 1} khách
                          </span>
                        </div>
                        <h3 className="text-base font-black text-[#0b2a4a] flex items-center gap-1.5">
                          <span>{r.diem_di}</span>
                          <span className="text-teal-600">⇄</span>
                          <span>{r.diem_den}</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1.5">
                          🕒 Đón lúc: <b className="text-slate-800">{formatTime(r.thoi_gian_don)}</b>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          📱 SĐT:{' '}
                          {r.sdt ? (
                            <a href={`tel:${r.sdt}`} className="font-mono font-bold text-[#0f766e] hover:underline">
                              {r.sdt}
                            </a>
                          ) : (
                            <span className="font-mono font-semibold text-slate-400">Chưa có</span>
                          )}
                        </p>
                      </div>

                      <div className="pt-3 mt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleOpenAcceptModal(r)}
                          disabled={busy}
                          className="w-full py-2.5 text-center text-xs font-bold text-white bg-[#0f766e] hover:bg-teal-700 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                        >
                          <span>🤝 Nhận đơn đón khách</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 6: HOẠT ĐỘNG / LỊCH SỬ CHUYẾN ĐI (CHUNG) */}
          {/* ============================================================== */}
          {view === 'activity' && (
            <>
              {/* Cảnh báo chuyến đi đang hoạt động của hành khách */}
              {roleMode === 'khach_hang' && activePassengerMatch && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-2 flex items-start gap-3 text-amber-900 text-sm shadow-sm">
                  <span className="text-2xl leading-none">⚠️</span>
                  <div className="flex-1">
                    <p className="font-bold text-amber-950">
                      Chuyến đi đang hoạt động: {activePassengerMatch.cx_diem_di} → {activePassengerMatch.cx_diem_den}
                    </p>
                    <p className="text-xs text-amber-800 mt-1">
                      Bạn đang có 1 chuyến đi đang thực hiện. Sau khi tới nơi, vui lòng bấm <b>"Xác nhận hoàn thành"</b> hoặc nếu không đi thì bấm <b>"✕ Hủy chuyến"</b> bên dưới để hoàn trả ghế và mở khóa đặt chuyến tiếp theo.
                    </p>
                  </div>
                </div>
              )}

              {/* Bảng chuyến đã đăng - CHỈ HIỂN THỊ KHI Ở VAI TRÒ TÀI XẾ (LỊCH SỬ KẾT THÚC) */}
              {roleMode === 'tai_xe' && trips.filter((t) => t.trang_thai === 'hoan_thanh' || t.trang_thai === 'da_huy').length > 0 && (
                <DanhSachBang
                  title="Lịch sử các chuyến xe đã kết thúc"
                  headers={['Mã', 'Tuyến', 'Thời gian', 'Trạng thái']}
                  rows={trips
                    .filter((t) => t.trang_thai === 'hoan_thanh' || t.trang_thai === 'da_huy')
                    .map((t) => [
                      `#${t.id}`,
                      `${t.diem_di} → ${t.diem_den}`,
                      formatTime(t.thoi_gian_chay),
                      <Badge key="b" map={TRANG_THAI_CHUYEN} value={t.trang_thai} />,
                    ])}
                  initialLimit={3}
                />
              )}

              {/* Bảng yêu cầu đã đăng - CHỈ HIỂN THỊ KHI Ở VAI TRÒ KHÁCH HÀNG */}
              {roleMode === 'khach_hang' && (
                <DanhSachBang
                  title="Yêu cầu tìm xe tôi đã gửi"
                  headers={['Mã', 'Tuyến', 'Thời gian', 'Trạng thái']}
                  rows={requests.map((r) => [
                    `#${r.id}`,
                    `${r.diem_di} → ${r.diem_den}`,
                    formatTime(r.thoi_gian_don),
                    <Badge key="b" map={TRANG_THAI_YEU_CAU} value={r.trang_thai} />,
                  ])}
                  initialLimit={3}
                />
              )}

              {/* Thông báo nếu tài xế chưa có lịch sử chuyến nào */}
              {roleMode === 'tai_xe' &&
                trips.filter((t) => t.trang_thai === 'hoan_thanh' || t.trang_thai === 'da_huy').length === 0 &&
                relevantMatches.length === 0 && (
                  <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                    <p className="text-base font-bold text-slate-700 mb-1">Chưa có lịch sử chuyến xe hoàn thành hoặc hủy</p>
                    <p className="text-xs text-slate-400 mb-4">
                      Các chuyến xe hoặc đơn khách bạn đang chạy được quản lý tại mục "Chuyến xe tôi chạy". Khi bạn hoàn thành hoặc hủy, chúng sẽ được lưu vào đây.
                    </p>
                    <button
                      onClick={() => setView('driver-trips')}
                      className="px-5 py-2.5 bg-[#0b2a4a] hover:bg-[#123a66] text-white text-xs font-bold rounded-xl transition shadow-sm cursor-pointer"
                    >
                      Đến Chuyến xe tôi chạy →
                    </button>
                  </div>
                )}

              {/* Danh sách các cặp ghép */}
              {relevantMatches.length > 0 && (
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-6 md:p-8">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <h3 className="font-black text-[#0b2a4a] text-lg">
                      🎉 {roleMode === 'tai_xe' ? 'Lịch sử các đơn nhận chở đã kết thúc' : 'Các lượt ghép chuyến & Quản lý chuyến đi'}
                    </h3>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-700">
                      {relevantMatches.length} lượt ghép
                    </span>
                  </div>
                  <div className="space-y-4">
                    {(expandedMatches ? relevantMatches : relevantMatches.slice(0, 3)).map((m) => {
                      const laTaiXe = Number(m.tai_xe_id) === myId;
                      const partnerZalo = laTaiXe
                        ? m.zalo_url_hanh_khach || (m.yc_sdt ? `https://zalo.me/${m.yc_sdt.replace(/\D/g, '')}` : '')
                        : m.zalo_url_tai_xe || (m.cx_sdt ? `https://zalo.me/${m.cx_sdt.replace(/\D/g, '')}` : '');
                      const isComplete = m.trang_thai === 'hoan_thanh';
                      const isCancelled = m.trang_thai === 'da_huy';
                      const isActive = !isComplete && !isCancelled;

                      return (
                        <div
                          key={m.id}
                          className={`p-5 border rounded-2xl transition ${
                            isComplete
                              ? 'border-slate-200 bg-slate-50/50'
                              : isCancelled
                              ? 'border-slate-200 bg-slate-50/60 opacity-80'
                              : 'border-teal-200 bg-teal-50/30 shadow-xs'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-teal-800 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 text-xs">{m.diem_phu_hop}% phù hợp</span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500 font-mono">
                                {formatTime(m.thoi_gian_chay || m.cx_thoi_gian)}
                              </span>
                              {isActive && !laTaiXe && (
                                <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                                  Chuyến đang đi
                                </span>
                              )}
                            </div>
                            <Badge map={TRANG_THAI_GHEP} value={m.trang_thai} />
                          </div>

                          <p className="text-sm text-slate-800 leading-relaxed mb-3">
                            {laTaiXe ? (
                              <>
                                Bạn là <b>tài xế</b> · Tuyến: <b>{m.cx_diem_di} → {m.cx_diem_den}</b>
                                <br />
                                Hành khách: <b>{m.hanh_khach_ten}</b> ({m.so_khach || 1} khách) · SĐT:{' '}
                                <span className="font-mono">{m.yc_sdt || 'Chưa cập nhật'}</span>
                              </>
                            ) : (
                              <>
                                Bạn là <b>hành khách</b> · Tuyến: <b>{m.cx_diem_di} → {m.cx_diem_den}</b>
                                <br />
                                Tài xế: <b>{m.tai_xe_ten}</b> · SĐT:{' '}
                                <span className="font-mono">{m.cx_sdt || 'Chưa cập nhật'}</span>
                              </>
                            )}
                          </p>

                          {/* Hành động: Nhắn Zalo, Xác nhận hoàn thành, Hủy chuyến */}
                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-200/70">
                            {partnerZalo && (
                              <a
                                href={partnerZalo}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0b2a4a] hover:bg-[#123a66] rounded-xl flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                              >
                                <span>💬 Nhắn Zalo</span>
                              </a>
                            )}

                            {isActive && (
                              <>
                                <button
                                  onClick={() => handleHoanThanhChuyen(m.id)}
                                  disabled={busy}
                                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0f766e] hover:bg-teal-700 rounded-xl flex items-center gap-1.5 transition disabled:opacity-60 shadow-xs cursor-pointer"
                                >
                                  <span>✓ Xác nhận hoàn thành</span>
                                </button>
                                <button
                                  onClick={() => handleHuyChuyen(m.id)}
                                  disabled={busy}
                                  className="px-3.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5 transition disabled:opacity-60 cursor-pointer"
                                >
                                  <span>✕ Hủy chuyến</span>
                                </button>
                              </>
                            )}

                            {isComplete && (
                              <span className="text-xs text-teal-800 font-bold bg-teal-50 border border-teal-200 px-3 py-1 rounded-xl">
                                ✓ Chuyến đi đã hoàn thành tốt đẹp
                              </span>
                            )}

                            {isCancelled && (
                              <span className="text-xs text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-xl">
                                Đã hủy chuyến · Ghế trống đã được hoàn lại
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {relevantMatches.length > 3 && (
                    <div className="pt-4 mt-4 border-t border-slate-100 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setExpandedMatches(!expandedMatches)}
                        className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1.5 py-2 px-4 rounded-xl hover:bg-teal-50 border border-teal-200 transition shadow-2xs"
                      >
                        {expandedMatches ? (
                          <>
                            <span>Thu gọn danh sách</span>
                            <span>▲</span>
                          </>
                        ) : (
                          <>
                            <span>Xem thêm ({relevantMatches.length - 3} lượt ghép nữa)</span>
                            <span>▼</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* ============================================================== */}
      {/* MODAL POPUP QUẢN LÝ TÀI KHOẢN & ĐỔI ẢNH ĐẠI DIỆN */}
      {/* ============================================================== */}
      {userProfileModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-100">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <h3 className="font-bold text-slate-900 text-base">Quản lý tài khoản cá nhân</h3>
              </div>
              <button
                onClick={() => setUserProfileModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Avatar Section */}
              <div className="text-center pb-4 border-b border-slate-100">
                <div className="relative inline-block">
                  {profileAvatar ? (
                    <img
                      src={profileAvatar}
                      alt={userName}
                      className="w-24 h-24 rounded-full object-cover ring-4 ring-teal-500 shadow-md mx-auto"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-teal-500 to-emerald-600 text-white flex items-center justify-center font-black text-4xl shadow-md ring-4 ring-slate-100 mx-auto">
                      {firstLetter}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-lg transition text-xs"
                    title="Đổi ảnh đại diện"
                  >
                    📷
                  </button>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    className="text-xs font-bold text-teal-600 hover:text-teal-700 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl border border-teal-200 transition"
                  >
                    📷 Thay đổi ảnh đại diện
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{userName}</span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                    #{session.id}
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${roleMode === 'tai_xe' ? 'bg-amber-100 text-amber-800' : 'bg-teal-100 text-teal-800'}`}>
                    {roleMode === 'tai_xe' ? 'Tài xế' : 'Khách hàng'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {profileEmail || profileData?.email || 'Tài khoản hệ thống'}
                </p>
              </div>

              {/* Form 1: Cập nhật thông tin cá nhân */}
              <form onSubmit={handleUpdateProfileInfo} className="space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>👤</span>
                  <span>Thông tin cá nhân</span>
                </h4>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Họ và tên <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder="VD: Nguyễn Văn A"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Số điện thoại liên hệ (10 số, bắt đầu bằng 0) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="0988776655"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800 font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Số này dùng để tự động liên kết Zalo và liên hệ nhận chở khách.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#0b2a4a] text-white hover:bg-[#123a66] cursor-pointer disabled:opacity-60 transition shadow-sm flex items-center justify-center gap-1.5"
                >
                  {savingProfile ? 'Đang lưu...' : '💾 Lưu thông tin cá nhân'}
                </button>
              </form>

              {/* Form 2: Bảo mật & Đổi mật khẩu */}
              <form onSubmit={handleChangePassword} className="space-y-4 pt-4 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Bảo mật & Đổi mật khẩu</span>
                </h4>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu hiện tại <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Nhập mật khẩu đang dùng"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mật khẩu mới (Tối thiểu 8 ký tự, có chữ hoa, số & ký tự đặc biệt) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="VD: Password@123"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Xác nhận mật khẩu mới <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full py-2.5 text-xs font-bold rounded-xl bg-[#0b2a4a] text-white hover:bg-[#123a66] cursor-pointer disabled:opacity-60 transition shadow-sm flex items-center justify-center gap-1.5"
                >
                  {savingPassword ? 'Đang cập nhật...' : '🔑 Cập nhật mật khẩu'}
                </button>
              </form>

              {/* Đăng xuất */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition"
                >
                  🚪 Đăng xuất tài khoản
                </button>
                <button
                  onClick={() => setUserProfileModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Đóng lại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL NHẬP ĐƠN KHÁCH HÀNG (DÀNH CHO TÀI XẾ) */}
      {/* ============================================================== */}
      {acceptingReq && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-100">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white/95 backdrop-blur px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤝</span>
                <h3 className="font-bold text-slate-900 text-base">
                  Nhập đơn khách #{acceptingReq.id}
                </h3>
              </div>
              <button
                onClick={() => setAcceptingReq(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmAcceptRequest} className="p-6 space-y-4">
              {/* Thông tin hành khách */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Thông tin cuốc xe</span>
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-teal-50 text-teal-700">
                    {acceptingReq.so_khach || 1} khách
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {acceptingReq.diem_di} → {acceptingReq.diem_den}
                </p>
                <p className="text-xs text-slate-600">
                  🕒 Giờ đón: <b>{formatTime(acceptingReq.thoi_gian_don)}</b>
                </p>
                <p className="text-xs text-slate-600">
                  👤 Hành khách: <b>{acceptingReq.hanh_khach_ten || 'Khách vãng lai'}</b> · SĐT:{' '}
                  <span className="font-mono font-semibold text-slate-800">{acceptingReq.sdt || 'Chưa cập nhật'}</span>
                </p>
              </div>

              {/* Lựa chọn chuyến xe ghép */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Chuyến xe nhận chở
                </label>
                {trips.filter((t) => t.trang_thai === 'con_ghe' && (t.so_ghe_trong === undefined || t.so_ghe_trong > 0)).length > 0 ? (
                  <select
                    value={selectedTripIdForAccept}
                    onChange={(e) => setSelectedTripIdForAccept(e.target.value)}
                    className="w-full p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
                  >
                    <option value="">➕ Tạo chuyến xe mới riêng cho khách này</option>
                    {trips
                      .filter((t) => t.trang_thai === 'con_ghe' && (t.so_ghe_trong === undefined || t.so_ghe_trong > 0))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          Chuyến #{t.id}: {t.diem_di} → {t.diem_den} (Còn {t.so_ghe_trong} chỗ · {formatTime(t.thoi_gian_chay)})
                        </option>
                      ))}
                  </select>
                ) : (
                  <div className="p-3 text-xs bg-amber-50 text-amber-900 border border-amber-200 rounded-xl">
                    💡 Bạn hiện chưa có chuyến xe mở sẵn. Hệ thống sẽ <b>tự động tạo một chuyến xe mới</b> cho bạn tương ứng với tuyến đường và giờ đón của khách!
                  </div>
                )}
              </div>

              {/* SĐT Tài xế */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Số điện thoại tài xế (để khách liên hệ đón)
                </label>
                <input
                  type="tel"
                  value={acceptPhone}
                  onChange={(e) => setAcceptPhone(e.target.value)}
                  placeholder="VD: 0912345678 (10 số)"
                  required
                  className="w-full p-3 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                />
              </div>

              {/* Nút bấm */}
              <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAcceptingReq(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Đóng lại
                </button>
                <button
                  type="submit"
                  disabled={acceptBusy}
                  className="flex-1 py-2.5 bg-[#0b2a4a] hover:bg-[#123a66] cursor-pointer text-white text-xs font-bold rounded-xl transition shadow-sm disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  {acceptBusy ? 'Đang xử lý...' : '✓ Xác nhận nhập đơn'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-900 text-white text-xs md:text-sm px-4 py-3 rounded-2xl shadow-2xl z-50 flex items-center gap-2 max-w-md animate-fade-in border border-white/10">
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">{label}</label>
      {children}
    </div>
  );
}

function DanhSachBang({ title, headers, rows, initialLimit = null }) {
  const [expanded, setExpanded] = useState(false);
  const shouldLimit = Boolean(initialLimit && rows.length > initialLimit);
  const visibleRows = shouldLimit && !expanded ? rows.slice(0, initialLimit) : rows;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{title}</h3>
        {rows.length > 0 && (
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {rows.length} {title.toLowerCase().includes('yêu cầu') ? 'yêu cầu' : 'chuyến'}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs uppercase">
              {headers.map((h) => (
                <th key={h} className="text-left px-6 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="text-center text-slate-400 italic py-8">
                  Chưa có dữ liệu
                </td>
              </tr>
            )}
            {visibleRows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50 transition">
                {row.map((cell, j) => (
                  <td key={j} className="px-6 py-3 text-slate-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shouldLimit && (
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/70 flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1.5 py-1.5 px-4 rounded-xl hover:bg-teal-50 border border-teal-200 transition shadow-2xs"
          >
            {expanded ? (
              <>
                <span>Thu gọn danh sách</span>
                <span>▲</span>
              </>
            ) : (
              <>
                <span>Xem thêm ({rows.length - initialLimit} {title.toLowerCase().includes('yêu cầu') ? 'yêu cầu' : 'chuyến'} nữa)</span>
                <span>▼</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
