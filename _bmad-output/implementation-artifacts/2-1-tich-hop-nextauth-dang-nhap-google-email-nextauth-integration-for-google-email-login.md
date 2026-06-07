---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
---

# Story 2.1: Tích hợp NextAuth Đăng nhập Google & Email (NextAuth Integration for Google & Email Login)

Status: completed

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a khách vãng lai,
I want đăng nhập nhanh bằng tài khoản Google hoặc nhận mã OTP qua Email,
so that tôi có tài khoản cá nhân để lưu bài dịch và mở khóa tính năng tải file.

## Acceptance Criteria

1. **Given** Khách vãng lai bấm vào nút "Đăng nhập" ở góc màn hình hoặc bị chặn bởi giới hạn dịch thử,
   **When** Popup hoặc trang đăng nhập hiển thị,
   **Then** Người dùng có thể chọn các phương thức xác thực sau:
   - Đăng nhập bằng Google (Google OAuth Provider).
   - Đăng nhập bằng Email OTP (Credentials Provider với mã xác nhận OTP).
2. **And** Sau khi đăng nhập thành công:
   - NextAuth thiết lập cookie session mã hóa stateless JWT (sử dụng HS256 với khóa bí mật `AUTH_SECRET`).
   - Thông tin người dùng được lưu trữ vào trạng thái client để sử dụng trong phiên làm việc.
   - Chuyển hướng người dùng về trang trước đó hoặc trang `/library` nếu có yêu cầu bảo vệ.

## Tasks / Subtasks

- [ ] Task 1: Thiết lập và cấu hình NextAuth v5 (Auth.js) ở Frontend (AC: 1, 2)
  - [ ] Cài đặt các package: `npm install next-auth@beta` trong thư mục `fe`.
  - [ ] Tạo file cấu hình chính `fe/auth.ts` chứa định nghĩa NextAuthConfig và các Provider (Google, Credentials).
  - [ ] Tạo API Route Handler `fe/app/api/auth/[...nextauth]/route.ts` để tiếp nhận request GET/POST của auth.
  - [ ] Cấu hình Session strategy là `jwt` (stateless JWT).
- [ ] Task 2: Triển khai luồng Email OTP bảo mật không dùng database (AC: 1)
  - [ ] Xây dựng Server Route `fe/app/api/auth/otp/send/route.ts` nhận request `{ email }`.
  - [ ] API này sinh mã 6 chữ số ngẫu nhiên, tạo chữ ký số HMAC SHA256 dạng `hash = HMAC(email + otp + expires, AUTH_SECRET)`.
  - [ ] Gửi mã OTP qua email người dùng (sử dụng Resend API hoặc Nodemailer; hỗ trợ in mã OTP ra console/terminal khi chạy ở môi trường DEV).
  - [ ] Trả về Client payload chứa `{ signature: `${hash}.${expires}` }` làm bằng chứng xác thực tạm thời.
  - [ ] Cấu hình custom Credentials provider trong `fe/auth.ts` nhận các tham số `email`, `otp`, và `signature`.
  - [ ] Tại hàm `authorize()`, tính toán lại HMAC hash bằng `AUTH_SECRET` và kiểm tra xem OTP gửi lên khớp với chữ ký số, đồng thời thời gian hiện tại chưa vượt quá `expires`. Nếu đúng, trả về user object.
- [ ] Task 3: Tạo Middleware bảo mật Route (AC: 2)
  - [ ] Tạo file `fe/middleware.ts` sử dụng hàm `auth` từ `fe/auth.ts`.
  - [ ] Cấu hình matcher để bảo vệ các tuyến đường `/library` và `/api/preview/*`. Nếu chưa đăng nhập, tự động redirect về trang chủ hoặc hiển thị Modal đăng nhập.
- [ ] Task 4: Cập nhật giao diện Login Modal trong UploadView (AC: 1)
  - [ ] Cập nhật file `fe/components/UploadView.tsx`, thay thế alert bằng UI đăng nhập thực tế.
  - [ ] Giao diện hỗ trợ hai chế độ: nhập Email và gửi OTP, và nhập mã OTP để xác nhận đăng nhập.
  - [ ] Thêm nút "Đăng nhập bằng Google" gọi hàm `signIn('google')`.
  - [ ] Tích hợp hiển thị thông tin user (Avatar, Email) ở góc trên cùng của giao diện sau khi đăng nhập thành công.

## Dev Notes

### Key Architecture Patterns and Constraints
- **Stateless JWT Sessions**: Tránh việc cài đặt Database Adapter làm nặng runtime và gây lỗi Cold Start ở Lambda / Edge. Toàn bộ logic OTP và Session đều chạy stateless thông qua JWT mã hóa sử dụng `AUTH_SECRET`.
- **HMAC Verification Flow**:
  1. Gửi OTP: Server tính `hash = hmac(email + otp + expires, secret)`. Trả về `sig = hash + '.' + expires` cho client.
  2. Xác minh: Client gửi `email, otp, sig`. Server tách `hash` và `expires`, tính lại `expectedHash = hmac(email + otp + expires, secret)`. So khớp hashes và kiểm tra thời gian hết hạn.
- **Vercel Env Keys**: Cần chuẩn bị sẵn các biến môi trường:
  - `AUTH_SECRET`: Khóa bí mật dùng chung (HS256).
  - `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`: OAuth credentials từ Google Developer Console.

### Source Tree Components to Touch
- `fe/auth.ts` (NEW)
- `fe/middleware.ts` (NEW)
- `fe/app/api/auth/[...nextauth]/route.ts` (NEW)
- `fe/app/api/auth/otp/send/route.ts` (NEW)
- `fe/components/UploadView.tsx` (UPDATE)

### References
- Tài liệu kiến trúc: [architecture.md](file:///d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/architecture.md#L303-L308)
- File UploadView hiện tại: [UploadView.tsx](file:///d:/AI/viet-ai-scholar/fe/components/UploadView.tsx#L475-L489)

## Dev Agent Record

### Agent Model Used

Gemini 3.5 Sonnet

### Debug Log References

### Completion Notes List

### File List
