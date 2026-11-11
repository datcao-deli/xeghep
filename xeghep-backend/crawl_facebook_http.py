import os
import sys
import re
import html
import time
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
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

try:
    sys.stdout.reconfigure(line_buffering=True)
except Exception:
    pass

# ============================================================
# CẤU HÌNH & NGUỒN DỮ LIỆU
import ssl
try:
    _ssl_context = ssl._create_unverified_context()
except Exception:
    _ssl_context = None

def load_fb_cookie() -> str:
    cookie_val = os.getenv("FB_COOKIE", "").strip()
    if not cookie_val:
        cookie_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fb_cookies_extracted.txt")
        if os.path.exists(cookie_file):
            try:
                with open(cookie_file, "r", encoding="utf-8") as f:
                    cookie_val = f.read().strip()
            except Exception:
                pass
    return cookie_val

_backend_port = os.getenv("PORT", "8000")
_default_api_url = f"http://127.0.0.1:{_backend_port}/api/crawler/posts"
_env_api_url = os.getenv("BACKEND_API_URL", "").strip()
if os.getenv("PORT") and "8000" in _env_api_url:
    BACKEND_API_URL = _default_api_url
else:
    BACKEND_API_URL = _env_api_url or _default_api_url

FB_COOKIE = load_fb_cookie()

# Chu kỳ cào dữ liệu: mặc định 30 phút (1800 giây) để cập nhật bài viết mới liên tục
CRAWL_INTERVAL_SECONDS = int(os.getenv("FB_CRAWL_INTERVAL", os.getenv("CRAWL_INTERVAL_SECONDS", "1800")))

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1"
)

# Danh sách nhóm xe ghép ưu tiên (mã định danh nhóm hoặc đường dẫn tương thích mbasic)
danh_sach_nhom_facebook = [
    "hoixeghepdanangtamky",
    "xeghephaiphonghanoi",
    "xeghepnamdinhhanoi",
    "2483842328574676",
    "xeghepthaibinh",
    "xeghepbacninh",
    "xeghephungyen",
    "xeghepninhbinhhanoi",
    "xeghephanoivinhphuc",
    "xeghephanoiphutho",
    "xeghephanoithainguyen",
    "xeghephuequangnamdanang",
    "xeghepsaigonvungtau",
    "xetienchuyendanangtamky",
    "xeghepquangngaidanang",
]

# Danh sách từ khóa tìm kiếm
tu_khoa_tim_kiem = [
    "xe ghép",
    "tiện chuyến",
    "tìm xe ghép",
    "cần xe ghép",
    "ghép xe",
    "xe ghép hà nội",
    "xe ghép đà nẵng",
    "xe ghép hải phòng",
    "xe ghép nam định",
    "xe ghép thái bình",
    "xe ghép quảng ninh",
    "xe ghép thanh hóa",
    "xe ghép bắc ninh",
]

# ============================================================
# BỘ LỌC BÀI VIẾT CHẤT LƯỢNG CAO (GIỮ NGUYÊN 100% TỪ BẢN CŨ)
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

    # 1. TUYỆT ĐỐI LOẠI TRỪ THẺ DANH THIẾP / NÚT KẾT BẠN / NHẮN TIN
    if ("kết bạn" in text_lower and "nhắn tin" in text_lower) or any(
        card_kw in text_lower for card_kw in [
            "danh thiếp", "chia sẻ danh thiếp", "gửi danh thiếp", "cuộc gọi thoại", 
            "cuộc gọi video", "tin nhắn đã được thu hồi", "đã gửi một danh thiếp"
        ]
    ):
        return False

    # 2. Loại bỏ bài rác, mua bán xe, du lịch, tuyển dụng, phòng trọ
    if any(cam in text_lower for cam in tu_khoa_cam):
        return False

    # 3. BẮT BUỘC CÓ SỐ ĐIỆN THOẠI
    text_sdt_clean = re.sub(r'[\.\s\-\(\)]', '', text)
    sdt_match = re.search(r'(?:0|84|\+84)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}', text_sdt_clean)
    if not sdt_match:
        return False

    # 4. Phải chứa từ khóa liên quan đến xe ghép
    if not any(kw in text_lower for kw in tu_khoa_di_chuyen):
        return False

    # 5. BẮT BUỘC CÓ ĐIỂM ĐI VÀ ĐIỂM ĐẾN
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
# BỘ BÓC TÁCH HTML SIÊU NHẸ (HỖ TRỢ BS4 HOẶC REGEX THUẦN)
# ============================================================
def strip_tags(html_str: str) -> str:
    """Xóa sạch thẻ HTML, decode ký tự đặc biệt, chuẩn hóa khoảng trắng."""
    clean = re.sub(r'<script.*?</script>', ' ', html_str, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'<style.*?</style>', ' ', clean, flags=re.DOTALL | re.IGNORECASE)
    clean = re.sub(r'<br\s*/?>', '\n', clean, flags=re.IGNORECASE)
    clean = re.sub(r'</p>', '\n', clean, flags=re.IGNORECASE)
    clean = re.sub(r'</div>', '\n', clean, flags=re.IGNORECASE)
    clean = re.sub(r'<[^>]+>', ' ', clean)
    clean = html.unescape(clean)
    clean = re.sub(r'[ \t]+', ' ', clean)
    lines = [l.strip() for l in clean.splitlines() if l.strip()]
    return "\n".join(lines)


def parse_facebook_posts(html_content: str):
    """Trích xuất bài viết thông minh từ cả mbasic, m.facebook và script JSON SSR."""
    results = []
    seen = set()

    def them_bai(text: str):
        clean = html.unescape(text).strip()
        if 20 <= len(clean) <= 1200 and clean not in seen:
            seen.add(clean)
            results.append(clean)

    # 1. Trích xuất từ các khối JSON script (Facebook Comet / Relay / ServerJS)
    script_matches = re.findall(r'<script[^>]*>(.*?)</script>', html_content, flags=re.DOTALL)
    for s in script_matches:
        if '"text":' in s or '"message":' in s:
            for m in re.finditer(r'"(?:text|message)"\s*:\s*(?:{\s*"text"\s*:\s*)?"((?:\\.|[^"\\]){20,1200})"', s):
                raw = m.group(1)
                try:
                    import json
                    decoded = json.loads(f'"{raw}"')
                except Exception:
                    try:
                        decoded = raw.encode().decode('unicode-escape', errors='ignore')
                    except Exception:
                        decoded = raw
                if any(x in decoded for x in ["relay:operation", "graphql", "Comet"]):
                    continue
                them_bai(decoded)

    # 2. Bóc tách thẻ article / role=article bằng BeautifulSoup nếu có
    if HAS_BS4:
        soup = BeautifulSoup(html_content, "html.parser")
        articles = soup.find_all("div", attrs={"role": "article"})
        if not articles:
            articles = soup.find_all("article")
        if not articles:
            articles = soup.find_all("div", id=re.compile(r"u_0_"))

        for art in articles:
            raw_text = art.get_text(separator="\n").strip()
            raw_text = re.sub(r'\b(Thích|Bình luận|Chia sẻ|Báo cáo|Like|Comment|Share)\b.*$', '', raw_text, flags=re.DOTALL | re.IGNORECASE).strip()
            them_bai(raw_text)
    else:
        matches = re.findall(r'<div[^>]*role=[\'"]article[\'"][^>]*>(.*?)</div>\s*</div>\s*</div>', html_content, flags=re.DOTALL)
        for m in matches:
            text = strip_tags(m)
            text = re.sub(r'\b(Thích|Bình luận|Chia sẻ|Like|Comment|Share)\b.*$', '', text, flags=re.DOTALL | re.IGNORECASE).strip()
            them_bai(text)

    # 3. Quét các thẻ span dir=auto hoặc div có class chứa text
    for sm in re.findall(r'<(?:span|div)[^>]*dir=[\'"]auto[\'"][^>]*>(.*?)</(?:span|div)>', html_content, flags=re.DOTALL):
        clean = strip_tags(sm)
        them_bai(clean)

    # 4. Fallback quét các đoạn văn bản dài có chứa số điện thoại
    if not results:
        plain = strip_tags(html_content)
        chunks = plain.split("\n\n")
        for c in chunks:
            them_bai(c)

    return results


# ============================================================
# CLIENT HTTP & TIẾN TRÌNH CÀO
# ============================================================
class FacebookHTTPCrawler:
    def __init__(self):
        self.session = requests.Session() if requests else None
        self.headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
            "Referer": "https://mbasic.facebook.com/",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }
        cookie_val = load_fb_cookie()
        if cookie_val:
            self.headers["Cookie"] = cookie_val

    def get_page(self, url: str) -> str:
        """Thực hiện request HTTP tải nội dung HTML với độ trễ thấp và bảo vệ phiên."""
        if requests:
            try:
                resp = self.session.get(url, headers=self.headers, timeout=15, allow_redirects=True, verify=False)
                if "login" in resp.url or "checkpoint" in resp.url:
                    print("⚠️ [CẢNH BÁO FB]: Facebook chuyển hướng sang trang đăng nhập/checkpoint. Hãy kiểm tra FB_COOKIE!")
                return resp.text
            except Exception:
                pass
        req = urllib_req.Request(url, headers=self.headers)
        with urllib_req.urlopen(req, timeout=15, context=_ssl_context) as resp:
            return resp.read().decode("utf-8", errors="ignore")

    def gui_bai_viet_ve_backend(self, text: str) -> bool:
        """Gửi bài viết đạt chuẩn về FastAPI Backend."""
        payload = {
            "noi_dung_tho": text,
            "nguon": "facebook",
            "thoi_gian_tao": datetime.now().astimezone().isoformat(timespec="seconds"),
        }
        try:
            if requests:
                r = requests.post(BACKEND_API_URL, json=payload, timeout=25, verify=False)
                return r.status_code == 200
        except Exception:
            pass
        try:
            import json
            data_bytes = json.dumps(payload).encode("utf-8")
            req = urllib_req.Request(BACKEND_API_URL, data=data_bytes, headers={"Content-Type": "application/json"})
            with urllib_req.urlopen(req, timeout=10, context=_ssl_context) as r:
                return r.status == 200
        except Exception as e:
            print(f"⚠️ Lỗi gửi bài về Backend ({BACKEND_API_URL}): {e}")
            return False

    def _quet_danh_sach_url(self, scan_label: str, found_label: str, urls_to_try: list) -> int:
        """Quét lần lượt danh sách URL dự phòng và gửi các bài viết đạt chuẩn về Backend."""
        print(f"\n{scan_label}...")
        for url in urls_to_try:
            try:
                html_code = self.get_page(url)
                bai_viets = parse_facebook_posts(html_code)

                hop_le = []
                for b in bai_viets:
                    if kiem_tra_bai_viet_hop_le(b):
                        if not any(b in exist or exist in b for exist in hop_le):
                            hop_le.append(b)

                if hop_le:
                    print(f"✅ Tìm thấy {len(hop_le)} bài viết đạt chuẩn {found_label}.")
                    for bai in hop_le:
                        self.gui_bai_viet_ve_backend(bai)
                    return len(hop_le)
            except Exception:
                pass
        return 0

    def chay(self):
        print("=" * 65)
        print("🚀 KHỞI ĐỘNG BOT FACEBOOK SIÊU NHẸ (HTTP REQUESTS - CLOUD RENDER)")
        print(f"📡 Backend Endpoint: {BACKEND_API_URL}")
        has_cookie = bool(load_fb_cookie())
        print(f"🔑 Trạng thái Cookie FB: {'Đã cấu hình' if has_cookie else 'Chưa cấu hình (đang cào chế độ công khai)'}")
        print(f"⏱️ Chu kỳ quét dữ liệu: {round(CRAWL_INTERVAL_SECONDS / 60)} phút ({CRAWL_INTERVAL_SECONDS}s / 1 lần)")
        print("=" * 65)

        while True:
            tong_bai_hop_le = 0

            # 1. Quét tìm kiếm từ khóa TRƯỚC (bắt bài diện rộng từ mọi nguồn công khai & trang cá nhân)
            for kw in tu_khoa_tim_kiem:
                q_encoded = urllib.parse.quote(kw)
                urls_to_try = [
                    f"https://mbasic.facebook.com/search/posts?q={q_encoded}&filters=eyJyZWNlbnRfcG9zdHM6MCI6IntcIm5hbWVcIjpcInJlY2VudF9wb3N0c1wiLFwiYXJnc1wiOlwiXCJ9In0%3D",
                    f"https://m.facebook.com/search/posts?q={q_encoded}",
                ]
                tong_bai_hop_le += self._quet_danh_sach_url(
                    f"🔍 [TÌM KIẾM FB] Đang quét từ khóa: '{kw}'",
                    f"với từ khóa '{kw}'",
                    urls_to_try,
                )
                sleep(3)

            # 2. Quét các nhóm xe ghép SAU (quét bổ sung các hội nhóm chỉ định)
            for nhom in danh_sach_nhom_facebook:
                urls_to_try = [
                    f"https://mbasic.facebook.com/groups/{nhom}?sorting_setting=CHRONOLOGICAL",
                    f"https://m.facebook.com/groups/{nhom}",
                ]
                tong_bai_hop_le += self._quet_danh_sach_url(
                    f"🚀 [NHÓM FB] Đang quét: {nhom}",
                    f"từ nhóm {nhom}",
                    urls_to_try,
                )
                sleep(3)


            phut_nghi = round(CRAWL_INTERVAL_SECONDS / 60)
            print(f"\n🎉 Hoàn thành chu kỳ quét Facebook ({tong_bai_hop_le} bài mới gửi về). Nghỉ {phut_nghi} phút ({CRAWL_INTERVAL_SECONDS}s) trước chu kỳ mới...")
            _start_sleep = time.time()
            while time.time() - _start_sleep < CRAWL_INTERVAL_SECONDS:
                sleep(5)


if __name__ == "__main__":
    crawler = FacebookHTTPCrawler()
    crawler.chay()

