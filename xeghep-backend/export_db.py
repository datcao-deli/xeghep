import os
import re
from main import get_db

output_file = os.path.join(os.path.dirname(__file__), "xeghep_db_export.sql")

with get_db() as db:
    tables = [list(r.values())[0] for r in db.execute("SHOW TABLES").fetchall()]
    order = ["users", "bai_viet_tho", "chuyen_xe", "yeu_cau", "ket_qua_ghep"]
    ordered_tables = [t for t in order if t in tables] + [t for t in tables if t not in order]
    
    with open(output_file, "w", encoding="utf-8") as f:
        f.write("-- ========================================================\n")
        f.write("-- DỮ LIỆU SAO LƯU XE GHÉP DÀNH CHO XAMPP (MYSQL / MARIADB)\n")
        f.write("-- ========================================================\n\n")
        f.write("CREATE DATABASE IF NOT EXISTS `xeghep_db` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;\n")
        f.write("USE `xeghep_db`;\n\n")
        f.write("SET FOREIGN_KEY_CHECKS = 0;\n")
        f.write("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n")
        f.write("SET NAMES utf8mb4;\n\n")
        
        for t in ordered_tables:
            print(f"Đang xuất bảng: {t}...")
            f.write(f"-- --------------------------------------------------------\n")
            f.write(f"-- Cấu trúc bảng `{t}`\n")
            f.write(f"-- --------------------------------------------------------\n")
            f.write(f"DROP TABLE IF EXISTS `{t}`;\n")
            
            create_res = db.execute(f"SHOW CREATE TABLE {t}").fetchone()
            create_sql = list(create_res.values())[1]
            
            # Làm sạch các cú pháp đặc thù của TiDB để tương thích 100% XAMPP MySQL
            create_sql = re.sub(r'/\*T!.*?\*/', '', create_sql)
            create_sql = re.sub(r'/\*!.*?\*/', '', create_sql)
            create_sql = re.sub(r'SHARD_ROW_ID_BITS\s*=\s*\d+', '', create_sql)
            create_sql = re.sub(r'PRE_SPLIT_REGIONS\s*=\s*\d+', '', create_sql)
            create_sql = re.sub(r'AUTO_RANDOM\s*=\s*\d+', '', create_sql)
            create_sql = re.sub(r'\s+,', ',', create_sql)
            f.write(f"{create_sql.strip()};\n\n")
            
            rows = db.execute(f"SELECT * FROM {t}").fetchall()
            if rows:
                f.write(f"-- Dữ liệu bảng `{t}` ({len(rows)} bản ghi)\n")
                cols = [f"`{k}`" for k in rows[0].keys()]
                col_str = ", ".join(cols)
                
                batch_size = 100
                for i in range(0, len(rows), batch_size):
                    batch = rows[i:i+batch_size]
                    val_strs = []
                    for row in batch:
                        vals = []
                        for v in row.values():
                            if v is None:
                                vals.append("NULL")
                            elif isinstance(v, (int, float)):
                                vals.append(str(v))
                            else:
                                escaped = (
                                    str(v)
                                    .replace("\\", "\\\\")
                                    .replace("'", "\\'")
                                    .replace("\n", "\\n")
                                    .replace("\r", "\\r")
                                )
                                vals.append(f"'{escaped}'")
                        val_strs.append(f"({', '.join(vals)})")
                    f.write(f"INSERT INTO `{t}` ({col_str}) VALUES\n" + ",\n".join(val_strs) + ";\n\n")
                    
        f.write("SET FOREIGN_KEY_CHECKS = 1;\n")

print(f"XUẤT THÀNH CÔNG! File đã được tạo tại: {output_file}")
