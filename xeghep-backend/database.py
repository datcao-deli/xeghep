import sqlite3
import queue
import hashlib
from threading import Lock
from contextlib import contextmanager

try:
    import pymysql
    import pymysql.cursors
except ImportError:
    pymysql = None

import config

def hash_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

class MySQLWrapper:
    def __init__(self, conn):
        self.conn = conn
        self.cur = conn.cursor(pymysql.cursors.DictCursor)
        self.lastrowid = None
        self.rowcount = 0

    def execute(self, query: str, params=None):
        converted = query.replace("?", "%s")
        if converted.strip().upper().startswith("PRAGMA"):
            return self
        if params is not None:
            if not isinstance(params, (list, tuple)):
                params = (params,)
            self.cur.execute(converted, params)
        else:
            self.cur.execute(converted)
        self.lastrowid = self.cur.lastrowid
        self.rowcount = self.cur.rowcount
        return self

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()

    def close(self):
        self.cur.close()


@contextmanager
def _sqlite_db():
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


class MySQLPool:
    def __init__(self, maxsize=16):
        self.maxsize = maxsize
        self._pool = queue.Queue(maxsize=maxsize)
        self._lock = Lock()
        self._count = 0

    def _create_raw_conn(self):
        ssl_kwargs = {}
        if config.MYSQL_HOST and config.MYSQL_HOST not in ["127.0.0.1", "localhost"]:
            ssl_kwargs["ssl"] = {"check_hostname": False}
        return pymysql.connect(
            host=config.MYSQL_HOST,
            port=config.MYSQL_PORT,
            user=config.MYSQL_USER,
            password=config.MYSQL_PASSWORD,
            database=config.MYSQL_DB,
            charset="utf8mb4",
            connect_timeout=8,
            autocommit=False,
            **ssl_kwargs
        )

    def acquire(self):
        try:
            conn = self._pool.get_nowait()
            try:
                conn.ping(reconnect=True)
                return conn
            except Exception:
                try:
                    conn.close()
                except Exception:
                    pass
                with self._lock:
                    self._count = max(0, self._count - 1)
        except queue.Empty:
            pass

        with self._lock:
            if self._count < self.maxsize:
                self._count += 1
                try:
                    return self._create_raw_conn()
                except Exception:
                    self._count = max(0, self._count - 1)
                    raise

        try:
            conn = self._pool.get(timeout=3)
            try:
                conn.ping(reconnect=True)
                return conn
            except Exception:
                return self._create_raw_conn()
        except Exception:
            return self._create_raw_conn()

    def release(self, conn):
        if not conn:
            return
        try:
            if getattr(conn, "open", False):
                self._pool.put_nowait(conn)
            else:
                with self._lock:
                    self._count = max(0, self._count - 1)
        except queue.Full:
            try:
                conn.close()
            except Exception:
                pass
            with self._lock:
                self._count = max(0, self._count - 1)


_mysql_pool = None


def get_next_id(db, table_name: str) -> int:
    """Đảm bảo ID luôn tăng tuần tự 1 đơn vị, tuyệt đối không bị nhảy số do phân tán TiDB Cloud."""
    with config.id_lock:
        row = db.execute(f"SELECT COALESCE(MAX(id), 0) as m FROM {table_name}").fetchone()
        max_val = row["m"] if isinstance(row, dict) else (row[0] if row else 0)
        return int(max_val) + 1


@contextmanager
def get_db():
    global _mysql_pool
    if config.DB_TYPE == "mysql" and pymysql is not None:
        if _mysql_pool is None:
            _mysql_pool = MySQLPool(maxsize=20)
        conn = None
        try:
            conn = _mysql_pool.acquire()
        except Exception as err:
            print(f"⚠️ Mất kết nối MySQL ({err}) — tự động chuyển sang SQLite ({config.DB_PATH}).")
            config.DB_TYPE = "sqlite"
            with _sqlite_db() as sq_conn:
                yield sq_conn
            return

        wrapper = MySQLWrapper(conn)
        try:
            yield wrapper
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
            raise
        finally:
            wrapper.close()
            _mysql_pool.release(conn)
    else:
        with _sqlite_db() as sq_conn:
            yield sq_conn


def _init_sqlite_db():
    with _sqlite_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ho_ten TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                sdt TEXT,
                role TEXT NOT NULL CHECK(role IN ('admin','user','tai_xe','khach_hang')),
                ngay_tao TEXT DEFAULT (datetime('now')),
                avatar_url TEXT
            );

            CREATE TABLE IF NOT EXISTS bai_viet_tho (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nguoi_dang_id INTEGER,
                noi_dung_tho TEXT NOT NULL,
                nguon TEXT DEFAULT 'form',
                thoi_gian_tao TEXT DEFAULT (datetime('now')),
                da_xu_ly INTEGER DEFAULT 0,
                ghi_chu_loi TEXT
            );

            CREATE TABLE IF NOT EXISTS chuyen_xe (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tai_xe_id INTEGER,
                tai_xe_ten TEXT,
                diem_di TEXT NOT NULL,
                diem_den TEXT NOT NULL,
                thoi_gian_chay TEXT,
                so_ghe_trong INTEGER DEFAULT 1,
                sdt TEXT,
                trang_thai TEXT DEFAULT 'con_ghe',
                bai_viet_id INTEGER,
                ngay_tao TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS yeu_cau (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                hanh_khach_id INTEGER,
                hanh_khach_ten TEXT,
                diem_di TEXT NOT NULL,
                diem_den TEXT NOT NULL,
                thoi_gian_don TEXT,
                so_khach INTEGER DEFAULT 1,
                sdt TEXT,
                trang_thai TEXT DEFAULT 'cho_ghep',
                bai_viet_id INTEGER,
                ngay_tao TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS ket_qua_ghep (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chuyen_xe_id INTEGER NOT NULL,
                yeu_cau_id INTEGER NOT NULL,
                diem_phu_hop REAL NOT NULL,
                trang_thai TEXT DEFAULT 'de_xuat',
                thoi_gian_ghep TEXT DEFAULT (datetime('now')),
                danh_gia_sao INTEGER,
                nhan_xet TEXT,
                FOREIGN KEY (chuyen_xe_id) REFERENCES chuyen_xe(id) ON DELETE CASCADE,
                FOREIGN KEY (yeu_cau_id) REFERENCES yeu_cau(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS danh_gia (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ghep_id INTEGER,
                chuyen_xe_id INTEGER,
                tai_xe_id INTEGER,
                khach_hang_id INTEGER,
                khach_hang_ten TEXT,
                so_sao INTEGER NOT NULL CHECK(so_sao >= 1 AND so_sao <= 5),
                nhan_xet TEXT,
                thoi_gian TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_cx_bv ON chuyen_xe(bai_viet_id);
            CREATE INDEX IF NOT EXISTS idx_yc_bv ON yeu_cau(bai_viet_id);
            CREATE INDEX IF NOT EXISTS idx_bv_dxl ON bai_viet_tho(da_xu_ly);
            CREATE INDEX IF NOT EXISTS idx_cx_tg ON chuyen_xe(thoi_gian_chay);
            CREATE INDEX IF NOT EXISTS idx_yc_tg ON yeu_cau(thoi_gian_don);
            CREATE INDEX IF NOT EXISTS idx_dg_tx ON danh_gia(tai_xe_id);
            CREATE INDEX IF NOT EXISTS idx_cx_tx ON chuyen_xe(tai_xe_id);
            CREATE INDEX IF NOT EXISTS idx_yc_hk ON yeu_cau(hanh_khach_id);
            CREATE INDEX IF NOT EXISTS idx_kq_cx ON ket_qua_ghep(chuyen_xe_id);
            CREATE INDEX IF NOT EXISTS idx_kq_yc ON ket_qua_ghep(yeu_cau_id);
            CREATE INDEX IF NOT EXISTS idx_bv_ng ON bai_viet_tho(nguon);
            CREATE INDEX IF NOT EXISTS idx_cx_tt ON chuyen_xe(trang_thai);
            CREATE INDEX IF NOT EXISTS idx_yc_tt ON yeu_cau(trang_thai);
            """
        )
        admin = db.execute("SELECT * FROM users WHERE email = ?", ("admin",)).fetchone()
        if not admin:
            db.execute(
                "INSERT INTO users (id, ho_ten, email, password_hash, role) VALUES (?,?,?,?,?)",
                (1, "Quản trị viên", "admin", hash_password("111"), "admin"),
            )
        try:
            db.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
        except Exception:
            pass
        try:
            db.execute("ALTER TABLE users ADD COLUMN created_at TEXT")
            db.execute("UPDATE users SET created_at = ngay_tao WHERE created_at IS NULL")
        except Exception:
            pass
        try:
            db.execute("ALTER TABLE ket_qua_ghep ADD COLUMN danh_gia_sao INTEGER")
        except Exception:
            pass
        try:
            db.execute("ALTER TABLE ket_qua_ghep ADD COLUMN nhan_xet TEXT")
        except Exception:
            pass
        try:
            db.execute("UPDATE chuyen_xe SET trang_thai = 'con_ghe' WHERE so_ghe_trong > 0 AND trang_thai IN ('da_day', 'hoan_thanh')")
        except Exception:
            pass


def init_db():
    # Luôn đảm bảo SQLite local sẵn sàng làm nguồn dự phòng
    _init_sqlite_db()

    if config.DB_TYPE == "mysql":
        if pymysql is None:
            print("⚠️ Chưa cài đặt PyMySQL — tự động sử dụng SQLite (xeghep.db).")
            config.DB_TYPE = "sqlite"
            return
        try:
            ssl_kwargs = {}
            if config.MYSQL_HOST and config.MYSQL_HOST not in ["127.0.0.1", "localhost"]:
                ssl_kwargs["ssl"] = {"check_hostname": False}

            my_conn = pymysql.connect(
                host=config.MYSQL_HOST,
                port=config.MYSQL_PORT,
                user=config.MYSQL_USER,
                password=config.MYSQL_PASSWORD,
                charset="utf8mb4",
                connect_timeout=10,
                **ssl_kwargs
            )
            with my_conn.cursor() as cur:
                cur.execute(f"CREATE DATABASE IF NOT EXISTS {config.MYSQL_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
            my_conn.select_db(config.MYSQL_DB)

            with my_conn.cursor() as cur:
                cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ho_ten VARCHAR(255) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    sdt VARCHAR(50) NULL,
                    role VARCHAR(50) NOT NULL DEFAULT 'user',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS bai_viet_tho (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    nguoi_dang_id INT NULL,
                    noi_dung_tho TEXT NOT NULL,
                    nguon VARCHAR(50) NOT NULL DEFAULT 'form',
                    thoi_gian_tao VARCHAR(100) NULL,
                    da_xu_ly TINYINT DEFAULT 0,
                    ghi_chu_loi TEXT NULL,
                    FOREIGN KEY (nguoi_dang_id) REFERENCES users(id) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS chuyen_xe (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    tai_xe_id INT NULL,
                    tai_xe_ten VARCHAR(255) NOT NULL,
                    diem_di VARCHAR(255) NOT NULL,
                    diem_den VARCHAR(255) NOT NULL,
                    thoi_gian_chay VARCHAR(255) NULL,
                    so_ghe_trong INT NOT NULL DEFAULT 1,
                    sdt VARCHAR(50) NULL,
                    trang_thai VARCHAR(50) NOT NULL DEFAULT 'con_ghe',
                    bai_viet_id INT NULL,
                    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tai_xe_id) REFERENCES users(id) ON DELETE SET NULL,
                    FOREIGN KEY (bai_viet_id) REFERENCES bai_viet_tho(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS yeu_cau (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    hanh_khach_id INT NULL,
                    hanh_khach_ten VARCHAR(255) NOT NULL,
                    diem_di VARCHAR(255) NOT NULL,
                    diem_den VARCHAR(255) NOT NULL,
                    thoi_gian_don VARCHAR(255) NULL,
                    so_khach INT NOT NULL DEFAULT 1,
                    sdt VARCHAR(50) NULL,
                    trang_thai VARCHAR(50) NOT NULL DEFAULT 'cho_ghep',
                    bai_viet_id INT NULL,
                    ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (hanh_khach_id) REFERENCES users(id) ON DELETE SET NULL,
                    FOREIGN KEY (bai_viet_id) REFERENCES bai_viet_tho(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS ket_qua_ghep (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    chuyen_xe_id INT NOT NULL,
                    yeu_cau_id INT NOT NULL,
                    diem_phu_hop FLOAT NOT NULL,
                    trang_thai VARCHAR(50) NOT NULL DEFAULT 'de_xuat',
                    thoi_gian_ghep DATETIME DEFAULT CURRENT_TIMESTAMP,
                    danh_gia_sao INT NULL,
                    nhan_xet TEXT NULL,
                    FOREIGN KEY (chuyen_xe_id) REFERENCES chuyen_xe(id) ON DELETE CASCADE,
                    FOREIGN KEY (yeu_cau_id) REFERENCES yeu_cau(id) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)

                cur.execute("""
                CREATE TABLE IF NOT EXISTS danh_gia (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    ghep_id INT NULL,
                    chuyen_xe_id INT NULL,
                    tai_xe_id INT NULL,
                    khach_hang_id INT NULL,
                    khach_hang_ten VARCHAR(255),
                    so_sao INT NOT NULL,
                    nhan_xet TEXT,
                    thoi_gian DATETIME DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_dg_tx (tai_xe_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci /*T![auto_id_cache] AUTO_ID_CACHE 1 */;
                """)
                for v_sql in [
                    "CREATE OR REPLACE VIEW v_bai_viet AS SELECT * FROM bai_viet_tho ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_bai_viet_tho AS SELECT * FROM bai_viet_tho ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_chuyen_xe AS SELECT * FROM chuyen_xe ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_yeu_cau AS SELECT * FROM yeu_cau ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_ket_qua_ghep AS SELECT * FROM ket_qua_ghep ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_danh_gia AS SELECT * FROM danh_gia ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_users AS SELECT id, ho_ten, email, sdt, role, created_at FROM users ORDER BY id DESC LIMIT 1000000",
                    "CREATE OR REPLACE VIEW v_user AS SELECT id, ho_ten, email, sdt, role, created_at FROM users ORDER BY id DESC LIMIT 1000000",
                ]:
                    try:
                        cur.execute(v_sql)
                    except Exception:
                        pass
                try:
                    cur.execute("ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL;")
                except Exception:
                    pass
                try:
                    cur.execute("ALTER TABLE users ADD COLUMN ngay_tao DATETIME DEFAULT CURRENT_TIMESTAMP;")
                    cur.execute("UPDATE users SET ngay_tao = created_at WHERE ngay_tao IS NULL;")
                except Exception:
                    pass
                try:
                    cur.execute("ALTER TABLE ket_qua_ghep ADD COLUMN danh_gia_sao INT NULL;")
                except Exception:
                    pass
                try:
                    cur.execute("ALTER TABLE ket_qua_ghep ADD COLUMN nhan_xet TEXT NULL;")
                except Exception:
                    pass
                try:
                    cur.execute("ALTER TABLE danh_gia MODIFY COLUMN tai_xe_id INT NULL;")
                    cur.execute("ALTER TABLE danh_gia MODIFY COLUMN khach_hang_id INT NULL;")
                except Exception:
                    pass
                try:
                    cur.execute("UPDATE ket_qua_ghep SET trang_thai = 'da_ghep' WHERE trang_thai = 'de_xuat';")
                except Exception:
                    pass
                my_conn.commit()
            my_conn.close()

            # Đảm bảo có tài khoản Admin mặc định
            with get_db() as db:
                admin = db.execute("SELECT * FROM users WHERE email = ?", ("admin",)).fetchone()
                if not admin:
                    db.execute(
                        "INSERT INTO users (id, ho_ten, email, password_hash, role) VALUES (?,?,?,?,?)",
                        (1, "Quản trị viên", "admin", hash_password("111"), "admin"),
                    )
                try:
                    db.execute("UPDATE chuyen_xe SET trang_thai = 'con_ghe' WHERE so_ghe_trong > 0 AND trang_thai IN ('da_day', 'hoan_thanh')")
                except Exception:
                    pass
            print(f"✅ Đã kết nối cơ sở dữ liệu MySQL ({config.MYSQL_HOST}:{config.MYSQL_PORT}/{config.MYSQL_DB}).")
        except Exception as err:
            print(f"⚠️ Không thể kết nối MySQL tại {config.MYSQL_HOST}:{config.MYSQL_PORT} ({err}).")
            print(f"💡 Tự động chuyển sang sử dụng SQLite tại: {config.DB_PATH}")
            config.DB_TYPE = "sqlite"

    # Tự động nâng cấp bảng users trong SQLite hỗ trợ các role 'tai_xe', 'khach_hang'
    if config.DB_TYPE == "sqlite":
        try:
            with _sqlite_db() as sq:
                sql_schema = sq.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
                if sql_schema and "tai_xe" not in sql_schema[0]:
                    sq.execute("PRAGMA foreign_keys = OFF;")
                    sq.execute("""
                        CREATE TABLE users_new (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            ho_ten TEXT NOT NULL,
                            email TEXT UNIQUE NOT NULL,
                            password_hash TEXT NOT NULL,
                            sdt TEXT,
                            role TEXT NOT NULL CHECK(role IN ('admin','user','tai_xe','khach_hang')),
                            ngay_tao TEXT DEFAULT (datetime('now')),
                            avatar_url TEXT
                        )
                    """)
                    sq.execute("""
                        INSERT INTO users_new (id, ho_ten, email, password_hash, sdt, role, ngay_tao, avatar_url)
                        SELECT id, ho_ten, email, password_hash, sdt, 
                               CASE WHEN role = 'user' THEN 'khach_hang' ELSE role END,
                               ngay_tao, avatar_url
                        FROM users
                    """)
                    sq.execute("DROP TABLE users;")
                    sq.execute("ALTER TABLE users_new RENAME TO users;")
                    sq.execute("PRAGMA foreign_keys = ON;")
        except Exception as e:
            print("Lưu ý migration users:", e)

    # Tự động cập nhật các tài khoản role 'user' cũ sang 'khach_hang' hoặc 'tai_xe'
    try:
        with get_db() as db:
            db.execute("""
                UPDATE users 
                SET role = 'tai_xe' 
                WHERE role = 'user' AND id IN (SELECT DISTINCT tai_xe_id FROM chuyen_xe WHERE tai_xe_id IS NOT NULL)
            """)
            db.execute("UPDATE users SET role = 'khach_hang' WHERE role = 'user'")
    except Exception:
        pass

    # Tự động chuyển đổi các nguồn 'web' cũ và cập nhật nguồn 'tai_xe' chuẩn xác
    try:
        with get_db() as db:
            db.execute("UPDATE bai_viet_tho SET nguon = 'tai_xe' WHERE nguon = 'web' AND (noi_dung_tho LIKE '%Tài xế%' OR noi_dung_tho LIKE '%[Đăng trực tiếp]%')")
            db.execute("UPDATE bai_viet_tho SET nguon = 'form' WHERE nguon = 'web'")
            db.execute("UPDATE bai_viet_tho SET nguon = 'tai_xe' WHERE noi_dung_tho LIKE '%Tài xế%' AND nguon != 'tai_xe' AND nguon NOT IN ('facebook', 'threads', 'zalo')")
            # Tách biệt tuyệt đối bài cào MXH khỏi tài xế thực, không gán nhầm tai_xe_id
            db.execute("""
                UPDATE chuyen_xe 
                SET tai_xe_id = NULL, tai_xe_ten = 'Tài xế MXH' 
                WHERE bai_viet_id IN (SELECT id FROM bai_viet_tho WHERE nguon IN ('facebook', 'threads', 'zalo'))
                  AND tai_xe_id IS NOT NULL
            """)
            db.execute("""
                UPDATE chuyen_xe 
                SET tai_xe_id = 12 
                WHERE tai_xe_ten = 'hihi' AND tai_xe_id = 2
            """)
            # Dọn dẹp các log [Đặt xe trực tiếp] và [Tài xế nhận đón] khỏi bảng bài viết đầu vào
            db.execute("DELETE FROM bai_viet_tho WHERE noi_dung_tho LIKE '[Đặt xe trực tiếp]%' OR noi_dung_tho LIKE '[Tài xế nhận đón]%'")
    except Exception:
        pass
