from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends

from database import get_db, get_next_id
from models import RequestIn, AcceptRequestIn
from auth import current_user
from utils import _chuan_hoa_ten_dia_diem, _is_date_in_past, get_now_iso, get_now_vn
from matching_service import run_matching

router = APIRouter(tags=["Requests"])

@router.post("/api/requests")
async def create_request(data: RequestIn, user=Depends(current_user)):
    if data.thoi_gian_don and _is_date_in_past(data.thoi_gian_don):
        raise HTTPException(
            status_code=400,
            detail="Thời gian đón đã qua! Vui lòng chọn ngày từ hôm nay trở đi."
        )
    diem_di = _chuan_hoa_ten_dia_diem(data.diem_di)
    diem_den = _chuan_hoa_ten_dia_diem(data.diem_den)
    sdt_clean = (data.sdt or user.get("sdt") or "").strip()
    so_khach = max(1, data.so_khach)
    noi_dung_tho = (
        f"[Đăng trực tiếp] Hành khách {user['ho_ten']} cần tìm xe tuyến {diem_di} → {diem_den}. "
        f"Giờ đón: {data.thoi_gian_don or 'Linh hoạt'}. Số khách: {so_khach}. SĐT: {sdt_clean}"
    )
    with get_db() as db:
        active_booking = db.execute(
            """SELECT kq.id, cx.diem_di, cx.diem_den 
               FROM ket_qua_ghep kq
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               WHERE yc.hanh_khach_id = ? AND kq.trang_thai NOT IN ('hoan_thanh', 'da_huy')""",
            (user["id"],),
        ).fetchone()
        if active_booking:
            act = dict(active_booking)
            tuyen = f"{act.get('diem_di')} → {act.get('diem_den')}"
            raise HTTPException(
                status_code=400,
                detail=f"Bạn đang có một chuyến đi chưa hoàn thành ({tuyen}). Vui lòng bấm 'Xác nhận hoàn thành' hoặc 'Hủy chuyến' trước khi đăng yêu cầu mới."
            )

        if sdt_clean and not user.get("sdt"):
            db.execute("UPDATE users SET sdt = ? WHERE id = ?", (sdt_clean, user["id"]))
        next_bv_id = get_next_id(db, "bai_viet_tho")
        db.execute(
            """INSERT INTO bai_viet_tho (id, nguoi_dang_id, noi_dung_tho, nguon, thoi_gian_tao, da_xu_ly)
               VALUES (?,?,?, 'form', ?, 1)""",
            (next_bv_id, user["id"], noi_dung_tho, get_now_iso()),
        )
        bv_id = next_bv_id
        next_yc_id = get_next_id(db, "yeu_cau")
        db.execute(
            """INSERT INTO yeu_cau (id, hanh_khach_id, hanh_khach_ten, diem_di, diem_den, thoi_gian_don, so_khach, sdt, bai_viet_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (next_yc_id, user["id"], user["ho_ten"], diem_di, diem_den, data.thoi_gian_don, so_khach, sdt_clean, bv_id),
        )
        rid = next_yc_id
    matched = run_matching()
    return {"message": "Đã gửi yêu cầu di chuyển thành công!", "id": rid, "bai_viet_id": bv_id, "cap_ghep_moi": matched}

@router.get("/api/requests")
async def list_requests(mine: int = 0, user=Depends(current_user)):
    with get_db() as db:
        if mine:
            rows = db.execute(
                """SELECT yc.*, 
                          CASE 
                            WHEN yc.hanh_khach_id IS NOT NULL THEN 'form'
                            WHEN bv.nguon = 'web' THEN 'form'
                            WHEN bv.nguon IS NOT NULL THEN bv.nguon
                            ELSE 'form'
                          END AS nguon,
                          bv.thoi_gian_tao AS bai_viet_thoi_gian,
                          bv.noi_dung_tho AS bai_viet_noi_dung
                   FROM yeu_cau yc
                   LEFT JOIN bai_viet_tho bv ON bv.id = yc.bai_viet_id
                   WHERE yc.hanh_khach_id = ?
                   ORDER BY yc.id DESC""",
                (user["id"],),
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT yc.*, 
                          CASE 
                            WHEN yc.hanh_khach_id IS NOT NULL THEN 'form'
                            WHEN bv.nguon = 'web' THEN 'form'
                            WHEN bv.nguon IS NOT NULL THEN bv.nguon
                            ELSE 'form'
                          END AS nguon,
                          bv.thoi_gian_tao AS bai_viet_thoi_gian,
                          bv.noi_dung_tho AS bai_viet_noi_dung
                   FROM yeu_cau yc
                   LEFT JOIN bai_viet_tho bv ON bv.id = yc.bai_viet_id
                   WHERE (yc.trang_thai NOT IN ('hoan_thanh', 'da_huy', 'het_han', 'da_ghep') OR yc.trang_thai IS NULL)
                   ORDER BY yc.id DESC"""
            ).fetchall()
            valid_list = []
            expired_ids = []
            for r in rows:
                item = dict(r)
                if _is_date_in_past(item.get("thoi_gian_don"), item.get("bai_viet_thoi_gian") or item.get("ngay_tao")):
                    expired_ids.append(item["id"])
                    continue
                valid_list.append(item)
            if expired_ids:
                try:
                    placeholders = ",".join("?" for _ in expired_ids)
                    db.execute(f"UPDATE yeu_cau SET trang_thai = 'het_han' WHERE id IN ({placeholders})", tuple(expired_ids))
                except Exception:
                    pass
            return valid_list
    return [dict(r) for r in rows]

@router.post("/api/requests/{request_id}/accept")
async def accept_request(request_id: int, data: AcceptRequestIn = None, user=Depends(current_user)):
    """Tài xế chốt nhận chở hành khách từ danh sách yêu cầu cần đón."""
    data = data or AcceptRequestIn()
    sdt_clean = (data.sdt or user.get("sdt") or "").strip()

    with get_db() as db:
        if sdt_clean and not user.get("sdt"):
            db.execute("UPDATE users SET sdt = ? WHERE id = ?", (sdt_clean, user["id"]))

        # Kiểm tra yêu cầu hành khách
        yc_row = db.execute("SELECT * FROM yeu_cau WHERE id = ?", (request_id,)).fetchone()
        if not yc_row:
            raise HTTPException(status_code=404, detail="Yêu cầu tìm xe này không tồn tại hoặc đã bị xóa.")

        yc = dict(yc_row)
        if yc.get("trang_thai") in ("da_ghep", "hoan_thanh", "da_huy", "het_han"):
            raise HTTPException(
                status_code=400,
                detail="Yêu cầu này đã được tài xế khác nhận, đã hoàn thành hoặc đã hết hạn."
            )

        cx_id = data.chuyen_xe_id
        if cx_id:
            # Tài xế chọn ghép vào chuyến có sẵn của mình
            cx_row = db.execute(
                "SELECT * FROM chuyen_xe WHERE id = ? AND tai_xe_id = ?",
                (cx_id, user["id"])
            ).fetchone()
            if not cx_row:
                raise HTTPException(status_code=400, detail="Chuyến xe được chọn không tồn tại hoặc không thuộc quyền quản lý của bạn.")
            cx = dict(cx_row)
            if cx.get("trang_thai") in ("da_day", "hoan_thanh", "da_huy"):
                raise HTTPException(status_code=400, detail="Chuyến xe này đã đầy khách hoặc đã kết thúc.")

            so_khach = max(1, yc.get("so_khach") or 1)
            so_ghe_hien_tai = int(cx.get("so_ghe_trong") or 1)
            so_ghe_moi = max(0, so_ghe_hien_tai - so_khach)
            trang_thai_cx = "da_day" if so_ghe_moi <= 0 else "con_ghe"

            db.execute(
                "UPDATE chuyen_xe SET so_ghe_trong = ?, trang_thai = ? WHERE id = ?",
                (so_ghe_moi, trang_thai_cx, cx_id)
            )
        else:
            # Tự động tạo 1 chuyến xe mới cho tài xế ứng với tuyến của hành khách này (không tạo bài viết đầu vào)
            next_cx_id = get_next_id(db, "chuyen_xe")
            db.execute(
                """INSERT INTO chuyen_xe (id, tai_xe_id, tai_xe_ten, diem_di, diem_den, thoi_gian_chay, so_ghe_trong, sdt, trang_thai, bai_viet_id)
                   VALUES (?,?,?,?,?,?, 0, ?, 'da_ghep', NULL)""",
                (
                    next_cx_id,
                    user["id"],
                    user["ho_ten"],
                    yc["diem_di"],
                    yc["diem_den"],
                    yc.get("thoi_gian_don") or get_now_vn().strftime("%H:%M %d/%m/%Y"),
                    sdt_clean,
                ),
            )
            cx_id = next_cx_id

        # Cập nhật trạng thái yêu cầu sang 'da_ghep'
        db.execute("UPDATE yeu_cau SET trang_thai = 'da_ghep' WHERE id = ?", (request_id,))

        # Tạo lượt ghép chuyến ket_qua_ghep
        next_kq_id = get_next_id(db, "ket_qua_ghep")
        db.execute(
            """INSERT INTO ket_qua_ghep (id, chuyen_xe_id, yeu_cau_id, diem_phu_hop, trang_thai, thoi_gian_ghep)
               VALUES (?,?,?, 100.0, 'da_ghep', ?)""",
            (next_kq_id, cx_id, request_id, get_now_iso()),
        )

    return {
        "message": f"Đã chốt nhận chuyến thành công! Khách hàng {yc.get('hanh_khach_ten') or 'Khách'} đã được thêm vào danh sách chuyến của bạn.",
        "match_id": next_kq_id,
        "chuyen_xe_id": cx_id,
        "request_id": request_id,
    }

@router.post("/api/requests/{request_id}/cancel")
async def cancel_request(request_id: int, user=Depends(current_user)):
    """Hành khách hủy yêu cầu tìm xe của mình."""
    with get_db() as db:
        row = db.execute("SELECT * FROM yeu_cau WHERE id = ?", (request_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Yêu cầu tìm xe không tồn tại hoặc đã bị xóa.")
        yc = dict(row)
        if yc.get("hanh_khach_id") != user["id"] and user.get("vai_tro") != "admin":
            raise HTTPException(status_code=403, detail="Bạn không có quyền hủy yêu cầu này.")
        db.execute("UPDATE yeu_cau SET trang_thai = 'da_huy' WHERE id = ?", (request_id,))
    return {"message": "Đã hủy yêu cầu tìm xe thành công.", "request_id": request_id}
