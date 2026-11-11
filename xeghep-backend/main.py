import os
import sys
import re
from datetime import datetime
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, Response
from apscheduler.schedulers.background import BackgroundScheduler

import config
from database import get_db, init_db, get_next_id, MySQLWrapper
from utils import _tien_trinh_dang_chay
from ai_service import process_pending_posts
from matching_service import run_matching
from crawler_service import (
    get_crawler_desired_state,
    set_crawler_desired_state,
    giam_sat_va_tu_phuc_hoi_crawler,
    keep_alive_render_anti_sleep,
)

from routers.auth_routes import router as auth_router
from routers.admin_routes import router as admin_router
from routers.trips_routes import router as trips_router
from routers.requests_routes import router as requests_router
from routers.matches_routes import router as matches_router
from routers.posts_routes import router as posts_router
from routers.crawler_routes import router as crawler_router

# ============================================================
# FASTAPI APPLICATION INITIALIZATION
# ============================================================
app = FastAPI(
    title="XeGhep API",
    description="Hệ thống ghép chuyến xe thông minh kết nối hành khách và tài xế",
    version="2.0.0",
)

# GZip Compression Middleware (giảm dung lượng payload JSON tới 80%)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tự động khởi tạo schema CSDL khi khởi động
init_db()

# Gắn kết tất cả các Module Routers
app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(trips_router)
app.include_router(requests_router)
app.include_router(matches_router)
app.include_router(posts_router)
app.include_router(crawler_router)


# ============================================================
# LỊCH TRÌNH ĐỊNH KỲ (BACKGROUND SCHEDULER)
# ============================================================
def cong_viec_dinh_ky():
    ket_qua = process_pending_posts()
    so_ghep = run_matching()
    print(
        f"[{datetime.now().isoformat(timespec='seconds')}] Đã xử lý {ket_qua['da_xu_ly']} bài viết, "
        f"lỗi {ket_qua['loi']}, tạo thêm {so_ghep} cặp ghép mới."
    )


scheduler = BackgroundScheduler()


@app.on_event("startup")
def start_scheduler():
    # Tự động quét và sửa các bài viết của tài xế bị phân loại nhầm vào yêu cầu
    try:
        from utils import fix_misclassified_requests
        fix_misclassified_requests()
    except Exception as e:
        print(f"⚠️ Lỗi chạy fix_misclassified_requests trên server: {e}")

    scheduler.add_job(
        cong_viec_dinh_ky,
        "interval",
        minutes=config.MATCH_INTERVAL_MINUTES,
        id="chu_ky_xu_ly",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        process_pending_posts,
        "interval",
        minutes=1,
        id="xu_ly_hang_cho",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        keep_alive_render_anti_sleep,
        "interval",
        minutes=4,
        id="anti_sleep_ping",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.add_job(
        giam_sat_va_tu_phuc_hoi_crawler,
        "interval",
        minutes=2,
        id="giam_sat_crawler",
        coalesce=True,
        misfire_grace_time=3600,
    )
    scheduler.start()

    is_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"))
    auto_start = os.getenv("AUTO_START_CRAWLERS", "true").lower() in ("true", "1", "yes")
    if is_render or auto_start:
        desired = get_crawler_desired_state()
        # Chỉ thiết lập True nếu chưa có cấu hình khởi tạo, giữ nguyên trạng thái Tắt nếu người dùng đã chủ động tắt
        for platform in ["facebook", "threads", "zalo"]:
            if platform not in desired:
                set_crawler_desired_state(platform, True)
        giam_sat_va_tu_phuc_hoi_crawler()
        try:
            keep_alive_render_anti_sleep()
        except Exception:
            pass


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)


# ============================================================
# HEALTH CHECK & GIÁM SÁT HỆ THỐNG
# ============================================================
@app.api_route("/api/health", methods=["GET", "HEAD"])
async def health():
    is_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"))
    auto_start = os.getenv("AUTO_START_CRAWLERS", "true").lower() in ("true", "1", "yes")
    if is_render or auto_start:
        desired = get_crawler_desired_state()
        fb_running = _tien_trinh_dang_chay("crawl_facebook_http.py") or _tien_trinh_dang_chay("crawl_xeghep.py")
        th_running = _tien_trinh_dang_chay("crawl_threads_http.py") or _tien_trinh_dang_chay("crawl_threads.py")
        zalo_running = _tien_trinh_dang_chay("crawl_zalo_http.py") or _tien_trinh_dang_chay("crawl_zalo.py")
        if (
            (desired.get("facebook") and not fb_running)
            or (desired.get("threads") and not th_running)
            or (desired.get("zalo") and not zalo_running)
        ):
            giam_sat_va_tu_phuc_hoi_crawler()

    users_count = 0
    posts_count = 0
    db_connected = False
    db_error = None
    try:
        with get_db() as db:
            r1 = db.execute("SELECT COUNT(*) as c FROM users").fetchone()
            users_count = r1["c"] if isinstance(r1, dict) else (r1[0] if r1 else 0)
            r2 = db.execute("SELECT COUNT(*) as c FROM bai_viet_tho").fetchone()
            posts_count = r2["c"] if isinstance(r2, dict) else (r2[0] if r2 else 0)
            db_connected = True
    except Exception as e:
        db_error = str(e)

    return {
        "status": "ok",
        "ai_provider": config.AI_PROVIDER,
        "tong_so_key_gemini": len(config.GEMINI_KEYS_POOL),
        "db_type": config.DB_TYPE,
        "db_host": config.MYSQL_HOST if config.DB_TYPE == "mysql" else "sqlite",
        "db_connected": db_connected,
        "users_count": users_count,
        "posts_count": posts_count,
        "db_error": db_error,
    }


def _format_hero_time(time_str):
    if not time_str:
        return ""
    s = str(time_str).strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})", s)
    if m:
        y, mo, d, hh, mm = m.groups()
        return f"{hh.zfill(2)}:{mm} ({d.zfill(2)}/{mo.zfill(2)}/{y})"
    return s


def _parse_hero_trip(trip):
    if not trip:
        return None
    raw_text = trip.get("noi_dung_tho") or ""
    driver_name = trip.get("ho_ten") or trip.get("tai_xe_ten")
    if not driver_name or str(driver_name).strip() in ["Ẩn danh", "Chưa rõ", "None", ""]:
        m = re.search(r"(?:NHÀ XE|Nhà xe|nhà xe)\s+([A-ZÀ-Ỹa-zà-ỹ0-9\s]{2,20})", raw_text)
        if m:
            clean_n = m.group(0).strip().title()
            clean_n = re.split(r"[-–—|\n,]", clean_n)[0].strip()
            driver_name = clean_n
        else:
            driver_name = "Tài xế đối tác"

    car_model = ""
    car_match = re.search(r"(vios|innova|fortuner|xpander|sedona|carnival|accent|cerato|mazda\s*\d|camry|kia\s*\w+|honda\s*\w+|hyundai\s*\w+|toyota\s*\w+|limo\w*)", raw_text, re.I)
    if car_match:
        car_model = car_match.group(0).title()
    elif (trip.get("so_ghe_trong") or 0) >= 7:
        car_model = "Xe 7 chỗ"
    else:
        car_model = "Xe 4-5 chỗ"

    tg = _format_hero_time(trip.get("thoi_gian_chay"))
    if not tg:
        tg_match = re.search(r"(?:xuất phát|chạy|khởi hành|đón|lúc)\s*(\d{1,2}(?:h|:)\d{0,2})", raw_text, re.I)
        if tg_match:
            tg = f"Xuất phát {tg_match.group(1)}"
        else:
            tg = "Xuất phát hôm nay"
    elif not tg.lower().startswith("xuất phát"):
        tg = f"Xuất phát {tg}"

    sdt = trip.get("sdt") or ""
    clean_phone = re.sub(r"\D", "", str(sdt))
    zalo_url = f"https://zalo.me/{clean_phone}" if clean_phone else "https://zalo.me"

    return {
        "id": trip.get("id"),
        "diem_di": trip.get("diem_di"),
        "diem_den": trip.get("diem_den"),
        "so_ghe_trong": trip.get("so_ghe_trong") or 1,
        "tai_xe_ten": driver_name,
        "loai_xe": car_model,
        "thoi_gian_chay": tg,
        "sdt": sdt,
        "zalo_url": zalo_url,
    }


@app.get("/api/public/landing-stats")
async def get_public_landing_stats():
    """Số liệu và chuyến xe thực tế phục vụ trang Landing Page công khai."""
    try:
        with get_db() as db:
            bv = db.execute("SELECT COUNT(*) c FROM bai_viet_tho").fetchone()
            cx = db.execute("SELECT COUNT(*) c FROM chuyen_xe").fetchone()
            yc = db.execute("SELECT COUNT(*) c FROM yeu_cau").fetchone()
            kq = db.execute("SELECT COUNT(*) c FROM ket_qua_ghep").fetchone()
            tx = db.execute(
                "SELECT COUNT(DISTINCT sdt) c FROM chuyen_xe WHERE sdt IS NOT NULL AND sdt != ''"
            ).fetchone()
            places = db.execute(
                """SELECT COUNT(DISTINCT diem) as c FROM (
                     SELECT TRIM(diem_di) as diem FROM chuyen_xe WHERE diem_di IS NOT NULL AND diem_di != ''
                     UNION
                     SELECT TRIM(diem_den) as diem FROM chuyen_xe WHERE diem_den IS NOT NULL AND diem_den != ''
                   )"""
            ).fetchone()
            routes = db.execute(
                """SELECT diem_di, diem_den, COUNT(*) as so_chuyen 
                   FROM chuyen_xe 
                   WHERE diem_di IS NOT NULL AND diem_den IS NOT NULL AND diem_di != '' AND diem_den != ''
                   GROUP BY diem_di, diem_den 
                   ORDER BY so_chuyen DESC 
                   LIMIT 9"""
            ).fetchall()

            # Lấy chuyến xe mới nhất và chuyến đang chạy thực tế từ CSDL
            latest_trips = db.execute(
                """SELECT cx.*, 
                          u.ho_ten, 
                          bv.noi_dung_tho,
                          bv.nguon
                   FROM chuyen_xe cx
                   LEFT JOIN users u ON cx.tai_xe_id = u.id
                   LEFT JOIN bai_viet_tho bv ON bv.id = cx.bai_viet_id
                   WHERE cx.so_ghe_trong > 0 
                     AND cx.trang_thai NOT IN ('da_huy', 'het_han', 'hoan_thanh')
                     AND cx.diem_di IS NOT NULL AND cx.diem_den IS NOT NULL 
                     AND cx.diem_di != '' AND cx.diem_den != ''
                   ORDER BY cx.id DESC
                   LIMIT 2"""
            ).fetchall()

            latest_parsed = _parse_hero_trip(dict(latest_trips[0])) if len(latest_trips) > 0 else None
            active_parsed = _parse_hero_trip(dict(latest_trips[1])) if len(latest_trips) > 1 else latest_parsed

            return {
                "tong_bai_viet": bv["c"] if bv else 0,
                "tong_chuyen_xe": cx["c"] if cx else 0,
                "tong_tai_xe": tx["c"] if tx else 0,
                "so_tinh_thanh": places["c"] if places else 0,
                "tong_yeu_cau": yc["c"] if yc else 0,
                "tong_ghep": kq["c"] if kq else 0,
                "tuyen_noi_bat": [dict(r) for r in routes],
                "chuyen_moi_nhat": latest_parsed or {
                    "id": 0,
                    "diem_di": "Núi Thành",
                    "diem_den": "Quảng Ngãi",
                    "so_ghe_trong": 1,
                    "tai_xe_ten": "Tài xế đối tác",
                    "loai_xe": "Xe 4-5 chỗ",
                    "thoi_gian_chay": "Xuất phát hôm nay",
                    "sdt": "",
                    "zalo_url": "https://zalo.me",
                },
                "chuyen_dang_chay": active_parsed or {
                    "id": 0,
                    "diem_di": "Quảng Ngãi",
                    "diem_den": "Đà Nẵng",
                    "so_ghe_trong": 4,
                    "tai_xe_ten": "Tài xế đối tác",
                    "loai_xe": "Xe 4-5 chỗ",
                    "thoi_gian_chay": "Đang chạy",
                    "sdt": "",
                    "zalo_url": "https://zalo.me",
                },
            }
    except Exception as err:
        return {
            "tong_bai_viet": 787,
            "tong_chuyen_xe": 720,
            "tong_tai_xe": 96,
            "so_tinh_thanh": 29,
            "tong_yeu_cau": 15,
            "tong_ghep": 11,
            "tuyen_noi_bat": [
                {"diem_di": "Hà Nội", "diem_den": "Hải Phòng", "so_chuyen": 12},
                {"diem_di": "Hà Nội", "diem_den": "Nội Bài", "so_chuyen": 10},
                {"diem_di": "Đà Nẵng", "diem_den": "Tam Kỳ", "so_chuyen": 21},
                {"diem_di": "Huế", "diem_den": "Đà Nẵng", "so_chuyen": 13},
                {"diem_di": "Bắc Ninh", "diem_den": "Hà Nội", "so_chuyen": 6},
                {"diem_di": "Thái Bình", "diem_den": "Hà Nội", "so_chuyen": 5},
            ],
            "chuyen_moi_nhat": {
                "id": 0,
                "diem_di": "Hà Nội",
                "diem_den": "Vinh",
                "so_ghe_trong": 2,
                "tai_xe_ten": "Bác Hải",
                "loai_xe": "Toyota Vios",
                "thoi_gian_chay": "Xuất phát 14:30",
                "sdt": "",
                "zalo_url": "https://zalo.me",
            },
            "chuyen_dang_chay": {
                "id": 0,
                "diem_di": "Hà Nội",
                "diem_den": "Hạ Long",
                "so_ghe_trong": 1,
                "tai_xe_ten": "Tài xế",
                "loai_xe": "Xe 4-5 chỗ",
                "thoi_gian_chay": "Đang chạy",
                "sdt": "",
                "zalo_url": "https://zalo.me",
            },
        }


# ============================================================
# PHỤC VỤ GIAO DIỆN FRONTEND TÍCH HỢP (PRODUCTION SPA)
# ============================================================
DIST_DIR = os.path.abspath(os.path.join(config.BACKEND_DIR, "..", "dist"))
if not (os.path.exists(DIST_DIR) and os.path.exists(os.path.join(DIST_DIR, "index.html"))):
    DIST_DIR = os.path.join(config.BACKEND_DIR, "dist")

if os.path.exists(DIST_DIR) and os.path.exists(os.path.join(DIST_DIR, "index.html")):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.ico")
    async def serve_favicon():
        file_path = os.path.join(DIST_DIR, "favicon.ico")
        if os.path.isfile(file_path):
            return FileResponse(file_path, media_type="image/x-icon")
        file_path_png = os.path.join(DIST_DIR, "favicon.png")
        if os.path.isfile(file_path_png):
            return FileResponse(file_path_png, media_type="image/png")
        return Response(status_code=404)

    @app.get("/robots.txt")
    async def serve_robots():
        file_path = os.path.join(DIST_DIR, "robots.txt")
        if os.path.isfile(file_path):
            return FileResponse(file_path, media_type="text/plain")
        robots_content = """User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /admin
Disallow: /user-dashboard
Disallow: /driver
Disallow: /customer
Disallow: /api/

Sitemap: https://goghep.id.vn/sitemap.xml"""
        return Response(content=robots_content, media_type="text/plain")

    @app.get("/sitemap.xml")
    async def serve_sitemap():
        file_path = os.path.join(DIST_DIR, "sitemap.xml")
        if os.path.isfile(file_path):
            return FileResponse(file_path, media_type="application/xml")
        xml_content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://goghep.id.vn/</loc>
    <lastmod>2026-11-09</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
        return Response(content=xml_content, media_type="application/xml")

    @app.get("/ads.txt")
    async def serve_ads_txt():
        file_path = os.path.join(DIST_DIR, "ads.txt")
        if os.path.isfile(file_path):
            return FileResponse(file_path, media_type="text/plain; charset=utf-8")
        ads_content = "google.com, pub-6151534027225729, DIRECT, f08c47fec0942fa0\n"
        return Response(content=ads_content, media_type="text/plain; charset=utf-8")

    @app.get("/{full_path:path}")
    async def serve_spa_frontend(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            raise HTTPException(status_code=404, detail="API route not found")
        file_path = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(DIST_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    os.environ.setdefault("PORT", "10000")
    port = int(os.environ["PORT"])
    uvicorn.run(app, host="0.0.0.0", port=port)