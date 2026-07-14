# RAG Architecture — Luminary Scholar

## Pattern đang dùng: Agentic RAG (Story 3.6) — upgrade từ Naive RAG

```
Query → Embed query (Gemini) → Vector search Qdrant (top 4)
     → Ghép chunks vào prompt → Gemini Flash → Answer
```

Đây là **Naive RAG** (không có re-ranking, không có query expansion). Đủ cho v1.

---

## Pipeline chi tiết

### 1. Ingestion (Story 3.2 — đã xong)

```
Merge Lambda xong → trigger Embed Lambda
  → Chunking Markdown (500-1000 ký tự, ngắt tại đoạn văn / thẻ toán)
  → Mỗi chunk thêm anchor {#chunk-X} ở đầu (để UI scroll đến)
  → Gemini text-embedding-004 → vector 768 dims
  → Qdrant upsert payload: { userId, jobId, text_original, text_translated, chunkIndex }
```

### 2. Retrieval + Generation (Story 3.3 — đã xong)

```
POST /api/chat/[jobId]
  → Verify NextAuth session
  → Verify jobId ownership trong DynamoDB
  → Embed câu hỏi → Qdrant search (filter userId + jobId, top 4)
  → Giới hạn context < 3000 tokens
  → Gemini Flash: "Dựa trên tài liệu sau, trả lời: ..."
  → Return { answer, citations: [chunkIndex, ...] }
```

### 3. UI Citation (Story 3.4 — NEXT)

```
Response chứa citations [12, 15]
  → Chat UI hiển thị thẻ [Đoạn 12] clickable
  → Click → smooth scroll đến <div id="chunk-12"> trong Reader
  → Highlight vàng 3 giây
```

---

## NFR cần đạt

- **NFR-5:** Phản hồi RAG < 3 giây
- Đang đạt được nhờ: Singleton Qdrant client (Keep-Alive), top 4 chunks, Gemini Flash (nhanh hơn Pro)

---

## Cải tiến có thể làm trong tương lai

| Cải tiến | Lợi ích | Khi nào xem xét |
|----------|---------|-----------------|
| HyDE (Hypothetical Document Embedding) | Tăng recall cho câu hỏi mơ hồ | Epic 5 |
| Re-ranking (cross-encoder) | Tăng precision | Epic 5 |
| Query expansion | Xử lý câu hỏi ngắn/thiếu context | Epic 5 |
| Streaming response | UX tốt hơn | Story 3.4 |
| Conversation history | Multi-turn chat | Epic 4+ |

---

## Liên kết
- [[ADR-003-Qdrant-RAG]] — Lý do chọn Qdrant
- [[../20-Sprints/Epic-3-Current]] — Story 3.4 đang làm
