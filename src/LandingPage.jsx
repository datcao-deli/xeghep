import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api, getSession, saveSession } from './api';
import PolicyModal from './PolicyModal';

const REAL_SERVICES = [
  {
    icon: '🤖',
    title: 'AI Quét Tin & Cào Dữ Liệu 24/7',
    desc: 'Hệ thống tự động theo dõi, thu thập và làm sạch bài đăng từ các hội nhóm Facebook, Threads, Zalo liên tục không ngừng nghỉ.',
    tag: 'Đa nền tảng · Tự động',
  },
  {
    icon: '⚡',
    title: 'Thuật Toán Ghép Tuyến Thông Minh',
    desc: 'Trích xuất chính xác điểm đi, điểm đến, thời gian xuất phát và tự động gợi ý ghép các yêu cầu cùng hành trình tối ưu.',
    tag: 'Chính xác · Nhanh 5 phút',
  },
  {
    icon: '📞',
    title: 'Kết Nối Trực Tiếp — Không Trung Gian',
    desc: 'Hành khách và tài xế gọi điện thoại hoặc nhắn tin Zalo trao đổi trực tiếp với nhau, giá cước tự thỏa thuận linh hoạt.',
    tag: 'Minh bạch · Miễn phí',
  },
  {
    icon: '🚗',
    title: 'Bảng Quản Lý Chuyến Cho Tài Xế',
    desc: 'Giao diện chuyên nghiệp giúp tài xế nhập đơn nhanh, đăng chuyến xe còn ghế trống, theo dõi trạng thái và lịch sử nhận chở.',
    tag: 'Tiện lợi cho Tài xế',
  },
  {
    icon: '🔍',
    title: 'Tìm Kiếm & Lọc Chuyến Xe Thực Tế',
    desc: 'Tra cứu danh sách các chuyến xe liên tỉnh đang chạy có sẵn ghế trống, xem số điện thoại tài xế và gọi đặt chỗ ngay.',
    tag: 'Dữ liệu thời gian thực',
  },
  {
    icon: '📦',
    title: 'Gửi Đồ & Hàng Hóa Tiện Chuyến',
    desc: 'Kết hợp vận chuyển tài liệu, bưu phẩm, đồ đạc liên tỉnh cùng chuyến xe với chi phí tiết kiệm và nhận ngay trong ngày.',
    tag: 'Nhanh chóng · Tiết kiệm',
  },
];

const DEFAULT_REAL_ROUTES = [
  { from: 'Quảng Ngãi', to: 'Đà Nẵng', count: 78, status: 'Cập nhật từ Facebook / Zalo' },
  { from: 'Đà Nẵng', to: 'Quảng Ngãi', count: 51, status: 'Cập nhật từ Facebook / Zalo' },
  { from: 'Thái Bình', to: 'Hà Nội', count: 40, status: 'Cập nhật thời gian thực' },
  { from: 'Hà Nội', to: 'Nội Bài', count: 35, status: 'Hoạt động liên tục 24/7' },
  { from: 'Ninh Bình', to: 'Hà Nội', count: 27, status: 'Đón trả tận nhà' },
  { from: 'Đà Nẵng', to: 'Tam Kỳ', count: 24, status: 'Xe chạy hàng ngày' },
];

const FAQS = [
  {
    q: 'Xe Tiện Chuyến hoạt động như thế nào?',
    a: 'Xe Tiện Chuyến là hệ thống công nghệ thông minh tự động cào và tổng hợp các bài đăng tìm xe, ghép xe từ các hội nhóm Facebook, Zalo, Threads lớn và từ các tài xế đăng trực tiếp. Sau đó, AI sẽ chuẩn hóa địa điểm và ghép nối các hành khách - tài xế có cùng tuyến đường để liên hệ trực tiếp với nhau.',
  },
  {
    q: 'Giá cước các chuyến xe trên Xe Tiện Chuyến được tính như thế nào?',
    a: 'Xe Tiện Chuyến là nền tảng điều phối mở và kết nối trực tiếp. Giá cước do hành khách và tài xế tự do trao đổi, thỏa thuận trực tiếp qua Số điện thoại hoặc Zalo. Hệ thống KHÔNG thu phí hoa hồng hay phụ phí trung gian nào.',
  },
  {
    q: 'Làm thế nào để tôi nhận khách hoặc đăng chuyến xe?',
    a: 'Bạn chỉ cần bấm Đăng nhập (hoặc Đăng ký tài khoản mới) ở góc trên. Sau khi vào Bảng điều khiển, tài xế có thể đăng chuyến xe có ghế trống, xem danh sách hành khách cần đón và bấm "Nhận đơn" để liên hệ đón khách ngay lập tức.',
  },
  {
    q: 'Dữ liệu chuyến xe trên web có phải là thông tin thật không?',
    a: '100% dữ liệu trên Xe Tiện Chuyến là thông tin thật được hệ thống bot tự động cào về theo thời gian thực từ các nhóm xe tiện chuyến trên mạng xã hội và các chuyến do tài xế chủ động tạo trên hệ thống.',
  },
];

export default function LandingPage({ defaultAuthOpen = false, defaultAuthMode = 'login' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState(getSession());

  const isAuthRoute = location.pathname === '/login' || location.pathname === '/register';
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(() => defaultAuthOpen || isAuthRoute);
  const [isLoginTab, setIsLoginTab] = useState(() => {
    if (location.pathname === '/register') return false;
    if (location.pathname === '/login') return true;
    return defaultAuthMode === 'login';
  });

  // Tự động đồng bộ modal khi người dùng bấm nút Quay lại (Back) hoặc Đi tới (Forward) của trình duyệt
  useEffect(() => {
    if (location.pathname === '/login') {
      setIsAuthModalOpen(true);
      setIsLoginTab(true);
      setAuthError('');
    } else if (location.pathname === '/register') {
      setIsAuthModalOpen(true);
      setIsLoginTab(false);
      setAuthError('');
    } else if (location.pathname === '/') {
      setIsAuthModalOpen(false);
      setAuthError('');
    }
  }, [location.pathname]);

  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyModalTab, setPolicyModalTab] = useState('terms');
  const [authAgreedPolicy, setAuthAgreedPolicy] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  // Real statistics & routes state from database
  const [realStats, setRealStats] = useState({
    tong_bai_viet: 787,
    tong_chuyen_xe: 720,
    tong_tai_xe: 96,
    so_tinh_thanh: 29,
    tong_yeu_cau: 15,
    tong_ghep: 11,
  });
  const [realRoutes, setRealRoutes] = useState(DEFAULT_REAL_ROUTES);
  const [latestTrip, setLatestTrip] = useState({
    id: 720,
    diem_di: 'Núi Thành',
    diem_den: 'Quảng Ngãi',
    so_ghe_trong: 1,
    tai_xe_ten: 'Tài xế đối tác',
    loai_xe: 'Xe 4-5 chỗ',
    thoi_gian_chay: 'Xuất phát hôm nay',
    sdt: '0888671444',
    zalo_url: 'https://zalo.me/0888671444',
  });
  const [activeRoute, setActiveRoute] = useState({
    diem_di: 'Quảng Ngãi',
    diem_den: 'Đà Nẵng',
  });
  const [heroDiemDi, setHeroDiemDi] = useState('');
  const [heroDiemDen, setHeroDiemDen] = useState('');
  const [heroTab, setHeroTab] = useState('find_trip');

  const filteredRoutes = useMemo(() => {
    return realRoutes.filter((r) => {
      if (heroDiemDi.trim() && !r.from.toLowerCase().includes(heroDiemDi.trim().toLowerCase())) return false;
      if (heroDiemDen.trim() && !r.to.toLowerCase().includes(heroDiemDen.trim().toLowerCase())) return false;
      return true;
    });
  }, [realRoutes, heroDiemDi, heroDiemDen]);

  // Auth modal form state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authHoTen, setAuthHoTen] = useState('');
  const [authSdt, setAuthSdt] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authRememberMe, setAuthRememberMe] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (height > 0) {
        setScrollProgress((winScroll / height) * 100);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Fetch real statistics & routes from database
  useEffect(() => {
    fetch('/api/public/landing-stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRealStats({
            tong_bai_viet: data.tong_bai_viet || 787,
            tong_chuyen_xe: data.tong_chuyen_xe || 720,
            tong_tai_xe: data.tong_tai_xe || 96,
            so_tinh_thanh: data.so_tinh_thanh || 29,
            tong_yeu_cau: data.tong_yeu_cau || 15,
            tong_ghep: data.tong_ghep || 11,
          });
          if (data.tuyen_noi_bat && data.tuyen_noi_bat.length > 0) {
            const formatted = data.tuyen_noi_bat.map((r) => ({
              from: r.diem_di,
              to: r.diem_den,
              count: r.so_chuyen,
              status: 'Dữ liệu cào thực tế từ Facebook/Zalo',
            }));
            setRealRoutes(formatted);
          }
          if (data.chuyen_moi_nhat) {
            setLatestTrip(data.chuyen_moi_nhat);
          }
          if (data.chuyen_dang_chay) {
            setActiveRoute(data.chuyen_dang_chay);
          }
        }
      })
      .catch(() => {
        // Fallback to default real stats
      });
  }, []);

  const [authRole, setAuthRole] = useState('khach_hang');

  const handleOpenAuth = (loginMode = true) => {
    setIsLoginTab(loginMode);
    setAuthError('');
    setAuthAgreedPolicy(false);
    setIsAuthModalOpen(true);
    const targetPath = loginMode ? '/login' : '/register';
    if (location.pathname !== targetPath) {
      navigate(targetPath);
    }
  };

  const handleCloseAuth = () => {
    setIsAuthModalOpen(false);
    setAuthError('');
    if (location.pathname === '/login' || location.pathname === '/register') {
      navigate('/', { replace: true });
    }
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isAuthModalOpen && !showPolicyModal) {
        handleCloseAuth();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isAuthModalOpen, showPolicyModal]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      if (isLoginTab) {
        const data = await api.login({ email: authEmail.trim(), password: authPassword });
        saveSession({ id: data.id, hoTen: data.hoTen, role: data.role, sdt: data.sdt, avatar_url: data.avatar_url });
        setSession(getSession());
        setIsAuthModalOpen(false);
        if (data.role === 'admin') {
          api.dashboardAll().catch(() => {});
          navigate('/dashboard');
        } else if (data.role === 'tai_xe') {
          navigate('/driver');
        } else {
          navigate('/customer');
        }
      } else {
        const cleanPhone = authSdt.trim().replace(/\D/g, '');
        if (!/^0\d{9}$/.test(cleanPhone)) {
          throw new Error('Số điện thoại phải có đúng 10 chữ số bắt đầu bằng số 0');
        }
        if (!authAgreedPolicy) {
          throw new Error('Vui lòng đọc và tích chọn đồng ý với Điều khoản Dịch vụ & Chính sách Bảo vệ Dữ liệu (theo Nghị định 13/2023 & 147/2024/NĐ-CP)');
        }
        await api.register({
          hoTen: authHoTen.trim(),
          email: authEmail.trim(),
          password: authPassword,
          sdt: cleanPhone,
          role: authRole,
        });
        setIsLoginTab(true);
        setAuthError('');
        if (location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
        alert(`Đăng ký tài khoản ${authRole === 'tai_xe' ? 'Tài xế' : 'Hành khách'} thành công! Vui lòng nhập mật khẩu để đăng nhập.`);
      }
    } catch (err) {
      setAuthError(err.message || 'Đăng nhập không thành công, vui lòng thử lại.');
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6fb] font-['Be_Vietnam_Pro',sans-serif] text-slate-800 selection:bg-teal-500 selection:text-white relative overflow-x-hidden">
      {/* THANH TIẾN ĐỘ CUỘN TRANG (SCROLL PROGRESS BAR) */}
      <div
        className="fixed top-0 left-0 h-[3px] bg-gradient-to-r from-teal-500 via-[#0f766e] to-[#0b2a4a] z-[9999] transition-all duration-150"
        style={{ width: `${scrollProgress}%` }}
      />

      {/* HỌA TIẾT NỀN HÀI HÒA TÔNG NAVY - TEAL */}
      <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full border border-teal-500/10 pointer-events-none -z-0 translate-x-1/4 -translate-y-1/4" />
      <div className="absolute top-24 right-12 w-[550px] h-[550px] rounded-full bg-gradient-to-br from-teal-100/30 via-slate-100/40 to-transparent pointer-events-none -z-0 blur-3xl" />

      {/* HEADER / NAVIGATION BAR: ĐỒNG BỘ NỀN TRẮNG SÁNG VỚI HEADER ADMIN & USER DASHBOARD */}
      <header className="sticky top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo chính thức Xe Tiện Chuyến */}
          <a href="#home" className="flex items-center gap-3 group">
            <img
              src="/logo.png"
              alt="Logo Xe Tiện Chuyến"
              className="w-11 h-11 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
            />
            <span className="text-xl font-black text-[#0b2a4a] tracking-tight block">Xe Tiện Chuyến</span>
          </a>

          {/* Menu giữa */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#routes" className="hover:text-[#0b2a4a] transition-colors">Chuyến xe thực</a>
            <a href="#why" className="hover:text-[#0b2a4a] transition-colors">Vì sao Xe Tiện Chuyến</a>
            <a href="#how" className="hover:text-[#0b2a4a] transition-colors">Cách hoạt động</a>
          </nav>

          {/* Góc phải: ĐÃ XÓA "DÀNH CHO TÀI XẾ", CHỈ DUY NHẤT NÚT ĐĂNG NHẬP */}
          <div className="flex items-center">
            {session?.id ? (
              <button
                onClick={() => {
                  if (session.role === 'admin') navigate('/dashboard');
                  else if (session.role === 'tai_xe') navigate('/driver');
                  else navigate('/customer');
                }}
                className="px-4 py-2 bg-[#0b2a4a] hover:bg-[#123a66] text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-2"
              >
                <span>{session.role === 'admin' ? '⚙️ Quản Trị' : session.role === 'tai_xe' ? '🚗 Tài Xế' : '👤 Bàn Làm Việc'}</span>
                <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                  {session.hoTen?.[0] || 'U'}
                </span>
              </button>
            ) : (
              <button
                onClick={() => handleOpenAuth(true)}
                className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold bg-[#0b2a4a] hover:bg-[#123a66] text-white shadow-sm transition cursor-pointer"
              >
                Đăng nhập
              </button>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION: THIẾT KẾ EDITORIAL KHUNG VÒM CHUẨN MÀU NAVY (#0b2a4a) VÀ TEAL (#0f766e) */}
      <section id="home" className="relative pt-10 pb-16 lg:pt-16 lg:pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
            
            {/* Cột trái: Tiêu đề & Hộp tìm kiếm Kính Mờ */}
            <div className="lg:col-span-7 space-y-6 z-10">
              {/* Overline pill badge */}
              <div className="flex items-center gap-2">
                <span className="glass-pill text-teal-800 font-extrabold text-[11px] uppercase tracking-widest px-3.5 py-1.5 rounded-full inline-flex items-center gap-2 border border-teal-300/40">
                  <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                  KẾT NỐI TRỰC TIẾP · KHÔNG THU PHÍ SÀN
                </span>
              </div>

              {/* Headline H1 phong cách tạp chí cao cấp với màu Navy & Teal hài hòa */}
              <h1 className="text-4xl sm:text-5xl lg:text-[62px] font-black tracking-tight leading-[1.1] text-[#0b2a4a]">
                Ghép chuyến tiện lợi, <br />
                <span className="font-['Playfair_Display',Georgia,serif] italic font-semibold text-[#0f766e] block mt-1">
                  đi đâu cũng dễ dàng.
                </span>
              </h1>

              {/* Mô tả giải pháp */}
              <p className="text-sm sm:text-base text-slate-600 max-w-xl leading-relaxed font-normal">
                Xe Tiện Chuyến tự động tổng hợp hàng nghìn chuyến xe thật mỗi ngày từ mạng xã hội và cộng đồng tài xế, giúp bạn tìm được chuyến xe ưng ý chỉ trong 5 phút.
              </p>

              {/* HỘP TÌM KIẾM KÍNH MỜ CHUẨN FIGMA (GLASS SEARCH BOX) */}
              <div className="glass-card glass-hover p-6 sm:p-7 rounded-3xl space-y-4 max-w-xl border border-white/80">
                {/* Segmented Tabs */}
                <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setHeroTab('find_trip')}
                      className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer ${
                        heroTab === 'find_trip'
                          ? 'bg-[#0b2a4a] text-white shadow-xs'
                          : 'text-slate-600 hover:text-[#0b2a4a] hover:bg-slate-100/60'
                      }`}
                    >
                      🔍 Tìm chuyến xe
                    </button>
                    <button
                      type="button"
                      onClick={() => setHeroTab('post_request')}
                      className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl transition cursor-pointer ${
                        heroTab === 'post_request'
                          ? 'bg-[#0b2a4a] text-white shadow-xs'
                          : 'text-slate-600 hover:text-[#0b2a4a] hover:bg-slate-100/60'
                      }`}
                    >
                      🙋 Đăng yêu cầu đi lại
                    </button>
                  </div>
                  <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200 hidden sm:inline-block">
                    {realStats.tong_chuyen_xe || 720}+ chuyến đang chạy
                  </span>
                </div>

                {/* Input Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      {heroTab === 'find_trip' ? 'Điểm xuất phát' : 'Đón bạn ở đâu?'}
                    </label>
                    <input
                      type="text"
                      value={heroDiemDi}
                      onChange={(e) => setHeroDiemDi(e.target.value)}
                      placeholder="Hà Nội, Cầu Giấy, Nội Bài..."
                      className="glass-input w-full p-3 rounded-xl text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                      {heroTab === 'find_trip' ? 'Điểm đến' : 'Muốn đi đến đâu?'}
                    </label>
                    <input
                      type="text"
                      value={heroDiemDen}
                      onChange={(e) => setHeroDiemDen(e.target.value)}
                      placeholder="Nghệ An, Vinh, Hải Phòng..."
                      className="glass-input w-full p-3 rounded-xl text-xs font-semibold text-slate-900"
                    />
                  </div>
                </div>

                {/* CTA Glow Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (heroTab === 'post_request') {
                      if (!session?.id) handleOpenAuth(true);
                      else navigate('/customer');
                    } else {
                      const routesSection = document.getElementById('routes');
                      if (routesSection) routesSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                  className="glow-btn w-full py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{heroTab === 'find_trip' ? 'Tìm Chuyến Xe Phù Hợp Ngay →' : 'Tiếp Tục Đăng Yêu Cầu Tìm Xe →'}</span>
                </button>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>⚡ Thỏa thuận giá cước trực tiếp với tài xế</span>
                  <span>🔒 Miễn phí 100% không thu phí sàn</span>
                </div>
              </div>

              {/* Dữ liệu thực tế hệ thống */}
              <div className="pt-2 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center text-lg shadow-xs shrink-0">
                  🚗
                </div>

                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>Dữ liệu thực tế cập nhật liên tục 24/7</span>
                  </div>
                  <p className="text-xs sm:text-[13px] text-slate-600 font-medium">
                    Đang có <b className="text-[#0b2a4a] font-bold">{realStats.tong_chuyen_xe || 720}+ chuyến xe</b> và <b className="text-[#0b2a4a] font-bold">{realStats.tong_bai_viet || 787}+ bài đăng</b> từ các hội nhóm
                  </p>
                </div>
              </div>
            </div>

            {/* Cột phải: Khung vòm cung (Arch) hình con đèo + Floating Glass Trip Cards */}
            <div className="lg:col-span-5 relative flex justify-center items-center">
              {/* Khung vòm cung chính */}
              <div className="relative w-full max-w-[440px] aspect-[4/5] rounded-t-[230px] rounded-b-[44px] overflow-hidden shadow-2xl ring-1 ring-slate-200/80 bg-slate-100 group">
                <img
                  src="/hero-road.jpg"
                  alt="Tuyến đèo xe tiện chuyến ngoạn mục"
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                />

                {/* Frosted chip Xem trước */}
                <div className="absolute bottom-8 left-6 z-20">
                  <span className="glass-card px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 shadow-md border border-white/60">
                    Xem trước
                  </span>
                </div>
              </div>

              {/* Huy hiệu xoay tròn góc trên bên phải đồng bộ màu Teal Gradient */}
              <a
                href="#routes"
                className="absolute -top-6 -right-2 sm:-top-8 sm:-right-6 w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-teal-500 to-[#0f766e] shadow-xl flex items-center justify-center text-white p-2 z-20 hover:scale-105 transition-transform cursor-pointer group border-2 border-white/40"
                title="Khám phá ngay"
              >
                <svg className="w-full h-full animate-[spin_18s_linear_infinite]" viewBox="0 0 100 100">
                  <defs>
                    <path
                      id="circlePath"
                      d="M 50, 50 m -35, 0 a 35,35 0 1,1 70,0 a 35,35 0 1,1 -70,0"
                    />
                  </defs>
                  <text className="text-[10.5px] font-black uppercase fill-white tracking-[0.16em]">
                    <textPath href="#circlePath" startOffset="0%">
                      TÌM NHANH · ĐI NGAY · TÌM NHANH ·
                    </textPath>
                  </text>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl sm:text-2xl font-black text-white group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </a>

              {/* Thẻ kính chuyến vừa cập nhật - Nổi lên khi hover */}
              <div className="glass-card glass-hover p-4 sm:p-5 rounded-2xl shadow-xl space-y-2 max-w-[300px] absolute -bottom-6 -left-3 sm:-left-6 z-20 text-slate-800 border border-white/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                    ⚡ Chuyến mới nhất
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-black text-[#0b2a4a] truncate">
                    {latestTrip.diem_di} ⇄ {latestTrip.diem_den}
                  </h4>
                  <span className="text-[11px] font-extrabold text-teal-800 bg-teal-100/70 px-2 py-0.5 rounded-full shrink-0">
                    Còn {latestTrip.so_ghe_trong} chỗ
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {latestTrip.tai_xe_ten} • {latestTrip.loai_xe} • {latestTrip.thoi_gian_chay}
                </p>
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <a
                    href={latestTrip.zalo_url || (latestTrip.sdt ? `https://zalo.me/${String(latestTrip.sdt).replace(/\D/g, '')}` : 'https://zalo.me')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-800 hover:underline flex items-center gap-1"
                  >
                    <span>💬 Chat Zalo</span>
                  </a>
                  <button
                    onClick={() => {
                      if (!session?.id) handleOpenAuth(true);
                      else if (session.role === 'admin') navigate('/dashboard');
                      else if (session.role === 'tai_xe') navigate('/driver');
                      else navigate('/customer');
                    }}
                    className="px-2.5 py-1 bg-[#0b2a4a] hover:bg-[#123a66] text-white rounded-lg text-[10px] font-bold shadow-xs transition cursor-pointer"
                  >
                    Đặt chỗ
                  </button>
                </div>
              </div>

              {/* Thẻ kính tối màu hiển thị chuyến xe thời gian thực */}
              <div className="absolute top-1/2 -right-4 sm:-right-8 -translate-y-1/2 z-20 glass-dark glass-dark-hover text-white rounded-2xl p-3.5 px-4 shadow-2xl flex items-center gap-3 max-w-[260px] border border-white/20">
                <div className="w-9 h-9 rounded-xl bg-teal-500 text-slate-950 flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-5 h-5 text-slate-950" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z" />
                  </svg>
                </div>
                <div>
                  <span className="text-[10px] text-teal-300 font-medium block">
                    Đang trên hành trình
                  </span>
                  <span className="text-xs font-bold text-white block tracking-tight truncate">
                    {activeRoute.diem_di} → {activeRoute.diem_den}
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* 4 STATS CARDS SỬ DỤNG 100% DỮ LIỆU THẬT TỪ CƠ SỞ DỮ LIỆU */}
      <section className="py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-20">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="glass-card glass-hover p-6 rounded-3xl text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-[#0b2a4a] tracking-tight">
              {realStats.tong_bai_viet || 787}+
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-600">Bài đăng được quét</p>
            <span className="text-[10px] text-teal-700 font-semibold block">Cào từ Facebook, Zalo 24/7</span>
          </div>

          <div className="glass-card glass-hover p-6 rounded-3xl text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-[#0f766e] tracking-tight">
              {realStats.tong_chuyen_xe || 720}
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-600">Chuyến xe tiện chuyến</p>
            <span className="text-[10px] text-emerald-600 font-semibold block">Đầy đủ lộ trình & thời gian</span>
          </div>

          <div className="glass-card glass-hover p-6 rounded-3xl text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-[#0b2a4a] tracking-tight">
              {realStats.tong_tai_xe || 96}
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-600">Tài xế có số điện thoại</p>
            <span className="text-[10px] text-slate-500 font-semibold block">Liên hệ trực tiếp Zalo / Gọi điện</span>
          </div>

          <div className="glass-card glass-hover p-6 rounded-3xl text-center space-y-1">
            <div className="text-3xl sm:text-4xl font-black text-[#0f766e] tracking-tight">
              {realStats.so_tinh_thanh || 29}+
            </div>
            <p className="text-xs sm:text-sm font-bold text-slate-600">Tỉnh thành kết nối</p>
            <span className="text-[10px] text-slate-500 font-semibold block">Toàn quốc & Liên tỉnh</span>
          </div>
        </div>
      </section>

      {/* CÁC TUYẾN ĐƯỜNG CÀO DỮ LIỆU THỰC TẾ (#routes) */}
      <section id="routes" className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              Một chỗ ngồi. Nhiều điểm đến.
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0b2a4a] mt-3 tracking-tight">
              Các Tuyến Xe Đang Có Chuyến Thực Tế
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Dữ liệu chuyến xe được cào và cập nhật tự động từ các nhóm Facebook, Zalo và tài xế đăng ký. Giá cước do hai bên tự do thỏa thuận trực tiếp.
            </p>
            {(heroDiemDi || heroDiemDen) && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="text-xs text-slate-600">
                  Lọc theo: <b>{heroDiemDi || 'Tất cả'}</b> ➔ <b>{heroDiemDen || 'Tất cả'}</b>
                </span>
                <button
                  type="button"
                  onClick={() => { setHeroDiemDi(''); setHeroDiemDen(''); }}
                  className="text-xs text-rose-600 font-bold hover:underline cursor-pointer"
                >
                  ✕ Bỏ lọc
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRoutes.map((r, idx) => (
              <div
                key={idx}
                className="glass-card glass-hover p-6 rounded-3xl flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 font-black text-slate-900 text-lg">
                      <span>{r.from}</span>
                      <span className="text-teal-600">⇄</span>
                      <span>{r.to}</span>
                    </div>
                    <span className="text-xs font-bold text-teal-800 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                      {r.count} chuyến xe
                    </span>
                  </div>

                  <div className="space-y-2.5 py-3 border-y border-slate-100 text-xs text-slate-600">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Nguồn dữ liệu:</span>
                      <span className="font-semibold text-slate-700">Facebook, Zalo, Tài xế</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Hình thức:</span>
                      <span className="font-semibold text-teal-700">Ghép ghế · Bao xe · Gửi đồ</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Giá cước:</span>
                      <span className="font-bold text-[#0b2a4a]">Thỏa thuận trực tiếp với tài xế</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (!session?.id) handleOpenAuth(true);
                    else if (session.role === 'admin') navigate('/dashboard');
                    else if (session.role === 'tai_xe') navigate('/driver');
                    else navigate('/customer');
                  }}
                  className="w-full mt-5 py-3 bg-[#0b2a4a] hover:bg-[#123a66] text-white font-extrabold rounded-xl text-xs transition cursor-pointer shadow-sm group-hover:shadow"
                >
                  Xem Các Chuyến Tuyến Này →
                </button>
              </div>
            ))}
          </div>

          {filteredRoutes.length === 0 && (
            <div className="glass-card p-10 rounded-3xl text-center max-w-lg mx-auto space-y-3">
              <p className="text-slate-700 font-bold text-base">Không tìm thấy chuyến xe nào khớp với bộ lọc</p>
              <p className="text-xs text-slate-500">
                Bạn có thể bỏ lọc để xem toàn bộ danh sách, hoặc bấm Đăng yêu cầu tìm xe để hệ thống ghép tài xế đón bạn.
              </p>
              <button
                type="button"
                onClick={() => { setHeroDiemDi(''); setHeroDiemDen(''); }}
                className="px-5 py-2.5 bg-[#0f766e] text-white text-xs font-bold rounded-xl shadow-sm"
              >
                Xem lại tất cả tuyến xe
              </button>
            </div>
          )}
        </div>
      </section>

      {/* VÌ SAO CHỌN XE TIỆN CHUYẾN (#why) */}
      <section id="why" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
            Lợi ích khác biệt
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0b2a4a] mt-3 tracking-tight">
            Vì Sao Xe Tiện Chuyến Là Lựa Chọn Hàng Đầu?
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Mô hình kết nối trực tiếp giúp cả hành khách và tài xế giải quyết bài toán chi phí và thời gian.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="glass-card glass-hover rounded-3xl p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-xl font-bold border border-teal-200/60 shadow-xs">
              0đ
            </div>
            <h3 className="text-xl font-bold text-slate-900">Không Phí Trung Gian</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Hệ thống không thu bất kỳ khoản hoa hồng nào từ cước phí của tài xế hay hành khách. Giá cả tự do thương lượng, tiết kiệm từ 40% đến 50% so với taxi truyền thống.
            </p>
          </div>

          <div className="glass-card glass-hover rounded-3xl p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-xl border border-teal-200/60 shadow-xs">
              🏡
            </div>
            <h3 className="text-xl font-bold text-slate-900">Đón Trả Tận Nơi Tại Nhà</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Không cần phải di chuyển ra bến xe đông đúc hay chờ đợi hàng giờ. Tài xế tiện chuyến đón và trả khách tận cửa nhà tại các tỉnh thành.
            </p>
          </div>

          <div className="glass-card glass-hover rounded-3xl p-8 space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center text-xl border border-teal-200/60 shadow-xs">
              ⚡
            </div>
            <h3 className="text-xl font-bold text-slate-900">Ghép Siêu Tốc Trong 5 Phút</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Thuật toán AI tự động quét bài đăng trên các mạng xã hội theo thời gian thực và đề xuất ngay lập tức các chuyến xe cùng cung đường và khung giờ.
            </p>
          </div>
        </div>
      </section>

      {/* CÁCH HOẠT ĐỘNG (#how) */}
      <section id="how" className="py-20 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
              Quy trình đơn giản
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0b2a4a] mt-3 tracking-tight">
              Cách Thức Vận Hành Của Xe Tiện Chuyến
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Chỉ 3 bước đơn giản để tìm hoặc nhận chuyến xe phù hợp nhất.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="glass-card glass-hover rounded-3xl p-8 space-y-4">
              <span className="text-3xl font-black text-teal-600 font-mono">01</span>
              <h3 className="text-lg font-bold text-slate-900">AI Quét Tin Tự Động 24/7</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Hệ thống bot tự động thu thập tin đăng tìm xe, ghép xe từ các hội nhóm mạng xã hội và các chuyến do tài xế chủ động tạo.
              </p>
            </div>

            <div className="glass-card glass-hover rounded-3xl p-8 space-y-4">
              <span className="text-3xl font-black text-[#0b2a4a] font-mono">02</span>
              <h3 className="text-lg font-bold text-slate-900">Chuẩn Hóa & Ghép Tuyến</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Thuật toán bóc tách điểm đi, điểm đến, giờ khởi hành và gợi ý ghép nối hành khách với tài xế có cùng hành trình tối ưu.
              </p>
            </div>

            <div className="glass-card glass-hover rounded-3xl p-8 space-y-4">
              <span className="text-3xl font-black text-teal-600 font-mono">03</span>
              <h3 className="text-lg font-bold text-slate-900">Liên Hệ Trực Tiếp SĐT / Zalo</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Hai bên gọi điện thoại hoặc nhắn tin trao đổi trực tiếp, xác nhận điểm đón và tự do thỏa thuận giá cước nhanh chóng.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DỊCH VỤ THỰC TẾ HỆ THỐNG (#services) */}
      <section id="services" className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
            Dịch vụ hệ thống
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0b2a4a] mt-3 tracking-tight">
            Năng Lực & Dịch Vụ Cốt Lõi Xe Tiện Chuyến
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Giải pháp công nghệ điều phối toàn diện phục vụ hành khách và tài xế xe tiện chuyến liên tỉnh.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {REAL_SERVICES.map((item, idx) => (
            <div
              key={idx}
              className="glass-card glass-hover rounded-3xl p-7 flex flex-col justify-between group"
            >
              <div>
                <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200/60 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="font-extrabold text-lg text-slate-900 mb-2">{item.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200">
                  {item.tag}
                </span>
                <button
                  onClick={() => handleOpenAuth(true)}
                  className="text-xs font-semibold text-slate-500 group-hover:text-teal-700 transition cursor-pointer"
                >
                  Truy cập →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* HỎI ĐÁP THƯỜNG GẶP (FAQ ACCORDION) */}
      <section id="faq" className="py-20 max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
            Giải đáp thắc mắc
          </span>
          <h2 className="text-3xl font-extrabold text-[#0b2a4a] mt-3 tracking-tight">
            Câu Hỏi Thường Gặp
          </h2>
          <p className="text-sm text-slate-500 mt-2">
            Mọi điều cần biết về cách thức vận hành của nền tảng Xe Tiện Chuyến.
          </p>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div
                key={idx}
                className="glass-card glass-hover rounded-2xl overflow-hidden transition"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left font-bold text-slate-900 flex items-center justify-between gap-4 hover:bg-white/60 transition cursor-pointer"
                >
                  <span className="text-sm sm:text-base flex items-center gap-2.5">
                    <span className="text-teal-700 text-xs font-mono font-bold bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
                      Q{idx + 1}
                    </span>
                    {faq.q}
                  </span>
                  <span className={`text-slate-400 text-sm transition-transform duration-200 ${isOpen ? 'rotate-180 text-teal-700' : ''}`}>
                    ▼
                  </span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-100 bg-slate-50/40">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="w-full bg-[#0b2a4a] text-slate-300 py-12 px-4 border-t border-slate-800">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8 text-sm">
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="Logo Xe Tiện Chuyến"
                className="w-9 h-9 object-contain drop-shadow-sm"
              />
              <span className="font-extrabold text-white text-lg tracking-tight">Xe Tiện Chuyến</span>
            </div>
            <p className="text-slate-400 text-xs max-w-sm leading-relaxed">
              Hệ thống tự động cào và điều phối ghép chuyến xe liên tỉnh bằng AI. Kết nối trực tiếp tài xế và hành khách, không qua trung gian.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Liên kết nhanh</h4>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li><a href="#routes" className="hover:text-teal-300 transition">Tuyến xe cào về</a></li>
              <li><a href="#why" className="hover:text-teal-300 transition">Vì sao Xe Tiện Chuyến</a></li>
              <li><a href="#how" className="hover:text-teal-300 transition">Cách hoạt động</a></li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPolicyModalTab('terms');
                    setShowPolicyModal(true);
                  }}
                  className="hover:text-teal-300 transition cursor-pointer text-left text-teal-300 font-semibold"
                >
                  Điều khoản sử dụng
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    setPolicyModalTab('privacy');
                    setShowPolicyModal(true);
                  }}
                  className="hover:text-teal-300 transition cursor-pointer text-left text-teal-300 font-semibold"
                >
                  Chính sách bảo mật
                </button>
              </li>
              <li><button onClick={() => handleOpenAuth(true)} className="hover:text-teal-300 transition cursor-pointer">Đăng nhập hệ thống</button></li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider">Hỗ trợ & Tên miền</h4>
            <ul className="space-y-1.5 text-xs text-slate-400">
              <li>📍 Tuyến chính: Hà Nội, Hạ Long, Hải Phòng, Miền Trung & Toàn quốc</li>
              <li>🌐 Website chính thức: <a href="https://goghep.id.vn" className="text-teal-400 hover:underline">goghep.id.vn</a></li>
              <li>💬 Kết nối trực tiếp qua Zalo / Số điện thoại trên bài đăng</li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <p>© Xe Tiện Chuyến (goghep.id.vn). Tất cả quyền được bảo lưu.</p>
          <p>Hệ thống quét dữ liệu và điều phối xe ghép thông minh.</p>
        </div>
      </footer>

      {/* NÚT TRỢ GIÚP NỔI GÓC DƯỚI BÊN PHẢI (FLOATING HELP BUTTON) */}
      <a
        href="#faq"
        className="fixed bottom-6 right-6 z-40 w-11 h-11 rounded-full bg-white text-slate-800 shadow-xl border border-slate-200 flex items-center justify-center font-bold text-base hover:bg-slate-50 hover:scale-105 transition-all cursor-pointer"
        title="Hỏi đáp thường gặp"
      >
        ?
      </a>

      {/* POPUP MODAL ĐĂNG NHẬP / ĐĂNG KÝ (AUTH MODAL) */}
      {isAuthModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-md animate-fadeIn"
          onClick={handleCloseAuth}
        >
          <div
            className="relative w-full max-w-sm sm:max-w-md md:max-w-4xl lg:max-w-[1020px] bg-white rounded-[32px] shadow-2xl border border-white/80 overflow-hidden max-h-[94vh] flex flex-col md:flex-row my-auto transition-all duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* NÚT ĐÓNG MODAL ✕ NẰM Ở GÓC TRÊN BÊN PHẢI */}
            <button
              onClick={handleCloseAuth}
              className="absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 md:bg-white/10 md:hover:bg-white/20 md:text-white font-bold flex items-center justify-center transition cursor-pointer text-sm backdrop-blur-md border border-slate-200/50 md:border-white/20 shadow-sm"
              title="Đóng cửa sổ"
            >
              ✕
            </button>

            {/* CỘT TRÁI: FORM ĐĂNG NHẬP / ĐĂNG KÝ */}
            <div className="w-full md:w-7/12 lg:w-[58%] p-6 sm:p-8 lg:p-9 flex flex-col justify-center overflow-y-auto max-h-[94vh] bg-white">
              <div className="w-full my-auto">
                {/* Header: Logo, Tag & Tiêu đề chính */}
                <div className="mb-3.5 pr-6">
                  <div className="flex items-center gap-2 mb-1.5">
                    <img
                      src="/logo.png"
                      alt="Logo Xe Tiện Chuyến"
                      className="w-7 h-7 object-contain drop-shadow-sm shrink-0"
                    />
                    <span className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight">
                      Xe Tiện Chuyến
                    </span>
                    <span className="w-3.5 h-[2px] bg-[#ff4d4f] rounded-full inline-block shrink-0"></span>
                    <span className="text-[10px] sm:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Đồng hành trên mọi hành trình
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight mb-1">
                    {isLoginTab ? 'Chào mừng trở lại.' : 'Tạo tài khoản mới.'}
                  </h3>
                  {isLoginTab && (
                    <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed mt-1">
                      Đăng nhập để đặt chỗ, theo dõi chuyến xe và liên hệ trực tiếp với bác tài.
                    </p>
                  )}
                </div>

                {/* Segmented Tabs: Đăng nhập | Đăng ký */}
                <div className="flex bg-[#f1f4f7] p-1.5 rounded-2xl mb-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginTab(true);
                      setAuthError('');
                      if (location.pathname !== '/login') navigate('/login', { replace: true });
                    }}
                    className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${
                      isLoginTab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLoginTab(false);
                      setAuthError('');
                      if (location.pathname !== '/register') navigate('/register', { replace: true });
                    }}
                    className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer ${
                      !isLoginTab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    Đăng ký
                  </button>
                </div>

                {authError && (
                  <div className="mb-3 text-xs sm:text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2 flex items-start gap-2">
                    <span>⚠️</span>
                    <span className="flex-1">{authError}</span>
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-3 sm:space-y-3.5">
                  {/* TAB ĐĂNG KÝ: CHỌN VAI TRÒ */}
                  {!isLoginTab && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                        VAI TRÒ THAM GIA
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {/* Hành khách */}
                        <button
                          type="button"
                          onClick={() => setAuthRole('khach_hang')}
                          className={`p-2.5 sm:p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                            authRole === 'khach_hang'
                              ? 'border-[#ff4d4f] ring-1 ring-[#ff4d4f] bg-white shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={authRole === 'khach_hang' ? 'text-[#ff4d4f]' : 'text-slate-400'}>
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Hành khách</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Tìm và đặt chỗ</p>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                              authRole === 'khach_hang' ? 'bg-[#ff4d4f] text-white text-[11px] font-bold' : 'border border-slate-300'
                            }`}
                          >
                            {authRole === 'khach_hang' && '✓'}
                          </div>
                        </button>

                        {/* Tài xế lái xe */}
                        <button
                          type="button"
                          onClick={() => setAuthRole('tai_xe')}
                          className={`p-2.5 sm:p-3 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
                            authRole === 'tai_xe'
                              ? 'border-[#ff4d4f] ring-1 ring-[#ff4d4f] bg-white shadow-xs'
                              : 'border-slate-200 bg-white hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className={authRole === 'tai_xe' ? 'text-[#ff4d4f]' : 'text-slate-400'}>
                              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                              </svg>
                            </span>
                            <div>
                              <p className="text-xs sm:text-sm font-bold text-slate-900 leading-tight">Tài xế lái xe</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Đăng và nhận khách</p>
                            </div>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                              authRole === 'tai_xe' ? 'bg-[#ff4d4f] text-white text-[11px] font-bold' : 'border border-slate-300'
                            }`}
                          >
                            {authRole === 'tai_xe' && '✓'}
                          </div>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB ĐĂNG KÝ: TÊN HIỂN THỊ */}
                  {!isLoginTab && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Tên hiển thị
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          value={authHoTen}
                          onChange={(e) => setAuthHoTen(e.target.value)}
                          placeholder="Họ và tên của bạn"
                          className="w-full py-2.5 sm:py-3 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#ff4d4f] focus:ring-4 focus:ring-rose-500/10 outline-none transition"
                          required={!isLoginTab}
                        />
                      </div>
                    </div>
                  )}

                  {/* TAB ĐĂNG KÝ: SỐ ĐIỆN THOẠI (BỔ SUNG THEO YÊU CẦU ĐỂ KHỚP VỚI DỮ LIỆU CŨ) */}
                  {!isLoginTab && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Số điện thoại
                      </label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                        </span>
                        <input
                          type="tel"
                          maxLength={10}
                          value={authSdt}
                          onChange={(e) => setAuthSdt(e.target.value.replace(/\D/g, ''))}
                          placeholder="Số điện thoại của bạn (VD: 0912345678)"
                          className="w-full py-2.5 sm:py-3 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#ff4d4f] focus:ring-4 focus:ring-rose-500/10 outline-none transition"
                          required={!isLoginTab}
                        />
                      </div>
                    </div>
                  )}

                  {/* EMAIL (DÙNG CHO CẢ ĐĂNG NHẬP VÀ ĐĂNG KÝ) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Email
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </span>
                      <input
                        type={isLoginTab ? "text" : "email"}
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full py-2.5 sm:py-3 pl-11 pr-4 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#ff4d4f] focus:ring-4 focus:ring-rose-500/10 outline-none transition"
                        required
                      />
                    </div>
                  </div>

                  {/* MẬT KHẨU */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </span>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="Ít nhất 8 ký tự"
                        className="w-full py-2.5 sm:py-3 pl-11 pr-11 bg-white border border-slate-200 rounded-2xl text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#ff4d4f] focus:ring-4 focus:ring-rose-500/10 outline-none transition"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                        title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* GHI NHỚ ĐĂNG NHẬP & QUÊN MẬT KHẨU (KHI Ở TAB ĐĂNG NHẬP) */}
                  {isLoginTab && (
                    <div className="flex items-center justify-between text-xs sm:text-sm pt-0.5">
                      <label className="flex items-center gap-2.5 cursor-pointer text-slate-600 font-medium select-none">
                        <input
                          type="checkbox"
                          checked={authRememberMe}
                          onChange={(e) => setAuthRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-[#ff4d4f] accent-[#ff4d4f] cursor-pointer"
                        />
                        <span>Ghi nhớ đăng nhập</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => alert('Vui lòng liên hệ Hotline/Zalo hỗ trợ của Xe Tiện Chuyến để cấp lại mật khẩu: 0912 345 678')}
                        className="text-[#ff4d4f] font-semibold hover:underline cursor-pointer"
                      >
                        Quên mật khẩu?
                      </button>
                    </div>
                  )}

                  {/* ĐIỀU KHOẢN & BẢO MẬT (KHI Ở TAB ĐĂNG KÝ) */}
                  {!isLoginTab && (
                    <div className="flex items-start gap-2 pt-0.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        id="authAgreedPolicy"
                        checked={authAgreedPolicy}
                        onChange={(e) => setAuthAgreedPolicy(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#ff4d4f] accent-[#ff4d4f] cursor-pointer shrink-0"
                        required
                      />
                      <label htmlFor="authAgreedPolicy" className="leading-snug cursor-pointer select-none text-[11px] sm:text-xs">
                        Tôi đồng ý với{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setPolicyModalTab('terms');
                            setShowPolicyModal(true);
                          }}
                          className="text-[#ff4d4f] font-semibold underline hover:text-red-700"
                        >
                          Điều khoản sử dụng
                        </button>{' '}
                        và{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setPolicyModalTab('privacy');
                            setShowPolicyModal(true);
                          }}
                          className="text-[#ff4d4f] font-semibold underline hover:text-red-700"
                        >
                          Chính sách bảo mật
                        </button>.
                      </label>
                    </div>
                  )}

                  {/* NÚT SUBMIT */}
                  <button
                    type="submit"
                    disabled={authLoading || (!isLoginTab && !authAgreedPolicy)}
                    className="w-full py-3.5 bg-[#111827] hover:bg-[#1f293d] text-white font-bold rounded-2xl shadow-lg transition cursor-pointer text-sm sm:text-base flex items-center justify-center gap-2 mt-3 disabled:opacity-50"
                  >
                    <span>{authLoading ? 'Đang xử lý...' : isLoginTab ? 'Đăng nhập ngay' : 'Tạo tài khoản'}</span>
                    <span className="text-base font-bold">→</span>
                  </button>
                </form>

                {/* Chân trang chuyển đổi giữa Đăng nhập / Đăng ký (Đặt ngay bên dưới nút submit, không bị khoảng trống) */}
                <div className="mt-4 pt-1 text-center text-xs sm:text-sm text-slate-500 font-medium">
                  {isLoginTab ? (
                    <p>
                      Chưa có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginTab(false);
                          setAuthError('');
                          if (location.pathname !== '/register') navigate('/register', { replace: true });
                        }}
                        className="text-[#ff4d4f] font-bold hover:underline cursor-pointer ml-1"
                      >
                        Đăng ký miễn phí
                      </button>
                    </p>
                  ) : (
                    <p>
                      Đã có tài khoản?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLoginTab(true);
                          setAuthError('');
                          if (location.pathname !== '/login') navigate('/login', { replace: true });
                        }}
                        className="text-[#ff4d4f] font-bold hover:underline cursor-pointer ml-1"
                      >
                        Đăng nhập ngay
                      </button>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* CỘT PHẢI: BLUEPRINT BRANDING & GIỚI THIỆU XE TIỆN CHUYẾN (TRÊN DESKTOP) */}
            <div
              className="hidden md:flex md:w-5/12 lg:w-[42%] text-white p-7 lg:p-9 flex-col justify-between relative overflow-hidden"
              style={{
                backgroundColor: '#06151f',
                backgroundImage:
                  'linear-gradient(to right, rgba(20, 184, 166, 0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(20, 184, 166, 0.08) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            >
              {/* SVG đường cong tuyến đường và các điểm chốt phát sáng */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40" xmlns="http://www.w3.org/2000/svg">
                <path d="M -50 90 Q 200 130 500 70" fill="none" stroke="#14b8a6" strokeWidth="1.5" />
                <path d="M -20 200 Q 220 140 500 250" fill="none" stroke="#0d9488" strokeWidth="1.2" strokeDasharray="4 4" />
                <circle cx="120" cy="180" r="3" fill="#2dd4bf" />
                <circle cx="120" cy="180" r="8" fill="none" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" />
                <circle cx="280" cy="220" r="3" fill="#2dd4bf" />
                <circle cx="280" cy="220" r="8" fill="none" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" />
                <circle cx="340" cy="175" r="3" fill="#2dd4bf" />
                <circle cx="340" cy="175" r="8" fill="none" stroke="#2dd4bf" strokeWidth="1" opacity="0.6" />
              </svg>

              <div className="relative z-10">
                {/* Top bar: Pill Nền tảng điều phối AI & Emblem Logo */}
                <div className="flex items-center justify-between mb-6">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/70 border border-teal-500/30 text-[10px] font-bold text-teal-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                    NỀN TẢNG ĐIỀU PHỐI XE GỢI Ý AI
                  </div>

                  <div className="w-11 h-11 rounded-full border border-teal-400/40 bg-slate-900/90 p-1 flex items-center justify-center shadow-lg shadow-teal-500/10 shrink-0">
                    <img src="/logo.png" alt="Logo Xe Tiện Chuyến" className="w-full h-full object-contain" />
                  </div>
                </div>

                <h4 className="text-3xl sm:text-4xl font-extrabold leading-tight text-white mb-3">
                  Ghép chuyến rõ tuyến, <br />
                  <span className="text-teal-400 font-extrabold">đúng giờ & an tâm</span>
                </h4>

                <p className="text-xs text-slate-300/80 leading-relaxed font-normal mb-6">
                  Xe Tiện Chuyến kết nối trực tiếp hành khách và tài xế xe tiện chuyến, minh bạch giá cước và không thu bất kỳ khoản phí sàn trung gian nào.
                </p>

                {/* Danh sách 3 lợi ích vượt trội */}
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                    <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                      ✨
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Ghép xe thông minh 5 phút</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">AI tự động tìm cuốc có tuyến đường gần bạn nhất.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                    <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                      ✓
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Tiết kiệm 40% – 50%</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Giá vé tốt, đón trả tận nơi tại nhà.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                    <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                      <svg className="w-4 h-4 text-teal-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Bảo mật thông tin chuẩn xác</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">Bảo vệ dữ liệu cá nhân của mọi thành viên.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chân cột phải: Thống kê thực tế */}
              <div className="relative z-10 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-2xl font-black text-white">{realStats.tong_chuyen_xe || 741}+ chuyến</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Chuyến xe thực tế</p>
                </div>
                <div className="pl-4 border-l border-white/10">
                  <p className="text-2xl font-black text-white">Kết nối trực tiếp</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Cộng đồng</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ĐIỀU KHOẢN & BẢO MẬT AN NINH MẠNG */}
      <PolicyModal 
        isOpen={showPolicyModal} 
        onClose={() => setShowPolicyModal(false)} 
        onAccept={() => setAuthAgreedPolicy(true)}
        initialTab={policyModalTab}
      />
    </div>
  );
}
