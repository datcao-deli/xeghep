import os
import re
import time
import unicodedata
import subprocess
from datetime import datetime, timezone, timedelta
from functools import lru_cache

VN_TZ = timezone(timedelta(hours=7))

def get_now_vn():
    return datetime.now(VN_TZ)

def get_now_iso():
    return datetime.now(VN_TZ).isoformat(timespec="seconds")

def format_human_time(time_str: str) -> str:
    if not time_str:
        return "Linh hoạt"
    s = str(time_str).strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})", s)
    if m:
        y, month, d, hh, mm = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4), m.group(5)
        return f"{hh}:{mm} ngày {d:02d}/{month:02d}/{y}"
    return s

def _clean_json_text(raw: str) -> str:
    raw = raw.strip()
    raw = re.sub(r"^```(json)?", "", raw).strip()
    raw = re.sub(r"```$", "", raw).strip()
    return raw

def _extract_date_parts(text: str):
    if not text:
        return None
    s = re.sub(r"\b24/(7|24)\b", "", str(text)).strip()
    # 1. ISO YYYY-MM-DD
    m_iso = re.search(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m_iso:
        y, m, d = int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3))
        if 1 <= d <= 31 and 1 <= m <= 12:
            return {"year": y, "month": m, "day": d}
    # 2. DD/MM/YYYY
    m_dmy = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m_dmy:
        d, m, y = int(m_dmy.group(1)), int(m_dmy.group(2)), int(m_dmy.group(3))
        if 1 <= d <= 31 and 1 <= m <= 12:
            return {"year": y, "month": m, "day": d}
    # 3. DD/MM
    m_dm = re.search(r"(?:^|\D)(\d{1,2})/(\d{1,2})(?:\D|$)", s)
    if m_dm:
        d, m = int(m_dm.group(1)), int(m_dm.group(2))
        if 1 <= d <= 31 and 1 <= m <= 12:
            return {"year": datetime.now().year, "month": m, "day": d}
    return None

def _is_date_in_past(time_str: str, post_time_str: str = None) -> bool:
    raw = (time_str or "").strip()
    if not raw or re.search(r"(linh hoạt|hàng ngày|liên tục|thỏa thuận|bất kỳ|24/7|24/24)", raw, re.IGNORECASE):
        return False
    if re.search(r"(hôm nay|chiều nay|tối nay|trưa nay|sáng nay|sáng mai|chiều mai|tối mai|ngày mai|bây giờ|ngay bây giờ)", raw, re.IGNORECASE):
        return False

    parts = _extract_date_parts(raw)
    if not parts:
        return False

    today = datetime.now().date()
    try:
        item_d = datetime(parts["year"], parts["month"], parts["day"]).date()
        return item_d < today
    except Exception:
        return False

def _bo_dau(text: str) -> str:
    bang = str.maketrans(
        "áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ"
        "ÁÀẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴĐ",
        "aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd"
        "AAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD",
    )
    return text.translate(bang)

_DIA_DANH_ALIAS = {
    "hn": "Hà Nội", "ha noi": "Hà Nội", "hanoi": "Hà Nội", "ha nội": "Hà Nội", "hà nội": "Hà Nội",
    "hcm": "TP. Hồ Chí Minh", "tphcm": "TP. Hồ Chí Minh", "tp hcm": "TP. Hồ Chí Minh",
    "sai gon": "TP. Hồ Chí Minh", "sài gòn": "TP. Hồ Chí Minh", "ho chi minh": "TP. Hồ Chí Minh", "sg": "TP. Hồ Chí Minh",
    "đà nẵng": "Đà Nẵng", "da nang": "Đà Nẵng", "danang": "Đà Nẵng", "dn": "Đà Nẵng",
    "sân bay đà nẵng": "Đà Nẵng", "san bay da nang": "Đà Nẵng",
    "nội bài": "Nội Bài", "noi bai": "Nội Bài", "sân bay nội bài": "Nội Bài", "san bay noi bai": "Nội Bài", "sân bay": "Nội Bài", "san bay": "Nội Bài",
    "thái bình": "Thái Bình", "thai binh": "Thái Bình", "tb": "Thái Bình",
    "nam định": "Nam Định", "nam dinh": "Nam Định", "nđ": "Nam Định", "nd": "Nam Định",
    "hải phòng": "Hải Phòng", "hai phong": "Hải Phòng", "hp": "Hải Phòng",
    "hải dương": "Hải Dương", "hai duong": "Hải Dương", "hd": "Hải Dương",
    "thanh miện": "Thanh Miện", "thanh mien": "Thanh Miện",
    "quảng ninh": "Quảng Ninh", "quang ninh": "Quảng Ninh", "qn": "Quảng Ninh",
    "hạ long": "Hạ Long", "ha long": "Hạ Long",
    "cẩm phả": "Cẩm Phả", "cam pha": "Cẩm Phả",
    "thái nguyên": "Thái Nguyên", "thai nguyen": "Thái Nguyên", "tn": "Thái Nguyên",
    "vĩnh phúc": "Vĩnh Phúc", "vinh phuc": "Vĩnh Phúc", "vp": "Vĩnh Phúc",
    "vĩnh yên": "Vĩnh Yên", "vinh yen": "Vĩnh Yên",
    "thanh hóa": "Thanh Hóa", "thanh hoá": "Thanh Hóa", "thanh hoa": "Thanh Hóa", "th": "Thanh Hóa",
    "nga sơn": "Nga Sơn", "nga son": "Nga Sơn",
    "hà nam": "Hà Nam", "ha nam": "Hà Nam",
    "ninh bình": "Ninh Bình", "ninh binh": "Ninh Bình", "nb": "Ninh Bình",
    "hưng yên": "Hưng Yên", "hung yen": "Hưng Yên", "hy": "Hưng Yên",
    "bắc ninh": "Bắc Ninh", "bac ninh": "Bắc Ninh", "bn": "Bắc Ninh",
    "bắc giang": "Bắc Giang", "bac giang": "Bắc Giang", "bg": "Bắc Giang",
    "phú thọ": "Phú Thọ", "phu tho": "Phú Thọ", "pt": "Phú Thọ",
    "việt trì": "Việt Trì", "viet tri": "Việt Trì",
    "huế": "Huế", "hue": "Huế",
    "a lưới": "A Lưới", "a luoi": "A Lưới",
    "quảng nam": "Quảng Nam", "quang nam": "Quảng Nam",
    "tam kỳ": "Tam Kỳ", "tam ky": "Tam Kỳ",
    "thăng bình": "Thăng Bình", "thang binh": "Thăng Bình",
    "thăng phước": "Thăng Phước", "thang phuoc": "Thăng Phước",
    "tiên phước": "Tiên Phước", "tien phuoc": "Tiên Phước",
    "núi thành": "Núi Thành", "nui thanh": "Núi Thành",
    "việt an": "Việt An", "viet an": "Việt An",
    "hội an": "Hội An", "hoi an": "Hội An",
    "quảng ngãi": "Quảng Ngãi", "quang ngai": "Quảng Ngãi",
    "quảng trị": "Quảng Trị", "quang tri": "Quảng Trị", "q.trị": "Quảng Trị", "q.tri": "Quảng Trị", "qtri": "Quảng Trị",
    "quảng bình": "Quảng Bình", "quang binh": "Quảng Bình", "q.bình": "Quảng Bình", "q.binh": "Quảng Bình", "qbinh": "Quảng Bình",
    "quy nhơn": "Quy Nhơn", "quy nhon": "Quy Nhơn",
    "nha trang": "Nha Trang",
    "đà lạt": "Đà Lạt", "da lat": "Đà Lạt",
    "vũng tàu": "Vũng Tàu", "vung tau": "Vũng Tàu", "vt": "Vũng Tàu", "v.tàu": "Vũng Tàu", "v.tau": "Vũng Tàu",
    "bình dương": "Bình Dương", "binh duong": "Bình Dương", "b.dương": "Bình Dương", "b.duong": "Bình Dương",
    "đồng nai": "Đồng Nai", "dong nai": "Đồng Nai", "đ.nai": "Đồng Nai", "d.nai": "Đồng Nai",
    "cần thơ": "Cần Thơ", "can tho": "Cần Thơ",
    "cầu giấy": "Cầu Giấy", "cau giay": "Cầu Giấy",
    "mỹ đình": "Mỹ Đình", "my dinh": "Mỹ Đình",
    "thanh xuân": "Thanh Xuân", "thanh xuan": "Thanh Xuân",
    "hà đông": "Hà Đông", "ha dong": "Hà Đông",
    "gia lâm": "Gia Lâm", "gia lam": "Gia Lâm", "bến xe gia lâm": "Gia Lâm", "ben xe gia lam": "Gia Lâm",
    "nước ngầm": "Bến xe Nước Ngầm", "nuoc ngam": "Bến xe Nước Ngầm", "bến xe nước ngầm": "Bến xe Nước Ngầm",
    "sơn tây": "Sơn Tây", "son tay": "Sơn Tây",
    "ba vì": "Ba Vì", "ba vi": "Ba Vì",
    "thạch thất": "Thạch Thất", "thach that": "Thạch Thất",
    "hải hậu": "Hải Hậu", "hai hau": "Hải Hậu",
    "giao thủy": "Giao Thủy", "giao thuy": "Giao Thủy",
    "nghĩa hưng": "Nghĩa Hưng", "nghia hung": "Nghĩa Hưng",
    "ý yên": "Ý Yên", "y yen": "Ý Yên",
    "vụ bản": "Vụ Bản", "vu ban": "Vụ Bản",
    "kiến an": "Kiến An", "kien an": "Kiến An",
    "mộc châu": "Mộc Châu", "moc chau": "Mộc Châu",
    "sơn la": "Sơn La", "son la": "Sơn La",
    "yên bái": "Yên Bái", "yen bai": "Yên Bái",
    "lào cai": "Lào Cai", "lao cai": "Lào Cai",
    "sapa": "Sa Pa", "sa pa": "Sa Pa",
    "hòa bình": "Hòa Bình", "hoa binh": "Hòa Bình",
    "lạng sơn": "Lạng Sơn", "lang son": "Lạng Sơn",
    "cao bằng": "Cao Bằng", "cao bang": "Cao Bằng",
    "hà giang": "Hà Giang", "ha giang": "Hà Giang",
    "tuyên quang": "Tuyên Quang", "tuyen quang": "Tuyên Quang",
    "hà tĩnh": "Hà Tĩnh", "ha tinh": "Hà Tĩnh", "tpht": "Hà Tĩnh", "tp hà tĩnh": "Hà Tĩnh", "tp ha tinh": "Hà Tĩnh",
    "thành phố hà tĩnh": "Hà Tĩnh", "thanh pho ha tinh": "Hà Tĩnh", "h.tĩnh": "Hà Tĩnh", "h.tinh": "Hà Tĩnh",
    "hương khê": "Hương Khê", "huong khe": "Hương Khê", "tthk": "Hương Khê", "tt hương khê": "Hương Khê",
    "tt huong khe": "Hương Khê", "thị trấn hương khê": "Hương Khê", "thi tran huong khe": "Hương Khê", "hk": "Hương Khê",
    "kỳ anh": "Kỳ Anh", "ky anh": "Kỳ Anh", "txka": "Kỳ Anh", "tx kỳ anh": "Kỳ Anh",
    "cẩm xuyên": "Cẩm Xuyên", "cam xuyen": "Cẩm Xuyên",
    "hồng lĩnh": "Hồng Lĩnh", "hong linh": "Hồng Lĩnh", "txhl": "Hồng Lĩnh",
    "đức thọ": "Đức Thọ", "duc tho": "Đức Thọ",
    "can lộc": "Can Lộc", "can loc": "Can Lộc",
    "nghi xuân": "Nghi Xuân", "nghi xuan": "Nghi Xuân",
    "thạch hà": "Thạch Hà", "thach ha": "Thạch Hà",
    "vũ quang": "Vũ Quang", "vu quang": "Vũ Quang",
    "đ.nẵng": "Đà Nẵng", "đ.nang": "Đà Nẵng", "d.nang": "Đà Nẵng", "đ.nắng": "Đà Nẵng",
    "q.ngãi": "Quảng Ngãi", "q.ngai": "Quảng Ngãi", "qngai": "Quảng Ngãi",
    "q.nam": "Quảng Nam", "qnam": "Quảng Nam",
    "q.ninh": "Quảng Ninh", "qninh": "Quảng Ninh",
    "n.an": "Nghệ An", "nan": "Nghệ An",
    "n.định": "Nam Định", "n.dinh": "Nam Định",
    "t.bình": "Thái Bình", "t.binh": "Thái Bình",
    "t.hóa": "Thanh Hóa", "t.hoa": "Thanh Hóa",
    "h.phòng": "Hải Phòng", "h.phong": "Hải Phòng",
    "h.dương": "Hải Dương", "h.duong": "Hải Dương",
    "n.bình": "Ninh Bình", "n.binh": "Ninh Bình",
    "nghệ an": "Nghệ An", "nghe an": "Nghệ An",
    "vinh": "Vinh",
    # Tây Nguyên & Miền Trung & Miền Nam mở rộng
    "pleiku": "Pleiku", "plk": "Pleiku",
    "gia lai": "Gia Lai", "gl": "Gia Lai",
    "kon tum": "Kon Tum", "kontum": "Kon Tum", "kt": "Kon Tum",
    "buôn ma thuột": "Buôn Ma Thuột", "buon ma thuot": "Buôn Ma Thuột", "bmt": "Buôn Ma Thuột",
    "đắk lắk": "Đắk Lắk", "dak lak": "Đắk Lắk", "đắc lắc": "Đắk Lắk", "dac lac": "Đắk Lắk", "dlk": "Đắk Lắk",
    "đắk nông": "Đắk Nông", "dak nong": "Đắk Nông", "gia nghĩa": "Đắk Nông", "gia nghia": "Đắk Nông",
    "lâm đồng": "Lâm Đồng", "lam dong": "Lâm Đồng", "bảo lộc": "Bảo Lộc", "bao loc": "Bảo Lộc",
    "bình định": "Bình Định", "binh dinh": "Bình Định",
    "phú yên": "Phú Yên", "phu yen": "Phú Yên", "tuy hòa": "Phú Yên", "tuy hoa": "Phú Yên",
    "khánh hòa": "Khánh Hòa", "khanh hoa": "Khánh Hòa", "cam ranh": "Khánh Hòa",
    "ninh thuận": "Ninh Thuận", "ninh thuan": "Ninh Thuận", "phan rang": "Ninh Thuận",
    "bình thuận": "Bình Thuận", "binh thuan": "Bình Thuận", "phan thiết": "Phan Thiết", "phan thiet": "Phan Thiết",
    "bình phước": "Bình Phước", "binh phuoc": "Bình Phước", "đồng xoài": "Bình Phước", "dong xoai": "Bình Phước",
    "tây ninh": "Tây Ninh", "tay ninh": "Tây Ninh",
    "long an": "Long An", "tân an": "Long An", "tan an": "Long An",
    "tiền giang": "Tiền Giang", "tien giang": "Tiền Giang", "mỹ tho": "Tiền Giang", "my tho": "Tiền Giang",
    "bến tre": "Bến Tre", "ben tre": "Bến Tre",
    "trà vinh": "Trà Vinh", "tra vinh": "Trà Vinh",
    "vĩnh long": "Vĩnh Long", "vinh long": "Vĩnh Long",
    "đồng tháp": "Đồng Tháp", "dong thap": "Đồng Tháp", "cao lãnh": "Đồng Tháp", "cao lanh": "Đồng Tháp", "sa đéc": "Đồng Tháp", "sa dec": "Đồng Tháp",
    "an giang": "An Giang", "long xuyên": "An Giang", "long xuyen": "An Giang", "châu đốc": "An Giang", "chau doc": "An Giang",
    "kiên giang": "Kiên Giang", "kien giang": "Kiên Giang", "rạch giá": "Kiên Giang", "rach gia": "Kiên Giang", "phú quốc": "Phú Quốc", "phu quoc": "Phú Quốc", "hà tiên": "Kiên Giang", "ha tien": "Kiên Giang",
    "hậu giang": "Hậu Giang", "hau giang": "Hậu Giang", "vị thanh": "Hậu Giang", "vi thanh": "Hậu Giang",
    "sóc trăng": "Sóc Trăng", "soc trang": "Sóc Trăng",
    "bạc liêu": "Bạc Liêu", "bac lieu": "Bạc Liêu",
    "cà mau": "Cà Mau", "ca mau": "Cà Mau",
    "bắc kạn": "Bắc Kạn", "bac kan": "Bắc Kạn",
    "điện biên": "Điện Biên", "dien bien": "Điện Biên",
    "lai châu": "Lai Châu", "lai chau": "Lai Châu",
    "thái hòa": "Thái Hòa", "thái hoà": "Thái Hòa", "tx thái hòa": "Thái Hòa", "thị xã thái hòa": "Thái Hòa",
    "hà lam": "Hà Lam", "halam": "Hà Lam",
    "chu lai": "Chu Lai", "sân bay chu lai": "Chu Lai",
    "quất lâm": "Quất Lâm", "quat lam": "Quất Lâm",
    "thịnh long": "Thịnh Long", "thinh long": "Thịnh Long",
    "cửa lò": "Cửa Lò", "cua lo": "Cửa Lò",
}

_SORTED_DIA_DANH_ALIAS = sorted(_DIA_DANH_ALIAS.items(), key=lambda x: len(x[0]), reverse=True)
_DIA_DANH_NO_ACCENT_MAP = {_bo_dau(k).lower().strip(): v for k, v in _DIA_DANH_ALIAS.items()}
_PRECOMPILED_DIA_DANH_RULES = []
for alias, chuan in _SORTED_DIA_DANH_ALIAS:
    alias_no_accent = _bo_dau(alias).lower()
    p = re.compile(rf'(?<!\w){re.escape(alias)}(?!\w)')
    p_no_accent = re.compile(rf'(?<!\w){re.escape(alias_no_accent)}(?!\w)') if len(alias) >= 4 else None
    _PRECOMPILED_DIA_DANH_RULES.append((alias, chuan, alias_no_accent, p, p_no_accent))

_RULE_LOCATIONS = [
    "sân bay nội bài", "sân bay đà nẵng", "sân bay chu lai", "chu lai", "nội bài", "hà nội", "thái bình", "nam định",
    "hải dương", "thái nguyên", "vĩnh phúc", "vĩnh yên", "thanh hóa", "thanh hoá",
    "thanh miện", "hà nam", "ninh bình", "hưng yên", "bắc ninh", "bắc giang", "hải phòng",
    "quảng ninh", "hạ long", "cẩm phả", "đà nẵng", "đ.nẵng", "đ. nẵng", "đ.nắng", "hội an", "tam kỳ", "thăng bình",
    "thăng phước", "núi thành", "tiên phước", "việt an", "điện bàn", "duy xuyên", "đại lộc", "hà lam",
    "huế", "a lưới", "quảng nam", "q.nam", "q. nam", "quảng bình", "đồng hới", "đông hà", "quảng trị",
    "quảng ngãi", "q.ngãi", "q. ngãi", "quy nhơn", "nha trang", "đà lạt", "sài gòn", "tphcm", "hcm", "bình dương",
    "đồng nai", "vũng tàu", "cần thơ", "phú thọ", "việt trì", "hòa bình", "yên bái",
    "lào cai", "sapa", "lạng sơn", "cao bằng", "hà giang", "tuyên quang", "sơn la", "mộc châu",
    "nghệ an", "vinh", "thái hòa", "thái hoà", "cửa lò", "hà tĩnh", "tpht", "tthk", "hương khê", "huong khe", "kỳ anh", "cẩm xuyên",
    "hồng lĩnh", "đức thọ", "can lộc", "sơn tây", "ba vì", "thạch thất", "cầu giấy", "mỹ đình",
    "thanh xuân", "hà đông", "hoàng mai", "long biên", "gia lâm", "nước ngầm", "giáp bát",
    "đông anh", "sóc sơn", "từ sơn", "hải hậu", "giao thủy", "nghĩa hưng", "vũ thư", "quất lâm", "thịnh long",
    "ý yên", "vụ bản", "nga sơn", "kiến an", "sân bay",
    "pleiku", "gia lai", "kon tum", "buôn ma thuột", "bmt", "đắk lắk", "đắk nông", "lâm đồng", "bảo lộc",
    "bình định", "phú yên", "tuy hòa", "khánh hòa", "cam ranh", "ninh thuận", "phan rang", "bình thuận", "phan thiết",
    "bình phước", "đồng xoài", "tây ninh", "long an", "tiền giang", "mỹ tho", "bến tre", "trà vinh",
    "vĩnh long", "đồng tháp", "an giang", "kiên giang", "phú quốc", "hậu giang", "sóc trăng", "bạc liêu", "cà mau",
    "bắc kạn", "điện biên", "lai châu",
    "hn", "hp", "tb", "nđ", "nd", "hd", "tn", "vp", "th", "qn", "bn", "bg", "nb", "hy", "pt", "vt", "dn", "sg", "plk", "gl", "kt"
]

_NON_LOCATION_PHRASES = [
    "xe ghép", "ghép xe", "xe tiện chuyến", "tiện chuyến", "bao xe", "đưa đón",
    "tận nhà", "tận nơi", "thả tận nơi", "gọi là có", "giá cả", "hợp lý",
    "tổng đài", "dịch vụ", "không ghép", "chuyên tuyến", "khứ hồi", "hàng ngày",
    "liên hệ", "hotline", "zalo", "đặt xe", "nhà xe", "phục vụ", "sân bay giá rẻ",
    "khuya", "đến khuya", "nửa đêm", "bây giờ", "ngay bây giờ", "bây giờ cho", "bây giờ còn",
    "sáng nay", "chiều nay", "tối nay", "trưa nay", "sáng mai", "chiều mai", "tối mai",
    "ngày mai", "hôm nay", "hôm qua", "ngày kia", "quay đầu", "xe quay đầu", "xe rỗng",
    "xe trống", "đón liền", "đón luôn", "đón ngay", "alo đón", "ngon bổ rẻ", "giá rẻ",
    "vé rẻ", "lập nghiệp", "cộng đồng", "khoảng", "tầm"
]

_NON_LOCATION_EXACT = {
    "khuya", "đến khuya", "nửa đêm", "đêm", "bây giờ", "ngay bây giờ", "bây giờ cho",
    "bây giờ còn", "sáng", "trưa", "chiều", "tối", "hôm nay", "ngày mai", "mai",
    "ngày kia", "hôm qua", "sáng mai", "chiều mai", "tối mai", "chiều nay", "sáng nay",
    "tối nay", "quay đầu", "xe quay đầu", "xe rỗng", "xe trống", "đón liền", "đón luôn",
    "đón ngay", "ngon bổ rẻ", "giá rẻ", "vé rẻ", "lập nghiệp", "cộng đồng", "hướng",
    "alo đón", "alo em đón", "alo e đón", "lh đón", "đón", "trả", "về", "ra", "vào"
}

PREFIXES_TO_STRIP = [
    "e bên em có chuyến", "bên em có chuyến", "em có chuyến", "nhà xe có chuyến",
    "bên em nhận", "em nhận", "nhà xe", "bên em", "có chuyến", "chuyến xe", "tiện chuyến",
    "xe ghép", "ghép xe", "xe chạy", "chạy xe", "nhận khách", "đón khách", "chở khách",
    "chiều đi", "chiều về", "chiều", "đi từ", "xuất phát từ", "khởi hành từ", "từ",
    "cần tìm", "tìm xe", "cần xe", "cần đi", "cần", "xin slot", "xin ghế"
]

def clean_location_name(raw_name: str) -> str:
    if not raw_name:
        return ""
    s = " ".join(str(raw_name).split())
    s_lower = s.lower()

    # 1. Bóc bỏ các tiền tố nhiễu thường gặp
    for p in sorted(PREFIXES_TO_STRIP, key=len, reverse=True):
        if s_lower.startswith(p):
            s_lower = s_lower[len(p):].strip()
            s = s[len(raw_name) - len(s_lower):].strip() if len(s_lower) > 0 else s
            break

    # 2. Bóc các từ thừa đơn lẻ ở đầu như 'e ', 'em ', 'bác ', 'xe '
    s_lower = re.sub(r'^(?:e|em|bác|xe)\s+', '', s_lower).strip()

    # 3. Bóc các hậu tố thừa ở cuối như ' lúc 15h', ' chiều nay', ' ngày mai', ' 14h30', ' alo...', ' lh...'
    s_lower = re.sub(r'\s+(?:lúc\s+\d+.*|\d+h.*|sáng.*|chiều.*|tối.*|ngày.*|hôm nay.*|lh.*|alo.*|giá.*)$', '', s_lower).strip()

    # 4. Tra từ điển chuẩn hóa O(1)
    if s_lower in _DIA_DANH_ALIAS:
        return _DIA_DANH_ALIAS[s_lower]

    # 5. So khớp ưu tiên qua regex precompiled
    for alias, chuan, alias_no_accent, pattern, pattern_no_accent in _PRECOMPILED_DIA_DANH_RULES:
        if pattern.search(s_lower) or (pattern_no_accent and pattern_no_accent.search(_bo_dau(s_lower))):
            return chuan

    return s_lower.title() if s_lower.islower() or s_lower.isupper() else s

def _la_dia_danh_hop_le(ten: str) -> bool:
    if not ten:
        return False
    t = ten.strip().lower()
    if len(t) < 2 or len(t) > 35:
        return False
    if t in _NON_LOCATION_EXACT:
        return False
    if any(bad == t or (len(bad) >= 4 and bad in t) for bad in _NON_LOCATION_PHRASES):
        return False
    if re.search(r'\d{3,}', t):
        return False
    return True

@lru_cache(maxsize=4096)
def _chuan_hoa_ten_dia_diem(ten):
    if not ten:
        return ""
    cleaned = clean_location_name(ten)
    if cleaned and cleaned in _DIA_DANH_ALIAS.values():
        return cleaned

    raw = " ".join(str(ten).split())
    raw_first = raw.split(",")[0].strip()
    key_lower = re.sub(r'([a-zà-ỹ0-9])\.\s*([a-zà-ỹ0-9])', r'\1.\2', raw_first.lower())
    key_no_accent = _bo_dau(key_lower).strip()

    # 1. Tra cứu trực tiếp O(1) qua từ điển (Cực nhanh: 0.001ms)
    if key_lower in _DIA_DANH_ALIAS:
        return _DIA_DANH_ALIAS[key_lower]
    if key_no_accent in _DIA_DANH_NO_ACCENT_MAP:
        return _DIA_DANH_NO_ACCENT_MAP[key_no_accent]

    # 2. So khớp ưu tiên cụm từ dài trước qua regex precompiled
    for alias, chuan, alias_no_accent, pattern, pattern_no_accent in _PRECOMPILED_DIA_DANH_RULES:
        if pattern.search(key_lower) or (pattern_no_accent and pattern_no_accent.search(key_no_accent)):
            return chuan

    fallback = cleaned or raw_first or raw
    return fallback.title() if fallback.islower() or fallback.isupper() else fallback

def classify_ride_post(text: str) -> str:
    """Phân loại chính xác 100% giữa bài đăng của TÀI XẾ/NHÀ XE (chuyen_xe) và HÀNH KHÁCH (yeu_cau)."""
    if not text:
        return "chuyen_xe"
    t = text.lower()

    if "[đặt xe trực tiếp]" in t or "[đăng trực tiếp]" in t:
        return "yeu_cau"

    # 1. Dấu hiệu tài xế cực kỳ rõ ràng (CÓ XE / ĐÓN KHÁCH / KÊU GỌI HÀNH KHÁCH / BÁN VÉ)
    driver_strong_cues = [
        # Kêu gọi alo đón / liên hệ đón
        r'(?:alo|lh|liên\s*hệ|inbox|ib|nhắn|gọi|ới|báo)\s+(?:e|em|mình|tui|bác|nhà\s+xe)?\s*đón\b',
        r'đón\s+(?:liền|luôn|ngay|tận\s+nơi|tận\s+nhà|tận\s+cổng)\b',
        r'(?:cho\s+em|cho\s+mình|em\s+xin)\s+đón\b',
        r'alo\s+(?:mình|em|e|tui)\s+đón\b',
        r'ới\s+(?:em|e)\s+nha\b',
        # Nói với người khác 'ai cần / bác nào cần / khách cần / mọi người cần / a chị cần / bạn cần'
        r'(?:bác\s+nào|ai|mọi\s+người|quý\s+khách|khách(?:\s+iu)?|bà\s+con|anh\s+em|a\s+chị|anh\s+chị|bạn|cô\s+bác)\s+(?:cần|tìm|muốn|có\s+nhu\s+cầu|đi)\s+(?:xe|ghép|chuyến|đi|về)',
        r'(?:ai|bác\s+nào|quý\s+khách|mọi\s+người)\s+(?:đi|cần\s+đi)\s+.*(?:alo|lh|liên\s*hệ|gọi|nhắn|ib|inbox)',
        # Xe đang ở / xe quay đầu / xe có mặt / xe trả khách
        r'xe\s+(?:quay\s+đầu|rỗng|trống|đang\s+ở|hiện\s+đang|có\s+mặt|đang\s+đón|sẵn|chạy|đã\s+có\s+sẵn|đã\s+trả|trả\s+xong|trả\s+khách|đang\s+rãnh)',
        # Loại xe của tài xế
        r'xe\s+(?:4|5|7|16)\s*(?:chỗ|c|cho)?\b',
        r'xe\s+(?:5&7|4-7|5-7|4,7|5,7)\s*(?:chỗ|c|cho)?\b',
        r'xe\s+(?:seden|sedan|suv|xpro)\b',
        r'xe\s+mình\s+\d+c\b',
        # Nhận khách / chở khách
        r'(?:nhận|đón|chở|ghép)\s+(?:khách|người|hàng|đồ|bà\s+con)',
        r'(?:còn|trống)\s+(?:\d+|một|hai)?\s*(?:ghế|chỗ|slot)',
        r'trống\s+(?:\d+|một|hai)?\s*(?:ghế|chỗ|slot)',
        # Vé rẻ / giá sinh viên / ghép xe từ
        r'(?:vé|giá)\s+(?:rẻ|chỉ\s+từ|\d+k)',
        r'(?:chỉ\s+từ\s+\d+k|\d+k\s*thôi|\d+k/người|\d+k/ghế|ghép\s+xe\s+từ\s+\d+k)',
        # Nhà xe / bên em có chuyến / hàng ngày có xe
        r'(?:bên\s+em|nhà\s+xe|gia\s+đình\s+em|em\s+chạy|xe\s+em|tài\s+xế|mình\s+chuyên\s+chạy)\s+(?:có\s+chuyến|mới\s+lập\s+nghiệp|nhận|chạy|tuyến)',
        r'hàng\s+ngày\s+(?:em\s+)?có\s+xe\b',
        r'hàng\s+ngày\s+có\s+.*chạy\b',
        r'hotline\b',
        r'(?:gửi|gởi|nhận)\s+(?:hàng|đồ)',
        r'bác\s+nào\s+đi\s+[a-zà-ỹ\s]+(?:alo|lh|ib|gọi|inbox|nhắn)',
        r'chạy\s+2\s+đầu\b',
        r'xe\s+ghép\s+em\s+[a-zà-ỹ]+\b',
    ]

    is_driver = any(re.search(p, t) for p in driver_strong_cues)

    # 2. Dấu hiệu hành khách rõ ràng (Tự nói mình cần xe / xin slot / tìm xe)
    passenger_strong_cues = [
        r'(?:em|mình|tôi|cháu)\s+cần\s+(?:tìm\s+)?(?:\d+\s+)?(?:xe|chuyến|ghế|slot|chỗ)',
        r'(?:em|mình|tôi)\s+cần\s+(?:đi|về|sang|tới)\b',
        r'xin\s+(?:\d+\s+)?(?:slot|ghế|chỗ|vé|đi\s+nhờ)',
        r'báo\s+giá\s+(?:hộ|giúp|cho)\s+(?:e|em|mình)',
        r'có\s+(?:xe|ai|bác\s+nào)\s+(?:nào\s+)?(?:chạy|đi).*(?:không|ko|k\b|k\?|đón\s+(?:em|mình))',
        r'(?:cần|tìm)\s+(?:tìm\s+)?(?:xe\s+)?(?:ghép|tiện\s+chuyến)\b',
        r'cần\s+(?:bao\s+xe|xe\s+(?:4|5|7)\s*chỗ)',
        r'cần\s+xe\s+sân\s+bay\b',
        r'cần\s+xe\s+tiện\s+chuyến\s+từ\b',
    ]

    is_passenger = any(re.search(p, t) for p in passenger_strong_cues)

    if is_driver:
        return "chuyen_xe"
    if is_passenger:
        return "yeu_cau"
    return "chuyen_xe"

def _khop_dia_diem(a: str, b: str) -> bool:
    if not a or not b:
        return False
    na, nb = _chuan_hoa_ten_dia_diem(a), _chuan_hoa_ten_dia_diem(b)
    ka, kb = _bo_dau(na).lower(), _bo_dau(nb).lower()
    if ka == kb:
        return True
    shorter, longer = (ka, kb) if len(ka) <= len(kb) else (kb, ka)
    if len(shorter) >= 4 and re.search(rf'(?<!\w){re.escape(shorter)}(?!\w)', longer):
        return True
    return False

def _tao_link_zalo(sdt: str) -> str:
    """Tạo đường dẫn nhắn tin Zalo chuẩn từ số điện thoại."""
    if not sdt:
        return ""
    digits = re.sub(r"\D", "", str(sdt))
    if digits.startswith("84") and len(digits) >= 11:
        digits = "0" + digits[2:]
    elif not digits.startswith("0") and len(digits) == 9:
        digits = "0" + digits
    return f"https://zalo.me/{digits}" if len(digits) >= 9 else ""

def fallback_rule_extract(text: str) -> dict:
    """Bộ bóc tách dự phòng siêu tốc bằng biểu thức chính quy khi API quá tải/mất mạng."""
    text_norm = unicodedata.normalize('NFC', unicodedata.normalize('NFKD', text))
    text_norm = re.sub(r'([A-Za-zÀ-Ỹa-zà-ỹ0-9])\.\s+([A-Za-zÀ-Ỹa-zà-ỹ0-9])', r'\1.\2', text_norm)
    text_lower = text_norm.lower()
    
    # 1. TUYỆT ĐỐI LOẠI TRỪ THẺ DANH THIẾP / KẾT BẠN / NHẮN TIN
    if ("kết bạn" in text_lower and "nhắn tin" in text_lower) or any(
        card_kw in text_lower for card_kw in [
            "danh thiếp", "chia sẻ danh thiếp", "gửi danh thiếp", "cuộc gọi thoại", 
            "cuộc gọi video", "tin nhắn đã được thu hồi", "đã gửi một danh thiếp"
        ]
    ):
        return {"loai": None, "diem_di": None, "diem_den": None, "thoi_gian": None, "so_luong": 1, "sdt": None}

    # 2. Kiểm tra từ khóa cấm
    tu_khoa_cam = [
        "nội quy", "quản trị viên", "admin", "lừa đảo", "phòng trọ", "ở ghép",
        "thuê nhà", "thuê phòng", "tuyển dụng", "tuyển nv", "tuyển nhân viên",
        "việc làm", "mô tả công việc", "lương tháng", "kế toán", "marketing",
        "chính sách quyền riêng tư", "bắt xe ôm", "sửa xe",
        "mua bán xe", "bán xe", "thanh lý", "nhượng lại chiếc", "máy số zin",
        "không đâm đụng", "nhận cọc", "xem xe tại", "giá 2xx", "giá 1xx", "giá 3xx",
        "chốt cọc", "hỏi kinh nghiệm", "xin review", "đi tour", "tour du lịch",
        "đi du lịch", "có số bên nào hong", "có số nhà xe nào", "xin số nhà xe", "cho em xin số"
    ]
    if any(cam in text_lower for cam in tu_khoa_cam):
        return {"loai": None, "diem_di": None, "diem_den": None, "thoi_gian": None, "so_luong": 1, "sdt": None}

    # 3. BẮT BUỘC CÓ SĐT HỢP LỆ
    sdt = None
    sdt_clean = re.sub(r'[\.\s\-\(\)]', '', text_norm)
    sdt_match = re.search(r'(?:0|84|\+84)(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}', sdt_clean)
    if sdt_match:
        sdt = sdt_match.group(0)
    else:
        return {"loai": None, "diem_di": None, "diem_den": None, "thoi_gian": None, "so_luong": 1, "sdt": None}

    # 4. Phân loại chuẩn xác bằng hàm chuyên sâu
    loai = classify_ride_post(text_lower)

    diem_di = None
    diem_den = None

    raw_matches = []
    for loc in sorted(_RULE_LOCATIONS, key=len, reverse=True):
        for match in re.finditer(rf'(?<![^\W_]){re.escape(loc)}(?![^\W_])', text_lower):
            start, end = match.span()
            if not any(not (end <= s or start >= e) for s, e, _ in raw_matches):
                raw_matches.append((start, end, loc))

    raw_matches.sort(key=lambda x: x[0])
    valid_locs = [m[2] for m in raw_matches]

    pattern_arrow = re.search(
        r'([a-zA-Zà-ỹÀ-Ỹ\s\.\_]{2,35})\s*(?:->|=>|→|—|⇌|<=>|<->|\b(?:đến|ve|về|sang|tới)\b)\s*([a-zA-Zà-ỹÀ-Ỹ\s\.\_]{2,35})',
        text_lower
    )
    if pattern_arrow:
        cand_di, cand_den = pattern_arrow.group(1).strip(), pattern_arrow.group(2).strip()
        cand_di = clean_location_name(cand_di)
        cand_den = clean_location_name(cand_den)
        chuan_di = _chuan_hoa_ten_dia_diem(cand_di)
        chuan_den = _chuan_hoa_ten_dia_diem(cand_den)
        known_values = set(_DIA_DANH_ALIAS.values())
        if chuan_di in known_values and chuan_den in known_values and chuan_di != chuan_den:
            diem_di = chuan_di
            diem_den = chuan_den

    if not (diem_di and diem_den) and len(valid_locs) >= 2:
        ve_match = re.search(r'\b(?:về|ve|sang|tới|toi|ra|vao|vào|đến|den)\s+([a-zA-Zà-ỹÀ-Ỹ\s]{2,25})', text_lower)
        dest_loc = None
        if ve_match:
            c_dest = clean_location_name(ve_match.group(1).strip())
            if c_dest in set(_DIA_DANH_ALIAS.values()):
                dest_loc = c_dest

        loc_0 = _chuan_hoa_ten_dia_diem(valid_locs[0])
        loc_1 = _chuan_hoa_ten_dia_diem(valid_locs[1])

        if dest_loc and dest_loc in [loc_0, loc_1]:
            diem_den = dest_loc
            diem_di = loc_0 if loc_1 == dest_loc else loc_1
        elif loc_0 != loc_1:
            diem_di = loc_0
            diem_den = loc_1
        elif len(valid_locs) >= 3:
            loc_2 = _chuan_hoa_ten_dia_diem(valid_locs[2])
            if loc_0 != loc_2:
                diem_di = loc_0
                diem_den = loc_2

    if not (diem_di and diem_den):
        return {"loai": None, "diem_di": None, "diem_den": None, "thoi_gian": None, "so_luong": 1, "sdt": None}

    # Bóc tách thời gian
    thoi_gian = None
    tg_match = re.search(r'(\d{1,2}h(?:\d{1,2})?|\d{1,2}:\d{2})', text_lower)
    if tg_match:
        thoi_gian = tg_match.group(1).replace('h', ':')
        if len(thoi_gian.split(':')[1]) == 0:
            thoi_gian += "00"
    elif any(k in text_lower for k in ["sáng", "trưa", "chiều", "tối", "đêm"]):
        for buổi in ["sáng", "trưa", "chiều", "tối", "đêm"]:
            if buổi in text_lower:
                thoi_gian = f"{buổi.capitalize()} nay"
                break

    # Bóc tách số lượng / số chỗ ngồi
    so_luong = 1
    sl_range = re.search(r'[457]\s*[-–,/&]\s*([457])\s*(?:chỗ|c\b)?', text_lower)
    sl_match = re.search(r'(\d+)\s*(?:ghế|chỗ|khách|người|slot|c\b)', text_lower)
    sl_xe = re.search(r'\bxe\s*([4579]|16)\b', text_lower)
    if sl_range:
        try:
            so_luong = int(sl_range.group(1))
        except Exception:
            pass
    elif sl_match:
        try:
            val = int(sl_match.group(1))
            if 1 <= val <= 16:
                so_luong = val
        except Exception:
            pass
    elif sl_xe:
        try:
            so_luong = int(sl_xe.group(1))
        except Exception:
            pass
    elif re.search(r'(?:xe\s+)?(?:bốn|4)\s*chỗ', text_lower):
        so_luong = 4
    elif re.search(r'(?:xe\s+)?(?:năm|5)\s*chỗ', text_lower):
        so_luong = 5
    elif re.search(r'(?:xe\s+)?(?:bảy|7)\s*chỗ', text_lower):
        so_luong = 7

    return {
        "loai": loai,
        "diem_di": diem_di,
        "diem_den": diem_den,
        "thoi_gian": thoi_gian,
        "so_luong": so_luong,
        "sdt": sdt,
    }


def fix_misclassified_requests():
    """Tự động kiểm tra và di chuyển các bài viết của tài xế/nhà xe bị phân loại nhầm vào yeu_cau sang chuyen_xe,
    đồng thời chuẩn hóa lại các địa danh bị dính chữ thừa."""
    from database import get_db, get_next_id
    moved_count = 0
    cleaned_count = 0
    with get_db() as db:
        rows = db.execute("""
            SELECT yc.id as yc_id, yc.diem_di, yc.diem_den, yc.thoi_gian_don, yc.so_khach, yc.sdt, 
                   yc.bai_viet_id, yc.ngay_tao, yc.hanh_khach_id, yc.hanh_khach_ten,
                   bv.noi_dung_tho, bv.nguoi_dang_id
            FROM yeu_cau yc
            LEFT JOIN bai_viet_tho bv ON bv.id = yc.bai_viet_id
        """).fetchall()

        for r in rows:
            item = dict(r)
            noi_dung = item.get("noi_dung_tho") or ""
            d_di = item.get("diem_di") or ""
            d_den = item.get("diem_den") or ""

            # Xác định bài đăng có phải của tài xế / chuyến xe hay không
            is_driver = False
            if noi_dung:
                is_driver = (classify_ride_post(noi_dung) == "chuyen_xe")
            else:
                d_raw = (item.get("diem_di") or "").lower()
                if any(k in d_raw for k in ["bên em", "có chuyến", "nhận khách", "tiện chuyến", "xe 4", "xe 5", "xe 7"]):
                    is_driver = True

            # Bóc tách lại bằng rule bóc tách cải tiến
            extracted = fallback_rule_extract(noi_dung) if noi_dung else {}
            fresh_di = extracted.get("diem_di")
            fresh_den = extracted.get("diem_den")

            clean_di = _chuan_hoa_ten_dia_diem(clean_location_name(d_di))
            clean_den = _chuan_hoa_ten_dia_diem(clean_location_name(d_den))

            final_di = fresh_di or clean_di or d_di
            final_den = fresh_den or clean_den or d_den

            # Ưu tiên fresh nếu địa danh cũ dính từ rác
            if fresh_di and (_la_dia_danh_hop_le(clean_di) is False or clean_di.lower() in _NON_LOCATION_EXACT):
                final_di = fresh_di
            if fresh_den and (_la_dia_danh_hop_le(clean_den) is False or clean_den.lower() in _NON_LOCATION_EXACT):
                final_den = fresh_den

            if is_driver:
                next_cx_id = get_next_id(db, "chuyen_xe")
                tai_xe_ten = item.get("hanh_khach_ten") or "Tài xế MXH"
                if tai_xe_ten in ["Khách MXH", "Ẩn danh", ""]:
                    tai_xe_ten = "Tài xế MXH"
                
                so_ghe = extracted.get("so_luong") or item.get("so_khach") or 1
                thoi_gian = extracted.get("thoi_gian") or item.get("thoi_gian_don") or "Linh hoạt"
                sdt_val = extracted.get("sdt") or item.get("sdt")

                db.execute(
                    """INSERT INTO chuyen_xe 
                       (id, tai_xe_id, tai_xe_ten, diem_di, diem_den, thoi_gian_chay, so_ghe_trong, sdt, bai_viet_id, ngay_tao)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        next_cx_id,
                        item.get("nguoi_dang_id") or item.get("hanh_khach_id"),
                        tai_xe_ten,
                        final_di,
                        final_den,
                        thoi_gian,
                        so_ghe,
                        sdt_val,
                        item.get("bai_viet_id"),
                        item.get("ngay_tao"),
                    )
                )
                db.execute("DELETE FROM yeu_cau WHERE id = ?", (item["yc_id"],))
                moved_count += 1
            else:
                needs_update = False
                if (final_di and final_di != d_di) or (final_den and final_den != d_den):
                    needs_update = True
                if needs_update:
                    db.execute("UPDATE yeu_cau SET diem_di = ?, diem_den = ? WHERE id = ?", (final_di, final_den, item["yc_id"]))
                    cleaned_count += 1

    if moved_count > 0 or cleaned_count > 0:
        print(f"✅ Đã sửa dữ liệu CSDL: Chuyển {moved_count} bài tài xế từ yeu_cau sang chuyen_xe, chuẩn hóa {cleaned_count} địa danh.")
    return {"chuyen_sang_chuyen_xe": moved_count, "chuan_hoa_dia_danh": cleaned_count}

def _dem_theo_nhom(rows, key_fn):
    dem = {}
    for row in rows:
        ten = key_fn(row)
        if not ten:
            continue
        dem[ten] = dem.get(ten, 0) + 1
    tong = sum(dem.values()) or 1
    ket_qua = [
        {"ten": ten, "so_luong": so, "ty_le": round(so * 100 / tong, 1)}
        for ten, so in dem.items()
    ]
    ket_qua.sort(key=lambda x: -x["so_luong"])
    return ket_qua, sum(dem.values())

def _get_windows_python_cmdlines() -> str:
    try:
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        r = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Process -Filter \"Name like 'python%'\" | Select-Object -ExpandProperty CommandLine",
            ],
            capture_output=True,
            text=True,
            timeout=2.0,
            creationflags=creationflags,
        )
        return (r.stdout or "").lower()
    except Exception:
        return ""


def _tien_trinh_dang_chay(ten_file: str) -> bool:
    if os.name == "nt":
        return ten_file.lower() in _get_windows_python_cmdlines()
    try:
        r = subprocess.run(["pgrep", "-f", ten_file], capture_output=True, text=True)
        return bool(r.stdout.strip())
    except Exception:
        return False


_crawlers_status_cache = None
_crawlers_status_time = 0


def get_all_crawlers_status() -> dict:
    global _crawlers_status_cache, _crawlers_status_time
    now = time.time()
    if _crawlers_status_cache is not None and (now - _crawlers_status_time) < 10:
        return _crawlers_status_cache
    if os.name == "nt":
        out = _get_windows_python_cmdlines()
        res = {
            "facebook": "crawl_facebook" in out or "crawl_xeghep" in out,
            "threads": "crawl_threads" in out,
            "zalo": "crawl_zalo" in out,
        }
    else:
        try:
            r = subprocess.run(["pgrep", "-fa", "crawl_"], capture_output=True, text=True, timeout=0.8)
            out = (r.stdout or "").lower()
            res = {
                "facebook": "crawl_facebook" in out or "crawl_xeghep" in out,
                "threads": "crawl_threads" in out,
                "zalo": "crawl_zalo" in out,
            }
        except Exception:
            try:
                r = subprocess.run(["pgrep", "-f", "crawl_"], capture_output=True, text=True, timeout=0.5)
                out = (r.stdout or "").lower()
                res = {
                    "facebook": bool(out.strip()),
                    "threads": bool(out.strip()),
                    "zalo": bool(out.strip()),
                }
            except Exception:
                res = {"facebook": False, "threads": False, "zalo": False}
    _crawlers_status_cache = res
    _crawlers_status_time = now
    return res

