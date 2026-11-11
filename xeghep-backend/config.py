import os
import sys
from threading import Lock

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BACKEND_DIR, ".env"))
    load_dotenv(os.path.join(ROOT_DIR, ".env"))
except ImportError:
    pass

DB_PATH = os.path.join(BACKEND_DIR, "xeghep.db")
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()  # "openai" | "gemini"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")
MATCH_INTERVAL_MINUTES = int(os.getenv("MATCH_INTERVAL_MINUTES", "30"))

# --- DANH SÁCH XOAY VÒNG NHIỀU GEMINI API KEY ---
_RAW_GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY", ""),
    os.getenv("GEMINI_API_KEY_1", ""),
    os.getenv("GEMINI_API_KEY_2", ""),
    os.getenv("GEMINI_API_KEY_3", ""),
    os.getenv("GEMINI_API_KEY_4", ""),
    os.getenv("GEMINI_API_KEY_5", ""),
    os.getenv("GEMINI_API_KEY_6", ""),
    os.getenv("GEMINI_API_KEY_7", ""),
    os.getenv("GEMINI_API_KEY_8", ""),
]
_VALID_GEMINI_KEYS = [k.strip() for k in _RAW_GEMINI_KEYS if k and k.strip().startswith("AIza")]
GEMINI_KEYS_POOL = _VALID_GEMINI_KEYS or [k.strip() for k in _RAW_GEMINI_KEYS if k and k.strip()]
key_index = 0
processing_lock = Lock()
matching_lock = Lock()
id_lock = Lock()

def get_next_gemini_key():
    """Hàm tự động đổi sang key tiếp theo trong danh sách xoay vòng"""
    global key_index
    if not GEMINI_KEYS_POOL:
        return GEMINI_API_KEY
    k = GEMINI_KEYS_POOL[key_index % len(GEMINI_KEYS_POOL)]
    key_index += 1
    return k

# --- CẤU HÌNH DATABASE MYSQL / TIDB / SQLITE ---
_raw_host = os.getenv("MYSQL_HOST", "127.0.0.1")
_is_remote_mysql = bool(_raw_host and _raw_host not in ["127.0.0.1", "localhost"])
DB_TYPE = os.getenv("DB_TYPE", "mysql" if _is_remote_mysql else "sqlite").lower()
MYSQL_HOST = _raw_host
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306 if not _is_remote_mysql else 4000))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DB = os.getenv("MYSQL_DB", "xeghep_db")

# --- ĐƯỜNG DẪN LOGS VÀ BOT CRAWLER ---
LOGS_DIR = os.path.join(BACKEND_DIR, "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

FACEBOOK_SUPERVISOR_PID = os.path.join(LOGS_DIR, ".facebook_crawler_supervisor.pid")
FACEBOOK_CRAWLER_LOG = os.path.join(LOGS_DIR, "facebook_crawler.log")
THREADS_SUPERVISOR_PID = os.path.join(LOGS_DIR, ".threads_crawler_supervisor.pid")
THREADS_CRAWLER_LOG = os.path.join(LOGS_DIR, "threads_crawler.log")
ZALO_SUPERVISOR_PID = os.path.join(LOGS_DIR, ".zalo_crawler_supervisor.pid")
ZALO_CRAWLER_LOG = os.path.join(LOGS_DIR, "zalo_crawler.log")
CRAWLER_DESIRED_STATE_FILE = os.path.join(LOGS_DIR, ".crawler_state.json")
