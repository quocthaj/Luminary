# Kiến Trúc Tích Hợp — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Tổng Quan Tích Hợp

VietAI Scholar là hệ thống multi-part với 2 phần chính giao tiếp qua REST API:

```
┌──────────────────┐         REST API          ┌──────────────────────┐
│                  │  ────────────────────────► │                      │
│   Frontend (fe)  │       API Gateway         │   Backend (be)       │
│   Next.js 16     │  ◄──────────────────────  │   Lambda + SFN       │
│   Vercel         │                            │   AWS                │
└──────────────────┘                            └──────────────────────┘
         │                                               │
         │ Preview proxy                                 │
         └──────────── S3 Presigned URL ─────────────────┘
```

## Điểm Tích Hợp

### 1. Frontend → Backend (REST API)

| Từ | Đến | Loại | Protocol | Endpoint |
|----|-----|------|----------|----------|
| `fe/lib/api.ts` | API Gateway | REST | HTTPS | `POST /upload` |
| `fe/lib/api.ts` | API Gateway | REST | HTTPS | `GET /job/{jobId}` |
| `fe/lib/api.ts` | API Gateway | REST | HTTPS | `GET /result/{jobId}` |

### 2. Frontend → S3 (Direct Upload)

| Từ | Đến | Loại | Protocol | Chi tiết |
|----|-----|------|----------|----------|
| `fe/components/UploadView.tsx` | S3 Uploads Bucket | Presigned PUT | HTTPS | PDF upload trực tiếp (5 min TTL) |

### 3. Frontend Preview Proxy → S3 (Server-side)

| Từ | Đến | Loại | Protocol | Chi tiết |
|----|-----|------|----------|----------|
| `fe/app/api/preview/[jobId]/route.ts` | Backend API | REST | HTTPS | Lấy download URL |
| `fe/app/api/preview/[jobId]/route.ts` | S3 Results Bucket | Presigned GET | HTTPS | Fetch content cho preview |

**Lý do proxy:** Tránh CORS issues khi client fetch trực tiếp từ S3 presigned URL.

### 4. S3 → Lambda (Event Trigger)

| Từ | Đến | Loại | Trigger |
|----|-----|------|---------|
| S3 Uploads Bucket | Orchestrator Lambda | S3 Event | `OBJECT_CREATED` prefix `uploads/` |

### 5. Lambda → Step Functions

| Từ | Đến | Loại | Chi tiết |
|----|-----|------|----------|
| Orchestrator Lambda | Step Functions State Machine | SDK call | `StartExecutionCommand` |
| Orchestrator Lambda (Direct mode) | Agents in-process | Function call | `Promise.allSettled` |

### 6. Inter-Agent Communication (via S3)

Agents không giao tiếp trực tiếp. Thay vào đó:

```
Extract → S3 (chunks/*.txt) → Translate → S3 (chunks/translated_*.txt)
Extract → S3 (formulas) → LaTeX → S3 (latex.json)
                                                    ↓
                                              Merge ← S3 (all results)
                                                    ↓
                                              S3 (analysis.md)
```

## Luồng Dữ Liệu End-to-End

```
1. User drag-drop PDF → UploadView
2. createUploadUrl() → POST /upload → Lambda → DynamoDB (pending) + S3 presigned URL
3. uploadFile() → PUT S3 presigned URL → PDF lên S3
4. S3 event trigger → Lambda Orchestrator
5. [SFN mode] → StartExecution → Step Functions pipeline
   [Direct mode] → supervisorHandler() → Promise.allSettled(agents)
6. Extract: S3 (PDF) → pdfjs/Textract → text → placeholders → S3 (chunks)
7. Parallel:
   a. Translate: S3 (chunks) → Mistral/Groq/Gemini → S3 (translated chunks)
   b. LaTeX: formulas → Groq/Gemini → S3 (latex.json)
8. Merge: S3 (all results) → bilingual Markdown → S3 (analysis.md) → DynamoDB (completed)
9. ProcessingView polling: GET /job/{jobId} → status updates → stepper animation
10. ResultView: GET /result/{jobId} → presigned download URL → preview + download
```

## Shared Dependencies

| Dependency | Backend | Frontend |
|-----------|---------|----------|
| TypeScript | ~5.9.3 | ^5 |
| API Base URL | Defined in API Gateway | Hardcoded in `lib/api.ts` |
| S3 bucket names | Environment variables | N/A (via API) |
| DynamoDB table | Environment variable | N/A (via API) |

## Deployment Boundaries

| Component | Platform | Region |
|-----------|----------|--------|
| Backend (CDK Stack) | AWS | ap-southeast-1 |
| Frontend (Next.js) | Vercel | Global CDN |
| API Gateway | AWS | ap-southeast-1 |
| S3 Buckets | AWS | ap-southeast-1 |
