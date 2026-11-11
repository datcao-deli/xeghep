import config
from database import get_db, get_next_id, MySQLWrapper
from utils import _khop_dia_diem

def run_matching():
    if not config.matching_lock.acquire(blocking=False):
        return 0
    try:
        count = 0
        with get_db() as db:
            yeu_caus = db.execute("SELECT * FROM yeu_cau WHERE trang_thai = 'cho_ghep'").fetchall()
            for yc in yeu_caus:
                # 0. Nếu hành khách này đã có chuyến đi đang hoạt động, bỏ qua không ghép thêm
                if yc.get("hanh_khach_id"):
                    has_active = db.execute(
                        """SELECT kq.id FROM ket_qua_ghep kq
                           JOIN yeu_cau yc2 ON yc2.id = kq.yeu_cau_id
                           WHERE yc2.hanh_khach_id = ? AND kq.trang_thai NOT IN ('hoan_thanh', 'da_huy')""",
                        (yc["hanh_khach_id"],),
                    ).fetchone()
                    if has_active:
                        continue

                # Kiểm tra chưa có kết quả ghép cho yêu cầu này
                existing = db.execute(
                    "SELECT id FROM ket_qua_ghep WHERE yeu_cau_id = ?", (yc["id"],)
                ).fetchone()
                if existing:
                    db.execute("UPDATE yeu_cau SET trang_thai = 'da_ghep' WHERE id = ?", (yc["id"],))
                    continue

                so_khach_can = max(1, int(yc["so_khach"] or 1))
                trips = db.execute(
                    "SELECT * FROM chuyen_xe WHERE trang_thai = 'con_ghe' AND so_ghe_trong >= ?",
                    (so_khach_can,),
                ).fetchall()
                best = None
                for t in trips:
                    if _khop_dia_diem(t["diem_di"], yc["diem_di"]) and _khop_dia_diem(t["diem_den"], yc["diem_den"]):
                        best = t
                        break
                if best:
                    diem_phu_hop = 80 + (10 if best["diem_di"].lower() == yc["diem_di"].lower() else 0) + \
                                   (10 if best["diem_den"].lower() == yc["diem_den"].lower() else 0)
                    next_kq_id = get_next_id(db, "ket_qua_ghep")
                    db.execute(
                        """INSERT INTO ket_qua_ghep (id, chuyen_xe_id, yeu_cau_id, diem_phu_hop, trang_thai)
                           VALUES (?,?,?,?, 'da_ghep')""",
                        (next_kq_id, best["id"], yc["id"], min(diem_phu_hop, 100)),
                    )
                    db.execute("UPDATE yeu_cau SET trang_thai = 'da_ghep' WHERE id = ?", (yc["id"],))
                    new_gh = max(0, best["so_ghe_trong"] - so_khach_can)
                    trang_thai_moi = "da_day" if new_gh <= 0 else "con_ghe"
                    db.execute(
                        "UPDATE chuyen_xe SET so_ghe_trong = ?, trang_thai = ? WHERE id = ?",
                        (new_gh, trang_thai_moi, best["id"]),
                    )
                    count += 1
        return count
    finally:
        config.matching_lock.release()


def reindex_database_ids():
    """Sắp xếp lại toàn bộ ID người dùng, bài viết, chuyến xe, yêu cầu từ 1, 2, 3... liên tục."""
    with get_db() as db:
        is_mysql = isinstance(db, MySQLWrapper)
        users = [dict(r) for r in db.execute("SELECT * FROM users ORDER BY id ASC").fetchall()]
        posts = [dict(r) for r in db.execute("SELECT * FROM bai_viet_tho ORDER BY id ASC").fetchall()]
        trips_raw = [dict(r) for r in db.execute("SELECT * FROM chuyen_xe ORDER BY id ASC").fetchall()]
        reqs = [dict(r) for r in db.execute("SELECT * FROM yeu_cau ORDER BY id ASC").fetchall()]
        matches_raw = [dict(r) for r in db.execute("SELECT * FROM ket_qua_ghep ORDER BY id ASC").fetchall()]

        if not posts and not trips_raw and not users:
            return {"message": "Chưa có dữ liệu để sắp xếp lại", "so_bai_viet": 0, "so_chuyen_xe": 0}

        # 0. Bản đồ người dùng: 1..N
        user_map = {}
        for idx, u in enumerate(users, start=1):
            user_map[u["id"]] = idx
            u["new_id"] = idx

        # Khử trùng lặp chuyến xe cùng một bài viết
        seen_bv = set()
        trips = []
        for t in trips_raw:
            bv = t.get("bai_viet_id")
            if bv:
                if bv in seen_bv:
                    continue
                seen_bv.add(bv)
            trips.append(t)

        # 1. Bản đồ bài viết: 1..N
        post_map = {}
        for idx, p in enumerate(posts, start=1):
            post_map[p["id"]] = idx
            p["new_id"] = idx
            u_id = p.get("nguoi_dang_id")
            p["new_nguoi_dang_id"] = user_map.get(u_id) if u_id else None

        # 2. Bản đồ chuyến xe: 1..N
        trip_map = {}
        for idx, t in enumerate(trips, start=1):
            trip_map[t["id"]] = idx
            t["new_id"] = idx
            bv = t.get("bai_viet_id")
            t["new_bai_viet_id"] = post_map.get(bv) if bv else None
            t_uid = t.get("tai_xe_id")
            t["new_tai_xe_id"] = user_map.get(t_uid) if t_uid else None

        # 3. Bản đồ yêu cầu
        req_map = {}
        for idx, r in enumerate(reqs, start=1):
            req_map[r["id"]] = idx
            r["new_id"] = idx
            bv = r.get("bai_viet_id")
            r["new_bai_viet_id"] = post_map.get(bv) if bv else None
            h_uid = r.get("hanh_khach_id")
            r["new_hanh_khach_id"] = user_map.get(h_uid) if h_uid else None

        # 4. Bản đồ ghép chuyến (loại bỏ các bản ghi mồ côi không còn chuyến xe hoặc yêu cầu)
        matches = []
        for m in matches_raw:
            if m["chuyen_xe_id"] in trip_map and m["yeu_cau_id"] in req_map:
                m["new_id"] = len(matches) + 1
                m["new_chuyen_xe_id"] = trip_map[m["chuyen_xe_id"]]
                m["new_yeu_cau_id"] = req_map[m["yeu_cau_id"]]
                matches.append(m)

        # 5. Cập nhật dữ liệu sạch
        if is_mysql:
            db.execute("SET FOREIGN_KEY_CHECKS = 0;")
        else:
            db.execute("PRAGMA foreign_keys = OFF")

        db.execute("DELETE FROM ket_qua_ghep")
        db.execute("DELETE FROM chuyen_xe")
        db.execute("DELETE FROM yeu_cau")
        db.execute("DELETE FROM bai_viet_tho")
        db.execute("DELETE FROM users")

        for u in users:
            db.execute(
                """INSERT INTO users (id, ho_ten, email, password_hash, sdt, role, created_at)
                   VALUES (?,?,?,?,?,?,?)""",
                (u["new_id"], u["ho_ten"], u["email"], u["password_hash"], u.get("sdt"), u.get("role", "user"), u.get("created_at"))
            )

        for p in posts:
            db.execute(
                """INSERT INTO bai_viet_tho (id, nguoi_dang_id, noi_dung_tho, nguon, thoi_gian_tao, da_xu_ly, ghi_chu_loi)
                   VALUES (?,?,?,?,?,?,?)""",
                (p["new_id"], p.get("new_nguoi_dang_id"), p["noi_dung_tho"], p.get("nguon", "form"),
                 p.get("thoi_gian_tao"), p.get("da_xu_ly", 0), p.get("ghi_chu_loi"))
            )

        for t in trips:
            db.execute(
                """INSERT INTO chuyen_xe (id, tai_xe_id, tai_xe_ten, diem_di, diem_den, thoi_gian_chay, so_ghe_trong, sdt, trang_thai, bai_viet_id, ngay_tao)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (t["new_id"], t.get("new_tai_xe_id"), t.get("tai_xe_ten"), t["diem_di"], t["diem_den"],
                 t.get("thoi_gian_chay"), t.get("so_ghe_trong", 1), t.get("sdt"), t.get("trang_thai", "con_ghe"),
                 t.get("new_bai_viet_id"), t.get("ngay_tao"))
            )

        for r in reqs:
            db.execute(
                """INSERT INTO yeu_cau (id, hanh_khach_id, hanh_khach_ten, diem_di, diem_den, thoi_gian_don, so_khach, sdt, trang_thai, bai_viet_id, ngay_tao)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (r["new_id"], r.get("new_hanh_khach_id"), r.get("hanh_khach_ten"), r["diem_di"], r["diem_den"],
                 r.get("thoi_gian_don"), r.get("so_khach", 1), r.get("sdt"), r.get("trang_thai", "cho_ghep"),
                 r.get("new_bai_viet_id"), r.get("ngay_tao"))
            )

        for m in matches:
            db.execute(
                """INSERT INTO ket_qua_ghep (id, chuyen_xe_id, yeu_cau_id, diem_phu_hop, trang_thai, thoi_gian_ghep)
                   VALUES (?,?,?,?,?,?)""",
                (m["new_id"], m["new_chuyen_xe_id"], m["new_yeu_cau_id"], m.get("diem_phu_hop"),
                 m.get("trang_thai", "de_xuat"), m.get("thoi_gian_ghep"))
            )

        # Cập nhật auto-increment / sequence
        if is_mysql:
            db.execute(f"ALTER TABLE users AUTO_INCREMENT = {len(users) + 1};")
            db.execute(f"ALTER TABLE bai_viet_tho AUTO_INCREMENT = {len(posts) + 1};")
            db.execute(f"ALTER TABLE chuyen_xe AUTO_INCREMENT = {len(trips) + 1};")
            db.execute(f"ALTER TABLE yeu_cau AUTO_INCREMENT = {len(reqs) + 1};")
            db.execute(f"ALTER TABLE ket_qua_ghep AUTO_INCREMENT = {len(matches) + 1};")
            db.execute("SET FOREIGN_KEY_CHECKS = 1;")
        else:
            db.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'", (len(users),))
            db.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'bai_viet_tho'", (len(posts),))
            db.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'chuyen_xe'", (len(trips),))
            db.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'yeu_cau'", (len(reqs),))
            db.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'ket_qua_ghep'", (len(matches),))
            db.execute("PRAGMA foreign_keys = ON")

        return {
            "message": f"Đã sắp xếp lại ID: {len(users)} người dùng, {len(posts)} bài viết, {len(trips)} chuyến xe, {len(reqs)} yêu cầu!",
            "so_nguoi_dung": len(users),
            "so_bai_viet": len(posts),
            "so_chuyen_xe": len(trips),
            "so_yeu_cau": len(reqs),
        }
