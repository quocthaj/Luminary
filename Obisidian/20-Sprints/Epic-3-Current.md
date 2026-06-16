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
| 3.4 | AI Tutor Chat Panel UI | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-4-giao-dien-ai-tutor-chat-ai-tutor-chat-panel-ui-source-citations.md) |
| 3.5 | Semantic Scholar Integration | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-5-tich-hop-api-semantic-scholar-semantic-scholar-integration-related-papers-panel.md) |
| 3.6 | Agentic RAG & Summary Routing | ✅ Done | [story](../../_bmad-output/implementation-artifacts/3-6-he-thong-chat-agentic-rag-tu-dong-dinh-tuyen-va-truy-van-active-agentic-rag-chat-router.md) |

---

## Story 3.6 — Agentic RAG & Summary Routing (CURRENT)

**User story:** Trợ lý AI tự động phân tích câu hỏi để chọn giữa vector search cục bộ, lấy đoạn liền kề, hoặc đọc executive summary toàn tài liệu — không bị mất ngữ nghĩa do chunking.

### Acceptance Criteria tóm tắt
- [ ] Gemini 2.0 Flash với Tool Calling: `vectorSearch`, `fetchAdjacentParagraphs`, `readExecutiveSummary`
- [ ] Executive Summary (tldr, keyContributions, methodology, limitations) tự động sinh trong ingest, lưu DynamoDB
- [ ] Sliding window 6 messages trong React state (stateless Lambda)
- [ ] Câu trả lời trích dẫn nguồn (tool nào được dùng)

### Phân chia task
- [ ] **Task 1:** Cập nhật `be/lambda/handlers/ingest.ts` — sinh Executive Summary (Gemini Structured Output) + lưu DynamoDB
- [ ] **Task 2:** Cập nhật DynamoDB schema — thêm field `executiveSummary`
- [ ] **Task 3:** Implement ReAct loop trong `fe/app/api/chat/[jobId]/route.ts` — Gemini Tool Routing
- [ ] **Task 4:** Cập nhật Chat UI — hiển thị tool đang được dùng, sliding window state
- [ ] **Task 5:** Viết E2E tests

### Quyết định kỹ thuật đã chốt
- **Memory:** Client-side Sliding Window (6 tin nhắn gần nhất trong React state) — không cần Redis, giữ Lambda stateless
- **Executive Summary:** Sinh trong pha Ingest (không sinh lúc chat) → truy xuất < 20ms, tiết kiệm token
- **Xem thêm:** [[../30-Decisions/ADR-005-Agentic-RAG-Memory]]

---

## Notes & blockers

*(Ghi lại blockers, quyết định kỹ thuật mini, hoặc phát hiện trong quá trình dev)*

---

## Liên kết
- [[00-Dashboard]] — về Dashboard
- [[Backlog]] — Epics 4 & 5
