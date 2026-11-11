import React, { useState, useEffect } from 'react';

export default function PolicyModal({ isOpen, onClose, onAccept, initialTab = 'terms' }) {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  if (!isOpen) return null;

  const handleAgreeAndClose = () => {
    if (onAccept) onAccept();
    onClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/70 backdrop-blur-md animate-fadeIn"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-sm sm:max-w-md md:max-w-4xl lg:max-w-[1020px] bg-white rounded-[32px] shadow-2xl border border-white/80 overflow-hidden max-h-[94vh] flex flex-col md:flex-row my-auto transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        {/* NÚT ĐÓNG MODAL ✕ NẰM Ở GÓC TRÊN BÊN PHẢI */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-40 w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 md:bg-white/10 md:hover:bg-white/20 md:text-white font-bold flex items-center justify-center transition cursor-pointer text-sm backdrop-blur-md border border-slate-200/50 md:border-white/20 shadow-sm"
          title="Đóng cửa sổ"
        >
          ✕
        </button>

        {/* CỘT TRÁI: NỘI DUNG CHÍNH (ĐIỀU KHOẢN HOẶC CHÍNH SÁCH BẢO MẬT) */}
        <div className="w-full md:w-7/12 lg:w-[58%] p-6 sm:p-8 lg:p-9 flex flex-col justify-between overflow-y-auto max-h-[94vh] bg-white">
          <div>
            {/* Header: Logo, Tag & Tiêu đề chính */}
            <div className="mb-4 pr-6">
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
                  Quy chế pháp lý & Bảo mật
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight mb-1">
                {activeTab === 'terms' ? 'Điều khoản sử dụng.' : 'Chính sách bảo mật.'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
                {activeTab === 'terms'
                  ? 'Quy tắc kết nối xe tiện chuyến văn minh, minh bạch và chia sẻ chi phí trực tiếp.'
                  : 'Tuân thủ nghiêm ngặt Nghị định 13/2023 & Nghị định 147/2024/NĐ-CP.'}
              </p>
            </div>

            {/* Segmented Tabs: Điều khoản sử dụng | Chính sách bảo mật (Đồng bộ chuẩn Login) */}
            <div className="flex bg-[#f1f4f7] p-1.5 rounded-2xl mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('terms')}
                className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'terms' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>📋</span>
                <span>Điều khoản sử dụng</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('privacy')}
                className={`flex-1 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'privacy' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <span>🔒</span>
                <span>Chính sách bảo mật</span>
              </button>
            </div>

            {/* Nội dung chi tiết từng phần có cuộn nội bộ */}
            <div className="space-y-4 text-xs sm:text-sm text-slate-600 leading-relaxed pr-1 max-h-[46vh] sm:max-h-[50vh] overflow-y-auto">
              {/* PHẦN 1: ĐIỀU KHOẢN SỬ DỤNG */}
              {activeTab === 'terms' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-800 space-y-1">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                      <span className="text-[#ff4d4f]">●</span>
                      <span>Nguyên tắc kết nối xe tiện chuyến & chia sẻ chi phí</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Xe Tiện Chuyến (goghep.id.vn) là nền tảng điều phối ghép chuyến thông minh, kết nối trực tiếp giữa Hành khách và Bác tài có cùng hành trình, giúp tối ưu chi phí, giảm ùn tắc giao thông và bảo vệ môi trường.
                    </p>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">1</span>
                      Quy định đối với Hành khách
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li>Cung cấp chính xác điểm đón, điểm trả và thời gian mong muốn xuất phát.</li>
                      <li>Có mặt tại điểm hẹn đúng giờ đã thỏa thuận để bảo đảm lộ trình chung của chuyến xe.</li>
                      <li>Tuyệt đối không mang theo hàng cấm, chất kích thích, vật liệu dễ cháy nổ hoặc vũ khí.</li>
                      <li>Thanh toán đúng mức chi phí đã thống nhất trực tiếp với tài xế, không chịu bất kỳ phụ phí sàn nào.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">2</span>
                      Quy định đối với Bác tài (Tài xế lái xe)
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li>Có Giấy phép lái xe (GPLX) phù hợp với phương tiện và đang còn thời hạn pháp lý.</li>
                      <li>Xe vận chuyển bảo đảm tiêu chuẩn an toàn kỹ thuật, vệ sinh sạch sẽ và bảo dưỡng định kỳ.</li>
                      <li>Đón trả khách đúng điểm đã hẹn, lái xe an toàn và chấp hành nghiêm Luật Giao thông đường bộ.</li>
                      <li>Minh bạch về số ghế trống và giá cước chia sẻ, nghiêm cấm hành vi chèn ép, tăng giá bất hợp lý.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">3</span>
                      Hủy chuyến & Giải quyết khiếu nại trong 24 giờ
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li>Nếu có thay đổi về lịch trình hoặc cần hủy chuyến, vui lòng thông báo cho đối phương trước tối thiểu <b>60 phút</b> qua SĐT/Zalo.</li>
                      <li>Nghiêm cấm tài xế bỏ rơi khách dọc đường hoặc hành khách đặt chuyến ảo rồi ngắt liên lạc.</li>
                      <li>Hệ thống tiếp nhận phản ánh và xử lý chế tài (khóa tài khoản vi phạm vĩnh viễn) trong vòng <b>24 giờ</b>.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* PHẦN 2: CHÍNH SÁCH BẢO MẬT & AN NINH MẠNG */}
              {activeTab === 'privacy' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-slate-800 space-y-1">
                    <p className="font-bold text-slate-900 flex items-center gap-1.5 text-xs sm:text-sm">
                      <span className="text-[#ff4d4f]">●</span>
                      <span>Cam kết bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP)</span>
                    </p>
                    <p className="text-xs text-slate-600">
                      Xe Tiện Chuyến cam kết bảo vệ dữ liệu cá nhân theo tiêu chuẩn cao nhất. Dữ liệu chỉ dùng để kết nối chuyến đi, tuyệt đối không thương mại hóa hoặc chuyển giao cho bên thứ ba.
                    </p>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">1</span>
                      Thông tin thu thập & Mã hóa mật khẩu
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li><b>Thông tin nhận diện:</b> Họ và tên, Số điện thoại di động chính chủ, Địa chỉ email liên hệ.</li>
                      <li><b>Mã hóa mật khẩu:</b> Mật khẩu tài khoản được băm và mã hóa một chiều bằng thuật toán mật mã hiện đại. Không ai (kể cả quản trị viên) có thể đọc mật khẩu gốc của bạn.</li>
                      <li><b>Dữ liệu chuyến đi:</b> Điểm xuất phát, Điểm đến, Thời gian và Số ghế cần ghép.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">2</span>
                      Định danh SĐT & An ninh mạng (Nghị định 147/2024/NĐ-CP)
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li>Mọi tài khoản bắt buộc phải liên kết số điện thoại di động chính chủ tại Việt Nam nhằm loại bỏ hoàn toàn tài khoản rác, lừa đảo hoặc quấy rối.</li>
                      <li>Mỗi số điện thoại chỉ được kích hoạt duy nhất một tài khoản hoạt động trên nền tảng.</li>
                      <li>Hệ thống lưu trữ nhật ký truy cập và lịch sử giao dịch tối thiểu <b>12 tháng</b> theo quy định của Luật An ninh mạng Việt Nam.</li>
                    </ul>
                  </div>

                  <div className="space-y-2 p-3.5 rounded-2xl border border-slate-100 bg-white shadow-xs">
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-100 text-[#ff4d4f] text-xs flex items-center justify-center font-bold">3</span>
                      Quyền kiểm soát & Xóa bỏ dữ liệu cá nhân
                    </h4>
                    <ul className="list-disc pl-5 space-y-1 text-slate-600 text-xs">
                      <li>Bạn có toàn quyền chỉnh sửa thông tin cá nhân bất kỳ lúc nào trong phần Hồ sơ tài khoản.</li>
                      <li>Có quyền yêu cầu xóa vĩnh viễn tài khoản và toàn bộ lịch sử dữ liệu liên quan khi ngừng sử dụng Xe Tiện Chuyến.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer cột trái: Nút đóng & Nút Đồng ý đồng bộ nút Đăng nhập */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={handleAgreeAndClose}
              className="px-5 py-2.5 bg-[#111827] hover:bg-[#1f293d] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition cursor-pointer flex items-center gap-2"
            >
              <span>✓</span>
              <span>Tôi đã đọc & Đồng ý</span>
            </button>
          </div>
        </div>

        {/* CỘT PHẢI: BLUEPRINT BRANDING ĐỒNG NHẤT VỚI MODAL ĐĂNG NHẬP (TRÊN DESKTOP) */}
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
            {/* Top bar: Pill Quy chế pháp lý & Emblem Logo */}
            <div className="flex items-center justify-between mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/70 border border-teal-500/30 text-[10px] font-bold text-teal-300">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                QUY CHẾ PHÁP LÝ & AN TOÀN
              </div>

              <div className="w-11 h-11 rounded-full border border-teal-400/40 bg-slate-900/90 p-1 flex items-center justify-center shadow-lg shadow-teal-500/10 shrink-0">
                <img src="/logo.png" alt="Logo Xe Tiện Chuyến" className="w-full h-full object-contain" />
              </div>
            </div>

            <h4 className="text-3xl sm:text-4xl font-extrabold leading-tight text-white mb-3">
              Pháp lý minh bạch, <br />
              <span className="text-teal-400 font-extrabold">an tâm & bảo mật</span>
            </h4>

            <p className="text-xs text-slate-300/80 leading-relaxed font-normal mb-6">
              Xe Tiện Chuyến hoạt động theo mô hình xe tiện chuyến phi thương mại, tôn trọng tối đa quyền riêng tư và bảo vệ an toàn dữ liệu cá nhân.
            </p>

            {/* Danh sách 3 cam kết pháp lý */}
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                  📜
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Nghị định 13/2023/NĐ-CP</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Bảo vệ dữ liệu cá nhân, mã hóa một chiều mật khẩu.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                  🛡️
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Nghị định 147/2024/NĐ-CP</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Định danh số điện thoại chính chủ, an ninh mạng 12 tháng.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-[#0d222d]/60 backdrop-blur-md p-3.5 rounded-2xl border border-teal-500/15">
                <div className="w-9 h-9 rounded-xl bg-teal-900/40 border border-teal-500/20 text-teal-300 flex items-center justify-center text-sm shrink-0">
                  ⚖️
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Xử lý vi phạm 24/7</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Khóa tài khoản lừa đảo, bảo vệ quyền lợi cộng đồng.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Chân cột phải: Thống kê pháp lý */}
          <div className="relative z-10 pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xl font-black text-white">100%</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Tuân thủ pháp luật</p>
            </div>
            <div className="pl-4 border-l border-white/10">
              <p className="text-2xl font-black text-white">An tâm</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mt-1">Bảo mật dữ liệu</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
