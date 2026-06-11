# Epic 3 — Workspace & RAG Chat

**Goal:** Người dùng đọc tài liệu trên Workspace 3 cột collapsible, chat RAG hỏi đáp với bài viết (Qdrant, bảo mật phân quyền), tìm bài liên quan qua Semantic Scholar.

**FRs covered:** FR-9, FR-10, FR-11, FR-12

---

## Trạng thái stories

| Story | Tên ngắn | Status | File |
|-------|----------|--------|------|
| 3.1 | 3-Column Workspace UI | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-1-giao-dien-workspace-3-cot-3-column-workspace-ui-layout-sidebar.md) |
| 3.2 | Paragraph Ingestion → Qdrant | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-2-tach-doan-embedding-luu-tru-qdrant-cloud-paragraph-ingestion-qdrant-upsert-lambda.md) |
| 3.3 | RAG Chat API | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-3-api-rag-chat-an-toan-secure-rag-chat-api-namespace-filter.md) |
| **3.4** | **AI Tutor Chat Panel UI** | **📋 Next** | [story](../../_bmad-output/implementation-artifacts/3-4-giao-dien-ai-tutor-chat-ai-tutor-chat-panel-ui-source-citations.md) |
| 3.5 | Semantic Scholar Integration | 📋 Backlog | — |

---

## Story 3.4 — AI Tutor Chat Panel UI (NEXT)

**User story:** Người dùng thấy khung chat AI Tutor có bong bóng tin nhắn và có thể click vào trích dẫn để nhảy tới đoạn văn tương ứng trong Reader.

### Acceptance Criteria tóm tắt
- [ ] Bong bóng chat: User (vàng nhạt, phải) / AI (xám nhạt, trái)
- [ ] Typing indicator khi AI đang xử lý
- [ ] Cuối mỗi câu trả lời AI: thẻ trích dẫn `[Đoạn 12]`, `[Đoạn 15]`
- [ ] Bilingual Reader parse `{#chunk-X}` → `<div id="chunk-X">`
- [ ] Click thẻ trích dẫn → smooth scroll + highlight vàng 3 giây

### Các thành phần cần implement
- `fe/components/workspace/ChatPanel.tsx` — khung chat
- `fe/components/workspace/ChatBubble.tsx` — bong bóng tin nhắn
- `fe/components/workspace/SourceCitation.tsx` — thẻ trích dẫn có thể click
- `fe/hooks/useScrollToChunk.ts` — scroll + highlight logic
- Cập nhật Markdown renderer để parse `{#chunk-X}`

### API đã có sẵn
`POST /api/chat/[jobId]` → ✅ Done ở Story 3.3

---

## Story 3.5 — Semantic Scholar (Backlog)

**User story:** Click "Tìm liên quan" → top 5 bài báo liên quan hiển thị trong cột phải.

**API cần gọi:** `https://api.semanticscholar.org/graph/v1/paper/search`

Xem thêm: [[40-Research/Semantic-Scholar-API]]

---

## Notes & blockers

*(Ghi lại blockers, quyết định kỹ thuật mini, hoặc phát hiện trong quá trình dev)*

---

## Liên kết
- [[00-Dashboard]] — về Dashboard
- [[Backlog]] — Epics 4 & 5
