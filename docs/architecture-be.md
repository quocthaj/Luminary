# Kiến Trúc Backend — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Tóm Tắt

Backend là hệ thống serverless trên AWS, sử dụng CDK (Infrastructure as Code) để định nghĩa toàn bộ hạ tầng. Kiến trúc multi-agent với 2 chế độ hoạt động: **Step Functions mode** (production) và **Direct mode** (fallback).

## Hạ Tầng AWS

### S3 Buckets (3 buckets)

| Bucket | Tên | Mục đích | Lifecycle |
|--------|-----|----------|-----------|
| Uploads | `vietai-uploads-{accountId}` | PDF upload từ user | temp/ → 90 ngày |
| Results | `vietai-results-{accountId}` | Kết quả dịch (Markdown, JSON) | 30 ngày |
| Frontend | `vietai-frontend-{accountId}` | SPA hosting | — |

- Tất cả bucket: `BlockPublicAccess.BLOCK_ALL`, `S3_MANAGED` encryption
- Uploads bucket có CORS cho presigned URL PUT

### DynamoDB

- **Bảng:** `vietai-jobs`
- **Partition Key:** `jobId` (String)
- **Billing:** PAY_PER_REQUEST (auto-scale)
- **GSI:** `userIdIndex` (userId + createdAt) cho listing user jobs
- **TTL:** `expiresAt` (30 ngày sau tạo)
- **Stream:** NEW_AND_OLD_IMAGES
- **Point-in-time recovery:** Bật

**Schema item:**
```
{
  jobId: string,
  status: "pending" | "queued" | "extracting" | "extracted" | "processing" | "orchestrating" | "agents_completed" | "completed" | "failed",
  fileName: string,
  s3Key: string,
  userId: string (default: "guest"),
  createdAt: number (epoch seconds),
  expiresAt: number (epoch seconds),
  s3OutputKey?: string,
  completedAt?: number,
  errorMsg?: string,
  hasFormula?: boolean,
  hasDiagram?: boolean,
  hasCitation?: boolean
}
```

### Lambda Functions (5)

| Lambda | Tên | Entry | Timeout | RAM | Mục đích |
|--------|-----|-------|---------|-----|----------|
| Orchestrator | `vietai-orchestrator` | `lambda/index.ts` | 600s (10 min) | 1024 MB | Main handler + S3 trigger + API routing |
| Extract | `vietai-extract` | `lambda/handlers/extract.ts` | 120s | 2048 MB | PDF text extraction (pdfjs + Textract) |
| Translate | `vietai-translate` | `lambda/handlers/translate.ts` | 60s | 512 MB | Chunk translation (Mistral→Groq→Gemini) |
| LaTeX | `vietai-latex` | `lambda/handlers/latex.ts` | 60s | 512 MB | LaTeX formula normalization |
| Merge | `vietai-merge` | `lambda/handlers/merge.ts` | 60s | 512 MB | Merge all results → final Markdown |

### Step Functions State Machine

- **Tên:** `vietai-processing-pipeline`
- **Timeout:** 15 phút
- **Luồng:**

```
Extract → Parallel [
  Map(Translate, maxConcurrency=5),
  LaTeX
] → Merge
```

- **Map state:** Dịch song song tối đa 5 chunks cùng lúc
- **Parallel state:** Translate và LaTeX chạy đồng thời

### API Gateway

- **Tên:** `vietai-scholar-api`
- **Stage:** `dev`
- **Throttling:** 100 req/s, burst 200
- **CORS:** ALL_ORIGINS (dev mode)

### Secrets Manager (4 secrets)

| Secret | ARN Variable | Provider |
|--------|-------------|----------|
| `vietai/groq-api-key` | `GROQ_SECRET_ARN` | Groq (Llama 3.3 70B) |
| `vietai/gemini-api-key` | `GEMINI_SECRET_ARN` | Google Gemini 2.0 Flash |
| `viet-ai-scholar/deepseek-api-key` | `DEEPSEEK_SECRET_ARN` | DeepSeek Chat |
| `viet-ai-scholar/mistral-api-key` | `MISTRAL_SECRET_ARN` | Mistral 7B |

## Multi-Agent Architecture

### Supervisor Pattern

Supervisor (`supervisor.ts`) nhận `SupervisorInput` gồm `{ jobId, fileName, extractedText }` và:

1. **Tách placeholders** — regex trích xuất formulas, figures, citations
2. **Cập nhật DynamoDB** — đánh dấu processing + metadata flags
3. **Quyết định mode:**
   - Có `STATE_MACHINE_ARN` → Step Functions mode (async, scalable)
   - Không có → Direct mode (in-process, `Promise.allSettled`)

### Agents

| Agent | File | AI Provider | Fallback Chain | Mục đích |
|-------|------|-------------|----------------|----------|
| Translator | `agents/translator.ts` | Mistral 7B | Mistral → Groq → Gemini | Dịch EN→VI, chunked (7000 chars/chunk) |
| LaTeX | `agents/latex.ts` | Groq | Groq → Gemini | Chuẩn hóa công thức toán → LaTeX syntax |
| Diagram | `agents/diagram.ts` | Groq | Groq → Gemini | Mô tả hình/biểu đồ → alt-text |
| Citation | `agents/citation.ts` | Không dùng AI | — | Pure regex: phân loại numbered/author-year |
| Merge | `agents/merge.ts` | Không dùng AI | — | Gộp tất cả → Markdown song ngữ cuối cùng |

### AI Provider Fallback Chain

```
processWithAI(): Groq → Gemini
processWithMistral(): Mistral only
Translator: Mistral → Groq → Gemini (triple fallback)
```

- Secret cache in-memory (`secretCache` map) — tránh gọi Secrets Manager lặp lại
- Tất cả AI calls: `temperature: 0.3`, `max_tokens: 4096`

## Text Extraction Pipeline

1. **pdfjs-dist** (ưu tiên) — nhanh, rẻ, chạy local
2. **Amazon Textract** (fallback) — async OCR, polling max 90s
   - Phát hiện layout 2 cột tự động (centerCrossers ratio < 20%)
   - Paragraph break detection dựa trên gap giữa dòng
   - Xử lý word-break hyphenation (`intelli-\ngent` → `intelligent`)

## Placeholder System

Regex trích xuất 3 loại:

1. **Formulas:** `$...$`, `\(...\)`, `\[...\]`, `y = mx + b`, `x^2`, Unicode math symbols
2. **Figures:** `[fig 1]`, `Figure 1`, `Table 2a`
3. **Citations:** `[1]`, `[1,2,3]`, `[Smith, 2024]`, `(Author et al., 2024)`

Thay thế bằng `{{formula_X}}`, `{{figure_X}}` → agents xử lý riêng → merge gộp lại.

## Bundling Strategy

- esbuild (qua `lambdaNode.NodejsFunction`)
- External modules: `@aws-sdk/*`, `@smithy/*`, `pdfjs-dist`
- pdfjs-dist copy thủ công qua `afterBundling` hooks (xcopy trên Windows, cp trên Linux)
