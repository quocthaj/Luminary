# Kiến trúc hệ thống — VietAI Scholar

## Sơ đồ tổng quan

```mermaid
flowchart TD
    User([User / Browser]) -->|1. Upload PDF| FE[Next.js\nVercel]

    FE -->|POST /api/jobs| APIGW[API Gateway\n100 req/s]
    APIGW --> Auth[Lambda Authorizer\nJWT Web Crypto < 10KB]
    Auth --> Orch[Orchestrator Lambda\n1024MB / 600s]

    User -->|2. PUT PDF binary| S3U[(S3 Uploads\n90-day TTL)]
    S3U -->|S3 Event trigger| Orch

    Orch -->|Start| SF[Step Functions\n15min timeout]

    SF --> Extract[Extract Lambda\n2048MB\npdfjs → Textract]
    Extract --> Para{Parallel}
    Para -->|Map concurrency=5| Trans[Translate Lambda\nMistral→Groq→Gemini]
    Para --> LaTeX[LaTeX Lambda\nGroq→Gemini]
    Trans --> Merge[Merge Lambda]
    LaTeX --> Merge

    Merge -->|Save| S3R[(S3 Results\n30-day TTL)]
    Merge -->|Trigger| Embed[Embed Lambda\nGemini text-embedding-004]
    Embed -->|Upsert vectors| Qdrant[(Qdrant Cloud\nvietai-scholar-chunks)]

    FE -->|3. Polling GET /api/jobs/:id| APIGW
    FE -->|4. Stream Markdown| Proxy[Next.js /api/preview\nS3 Streaming Proxy]
    Proxy --> S3R

    FE -->|5. RAG Chat| ChatAPI[Next.js /api/chat/:jobId]
    ChatAPI -->|Vector search filter userId+jobId| Qdrant
    ChatAPI -->|Generate answer| Gemini[Gemini Pro/Flash]

    DDB[(DynamoDB\nvietai-jobs)] --- Orch
    DDB --- ChatAPI
    DDB --- APIGW

    style S3U fill:#FF9900,color:#000
    style S3R fill:#FF9900,color:#000
    style DDB fill:#4A90D9,color:#fff
    style Qdrant fill:#DC143C,color:#fff
    style Gemini fill:#4285F4,color:#fff
```

---

## Lambda Functions

| Lambda | Entry | RAM | Timeout | Vai trò |
|--------|-------|-----|---------|---------|
| Orchestrator | `lambda/index.ts` | 1024 MB | 600s | Main handler, S3 trigger, API routing |
| Extract | `lambda/handlers/extract.ts` | 2048 MB | 120s | PDF → text (pdfjs + Textract fallback) |
| Translate | `lambda/handlers/translate.ts` | 512 MB | 60s | Chunk dịch EN→VI |
| LaTeX | `lambda/handlers/latex.ts` | 512 MB | 60s | Chuẩn hóa công thức toán |
| Merge | `lambda/handlers/merge.ts` | 512 MB | 60s | Gộp → Markdown song ngữ cuối |

---

## AI Fallback Chain

```
Dịch thuật:   Mistral 7B → Groq (Llama 3.3 70B) → Gemini 2.0 Flash
LaTeX/Diagram: Groq → Gemini 2.0 Flash
Embedding:    Gemini text-embedding-004 (768 dims)
RAG Chat:     Gemini Pro/Flash
```

Tất cả AI calls: `temperature: 0.3`, `max_tokens: 4096`

---

## DynamoDB Schema

```json
{
  "jobId": "string (PK)",
  "userId": "string (default: 'guest')",
  "status": "pending|extracting|processing|completed|failed",
  "fileName": "string",
  "s3Key": "string",
  "createdAt": "number (epoch)",
  "expiresAt": "number (epoch, 30 ngày)",
  "s3OutputKey": "string?",
  "hasFormula": "boolean?",
  "hasDiagram": "boolean?"
}
```

GSI: `userIdIndex` (userId + createdAt) — dùng cho Library listing.

---

## Qdrant Multi-tenancy

Collection duy nhất: `vietai-scholar-chunks`

Payload mỗi vector:
```json
{
  "userId": "...",
  "jobId": "...",
  "text_original": "...",
  "text_translated": "...",
  "chunkIndex": 12
}
```

Filter bắt buộc trên **mọi** query: `userId == X AND jobId == Y` → bảo mật phân quyền.

---

## Liên kết
- [docs/architecture-be.md](../../docs/architecture-be.md)
- [docs/architecture-fe.md](../../docs/architecture-fe.md)
- [docs/integration-architecture.md](../../docs/integration-architecture.md)
- [[ADR-003-Qdrant-RAG]]
