---
baseline_commit: 5ac71d1
---

# Story 2.5: S3 Streaming Proxy & Xem lại bài dịch cũ với Nút dịch lại (S3 Streaming Proxy, S3 Cache Loading & Re-process)

Status: done

## Story

As a người dùng đã đăng nhập,
I want mở lại bài viết cũ siêu tốc và có thể yêu cầu dịch lại bài báo khi cần thiết,
so that tôi không bị mất thời gian chờ đợi dịch lại từ đầu và có thể cập nhật bản dịch khi AI nâng cấp.

## Acceptance Criteria

1. **Given** Người dùng đã đăng nhập click vào một bài báo cũ trong thư viện,
2. **When** Trình duyệt gọi Next.js API Proxy `/api/preview/[jobId]`,
3. **Then** Server Route kiểm tra NextAuth session:
   - Nếu chưa đăng nhập (không có session hợp lệ hoặc thiếu `accessToken`), trả về `401 Unauthorized`.
   - Nếu là ID mô phỏng (`mock-*`), trả về nội dung tĩnh để phục vụ phát triển/kiểm thử.
4. **And** Server Route gọi API Gateway backend `GET /result/{jobId}` đính kèm JWT token trong header `Authorization: Bearer <token>` để lấy presigned download URL của kết quả bản dịch Markdown.
5. **And** Server Route fetch file từ S3 bằng presigned URL và stream trực tiếp dữ liệu (`ReadableStream`) về trình duyệt nhằm tối ưu RAM ở serverless (thời gian hoàn thành < 1.5 giây, đáp ứng NFR-3).
6. **And** API proxy đính kèm headers `Cache-Control: public, max-age=3600, must-revalidate` để trình duyệt lưu cache kết quả nhưng vẫn có thể revalidate.
7. **And** Giao diện đọc bản dịch hiển thị thêm nút "Dịch lại" (Re-translate). Khi click nút này:
   - Client gửi yêu cầu đến Next.js API Proxy `POST /api/jobs/[jobId]/reprocess`.
   - Next.js Proxy chuyển tiếp request đến API Gateway backend `POST /job/{jobId}/reprocess` kèm JWT token.
   - Backend xác thực quyền sở hữu job, kiểm tra sự tồn tại của file PDF gốc trong S3 Uploads Bucket:
     - Nếu file đã bị xóa (do Lifecycle Rule 90 ngày), trả về `410 Gone` kèm `{ error: "Original document has expired and cannot be re-translated" }`.
     - Nếu tồn tại, kích hoạt lại AWS Step Functions pipeline với tên execution duy nhất để tránh lỗi trùng lặp (ví dụ: `job-{jobId}-{timestamp}`) và chuyển trạng thái job về `queued` / `extracting`.
   - Client hiển thị lại màn hình theo dõi tiến trình dịch chuyển đổi qua các trạng thái thời gian thực.

## Tasks / Subtasks

- [x] Task 1: Cấu hình và bổ sung API Backend cho tính năng Dịch lại (AC: 7)
  - [x] Thêm route `POST /job/{jobId}/reprocess` vào API Gateway trong `be/lib/be-stack.ts` được bảo vệ bằng JWT Authorizer.
  - [x] Triển khai hàm handler `handleReprocessJob` trong `be/lambda/index.ts`:
    - [x] Lấy `userId` từ context authorizer và kiểm tra quyền sở hữu đối với `jobId` trong DynamoDB.
    - [x] Sử dụng `HeadObjectCommand` từ S3 SDK kiểm tra sự tồn tại của file gốc (`s3Key`). Trả về lỗi `410 Gone` nếu file không tồn tại.
    - [x] Gửi lệnh `StartExecutionCommand` của Step Functions với tên execution mới `job-{jobId}-{timestamp}` để bắt đầu lại tiến trình dịch thuật.
    - [x] Cập nhật trạng thái job thành `queued` trong DynamoDB thông qua `updateJobStatus`.
- [x] Task 2: Cập nhật Next.js API Proxy `/api/preview/[jobId]` (AC: 3, 4, 5, 6)
  - [x] Import `auth` từ `@/auth` để kiểm tra session và lấy `accessToken` (JWT).
  - [x] Nếu không hợp lệ, trả về HTTP 401.
  - [x] Gửi fetch request đến backend `GET /result/{jobId}` có đính kèm header `Authorization: Bearer <accessToken>`.
  - [x] Đọc response body dưới dạng stream và trả về client với header `Cache-Control` tối ưu.
- [x] Task 3: Tích hợp API Route và UI nút Dịch lại trên Frontend (AC: 7)
  - [x] Tạo mới Next.js API route `fe/app/api/jobs/[jobId]/reprocess/route.ts` xác thực NextAuth session và chuyển tiếp yêu cầu đến backend.
  - [x] Cập nhật `ResultView.tsx` hoặc header view hiển thị nút "Dịch lại" (Re-translate) kèm loading state.
  - [x] Khi click nút dịch lại, kích hoạt API call, sau đó chuyển client về màn hình loading tiến trình `ProcessingView` tương ứng với `jobId` hiện tại.
- [x] Task 4: Kiểm thử và Rà soát bảo mật (AC: 3, 5, 7)
  - [x] Viết unit/integration tests cho endpoint `POST /job/{jobId}/reprocess` của backend để kiểm tra xác thực quyền sở hữu và lỗi file gốc hết hạn.
  - [x] Viết tests cho Next.js API routes để xác thực luồng truyền access token và stream dữ liệu.

## Dev Notes

### Key Architecture Patterns and Constraints
* **Step Functions Execution Name**: SFN không cho phép chạy trùng tên execution trong vòng 90 ngày. Bắt buộc phải gắn timestamp/random suffix vào tên execution (ví dụ: `job-{jobId}-{timestamp}`) thay vì chỉ `job-{jobId}`.
* **S3 Objects Expiry Check**: Sử dụng `s3Client.send(new HeadObjectCommand({...}))` để check nhanh xem file PDF gốc còn tồn tại trên bucket hay không trước khi chạy pipeline.
* **Session JWT Header**: Luôn truyền header `Authorization: Bearer ${session.accessToken}` khi gọi các API Gateway endpoints được bảo mật.

### Source Tree Components to Touch
* `be/lib/be-stack.ts` (UPDATE: thêm API route `POST /job/{jobId}/reprocess`)
* `be/lambda/index.ts` (UPDATE: xử lý route reprocess, kiểm tra file gốc, kích hoạt lại SFN)
* `fe/app/api/preview/[jobId]/route.ts` (UPDATE: tích hợp xác thực NextAuth và header Token)
* `fe/app/api/jobs/[jobId]/reprocess/route.ts` (NEW: API proxy cho yêu cầu reprocess)
* `fe/components/ResultView.tsx` (UPDATE: thêm nút re-process UI và trigger)
* `be/test/jobs.test.ts` (UPDATE: bổ sung các ca kiểm thử cho reprocess và preview)

### References
* Khởi chạy Step Functions trong handler: [be/lambda/index.ts#L201-L210](file:///d:/AI/viet-ai-scholar/be/lambda/index.ts#L201-L210)
* Session token callback: [fe/auth.ts#L131-L155](file:///d:/AI/viet-ai-scholar/fe/auth.ts#L131-L155)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
