# FileShare Mailer (Node.js + Gmail SMTP)

Backend nhận file upload từ trang tĩnh và gửi email kèm attachment tới `TO_EMAIL`.

## Yêu cầu
- Node.js 18+ (khuyến nghị 20+)
- 1 tài khoản Gmail dùng để gửi mail + **App Password**

## 1) Tạo Gmail App Password
1. Bật **2-Step Verification** cho tài khoản Gmail sẽ dùng để gửi.
2. Vào Google Account → Security → **App passwords**
3. Tạo 1 App Password (loại “Mail”) và copy lại.

## 2) Cấu hình môi trường
Trong `server/`, tạo file `.env` (copy từ `.env.example`) và điền:

- `GMAIL_USER`: Gmail của bạn (tài khoản gửi)
- `GMAIL_APP_PASSWORD`: App Password vừa tạo
- `TO_EMAIL`: mặc định là `kietphan28122004@gmail.com`
- `UPLOAD_SECRET`: chuỗi bí mật chống spam (khuyến nghị đặt)
- `ALLOWED_ORIGINS`: domain trang tĩnh của bạn (Netlify/Vercel/GitHub Pages…), phân tách bằng dấu phẩy

Ví dụ:

```bash
PORT=8080
ALLOWED_ORIGINS=https://your-site.netlify.app
UPLOAD_SECRET=change_me_to_random_long_string
GMAIL_USER=yourgmail@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
TO_EMAIL=kietphan28122004@gmail.com
MAX_FILES=5
MAX_TOTAL_MB=20
```

## 3) Chạy local
```bash
cd server
npm install
npm run dev
```

Test nhanh:
- Mở `http://localhost:8080/health` → phải trả `{ "ok": true }`

## 4) Deploy (gợi ý Render)
1. Tạo service Node.js mới, trỏ tới repo/thư mục `server/`
2. Build command: `npm install`
3. Start command: `npm start`
4. Set Environment Variables theo `.env`

Lấy URL backend sau deploy, ví dụ:
- `https://your-api.onrender.com`

## 5) Cấu hình frontend (`index.html`)
Trong `index.html` (gốc dự án), set:

- `BACKEND_URL = 'https://your-api.onrender.com'`
- `UPLOAD_SECRET = '...'` (phải giống `UPLOAD_SECRET` ở backend)

Sau đó upload trang tĩnh lên hosting như bình thường.

## Lưu ý
- Gmail/SMTP có giới hạn; tổng dung lượng file nên giữ < ~20MB.
- Nếu gặp lỗi `EPERM` khi `npm install` trong thư mục OneDrive, thử:
  - Đóng editor đang mở `node_modules`
  - Tạm tắt antivirus/OneDrive sync cho thư mục dự án
  - Hoặc chuyển dự án ra thư mục không sync (ví dụ `C:\\code\\...`)

