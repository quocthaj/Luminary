# VietAI Scholar — Tổng Quan Dự Án

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Tóm Tắt

**VietAI Scholar** là nền tảng dịch thuật tài liệu học thuật PDF từ tiếng Anh sang tiếng Việt sử dụng AI. Hệ thống xử lý PDF thông qua pipeline đa agent trên AWS, trích xuất văn bản, dịch thuật, xử lý công thức toán học LaTeX, mô tả hình ảnh/biểu đồ, và phân loại trích dẫn — cuối cùng xuất ra file Markdown song ngữ (EN/VI).

## Bảng Tóm Tắt Công Nghệ

| Danh mục | Công nghệ | Phiên bản | Ghi chú |
|----------|-----------|-----------|---------|
| Ngôn ngữ | TypeScript | ~5.9.3 (BE) / ^5 (FE) | Toàn bộ codebase |
| Hạ tầng | AWS CDK | 2.1123.0 | Infrastructure as Code |
| Compute | AWS Lambda (Node.js 20.x) | — | 5 Lambda functions |
| Orchestration | AWS Step Functions | — | Pipeline: Extract → (Translate + LaTeX) → Merge |
| Lưu trữ | Amazon S3 | — | 3 buckets: uploads, results, frontend |
| Cơ sở dữ liệu | Amazon DynamoDB | — | 1 bảng `vietai-jobs` (PAY_PER_REQUEST) |
| OCR | Amazon Textract + pdfjs-dist | — | Fallback: pdfjs → Textract async |
| AI Providers | Mistral, Groq (Llama 3.3 70B), Gemini 2.0 Flash, DeepSeek | — | Multi-provider với fallback chain |
| Frontend | Next.js | 16.2.7 | App Router, React 19 |
| UI Framework | React | 19.2.4 | Client-side components |
| CSS | TailwindCSS | ^4 | + CSS custom properties cho design tokens |
| Typography | Fraunces + Be Vietnam Pro | — | Google Fonts |
| Hosting | Vercel | — | Frontend deployment |
| API | Amazon API Gateway | — | REST API, stage `dev` |
| Bí mật | AWS Secrets Manager | — | 4 API keys: Groq, Gemini, DeepSeek, Mistral |

## Kiến Trúc Tổng Quan

- **Loại repository:** Multi-part (monorepo)
- **Cấu trúc:** 2 phần riêng biệt — `be/` (backend) và `fe/` (frontend)
- **Mô hình kiến trúc:** Serverless event-driven + Multi-agent pipeline
- **Region:** `ap-southeast-1` (Singapore)

## Luồng Xử Lý Chính

1. Người dùng upload PDF qua frontend → gọi `POST /upload`
2. Backend tạo presigned URL + job record trong DynamoDB
3. File được upload trực tiếp lên S3 (`uploads/`)
4. S3 event trigger khởi động Lambda Orchestrator
5. Orchestrator quyết định: Step Functions mode hoặc Direct mode
6. Pipeline: **Extract** → parallel(**Translate Map** + **LaTeX**) → **Merge**
7. Kết quả Markdown song ngữ lưu vào S3 (`results/`)
8. Frontend polling job status → hiển thị kết quả + link tải

## Liên Kết Tài Liệu Chi Tiết

- [Kiến trúc Backend](./architecture-be.md)
- [Kiến trúc Frontend](./architecture-fe.md)
- [Phân tích cây mã nguồn](./source-tree-analysis.md)
- [API Contracts](./api-contracts-be.md)
- [Data Models](./data-models-be.md)
- [Kiến trúc tích hợp](./integration-architecture.md)
- [Hướng dẫn phát triển](./development-guide.md)
- [Hướng dẫn triển khai](./deployment-guide.md)
