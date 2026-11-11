import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSession, clearSession } from './api';
import PolicyModal from './PolicyModal';

const TRANG_THAI_CHUYEN = {
  con_ghe: ['Còn ghế trống', 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'],
  da_day: ['Đã đầy', 'bg-amber-50 text-amber-700 border border-amber-200/60'],
  da_khoi_hanh: ['Đã khởi hành', 'bg-gray-100 text-gray-600'],
  da_ghep: ['Đang chạy (Đã ghép)', 'bg-teal-50 text-teal-800 border border-teal-200/60'],
  hoan_thanh: ['Hoàn thành', 'bg-blue-50 text-blue-700'],
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

function formatTime(timeStr) {
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
}

export default function DriverDashboard() {
  const navigate = useNavigate();
  const session = getSession();

  const [showNotifModal, setShowNotifModal] = useState(false);
  const notifStorageKey = `read_notifs_driver_${session?.id || 'guest'}`;
  const [readNotifIds, setReadNotifIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(`read_notifs_driver_${session?.id || 'guest'}`) || '[]');
    } catch {
      return [];
    }
  });
  const [showPolicyModal, setShowPolicyModal] = useState(false);

  const [view, setView] = useState('overview'); // overview, driver-trips, post-trip, passenger-requests, activity
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [trips, setTrips] = useState([]);
  const [matches, setMatches] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [reqFilterText, setReqFilterText] = useState('');
  const [driverRating, setDriverRating] = useState({ diem_trung_binh: 0, tong_danh_gia: 0, danh_sach: [] });

  // Form đăng chuyến mới
  const [tDiemDi, setTDiemDi] = useState('');
  const [tDiemDen, setTDiemDen] = useState('');
  const [tThoiGian, setTThoiGian] = useState('');
  const [tGhe, setTGhe] = useState(4);
  const [tSdt, setTSdt] = useState(session.sdt || '');
  const isLoadingRef = useRef(false);

  // Modal nhận đơn khách
  const [acceptingReq, setAcceptingReq] = useState(null);
  const [selectedTripIdForAccept, setSelectedTripIdForAccept] = useState('');
  const [acceptPhone, setAcceptPhone] = useState('');
  const [acceptBusy, setAcceptBusy] = useState(false);

  // Modal tài khoản
  const [userProfileModalOpen, setUserProfileModalOpen] = useState(false);
  const avatarInputRef = useRef(null);
  const [profileAvatar, setProfileAvatar] = useState(session.avatarUrl || localStorage.getItem('userAvatar') || '');
  const [currentName, setCurrentName] = useState(session.hoTen || 'Bác tài');
  const [profileName, setProfileName] = useState(session.hoTen || 'Bác tài');
  const [profilePhone, setProfilePhone] = useState(session.sdt || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const driverName = currentName || session.hoTen || 'Bác tài';
  const driverPhone = profilePhone || session.sdt || 'Chưa cập nhật';
  const driverShortName = driverName.split(' ').slice(-1)[0] || 'bác tài';
  const myId = Number(session.id);

  const driverMatches = useMemo(() => {
    return matches.filter((m) => {
      const laTaiXe = Number(m.tai_xe_id) === myId;
      return laTaiXe && (m.trang_thai === 'hoan_thanh' || m.trang_thai === 'da_huy');
    });
  }, [matches, myId]);

  // Thông báo thực tế 100% của bác tài dựa trên các chuyến xe và khách đặt (Không dùng mock)
  const driverNotifications = useMemo(() => {
    const list = [];

    // 1. Matches: Khách đã được ghép vào chuyến của tài xế
    (matches || []).forEach((m) => {
      if (myId && Number(m.tai_xe_id) !== myId) return;

      const customerName = m.hanh_khach_ten || 'Hành khách';
      const customerPhone = m.kh_sdt ? ` (${m.kh_sdt})` : '';
      const routeText = `${m.kh_diem_don || m.cx_diem_di || 'Điểm đón'} ➔ ${m.kh_diem_tra || m.cx_diem_den || 'Điểm trả'}`;
      const timeStr = m.thoi_gian_ghep || m.cx_thoi_gian ? formatTime(m.thoi_gian_ghep || m.cx_thoi_gian) : 'Gần đây';

      if (m.trang_thai === 'hoan_thanh') {
        list.push({
          id: `driver_match_${m.id}_done`,
          title: 'Chuyến xe đã hoàn thành',
          desc: `Đã hoàn tất chuyến xe với khách ${customerName}${customerPhone} (${routeText}).${m.danh_gia_sao ? ` Khách đã đánh giá ${m.danh_gia_sao}⭐.` : ''}`,
          time: timeStr,
          icon: '✅',
          badge: 'Hoàn tất',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          view: 'history',
        });
      } else if (m.trang_thai === 'da_huy') {
        list.push({
          id: `driver_match_${m.id}_cancel`,
          title: 'Khách đã hủy ghép chuyến',
          desc: `Chuyến ghép với khách ${customerName}${customerPhone} (${routeText}) đã bị hủy.`,
          time: timeStr,
          icon: '❌',
          badge: 'Đã hủy',
          badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
          view: 'history',
        });
      } else {
        list.push({
          id: `driver_match_${m.id}_new`,
          title: 'Hành khách mới đặt ghế',
          desc: `Khách ${customerName}${customerPhone} đã đặt ${m.so_khach || 1} ghế tuyến ${routeText}. Giá: ${(m.gia_tien || 0).toLocaleString('vi-VN')}đ.`,
          time: timeStr,
          icon: '🙋',
          badge: 'Khách mới',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
          view: 'driver-trips',
        });
      }
    });

    // 2. Trips: Các chuyến xe tài xế đã đăng
    (trips || []).forEach((t) => {
      const routeText = `${t.diem_di || 'Điểm đi'} ➔ ${t.diem_den || 'Điểm đến'}`;
      const timeStr = t.thoi_gian_chay ? formatTime(t.thoi_gian_chay) : (t.gio_di || 'Hôm nay');

      if (t.trang_thai === 'con_cho' || t.trang_thai === 'con_ghe' || !t.trang_thai) {
        list.push({
          id: `driver_trip_${t.id}_open`,
          title: 'Chuyến xe đang mở nhận khách',
          desc: `Tuyến ${routeText} (${timeStr}) còn trống ${t.so_ghe_trong || 0} ghế. Hệ thống đang tìm khách ghép.`,
          time: timeStr,
          icon: '🚗',
          badge: 'Còn chỗ',
          badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          view: 'driver-trips',
        });
      } else if (t.trang_thai === 'hoan_thanh') {
        list.push({
          id: `driver_trip_${t.id}_done`,
          title: 'Chuyến xe đã kết thúc',
          desc: `Tuyến ${routeText} (${timeStr}) đã hoàn tất. Bạn có thể bấm đăng lại chuyến bất kỳ lúc nào.`,
          time: timeStr,
          icon: '🎉',
          badge: 'Hoàn thành',
          badgeClass: 'bg-teal-50 text-teal-700 border-teal-200',
          view: 'driver-trips',
        });
      } else if (t.trang_thai === 'da_huy') {
        list.push({
          id: `driver_trip_${t.id}_cancel`,
          title: 'Chuyến xe đã hủy',
          desc: `Chuyến xe tuyến ${routeText} đã hủy.`,
          time: timeStr,
          icon: '⚪',
          badge: 'Đã hủy',
          badgeClass: 'bg-slate-50 text-slate-600 border-slate-200',
          view: 'driver-trips',
        });
      }
    });

    return list;
  }, [matches, trips, myId]);

  const unreadNotifs = useMemo(() => {
    return driverNotifications.filter(n => !readNotifIds.includes(n.id)).length;
  }, [driverNotifications, readNotifIds]);

  const handleMarkAllNotifsRead = () => {
    const allIds = driverNotifications.map(n => n.id);
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const syncPhone = (val) => {
    if (!val) return;
    setTSdt(val);
    setProfilePhone(val);
    localStorage.setItem('userSdt', val);
  };

  const loadData = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    try {
      const myId = session.id || localStorage.getItem('userId');
      const [tRes, mRes, pRes, allReqRes, rRes] = await Promise.allSettled([
        api.listTrips(true),
        api.listMatches(true),
        api.getProfile(),
        api.listRequests(false),
        myId ? api.getDriverRating(myId) : Promise.resolve(null),
      ]);
      if (tRes.status === 'fulfilled') setTrips(tRes.value || []);
      if (mRes.status === 'fulfilled') setMatches(mRes.value || []);
      if (allReqRes.status === 'fulfilled') setAllRequests(allReqRes.value || []);
      if (rRes.status === 'fulfilled' && rRes.value) {
        setDriverRating({
          diem_trung_binh: rRes.value.diem_trung_binh || 0,
          tong_danh_gia: rRes.value.tong_danh_gia || 0,
          danh_sach: rRes.value.danh_sach || [],
        });
      }
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

  // Đăng chuyến mới
  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (tSdt && !/^0\d{9}$/.test(tSdt.trim())) {
      showToast('⚠️ Vui lòng nhập số điện thoại hợp lệ (10 số, bắt đầu bằng 0).');
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
      setTGhe(4);
      showToast(res?.so_cap_ghep_moi > 0 ? `Đã mở chuyến và tìm thấy ngay ${res.so_cap_ghep_moi} khách phù hợp!` : 'Đã mở chuyến thành công — AI đang tìm khách phù hợp');
      setView('driver-trips');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi mở chuyến');
    } finally {
      setBusy(false);
    }
  };

  // Cập nhật trạng thái chuyến xe
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

  // Hoàn thành lượt đi cho một hành khách cụ thể
  const handleCompletePassengerMatch = async (matchId, passengerName) => {
    if (!window.confirm(`Xác nhận đã trả khách ${passengerName || ''} an toàn & hoàn tất lượt chở này?`)) return;
    setBusy(true);
    try {
      await api.completeMatch(matchId);
      showToast(`✅ Đã hoàn thành lượt đi của khách ${passengerName || ''}!`);
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi hoàn thành lượt chở');
    } finally {
      setBusy(false);
    }
  };

  // Đăng lại chuyến xe tương tự từ chuyến đã hoàn thành
  const handleReuseTrip = (trip) => {
    setTDiemDi(trip.diem_di || '');
    setTDiemDen(trip.diem_den || '');
    setTGhe(trip.loai_xe?.includes('7') ? 7 : 4);
    setTThoiGian('');
    setView('post-trip');
    showToast(`Đã nạp tuyến ${trip.diem_di} ➔ ${trip.diem_den}. Mời bác tài chọn giờ xuất phát mới!`);
  };

  // Mở modal chốt nhận khách
  const handleOpenAcceptModal = (reqItem) => {
    setAcceptingReq(reqItem);
    setAcceptPhone((session.sdt || tSdt || profilePhone || '').trim());
    const validTrips = trips.filter(t => t.trang_thai === 'con_ghe' && t.so_ghe_trong > 0);
    setSelectedTripIdForAccept(validTrips.length > 0 ? String(validTrips[0].id) : '');
  };

  // Chốt nhận khách vào chuyến xe (đồng bộ chính xác yêu cầu của hành khách)
  const handleConfirmAcceptRequest = async (e) => {
    e.preventDefault();
    if (!acceptingReq) return;
    let sdtToUse = acceptPhone.trim();
    if (!sdtToUse || !/^0\d{9}$/.test(sdtToUse)) {
      showToast('⚠️ Vui lòng nhập số điện thoại tài xế hợp lệ (10 số, bắt đầu bằng 0)');
      return;
    }
    syncPhone(sdtToUse);
    setAcceptBusy(true);
    try {
      let tripId = selectedTripIdForAccept ? Number(selectedTripIdForAccept) : null;
      if (!tripId) {
        const newTripRes = await api.createTrip({
          diem_di: acceptingReq.diem_di,
          diem_den: acceptingReq.diem_den,
          thoi_gian_chay: acceptingReq.thoi_gian_don || 'Linh hoạt',
          so_ghe_trong: 4,
          sdt: sdtToUse,
        });
        tripId = newTripRes?.chuyen_xe_id || newTripRes?.id;
      }

      if (!tripId) throw new Error('Không thể tạo hoặc chọn chuyến xe hợp lệ');

      // GỌI ĐÚNG API CHỐT NHẬN YÊU CẦU CỦA HÀNH KHÁCH
      const matchRes = await api.acceptRequest(acceptingReq.id, {
        chuyen_xe_id: tripId,
        sdt: sdtToUse,
      });

      const zaloUrl = matchRes?.zalo_url || (acceptingReq.sdt ? `https://zalo.me/${acceptingReq.sdt.replace(/\D/g, '')}` : '');
      setAcceptingReq(null);
      showToast('🎉 Đã nhận đón khách thành công! Đang chuyển sang Zalo...');
      if (zaloUrl) {
        window.open(zaloUrl, '_blank', 'noopener,noreferrer');
      }
      setView('driver-trips');
      await loadData();
    } catch (err) {
      showToast(err.message || 'Lỗi khi nhận đón khách');
    } finally {
      setAcceptBusy(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  // Cập nhật thông tin tài xế
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
      showToast('✅ Đã lưu thông tin tài xế thành công!');
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
        showToast('✅ Đã cập nhật ảnh đại diện bác tài!');
      } catch (err) {
        showToast(err.message || 'Lỗi khi lưu ảnh');
      }
    };
    reader.readAsDataURL(file);
  };

  // Chuyến xe đang hoạt động thực tế của bác tài (Không dùng mock)
  const activeTrip = useMemo(() => {
    const found = trips.find(t => t.trang_thai === 'con_ghe' || t.trang_thai === 'da_ghep' || t.trang_thai === 'da_day');
    return found || null;
  }, [trips]);

  // Hành khách thực tế đã ghép vào activeTrip này
  const activeTripPassengers = useMemo(() => {
    if (!activeTrip) return [];
    return matches.filter(m => Number(m.chuyen_xe_id) === Number(activeTrip.id) && m.trang_thai !== 'da_huy');
  }, [activeTrip, matches]);

  // Danh sách yêu cầu hành khách thực tế (100% dữ liệu thật, không mock)
  const displayRequests = useMemo(() => {
    return allRequests.slice(0, 5).map((r, i) => ({
      id: r.id || i,
      ho_ten: r.hanh_khach_ten || r.ho_ten || `Hành khách #${r.id}`,
      initials: (r.hanh_khach_ten || r.ho_ten || 'KH').slice(0, 2).toUpperCase(),
      sdt: r.sdt || '',
      ghe: `${r.so_khach || 1} ghế`,
      tuyen: `${r.diem_di || 'Chưa rõ'} ➔ ${r.diem_den || 'Chưa rõ'}`,
      thoi_gian: formatTime(r.thoi_gian_don),
      cung_tuyen: true,
      rawReq: r
    }));
  }, [allRequests]);

  // Lịch sử chuyến xe đã hoàn thành thực tế của bác tài
  const recentCompletedTrips = useMemo(() => {
    return trips.filter(t => t.trang_thai === 'hoan_thanh' || t.trang_thai === 'da_huy').slice(0, 5);
  }, [trips]);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col md:flex-row antialiased font-sans">
      {/* SIDEBAR BÁC TÀI CHUẨN FIGMA */}
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

          {/* Profile Card Center (MH - Bác tài) */}
          <div className="text-center py-4 px-2 border-b border-slate-100 mb-5">
            <div className="relative inline-block mx-auto mb-2 group">
              <button
                type="button"
                onClick={() => setUserProfileModalOpen(true)}
                title="Nhấn vào để thay đổi thông tin hoặc đổi ảnh đại diện"
                className="w-16 h-16 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-2xl flex items-center justify-center overflow-hidden shadow-xs cursor-pointer ring-2 ring-transparent hover:ring-[#0f766e] transition-all duration-200 relative group"
              >
                {profileAvatar ? (
                  <img src={profileAvatar} alt={driverName} className="w-full h-full object-cover" />
                ) : (
                  driverName.split(' ').map(w => w[0]).join('').slice(-2).toUpperCase() || 'TX'
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-medium transition-opacity">
                  📷 Đổi
                </div>
              </button>
            </div>
            <div className="text-[11px] font-bold text-[#0f766e] uppercase tracking-wider mb-0.5">
              BÁC TÀI
            </div>
            <h3
              onClick={() => setUserProfileModalOpen(true)}
              className="text-base font-bold text-[#0b2a4a] leading-tight cursor-pointer hover:text-[#0f766e] transition"
            >
              {driverName}
            </h3>
          </div>

          {/* Navigation Section */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              KHÔNG GIAN CỦA BẠN
            </p>
            <button
              onClick={() => setView('overview')}
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
              onClick={() => setView('driver-trips')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                view === 'driver-trips'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">🚗</span>
                <span>Chuyến của tôi</span>
              </div>
              {trips.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-bold">
                  {trips.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setView('post-trip')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${
                view === 'post-trip'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl">➕</span>
              <span>Đăng chuyến xe mới</span>
            </button>

            <button
              onClick={() => setView('passenger-requests')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-between transition cursor-pointer ${
                view === 'passenger-requests'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">👥</span>
                <span>Yêu cầu hành khách</span>
              </div>
              {allRequests.length > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold">
                  {allRequests.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setView('activity')}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition cursor-pointer ${
                view === 'activity'
                  ? 'bg-[#dcfce7] text-[#065f46] font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <span className="text-xl">🕒</span>
              <span>Lịch sử nhận chở</span>
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

      {/* NỘI DUNG CHÍNH (Right Canvas - Bác Tài) */}
      <main className="flex-1 min-w-0 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto space-y-8">
        {/* Top Breadcrumb & Status Bar */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-slate-400 font-medium">
            Không gian làm việc / <span className="text-slate-600">
              {view === 'overview' ? 'Tổng quan' : view === 'driver-trips' ? 'Chuyến của tôi' : view === 'post-trip' ? 'Đăng chuyến mới' : view === 'passenger-requests' ? 'Yêu cầu hành khách' : 'Lịch sử nhận chở'}
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
                      {driverNotifications.length === 0 ? (
                        <div className="py-8 px-4 text-center">
                          <div className="w-10 h-10 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-2 text-lg">
                            🔔
                          </div>
                          <p className="text-xs font-bold text-slate-700">Chưa có thông báo nào</p>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            Khi có hành khách đặt chỗ hoặc chuyến đi của bạn cập nhật trạng thái, thông báo thực tế sẽ hiển thị tại đây.
                          </p>
                        </div>
                      ) : (
                        driverNotifications.map((n) => {
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
            {/* Greeting Heading & CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-[#0b2a4a] tracking-tight">
                  Chào bác tài {driverShortName}, chúc một ngày tốt lành!
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1 capitalize">
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} • Sẵn sàng cho hành trình tiếp theo.
                </p>
              </div>
              <button
                onClick={() => setView('post-trip')}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white text-sm font-semibold shadow-sm transition flex items-center gap-2 cursor-pointer"
              >
                <span className="text-lg leading-none">+</span>
                <span>Đăng chuyến mới</span>
              </button>
            </div>

            {/* 3 TOP KPI METRIC CARDS THẬT */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Chuyến đi của bạn</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-sm">⇆</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {trips.length}
                </div>
                <p className="text-xs text-emerald-600 font-medium">Chuyến xe bạn đã mở</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Khách đang tìm xe</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-[#0f766e] flex items-center justify-center text-sm">📥</span>
                </div>
                <div className="text-3xl font-bold text-[#0b2a4a] mb-1">
                  {allRequests.length}
                </div>
                <p className="text-xs text-slate-400 font-medium">Yêu cầu tìm xe từ hành khách</p>
              </div>

              <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-5 glass-card glass-hover">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-slate-500">Đánh giá dịch vụ</span>
                  <span className="w-8 h-8 rounded-full bg-slate-50 text-amber-500 flex items-center justify-center text-sm">★</span>
                </div>
                <div className="text-2xl font-bold text-[#0b2a4a] mb-1">
                  {driverRating.tong_danh_gia > 0 ? `${driverRating.diem_trung_binh.toFixed(1).replace('.', ',')}/5★` : 'Chưa có'}
                </div>
                <p className="text-xs text-slate-400 font-medium">
                  {driverRating.tong_danh_gia > 0 ? `${driverRating.tong_danh_gia} đánh giá từ khách` : 'Chưa có đánh giá nào'}
                </p>
              </div>
            </div>

            {/* 2-COLUMN SECTION: CHUYẾN ĐANG HOẠT ĐỘNG & YÊU CẦU HÀNH KHÁCH */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* CỘT TRÁI (8 cols) */}
              <div className="lg:col-span-8 space-y-6">
                {activeTrip ? (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-5">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base font-bold text-[#0b2a4a]">Chuyến đang hoạt động</h2>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#047857] border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Đang nhận khách
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-bold text-[#0b2a4a]">
                          {activeTrip.diem_di} ➔ {activeTrip.diem_den}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          🕒 Khởi hành: <b>{formatTime(activeTrip.thoi_gian_chay)}</b>
                        </p>
                        <p className="text-xs font-medium text-slate-400 mt-0.5">
                          {activeTrip.loai_xe || 'Xe tiện chuyến'} {activeTrip.bien_so ? `• ${activeTrip.bien_so}` : ''}
                        </p>
                      </div>

                      <div className="bg-[#dcfce7] rounded-2xl px-6 py-3 text-center min-w-[130px] border border-emerald-100">
                        <div className="text-3xl font-bold text-[#065f46] leading-none">
                          {activeTrip.so_ghe_trong || 0}
                        </div>
                        <div className="text-xs font-semibold text-[#065f46] mt-1">chỗ còn trống</div>
                      </div>
                    </div>

                    {/* Pickup / Drop-off details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">
                          ĐIỂM ĐÓN
                        </span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {activeTrip.diem_don || activeTrip.diem_di}
                        </p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">
                          ĐIỂM TRẢ
                        </span>
                        <p className="font-bold text-slate-800 mt-0.5">
                          {activeTrip.diem_tra || activeTrip.diem_den}
                        </p>
                      </div>
                    </div>

                    {/* Hành khách thực tế đã ghép vào chuyến này */}
                    <div className="border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-slate-800">
                          Hành khách đã đặt chuyến ({activeTripPassengers.length} hành khách)
                        </h4>
                        <span className="text-xs text-slate-400">{activeTripPassengers.length} người</span>
                      </div>

                      {activeTripPassengers.length === 0 ? (
                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400">
                          Chưa có hành khách nào đặt chuyến này. Các yêu cầu mới sẽ được thông báo ngay khi có khách cùng tuyến.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {activeTripPassengers.map((m) => {
                            const rawPhone = (m.kh_sdt || '').replace(/\D/g, '');
                            return (
                              <div key={m.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 border border-slate-100">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-xs flex items-center justify-center">
                                    {(m.hanh_khach_ten || 'KH').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className="text-xs font-bold text-slate-900">
                                      {m.hanh_khach_ten || 'Hành khách'} <span className="font-normal text-slate-400">• {m.so_khach || 1} ghế</span>
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono">
                                      {m.kh_sdt} {m.kh_diem_don ? `• ${m.kh_diem_don}` : ''}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {m.kh_sdt && (
                                    <a href={`tel:${m.kh_sdt}`} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-white transition flex items-center gap-1">
                                      <span>📞 Gọi</span>
                                    </a>
                                  )}
                                  {rawPhone && (
                                    <a href={`https://zalo.me/${rawPhone}`} target="_blank" rel="noreferrer" className="px-3.5 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-xs font-semibold text-white transition shadow-2xs">
                                      Zalo
                                    </a>
                                  )}
                                  <button
                                    onClick={() => handleCompletePassengerMatch(m.id, m.hanh_khach_ten)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                                    title="Xác nhận đã trả khách này an toàn"
                                  >
                                    <span>✓ Trả khách</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Action Bar Footer */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400">
                        Cập nhật trạng thái khi đủ khách hoặc kết thúc chuyến.
                      </span>
                      <div className="flex items-center gap-2">
                        {activeTrip?.trang_thai === 'da_day' ? (
                          <button
                            onClick={() => handleUpdateDriverTrip(activeTrip?.id, 'con_ghe')}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <span>🔓</span>
                            <span>Mở lại Còn ghế</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUpdateDriverTrip(activeTrip?.id, 'da_day')}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 transition cursor-pointer flex items-center gap-1.5"
                          >
                            <span>👥</span>
                            <span>Đã đầy</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleUpdateDriverTrip(activeTrip?.id, 'hoan_thanh')}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#0f766e] hover:bg-[#115e59] transition shadow-2xs cursor-pointer flex items-center gap-1.5"
                        >
                          <span>✓</span>
                          <span>Hoàn thành chuyến</span>
                        </button>
                        <button
                          onClick={() => handleUpdateDriverTrip(activeTrip?.id, 'da_huy')}
                          className="px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                        >
                          Hủy chuyến
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center space-y-3">
                    <div className="text-3xl">🚗</div>
                    <h3 className="text-base font-bold text-[#0b2a4a]">Bác tài chưa có chuyến xe nào đang hoạt động</h3>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Hãy đăng chuyến mới để hệ thống gợi ý và ghép nối hành khách có cùng tuyến đường với bạn.
                    </p>
                    <button
                      onClick={() => setView('post-trip')}
                      className="px-5 py-2.5 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>➕</span>
                      <span>Đăng chuyến xe mới ngay</span>
                    </button>
                  </div>
                )}
              </div>

              {/* CỘT PHẢI (4 cols): YÊU CẦU HÀNH KHÁCH & MẸO */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#0b2a4a]">Yêu cầu hành khách</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#ecfdf5] text-[#047857] border border-emerald-100">
                      • {allRequests.length}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ưu tiên hành khách cùng tuyến và gần giờ khởi hành của bạn. Liên hệ trực tiếp qua Zalo.
                  </p>

                  {displayRequests.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-400">
                      Hiện chưa có yêu cầu tìm xe nào mới từ hành khách.
                    </div>
                  ) : (
                    <div className="space-y-3 pt-1">
                      {displayRequests.map((req) => (
                        <div key={req.id} className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-100 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-[11px] flex items-center justify-center">
                                {req.initials}
                              </div>
                              <div>
                                <span className="text-xs font-bold text-slate-900 block leading-tight">{req.ho_ten}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{req.sdt}</span>
                              </div>
                            </div>
                            <span className="text-[11px] text-slate-500 font-medium px-2 py-0.5 rounded bg-white border border-slate-200">
                              {req.ghe}
                            </span>
                          </div>

                          <div className="text-xs">
                            <span className="font-bold text-slate-800">{req.tuyen}</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">{req.thoi_gian}</p>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[10px] font-semibold text-[#047857] bg-[#ecfdf5] px-2 py-0.5 rounded-full border border-emerald-100">
                              Khách chờ đón
                            </span>
                            <button
                              onClick={() => handleOpenAcceptModal(req.rawReq || req)}
                              className="px-3 py-1 rounded-lg bg-[#0f766e] hover:bg-[#115e59] text-white text-[11px] font-semibold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <span>Nhận đón ↗</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 text-center border-t border-slate-100">
                    <button
                      onClick={() => setView('passenger-requests')}
                      className="text-xs font-semibold text-slate-700 hover:text-[#0f766e] transition flex items-center justify-center gap-1 mx-auto cursor-pointer"
                    >
                      <span>Xem tất cả yêu cầu ({allRequests.length})</span>
                      <span>➔</span>
                    </button>
                  </div>
                </div>

                <div className="bg-[#ecfdf5]/80 border border-[#a7f3d0] rounded-2xl p-5 glass-card glass-hover space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-[#065f46] flex items-center justify-center text-sm font-bold">
                    💡
                  </div>
                  <h4 className="text-xs font-bold text-[#065f46]">Một cuộc gọi, thêm an tâm</h4>
                  <p className="text-[11px] text-emerald-800/80 leading-relaxed">
                    Gọi xác nhận với hành khách trước giờ đi 30 phút. Nhớ thống nhất điểm đón và hành lý nhé!
                  </p>
                </div>
              </div>
            </div>

            {/* BOTTOM FULL-WIDTH CARD: HÀNH TRÌNH ĐÃ THỰC HIỆN */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-6 glass-card glass-hover space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-[#0b2a4a]">Hành trình đã thực hiện</h3>
                <button onClick={() => setView('activity')} className="text-xs font-semibold text-slate-500 hover:text-[#0f766e] transition flex items-center gap-1 cursor-pointer">
                  <span>Xem lịch sử chi tiết</span>
                  <span>↗</span>
                </button>
              </div>

              {recentCompletedTrips.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  Chưa có lịch sử chuyến xe hoàn thành nào.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-semibold">
                        <th className="py-2.5 px-3">Tuyến đường</th>
                        <th className="py-2.5 px-3">Khởi hành</th>
                        <th className="py-2.5 px-3">Ghế đã đặt</th>
                        <th className="py-2.5 px-3 text-right">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {recentCompletedTrips.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50/50 transition">
                          <td className="py-3 px-3 font-bold text-slate-900">{t.diem_di} ➔ {t.diem_den}</td>
                          <td className="py-3 px-3 text-slate-500">{formatTime(t.thoi_gian_chay)}</td>
                          <td className="py-3 px-3 text-slate-700">{t.so_ghe_trong || 0} ghế</td>
                          <td className="py-3 px-3 text-right">
                            <Badge map={TRANG_THAI_CHUYEN} value={t.trang_thai} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: QUẢN LÝ CHUYẾN CỦA TÔI (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'driver-trips' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div>
                <h2 className="text-xl font-bold text-[#0b2a4a]">Chuyến xe của tôi ({trips.length})</h2>
                <p className="text-xs text-slate-500 mt-1">Quản lý số ghế trống, cập nhật trạng thái hoặc hủy chuyến xe.</p>
              </div>
              <button
                onClick={() => setView('post-trip')}
                className="px-4 py-2 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-semibold rounded-xl transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>➕</span>
                <span>Mở chuyến mới</span>
              </button>
            </div>

            {trips.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                Bạn chưa mở chuyến xe nào. Hãy bấm "+ Mở chuyến mới" để bắt đầu nhận khách.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {trips.map((t) => (
                  <div key={t.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{t.id}</span>
                      <Badge map={TRANG_THAI_CHUYEN} value={t.trang_thai} />
                    </div>

                    <h4 className="text-base font-bold text-[#0b2a4a]">
                      {t.diem_di} ➔ {t.diem_den}
                    </h4>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>🕒 Giờ chạy: <b>{formatTime(t.thoi_gian_chay)}</b></p>
                      <p>💺 Số ghế trống: <b className="text-emerald-700">{t.so_ghe_trong} chỗ</b></p>
                      <p>📞 SĐT: <span className="font-mono">{t.sdt || 'Chưa có'}</span></p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
                      {t.trang_thai === 'hoan_thanh' ? (
                        <button
                          onClick={() => handleReuseTrip(t)}
                          className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-[#0f766e] border border-teal-200 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition shadow-2xs"
                        >
                          <span>🔁</span>
                          <span>Đăng lại chuyến này</span>
                        </button>
                      ) : t.trang_thai === 'da_huy' ? (
                        <>
                          <button
                            onClick={() => handleReuseTrip(t)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition"
                          >
                            <span>🔁</span>
                            <span>Đăng lại chuyến này</span>
                          </button>
                          <button
                            onClick={() => handleUpdateDriverTrip(t.id, 'con_ghe')}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold cursor-pointer"
                          >
                            Mở lại Còn ghế
                          </button>
                        </>
                      ) : (
                        <>
                          {t.trang_thai === 'con_ghe' ? (
                            <button
                              onClick={() => handleUpdateDriverTrip(t.id, 'da_day')}
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-semibold cursor-pointer"
                            >
                              Đánh dấu Đã đầy
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateDriverTrip(t.id, 'con_ghe')}
                              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg font-semibold cursor-pointer"
                            >
                              Mở lại Còn ghế
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateDriverTrip(t.id, 'hoan_thanh')}
                            className="px-3 py-1.5 bg-[#0f766e] text-white hover:bg-[#115e59] rounded-lg font-semibold cursor-pointer"
                          >
                            ✓ Hoàn thành
                          </button>
                          <button
                            onClick={() => handleUpdateDriverTrip(t.id, 'da_huy')}
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg font-semibold cursor-pointer"
                          >
                            Hủy
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ĐĂNG CHUYẾN XE MỚI (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'post-trip' && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-[#ecfdf5] text-[#047857] border border-emerald-100 mb-2">
                Dành cho Bác tài
              </span>
              <h2 className="text-2xl font-bold text-[#0b2a4a]">Đăng chuyến xe tiện chuyến</h2>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Đăng thông tin lộ trình, giờ chạy và số ghế trống. AI sẽ tự động ghép với các hành khách đang cần đi cùng tuyến.
              </p>
            </div>

            <form onSubmit={handleCreateTrip} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Điểm xuất phát (Tỉnh / Điểm đón)</label>
                <input
                  type="text"
                  required
                  value={tDiemDi}
                  onChange={(e) => setTDiemDi(e.target.value)}
                  placeholder="VD: Cầu Giấy, Hà Nội"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Điểm đến (Tỉnh / Điểm trả)</label>
                <input
                  type="text"
                  required
                  value={tDiemDen}
                  onChange={(e) => setTDiemDen(e.target.value)}
                  placeholder="VD: TP. Vinh, Nghệ An"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Thời gian chạy</label>
                <input
                  type="datetime-local"
                  value={tThoiGian}
                  onChange={(e) => setTThoiGian(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Số ghế còn trống</label>
                <input
                  type="number"
                  min="1"
                  max="16"
                  value={tGhe}
                  onChange={(e) => setTGhe(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">Số điện thoại liên hệ</label>
                <input
                  type="tel"
                  required
                  value={tSdt}
                  onChange={(e) => setTSdt(e.target.value)}
                  placeholder="09xxxxxxxx"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>

              <div className="md:col-span-2 pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setView('overview')}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="px-6 py-2.5 bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold text-xs rounded-xl transition shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {busy ? 'Đang mở chuyến...' : '🚗 Mở chuyến xe ngay'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: YÊU CẦU HÀNH KHÁCH (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'passenger-requests' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-[#0b2a4a]">
                    Khách hàng đang tìm xe ({allRequests.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Bấm "Nhận đơn" để chọn chuyến ghép khách hoặc gọi/Zalo trực tiếp thỏa thuận.
                  </p>
                </div>
              </div>

              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">📍</span>
                <input
                  type="text"
                  value={reqFilterText}
                  onChange={(e) => setReqFilterText(e.target.value)}
                  placeholder="Nhập địa điểm lọc (VD: Hà Nội, Vinh, Hải Phòng, Cầu Giấy...)"
                  className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0f766e]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {allRequests
                .filter((r) => {
                  if (isDateInPast(r.thoi_gian_don, r.bai_viet_thoi_gian || r.ngay_tao)) return false;
                  if (!reqFilterText.trim()) return true;
                  const q = reqFilterText.toLowerCase();
                  return (
                    (r.diem_di && r.diem_di.toLowerCase().includes(q)) ||
                    (r.diem_den && r.diem_den.toLowerCase().includes(q)) ||
                    (r.hanh_khach_ten && r.hanh_khach_ten.toLowerCase().includes(q))
                  );
                })
                .map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">#{r.id}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                        {r.so_khach || 1} khách
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-[#0b2a4a]">
                      {r.diem_di} ➔ {r.diem_den}
                    </h4>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>🕒 Giờ đón: <b>{formatTime(r.thoi_gian_don)}</b></p>
                      <p>👤 Khách: <b>{r.hanh_khach_ten || 'Hành khách'}</b> · SĐT: <span className="font-mono font-bold">{r.sdt}</span></p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <a href={`tel:${r.sdt}`} className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
                          📞 Gọi
                        </a>
                        <a href={`https://zalo.me/${(r.sdt || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg text-xs font-semibold text-sky-700">
                          💬 Zalo
                        </a>
                      </div>
                      <button
                        onClick={() => handleOpenAcceptModal(r)}
                        className="px-3.5 py-1.5 bg-[#0f766e] hover:bg-[#115e59] text-white text-xs font-bold rounded-lg shadow-2xs transition cursor-pointer"
                      >
                        Nhận đơn ➔
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: LỊCH SỬ NHẬN CHỞ (TOÀN BỘ CHỨC NĂNG) */}
        {view === 'activity' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-xl font-bold text-[#0b2a4a]">Lịch sử nhận chở ({driverMatches.length})</h2>
              <p className="text-xs text-slate-500 mt-1">Danh sách các cuốc xe đã ghép và hoàn thành hoặc đã hủy.</p>
            </div>

            {driverMatches.length === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                Chưa có lịch sử cuốc xe hoàn thành nào.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400 text-[11px] font-semibold bg-slate-50">
                      <th className="py-3 px-4">Mã ghép</th>
                      <th className="py-3 px-4">Khách hàng</th>
                      <th className="py-3 px-4">Lộ trình</th>
                      <th className="py-3 px-4">Thời gian</th>
                      <th className="py-3 px-4">Đánh giá</th>
                      <th className="py-3 px-4 text-right">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {driverMatches.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-4 font-mono font-bold">#{m.id}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{m.hanh_khach_ten || 'Khách'} ({m.so_khach || 1} ghế)</td>
                        <td className="py-3 px-4 text-slate-700">{m.cx_diem_di} ➔ {m.cx_diem_den}</td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{formatTime(m.thoi_gian_ghep)}</td>
                        <td className="py-3 px-4">
                          {m.danh_gia_sao ? (
                            <div>
                              <span className="font-bold text-amber-500">
                                {'★'.repeat(m.danh_gia_sao)}{'☆'.repeat(5 - m.danh_gia_sao)} ({m.danh_gia_sao}/5)
                              </span>
                              {m.nhan_xet && (
                                <p className="text-[11px] text-slate-500 italic mt-0.5 max-w-xs truncate" title={m.nhan_xet}>
                                  "{m.nhan_xet}"
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Chưa đánh giá</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Badge map={TRANG_THAI_GHEP} value={m.trang_thai} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL: NHẬN ĐƠN KHÁCH HÀNG */}
      {acceptingReq && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">
                Xác nhận đón khách #{acceptingReq.id}
              </h3>
              <button
                onClick={() => setAcceptingReq(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl space-y-1 text-xs text-slate-700">
              <p>👤 Hành khách: <b>{acceptingReq.hanh_khach_ten || acceptingReq.ho_ten || 'Khách'}</b> ({acceptingReq.so_khach || 1} người)</p>
              <p>📍 Tuyến đón: <b>{acceptingReq.diem_di}</b> ➔ <b>{acceptingReq.diem_den}</b></p>
              <p>🕒 Thời gian: <b>{formatTime(acceptingReq.thoi_gian_don)}</b></p>
            </div>

            <form onSubmit={handleConfirmAcceptRequest} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghép vào chuyến xe của bạn</label>
                <select
                  value={selectedTripIdForAccept}
                  onChange={(e) => setSelectedTripIdForAccept(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  <option value="">➕ Tự động tạo chuyến xe mới theo lộ trình khách</option>
                  {trips
                    .filter(t => t.trang_thai === 'con_ghe')
                    .map(t => (
                      <option key={t.id} value={t.id}>
                        Chuyến #{t.id}: {t.diem_di} ➔ {t.diem_den} ({formatTime(t.thoi_gian_chay)}) - Còn {t.so_ghe_trong} chỗ
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Số điện thoại liên hệ của bạn</label>
                <input
                  type="tel"
                  required
                  value={acceptPhone}
                  onChange={(e) => setAcceptPhone(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAcceptingReq(null)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={acceptBusy}
                  className="px-5 py-2 rounded-xl bg-[#0f766e] hover:bg-[#115e59] text-white font-semibold shadow-xs"
                >
                  {acceptBusy ? 'Đang ghép...' : 'Chốt nhận khách ➔'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CÀI ĐẶT TÀI KHOẢN, AVATAR & ĐỔI MẬT KHẨU */}
      {userProfileModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-[#0b2a4a]">Hồ sơ & Tài khoản bác tài</h3>
              <button
                onClick={() => setUserProfileModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-sm font-bold transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-14 h-14 rounded-full bg-[#dcfce7] text-[#065f46] font-bold text-xl flex items-center justify-center overflow-hidden shrink-0">
                  {profileAvatar ? <img src={profileAvatar} alt="Avatar" className="w-full h-full object-cover" /> : 'MH'}
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

              <form onSubmit={handleUpdateProfileInfo} className="space-y-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Họ và tên bác tài</label>
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
                <button onClick={handleLogout} className="text-rose-600 font-bold hover:underline">
                  Đăng xuất
                </button>
                <button onClick={() => setUserProfileModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 font-medium">
                  Đóng
                </button>
              </div>
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
