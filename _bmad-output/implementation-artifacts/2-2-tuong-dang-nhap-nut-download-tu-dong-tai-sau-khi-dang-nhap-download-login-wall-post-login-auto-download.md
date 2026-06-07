---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
completed_commit: 28354e1
---

# Story 2.2: Tường đăng nhập nút Download & Tự động tải sau khi đăng nhập (Download Login Wall & Post-Login Auto-Download)

Status: completed

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a khách vãng lai đã dịch xong tài liệu thử nghiệm,
I want hệ thống yêu cầu đăng nhập khi tải bản dịch và tự động tải về sau khi đăng nhập xong,
so that tôi không phải thực hiện lại thao tác tải xuống một lần nữa.

## Acceptance Criteria

1. **Given** Khách vãng lai đã hoàn thành bài dịch thử ở Epic 1 và đang đọc kết quả,
2. **When** Khách bấm nút "Tải xuống" (Download) bản dịch dạng Markdown/PDF,
3. **Then** Hệ thống chặn tải và hiển thị popup/modal yêu cầu đăng nhập.
4. **And** Ngay sau khi khách đăng nhập thành công từ popup này, hệ thống phải tự động thực hiện lệnh tải file bản dịch về máy tính của người dùng ngay lập tức mà không yêu cầu bấm lại nút Download.

## Tasks / Subtasks

- [x] Task 1: Tách modal đăng nhập hiện tại từ `UploadView.tsx` thành component dùng chung `LoginModal.tsx` (AC: 3)
  - [x] Tạo file component mới `fe/components/LoginModal.tsx` đóng gói giao diện và logic gửi OTP/xác minh/đăng nhập Google.
  - [x] Hỗ trợ prop `isOpen: boolean`, `onClose: () => void`, và đặc biệt là `onSuccess?: () => void` để kích hoạt callback tải file sau khi đăng nhập thành công.
  - [x] Cập nhật `UploadView.tsx` để nhập và sử dụng `LoginModal` mới thay thế cho đoạn mã modal inline cũ.
- [x] Task 2: Triển khai tường đăng nhập và tự động download sau đăng nhập tại `ResultView.tsx` (AC: 1, 2, 3, 4)
  - [x] Import và sử dụng hook `useSession` để nhận diện trạng thái xác thực trong `ResultView.tsx`.
  - [x] Thêm các state: `showLoginModal` (hiển thị modal đăng nhập) và `pendingDownload` (cờ đánh dấu để tự động tải sau khi login thành công).
  - [x] Thay đổi thẻ `<a>` tải về hiện tại thành một `<button>` hoặc hàm trung gian `handleDownloadClick` để kiểm soát hành vi.
  - [x] Nếu đã đăng nhập (`status === 'authenticated'`), thực hiện tải trực tiếp bằng cách tạo động thẻ `a` ẩn với `download` attribute hoặc `window.location.href = downloadUrl`.
  - [x] Nếu chưa đăng nhập, kích hoạt hiển thị `LoginModal` và đánh dấu `pendingDownload = true`.
  - [x] Khi đăng nhập thành công thông qua `onSuccess`, ẩn modal, tự động kích hoạt tải file bản dịch ngay lập tức, sau đó reset cờ `pendingDownload`.
  - [x] Đảm bảo việc đăng nhập thành công không làm reload trang để bảo toàn trạng thái bản dịch song ngữ đang hiển thị.
- [x] Task 3: Viết suite test E2E để kiểm chứng tính năng chặn tải và tự động tải (AC: 1, 2, 3, 4)
  - [x] Tạo file test `fe/tests/download.spec.ts` sử dụng Playwright.
  - [x] Viết test case: Đi thẳng vào route xem kết quả dịch thử (ví dụ: `/?jobId=mock-123`), click nút Tải về, verify modal đăng nhập xuất hiện. Nhập email đăng nhập OTP, mô phỏng nhập OTP thành công từ Dev Test Panel, verify modal tự động đóng và trình duyệt kích hoạt tải file.

## Dev Notes

### Project Structure Notes

- **Component Tái sử dụng**: Component `LoginModal.tsx` cần được đặt trong `fe/components/` để đảm bảo tính nhất quán của cấu trúc dự án.
- **NextAuth integration**: Đảm bảo sử dụng `useSession()` của NextAuth v5 client-side để đồng bộ trạng thái đăng nhập nhanh chóng mà không gây giật lag UI.
- **Aesthetic**: Giữ nguyên thiết kế glassmorphism cao cấp của modal đăng nhập (backdrop-filter: blur, rounded-3xl, màu sắc tối giản tinh tế theo hệ thống CSS hiện tại).

### References

- [Source: epics.md#Story 2.2](file:///d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/epics.md#L180-L190)
- [Source: components/UploadView.tsx#L568-L756](file:///d:/AI/viet-ai-scholar/fe/components/UploadView.tsx#L568-L756)

## Dev Agent Record

### Agent Model Used

Gemini 1.5 Pro (Antigravity)

### Debug Log References

### Completion Notes List

### File List
