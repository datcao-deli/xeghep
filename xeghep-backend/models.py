from pydantic import BaseModel
from typing import Optional

class RegisterData(BaseModel):
    hoTen: str
    email: str
    password: str
    sdt: str = ""
    role: Optional[str] = "khach_hang"

class LoginData(BaseModel):
    email: str
    password: str

class AdminCreateUserIn(BaseModel):
    ho_ten: str
    email: str
    password: str
    sdt: Optional[str] = None
    role: str = "user"
    avatar_url: Optional[str] = None

class AdminUpdateUserIn(BaseModel):
    ho_ten: str
    sdt: Optional[str] = None
    role: str = "user"
    password: Optional[str] = None
    avatar_url: Optional[str] = None

class UserProfileUpdateIn(BaseModel):
    ho_ten: Optional[str] = None
    sdt: Optional[str] = None
    password_cu: Optional[str] = None
    password_moi: Optional[str] = None
    avatar_url: Optional[str] = None

class AdminTripStatusIn(BaseModel):
    trang_thai: str
    so_ghe_trong: Optional[int] = None

class AdminRequestStatusIn(BaseModel):
    trang_thai: str

class PostIn(BaseModel):
    noi_dung_tho: str

class CrawlerPostIn(BaseModel):
    noi_dung_tho: str
    nguon: str = "facebook"
    thoi_gian_tao: Optional[str] = None

class PostUpdate(BaseModel):
    noi_dung_tho: str

class TripIn(BaseModel):
    diem_di: str
    diem_den: str
    thoi_gian_chay: str
    so_ghe_trong: int = 1
    sdt: str = ""

class RequestIn(BaseModel):
    diem_di: str
    diem_den: str
    thoi_gian_don: str
    so_khach: int = 1
    sdt: str = ""

class SearchQuery(BaseModel):
    diem_di: str
    diem_den: str
    thoi_gian: str = ""

class JoinTripIn(BaseModel):
    sdt: str
    so_khach: int = 1
    diem_di: str = ""
    diem_den: str = ""
    thoi_gian_don: str = ""

class AcceptRequestIn(BaseModel):
    chuyen_xe_id: Optional[int] = None
    sdt: Optional[str] = None
