import time
import re
import hashlib
from fastapi import HTTPException, Depends, Header
from database import get_db

_user_cache = {}
_user_cache_time = {}

def hash_password(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()

def _validate_password_complexity(password: str):
    if not password or len(password) < 8:
        raise HTTPException(status_code=400, detail="Mật khẩu phải có tối thiểu 8 ký tự")
    if not re.search(r"[A-Z]", password):
        raise HTTPException(status_code=400, detail="Mật khẩu phải chứa ít nhất 1 chữ cái in hoa (A-Z)")
    if not re.search(r"\d", password):
        raise HTTPException(status_code=400, detail="Mật khẩu phải chứa ít nhất 1 chữ số (0-9)")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>\-_+=\[\]\\\/]", password):
        raise HTTPException(status_code=400, detail="Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (!@#$...)")

def _validate_user_registration(ho_ten: str, email: str, sdt: str, password: str):
    ho_ten_clean = (ho_ten or "").strip()
    if not ho_ten_clean:
        raise HTTPException(status_code=400, detail="Vui lòng nhập họ và tên")

    email_clean = (email or "").strip()
    if not email_clean or not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email_clean):
        raise HTTPException(status_code=400, detail="Email không đúng định dạng (Ví dụ: name@domain.com)")

    sdt_digits = re.sub(r"\D", "", sdt or "")
    if sdt_digits.startswith("84") and len(sdt_digits) == 11:
        sdt_digits = "0" + sdt_digits[2:]
    if not re.match(r"^0\d{9}$", sdt_digits):
        raise HTTPException(status_code=400, detail="Số điện thoại phải có đúng 10 chữ số và bắt đầu bằng số 0")

    _validate_password_complexity(password)

def current_user(x_user_id: str = Header(default=None)):
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Thiếu thông tin đăng nhập")
    now = time.time()
    if x_user_id in _user_cache and (now - _user_cache_time.get(x_user_id, 0)) < 60:
        return _user_cache[x_user_id]
    with get_db() as db:
        u = db.execute("SELECT * FROM users WHERE id = ?", (x_user_id,)).fetchone()
    if not u:
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    u_dict = dict(u)
    _user_cache[x_user_id] = u_dict
    _user_cache_time[x_user_id] = now
    return u_dict

def require_admin(user=Depends(current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Chỉ quản trị viên được phép")
    return user

def require_driver(user=Depends(current_user)):
    if user.get("role") not in ("tai_xe", "admin"):
        raise HTTPException(status_code=403, detail="Chức năng chỉ dành cho tài xế hoặc quản trị viên")
    return user

def require_customer(user=Depends(current_user)):
    if user.get("role") not in ("khach_hang", "admin", "user"):
        raise HTTPException(status_code=403, detail="Chức năng chỉ dành cho hành khách hoặc quản trị viên")
    return user

def invalidate_user_cache(user_id: int):
    """Xóa cache khi user cập nhật thông tin"""
    s_id = str(user_id)
    _user_cache.pop(s_id, None)
    _user_cache_time.pop(s_id, None)
