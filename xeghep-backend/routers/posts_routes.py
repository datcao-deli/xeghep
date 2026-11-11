from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from datetime import datetime
import re
from typing import Optional

from database import get_db, get_next_id
from auth import current_user, require_admin
from ai_service import process_pending_posts
from matching_service import run_matching, reindex_database_ids
from models import PostIn, CrawlerPostIn, PostUpdate

router = APIRouter(tags=["Posts"])


def _xu_ly_ngay():
    ket_qua = process_pending_posts()
    so_ghep = run_matching()
    print(f"[xử lý ngay] Đã xử lý {ket_qua['da_xu_ly']} bài viết, lỗi {ket_qua['loi']}, "
          f"tạo thêm {so_ghep} cặp ghép mới.")


def _bai_viet_co_ngay_qua_khu(text: str) -> bool:
    """Kiểm tra bài viết có chứa mốc thời gian cũ trên MXH (N ngày/tuần/tháng/năm, hôm qua) hoặc ngày dd/mm đã qua."""
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


def normalize_text_for_dedup(text: str) -> str:
    """Chuẩn hóa văn bản để loại trừ trùng lặp tuyệt đối (loại bỏ nbsp, khoảng trắng thừa, mốc thời gian nhảy trên MXH)."""
    t = text.replace("\u00a0", " ").replace("&nbsp;", " ")
    t = re.sub(r'\b\d+\s*(?:giờ|phút|ngày|tuần|tháng|h|m|s|giây)\b', '', t, flags=re.IGNORECASE)
    t = re.sub(r'\s+', ' ', t).strip().lower()
    return t


@router.post("/api/posts")
async def create_post(data: PostIn, background_tasks: BackgroundTasks, user=Depends(current_user)):
    if len(data.noi_dung_tho.strip()) < 10:
        raise HTTPException(status_code=400, detail="Nội dung quá ngắn để trích xuất")
    with get_db() as db:
        next_pid = get_next_id(db, "bai_viet_tho")
        db.execute(
            "INSERT INTO bai_viet_tho (id, nguoi_dang_id, noi_dung_tho, nguon) VALUES (?,?,?,?)",
            (next_pid, user["id"], data.noi_dung_tho.strip(), "form"),
        )
        pid = next_pid
    background_tasks.add_task(_xu_ly_ngay)
    return {"message": "Đã ghi nhận bài viết, hệ thống đang tự động xử lý...", "id": pid}


@router.get("/api/posts")
async def list_posts(admin=Depends(require_admin)):
    with get_db() as db:
        posts = [
            dict(r) for r in db.execute(
                """SELECT * FROM bai_viet_tho 
                   WHERE noi_dung_tho NOT LIKE '[Đặt xe trực tiếp]%' 
                     AND noi_dung_tho NOT LIKE '[Tài xế nhận đón]%'
                   ORDER BY id DESC"""
            ).fetchall()
        ]
        trips_lookup = {r["bai_viet_id"]: r["thoi_gian_chay"] for r in db.execute("SELECT bai_viet_id, thoi_gian_chay FROM chuyen_xe WHERE bai_viet_id IS NOT NULL").fetchall()}
        reqs_lookup = {r["bai_viet_id"]: r["thoi_gian_don"] for r in db.execute("SELECT bai_viet_id, thoi_gian_don FROM yeu_cau WHERE bai_viet_id IS NOT NULL").fetchall()}
    for p in posts:
        pid = p["id"]
        if pid in trips_lookup:
            p["thoi_gian_lich"] = trips_lookup[pid]
            p["loai_trich_xuat"] = "chuyen_xe"
        elif pid in reqs_lookup:
            p["thoi_gian_lich"] = reqs_lookup[pid]
            p["loai_trich_xuat"] = "yeu_cau"
        else:
            p["thoi_gian_lich"] = None
            p["loai_trich_xuat"] = None
    return posts


@router.post("/api/crawler/posts")
async def receive_crawler_post(data: CrawlerPostIn, background_tasks: BackgroundTasks):
    noi_dung = data.noi_dung_tho.strip()
    if len(noi_dung) < 10:
        raise HTTPException(status_code=400, detail="Nội dung quá ngắn")

    if _bai_viet_co_ngay_qua_khu(noi_dung):
        return {"message": "Bỏ qua bài viết cũ quá ngày", "trung": True, "qua_han": True}

    norm_new = normalize_text_for_dedup(noi_dung)

    with get_db() as db:
        # 1. Kiểm tra trùng chuỗi thô
        trung = db.execute(
            "SELECT id FROM bai_viet_tho WHERE noi_dung_tho = ? LIMIT 1",
            (noi_dung,),
        ).fetchone()
        if trung:
            return {"message": "Bài đã tồn tại, bỏ qua trùng", "id": trung["id"], "trung": True}

        # 2. Kiểm tra trùng theo nội dung đã chuẩn hóa và độ tương đồng
        existing_posts = db.execute("SELECT id, noi_dung_tho FROM bai_viet_tho ORDER BY id DESC LIMIT 200").fetchall()
        for ep in existing_posts:
            norm_exist = normalize_text_for_dedup(ep["noi_dung_tho"])
            if norm_new == norm_exist or (len(norm_new) > 40 and (norm_new in norm_exist or norm_exist in norm_new)):
                return {"message": "Bài đã tồn tại (trùng nội dung chuẩn hóa)", "id": ep["id"], "trung": True}

        next_pid = get_next_id(db, "bai_viet_tho")
        db.execute(
            "INSERT INTO bai_viet_tho (id, noi_dung_tho, nguon, thoi_gian_tao) VALUES (?,?,?,?)",
            (next_pid, noi_dung, data.nguon, data.thoi_gian_tao or datetime.now().isoformat(timespec="seconds")),
        )
        pid = next_pid

    background_tasks.add_task(_xu_ly_ngay)
    return {"message": "Đã tiếp nhận và xử lý ngay bài viết mới nhất", "id": pid, "trung": False}


@router.post("/api/posts/{post_id:int}/retry")
async def retry_post(post_id: int, background_tasks: BackgroundTasks, admin=Depends(require_admin)):
    with get_db() as db:
        row = db.execute("SELECT id FROM bai_viet_tho WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        db.execute("DELETE FROM chuyen_xe WHERE bai_viet_id = ?", (post_id,))
        db.execute("DELETE FROM yeu_cau WHERE bai_viet_id = ?", (post_id,))
        db.execute("UPDATE bai_viet_tho SET da_xu_ly = 0, ghi_chu_loi = NULL WHERE id = ?", (post_id,))
    background_tasks.add_task(_xu_ly_ngay)
    return {"message": f"Đã đưa bài viết #{post_id} vào hàng đợi xử lý lại thành công"}


@router.put("/api/posts/{post_id:int}")
async def update_post(post_id: int, data: PostUpdate, admin=Depends(require_admin)):
    noi_dung = data.noi_dung_tho.strip()
    if len(noi_dung) < 10:
        raise HTTPException(status_code=400, detail="Nội dung quá ngắn")
    with get_db() as db:
        row = db.execute("SELECT id FROM bai_viet_tho WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        db.execute("DELETE FROM chuyen_xe WHERE bai_viet_id = ?", (post_id,))
        db.execute("DELETE FROM yeu_cau WHERE bai_viet_id = ?", (post_id,))
        db.execute(
            "UPDATE bai_viet_tho SET noi_dung_tho = ?, da_xu_ly = 0, ghi_chu_loi = NULL WHERE id = ?",
            (noi_dung, post_id),
        )
    result = process_pending_posts()
    matched = run_matching()
    return {"message": f"Đã cập nhật bài viết #{post_id} và xử lý AI", **result, "cap_ghep_moi": matched}


@router.delete("/api/posts/{post_id:int}")
async def delete_post(post_id: int, admin=Depends(require_admin)):
    with get_db() as db:
        row = db.execute("SELECT id FROM bai_viet_tho WHERE id = ?", (post_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Không tìm thấy bài viết")
        db.execute("DELETE FROM chuyen_xe WHERE bai_viet_id = ?", (post_id,))
        db.execute("DELETE FROM yeu_cau WHERE bai_viet_id = ?", (post_id,))
        db.execute("DELETE FROM bai_viet_tho WHERE id = ?", (post_id,))

    # Tự động sắp xếp lại toàn bộ ID bài viết và chuyến xe ngay khi xóa
    reindex_database_ids()
    return {"message": f"Đã xóa bài viết #{post_id} và tự động sắp xếp lại ID"}


@router.post("/api/posts/retry-all")
async def retry_all_posts(background_tasks: BackgroundTasks, admin=Depends(require_admin)):
    with get_db() as db:
        reset = db.execute(
            "UPDATE bai_viet_tho SET da_xu_ly = 0, ghi_chu_loi = NULL WHERE da_xu_ly = 2"
        )
        count = reset.rowcount
    background_tasks.add_task(_xu_ly_ngay)
    return {
        "message": f"Đã đưa {count} bài lỗi vào hàng đợi xử lý lại thành công.",
        "so_bai_thu_lai": count,
        "da_xu_ly": count,
    }


@router.post("/api/posts/process-now")
async def process_now(background_tasks: BackgroundTasks, admin=Depends(require_admin)):
    background_tasks.add_task(_xu_ly_ngay)
    return {"message": "Đã bắt đầu tiến trình xử lý AI và ghép chuyến tự động", "da_xu_ly": 0}


@router.post("/api/posts/reindex-ids")
async def api_reindex_ids(admin=Depends(require_admin)):
    return reindex_database_ids()
