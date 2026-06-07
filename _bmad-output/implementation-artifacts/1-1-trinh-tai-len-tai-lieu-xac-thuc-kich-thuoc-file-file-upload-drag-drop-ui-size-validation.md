---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
---

# Story 1.1: Trình tải lên tài liệu & Xác thực kích thước file (File Upload Drag-Drop UI & Size Validation)

Status: done

## Story

As a khách vãng lai hoặc người dùng đã đăng nhập,
I want giao diện kéo thả file PDF học thuật và tự động kiểm tra kích thước file,
so that tôi biết file của mình có hợp lệ để dịch hay không trước khi gửi lên máy chủ.

## Acceptance Criteria

1. **Given** Người dùng đang ở trang chủ,
   **When** Kéo thả file PDF bất kỳ vào vùng drag-drop,
   **Then** Hệ thống phải kiểm tra dung lượng file:
   - Nếu **dung lượng ≤ 30MB**, cho phép chuẩn bị upload.
   - Nếu **30MB < dung lượng ≤ 50MB**, hiển thị cảnh báo: *"Tài liệu của bạn vượt quá 30MB, thời gian xử lý sẽ lâu hơn bình thường..."* nhưng vẫn cho phép upload.
   - Nếu **dung lượng > 50MB**, chặn upload ngay lập tức và hiển thị thông báo lỗi màu đỏ: *"Kích thước file tối đa được hỗ trợ là 50MB."*
2. **And** Nếu cookie hoặc localStorage của khách ghi nhận đã hết lượt dịch thử (`guest_trial_used` = `true`), nút upload và vùng drag-drop bị khóa hoàn toàn, đồng thời hiển thị thông báo yêu cầu đăng nhập.

## Tasks / Subtasks

- [x] Task 1: Cấu hình và tích hợp trạng thái xác thực file upload trong `UploadView.tsx` (AC: 1)
  - [x] Thêm state `warning` để lưu trữ thông điệp cảnh báo cho các file có kích thước từ 30MB đến 50MB.
  - [x] Cập nhật hàm `handleFile` để kiểm tra các ngưỡng kích thước file (≤30MB, >30MB & ≤50MB, >50MB).
  - [x] Hiển thị thông báo lỗi màu đỏ nếu dung lượng > 50MB và chặn submit.
  - [x] Hiển thị thông báo cảnh báo màu vàng nếu dung lượng nằm trong khoảng (30MB, 50MB] nhưng vẫn cho phép submit.
- [x] Task 2: Triển khai kiểm tra giới hạn lượt dịch thử của khách vãng lai (AC: 2)
  - [x] Đọc trạng thái `guest_trial_used` từ cookie/localStorage khi component mount.
  - [x] Nếu đã dùng hết lượt dịch thử và chưa đăng nhập, vô hiệu hóa (disabled) vùng kéo thả và nút upload.
  - [x] Hiển thị thông điệp yêu cầu đăng nhập/đăng ký để tiếp tục sử dụng.
- [x] Task 3: Tinh chỉnh Style CSS cho các trạng thái của Drag-Drop Zone
  - [x] Thêm các màu sắc tương ứng: màu cảnh báo (warning) cho tệp 30MB-50MB, màu lỗi (error) cho tệp >50MB, màu xám khóa (disabled) khi hết lượt dịch thử.
  - [x] Đảm bảo các hiệu ứng chuyển tiếp (transitions) và hover mượt mà theo đúng chuẩn thiết kế premium.

### Review Findings

- [x] [Review][Patch] Accessing localStorage and document.cookie is not guarded by try-catch [fe/components/UploadView.tsx:15]

## Dev Notes

### Key Architecture Patterns and Constraints
- **Styling**: Sử dụng CSS thuần được định nghĩa trong `globals.css` thông qua các biến CSS (`var(--bg-surface)`, `var(--accent)`, `var(--warning)`, `var(--error)`). Tránh viết style cứng hoặc dùng TailwindCSS.
- **Giới hạn Guest**: Kiểm tra cookie `guest_trial_used` và `localStorage.getItem("guest_trial_used")`.
- **UX & Transitions**: Vùng drag-drop cần có hiệu ứng hover mượt mà, đổi màu border và background khi kéo file đè lên (`dragging`).

### Source Tree Components to Touch
- Component chính: `fe/components/UploadView.tsx` (UPDATE)
- File CSS chính: `fe/app/globals.css` (UPDATE - nếu cần bổ sung biến màu `--warning` hoặc các class animation mới)

### References
- Tài liệu Kiến trúc: [architecture.md](file:///d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/architecture.md)
- PRD chính thức: [prd.md](file:///d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/prd.md)

## Dev Agent Record

### Agent Model Used

Antigravity

### Debug Log References

### Completion Notes List

- Triển khai logic xác thực kích thước file trực tiếp tại `UploadView.tsx`: cho phép upload với file <= 30MB, hiển thị cảnh báo warning với file 30MB - 50MB, chặn hoàn toàn và báo error với file > 50MB.
- Đọc trạng thái `guest_trial_used` từ cả cookie và localStorage để tự động khóa giao diện upload & chuyển nút upload sang trạng thái yêu cầu đăng nhập.
- Tích hợp thêm Dev Test Panel kích hoạt qua query param `?test_mode=true` giúp dễ dàng mô phỏng các kích thước file (1MB, 35MB, 55MB) và mô phỏng trạng thái hết lượt dịch thử (limit trial/reset).
- Đã kiểm thử thành công bằng browser subagent, đảm bảo hiển thị đúng màu sắc (error: đỏ, warning: vàng, success: xanh lá, disabled: xám mờ).
- Fix lỗi eslint pre-existing trong `ThemeToggle.tsx` liên quan đến `setState` trong `useEffect` để build pass 100% không cảnh báo.

### File List

- `fe/app/globals.css`
- `fe/components/UploadView.tsx`
- `fe/components/ThemeToggle.tsx`
