from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends

import config
from database import get_db, get_next_id
from models import AdminCreateUserIn, AdminUpdateUserIn, AdminTripStatusIn, AdminRequestStatusIn
from auth import require_admin, hash_password, _user_cache, _user_cache_time
from utils import _dem_theo_nhom, _chuan_hoa_ten_dia_diem, _tien_trinh_dang_chay, get_all_crawlers_status, _tao_link_zalo

router = APIRouter(tags=["Admin"])

@router.get("/api/admin/users")
async def get_admin_users(
    q: Optional[str] = None,
    role: Optional[str] = None,
    admin=Depends(require_admin)
):
    query = """
        SELECT u.*,
               COALESCE(c_cx.cnt, 0) AS so_chuyen,
               COALESCE(c_yc.cnt, 0) AS so_yeu_cau
        FROM users u
        LEFT JOIN (
            SELECT tai_xe_id, COUNT(*) as cnt 
            FROM chuyen_xe 
            WHERE tai_xe_id IS NOT NULL 
            GROUP BY tai_xe_id
        ) c_cx ON c_cx.tai_xe_id = u.id
        LEFT JOIN (
            SELECT hanh_khach_id, COUNT(*) as cnt 
            FROM yeu_cau 
            WHERE hanh_khach_id IS NOT NULL 
            GROUP BY hanh_khach_id
        ) c_yc ON c_yc.hanh_khach_id = u.id
    """
    where_clauses = []
    params = []

    if q and q.strip():
        term = f"%{q.strip()}%"
        where_clauses.append("(u.ho_ten LIKE ? OR u.email LIKE ? OR (u.sdt IS NOT NULL AND u.sdt LIKE ?))")
        params.extend([term, term, term])

    if role and role.strip() and role.strip().lower() != "all":
        where_clauses.append("u.role = ?")
        params.append(role.strip().lower())

    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    query += " ORDER BY u.id DESC"

    with get_db() as db:
        rows = db.execute(query, params).fetchall()

    users_list = []
    for r in rows:
        item = dict(r)
        item.pop("password_hash", None)
        created = item.get("created_at") or item.get("ngay_tao") or item.get("thoi_gian_tao")
        created_str = str(created) if created else ""
        item["created_at"] = created_str
        item["thoi_gian_tao"] = created_str
        item["ngay_tao"] = created_str
        item["sdt"] = item.get("sdt") or ""
        item["so_chuyen"] = int(item.get("so_chuyen") or 0)
        item["so_yeu_cau"] = int(item.get("so_yeu_cau") or 0)
        users_list.append(item)

    return users_list

@router.post("/api/admin/users")
async def create_admin_user(data: AdminCreateUserIn, admin=Depends(require_admin)):
    email_clean = data.email.strip()
    ho_ten_clean = data.ho_ten.strip()
    sdt_clean = (data.sdt or "").strip()
    role_clean = (data.role or "user").strip().lower()

    if not ho_ten_clean:
        raise HTTPException(status_code=400, detail="Họ tên không được để trống")
    if not email_clean:
        raise HTTPException(status_code=400, detail="Email không được để trống")
    if not data.password:
        raise HTTPException(status_code=400, detail="Mật khẩu không được để trống")
    if role_clean not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ (admin hoặc user)")

    with get_db() as db:
        exists = db.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(?)", (email_clean,)).fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Email này đã được sử dụng")

        if sdt_clean:
            phone_exists = db.execute(
                "SELECT id FROM users WHERE sdt = ? OR sdt = ?",
                (sdt_clean, "84" + sdt_clean[1:] if sdt_clean.startswith("0") else sdt_clean)
            ).fetchone()
            if phone_exists:
                raise HTTPException(status_code=400, detail="Số điện thoại này đã được sử dụng bởi người dùng khác")

        next_uid = get_next_id(db, "users")
        pwd_hash = hash_password(data.password)

        db.execute(
            "INSERT INTO users (id, ho_ten, email, password_hash, sdt, role) VALUES (?, ?, ?, ?, ?, ?)",
            (next_uid, ho_ten_clean, email_clean, pwd_hash, sdt_clean, role_clean),
        )

        row = db.execute(
            """SELECT u.*,
                      (SELECT COUNT(*) FROM chuyen_xe cx WHERE cx.tai_xe_id = u.id) AS so_chuyen,
                      (SELECT COUNT(*) FROM yeu_cau yc WHERE yc.hanh_khach_id = u.id) AS so_yeu_cau
               FROM users u WHERE u.id = ?""",
            (next_uid,)
        ).fetchone()

    u_dict = dict(row)
    u_dict.pop("password_hash", None)
    created = u_dict.get("created_at") or u_dict.get("ngay_tao") or u_dict.get("thoi_gian_tao")
    created_str = str(created) if created else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    u_dict["created_at"] = created_str
    u_dict["thoi_gian_tao"] = created_str
    u_dict["ngay_tao"] = created_str
    u_dict["sdt"] = u_dict.get("sdt") or ""
    u_dict["so_chuyen"] = int(u_dict.get("so_chuyen") or 0)
    u_dict["so_yeu_cau"] = int(u_dict.get("so_yeu_cau") or 0)
    return u_dict

@router.put("/api/admin/users/{user_id}")
async def update_admin_user(user_id: int, data: AdminUpdateUserIn, admin=Depends(require_admin)):
    ho_ten_clean = data.ho_ten.strip()
    sdt_clean = (data.sdt or "").strip()
    role_clean = (data.role or "user").strip().lower()

    if not ho_ten_clean:
        raise HTTPException(status_code=400, detail="Họ tên không được để trống")
    if role_clean not in ("admin", "user"):
        raise HTTPException(status_code=400, detail="Vai trò không hợp lệ (admin hoặc user)")
    if (user_id == 1 or str(user_id) == "1") and role_clean != "admin":
        raise HTTPException(status_code=400, detail="Không thể hạ quyền của tài khoản quản trị viên chính")

    with get_db() as db:
        existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")

        if sdt_clean:
            phone_taken = db.execute(
                "SELECT id FROM users WHERE (sdt = ? OR sdt = ?) AND id != ?",
                (sdt_clean, "84" + sdt_clean[1:] if sdt_clean.startswith("0") else sdt_clean, user_id)
            ).fetchone()
            if phone_taken:
                raise HTTPException(status_code=400, detail="Số điện thoại này đã được sử dụng bởi người dùng khác")

        if data.password and data.password.strip():
            pwd_hash = hash_password(data.password.strip())
            db.execute(
                "UPDATE users SET ho_ten = ?, sdt = ?, role = ?, password_hash = ? WHERE id = ?",
                (ho_ten_clean, sdt_clean, role_clean, pwd_hash, user_id)
            )
        else:
            db.execute(
                "UPDATE users SET ho_ten = ?, sdt = ?, role = ? WHERE id = ?",
                (ho_ten_clean, sdt_clean, role_clean, user_id)
            )

        row = db.execute(
            """SELECT u.*,
                      (SELECT COUNT(*) FROM chuyen_xe cx WHERE cx.tai_xe_id = u.id) AS so_chuyen,
                      (SELECT COUNT(*) FROM yeu_cau yc WHERE yc.hanh_khach_id = u.id) AS so_yeu_cau
               FROM users u WHERE u.id = ?""",
            (user_id,)
        ).fetchone()

    # Clear cache
    _user_cache.pop(str(user_id), None)
    _user_cache_time.pop(str(user_id), None)
    _user_cache.pop(user_id, None)
    _user_cache_time.pop(user_id, None)

    u_dict = dict(row)
    u_dict.pop("password_hash", None)
    created = u_dict.get("created_at") or u_dict.get("ngay_tao") or u_dict.get("thoi_gian_tao")
    created_str = str(created) if created else ""
    u_dict["created_at"] = created_str
    u_dict["thoi_gian_tao"] = created_str
    u_dict["ngay_tao"] = created_str
    u_dict["sdt"] = u_dict.get("sdt") or ""
    u_dict["so_chuyen"] = int(u_dict.get("so_chuyen") or 0)
    u_dict["so_yeu_cau"] = int(u_dict.get("so_yeu_cau") or 0)
    return u_dict

@router.delete("/api/admin/users/{user_id}")
async def delete_admin_user(user_id: int, admin=Depends(require_admin)):
    if user_id == 1 or str(user_id) == "1" or user_id == admin["id"] or str(user_id) == str(admin.get("id")):
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản quản trị viên chính")

    with get_db() as db:
        existing = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Không tìm thấy người dùng")
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # Clear cache
    _user_cache.pop(str(user_id), None)
    _user_cache_time.pop(str(user_id), None)
    _user_cache.pop(user_id, None)
    _user_cache_time.pop(user_id, None)

    return {"message": f"Đã xóa người dùng #{user_id} thành công", "id": user_id}

@router.put("/api/admin/trips/{trip_id}/status")
async def update_admin_trip_status(trip_id: int, data: AdminTripStatusIn, admin=Depends(require_admin)):
    """Admin cập nhật trạng thái chuyến xe (hoan_thanh, con_ghe, da_day, da_huy) và số ghế trống."""
    with get_db() as db:
        trip = db.execute("SELECT * FROM chuyen_xe WHERE id = ?", (trip_id,)).fetchone()
        if not trip:
            raise HTTPException(status_code=404, detail="Không tìm thấy chuyến xe")
        
        valid_statuses = ("con_ghe", "da_day", "hoan_thanh", "da_huy")
        if data.trang_thai not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ. Chọn một trong: {', '.join(valid_statuses)}")

        updates = ["trang_thai = ?"]
        params = [data.trang_thai]
        if data.trang_thai == "hoan_thanh":
            updates.append("so_ghe_trong = 0")
        elif data.so_ghe_trong is not None:
            updates.append("so_ghe_trong = ?")
            params.append(max(0, data.so_ghe_trong))
        
        params.append(trip_id)
        db.execute(f"UPDATE chuyen_xe SET {', '.join(updates)} WHERE id = ?", tuple(params))
        
        if data.trang_thai == "hoan_thanh":
            db.execute("UPDATE ket_qua_ghep SET trang_thai = 'hoan_thanh' WHERE chuyen_xe_id = ?", (trip_id,))
            db.execute(
                """UPDATE yeu_cau SET trang_thai = 'hoan_thanh'
                   WHERE id IN (SELECT yeu_cau_id FROM ket_qua_ghep WHERE chuyen_xe_id = ?)""",
                (trip_id,),
            )
        elif data.trang_thai == "da_huy":
            db.execute("UPDATE ket_qua_ghep SET trang_thai = 'da_huy' WHERE chuyen_xe_id = ?", (trip_id,))

    return {"message": "Đã cập nhật trạng thái chuyến xe thành công!", "id": trip_id, "trang_thai": data.trang_thai}

@router.put("/api/admin/requests/{request_id}/status")
async def update_admin_request_status(request_id: int, data: AdminRequestStatusIn, admin=Depends(require_admin)):
    """Admin cập nhật trạng thái yêu cầu hành khách (cho_ghep, da_ghep, hoan_thanh, da_huy, het_han)."""
    with get_db() as db:
        req = db.execute("SELECT * FROM yeu_cau WHERE id = ?", (request_id,)).fetchone()
        if not req:
            raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu")
        
        valid_statuses = ("cho_ghep", "da_ghep", "hoan_thanh", "da_huy", "het_han")
        if data.trang_thai not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Trạng thái không hợp lệ. Chọn một trong: {', '.join(valid_statuses)}")

        db.execute("UPDATE yeu_cau SET trang_thai = ? WHERE id = ?", (data.trang_thai, request_id))

    return {"message": "Đã cập nhật trạng thái yêu cầu thành công!", "id": request_id, "trang_thai": data.trang_thai}

@router.get("/api/stats")
async def stats(admin=Depends(require_admin)):
    with get_db() as db:
        so_bai_viet = db.execute("SELECT COUNT(*) c FROM bai_viet_tho").fetchone()["c"]
        so_da_xu_ly = db.execute("SELECT COUNT(*) c FROM bai_viet_tho WHERE da_xu_ly=1").fetchone()["c"]
        so_cho_xu_ly = db.execute("SELECT COUNT(*) c FROM bai_viet_tho WHERE da_xu_ly=0").fetchone()["c"]
        so_chuyen = db.execute("SELECT COUNT(*) c FROM chuyen_xe").fetchone()["c"]
        so_yeu_cau = db.execute("SELECT COUNT(*) c FROM yeu_cau").fetchone()["c"]
        so_ghep = db.execute(
            """SELECT COUNT(*) c FROM ket_qua_ghep kq
               JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id"""
        ).fetchone()["c"]
        nguon_rows = db.execute(
            """SELECT CASE 
                        WHEN nguon = 'web' THEN 'tai_xe' 
                        WHEN nguon IS NULL THEN 'khac' 
                        ELSE nguon 
                      END as nguon, 
                      COUNT(*) as c,
                      SUM(CASE WHEN da_xu_ly = 1 THEN 1 ELSE 0 END) as da_xu_ly,
                      SUM(CASE WHEN da_xu_ly = 0 THEN 1 ELSE 0 END) as cho_xu_ly,
                      SUM(CASE WHEN da_xu_ly = 2 THEN 1 ELSE 0 END) as loi
               FROM bai_viet_tho 
               GROUP BY CASE 
                          WHEN nguon = 'web' THEN 'tai_xe' 
                          WHEN nguon IS NULL THEN 'khac' 
                          ELSE nguon 
                        END"""
        ).fetchall()
        
    ty_le = round((so_da_xu_ly / so_bai_viet) * 100, 1) if so_bai_viet else 0
    
    chi_tiet_nguon = []
    for r in nguon_rows:
        nguon_name = r["nguon"] or "khac"
        if nguon_name == "web":
            nguon_name = "tai_xe"
        tong_nguon = r["c"]
        ty_le_nguon = round((tong_nguon * 100 / so_bai_viet), 1) if so_bai_viet else 0
        chi_tiet_nguon.append({
            "nguon": nguon_name,
            "so_luong": tong_nguon,
            "ty_le": ty_le_nguon,
            "da_xu_ly": r["da_xu_ly"] or 0,
            "cho_xu_ly": r["cho_xu_ly"] or 0,
            "loi": r["loi"] or 0
        })

    return {
        "so_bai_viet": so_bai_viet,
        "so_da_xu_ly": so_da_xu_ly,
        "so_cho_xu_ly": so_cho_xu_ly,
        "ty_le_xu_ly": ty_le,
        "so_chuyen": so_chuyen,
        "so_yeu_cau": so_yeu_cau,
        "so_ghep": so_ghep,
        "chu_ky_phut": config.MATCH_INTERVAL_MINUTES,
        "theo_nguon": {r["nguon"] or "khac": r["c"] for r in nguon_rows},
        "chi_tiet_nguon": chi_tiet_nguon,
    }

@router.get("/api/stats/locations")
async def stats_locations(admin=Depends(require_admin)):
    with get_db() as db:
        trips = [dict(r) for r in db.execute("SELECT diem_di, diem_den FROM chuyen_xe").fetchall()]
        reqs = [dict(r) for r in db.execute("SELECT diem_di, diem_den FROM yeu_cau").fetchall()]

    diem_di, tong_di = _dem_theo_nhom(trips, lambda r: _chuan_hoa_ten_dia_diem(r["diem_di"]))
    diem_den, tong_den = _dem_theo_nhom(trips, lambda r: _chuan_hoa_ten_dia_diem(r["diem_den"]))
    tuyen, tong_tuyen = _dem_theo_nhom(
        trips,
        lambda r: f"{_chuan_hoa_ten_dia_diem(r['diem_di'])} → {_chuan_hoa_ten_dia_diem(r['diem_den'])}",
    )
    yc_di, _ = _dem_theo_nhom(reqs, lambda r: _chuan_hoa_ten_dia_diem(r["diem_di"]))
    yc_den, _ = _dem_theo_nhom(reqs, lambda r: _chuan_hoa_ten_dia_diem(r["diem_den"]))

    return {
        "tong_chuyen": tong_di,
        "tong_yeu_cau": len(reqs),
        "diem_di": diem_di,
        "diem_den": diem_den,
        "tuyen": tuyen,
        "yeu_cau_diem_di": yc_di,
        "yeu_cau_diem_den": yc_den,
        "tong_tuyen": tong_tuyen,
    }

@router.get("/api/dashboard/all")
async def dashboard_all(admin=Depends(require_admin)):
    with get_db() as db:
        # 1. Chuyến xe (Trips)
        trip_rows = [dict(r) for r in db.execute(
            """SELECT cx.*, 
                      CASE 
                        WHEN cx.tai_xe_id IS NOT NULL THEN 'tai_xe'
                        WHEN bv.nguon = 'web' THEN 'tai_xe'
                        WHEN bv.nguon IS NOT NULL THEN bv.nguon
                        ELSE 'tai_xe'
                      END AS nguon,
                      bv.thoi_gian_tao AS bai_viet_thoi_gian
               FROM chuyen_xe cx
               LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
               ORDER BY cx.id DESC"""
        ).fetchall()]
        for r in trip_rows:
            sg = r.get("so_ghe_trong")
            if (sg is None or int(sg or 0) <= 0) and r.get("trang_thai") == "con_ghe":
                r["trang_thai"] = "da_day"

        # 2. Yêu cầu (Requests)
        req_rows = [dict(r) for r in db.execute(
            """SELECT yc.*, 
                      CASE 
                        WHEN yc.hanh_khach_id IS NOT NULL THEN 'form'
                        WHEN bv.nguon = 'web' THEN 'form'
                        WHEN bv.nguon IS NOT NULL THEN bv.nguon
                        ELSE 'form'
                      END AS nguon,
                      bv.thoi_gian_tao AS bai_viet_thoi_gian
               FROM yeu_cau yc
               LEFT JOIN bai_viet_tho bv ON bv.id = yc.bai_viet_id
               ORDER BY yc.id DESC"""
        ).fetchall()]

        # 3. Thống kê bài viết nhanh qua SQL aggregate (< 1ms)
        p_raw = db.execute(
            """SELECT 
                 COUNT(*) AS so_bai_viet,
                 SUM(CASE WHEN da_xu_ly = 1 THEN 1 ELSE 0 END) AS so_da_xu_ly,
                 SUM(CASE WHEN da_xu_ly = 0 THEN 1 ELSE 0 END) AS so_cho_xu_ly
               FROM bai_viet_tho"""
        ).fetchone()
        p_row = dict(p_raw) if p_raw else {}
        so_bai_viet = int(p_row.get("so_bai_viet") or 0)
        so_da_xu_ly = int(p_row.get("so_da_xu_ly") or 0)
        so_cho_xu_ly = int(p_row.get("so_cho_xu_ly") or 0)

        # 4. Thống kê chi tiết theo nguồn bài viết qua GROUP BY
        nguon_rows = [dict(r) for r in db.execute(
            """SELECT CASE 
                        WHEN nguon = 'web' THEN 'tai_xe' 
                        WHEN nguon IS NULL THEN 'khac' 
                        ELSE nguon 
                      END as nguon, 
                      COUNT(*) as c,
                      SUM(CASE WHEN da_xu_ly = 1 THEN 1 ELSE 0 END) as da_xu_ly,
                      SUM(CASE WHEN da_xu_ly = 0 THEN 1 ELSE 0 END) as cho_xu_ly,
                      SUM(CASE WHEN da_xu_ly = 2 THEN 1 ELSE 0 END) as loi
               FROM bai_viet_tho 
               GROUP BY CASE 
                          WHEN nguon = 'web' THEN 'tai_xe' 
                          WHEN nguon IS NULL THEN 'khac' 
                          ELSE nguon 
                        END"""
        ).fetchall()]

        # 5. Danh sách bài viết thô (Lấy toàn bộ bài viết để hiển thị và xem thêm)
        posts = [dict(r) for r in db.execute("SELECT * FROM bai_viet_tho ORDER BY id DESC").fetchall()]

        # 6. Người dùng (JOIN nhóm trực tiếp thay vì lặp correlated subquery)
        user_rows = [dict(r) for r in db.execute(
            """SELECT u.*,
                      COALESCE(c_cx.cnt, 0) AS so_chuyen,
                      COALESCE(c_yc.cnt, 0) AS so_yeu_cau
               FROM users u
               LEFT JOIN (
                   SELECT tai_xe_id, COUNT(*) as cnt 
                   FROM chuyen_xe 
                   WHERE tai_xe_id IS NOT NULL 
                   GROUP BY tai_xe_id
               ) c_cx ON c_cx.tai_xe_id = u.id
               LEFT JOIN (
                   SELECT hanh_khach_id, COUNT(*) as cnt 
                   FROM yeu_cau 
                   WHERE hanh_khach_id IS NOT NULL 
                   GROUP BY hanh_khach_id
               ) c_yc ON c_yc.hanh_khach_id = u.id
               ORDER BY u.id DESC"""
        ).fetchall()]
        users_list = []
        for r in user_rows:
            u_item = dict(r)
            u_item.pop("password_hash", None)
            created = u_item.get("created_at") or u_item.get("ngay_tao") or u_item.get("thoi_gian_tao")
            created_str = str(created) if created else ""
            u_item["created_at"] = created_str
            u_item["thoi_gian_tao"] = created_str
            u_item["ngay_tao"] = created_str
            u_item["sdt"] = u_item.get("sdt") or ""
            u_item["so_chuyen"] = int(u_item.get("so_chuyen") or 0)
            u_item["so_yeu_cau"] = int(u_item.get("so_yeu_cau") or 0)
            users_list.append(u_item)

        # 7. Kết quả ghép nối (Matches)
        match_rows = [dict(r) for r in db.execute(
            """SELECT kq.*, cx.tai_xe_id, cx.tai_xe_ten, cx.sdt AS cx_sdt, cx.sdt AS tx_sdt,
                      cx.diem_di AS cx_diem_di, cx.diem_den AS cx_diem_den,
                      cx.thoi_gian_chay, cx.thoi_gian_chay AS cx_thoi_gian,
                      yc.hanh_khach_id, yc.hanh_khach_ten, yc.sdt AS yc_sdt,
                      yc.diem_di AS yc_diem_di, yc.diem_den AS yc_diem_den,
                      yc.thoi_gian_don AS yc_thoi_gian, yc.so_khach
               FROM ket_qua_ghep kq
               LEFT JOIN chuyen_xe cx ON cx.id = kq.chuyen_xe_id
               LEFT JOIN yeu_cau yc ON yc.id = kq.yeu_cau_id
               ORDER BY kq.id DESC"""
        ).fetchall()]
        for m in match_rows:
            m["zalo_url_tai_xe"] = _tao_link_zalo(m.get("cx_sdt"))
            m["zalo_url_hanh_khach"] = _tao_link_zalo(m.get("yc_sdt"))

        so_ghep = len(match_rows)

    trips_lookup = {r["bai_viet_id"]: r.get("thoi_gian_chay") for r in trip_rows if r.get("bai_viet_id")}
    reqs_lookup = {r["bai_viet_id"]: r.get("thoi_gian_don") for r in req_rows if r.get("bai_viet_id")}

    for p in posts:
        pid = p.get("id")
        raw_ng = p.get("nguon") or "khac"
        if raw_ng == "web":
            raw_text = p.get("noi_dung_tho") or ""
            p["nguon"] = "tai_xe" if ("Tài xế" in raw_text or "[Đăng trực tiếp]" in raw_text) else "form"
        if pid in trips_lookup:
            p["thoi_gian_lich"] = trips_lookup[pid]
            p["loai_trich_xuat"] = "chuyen_xe"
        elif pid in reqs_lookup:
            p["thoi_gian_lich"] = reqs_lookup[pid]
            p["loai_trich_xuat"] = "yeu_cau"
        else:
            p["thoi_gian_lich"] = None
            p["loai_trich_xuat"] = None

    so_chuyen = len(trip_rows)
    so_yeu_cau = len(req_rows)
    ty_le = round((so_da_xu_ly / so_bai_viet) * 100, 1) if so_bai_viet else 0

    chi_tiet_nguon = []
    theo_nguon = {}
    for r in nguon_rows:
        ng = r.get("nguon") or "khac"
        cnt = int(r.get("c") or 0)
        theo_nguon[ng] = cnt
        ty_le_ng = round((cnt * 100 / so_bai_viet), 1) if so_bai_viet else 0
        chi_tiet_nguon.append({
            "nguon": ng,
            "so_luong": cnt,
            "ty_le": ty_le_ng,
            "da_xu_ly": int(r.get("da_xu_ly") or 0),
            "cho_xu_ly": int(r.get("cho_xu_ly") or 0),
            "loi": int(r.get("loi") or 0),
        })

    stats_data = {
        "so_bai_viet": so_bai_viet,
        "so_da_xu_ly": so_da_xu_ly,
        "so_cho_xu_ly": so_cho_xu_ly,
        "ty_le_xu_ly": ty_le,
        "so_chuyen": so_chuyen,
        "so_yeu_cau": so_yeu_cau,
        "so_ghep": so_ghep,
        "chu_ky_phut": config.MATCH_INTERVAL_MINUTES,
        "theo_nguon": theo_nguon,
        "chi_tiet_nguon": chi_tiet_nguon,
    }

    diem_di, tong_di = _dem_theo_nhom(trip_rows, lambda r: _chuan_hoa_ten_dia_diem(r["diem_di"]))
    diem_den, tong_den = _dem_theo_nhom(trip_rows, lambda r: _chuan_hoa_ten_dia_diem(r["diem_den"]))
    tuyen, tong_tuyen = _dem_theo_nhom(
        trip_rows,
        lambda r: f"{_chuan_hoa_ten_dia_diem(r['diem_di'])} → {_chuan_hoa_ten_dia_diem(r['diem_den'])}",
    )
    yc_di, _ = _dem_theo_nhom(req_rows, lambda r: _chuan_hoa_ten_dia_diem(r["diem_di"]))
    yc_den, _ = _dem_theo_nhom(req_rows, lambda r: _chuan_hoa_ten_dia_diem(r["diem_den"]))
    locations_data = {
        "tong_chuyen": tong_di,
        "tong_yeu_cau": len(req_rows),
        "diem_di": diem_di,
        "diem_den": diem_den,
        "tuyen": tuyen,
        "yeu_cau_diem_di": yc_di,
        "yeu_cau_diem_den": yc_den,
        "tong_tuyen": tong_tuyen,
    }

    bot_status = get_all_crawlers_status()

    return {
        "stats": stats_data,
        "locations": locations_data,
        "posts": posts,
        "trips": trip_rows,
        "requests": req_rows,
        "users": users_list,
        "matches": match_rows,
        "bot_status": bot_status,
    }


@router.post("/api/admin/reclassify-requests")
async def reclassify_requests(admin=Depends(require_admin)):
    from utils import fix_misclassified_requests
    result = fix_misclassified_requests()
    return {"message": "Đã quét và tái phân loại thành công", "data": result}

