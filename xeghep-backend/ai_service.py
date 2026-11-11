import json
import re
import unicodedata
import requests

import config
from database import get_db, get_next_id
from utils import (
    _clean_json_text, _chuan_hoa_ten_dia_diem, _la_dia_danh_hop_le, 
    fallback_rule_extract, classify_ride_post, clean_location_name
)

EXTRACT_PROMPT = """Bạn là bộ trích xuất dữ liệu chuyên nghiệp cho hệ thống xe ghép / xe tiện chuyến. Đọc đoạn văn bản tiếng Việt dưới đây \
và trả về DUY NHẤT một đối tượng JSON, không thêm chữ nào khác, đúng định dạng:

{{
  "loai": "chuyen_xe" hoặc "yeu_cau",
  "diem_di": "địa danh điểm đi cụ thể (viết hoa chuẩn, có dấu)",
  "diem_den": "địa danh điểm đến cụ thể (viết hoa chuẩn, có dấu)",
  "thoi_gian": "giờ/ngày khởi hành nếu có, hoặc null",
  "so_luong": số nguyên (số ghế trống nếu là chuyen_xe, số khách nếu là yeu_cau, mặc định 1),
  "sdt": "số điện thoại liên hệ hợp lệ nếu có trong bài, hoặc null"
}}

QUY TẮC PHÂN LOẠI "loai" (CỰC KỲ QUAN TRỌNG - KHÔNG ĐƯỢC NHẦM LẪN):
1. "chuyen_xe" (TÀI XẾ / NHÀ XE ĐĂNG CHUYẾN):
   - Người đăng là người CÓ XE, nhận chở khách, ghép chuyến, tiện chuyến, bao xe.
   - Dấu hiệu: "bên em có chuyến", "có chuyến", "nhận khách", "đón khách", "chở khách", "ghép xe", "xe 4 chỗ", "xe 5 chỗ", "xe 7 chỗ", "tiện chuyến", "bao xe", "còn trống ghế", "xe chạy", "em chạy", "ai đi liên hệ", "bác nào cần đi alo em".
   - CHÚ Ý: Dù trong bài có chữ "cần đi" hay "tìm khách" (ví dụ: "Ai cần đi alo em", "Em nhận khách, cần tìm khách ghép"), đây VẪN LÀ "chuyen_xe" (vì tài xế kêu gọi hành khách).
   - "so_luong" trong chuyen_xe: là số ghế trống hoặc loại xe (ví dụ: "xe 7 chỗ nhận khách" -> so_luong: 7).

2. "yeu_cau" (HÀNH KHÁCH CẦN TÌM XE):
   - Người đăng CHÍNH LÀ HÀNH KHÁCH đang cần tìm xe để đi, xin slot, cần đón.
   - Dấu hiệu: "mình cần xe", "em cần 1 slot", "cần đi từ...", "có bác nào chạy ... không đón em", "xin 1 ghế", "báo giá hộ em".
   - TUYỆT ĐỐI KHÔNG xếp bài viết của tài xế/nhà xe ("bên em có chuyến", "nhận khách", "xe 7 chỗ"...) vào "yeu_cau"!

3. Tự động dịch và mở rộng các từ viết tắt địa danh phổ biến sang tiếng Việt chuẩn có dấu (không bao gồm từ thừa như "có chuyến", "chiều"):
   - "Đ.Nẵng", "đ.nắng", "đn" -> "Đà Nẵng"
   - "tpht" -> "Hà Tĩnh"
   - "tthk", "hk" -> "Hương Khê"
   - "q.ngãi", "qngai" -> "Quảng Ngãi"
   - "q.nam", "qnam" -> "Quảng Nam"
   - "q.trị", "qtri" -> "Quảng Trị"
   - "q.bình", "qbinh" -> "Quảng Bình"
   - "q.ninh", "qninh" -> "Quảng Ninh"
   - "hn" -> "Hà Nội", "sg", "tphcm" -> "TP. Hồ Chí Minh", "nb" -> "Nội Bài", "plk" -> "Pleiku", "gl" -> "Gia Lai", "bmt" -> "Buôn Ma Thuột"
4. Nếu bài viết KHÔNG PHẢI là tin xe ghép/tiện chuyến (ví dụ: mua bán oto cũ, hỏi kinh nghiệm du lịch, tuyển dụng, phòng trọ, review), hoặc KHÔNG CÓ số điện thoại, hoặc KHÔNG xác định được cả Điểm đi và Điểm đến, BẮT BUỘC trả về: {{"loai": null}}.

Văn bản: \"\"\"{text}\"\"\"
"""

def ai_extract(text: str):
    """Trích xuất dữ liệu đa tầng: Gemini (nhanh) -> Groq -> Quy tắc Regex."""
    text_norm = unicodedata.normalize('NFC', unicodedata.normalize('NFKD', text))
    text_norm = re.sub(r'([A-Za-zÀ-Ỹa-zà-ỹ0-9])\.\s+([A-Za-zÀ-Ỹa-zà-ỹ0-9])', r'\1.\2', text_norm)
    if len(text_norm) > 1200:
        text_norm = text_norm[:1200]
        
    prompt = EXTRACT_PROMPT.format(text=text_norm)
    content = ""

    # TẦNG 1: DÙNG DÀN KEY GEMINI VỚI TIMEOUT HỢP LÝ
    try:
        current_key = config.get_next_gemini_key()
        if current_key:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.GEMINI_MODEL}:generateContent?key={current_key}"
            resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=8)
            if resp.ok:
                candidates = resp.json().get("candidates") or []
                parts = candidates[0].get("content", {}).get("parts", []) if candidates else []
                content = parts[0].get("text", "") if parts else ""
    except Exception:
        pass

    # TẦNG 2: NẾU GEMINI CHƯA TRẢ VỀ -> DÙNG GROQ CỨU HỘ
    if not content.strip() and config.GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": config.GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": "Bạn chỉ trả lời bằng JSON hợp lệ."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=6)
            if resp.ok:
                choices = resp.json().get("choices") or []
                content = choices[0].get("message", {}).get("content", "") if choices else ""
        except Exception:
            pass

    # TẦNG 3: GIẢI MÃ JSON HOẶC SỬ DỤNG BỘ QUY TẮC DỰ PHÒNG
    cleaned = _clean_json_text(content) if content else ""
    if cleaned:
        try:
            data = json.loads(cleaned)
            if isinstance(data, dict):
                d_di = str(data.get("diem_di") or "").strip()
                d_den = str(data.get("diem_den") or "").strip()
                if (
                    data.get("loai") in ("chuyen_xe", "yeu_cau")
                    and d_di
                    and d_den
                    and _la_dia_danh_hop_le(d_di)
                    and _la_dia_danh_hop_le(d_den)
                    and data.get("sdt")
                ):
                    return data
        except Exception:
            pass

    # Dự phòng thông minh bằng Regex nếu AI không phản hồi hoặc bỏ sót
    return fallback_rule_extract(text)


def process_pending_posts():
    if not config.processing_lock.acquire(blocking=False):
        return {"da_xu_ly": 0, "loi": 0, "ban_ghi_moi": 0, "bo_qua": "đang có tiến trình khác xử lý"}

    processed, failed, created = 0, 0, 0
    try:
        with get_db() as db:
            rows = db.execute(
                "SELECT * FROM bai_viet_tho WHERE da_xu_ly = 0 ORDER BY id ASC"
            ).fetchall()

        for row in rows:
            post = dict(row)
            try:
                data = ai_extract(post["noi_dung_tho"])
                if not data or not data.get("loai") or not data.get("diem_di") or not data.get("diem_den") or not data.get("sdt"):
                    raise ValueError("Bài viết thiếu Điểm đi, Điểm đến hoặc Số điện thoại liên hệ hợp lệ")

                # Hàng rào bảo vệ tuyệt đối: nếu AI phân loại nhầm là yeu_cau nhưng bài viết rõ ràng là của tài xế/nhà xe
                if data.get("loai") == "yeu_cau":
                    refined_loai = classify_ride_post(post["noi_dung_tho"])
                    if refined_loai == "chuyen_xe":
                        data["loai"] = "chuyen_xe"

                data["diem_di"] = _chuan_hoa_ten_dia_diem(data.get("diem_di"))
                data["diem_den"] = _chuan_hoa_ten_dia_diem(data.get("diem_den"))

                with get_db() as db:
                    nguoi = None
                    if post["nguoi_dang_id"]:
                        nguoi = db.execute("SELECT * FROM users WHERE id=?", (post["nguoi_dang_id"],)).fetchone()

                    if data["loai"] == "chuyen_xe":
                        next_cx_id = get_next_id(db, "chuyen_xe")
                        db.execute(
                            """INSERT INTO chuyen_xe
                               (id, tai_xe_id, tai_xe_ten, diem_di, diem_den, thoi_gian_chay, so_ghe_trong, sdt, bai_viet_id)
                               VALUES (?,?,?,?,?,?,?,?,?)""",
                            (
                                next_cx_id,
                                post["nguoi_dang_id"],
                                nguoi["ho_ten"] if nguoi else "Ẩn danh",
                                data.get("diem_di"), data.get("diem_den"), data.get("thoi_gian"),
                                data.get("so_luong") or 1, data.get("sdt"), post["id"],
                            ),
                        )
                    else:
                        next_yc_id = get_next_id(db, "yeu_cau")
                        db.execute(
                            """INSERT INTO yeu_cau
                               (id, hanh_khach_id, hanh_khach_ten, diem_di, diem_den, thoi_gian_don, so_khach, sdt, bai_viet_id)
                               VALUES (?,?,?,?,?,?,?,?,?)""",
                            (
                                next_yc_id,
                                post["nguoi_dang_id"],
                                nguoi["ho_ten"] if nguoi else "Khách MXH",
                                data.get("diem_di"), data.get("diem_den"), data.get("thoi_gian"),
                                data.get("so_luong") or 1, data.get("sdt"), post["id"],
                            ),
                        )
                    db.execute("UPDATE bai_viet_tho SET da_xu_ly = 1, ghi_chu_loi = NULL WHERE id = ?", (post["id"],))
                created += 1
                processed += 1
            except Exception as e:
                with get_db() as db:
                    db.execute(
                        "UPDATE bai_viet_tho SET da_xu_ly = 2, ghi_chu_loi = ? WHERE id = ?",
                        (str(e)[:300], post["id"]),
                    )
                failed += 1

        return {"da_xu_ly": processed, "loi": failed, "ban_ghi_moi": created}
    finally:
        config.processing_lock.release()
