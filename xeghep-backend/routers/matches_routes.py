from typing import Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException
from database import get_db, get_next_id
from auth import current_user, require_admin
from utils import _tao_link_zalo
from matching_service import run_matching

router = APIRouter(tags=["Matches"])


class ReviewIn(BaseModel):
    so_sao: int = Field(ge=1, le=5)
    nhan_xet: Optional[str] = ""


@router.get("/api/matches")
async def list_matches(mine: int = 0, user=Depends(current_user)):
    with get_db() as db:
        if mine:
            rows = db.execute(
                """SELECT kq.*, cx.tai_xe_id, cx.tai_xe_ten, cx.sdt AS cx_sdt, cx.sdt AS tx_sdt,
                          cx.diem_di AS cx_diem_di, cx.diem_den AS cx_diem_den,
                          cx.thoi_gian_chay, cx.thoi_gian_chay AS cx_thoi_gian,
                          yc.hanh_khach_id, yc.hanh_khach_ten, yc.sdt AS yc_sdt,
                          yc.diem_di AS yc_diem_di, yc.diem_den AS yc_diem_den,
                          yc.thoi_gian_don AS yc_thoi_gian, yc.so_khach
                   FROM ket_qua_ghep kq
                   JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
                   JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
                   WHERE cx.tai_xe_id = ? OR yc.hanh_khach_id = ?
                   ORDER BY kq.id DESC""",
                (user["id"], user["id"]),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT kq.*, cx.tai_xe_id, cx.tai_xe_ten, cx.sdt AS cx_sdt, cx.sdt AS tx_sdt,
                          cx.diem_di AS cx_diem_di, cx.diem_den AS cx_diem_den,
                          cx.thoi_gian_chay, cx.thoi_gian_chay AS cx_thoi_gian,
                          yc.hanh_khach_id, yc.hanh_khach_ten, yc.sdt AS yc_sdt,
                          yc.diem_di AS yc_diem_di, yc.diem_den AS yc_diem_den,
                          yc.thoi_gian_don AS yc_thoi_gian, yc.so_khach
                   FROM ket_qua_ghep kq
                   JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
                   JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
                   ORDER BY kq.id DESC"""
            ).fetchall()

    res = [dict(r) for r in rows]
    for m in res:
        m["zalo_url_tai_xe"] = _tao_link_zalo(m.get("cx_sdt"))
        m["zalo_url_hanh_khach"] = _tao_link_zalo(m.get("yc_sdt"))
    return res


@router.post("/api/matches/{match_id}/complete")
async def complete_match(match_id: int, user=Depends(current_user)):
    """Hành khách hoặc tài xế xác nhận hoàn thành chuyến đi."""
    with get_db() as db:
        match = db.execute(
            """SELECT kq.*, cx.tai_xe_id, yc.hanh_khach_id, yc.id AS yc_id, cx.id AS cx_id
               FROM ket_qua_ghep kq
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               WHERE kq.id = ?""",
            (match_id,),
        ).fetchone()
        if not match:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin ghép chuyến")
        m = dict(match)
        if user["role"] != "admin" and user["id"] not in (m["tai_xe_id"], m["hanh_khach_id"]):
            raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác trên chuyến đi này")
        if m["trang_thai"] == "hoan_thanh":
            return {"message": "Chuyến đi này đã được xác nhận hoàn thành trước đó", "id": match_id, "trang_thai": "hoan_thanh"}
        if m["trang_thai"] == "da_huy":
            raise HTTPException(status_code=400, detail="Chuyến đi này đã bị hủy, không thể xác nhận hoàn thành")

        db.execute("UPDATE ket_qua_ghep SET trang_thai = 'hoan_thanh' WHERE id = ?", (match_id,))
        db.execute("UPDATE yeu_cau SET trang_thai = 'hoan_thanh' WHERE id = ?", (m["yc_id"],))

        # Xe đã chạy xong và hoàn tất chuyến chở khách này.
        # Khi không còn khách nào khác đang trên xe chờ hoàn thành (cnt == 0):
        # Toàn bộ chuyến xe chính thức HOÀN THÀNH, đóng số ghế trống về 0.
        rem = db.execute(
            "SELECT COUNT(*) AS cnt FROM ket_qua_ghep WHERE chuyen_xe_id = ? AND trang_thai NOT IN ('hoan_thanh', 'da_huy')",
            (m["cx_id"],),
        ).fetchone()
        cnt = rem["cnt"] if isinstance(rem, dict) else rem[0]
        if cnt == 0:
            db.execute("UPDATE chuyen_xe SET trang_thai = 'hoan_thanh', so_ghe_trong = 0 WHERE id = ?", (m["cx_id"],))

    return {"message": "Đã xác nhận hoàn thành chuyến đi thành công!", "id": match_id, "trang_thai": "hoan_thanh"}


@router.post("/api/matches/{match_id}/review")
async def review_match(match_id: int, data: ReviewIn, user=Depends(current_user)):
    """Hành khách đánh giá dịch vụ tài xế sau chuyến đi (1-5 sao kèm nhận xét)."""
    with get_db() as db:
        match = db.execute(
            """SELECT kq.*, cx.tai_xe_id, cx.id AS cx_id, yc.hanh_khach_id, yc.id AS yc_id
               FROM ket_qua_ghep kq
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               WHERE kq.id = ?""",
            (match_id,),
        ).fetchone()
        if not match:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến ghép")
        m = dict(match)
        if user["role"] != "admin" and user["id"] != m["hanh_khach_id"]:
            raise HTTPException(status_code=403, detail="Chỉ hành khách của chuyến đi này mới có quyền đánh giá tài xế")
        
        # 1. Cập nhật kết quả ghép sang hoàn thành và lưu sao/nhận xét
        db.execute(
            """UPDATE ket_qua_ghep 
               SET danh_gia_sao = ?, nhan_xet = ?, trang_thai = 'hoan_thanh' 
               WHERE id = ?""",
            (data.so_sao, data.nhan_xet.strip() if data.nhan_xet else "", match_id)
        )
        db.execute("UPDATE yeu_cau SET trang_thai = 'hoan_thanh' WHERE id = ?", (m["yc_id"],))

        # 2. Lưu vào bảng danh_gia (cập nhật nếu đã có, thêm mới nếu chưa)
        existing_dg = db.execute("SELECT id FROM danh_gia WHERE ghep_id = ?", (match_id,)).fetchone()
        if existing_dg:
            dg_id = existing_dg["id"] if isinstance(existing_dg, dict) else existing_dg[0]
            db.execute(
                """UPDATE danh_gia 
                   SET so_sao = ?, nhan_xet = ?, thoi_gian = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (data.so_sao, data.nhan_xet.strip() if data.nhan_xet else "", dg_id),
            )
        else:
            next_dg_id = get_next_id(db, "danh_gia")
            kh_ten = user.get("ho_ten") or "Hành khách"
            db.execute(
                """INSERT INTO danh_gia (id, ghep_id, chuyen_xe_id, tai_xe_id, khach_hang_id, khach_hang_ten, so_sao, nhan_xet)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (next_dg_id, match_id, m["cx_id"], m.get("tai_xe_id"), user["id"], kh_ten, data.so_sao, data.nhan_xet.strip() if data.nhan_xet else "")
            )

        # 3. Khi khách hoàn thành và không còn khách nào khác đang trên xe chờ hoàn thành (cnt == 0):
        # Chuyến xe chính thức hoàn tất, đóng ghế trống về 0.
        rem = db.execute(
            "SELECT COUNT(*) AS cnt FROM ket_qua_ghep WHERE chuyen_xe_id = ? AND trang_thai NOT IN ('hoan_thanh', 'da_huy')",
            (m["cx_id"],),
        ).fetchone()
        cnt = rem["cnt"] if isinstance(rem, dict) else rem[0]
        if cnt == 0:
            db.execute("UPDATE chuyen_xe SET trang_thai = 'hoan_thanh', so_ghe_trong = 0 WHERE id = ?", (m["cx_id"],))

    return {
        "message": "Cảm ơn bạn đã gửi đánh giá chuyến đi!",
        "id": match_id,
        "so_sao": data.so_sao,
        "nhan_xet": data.nhan_xet
    }


@router.get("/api/drivers/{driver_id}/rating")
async def get_driver_rating(driver_id: int):
    """Lấy điểm đánh giá trung bình và danh sách nhận xét thực tế của tài xế."""
    with get_db() as db:
        stats = db.execute(
            """SELECT COUNT(*) AS total_reviews, AVG(so_sao) AS avg_stars
               FROM danh_gia
               WHERE tai_xe_id = ?""",
            (driver_id,)
        ).fetchone()
        
        reviews = db.execute(
            """SELECT id, ghep_id, khach_hang_ten, so_sao, nhan_xet, thoi_gian
               FROM danh_gia
               WHERE tai_xe_id = ?
               ORDER BY id DESC LIMIT 20""",
            (driver_id,)
        ).fetchall()

    s = dict(stats) if stats else {}
    avg = round(float(s.get("avg_stars") or 0.0), 1)
    tot = int(s.get("total_reviews") or 0)
    rev_list = [dict(r) for r in reviews]
    return {
        "tai_xe_id": driver_id,
        "diem_trung_binh": avg,
        "tong_danh_gia": tot,
        "danh_sach": rev_list
    }


@router.post("/api/matches/{match_id}/cancel")
async def cancel_match(match_id: int, user=Depends(current_user)):
    """Hành khách hoặc tài xế hủy chuyến — tự động hoàn trả số ghế trống lên web."""
    with get_db() as db:
        match = db.execute(
            """SELECT kq.*, cx.tai_xe_id, cx.so_ghe_trong, cx.trang_thai AS cx_trang_thai,
                      yc.hanh_khach_id, yc.so_khach, yc.id AS yc_id, cx.id AS cx_id
               FROM ket_qua_ghep kq
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               WHERE kq.id = ?""",
            (match_id,),
        ).fetchone()
        if not match:
            raise HTTPException(status_code=404, detail="Không tìm thấy thông tin ghép chuyến")
        m = dict(match)
        if user["role"] != "admin" and user["id"] not in (m["tai_xe_id"], m["hanh_khach_id"]):
            raise HTTPException(status_code=403, detail="Bạn không có quyền hủy chuyến đi này")
        if m["trang_thai"] == "da_huy":
            return {"message": "Chuyến này đã được hủy trước đó", "id": match_id, "trang_thai": "da_huy"}
        if m["trang_thai"] == "hoan_thanh":
            raise HTTPException(status_code=400, detail="Chuyến đi đã hoàn thành, không thể hủy")

        # 1. Đổi trạng thái ghép chuyến và yêu cầu thành da_huy
        db.execute("UPDATE ket_qua_ghep SET trang_thai = 'da_huy' WHERE id = ?", (match_id,))
        db.execute("UPDATE yeu_cau SET trang_thai = 'da_huy' WHERE id = ?", (m["yc_id"],))

        # 2. Hoàn trả lại số lượng ghế trống cho chuyến xe trên web
        so_khach_tra = int(m.get("so_khach") or 1)
        cur_ghe = int(m.get("so_ghe_trong") or 0)
        new_ghe = cur_ghe + so_khach_tra

        db.execute(
            """UPDATE chuyen_xe 
               SET so_ghe_trong = ?, 
                   trang_thai = CASE WHEN trang_thai IN ('da_day', 'hoan_thanh') THEN 'con_ghe' ELSE trang_thai END
               WHERE id = ?""",
            (new_ghe, m["cx_id"]),
        )

    return {
        "message": f"Đã hủy chuyến thành công! Đã hoàn trả {so_khach_tra} chỗ lên hệ thống (số ghế trống hiện tại: {new_ghe}).",
        "id": match_id,
        "trang_thai": "da_huy",
        "so_ghe_trong": new_ghe,
    }


@router.post("/api/matching/run")
async def api_run_matching(admin=Depends(require_admin)):
    count = run_matching()
    return {"message": f"Đã tạo {count} cặp ghép mới", "cap_ghep_moi": count}
