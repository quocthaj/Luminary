# Luminary Scholar — Tổng quan

## Một câu mô tả

Nền tảng dịch tài liệu học thuật PDF (EN→VI) bằng AI, với RAG chat, thư viện cá nhân và bộ công cụ học tập thông minh.

---

## Người dùng mục tiêu

- **Sinh viên / nghiên cứu sinh** cần đọc paper tiếng Anh nhanh
- **Học giả** muốn đối chiếu EN-VI và tra cứu bài liên quan
- **Visual learner** cần quiz/flashcard/mindmap để ôn tập

---

## Tech Stack

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| Frontend | Next.js 16 + React 19 + TailwindCSS 4 | App Router, streaming SSR |
| Hosting FE | Vercel | CI/CD sẵn có |
| Backend | AWS Lambda (Node.js 20) + Step Functions | Serverless, pay-per-use |
| IaC | AWS CDK (TypeScript) | Type-safe infrastructure |
| DB | DynamoDB (PAY_PER_REQUEST) | Schemaless, auto-scale |
| Storage | S3 (3 buckets) | Uploads / Results / Frontend |
| OCR | pdfjs-dist + Amazon Textract | pdfjs nhanh, Textract là fallback |
| AI (dịch) | Mistral 7B → Groq (Llama 3.3 70B) → Gemini 2.0 Flash | Triple fallback, cost-optimized |
| AI (embed) | Gemini text-embedding-004 | 768 dims, free tier |
| AI (chat) | Gemini Pro/Flash | RAG answer generation |
| Vector DB | Qdrant Cloud | Multi-tenant filtering by userId+jobId |
| Auth | NextAuth (Google OAuth + Email OTP) | Stateless JWT, HS256 |
| Auth (API) | Lambda Authorizer (Web Crypto) | Bundle < 10KB, no deps |
| Region | ap-southeast-1 (Singapore) | Gần Việt Nam |

---

## Luồng xử lý chính

```
User Upload PDF
  → POST /api/jobs (Presigned URL)
  → PUT PDF to S3 Uploads
  → S3 Event → Orchestrator Lambda
  → Step Functions:
      Extract (pdfjs/Textract)
      → Parallel [
          Translate Map (concurrency=5, Mistral→Groq→Gemini)
          LaTeX normalize (Groq→Gemini)
        ]
      → Merge → Markdown song ngữ → S3 Results
      → Embed Lambda (Gemini text-embedding-004 → Qdrant)
  → Frontend polling → hiển thị kết quả
```

---

## Cấu trúc repo

```
viet-ai-scholar/
├── fe/              Next.js frontend
├── be/              AWS CDK + Lambda functions
│   ├── lambda/      index.ts (Orchestrator) + handlers/ + agents/
│   └── lib/         CDK stack definition
├── docs/            Architecture docs (generated)
└── _bmad-output/    BMAD planning + story files
```

---

## Liên kết

- [[Architecture]] — Sơ đồ hệ thống chi tiết
- [docs/project-overview.md](../../docs/project-overview.md)
- [docs/development-guide.md](../../docs/development-guide.md)
