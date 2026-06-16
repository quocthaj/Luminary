# ADR-005 — Agentic RAG: Sliding Window Memory & Executive Summary in Ingest

**Ngày:** 2026-06-11
**Status:** Accepted

---

## Quyết định 1 — Chat Memory: Client-side Sliding Window

Dùng **React state giữ tối đa 6 tin nhắn gần nhất** thay vì lưu lịch sử chat server-side (Redis, DynamoDB).

### Bối cảnh

Story 3.6 cần Agentic RAG multi-turn — model phải nhớ câu hỏi trước để trả lời câu sau liên quan. Cần chọn nơi lưu conversation history.

### Lý do chọn

- **Giữ Lambda stateless:** AWS Lambda không có shared memory giữa invocations. Lưu server-side cần Redis/ElastiCache → thêm cost + latency + infra.
- **6 messages đủ dùng:** Nghiên cứu học thuật thường không cần context quá dài. 6 messages ≈ 3 lượt hỏi-đáp, đủ cho flow tự nhiên mà không phình token.
- **Zero backend cost:** State chỉ tồn tại trong browser session, không persist, không cần cleanup.
- **Triển khai đơn giản:** `const [history, setHistory] = useState([])` + trim khi > 6.

### Đánh đổi

- Mất history khi refresh trang (chấp nhận được ở v1).
- Token gửi lên tăng nhẹ (6 messages × ~200 tokens = ~1200 tokens overhead/request).

### Lựa chọn bị loại

- **Redis (ElastiCache):** $0.02/hr minimum, cold start issue với Lambda, quá mức cần thiết.
- **DynamoDB session table:** Write/read cost, phức tạp hơn, độ trễ thêm ~10ms.

---

## Quyết định 2 — Executive Summary: Sinh trong Ingest, lưu DynamoDB

Sinh **Executive Summary có cấu trúc JSON** (`tldr`, `keyContributions`, `methodology`, `limitations`) **trong pha Ingest** bằng Gemini Structured Output, lưu vào DynamoDB field `executiveSummary`.

### Bối cảnh

Tool `readExecutiveSummary()` trong Agentic RAG cần trả lời câu hỏi tổng quan về toàn bài ("Bài này nghiên cứu về gì?", "Đóng góp chính là gì?"). Có 2 cách:
1. Sinh lúc chat (on-demand)
2. Sinh lúc ingest (pre-compute)

### Lý do chọn pre-compute tại ingest

- **Tốc độ < 20ms:** Chỉ cần `GetItem` DynamoDB, không gọi AI.
- **Tiết kiệm token:** Gemini không cần đọc lại toàn bộ Markdown mỗi lần chat.
- **Ingest là thời điểm phù hợp:** Toàn bộ content đã sẵn sàng sau Merge, Lambda đang chạy, gọi thêm 1 Gemini call ở đây không tốn thêm latency cho user.
- **NFR-5 (< 3s RAG response):** Pre-compute giúp đáp ứng NFR này dễ hơn nhiều.

### Schema Executive Summary

```json
{
  "tldr": "string",
  "keyContributions": ["string"],
  "methodology": "string",
  "limitations": "string"
}
```

### Đánh đổi

- Ingest Lambda chạy lâu hơn ~2-3s (gọi thêm Gemini).
- Nếu ingest fail ở bước này, executive summary bị null — cần fallback graceful trong tool.
- Summary cố định tại thời điểm dịch, không tự cập nhật nếu re-translate.

---

## Liên kết

- [[../20-Sprints/Epic-3-Current]] — Story 3.6 đang implement
- [[ADR-003-Qdrant-RAG]] — Context về RAG architecture
- [[../40-Research/RAG-Architecture]] — Pattern Naive RAG → Agentic RAG
