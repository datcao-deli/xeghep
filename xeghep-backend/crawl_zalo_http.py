import os
import sys
import re
import json
import time
import gzip
import base64
import struct
import hashlib
import secrets
import asyncio
import urllib.parse
from datetime import datetime
from time import sleep

import urllib.request as urllib_req

try:
    import requests
except ImportError:
    requests = None

try:
    import websockets
except ImportError:
    websockets = None

try:
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
except ImportError:
    AES = None
    pad = None
    unpad = None

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
ZALO_IMEI = os.getenv("ZALO_IMEI", "").strip()
ZALO_CLIENT_VERSION = os.getenv("ZALO_CLIENT_VERSION", "698").strip()
ZALO_TYPE = "30"
_ZCID_SECRET = b"3FC4F0D2AB50057BCE0D90D9187A22B1"

# Chu kỳ cào dữ liệu: mặc định 30 phút (1800 giây) để cập nhật bài viết mới liên tục
CRAWL_INTERVAL_SECONDS = int(os.getenv("ZALO_CRAWL_INTERVAL", os.getenv("CRAWL_INTERVAL_SECONDS", "1800")))

DEFAULT_USER_AGENT = os.getenv(
    "ZALO_USER_AGENT",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
).strip()

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
# CLIENT ZALO WEB PROTOCOL (WPA HANDSHAKE + WEBSOCKET AES-GCM)
# ============================================================
def _aes_cbc_encrypt(key_bytes: bytes, plaintext: str, out_hex: bool = False) -> str:
    cipher = AES.new(key_bytes, AES.MODE_CBC, b"\x00" * 16)
    ct = cipher.encrypt(pad(plaintext.encode("utf-8"), 16))
    return ct.hex().upper() if out_hex else base64.b64encode(ct).decode("ascii")


def _aes_cbc_decrypt(key_bytes: bytes, b64_str: str) -> str:
    cipher = AES.new(key_bytes, AES.MODE_CBC, b"\x00" * 16)
    return unpad(cipher.decrypt(base64.b64decode(b64_str)), 16).decode("utf-8")


def _decrypt_ws_payload(data_field, key_b64: str, enc_type: int) -> dict:
    if enc_type == 0:
        return json.loads(data_field) if isinstance(data_field, str) else data_field
    raw = base64.b64decode(data_field)
    if enc_type == 1:
        return json.loads(gzip.decompress(raw).decode("utf-8"))
    iv, aad, ct_tag = raw[:16], raw[16:32], raw[32:]
    cipher = AES.new(base64.b64decode(key_b64), AES.MODE_GCM, nonce=iv)
    cipher.update(aad)
    pt = cipher.decrypt_and_verify(ct_tag[:-16], ct_tag[-16:])
    if enc_type == 2:
        pt = gzip.decompress(pt)
    return json.loads(pt.decode("utf-8"))


def _make_ws_frame(ver: int, cmd: int, sub: int, obj: dict) -> bytes:
    return struct.pack("<BHB", ver, cmd, sub) + json.dumps(obj, separators=(",", ":")).encode("utf-8")


def _extract_msg_text(msg: dict) -> str:
    content = msg.get("content", "")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, dict):
        parts = [
            str(content.get("title") or "").strip(),
            str(content.get("description") or "").strip(),
        ]
        return " ".join(p for p in parts if p).strip()
    return ""


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
        self._seen_msg_ids = set()

    def gui_bai(self, text: str) -> str:
        payload = {
            "noi_dung_tho": text,
            "nguon": "zalo",
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
            print(f"⚠️ Lỗi gửi tin nhắn Zalo về Backend ({BACKEND_API_URL}): {e}")
            return "err"

    def get_login_info(self) -> dict:
        """Gọi wpa.chat.zalo.me/api/login/getLoginInfo để lấy uid, zpw_enk và danh sách WebSocket."""
        if not ZALO_COOKIES or not ZALO_IMEI:
            raise RuntimeError("Thiếu ZALO_COOKIES hoặc ZALO_IMEI trong .env")
        if AES is None:
            raise RuntimeError("Thiếu thư viện pycryptodome (pip install pycryptodome)")

        ts = int(time.time() * 1000)
        zcid_ext = secrets.token_hex(5)
        zcid = _aes_cbc_encrypt(_ZCID_SECRET, f"{ZALO_TYPE},{ZALO_IMEI},{ts}", out_hex=True)
        e1 = hashlib.md5(zcid_ext.encode("utf-8")).hexdigest().upper()
        enc_key = (e1[0::2][:8] + zcid[0::2][:12] + zcid[1::2][::-1][:12]).encode("utf-8")

        payload = json.dumps(
            {"imei": ZALO_IMEI, "computer_name": "Web", "language": "vi", "ts": ts},
            separators=(",", ":"),
        )
        q = {
            "zcid": zcid,
            "zcid_ext": zcid_ext,
            "enc_ver": "v2",
            "params": _aes_cbc_encrypt(enc_key, payload, out_hex=False),
            "type": ZALO_TYPE,
            "client_version": ZALO_CLIENT_VERSION,
            "nretry": "0",
        }
        sign_str = "zsecuregetlogininfo" + "".join(str(q[k]) for k in sorted(q.keys()))
        q["signkey"] = hashlib.md5(sign_str.encode("utf-8")).hexdigest()

        url = "https://wpa.chat.zalo.me/api/login/getLoginInfo"
        if self.session:
            resp = self.session.get(url, params=q, headers=self.headers, timeout=15)
            body = resp.json()
        else:
            full_url = f"{url}?{urllib.parse.urlencode(q)}"
            req = urllib_req.Request(full_url, headers=self.headers)
            with urllib_req.urlopen(req, timeout=15, context=_ssl_context) as r:
                body = json.loads(r.read().decode("utf-8", errors="ignore"))

        if body.get("error_code") != 0 or not body.get("data"):
            raise RuntimeError(f"getLoginInfo thất bại: {body.get('error_code')} - {body.get('error_message')}")

        decrypted = json.loads(_aes_cbc_decrypt(enc_key, body["data"]))
        return decrypted.get("data", {})

    def _ws_connect(self, ws_url: str):
        ws_headers = {
            "Cookie": ZALO_COOKIES,
            "Origin": "https://chat.zalo.me",
            "User-Agent": DEFAULT_USER_AGENT,
        }
        try:
            return websockets.connect(ws_url, additional_headers=ws_headers, ping_interval=None, max_size=4 * 1024 * 1024)
        except TypeError:
            return websockets.connect(ws_url, extra_headers=ws_headers, ping_interval=None, max_size=4 * 1024 * 1024)

    def _extract_group_texts_from_frame(self, dec: dict) -> list:
        d = dec.get("data", dec)
        if not isinstance(d, dict):
            return []
        texts = []
        for list_key in ("groupMsgs", "msgs"):
            items = d.get(list_key)
            if not isinstance(items, list):
                continue
            for m in items:
                if not isinstance(m, dict):
                    continue
                msg_id = str(m.get("msgId") or m.get("cliMsgId") or "")
                if msg_id and msg_id in self._seen_msg_ids:
                    continue
                if msg_id:
                    self._seen_msg_ids.add(msg_id)
                    if len(self._seen_msg_ids) > 5000:
                        self._seen_msg_ids.clear()
                txt = _extract_msg_text(m)
                if txt:
                    texts.append(txt)
        return texts

    async def _poll_once_async(self, ws_base: str) -> list:
        ws_url = f"{ws_base}/?zpw_ver={ZALO_CLIENT_VERSION}&zpw_type={ZALO_TYPE}&t={int(time.time() * 1000)}"
        messages = []
        async with self._ws_connect(ws_url) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            body = json.loads(raw[4:].decode("utf-8"))
            cipher_key = body.get("key")
            if not cipher_key:
                raise RuntimeError("Không nhận được cipher_key từ Zalo WebSocket")

            # Kéo 50 tin nhắn nhóm gần nhất (cmd=511, sub=0)
            await ws.send(_make_ws_frame(1, 511, 0, {"blockId": 0, "globalMsgId": 0, "lastActionId": 0}))
            deadline = time.time() + 6
            while time.time() < deadline:
                try:
                    frame = await asyncio.wait_for(ws.recv(), timeout=2.5)
                except asyncio.TimeoutError:
                    break
                if not isinstance(frame, bytes) or len(frame) < 4:
                    continue
                _, cmd, _ = struct.unpack("<BHB", frame[:4])
                b = json.loads(frame[4:].decode("utf-8"))
                if b.get("data"):
                    try:
                        dec = _decrypt_ws_payload(b["data"], cipher_key, b.get("encrypt", 0))
                        messages.extend(self._extract_group_texts_from_frame(dec))
                    except Exception:
                        pass
                if cmd == 511:
                    break
        return messages

    def poll_recent_messages(self) -> list:
        """Lấy 50 tin nhắn nhóm gần nhất qua giao thức Zalo Web (getLoginInfo + WebSocket cmd=511)."""
        if not ZALO_COOKIES or not ZALO_IMEI:
            print("ℹ️ Thiếu ZALO_COOKIES hoặc ZALO_IMEI trong .env. Hãy cấu hình đủ 2 biến rồi khởi động lại bot.")
            return []
        if AES is None or websockets is None:
            print("⚠️ Thiếu thư viện pycryptodome hoặc websockets. Chạy: pip install pycryptodome websockets")
            return []

        try:
            info = self.get_login_info()
            ws_list = info.get("zpw_ws") or []
            if not ws_list:
                print("⚠️ Không lấy được danh sách zpw_ws từ Zalo getLoginInfo.")
                return []
            return asyncio.run(self._poll_once_async(ws_list[0]))
        except Exception as e:
            print(f"⚠️ Zalo protocol poll error: {e}")
            return []

    def _xu_ly_tin_nhan(self, texts: list) -> tuple:
        hop_le = []
        for m in texts:
            if kiem_tra_bai_viet_hop_le(m):
                if not any(m in exist or exist in m for exist in hop_le):
                    hop_le.append(m)
        moi_count = 0
        for b in hop_le:
            if self.gui_bai(b) == "new":
                moi_count += 1
        return len(hop_le), moi_count

    async def _listen_realtime_async(self, ws_base: str):
        ws_url = f"{ws_base}/?zpw_ver={ZALO_CLIENT_VERSION}&zpw_type={ZALO_TYPE}&t={int(time.time() * 1000)}"
        async with self._ws_connect(ws_url) as ws:
            raw = await asyncio.wait_for(ws.recv(), timeout=10)
            body = json.loads(raw[4:].decode("utf-8"))
            cipher_key = body.get("key")
            if not cipher_key:
                raise RuntimeError("Không nhận được cipher_key từ Zalo WebSocket")

            # Kéo batch tin nhắn nhóm gần nhất ngay khi kết nối
            await ws.send(_make_ws_frame(1, 511, 0, {"blockId": 0, "globalMsgId": 0, "lastActionId": 0}))
            print("🔌 Đã kết nối Zalo WebSocket thành công — đang lắng nghe tin nhắn nhóm thời gian thực...")

            last_ping = time.time()
            while True:
                if time.time() - last_ping >= 45:
                    await ws.send(_make_ws_frame(1, 2, 1, {"eventId": int(time.time() * 1000)}))
                    last_ping = time.time()
                try:
                    frame = await asyncio.wait_for(ws.recv(), timeout=15)
                except asyncio.TimeoutError:
                    continue
                if not isinstance(frame, bytes) or len(frame) < 4:
                    continue
                _, cmd, _ = struct.unpack("<BHB", frame[:4])
                b = json.loads(frame[4:].decode("utf-8"))
                if cmd in (511, 521, 501) and b.get("data"):
                    try:
                        dec = _decrypt_ws_payload(b["data"], cipher_key, b.get("encrypt", 0))
                        texts = self._extract_group_texts_from_frame(dec)
                        if texts:
                            hl, moi = self._xu_ly_tin_nhan(texts)
                            if hl > 0 or cmd == 511:
                                print(f"📩 [Zalo cmd={cmd}] Đọc {len(texts)} tin nhóm → {hl} tin xe ghép ({moi} bài mới lưu DB).")
                    except Exception as e:
                        print(f"⚠️ Lỗi giải mã frame Zalo cmd={cmd}: {e}")

    def chay(self):
        min_new_target = int(os.getenv("MIN_NEW_POSTS_PER_CYCLE", "6"))
        print("=" * 65)
        print("🚀 KHỞI ĐỘNG BOT ZALO SIÊU NHẸ (ZALO WEB PROTOCOL + WEBSOCKET)")
        print(f"📡 Backend Endpoint: {BACKEND_API_URL}")
        print(f"🔑 Cookie Zalo: {'Đã cấu hình' if ZALO_COOKIES else 'Chưa cấu hình'} | IMEI: {'Đã cấu hình' if ZALO_IMEI else 'Chưa cấu hình'}")
        print(f"🎯 Mục tiêu mỗi chu kỳ: tối thiểu {min_new_target} bài viết MỚI")
        print("=" * 65)

        if not ZALO_COOKIES or not ZALO_IMEI:
            print("ℹ️ Thiếu ZALO_COOKIES hoặc ZALO_IMEI trong .env — chờ cấu hình rồi khởi động lại.")
            while True:
                sleep(300)

        while True:
            try:
                info = self.get_login_info()
                uid = info.get("uid", "unknown")
                ws_list = info.get("zpw_ws") or []
                if not ws_list:
                    raise RuntimeError("Danh sách zpw_ws rỗng")
                print(f"✅ Đăng nhập Zalo Web OK (uid={uid}) — kết nối {ws_list[0]}")
                asyncio.run(self._listen_realtime_async(ws_list[0]))
            except Exception as e:
                print(f"⚠️ Mất kết nối Zalo ({e}) — thử kết nối lại sau 15s...")
                sleep(15)


if __name__ == "__main__":
    crawler = ZaloHTTPCrawler()
    crawler.chay()
