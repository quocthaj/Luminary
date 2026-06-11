# ADR-003 — Qdrant Cloud cho Vector DB / RAG

**Ngày:** 2026-06-06
**Status:** Accepted

---

## Quyết định

Dùng **Qdrant Cloud** (managed) với một collection duy nhất `vietai-scholar-chunks`, lọc multi-tenant bằng payload filter `userId + jobId`.

## Bối cảnh

Cần lưu trữ vector embeddings của tài liệu để phục vụ RAG chat. Mỗi user có nhiều bài viết, cần cách ly dữ liệu giữa các users mà không tốn overhead tạo collection riêng.

## Lý do chọn Qdrant

- **Free tier đủ dùng** cho MVP (1GB vector storage).
- **Payload filter mạnh:** Qdrant hỗ trợ filter điều kiện phức tạp (AND/OR) trực tiếp trong vector search query — không cần post-processing.
- **Python + TypeScript SDK** đầy đủ.
- **Managed cloud:** Không cần ops (so với self-host Weaviate/Milvus).

## Lý do không dùng collection riêng per-user

- Qdrant free tier giới hạn số collections.
- Tạo collection là operation nặng, không phù hợp per-job.
- Payload filter đủ hiệu quả và bảo mật khi filter bắt buộc trên **mọi** query.

## Lý do không dùng pgvector / Pinecone

- **pgvector:** Cần chạy RDS/Aurora → thêm cost, thêm infra. Serverless không kết nối pool tốt.
- **Pinecone:** Namespace per-user khả thi nhưng pricing cao hơn ở scale, và không control được cluster.

## Cấu trúc vector

- **Dims:** 768 (Gemini `text-embedding-004`)
- **Metric:** Cosine similarity
- **Payload:** `userId`, `jobId`, `text_original`, `text_translated`, `chunkIndex`
- **Chunk size:** 500–1000 ký tự, ngắt tại ranh giới đoạn văn

## Performance optimization

- Qdrant Client dạng **Singleton** ở Next.js global scope → duy trì HTTP Keep-Alive → giảm TLS handshake cold start.
- Lấy **top 4 chunks** / query, giới hạn < 3000 tokens context → đảm bảo NFR-5 (< 3s).

---

## Liên kết
- [[RAG-Architecture]] — RAG patterns chi tiết
- [[Architecture]] — Vị trí Qdrant trong hệ thống
