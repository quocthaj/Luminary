---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
---

# Story 1.2: Gọi API Upload & Presigned URL với Xử lý lỗi kết nối (Presigned Upload & Network Error Auto-Retry)

Status: done

## Story

As a khách vãng lai hoặc người dùng đã đăng nhập,
I want hệ thống tự động xin Presigned URL từ backend, tải trực tiếp file PDF lên S3 và tự động thử lại khi mất mạng,
So that quá trình tải lên không bị gián đoạn và an toàn.

## Acceptance Criteria

1. **Given** File PDF đã qua bước kiểm tra dung lượng ở Story 1.1,
   **When** Bắt đầu upload, client gọi API `POST /upload` (qua helper `createUploadUrl` trong `fe/lib/api.ts`):
   - Nếu khách vãng lai đã dùng hết 1 lượt dịch thử, API trả về `403 Forbidden` kèm JSON `{ error: "Trial limit exceeded" }`, client hiển thị popup/modal thông báo yêu cầu đăng nhập.
   - Nếu thành công, client thực hiện upload file binary trực tiếp lên S3 Uploads Bucket qua Presigned URL (qua helper `uploadFile`).
2. **Then** Nếu bị mất kết nối mạng giữa chừng (ví dụ: mất mạng, fetch ném ngoại lệ mạng), quá trình upload tạm dừng, hệ thống hiển thị thông báo: *"Kết nối mạng bị gián đoạn. Vui lòng thử lại"* kèm nút "Thử lại" để tiếp tục tải lên (tải lại request) mà không cần tải lại toàn bộ trang web.
3. **And** Thiết lập timeout tối đa 5 phút cho client. Nếu vượt quá, client hủy yêu cầu upload bằng `AbortController` và báo lỗi timeout: *"Thời gian tải lên vượt quá giới hạn (5 phút). Vui lòng thử lại với kết nối tốt hơn."*

## Tasks / Subtasks

- [x] Task 1: Gọi API xin Presigned URL & Xử lý lỗi hết lượt dịch thử (AC: 1)
  - [x] Gọi `createUploadUrl` từ `fe/lib/api.ts` when clicking "Bắt đầu dịch".
  - [x] Kiểm tra lỗi trả về. Nếu API phản hồi status `403` hoặc thông báo lỗi hết lượt dịch thử, hiển thị modal/popup thông báo yêu cầu đăng nhập và ngăn cản quá trình tiếp tục.
  - [x] Cập nhật trạng thái `guest_trial_used = true` trong Cookie và LocalStorage để đồng bộ khóa giao diện.
- [x] Task 2: Triển khai upload file S3 với AbortController và Timeout 5 phút (AC: 3)
  - [x] Sử dụng `AbortController` trong fetch request upload để hỗ trợ cancel/timeout.
  - [x] Thêm cơ chế timeout tự động hủy request sau 5 phút (300,000ms).
  - [x] Nếu bị timeout, hiển thị thông báo lỗi thích hợp: *"Thời gian tải lên vượt quá giới hạn (5 phút). Vui lòng thử lại với kết nối tốt hơn."*
- [x] Task 3: Xử lý lỗi kết nối mạng & Cơ chế Retry thủ công (AC: 2)
  - [x] Bắt các ngoại lệ liên quan đến lỗi kết nối mạng (ví dụ: `TypeError: Failed to fetch`, `navigator.onLine === false`).
  - [x] Khi có lỗi mạng, chuyển trạng thái UI sang thông báo: *"Kết nối mạng bị gián đoạn. Vui lòng thử lại"* kèm nút "Thử lại".
  - [x] Thực hiện retry (gọi lại request tải lên S3 hoặc bắt đầu lại chu kỳ upload) khi nhấn nút "Thử lại" mà không tải lại trang.

### Review Findings

- [x] [Review][Defer] Dev Test Panel left in code for verification [fe/components/UploadView.tsx:482] — deferred, pre-existing

## Dev Notes

### Key Architecture Patterns and Constraints
- **API Helpers**: Sử dụng các hàm trong `fe/lib/api.ts`. Cần cập nhật hàm `uploadFile` để nhận thêm `AbortSignal` nếu cần, hoặc thực hiện fetch trực tiếp với signal.
- **Styling**: Sử dụng các class CSS hiện có và biến CSS định nghĩa trong `globals.css` để hiển thị nút Thử lại và thông báo lỗi. Đảm bảo giao diện đồng nhất với phong cách premium hiện tại.
- **UX**: Khi đang thử lại hoặc tải lên, hiển thị vòng tròn xoay spinner.

### Source tree components to touch
- `fe/components/UploadView.tsx`: Cập nhật hàm `handleUpload` để hỗ trợ retry, abort/timeout, và hiển thị thông báo mạng.
- `fe/lib/api.ts` (tùy chọn): Có thể mở rộng tham số của `uploadFile` để truyền `AbortSignal`.

### References
- [API Contracts](file:///d:/AI/viet-ai-scholar/docs/api-contracts-be.md)
- [Frontend Architecture](file:///d:/AI/viet-ai-scholar/docs/architecture-fe.md)

## Dev Agent Record

### Agent Model Used

Antigravity

### Debug Log References

- Visual validation completed using subagent and saved screenshots.

### Completion Notes List

- Handled S3 upload flow, integrated `AbortController` with a 5-minute timeout.
- Handled API `403` status specifically for trial-exceeded guests, rendering a beautiful warning modal.
- Handled network disconnection errors, displaying a dedicated warning status banner and an interactive "Thử lại" button.
- Added comprehensive manual test controls to the Dev Test Panel to mock and verify network errors and timeouts.

### File List

- `fe/lib/api.ts`
- `fe/components/UploadView.tsx`
