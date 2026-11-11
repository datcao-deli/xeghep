import re
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Depends

from database import get_db, get_next_id
from models import TripIn, SearchQuery, JoinTripIn, AdminTripStatusIn
from auth import current_user
from utils import (
    _extract_date_parts, _khop_dia_diem, _chuan_hoa_ten_dia_diem, _tao_link_zalo, _is_date_in_past,
    get_now_iso, get_now_vn, format_human_time
)
from matching_service import run_matching

router = APIRouter(tags=["Trips"])

@router.post("/api/trips/search")
async def search_trips(data: SearchQuery, user=Depends(current_user)):
    req_date = None
    if data.thoi_gian and data.thoi_gian.strip():
        req_date = _extract_date_parts(data.thoi_gian)
        if req_date:
            today = datetime.now().date()
            try:
                req_d = date(req_date["year"], req_date["month"], req_date["day"])
                if req_d < today:
                    raise HTTPException(
                        status_code=400,
                        detail="Không thể chọn ngày trong quá khứ! Vui lòng chọn ngày từ hôm nay trở đi."
                    )
            except ValueError:
                pass

    with get_db() as db:
        trips = db.execute(
            """SELECT cx.*, bv.thoi_gian_tao AS bai_viet_thoi_gian
               FROM chuyen_xe cx
               LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
               WHERE cx.so_ghe_trong > 0 AND cx.trang_thai NOT IN ('da_huy', 'het_han', 'hoan_thanh')"""
        ).fetchall()

    ket_qua = []
    for row in trips:
        t = dict(row)
        search_di = (data.diem_di or "").strip()
        search_den = (data.diem_den or "").strip()
        match_di = _khop_dia_diem(t["diem_di"], search_di) if search_di else True
        match_den = _khop_dia_diem(t["diem_den"], search_den) if search_den else True
        if not (match_di and match_den):
            continue

        trip_time_str = (t.get("thoi_gian_chay") or "").strip()
        is_flexible = (
            not trip_time_str
            or bool(re.search(r"(linh hoạt|hàng ngày|liên tục|thỏa thuận|bất kỳ|24/7|24/24)", trip_time_str, re.IGNORECASE))
        )
        trip_date = _extract_date_parts(trip_time_str)

        # 1. Kiểm tra ngày quá hạn: Chỉ áp dụng khi chuyến có ngày cụ thể và không phải chuyến linh hoạt
        if not is_flexible and trip_date:
            today = datetime.now().date()
            try:
                t_d = date(trip_date["year"], trip_date["month"], trip_date["day"])
                if t_d < today:
                    continue
            except ValueError:
                pass

        # 2. Khớp ngày với yêu cầu tìm kiếm (req_date):
        # - Chuyến giờ linh hoạt/chạy liên tục LUÔN PHÙ HỢP với mọi ngày hành khách chọn
        # - Chuyến có ngày cụ thể phải trùng ngày/tháng tìm kiếm
        if req_date and not is_flexible:
            if trip_date:
                if trip_date["day"] != req_date["day"] or trip_date["month"] != req_date["month"]:
                    continue

        if not t.get("thoi_gian_chay"):
            t["thoi_gian_chay"] = "Linh hoạt"

        diem = 80
        if search_di and t["diem_di"].strip().lower() == search_di.lower():
            diem += 10
        if search_den and t["diem_den"].strip().lower() == search_den.lower():
            diem += 10
        t["diem_phu_hop"] = min(diem, 100)
        t["zalo_url"] = _tao_link_zalo(t.get("sdt"))
        ket_qua.append(t)

    ket_qua.sort(key=lambda x: -x["diem_phu_hop"])
    return ket_qua

@router.post("/api/trips")
async def create_trip(data: TripIn, user=Depends(current_user)):
    if data.thoi_gian_chay and _is_date_in_past(data.thoi_gian_chay):
        raise HTTPException(
            status_code=400,
            detail="Thời gian khởi hành đã qua! Vui lòng chọn ngày từ hôm nay trở đi."
        )
    diem_di = _chuan_hoa_ten_dia_diem(data.diem_di)
    diem_den = _chuan_hoa_ten_dia_diem(data.diem_den)
    sdt_clean = (data.sdt or user.get("sdt") or "").strip()
    so_ghe = max(1, data.so_ghe_trong)
    formatted_time = format_human_time(data.thoi_gian_chay)
    noi_dung_tho = (
        f"[Đăng trực tiếp] Tài xế {user['ho_ten']} nhận khách tuyến {diem_di} → {diem_den}. "
        f"Khởi hành: {formatted_time}. Số ghế trống: {so_ghe}. SĐT: {sdt_clean}"
    )
    with get_db() as db:
        if sdt_clean and not user.get("sdt"):
            db.execute("UPDATE users SET sdt = ? WHERE id = ?", (sdt_clean, user["id"]))
        next_bv_id = get_next_id(db, "bai_viet_tho")
        db.execute(
            """INSERT INTO bai_viet_tho (id, nguoi_dang_id, noi_dung_tho, nguon, thoi_gian_tao, da_xu_ly)
               VALUES (?,?,?, 'tai_xe', ?, 1)""",
            (next_bv_id, user["id"], noi_dung_tho, get_now_iso()),
        )
        bv_id = next_bv_id
        next_cx_id = get_next_id(db, "chuyen_xe")
        db.execute(
            """INSERT INTO chuyen_xe (id, tai_xe_id, tai_xe_ten, diem_di, diem_den, thoi_gian_chay, so_ghe_trong, sdt, bai_viet_id)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (next_cx_id, user["id"], user["ho_ten"], diem_di, diem_den, data.thoi_gian_chay, so_ghe, sdt_clean, bv_id),
        )
        tid = next_cx_id
    matched = run_matching()
    return {"message": "Đã đăng chuyến xe thành công!", "id": tid, "bai_viet_id": bv_id, "cap_ghep_moi": matched}

@router.get("/api/trips")
async def list_trips(mine: int = 0, user=Depends(current_user)):
    with get_db() as db:
        try:
            db.execute("UPDATE chuyen_xe SET trang_thai = 'da_day' WHERE so_ghe_trong <= 0 AND trang_thai = 'con_ghe'")
        except Exception:
            pass

        if mine:
            rows = db.execute(
                """SELECT cx.*, 
                          CASE 
                            WHEN cx.tai_xe_id IS NOT NULL THEN 'tai_xe'
                            WHEN bv.nguon = 'web' THEN 'tai_xe'
                            WHEN bv.nguon IS NOT NULL THEN bv.nguon
                            ELSE 'tai_xe'
                          END AS nguon,
                          bv.thoi_gian_tao AS bai_viet_thoi_gian,
                          bv.noi_dung_tho AS bai_viet_noi_dung
                   FROM chuyen_xe cx
                   LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
                   WHERE cx.tai_xe_id = ?
                     AND (bv.nguon IS NULL OR bv.nguon NOT IN ('facebook', 'threads', 'zalo'))
                   ORDER BY cx.id DESC""",
                (user["id"],),
            ).fetchall()
        elif user.get("role") == "admin":
            rows = db.execute(
                """SELECT cx.*, 
                          CASE 
                            WHEN cx.tai_xe_id IS NOT NULL THEN 'tai_xe'
                            WHEN bv.nguon = 'web' THEN 'tai_xe'
                            WHEN bv.nguon IS NOT NULL THEN bv.nguon
                            ELSE 'tai_xe'
                          END AS nguon,
                          bv.thoi_gian_tao AS bai_viet_thoi_gian,
                          bv.noi_dung_tho AS bai_viet_noi_dung
                   FROM chuyen_xe cx
                   LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
                   ORDER BY cx.id DESC"""
            ).fetchall()
        else:
            rows = db.execute(
                """SELECT cx.*, 
                          CASE 
                            WHEN cx.tai_xe_id IS NOT NULL THEN 'tai_xe'
                            WHEN bv.nguon = 'web' THEN 'tai_xe'
                            WHEN bv.nguon IS NOT NULL THEN bv.nguon
                            ELSE 'tai_xe'
                          END AS nguon,
                          bv.thoi_gian_tao AS bai_viet_thoi_gian,
                          bv.noi_dung_tho AS bai_viet_noi_dung
                   FROM chuyen_xe cx
                   LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
                   WHERE cx.so_ghe_trong > 0 AND cx.trang_thai NOT IN ('da_huy', 'het_han', 'hoan_thanh')
                   ORDER BY cx.id DESC"""
            ).fetchall()
    res = [dict(r) for r in rows]
    for r in res:
        if r.get("so_ghe_trong", 0) <= 0 and r.get("trang_thai") == "con_ghe":
            r["trang_thai"] = "da_day"
    return res

@router.put("/api/trips/{trip_id}/status")
async def update_user_trip_status(trip_id: int, data: AdminTripStatusIn, user=Depends(current_user)):
    """Tài xế sở hữu chuyến xe cập nhật trạng thái (con_ghe, da_day, hoan_thanh, da_huy) và số ghế trống."""
    with get_db() as db:
        trip = db.execute("SELECT * FROM chuyen_xe WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến xe")
        
        t_dict = dict(trip)
        if user.get("role") != "admin" and int(t_dict.get("tai_xe_id") or 0) != int(user.get("id")):
            raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa chuyến xe này")
        
        valid_statuses = ("con_ghe", "da_day", "hoan_thanh", "da_huy")
        if data.trang_thai not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ. Chọn một trong: {', '.join(valid_statuses)}")

        updates = ["trang_thai = ?"]
        params = [data.trang_thai]
        if data.trang_thai == "hoan_thanh":
            updates.append("so_ghe_trong = 0")
        elif data.trang_thai == "con_ghe" and (t_dict.get("so_ghe_trong") or 0) <= 0:
            updates.append("so_ghe_trong = 4")
        elif data.so_ghe_trong is not None:
            updates.append("so_ghe_trong = ?")
            params.append(max(0, data.so_ghe_trong))
        
        params.append(trip_id)
        db.execute(f"UPDATE chuyen_xe SET {', '.join(updates)} WHERE id = ?", tuple(params))
        
        if data.trang_thai == "hoan_thanh":
            # 1. Chuyển tất cả lượt ghép sang hoàn thành
            db.execute("UPDATE ket_qua_ghep SET trang_thai = 'hoan_thanh' WHERE chuyen_xe_id = ?", (trip_id,))
            # 2. Đồng bộ trạng thái yêu cầu của toàn bộ hành khách sang hoàn thành
            yc_rows = db.execute("SELECT yeu_cau_id FROM ket_qua_ghep WHERE chuyen_xe_id = ?", (trip_id,)).fetchall()
            for yr in yc_rows:
                y_id = yr["yeu_cau_id"] if isinstance(yr, dict) else yr[0]
                if y_id:
                    db.execute("UPDATE yeu_cau SET trang_thai = 'hoan_thanh' WHERE id = ?", (y_id,))
        elif data.trang_thai == "da_huy":
            # 1. Chuyển lượt ghép sang đã hủy
            db.execute("UPDATE ket_qua_ghep SET trang_thai = 'da_huy' WHERE chuyen_xe_id = ?", (trip_id,))
            # 2. Hoàn trả yêu cầu hành khách về chờ ghép để có thể nhận xe khác
            yc_rows = db.execute("SELECT yeu_cau_id FROM ket_qua_ghep WHERE chuyen_xe_id = ?", (trip_id,)).fetchall()
            for yr in yc_rows:
                y_id = yr["yeu_cau_id"] if isinstance(yr, dict) else yr[0]
                if y_id:
                    db.execute("UPDATE yeu_cau SET trang_thai = 'cho_ghep' WHERE id = ?", (y_id,))

    return {"message": "Đã cập nhật trạng thái chuyến xe thành công!", "id": trip_id, "trang_thai": data.trang_thai}

@router.post("/api/trips/{trip_id}/join")
async def join_trip(trip_id: int, data: JoinTripIn, user=Depends(current_user)):
    """Ghép hành khách trực tiếp vào chuyến xe đã chọn — atomic, không phụ thuộc background task."""
    sdt_clean = (data.sdt or user.get("sdt") or "").strip()
    with get_db() as db:
        if sdt_clean and not user.get("sdt"):
            db.execute("UPDATE users SET sdt = ? WHERE id = ?", (sdt_clean, user["id"]))
        active_booking = db.execute(
            """SELECT kq.id, cx.diem_di, cx.diem_den 
               FROM ket_qua_ghep kq
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               WHERE yc.hanh_khach_id = ? AND kq.trang_thai = 'da_ghep'""",
            (user["id"],),
        ).fetchone()
        if active_booking:
            act = dict(active_booking)
            tuyen = f"{act.get('diem_di')} → {act.get('diem_den')}"
            raise HTTPException(
                status_code=400,
                detail=f"Bạn đang có chuyến đi chưa hoàn thành ({tuyen}). Vui lòng bấm 'Xác nhận hoàn thành' hoặc 'Hủy chuyến' trước khi đặt chuyến mới."
            )

        trip = db.execute(
            "SELECT * FROM chuyen_xe WHERE id = ? AND so_ghe_trong > 0 AND trang_thai != 'da_huy'",
            (trip_id,),
        ).fetchone()
        if not trip:
            raise HTTPException(status_code=400, detail="Chuyến xe không còn ghế trống hoặc không tồn tại")

        trip = dict(trip)
        if data.so_khach > trip["so_ghe_trong"]:
            raise HTTPException(status_code=400, detail=f"Chuyến xe chỉ còn {trip['so_ghe_trong']} ghế trống")

        diem_di = _chuan_hoa_ten_dia_diem(data.diem_di) if data.diem_di else trip["diem_di"]
        diem_den = _chuan_hoa_ten_dia_diem(data.diem_den) if data.diem_den else trip["diem_den"]
        thoi_gian_don = data.thoi_gian_don or trip.get("thoi_gian_chay") or ""

        bv_id = None
        next_yc_id = get_next_id(db, "yeu_cau")
        db.execute(
            """INSERT INTO yeu_cau (id, hanh_khach_id, hanh_khach_ten, diem_di, diem_den, thoi_gian_don, so_khach, sdt, trang_thai, bai_viet_id)
               VALUES (?,?,?,?,?,?,?,?, 'da_ghep', ?)""",
            (next_yc_id, user["id"], user["ho_ten"], diem_di, diem_den, thoi_gian_don, data.so_khach, sdt_clean, bv_id),
        )
        yeu_cau_id = next_yc_id

        diem_phu_hop = 80
        if _khop_dia_diem(trip["diem_di"], diem_di):
            diem_phu_hop += 10
        if _khop_dia_diem(trip["diem_den"], diem_den):
            diem_phu_hop += 10
        diem_phu_hop = min(diem_phu_hop, 100)

        next_kq_id = get_next_id(db, "ket_qua_ghep")
        db.execute(
            """INSERT INTO ket_qua_ghep (id, chuyen_xe_id, yeu_cau_id, diem_phu_hop, trang_thai)
               VALUES (?,?,?,?, 'da_ghep')""",
            (next_kq_id, trip_id, yeu_cau_id, diem_phu_hop),
        )

        new_ghe = trip["so_ghe_trong"] - data.so_khach
        trang_thai_moi = "da_day" if new_ghe <= 0 else "con_ghe"
        db.execute(
            "UPDATE chuyen_xe SET so_ghe_trong = ?, trang_thai = ? WHERE id = ?",
            (new_ghe, trang_thai_moi, trip_id),
        )

    zalo_url = _tao_link_zalo(trip.get("sdt"))
    return {
        "message": "Đã đặt xe thành công!",
        "yeu_cau_id": yeu_cau_id,
        "chuyen_xe_id": trip_id,
        "diem_phu_hop": diem_phu_hop,
        "tai_xe_ten": trip.get("tai_xe_ten"),
        "tai_xe_sdt": trip.get("sdt"),
        "zalo_url": zalo_url,
    }
