import os
import sys
import re
import json
import html
import time
import urllib
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

THREADS_COOKIE = os.getenv("THREADS_COOKIE", "").strip()

# Chu kỳ cào dữ liệu: mặc định 30 phút (1800 giây) để cập nhật bài viết mới liên tục
CRAWL_INTERVAL_SECONDS = int(os.getenv("THREADS_CRAWL_INTERVAL", os.getenv("CRAWL_INTERVAL_SECONDS", "1800")))

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
)

# Danh sách nguồn Threads công khai
nguon_cong_khai_threads = [
    "https://www.threads.net/tag/xeghep",
    "https://www.threads.net/tag/xetienchuyen",
    "https://www.threads.net/tag/goghep",
    "https://www.threads.net/tag/xeghephanoi",
    "https://www.threads.net/tag/xeghepdanang",
    "https://www.threads.net/tag/xeghephaiphong",
    "https://www.threads.net/tag/xeghepnamdinh",
    "https://www.threads.net/tag/xeghepthaibinh",
    "https://www.threads.net/tag/xeghepninhbinh",
    "https://www.threads.net/tag/xeghepquangninh",
    "https://www.threads.net/@xeghepduynam_799",
    "https://www.threads.net/@tuandungxeghephue",
    "https://www.threads.net/@xeghep_hue_danang",
    "https://www.threads.net/@xeghephanoi",
]

tu_khoa_tim_kiem_threads = [
    "xe tiện chuyến",
    "xe ghép hà nội",
    "xe ghép đà nẵng",
    "tiện chuyến",
    "ghép xe",
    "tìm xe ghép",
    "cần xe ghép",
    "xe ghép thái bình",
    "xe ghép hải phòng",
    "xe ghép nam định",
    "xe ghép quảng ninh",
    "xe ghép thanh hóa",
    "xe ghép ninh bình",
    "xe ghép vĩnh phúc",
    "xe ghép bắc ninh",
    "xe ghép bắc giang",
    "xe ghép phú thọ",
    "xe ghép hải dương",
    "xe ghép hưng yên",
    "xe ghép quảng ngãi",
    "xe ghép sân bay nội bài",
    "xe ghép sân bay",
    "xe ghép huế",
    "xe ghép sài gòn",
]

# ============================================================
# BỘ LỌC CHUẨN XÁC
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
# TRÍCH XUẤT NỘI DUNG TỪ THREADS
# ============================================================
def extract_threads_posts(html_content: str):
    """Trích xuất văn bản bài viết từ cấu trúc SSR hoặc JSON script của Threads."""
    posts = []
    seen = set()

    # 1. Tìm các script chứa JSON data
    script_matches = re.findall(r'<script[^>]*type=[\'"]application/json[\'"][^>]*>(.*?)</script>', html_content, flags=re.DOTALL)
    for s in script_matches:
        try:
            # Tìm các chuỗi text / caption trong JSON
            # Pattern thường gặp: "text":"..." hoặc "caption":{"text":"..."}
            for text_match in re.finditer(r'"text"\s*:\s*"((?:\\.|[^"\\])*)"', s):
                raw = text_match.group(1)
                try:
                    decoded = json.loads(f'"{raw}"')
                except Exception:
                    decoded = raw.encode().decode('unicode-escape', errors='ignore')
                
                decoded = html.unescape(decoded).strip()
                if 25 <= len(decoded) <= 1200 and decoded not in seen:
                    seen.add(decoded)
                    posts.append(decoded)
        except Exception:
            pass

    # 2. Quét các thẻ div / span có chứa nội dung bài viết
    span_matches = re.findall(r'<span[^>]*dir=[\'"]auto[\'"][^>]*>(.*?)</span>', html_content, flags=re.DOTALL)
    for sm in span_matches:
        clean = re.sub(r'<[^>]+>', ' ', sm)
        clean = html.unescape(clean).strip()
        if 25 <= len(clean) <= 1200 and clean not in seen:
            seen.add(clean)
            posts.append(clean)

    return posts


# ============================================================
# CLIENT THREADS HTTP
# ============================================================
class ThreadsHTTPCrawler:
    def __init__(self):
        self.session = requests.Session() if requests else None
        self.headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
        }
        if THREADS_COOKIE:
            self.headers["Cookie"] = THREADS_COOKIE

    def get_html(self, url: str) -> str:
        if requests:
            try:
                resp = self.session.get(url, headers=self.headers, timeout=15, verify=False)
                return resp.text
            except Exception:
                pass
        req = urllib_req.Request(url, headers=self.headers)
        with urllib_req.urlopen(req, timeout=15, context=_ssl_context) as resp:
            return resp.read().decode("utf-8", errors="ignore")

    def gui_bai(self, text: str) -> str:
        payload = {
            "noi_dung_tho": text,
            "nguon": "threads",
            "thoi_gian_tao": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        try:
            if requests:
                r = requests.post(BACKEND_API_URL, json=payload, timeout=25, verify=False)
                if r.status_code == 200:
                    try:
                        body = r.json()
                        return "dup" if body.get("trung") else "new"
                    except Exception:
                        return "new"
                return "err"
        except Exception:
            pass
        try:
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib_req.Request(BACKEND_API_URL, data=data_bytes, headers={"Content-Type": "application/json"})
            with urllib_req.urlopen(req, timeout=10, context=_ssl_context) as r:
                if r.status == 200:
                    try:
                        body = json.loads(r.read().decode("utf-8", errors="ignore"))
                        return "dup" if body.get("trung") else "new"
                    except Exception:
                        return "new"
                return "err"
        except Exception as e:
            print(f"⚠️ Lỗi gửi bài Threads về Backend ({BACKEND_API_URL}): {e}")
            return "err"

    def _quet_mot_url(self, url: str, label: str) -> tuple:
        moi_count = 0
        tong_count = 0
        print(f"\n{label}...")
        try:
            html_code = self.get_html(url)
            bai_viets = extract_threads_posts(html_code)

            hop_le = []
            for b in bai_viets:
                if kiem_tra_bai_viet_hop_le(b):
                    if not any(b in exist or exist in b for exist in hop_le):
                        hop_le.append(b)

            for b in hop_le:
                st = self.gui_bai(b)
                if st == "new":
                    moi_count += 1
            tong_count = len(hop_le)
            print(f"✅ Tìm thấy {tong_count} bài đạt chuẩn ({moi_count} bài mới lưu DB) từ {url}.")
        except Exception as e:
            print(f"⚠️ Lỗi quét Threads {url}: {e}")
        return moi_count, tong_count

    def chay(self):
        min_new_target = int(os.getenv("MIN_NEW_POSTS_PER_CYCLE", "6"))
        print("=" * 65)
        print("🚀 KHỞI ĐỘNG BOT THREADS SIÊU NHẸ (HTTP REQUESTS)")
        print(f"📡 Backend Endpoint: {BACKEND_API_URL}")
        print(f"🎯 Mục tiêu mỗi chu kỳ: tối thiểu {min_new_target} bài viết MỚI")
        print("=" * 65)

        profile_urls = [u for u in nguon_cong_khai_threads if "/@" in u]
        tag_urls = [u for u in nguon_cong_khai_threads if "/tag/" in u]

        while True:
            tong_bai_moi = 0
            tong_bai_gui = 0

            # 1. Quét toàn bộ danh sách từ khóa tìm kiếm (mở rộng hết 24 từ khóa, không cắt [:6])
            for kw in tu_khoa_tim_kiem_threads:
                kw_enc = urllib.parse.quote(kw)
                url = f"https://www.threads.net/search?q={kw_enc}&serp_type=default"
                moi, tong = self._quet_mot_url(url, f"🔍 [TÌM KIẾM THREADS] Đang quét từ khóa: '{kw}'")
                tong_bai_moi += moi
                tong_bai_gui += tong
                sleep(2.5)

            # 2. Quét các tài khoản nhà xe công khai
            for url in profile_urls:
                moi, tong = self._quet_mot_url(url, f"🚀 [TÀI KHOẢN THREADS] Đang quét: {url}")
                tong_bai_moi += moi
                tong_bai_gui += tong
                sleep(2.5)

            # 3. Nếu chưa đạt mục tiêu tối thiểu 6 bài mới -> quét sâu thêm chế độ recent & các trang tag
            if tong_bai_moi < min_new_target:
                print(f"\n🔄 Hiện mới có {tong_bai_moi}/{min_new_target} bài mới — mở rộng quét chế độ bài mới nhất (recent)...")
                for kw in tu_khoa_tim_kiem_threads:
                    if tong_bai_moi >= min_new_target:
                        break
                    kw_enc = urllib.parse.quote(kw)
                    url = f"https://www.threads.net/search?q={kw_enc}&serp_type=default&filter=recent"
                    moi, tong = self._quet_mot_url(url, f"🆕 [RECENT THREADS] Quét bài mới nhất: '{kw}'")
                    tong_bai_moi += moi
                    tong_bai_gui += tong
                    sleep(2.5)

            if tong_bai_moi < min_new_target:
                for url in tag_urls:
                    if tong_bai_moi >= min_new_target:
                        break
                    moi, tong = self._quet_mot_url(url, f"🏷️ [TAG THREADS] Đang quét: {url}")
                    tong_bai_moi += moi
                    tong_bai_gui += tong
                    sleep(2.5)

            phut_nghi = round(CRAWL_INTERVAL_SECONDS / 60)
            print(f"\n🎉 Hoàn thành chu kỳ quét Threads ({tong_bai_moi} bài MỚI lưu DB / {tong_bai_gui} bài hợp lệ; mục tiêu >= {min_new_target}). Nghỉ {phut_nghi} phút ({CRAWL_INTERVAL_SECONDS}s)...")
            _start_sleep = time.time()
            while time.time() - _start_sleep < CRAWL_INTERVAL_SECONDS:
                sleep(5)


if __name__ == "__main__":
    crawler = ThreadsHTTPCrawler()
    crawler.chay()
