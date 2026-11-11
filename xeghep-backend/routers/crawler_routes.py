import os
import subprocess
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

import config
from auth import require_admin
from utils import _tien_trinh_dang_chay, get_all_crawlers_status
from crawler_service import (
    get_crawler_desired_state,
    set_crawler_desired_state,
    _start_facebook_crawler,
    _start_threads_crawler,
    _start_zalo_crawler,
    giam_sat_va_tu_phuc_hoi_crawler,
)

router = APIRouter(tags=["Crawler"])


@router.get("/api/crawler/status")
async def crawler_status(admin=Depends(require_admin)):
    status = get_all_crawlers_status()
    fb_running = status["facebook"]
    th_running = status["threads"]
    zalo_running = status["zalo"]

    # Tự động kích hoạt watchdog kiểm tra và phục hồi bot nếu đang bị tắt trên cloud
    is_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"))
    auto_start = os.getenv("AUTO_START_CRAWLERS", "true").lower() in ("true", "1", "yes")
    if is_render or auto_start:
        desired = get_crawler_desired_state()
        if (
            (desired.get("facebook") and not fb_running)
            or (desired.get("threads") and not th_running)
            or (desired.get("zalo") and not zalo_running)
        ):
            giam_sat_va_tu_phuc_hoi_crawler()
            status = get_all_crawlers_status()

    return status


@router.get("/api/crawler/zalo/qr")
async def get_zalo_qr():
    qr_file = os.path.join(config.BACKEND_DIR, "zalo_qr.png")
    if os.path.exists(qr_file):
        return FileResponse(qr_file, media_type="image/png")
    raise HTTPException(status_code=404, detail="Chưa có ảnh mã QR Zalo. Hãy chạy python3 login_zalo.py hoặc bật Bot Zalo.")


def _stop_crawler_process(platform_key: str, pid_file: str, script_patterns: list[str]) -> None:
    set_crawler_desired_state(platform_key, False)
    if os.path.exists(pid_file):
        try:
            with open(pid_file, "r", encoding="utf-8") as f:
                supervisor_pid = int(f.read().strip())
            if os.name == "nt":
                creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(supervisor_pid)],
                    capture_output=True,
                    check=False,
                    creationflags=creationflags,
                )
            else:
                os.kill(supervisor_pid, 15)
        except (ValueError, ProcessLookupError, OSError):
            pass
        try:
            os.remove(pid_file)
        except OSError:
            pass

    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        for pattern in script_patterns:
            ps_cmd = (
                f"Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" "
                f"| Where-Object {{ $_.CommandLine -like '*{pattern}*' }} "
                f"| ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"
            )
            subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                check=False,
                creationflags=creationflags,
            )
    else:
        for pattern in script_patterns:
            subprocess.run(["pkill", "-f", pattern], check=False)


@router.post("/api/crawler/start")
async def start_crawler(admin=Depends(require_admin)):
    try:
        set_crawler_desired_state("facebook", True)
        if _tien_trinh_dang_chay("crawl_facebook_http.py") or _tien_trinh_dang_chay("crawl_xeghep.py"):
            return {"message": "Bot Facebook đang chạy (chế độ siêu nhẹ HTTP)."}
        _start_facebook_crawler()
        return {"message": "🚀 Đã bật Bot Facebook — đang tự động cào bài viết mới nhất!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khởi động Bot: {str(e)}")


@router.post("/api/crawler/stop")
async def stop_crawler(admin=Depends(require_admin)):
    try:
        _stop_crawler_process(
            "facebook",
            config.FACEBOOK_SUPERVISOR_PID,
            ["crawl_facebook_http.py", "crawl_xeghep.py"],
        )
        return {"message": "Đã dừng Bot Facebook."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi khi dừng Bot: {str(e)}")


@router.post("/api/crawler/threads/start")
async def start_threads(admin=Depends(require_admin)):
    try:
        set_crawler_desired_state("threads", True)
        if _tien_trinh_dang_chay("crawl_threads_http.py"):
            return {"message": "Bot Threads đang chạy."}
        _start_threads_crawler()
        return {"message": "🚀 Đã bật Bot Threads (siêu nhẹ HTTP) — đang quét bài viết mới nhất!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")


@router.post("/api/crawler/threads/stop")
async def stop_threads(admin=Depends(require_admin)):
    try:
        _stop_crawler_process(
            "threads",
            config.THREADS_SUPERVISOR_PID,
            ["crawl_threads_http.py"],
        )
        return {"message": "Đã dừng Bot Threads."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")


@router.post("/api/crawler/zalo/start")
async def start_zalo(admin=Depends(require_admin)):
    try:
        set_crawler_desired_state("zalo", True)
        if _tien_trinh_dang_chay("crawl_zalo_http.py"):
            return {"message": "Bot Zalo đang chạy."}
        _start_zalo_crawler()
        return {"message": "🚀 Đã bật Bot Zalo — đang quét tin nhắn mới nhất!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")


@router.post("/api/crawler/zalo/stop")
async def stop_zalo(admin=Depends(require_admin)):
    try:
        _stop_crawler_process(
            "zalo",
            config.ZALO_SUPERVISOR_PID,
            ["crawl_zalo_http.py"],
        )
        return {"message": "🛑 Đã dừng Bot Zalo!"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Lỗi: {str(e)}")


@router.post("/api/crawler/start-all")
async def start_all_crawlers(admin=Depends(require_admin)):
    await start_crawler(admin)
    await start_threads(admin)
    await start_zalo(admin)
    return {
        "message": "🚀 Đã bật đồng thời cả 3 Bot HTTP siêu nhẹ (Facebook, Threads, Zalo)!",
        "status": await crawler_status(admin),
    }


@router.post("/api/crawler/stop-all")
async def stop_all_crawlers(admin=Depends(require_admin)):
    await stop_crawler(admin)
    await stop_threads(admin)
    await stop_zalo(admin)
    return {
        "message": "🛑 Đã dừng toàn bộ 3 Bot (Facebook, Threads, Zalo).",
        "status": await crawler_status(admin),
    }


@router.get("/api/crawler/logs")
async def get_crawler_logs(name: str = "facebook", lines: int = 60, admin=Depends(require_admin)):
    log_map = {
        "facebook": config.FACEBOOK_CRAWLER_LOG,
        "threads": config.THREADS_CRAWLER_LOG,
        "zalo": config.ZALO_CRAWLER_LOG,
    }
    file_path = log_map.get(name)
    if not file_path or not os.path.exists(file_path):
        legacy_file = os.path.join(config.BACKEND_DIR, f"{name}_crawler.log")
        if os.path.exists(legacy_file):
            file_path = legacy_file
        else:
            return {"name": name, "logs": "(Chưa có log ghi nhận)"}
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            all_lines = f.readlines()
            recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return {"name": name, "logs": "".join(recent)}
    except Exception as e:
        return {"name": name, "error": str(e)}
