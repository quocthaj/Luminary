# Epic 4 — Learning Tools (Quiz/Flashcard/Mindmap)

**Goal:** Người dùng có thể sử dụng bộ công cụ học tập thông minh (Quiz trắc nghiệm, Flashcards, Mindmap Mermaid) sinh ra trực tiếp từ tài liệu khoa học để hiểu sâu và ôn tập.

**FRs covered:** FR-13, FR-14, FR-15

---

## Trạng thái stories

| Story | Tên ngắn | Status | File |
|-------|----------|--------|------|
| 4.1 | AI Quiz Generator & Play Modal | ✅ Done | [story](../../_bmad-output/implementation-artifacts/4-1-tu-dong-sinh-va-lam-bai-trac-nghiem-ai-quiz-generator-play-modal.md) |
| 4.2 | AI Flashcard Generator & Swiper UI | ✅ Done | [story](../../_bmad-output/implementation-artifacts/4-2-tu-dong-sinh-va-hoc-the-ghi-nho-ai-flashcard-generator-swiper-ui.md) |
| 4.3 | Mermaid Mindmap Generator | ✅ Done | [story](../../_bmad-output/implementation-artifacts/4-3-tu-dong-ve-so-do-tu-duy-bang-mermaid-js-mermaid-mindmap-generator-interactive-svg-viewer.md) |

---

## Story 4.1 — AI Quiz Generator & Play Modal (CURRENT)

**User story:** AI tự động tạo bài trắc nghiệm từ nội dung bài viết và chơi trực tiếp trên giao diện để kiểm tra mức độ hiểu bài của mình.

### Acceptance Criteria tóm tắt
- [x] Bấm nút "Quiz" ở Workspace left sidebar gọi API `POST /api/tools/[jobId]/quiz`
- [x] Nếu chưa có cache, Next.js server proxy lên backend Lambda sinh quiz (Gemini Structured Output) gồm 5 câu hỏi và đáp án đúng.
- [x] Lưu kết quả JSON sinh được vào S3 results bucket tại `results/{jobId}/quiz.json`.
- [x] Hiển thị Modal trắc nghiệm tương tác, nộp bài tính điểm và phản hồi đúng/sai kèm giải thích trực quan.
- [x] Hỗ trợ render LaTeX (bằng KaTeX) cho công thức toán trong Quiz Modal.

### Phân chia task
- [x] **Task 1:** Cấu hình Backend API Gateway route `/job/{jobId}/quiz` (CDK stack + Lambda router).
- [x] **Task 2:** Xây dựng Lambda Handler xử lý sinh và cache Quiz (`be/lambda/handlers/quiz.ts`) sử dụng Structured Output mode.
- [x] **Task 3:** Viết Unit tests cho Backend Lambda handler.
- [x] **Task 4:** Xây dựng Frontend API Route Next.js proxy.
- [x] **Task 5:** Thiết kế UI nút Quiz và component `QuizModal.tsx` chơi trắc nghiệm hỗ trợ KaTeX.
- [x] **Task 6:** Viết E2E tests bằng Playwright.

### Quyết định kỹ thuật đã chốt
- **S3 Caching & Validation:** Lưu trữ câu hỏi dạng JSON ở S3 results bucket. Khi đọc cache phải chạy qua hàm validate, sử dụng cờ `isCritical === false` để xác định cache hit (cho phép tái sử dụng cả quiz fallback 3-4 câu).
- **Fail Fast on Auth:** Luôn kiểm tra quyền sở hữu (ownership) của job trước tiên, sau đó mới kiểm tra cache hoặc trạng thái bản dịch. Không hỗ trợ fallback `guest` cho quiz.
- **Translation Status:** Bản dịch chưa xong thì trả về lỗi 409 Conflict (`ANALYSIS_NOT_FOUND`).
- **Structured Output & Feedback-Driven Retries:** Dùng Gemini 2.0 Flash sinh dữ liệu có schema chính thức. Nếu validation lỗi, retry tối đa 3 lần và đưa trực tiếp lỗi vào prompt feedback. Phân tách rõ ràng lỗi nghiêm trọng (ít hơn 3 câu hợp lệ - `isCritical`) và cảnh báo thiếu câu hỏi mục tiêu (dưới 5 câu). Nếu không bị lỗi nghiêm trọng sau 3 lần retry (tức là còn >= 3 câu), hệ thống chấp nhận quiz; ngược lại sẽ throw 500 và không lưu cache.

---

## Notes & blockers

*(Ghi lại blockers, quyết định kỹ thuật mini, hoặc phát hiện trong quá trình dev)*

---

## Liên kết
- [[00-Dashboard]] — về Dashboard
- [[Backlog]] — Epics 4 & 5
