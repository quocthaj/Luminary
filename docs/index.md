# Luminary Scholar — Tài Liệu Dự Án

> Tự động tạo bởi BMad Document Project · 2026-07-07  
> Scan level: Deep | Mode: Full Rescan

---

## 1. Tổng Quan Dự Án

*   **Tên dự án:** Luminary Scholar
*   **Mô hình mã nguồn:** Multi-part (Monorepo) — Backend + Frontend độc lập.
*   **Ngôn ngữ lập trình:** TypeScript (đồng bộ ở cả 2 đầu).
*   **Kiến trúc hệ thống:** Đường ống (pipeline) xử lý song song Serverless Multi-Agent chạy trên AWS Step Functions kết hợp cùng RAG Vector DB (Qdrant Cloud) và phòng phản biện ảo Thesis Defense.

---

## 2. Tham Khảo Nhanh

### 2.1. AWS CDK Backend (`be/`)
*   **Loại hình:** AWS CDK Infrastructure + Lambda Backend.
*   **Tech Stack:** TypeScript (~5.9.3), AWS CDK (v2), Lambda (Node.js 20.x), DynamoDB, S3 Buckets, Step Functions.
*   **Dịch vụ Vector & AI:** Qdrant Cloud, Gemini 2.5 Flash, Llama 3.3 (via Groq), DeepSeek Chat, Mistral, Google Cloud TTS (và AWS Polly làm fallback).
*   **Entry Points chính:**
    *   `be/bin/be.ts`: CDK App Entry.
    *   `be/lambda/index.ts`: API Gateway Router & S3 Event Trigger.
    *   `be/lambda/handlers/defense-router.ts`: Thesis Defense & Competency Profile Router.

### 2.2. Web Frontend (`fe/`)
*   **Loại hình:** Ứng dụng Web Next.js 16.
*   **Tech Stack:** Next.js 16.2.7 (App Router), React 19.2.4, TailwindCSS v4, Next-Auth v5.
*   **Công cụ học tập tích hợp:** KaTeX (công thức toán), Mermaid (sơ đồ tư duy), React Force Graph (Knowledge Graph), HSL Colors (chủ đề Warm Canvas / Editorial).
*   **Định tuyến chính:**
    *   `/` (Trang chủ & Upload Dashboard)
    *   `/library` (Quản lý tài liệu đã tải lên)
    *   `/explore` (Khám phá chủ đề & Topic Map)
    *   `/explore/studio/[sessionId]` (Phòng phản biện ảo Thesis Defense Studio)
    *   `/synthesis` (Tổng hợp so sánh chéo liên bài báo)

---

## 3. Bản Đồ Tài Liệu Hệ Thống

### 3.1. Tổng Quan & Cây Thư Mục
*   [Tổng quan dự án](./project-overview.md): Mục tiêu dự án, đối tượng phục vụ và các chức năng lớn.
*   [Tóm tắt dự án & Hướng dẫn hợp tác](./project-summary.md): Hướng dẫn phối hợp phát triển, quy trình đẩy code và kiểm định.
*   [Phân tích cây mã nguồn](./source-tree-analysis.md): Cây thư mục chi tiết monorepo, thống kê phân bổ mã nguồn.

### 3.2. Kiến Trúc Hệ Thống
*   [Kiến trúc Backend](./architecture-be.md): Hạ tầng AWS CDK, Step Functions, Lambda, Qdrant Cloud.
*   [Kiến trúc Frontend](./architecture-fe.md): Next.js App Router, hệ thống components React, styling v4.
*   [Kiến trúc tích hợp](./integration-architecture.md): Giao tiếp API, luồng dữ liệu end-to-end, cơ chế RAG và vòng lặp phản biện.

### 3.3. API & Cơ Sở Dữ Liệu
*   [Hợp đồng API — Backend](./api-contracts-be.md): Đặc tả chi tiết các endpoint HTTP, JWT authorization và tham số.
*   [Mô hình dữ liệu — Backend](./data-models-be.md): Cấu trúc các bảng DynamoDB, sơ đồ đối tượng S3 và types TypeScript chung.

### 3.4. Cẩm Nang Vận Hành
*   [Hướng dẫn phát triển](./development-guide.md): Hướng dẫn thiết lập môi trường devlocal, cài đặt và chạy thử.
*   [Hướng dẫn triển khai](./deployment-guide.md): Quy trình build, deploy hạ tầng AWS CDK và frontend Next.js.
*   [Hướng dẫn Tech Lead](./techlead-team-guide.md): Quản lý bảo mật, theo dõi log và kế hoạch mở rộng hệ thống.

---

## 4. Hướng Dẫn Chạy Nhanh (Quick Start)

### 4.1. Khởi động Backend
```bash
cd be
npm install
npm run build
npx cdk deploy
```

### 4.2. Khởi động Frontend
```bash
cd fe
npm install
npm run dev
```
