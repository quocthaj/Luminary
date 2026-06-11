# ADR-002 — Multi-AI Provider với Fallback Chain

**Ngày:** 2026-06-06
**Status:** Accepted

---

## Quyết định

Dùng triple fallback chain cho dịch thuật: **Mistral 7B → Groq (Llama 3.3 70B) → Gemini 2.0 Flash**. Không lock-in vào một provider duy nhất.

## Bối cảnh

AI API có downtime, rate limit, và cost thay đổi liên tục. Một provider rẻ hôm nay có thể hết free tier tháng sau.

## Lý do chọn từng provider

| Provider | Vai trò | Lý do |
|----------|---------|-------|
| **Mistral 7B** | Primary dịch | Rẻ nhất, đủ chất lượng cho văn bản học thuật thông thường |
| **Groq (Llama 3.3 70B)** | Fallback 1 | Inference cực nhanh, free tier rộng rãi |
| **Gemini 2.0 Flash** | Fallback 2 + LaTeX + RAG | Gemini API key dùng chung cho nhiều mục đích (embed + chat), giảm số secrets cần manage |
| **DeepSeek** | Dự phòng (Secrets Manager) | Giữ secret sẵn, chưa dùng trong fallback chain chính |

## Secret management

4 secrets trong AWS Secrets Manager, cache in-memory trong Lambda (tránh gọi SM mỗi request):
```
vietai/groq-api-key
vietai/gemini-api-key
viet-ai-scholar/deepseek-api-key
viet-ai-scholar/mistral-api-key
```

## Đánh đổi

- Complexity: phải maintain và test nhiều provider.
- Chất lượng dịch không đồng nhất khi fallback (Mistral vs Gemini khác phong cách).
- Cần monitor xem provider nào đang được dùng chủ yếu.

---

## Liên kết
- [[Architecture]] — Sơ đồ AI flow
- [[ADR-003-Qdrant-RAG]] — AI cho embedding và RAG
