# 🚗 Xe Tiện Chuyến — Nền tảng Điều phối & Ghép xe Thông minh

> **Website chính thức:** [https://goghep.id.vn](https://goghep.id.vn)  
> **Tài liệu API Swagger:** [https://goghep.id.vn/docs](https://goghep.id.vn/docs)  
> **Nền tảng triển khai:** Render Web Service + TiDB Cloud MySQL / SQLite

---

## 📖 1. Giới thiệu Dự án

**Xe Tiện Chuyến** là nền tảng kết nối trực tiếp giữa **Hành khách** và **Tài xế** có cùng hành trình di chuyển liên tỉnh (Hà Nội, Hải Phòng, Quảng Ninh, Nam Định, Thái Bình, Miền Trung và Toàn quốc). Hệ thống hỗ trợ:
- **Tiết kiệm 40% – 50% chi phí** so với taxi riêng hoặc thuê xe trọn gói.
- **Ghép xe nhanh theo tuyến đường & thời gian** nhờ AI phân tích dữ liệu chuyến đi và nhu cầu đặt xe.
- **Tự động thu thập & chuẩn hóa dữ liệu** từ mạng xã hội (Facebook, Threads, Zalo) bằng bot cào HTTP chạy theo chu kỳ cấu hình (mặc định 30 phút).
- **Tuân thủ quy định pháp luật**: Thiết kế theo định hướng Nghị định 13/2023/NĐ-CP (Bảo vệ dữ liệu cá nhân) và Nghị định 147/2024/NĐ-CP (Định danh tài khoản bằng số điện thoại).

---

## 🏗️ 2. Kiến trúc Hệ thống (Tech Stack)

| Thành phần | Công nghệ sử dụng | Mục đích |
| :--- | :--- | :--- |
| **Frontend** | React 19, Vite 8, Tailwind CSS 4, React Router 7 | Giao diện SPA cho Trang chủ, Quản trị viên, Tài xế và Hành khách |
| **Backend** | Python 3.11+, FastAPI, Uvicorn, APScheduler | RESTful API, nén GZip, phục vụ static build (`dist/`) và lập lịch quét ghép |
| **AI Extraction** | Google Gemini, OpenAI, Groq | Trích xuất điểm đi, điểm đến, thời gian, số ghế từ bài viết thô |
| **Database** | SQLite (mặc định cục bộ) / TiDB Cloud (MySQL) | Tự động fallback về SQLite cục bộ nếu không cấu hình hoặc mất kết nối MySQL |
| **Crawler Bot** | Python HTTP Workers (Facebook, Threads, Zalo) | Tự động cào bài viết xe ghép theo chu kỳ định kỳ và giám sát qua UI Admin |

---

## 📁 3. Cấu trúc Thư mục

```text
xeghep/
├── src/                          # Mã nguồn giao diện React (Vite)
│   ├── App.jsx                   # Định tuyến (/, /login, /register, /dashboard, /driver, /customer)
│   ├── LandingPage.jsx           # Trang chủ công cộng, giới thiệu & modal Đăng nhập / Đăng ký
│   ├── Dashboard.jsx             # Bảng điều khiển Quản trị viên (Admin)
│   ├── DriverDashboard.jsx       # Bảng điều khiển dành cho Tài xế
│   ├── CustomerDashboard.jsx     # Bảng điều khiển dành cho Hành khách
│   ├── PolicyModal.jsx           # Modal Điều khoản sử dụng & Chính sách bảo mật
│   ├── api.js                    # Thư viện gọi API tập trung (retry & timeout)
│   └── main.jsx                  # Điểm khởi động ứng dụng React
│
├── xeghep-backend/               # Mã nguồn máy chủ Backend (FastAPI)
│   ├── main.py                   # Điểm khởi chạy API, scheduler & phục vụ frontend tĩnh
│   ├── config.py                 # Quản lý cấu hình, biến môi trường, vòng xoay API key
│   ├── database.py               # Quản lý kết nối CSDL (SQLite + TiDB Cloud/MySQL Pool)
│   ├── ai_service.py             # Trích xuất thông tin hành trình bằng AI
│   ├── matching_service.py       # Thuật toán ghép nối chuyến xe & yêu cầu
│   ├── crawler_service.py        # Quản lý tiến trình con các bot cào dữ liệu
│   ├── crawl_facebook_http.py    # Bot cào dữ liệu Facebook (tìm theo từ khóa & nhóm)
│   ├── crawl_threads_http.py     # Bot cào dữ liệu Threads
│   ├── crawl_zalo_http.py        # Bot cào dữ liệu Zalo
│   ├── utils.py                  # Chuẩn hóa tuyến đường, SĐT, ghi log xoay vòng
│   ├── routers/                  # Các module API tách biệt
│   │   ├── auth_routes.py        # Đăng ký, đăng nhập, phân quyền, đổi mật khẩu/avatar
│   │   ├── trips_routes.py       # Quản lý chuyến xe tài xế mở
│   │   ├── requests_routes.py    # Quản lý yêu cầu tìm xe của hành khách
│   │   ├── matches_routes.py     # Quản lý kết quả ghép & đánh giá sao
│   │   ├── posts_routes.py       # Quản lý kho bài viết thô
│   │   ├── admin_routes.py       # Thống kê, quản trị hệ thống & người dùng
│   │   └── crawler_routes.py     # Bật/tắt và theo dõi trạng thái bot cào
│   ├── dist/                     # Bản build giao diện tĩnh do `npm run build` sao chép sang
│   └── requirements.txt          # Thư viện Python backend
│
├── public/                       # Tài nguyên tĩnh (Favicon, Logo, Robots, Sitemap, ads.txt)
├── .env.example                  # File mẫu biến môi trường
├── main.py                       # Entrypoint khởi chạy backend từ thư mục gốc (mặc định port 10000)
├── package.json                  # Cấu hình và script frontend Node.js
├── render.yaml                   # Cấu hình triển khai Blueprint trên Render
└── requirements.txt              # Thư viện Python ở thư mục gốc
```

> Lưu ý: Tệp `xeghep-backend/xeghep.db`, thư mục `logs/`, và tệp `.env` chỉ được tạo/dùng cục bộ và đã được chặn bởi `.gitignore` để không đẩy dữ liệu riêng lên GitHub.

---

## ⚡ 4. Hướng dẫn Cài đặt & Khởi chạy Cục bộ (Local)

### 📌 Yêu cầu Tiên quyết
- **Node.js** >= 18.x
- **Python** >= 3.10 (trên Render sử dụng Python `3.11.9`)
- **Git**

### 👉 Cách 1: Chạy Fullstack Hợp nhất (1 Lệnh — Giống Production trên Render)
Cách này đóng gói giao diện React vào `xeghep-backend/dist/` và phục vụ trực tiếp từ FastAPI:

1. **Clone dự án về máy**:
   ```bash
   git clone https://github.com/datcao-deli/xeghep.git
   cd xeghep
   ```

2. **Cài đặt thư viện Frontend & Build giao diện** *(tùy chọn nếu chỉ chạy nguyên bản vì `xeghep-backend/dist/` đã build sẵn; trên Windows chạy lệnh `npm run build` qua **Git Bash** hoặc WSL)*:
   ```bash
   npm install
   npm run build
   ```

3. **Tạo môi trường ảo Python & Cài đặt thư viện Backend**:
   ```bash
   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate

   # Windows (Command Prompt / PowerShell)
   # python -m venv venv
   # venv\Scripts\activate

   pip install -r requirements.txt
   ```

4. **Khởi chạy ứng dụng**:
   ```bash
   python3 main.py      # Trên Windows dùng: python main.py
   ```
   *(Server mặc định mở cổng `10000` và tự động đồng bộ biến `PORT` cho các tiến trình bot đi kèm.)*

5. **Truy cập trên trình duyệt**:
   - 🌐 Giao diện web: **[http://localhost:10000](http://localhost:10000)**
   - 📑 Tài liệu Swagger API: **[http://localhost:10000/docs](http://localhost:10000/docs)**

---

### 👉 Cách 2: Chạy Tách biệt Frontend & Backend (Dành cho Lập trình viên — Hot Reload)

- **Terminal 1 — Khởi động Backend (Port 8000)**:
  ```bash
  cd xeghep
  source venv/bin/activate       # Windows: venv\Scripts\activate
  cd xeghep-backend
  python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
  ```

- **Terminal 2 — Khởi động Frontend (Port 5173)**:
  ```bash
  cd xeghep
  npm run dev
  ```

Truy cập giao diện phát triển tại **[http://localhost:5173](http://localhost:5173)** *(Vite tự động proxy toàn bộ request `/api` sang `http://127.0.0.1:8000`; giữ nguyên `PORT` được chú thích trong `.env` để bot tự khớp cổng `8000`)*.

---

## 🔑 5. Tài khoản Mặc định & Phân quyền

Khi backend khởi chạy lần đầu, hệ thống tự động tạo tài khoản quản trị mặc định (nếu chưa có trong bảng `users`):

| Vai trò | Tài khoản | Mật khẩu | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (`admin`)** | `admin` | `111` | Đăng nhập tại `/login` để vào `/dashboard` (nên đổi mật khẩu ngay khi deploy thật) |
| **Tài xế (`tai_xe`)** | Tự đăng ký | Tự chọn | Chọn vai trò **Tài xế** ở màn hình **Đăng ký** (`/register`) để vào `/driver` |
| **Hành khách (`khach_hang`)** | Tự đăng ký | Tự chọn | Chọn vai trò **Hành khách** ở màn hình **Đăng ký** (`/register`) để vào `/customer` |

---

## ⚙️ 6. Cấu hình Biến Môi trường (`.env`)

Mặc định dự án chạy ngay với SQLite cục bộ và bộ tách Regex dự phòng mà **không bắt buộc có `.env`**. Khi cần dùng AI key riêng, kết nối TiDB Cloud hoặc cấu hình cookie cho bot, sao chép file mẫu:

```bash
cp .env.example .env
```
*(Backend và cả 3 bot tự động đọc `.env` ở thư mục gốc `xeghep/.env` lẫn `xeghep-backend/.env`, nên đặt ở một trong hai chỗ đều nhận.)*

| Biến | Giá trị mẫu / Mặc định | Giải thích |
| :--- | :--- | :--- |
| `PORT` | *(bỏ trống / chú thích)* | Để trống để tự khớp (`10000` khi chạy `python3 main.py`, `8000` khi chạy `uvicorn`) |
| `DB_TYPE` | `sqlite` hoặc `mysql` | Loại CSDL (`sqlite` cục bộ hoặc `mysql` cho TiDB Cloud / MySQL) |
| `MYSQL_HOST` | `gateway01...tidbcloud.com` | Host máy chủ MySQL / TiDB Cloud |
| `MYSQL_PORT` | `4000` | Cổng TiDB Cloud (`4000`) hoặc MySQL (`3306`) |
| `MYSQL_USER` | `your_username.root` | Tên đăng nhập CSDL |
| `MYSQL_PASSWORD` | *(mật khẩu riêng)* | Mật khẩu CSDL |
| `MYSQL_DB` | `xeghep_db` | Tên cơ sở dữ liệu |
| `AI_PROVIDER` | `gemini` / `openai` / `groq` | Nhà cung cấp AI trích xuất thông tin chuyến đi |
| `GEMINI_API_KEY` | `AIza...` | API Key lấy miễn phí tại [Google AI Studio](https://aistudio.google.com/) (`GEMINI_API_KEY_1..8` hỗ trợ xoay vòng key; nếu bỏ trống vẫn chạy Regex dự phòng) |
| `MATCH_INTERVAL_MINUTES` | `30` | Chu kỳ tự động quét và ghép nối chuyến (phút) |
| `AUTO_START_CRAWLERS` | `false` *(trong `.env.example`)* | Bật/tắt tự khởi động 3 bot khi server mở (`true` / `false`; nếu không tạo `.env` backend mặc định `true`) |
| `FB_COOKIE` / `FB_CRAWL_INTERVAL` | `""` / `1800` | Cookie và chu kỳ quét Facebook (giây, `1800` = 30 phút) |
| `THREADS_COOKIE` / `THREADS_CRAWL_INTERVAL` | `""` / `1800` | Cookie và chu kỳ quét Threads (giây) |
| `ZALO_COOKIES` / `ZALO_CRAWL_INTERVAL` | `""` / `1800` | Cookie và chu kỳ quét Zalo (giây) |
| `PING_URL` | *(chỉ dùng trên Cloud)* | URL health-check chống ngủ đông; mặc định bỏ qua khi chạy cục bộ |

---

## 🤖 7. Hướng dẫn Cấu hình & Vận hành 3 Bot Crawler (Facebook, Threads, Zalo)

Hệ thống tích hợp sẵn trình quản lý tiến trình bot chéo nền tảng (hỗ trợ cả **macOS, Linux/Render và Windows**). Để bot cào được dữ liệu thật từ tài khoản mạng xã hội của bạn:

### Bước 1: Lấy chuỗi Cookie từ trình duyệt
> 💡 Khuyến nghị dùng **tài khoản phụ** để tránh ảnh hưởng tài khoản cá nhân khi quét định kỳ.
1. Mở Chrome hoặc Edge, đăng nhập vào nền tảng tương ứng (`facebook.com`, `chat.zalo.me`, hoặc `threads.net`).
2. Nhấn **F12** (trên Mac: **Cmd + Option + I**) $\rightarrow$ chọn tab **Network (Mạng)** $\rightarrow$ nhấn **F5** / **Cmd + R** tải lại trang.
3. Nhấp vào một request đầu tiên trong danh sách $\rightarrow$ mục **Request Headers** $\rightarrow$ tìm dòng **`Cookie:`** và sao chép toàn bộ chuỗi giá trị của nó.

### Bước 2: Dán cấu hình Cookie cho từng kênh
- **Facebook (`FB_COOKIE`)**:
  - Dán vào `.env`: `FB_COOKIE="c_user=...; xs=...; ..."`
  - *Hoặc* tạo file `xeghep-backend/fb_cookies_extracted.txt` dựa theo mẫu `xeghep-backend/fb_cookies_extracted.txt.example` rồi dán nguyên chuỗi cookie vào đó.
  - *(Nếu bỏ trống cookie, bot vẫn chạy chế độ công khai nhưng Facebook thường yêu cầu đăng nhập khi tìm bài viết hoặc vào nhóm).*
- **Zalo (`ZALO_COOKIES` — Bắt buộc nếu chạy Bot Zalo)**:
  - Lấy chuỗi cookie khi đang mở `https://chat.zalo.me` và dán vào `.env`: `ZALO_COOKIES="..."`.
  - Nếu thiếu `ZALO_COOKIES`, Bot Zalo sẽ bỏ qua chu kỳ quét thay vì báo lỗi.
- **Threads (`THREADS_COOKIE`)**:
  - Có thể cào công khai theo danh sách tag/tài khoản, tuy nhiên nên thêm `THREADS_COOKIE="..."` vào `.env` để giảm bị giới hạn truy cập.
- Đặt `AUTO_START_CRAWLERS=true` trong `.env` nếu muốn cả 3 bot tự chạy ngay khi khởi động backend.

### Bước 3: Bật/tắt Bot, xem Log & tùy chỉnh nguồn cào
- **Điều khiển trên giao diện**: Đăng nhập `admin` / `111` $\rightarrow$ vào `/dashboard` để bật/tắt từng bot hoặc nhấn **Bật tất cả / Tắt tất cả**.
- **Chạy lẻ từng bot để debug**:
  ```bash
  cd xeghep-backend
  python3 crawl_facebook_http.py   # hoặc crawl_threads_http.py / crawl_zalo_http.py
  ```
- **Xem nhật ký vận hành (Logs)**: Xem trực tiếp trên Dashboard hoặc đọc trong `xeghep-backend/logs/` (`facebook_crawler.log`, `threads_crawler.log`, `zalo_crawler.log` — hệ thống tự động cắt gọn khi vượt `3MB`).
- **Tùy chỉnh từ khóa & hội nhóm**: Chỉnh `tu_khoa_tim_kiem` / `danh_sach_nhom_facebook` trong `xeghep-backend/crawl_facebook_http.py`, `nguon_cong_khai_threads` / `tu_khoa_tim_kiem_threads` trong `xeghep-backend/crawl_threads_http.py`, hoặc `tu_khoa_kham_pha` trong `xeghep-backend/crawl_zalo_http.py`.

---

## 🚀 8. Vận hành, Quy trình Cập nhật & Deploy Render

### 🔗 Các trang quản trị hệ thống
| Hạng mục | Đường link | Ghi chú |
| :--- | :--- | :--- |
| **Website chính thức** | [https://goghep.id.vn](https://goghep.id.vn) | Trang chủ & điều phối trực tuyến |
| **Tài liệu API Backend** | [https://goghep.id.vn/docs](https://goghep.id.vn/docs) | Swagger UI kiểm thử API |
| **Kho mã nguồn GitHub** | [https://github.com/datcao-deli/xeghep](https://github.com/datcao-deli/xeghep) | Lưu trữ mã nguồn & kích hoạt deploy |
| **Máy chủ Đám mây Render** | [https://dashboard.render.com](https://dashboard.render.com) | Quản lý Web Service, biến môi trường & logs |
| **CSDL TiDB Cloud** | [https://tidbcloud.com](https://tidbcloud.com) | Bảng điều khiển SQL Editor & quản lý DB online |
| **Quản trị Tên miền Tenten** | [https://tenten.vn](https://tenten.vn) | Cấu hình bản ghi DNS |

### 📤 Quy trình build và đẩy code cập nhật lên Production
Sau khi chỉnh sửa giao diện hoặc backend ở máy cá nhân, thực hiện lần lượt:

```bash
# 1. Build lại giao diện tĩnh (tự cập nhật cả dist/ và xeghep-backend/dist/)
npm run build

# 2. Kiểm tra danh sách file thay đổi (đảm bảo không lộ .env, *.db, cookie)
git status

# 3. Đóng gói commit và đẩy lên nhánh main
git add .
git commit -m "mo_ta_ngan_gon_thay_doi"
git push origin main
```

Render được cấu hình qua `render.yaml` sẽ tự động lấy commit mới trên `main` và cập nhật lại dịch vụ sau vài phút *(lưu ý trên Render cần điền các biến môi trường như `GEMINI_API_KEY_1`, `FB_COOKIE`, `THREADS_COOKIE`, `ZALO_COOKIES`, và `MYSQL_*` trong mục Environment của Web Service)*.

---

## 🗄️ 9. Cấu trúc Dữ liệu & Câu lệnh SQL hay dùng

### Các bảng chính trong CSDL
- `users`: Danh sách tài khoản người dùng (`admin`, `tai_xe`, `khach_hang`).
- `chuyen_xe`: Các chuyến xe do tài xế đăng hoặc bot AI trích xuất.
- `yeu_cau`: Yêu cầu tìm xe / đi nhờ của hành khách.
- `ket_qua_ghep`: Các cặp ghép tự động hoặc đơn khách đặt xe trực tiếp.
- `bai_viet_tho`: Kho bài viết thô thu thập từ mạng xã hội (`facebook`, `zalo`, `threads`, ...).

### Câu lệnh truy vấn nhanh (trên TiDB Cloud SQL Editor / MySQL)
```sql
-- 1. Xem 50 chuyến xe mới nhất
SELECT * FROM chuyen_xe ORDER BY id DESC LIMIT 50;

-- 2. Xem 50 yêu cầu tìm xe mới nhất
SELECT * FROM yeu_cau ORDER BY id DESC LIMIT 50;

-- 3. Xem 50 kết quả ghép / đặt xe mới nhất
SELECT * FROM ket_qua_ghep ORDER BY id DESC LIMIT 50;

-- 4. Xem danh sách tài khoản thành viên (không lấy mật khẩu)
SELECT id, ho_ten, email, sdt, role, created_at FROM users ORDER BY id DESC;

-- 5. Xem 30 bài viết thô gần nhất từ crawler
SELECT id, thoi_gian_tao, nguon, LEFT(noi_dung_tho, 100) AS tom_tat
FROM bai_viet_tho
ORDER BY id DESC
LIMIT 30;
```

---

## 🛡️ 10. Bảo mật & Dữ liệu Bí mật

- Không bao giờ commit file chứa API key, cookie, chuỗi kết nối database hay mật khẩu thực lên GitHub; mọi giá trị thật chỉ lưu trong `.env` cục bộ hoặc Environment Variables trên Render.
- Kiểm tra `git status` trước mỗi lần đẩy code để chắc chắn các tệp nhạy cảm (`.env`, `*.db`, `logs/`, `fb_cookies_extracted.txt`) vẫn nằm trong vùng loại trừ của `.gitignore`.
