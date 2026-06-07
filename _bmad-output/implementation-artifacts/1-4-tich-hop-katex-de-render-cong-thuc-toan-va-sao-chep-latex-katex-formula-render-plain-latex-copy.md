---
baseline_commit: c2c77417675f4b48275dede218c6a361ce0a9189
---

# Story 1.4: Tích hợp KaTeX để Render công thức toán và Sao chép LaTeX (KaTeX Formula Render & Plain LaTeX Copy)

Status: done

## Story

As a học giả nghiên cứu toán/khoa học,
I want các công thức toán học hiển thị chuẩn xác trực quan và dễ dàng sao chép mã nguồn LaTeX thô,
so that tôi có thể dán trực tiếp công thức vào báo cáo cá nhân mà không phải gõ lại.

## Acceptance Criteria

1. **Given** Bản dịch song ngữ đã hiển thị trên màn hình ở Story 1.3,
   **When** Có các tag công thức toán dạng `$ ... $` (inline) hoặc `$$ ... $$` (block) trong văn bản dịch,
   **Then** Hệ thống tự động chuyển đổi và render thành công thức toán đẹp mắt bằng thư viện KaTeX (đảm bảo độ chính xác hiển thị 98%, không bị vỡ font hay layout shift).
2. **And** Khi di chuột (hover) vào một công thức toán học bất kỳ, hiển thị một icon Copy nổi lên. Nhấp vào icon này sẽ copy mã nguồn LaTeX thô (ví dụ: `f(x) = \sigma(W^T x + b)`) trực tiếp vào clipboard của máy tính (loại bỏ hoàn toàn ký tự bọc ngoài như `$`).

## Tasks / Subtasks

- [x] Task 1: Thiết lập và import thư viện KaTeX trong Next.js (AC: 1)
  - [x] Đảm bảo thư viện `katex` và `@types/katex` được cấu hình đầy đủ.
  - [x] Import file CSS của KaTeX `katex/dist/katex.min.css` vào `ResultView.tsx` hoặc `globals.css` để các công thức hiển thị đúng font và ký hiệu đặc trưng.
- [x] Task 2: Cập nhật hàm `renderMarkdown` hỗ trợ tách và render công thức KaTeX (AC: 1)
  - [x] Cập nhật `renderMarkdown` để trích xuất các công thức toán block `$$` và inline `$` trước khi thực hiện các phép thế Regex markdown khác.
  - [x] Sử dụng `katex.renderToString` để chuyển đổi các công thức thành HTML tĩnh tương ứng.
  - [x] Bọc các công thức trong các container tương ứng (`div` cho block, `span` cho inline) kèm theo metadata `data-latex` chứa chuỗi LaTeX thô.
- [x] Task 3: Thiết kế UI hover và nút Copy LaTeX (AC: 2)
  - [x] Thiết kế nút Copy nhỏ nổi lên ở góc công thức khi di chuột vào công thức (sử dụng Tailwind class `group-hover:opacity-100` hoặc CSS tương đương).
  - [x] Gắn class `copy-latex-btn` và biểu tượng icon copy thanh lịch.
- [x] Task 4: Xây dựng Event Delegation để xử lý sự kiện Copy (AC: 2)
  - [x] Thêm sự kiện `onClick` vào thẻ container ngoài cùng của previewer để đón đầu các sự kiện click trên nút `.copy-latex-btn`.
  - [x] Đọc thuộc tính `data-latex` từ container chứa công thức gần nhất và ghi vào clipboard qua `navigator.clipboard.writeText`.
  - [x] Cung cấp phản hồi thị giác chuyển icon sang màu xanh lá checkmark tạm thời để xác nhận đã copy thành công.

### Review Findings

- [x] [Review][Patch] Khắc phục Flaky Test do thời gian chờ preview load trong test E2E [fe/tests/katex.spec.ts:19]
- [x] [Review][Patch] Đảo thứ tự trích xuất Code Block lên trước trích xuất công thức KaTeX để tránh lỗi hiển thị [fe/components/ResultView.tsx:47]
- [x] [Review][Patch] Bổ sung kiểm tra sự tồn tại của navigator.clipboard trước khi thực hiện copy [fe/components/ResultView.tsx:184]

## Dev Notes

### Key Architecture Patterns and Constraints
- **Styling**: Tận dụng CSS của KaTeX thông qua import. Sử dụng TailwindCSS hoặc CSS tùy chỉnh để làm nút copy.
- **Dynamic HTML Event Delegation**: Do HTML được chèn thông qua `dangerouslySetInnerHTML`, ta lắng nghe sự kiện click từ phần tử cha để bắt sự kiện click nút Copy của LaTeX.
- **Error Handling**: Đảm bảo bọc quá trình gọi `katex.renderToString` trong khối `try-catch`. Nếu có lỗi cú pháp LaTeX từ dữ liệu AI trả về, hệ thống sẽ trả về chuỗi text LaTeX thô được bọc trong thẻ `code` để tránh treo/crash ứng dụng.

### Source Tree Components to Touch
- Component chính: `fe/components/ResultView.tsx` (UPDATE)

### References
- PRD chính thức: [prd.md](file:///d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/prd.md)
- ResultView Component: [ResultView.tsx](file:///d:/AI/viet-ai-scholar/fe/components/ResultView.tsx)

## Dev Agent Record

### Agent Model Used
- Antigravity AI Code Agent (Gemini 3.5 Flash)

### Debug Log References
- Khắc phục cảnh báo ESLint `react-hooks/refs` trong `ResultView.tsx` bằng việc tách trình đồng bộ hóa cuộn inline thành các hook `useCallback` độc lập (`handleScrollLeft`, `handleScrollRight`).

### Completion Notes List
- Cài đặt và tích hợp thành công thư viện KaTeX và CSS đi kèm.
- Cập nhật hàm `renderMarkdown` để tự động nhận dạng, tách và biên dịch các khối công thức toán block `$$` và inline `$`.
- Tạo các phần tử bao bọc với thuộc tính `data-latex` chứa chuỗi LaTeX thô (đã lược bỏ ký tự bọc ngoài).
- Thiết kế nút Copy và hover effect cho cả công thức inline và block.
- Triển khai thành công cơ chế Event Delegation lắng nghe click trên nút copy, ghi mã LaTeX vào clipboard và hiển thị hiệu ứng checkmark xanh phản hồi.
- Đảm bảo dự án xây dựng sản phẩm (Next.js production build) và chạy linting hoàn tất không có lỗi.

### File List
- `fe/components/ResultView.tsx`
