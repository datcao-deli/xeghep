import os
import sys
import re
import json
import urllib.parse
from datetime import datetime
from time import sleep

import urllib.request as urllib_req

try:
    import requests
except ImportError:
    requests = None

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(_SCRIPT_DIR, ".env"))
    load_dotenv(os.path.join(os.path.dirname(_SCRIPT_DIR), ".env"))
except ImportError:
    pass

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

import ssl
try:
    _ssl_context = ssl._create_unverified_context()
except Exception:
    _ssl_context = None

_backend_port = os.getenv("PORT", "8000")
_default_api_url = f"http://127.0.0.1:{_backend_port}/api/crawler/posts"
_env_api_url = os.getenv("BACKEND_API_URL", "").strip()
if os.getenv("PORT") and "8000" in _env_api_url:
    BACKEND_API_URL = _default_api_url
else:
    BACKEND_API_URL = _env_api_url or _default_api_url

ZALO_COOKIES = os.getenv("ZALO_COOKIES", "").strip()

# Chu kỳ cào dữ liệu: mặc định 30 phút (1800 giây) để cập nhật bài viết mới liên tục
CRAWL_INTERVAL_SECONDS = int(os.getenv("ZALO_CRAWL_INTERVAL", os.getenv("CRAWL_INTERVAL_SECONDS", "1800")))

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)

# Danh sách từ khóa tìm kiếm xe ghép trên Zalo
tu_khoa_kham_pha = [
    "xe ghép",
    "tiện chuyến",
    "ghép xe",
    "xe tiện chuyến",
    "xe ghép đà nẵng",
    "xe ghép hà nội",
    "xe ghép thái bình",
    "xe ghép hải phòng",
    "xe ghép nam định",
    "xe ghép quảng ninh",
    "xe ghép thanh hóa",
    "tìm xe ghép",
    "cần xe ghép",
]

# ============================================================
# BỘ LỌC CHUẨN XÁC TIN NHẮN XE GHÉP
# ============================================================
danh_sach_dia_danh = [
    "hà nội", "hn", "nội bài", "sân bay nội bài", "sân bay", "thái bình", "tb", "nam định", "nđ", 
    "hải dương", "hd", "thái nguyên", "tn", "vĩnh phúc", "vp", "thanh hóa", "thanh hoá", "th",
    "hà nam", "ninh bình", "hưng yên", "bắc ninh", "bắc giang", "hải phòng", "hp", 
    "quảng ninh", "hạ long", "cẩm phả", "đà nẵng", "hội an", "tam kỳ", "huế", 
    "quảng nam", "quảng bình", "đồng hới", "đông hà", "quảng trị", "quảng ngãi",
    "quy nhơn", "nha trang", "đà lạt", "sài gòn", "hcm", "tphcm", "bình dương",
    "đồng nai", "vũng tàu", "cần thơ", "phú thọ", "việt trì", "hòa bình", "yên bái",
    "lào cai", "sapa", "lạng sơn", "cao bằng", "hà giang", "tuyên quang", "sơn la",
    "cầu giấy", "mỹ đình", "thanh xuân", "hà đông", "hoàng mai", "long biên", "gia lâm",
    "đông anh", "sóc sơn", "từ sơn", "hải hậu", "giao thủy", "nghĩa hưng", "vũ thư", "hà lam", "thăng bình"
]

tu_khoa_cam = [
    "nội quy", "quản trị viên", "admin", "lừa đảo", "phòng trọ", "ở ghép",
    "thuê nhà", "thuê phòng", "tuyển dụng", "tuyển nv", "tuyển nhân viên",
    "việc làm", "mô tả công việc", "lương tháng", "kế toán", "marketing",
    "chính sách quyền riêng tư", "điều khoản của threads", "bắt xe ôm", "sửa xe",
    "mua bán xe", "bán xe", "thanh lý", "nhượng lại chiếc", "máy số zin",
    "không đâm đụng", "nhận cọc", "xem xe tại", "giá 2xx", "giá 1xx", "giá 3xx",
    "chốt cọc", "hỏi kinh nghiệm", "xin review", "đi tour", "tour du lịch",
    "đi du lịch", "có số bên nào hong", "có số nhà xe nào", "xin số nhà xe", "cho em xin số"
]

tu_khoa_di_chuyen = [
    "xe ghép", "ghép xe", "tiện chuyến", "chuyến xe", "trống ghế", "còn ghế",
    "còn chỗ", "ghế trống", "chỗ trống", "tìm xe", "cần xe", "đặt xe", "bao xe",
    "đi ghép", "đi ké", "đi nhờ", "đón khách", "trả khách", "nhận khách",
    "chạy tuyến", "sân bay nội bài", "xuất phát", "chạy xe", "xe 4 chỗ", "xe 5 chỗ", "xe 7 chỗ",
    "cần 1 ghế", "cần 2 ghế", "cần ghế", "cần 1 chỗ", "cần 2 chỗ", "cần chỗ", "cần 1 slot", "cần slot",
    "ghế xe", "về lúc", "về trễ", "alo em đón", "lh đón"
]


def _bai_viet_co_ngay_qua_khu(text: str) -> bool:
    t = text.lower()
    if re.search(r'\b\d+\s*(?:ngày|tuần|tháng|năm)\b', t) or "hôm qua" in t or "yesterday" in t:
        return True
    today = datetime.now().date()
    for m in re.finditer(r'(?<!\d)(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?!\d)', t):
        day, month, year_str = int(m.group(1)), int(m.group(2)), m.group(3)
        if not year_str and day == 24 and month == 7:
            continue
        year = int(year_str) if year_str else today.year
        if year < 100:
            year += 2000
        if 1 <= month <= 12 and 1 <= day <= 31:
            try:
                if datetime(year, month, day).date() < today:
                    return True
            except ValueError:
                pass
    return False


def la_bai_viet_moi_nhat(text: str) -> bool:
    return not _bai_viet_co_ngay_qua_khu(text)


def kiem_tra_bai_viet_hop_le(text: str) -> bool:
    text = text.strip()
    if not (20 < len(text) < 1200):
        return False

    if not la_bai_viet_moi_nhat(text):
        return False

    text_lower = text.lower()

    if ("kết bạn" in text_lower and "nhắn tin" in text_lower) or any(
        card_kw in text_lower for card_kw in [
            "danh thiếp", "chia sẻ danh thiếp", "gửi danh thiếp", "cuộc gọi thoại", 
            "cuộc gọi video", "tin nhắn đã được thu hồi", "đã gửi một danh thiếp"
        ]
    ):
        return False

    if any(cam in text_lower for cam in tu_khoa_cam):
        return False

    text_sdt_clean = re.sub(r'[\.\s\-\(\)]', '', text)
    sdt_match = re.search(r'(?:0|84|\+84)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}', text_sdt_clean)
    if not sdt_match:
        return False

    if not any(kw in text_lower for kw in tu_khoa_di_chuyen):
        return False

    dia_danh_tim_thay = set()
    for dd in danh_sach_dia_danh:
        if dd in text_lower:
            dia_danh_tim_thay.add(dd)

    co_cau_truc_tuyen = bool(re.search(
        r'(?:từ\s+[\w\s]{2,15}\s+(?:về|đến|sang|vào|ra|đi|lên)\s+[\w\s]{2,15})|(?:[\w\s]{2,15}\s*(?:-|–|—|->|→|⇄|và)\s*[\w\s]{2,15})|(?:về\s+[\w\s]{2,15})',
        text_lower
    ))

    if len(dia_danh_tim_thay) < 2 and not (len(dia_danh_tim_thay) >= 1 and co_cau_truc_tuyen):
        return False

    return True


# ============================================================
# CLIENT ZALO HTTP POLLER
# ============================================================
class ZaloHTTPCrawler:
    def __init__(self):
        self.session = requests.Session() if requests else None
        self.headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "vi-VN,vi;q=0.9",
            "Referer": "https://chat.zalo.me/",
            "Origin": "https://chat.zalo.me",
        }
        if ZALO_COOKIES:
            self.headers["Cookie"] = ZALO_COOKIES

    def gui_bai(self, text: str) -> bool:
        payload = {
            "noi_dung_tho": text,
            "nguon": "zalo",
            "thoi_gian_tao": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        try:
            if requests:
                r = requests.post(BACKEND_API_URL, json=payload, timeout=25, verify=False)
                return r.status_code == 200
        except Exception:
            pass
        try:
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib_req.Request(BACKEND_API_URL, data=data_bytes, headers={"Content-Type": "application/json"})
            with urllib_req.urlopen(req, timeout=10, context=_ssl_context) as r:
                return r.status == 200
        except Exception as e:
            print(f"⚠️ Lỗi gửi tin nhắn Zalo về Backend ({BACKEND_API_URL}): {e}")
            return False

    def poll_recent_messages(self):
        """Lấy danh sách tin nhắn mới từ API Zalo Web"""
        if not ZALO_COOKIES:
            print("ℹ️ Chưa cấu hình ZALO_COOKIES trong .env. Hãy dán chuỗi Cookie của chat.zalo.me vào biến ZALO_COOKIES rồi bật lại bot.")
            return []

        messages = []
        try:
            # Endpoint kiểm tra trạng thái và tin nhắn gần đây của Zalo Web
            api_url = "https://chat.zalo.me/api/group/list"
            if requests:
                try:
                    resp = self.session.get(api_url, headers=self.headers, timeout=10, verify=False)
                    if resp.status_code == 200:
                        data = resp.json()
                        items = data.get("data", {}).get("items", [])
                        for item in items:
                            msg_text = item.get("last_message", {}).get("content", "")
                            if msg_text:
                                messages.append(msg_text)
                        return messages
                except Exception:
                    pass
            req = urllib_req.Request(api_url, headers=self.headers)
            with urllib_req.urlopen(req, timeout=10, context=_ssl_context) as resp:
                data = json.loads(resp.read().decode("utf-8", errors="ignore"))
                items = data.get("data", {}).get("items", [])
                for item in items:
                    msg_text = item.get("last_message", {}).get("content", "")
                    if msg_text:
                        messages.append(msg_text)
        except Exception as e:
            print(f"⚠️ Zalo API poll error: {e}")

        return messages

    def chay(self):
        print("=" * 65)
        print("🚀 KHỞI ĐỘNG BOT ZALO SIÊU NHẸ (HTTP POLLER)")
        print(f"📡 Backend Endpoint: {BACKEND_API_URL}")
        print(f"🔑 Trạng thái Cookie Zalo: {'Đã cấu hình' if ZALO_COOKIES else 'Chưa cấu hình (cần dán ZALO_COOKIES vào .env)'}")
        print("=" * 65)

        while True:
            msgs = self.poll_recent_messages()
            hop_le = []
            for m in msgs:
                if kiem_tra_bai_viet_hop_le(m):
                    if not any(m in exist or exist in m for exist in hop_le):
                        hop_le.append(m)

            if hop_le:
                print(f"✅ Tìm thấy {len(hop_le)} tin nhắn xe ghép mới trên Zalo.")
                for b in hop_le:
                    self.gui_bai(b)

            phut_nghi = round(CRAWL_INTERVAL_SECONDS / 60)
            print(f"\n🎉 Hoàn thành một chu kỳ Zalo. Nghỉ {phut_nghi} phút ({CRAWL_INTERVAL_SECONDS}s) trước chu kỳ mới...")
            sleep(CRAWL_INTERVAL_SECONDS)


if __name__ == "__main__":
    crawler = ZaloHTTPCrawler()
    crawler.chay()
