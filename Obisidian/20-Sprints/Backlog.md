# Backlog — Epics 4 & 5

---

## Epic 4 — Learning Tools: Quiz, Flashcard, Mind Map

**Goal:** Người dùng kích hoạt công cụ học tập thông minh từ Workspace: Quiz trắc nghiệm, Flashcard lật 3D, Mindmap tương tác — tất cả do AI sinh từ nội dung bài báo.

**FRs covered:** FR-13, FR-14

### Stories

| Story | Tên | Ghi chú kỹ thuật |
|-------|-----|-----------------|
| 4.1 | AI Quiz Generator & Play Modal | Gemini Structured Output, JSON schema 5 câu / 4 đáp án. Cache vào S3. |
| 4.2 | AI Flashcard Generator & Swiper UI | Structured Output 8-10 thuật ngữ. 3D flip animation. Swipe gesture. |
| 4.3 | Mermaid Mindmap Generator | Gemini → Mermaid syntax → `@mermaid-js/mermaid` render SVG. Error boundary + fallback text tree. |

### Điều cần chuẩn bị trước khi bắt đầu Epic 4
- [ ] Hoàn thành Story 3.4 (Workspace Chat Panel) — cột trái cần có button Quiz/Flashcard/Mindmap
- [ ] Xác định Gemini Structured Output schema cho Quiz và Flashcard
- [ ] Test `@mermaid-js/mermaid` client-side với Next.js App Router (cần dynamic import)

---

## Epic 5 — Multi-PDF Synthesis & Explore Mode

**Goal:** Cross-reference nhiều bài báo + AI Agent tự sinh nội dung học thuật theo chủ đề.

**FRs covered:** FR-15, FR-16

### Stories

| Story | Tên | Ghi chú kỹ thuật |
|-------|-----|-----------------|
| 5.1 | Cross-Paper Multi-PDF Synthesis | Gemini 1.5 Pro (long context). RAG query trên nhiều jobId. Báo cáo tổng hợp song ngữ. |
| 5.2 | Explore Mode Topic-Based Generation | AI Agent pattern. Tự tìm + tổng hợp + sinh Mermaid + LaTeX. Lưu vào Library. |

### Rủi ro Epic 5
- Gemini 1.5 Pro context window cost cao khi nhiều PDF lớn
- Story 5.2 là agentic loop — cần rate limiting và fallback tốt
- Cross-paper RAG cần filter Qdrant theo list jobIds (chưa test)

---

## Ideas chưa thành story

- [ ] Export bài dịch sang PDF với LaTeX đẹp
- [ ] Share link công khai cho bài dịch (bỏ qua auth)
- [ ] Annotation / highlight trên Bilingual Reader
- [ ] Dark mode toggle
- [ ] Hỗ trợ PDF tiếng Trung / Nhật (OCR multi-lang)

---

## Liên kết
- [[Epic-3-Current]] — Sprint hiện tại
- [[00-Dashboard]] — về Dashboard
