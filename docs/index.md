# VietAI Scholar — Tài Liệu Dự Án

> Tự động tạo bởi BMad Document Project · 2026-06-06
> Scan level: Exhaustive | Mode: Initial Scan

## Tổng Quan Dự Án

- **Tên:** VietAI Scholar
- **Loại:** Multi-part (monorepo) — Backend + Frontend
- **Ngôn ngữ chính:** TypeScript
- **Kiến trúc:** Serverless multi-agent pipeline (AWS)

## Tham Khảo Nhanh

### Backend (`be/`)

- **Loại:** AWS CDK Infrastructure + Lambda Backend
- **Tech Stack:** TypeScript, AWS CDK, Lambda (Node.js 20.x), DynamoDB, S3, Step Functions
- **AI Providers:** Mistral 7B, Groq (Llama 3.3 70B), Google Gemini 2.0 Flash, DeepSeek
- **Entry Point:** `be/lambda/index.ts`
- **Pattern:** Event-driven serverless + multi-agent supervisor

### Frontend (`fe/`)

- **Loại:** Next.js 16 Web Application
- **Tech Stack:** Next.js 16.2.7, React 19.2.4, TailwindCSS 4
- **Entry Point:** `fe/app/page.tsx`
- **Pattern:** SPA-like state machine (Upload → Processing → Result)

## Tài Liệu Đã Tạo

### Tổng Quan
- [Tổng quan dự án](./project-overview.md)
- [Phân tích cây mã nguồn](./source-tree-analysis.md)

### Kiến Trúc
- [Kiến trúc Backend](./architecture-be.md)
- [Kiến trúc Frontend](./architecture-fe.md)
- [Kiến trúc tích hợp](./integration-architecture.md)

### API & Data
- [API Contracts — Backend](./api-contracts-be.md)
- [Data Models — Backend](./data-models-be.md)

### Hướng Dẫn
- [Hướng dẫn phát triển](./development-guide.md)
- [Hướng dẫn triển khai](./deployment-guide.md)

## Bắt Đầu Nhanh

### Backend
```bash
cd be
npm install
npm run build
npx cdk deploy
```

### Frontend
```bash
cd fe
npm install
npm run dev
```

## Tài Liệu Hiện Có

- [README — Backend](../be/README.md)
- [README — Frontend](../fe/README.md)
