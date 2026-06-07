---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
---

# Story 1.3: Theo dõi Tiến trình & Giao diện Song ngữ Side-by-Side (Translation Progress & Bilingual Side-by-Side Layout)

Status: done

## Story

As a người dùng,
I want theo dõi tiến trình dịch thời gian thực và đọc bản dịch song ngữ hai cột English - Tiếng Việt cuộn đồng bộ,
so that tôi có thể dễ dàng đối chiếu bản gốc và bản dịch của bài báo.

## Acceptance Criteria

1. **Given** File PDF đã được upload thành công lên S3,
   **When** Client bắt đầu gửi API polling liên tục (`GET /api/jobs/{jobId}`) mỗi 2 giây,
   **Then** Màn hình hiển thị thanh tiến trình trực quan chuyển đổi qua 3 trạng thái: `Extracting` (Trích xuất) -> `Translating` (Đang dịch) -> `Merging` (Đang gộp).
2. **And** Khi trạng thái chuyển thành `Completed`, màn hình tự động hiển thị giao diện song ngữ Side-by-Side:
   - Trên Desktop: 2 cột song song (English bên trái, Tiếng Việt bên phải) có tính năng cuộn đồng bộ (sync scroll).
   - Trên Mobile: Hiển thị 2 Tab switcher (Tab EN / Tab VI) để người dùng chuyển đổi qua lại thuận tiện.

## Tasks / Subtasks

- [x] Task 1: Cập nhật ProcessingView theo dõi 3 trạng thái tiến trình (AC: 1)
  - [x] Rút gọn danh sách bước tiến trình (stepper) thành 3 trạng thái chính: `Trích xuất` -> `Đang dịch` -> `Đang gộp`.
  - [x] Map các trạng thái từ backend DynamoDB:
    - Trích xuất: `pending`, `queued`, `extracting`
    - Đang dịch: `extracted`, `orchestrating`, `processing`
    - Đang gộp: `agents_completed`
  - [x] Điều chỉnh tần suất API Polling từ 3 giây thành 2 giây để cập nhật nhanh hơn.
  - [x] Đảm bảo khi job hoàn thành (`completed`), gọi ngay hàm callback `onComplete()` để chuyển giao diện.

- [x] Task 2: Thiết kế giao diện song ngữ Side-by-Side trên Desktop (AC: 2)
  - [x] Trên Desktop (màn hình `@media (min-width: 1024px)`), hiển thị 2 cột song song: Cột trái tiếng Anh (EN), cột phải tiếng Việt (VI).
  - [x] Ẩn Tab Switcher trên Desktop để tránh trùng lặp thông tin hiển thị.
  - [x] Thiết kế bố cục hai cột sang trọng, tối giản, khớp với tông màu Dark Mode cao cấp của hệ thống.

- [x] Task 3: Triển khai cuộn đồng bộ (Synchronized Scroll) cho 2 cột preview (AC: 2)
  - [x] Viết logic đồng bộ cuộn (sync scroll) dựa trên sự kiện `onScroll` của hai cột chứa nội dung.
  - [x] Sử dụng React ref (ví dụ: `activeScrollColRef`) hoặc cờ kiểm soát để tránh vòng lặp phản hồi cuộn vô hạn (infinite scroll event feedback loop).
  - [x] Đảm bảo cuộn mượt mà, tỷ lệ cuộn (`scrollTop / (scrollHeight - clientHeight)`) được giữ nguyên giữa hai bên.

- [x] Task 4: Giao diện chuyển đổi ngôn ngữ linh hoạt trên Mobile (AC: 2)
  - [x] Trên Mobile (màn hình `@media (max-width: 1023px)`), hiển thị duy nhất một cột nội dung.
  - [x] Hiển thị lại thanh Tab Switcher để chuyển đổi ngôn ngữ (EN · English / VI · Tiếng Việt).
  - [x] Thêm hiệu ứng transition fade-in mượt mà khi chuyển đổi ngôn ngữ.

## Dev Notes

### Relevant Architecture Patterns and Constraints
- **State Management**: Polling được xử lý trong `ProcessingView.tsx`, kết quả render được quản lý bởi `ResultView.tsx`.
- **Responsive Layout**: Sử dụng Tailwind CSS hoặc Vanilla CSS `@media` query trực tiếp để chuyển đổi linh hoạt giữa giao diện 2 cột và giao diện Tab switcher.
- **Scroll Sync Loop Prevention**:
  ```typescript
  const activeColRef = useRef<'left' | 'right' | null>(null);
  
  const handleScroll = (col: 'left' | 'right') => (e: React.UIEvent<HTMLDivElement>) => {
    if (activeColRef.current && activeColRef.current !== col) return;
    activeColRef.current = col;
    const current = e.currentTarget;
    const target = col === 'left' ? rightScrollRef.current : leftScrollRef.current;
    if (target) {
      const percentage = current.scrollTop / (current.scrollHeight - current.clientHeight);
      target.scrollTop = percentage * (target.scrollHeight - target.clientHeight);
    }
    // Reset sau khi cuộn hoàn tất hoặc sử dụng timeout ngắn
    clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      activeColRef.current = null;
    }, 50);
  };
  ```

### References
- [Frontend Architecture](file:///d:/AI/viet-ai-scholar/docs/architecture-fe.md)
- [ResultView Component](file:///d:/AI/viet-ai-scholar/fe/components/ResultView.tsx)
- [ProcessingView Component](file:///d:/AI/viet-ai-scholar/fe/components/ProcessingView.tsx)

## Dev Agent Record

### Agent Model Used
- Antigravity AI Code Agent (Gemini-based)

### Debug Log References
- Visually validated in Playwright browser session. TypeScript compilation validation was successful (`npx tsc --noEmit` exited with 0).

### Completion Notes List
- Updated pipeline polling latency from 3 seconds to 2 seconds.
- Integrated `ProcessingView` with 3-stage stepper UI.
- Integrated `ResultView` with desktop side-by-side synchronized scrolling columns (English vs. Vietnamese) and mobile tab switching mechanism.
- Created `mock-` prefix trigger in backend proxy route and client library to facilitate offline testing of the whole lifecycle.

### File List
- `fe/components/ProcessingView.tsx`
- `fe/components/ResultView.tsx`
- `fe/lib/api.ts`
- `fe/app/page.tsx`
- `fe/app/api/preview/[jobId]/route.ts`
