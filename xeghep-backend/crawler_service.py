import os
import sys
import json
import subprocess
import requests
from datetime import datetime

import config
from utils import _tien_trinh_dang_chay

def get_crawler_desired_state() -> dict:
    default_state = {"facebook": True, "threads": True, "zalo": True}
    if os.path.exists(config.CRAWLER_DESIRED_STATE_FILE):
        try:
            with open(config.CRAWLER_DESIRED_STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return {**default_state, **data}
        except Exception:
            pass
    return default_state

def set_crawler_desired_state(key: str, state: bool):
    current = get_crawler_desired_state()
    current[key] = state
    try:
        with open(config.CRAWLER_DESIRED_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(current, f)
    except Exception:
        pass

_WINDOWS_SUPERVISOR_CODE = """
import os, sys, time, subprocess
script, pid_file, log_file = sys.argv[1], sys.argv[2], sys.argv[3]
with open(pid_file, "w", encoding="utf-8") as pf:
    pf.write(str(os.getpid()))
try:
    while True:
        with open(log_file, "a", encoding="utf-8") as lf:
            proc = subprocess.run([sys.executable, "-u", script], stdout=lf, stderr=subprocess.STDOUT)
            lf.write(f"\\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] {script} stopped ({proc.returncode}), restarting...\\n")
        time.sleep(10)
finally:
    if os.path.exists(pid_file):
        try:
            os.remove(pid_file)
        except OSError:
            pass
""".strip()


def _start_crawler_process(script_name: str, pid_file: str, log_file: str, label: str) -> bool:
    if _tien_trinh_dang_chay(script_name):
        return True
    if os.name == "nt":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
        subprocess.Popen(
            [sys.executable, "-u", "-c", _WINDOWS_SUPERVISOR_CODE, script_name, pid_file, log_file],
            cwd=config.BACKEND_DIR,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=creationflags,
        )
        return True

    supervisor = (
        f"echo $$ > '{pid_file}'; "
        f"trap 'rm -f \"{pid_file}\"; exit 0' TERM INT EXIT; "
        f"while true; do \"{sys.executable}\" -u {script_name} >> '{log_file}' 2>&1; "
        f"code=$?; echo \"[$(date '+%Y-%m-%d %H:%M:%S')] {label} crawler stopped ($code), restarting...\" >> '"
        f"{log_file}'; sleep 10; done"
    )
    subprocess.Popen(
        ["/bin/sh", "-c", supervisor],
        cwd=config.BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        close_fds=True,
        start_new_session=True,
    )
    return True


def _start_facebook_crawler() -> bool:
    return _start_crawler_process(
        "crawl_facebook_http.py",
        config.FACEBOOK_SUPERVISOR_PID,
        config.FACEBOOK_CRAWLER_LOG,
        "Facebook",
    )


def _start_threads_crawler() -> bool:
    return _start_crawler_process(
        "crawl_threads_http.py",
        config.THREADS_SUPERVISOR_PID,
        config.THREADS_CRAWLER_LOG,
        "Threads",
    )


def _start_zalo_crawler() -> bool:
    return _start_crawler_process(
        "crawl_zalo_http.py",
        config.ZALO_SUPERVISOR_PID,
        config.ZALO_CRAWLER_LOG,
        "Zalo",
    )


def tu_dong_don_dep_log_files(max_bytes=3 * 1024 * 1024, keep_lines=1500):
    """Tự động kiểm tra và cắt ngắn tệp nhật ký nếu vượt quá 3MB, chỉ giữ lại 1.500 dòng gần nhất để tránh phình to ổ cứng."""
    for log_path in [config.FACEBOOK_CRAWLER_LOG, config.THREADS_CRAWLER_LOG, config.ZALO_CRAWLER_LOG]:
        if os.path.exists(log_path):
            try:
                if os.path.getsize(log_path) > max_bytes:
                    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                        lines = f.readlines()
                    with open(log_path, "w", encoding="utf-8") as f:
                        f.writelines(lines[-keep_lines:])
            except Exception:
                pass


def giam_sat_va_tu_phuc_hoi_crawler():
    """Tự động kiểm tra và phục hồi tiến trình cào nếu bị crash hoặc sau khi server restart, luôn tôn trọng trạng thái tắt/bật của người dùng."""
    # Tự động dọn dẹp các tệp log nếu kích thước vượt ngưỡng an toàn
    tu_dong_don_dep_log_files()

    desired = get_crawler_desired_state()

    # Chỉ khởi động lại nếu người dùng đã BẬT (desired state is True)
    fb_wanted = bool(desired.get("facebook", False))
    th_wanted = bool(desired.get("threads", False))
    zalo_wanted = bool(desired.get("zalo", False))

    if fb_wanted and not _tien_trinh_dang_chay("crawl_facebook_http.py"):
        print(f"[{datetime.now().isoformat(timespec='seconds')}] 🔄 Watchdog: Đang tự động bật lại Bot Facebook...")
        _start_facebook_crawler()
    if th_wanted and not _tien_trinh_dang_chay("crawl_threads_http.py"):
        print(f"[{datetime.now().isoformat(timespec='seconds')}] 🔄 Watchdog: Đang tự động bật lại Bot Threads...")
        _start_threads_crawler()
    if zalo_wanted and not _tien_trinh_dang_chay("crawl_zalo_http.py"):
        print(f"[{datetime.now().isoformat(timespec='seconds')}] 🔄 Watchdog: Đang tự động bật lại Bot Zalo...")
        _start_zalo_crawler()


def keep_alive_render_anti_sleep():
    """Gửi ping mỗi 4 phút trên Render (hoặc khi đặt PING_URL) để ngăn Free Tier ngủ đông sau 15 phút."""
    is_render = bool(os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"))
    explicit_ping = (os.getenv("PING_URL") or "").strip()
    if not is_render and not explicit_ping:
        return
    target_url = explicit_ping or "https://goghep.id.vn/api/health"
    if not target_url.endswith("/api/health"):
        target_url = target_url.rstrip("/") + "/api/health"
    try:
        r = requests.get(target_url, headers={"User-Agent": "XeGhep-AntiSleep/1.0"}, timeout=15)
        print(f"[{datetime.now().isoformat(timespec='seconds')}] 💓 Anti-Sleep Ping -> {target_url} (HTTP {r.status_code})")
    except Exception as e:
        print(f"[{datetime.now().isoformat(timespec='seconds')}] ⚠️ Anti-Sleep Ping lỗi: {e}")
