---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - "d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/prd.md"
  - "d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/addendum.md"
  - "d:/AI/viet-ai-scholar/docs/index.md"
  - "d:/AI/viet-ai-scholar/docs/project-overview.md"
  - "d:/AI/viet-ai-scholar/docs/architecture-be.md"
  - "d:/AI/viet-ai-scholar/docs/architecture-fe.md"
  - "d:/AI/viet-ai-scholar/docs/api-contracts-be.md"
  - "d:/AI/viet-ai-scholar/docs/data-models-be.md"
  - "d:/AI/viet-ai-scholar/docs/integration-architecture.md"
  - "d:/AI/viet-ai-scholar/docs/development-guide.md"
  - "d:/AI/viet-ai-scholar/docs/deployment-guide.md"
workflowType: 'architecture'
project_name: 'viet-ai-scholar'
user_name: 'Thai'
date: '2026-06-06'
lastStep: 8
status: 'complete'
completedAt: '2026-06-06T23:56:00Z'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
- **Dịch thuật & Dịch thử:** Hệ thống cho phép dịch thử 1 lần cho khách vãng lai (FR-1), giao diện hiển thị dạng cột song song side-by-side trên desktop hoặc tab switcher trên mobile (FR-2), hỗ trợ render LaTeX và sao chép công thức (FR-3).
- **Xác thực & Bảo mật:** Tích hợp NextAuth (FR-4) để quản lý đăng nhập, chặn tải file bản dịch nếu chưa đăng nhập (FR-5).
- **Thư viện cá nhân:** Lưu trữ bài báo, lọc theo thời gian (FR-6) và tối ưu hóa chi phí/tải trang bằng cách tải trực tiếp từ S3 cache khi mở lại, cung cấp nút dịch lại thủ công (FR-7).
- **Kiểm soát đầu vào:** Chặn file > 50MB, cảnh báo file > 30MB và xử lý lỗi mạng khi upload (FR-8).

**Non-Functional Requirements:**
- **Hiệu năng & Trải nghiệm:** Thời gian tải lại tài liệu cũ trong thư viện phải dưới 1.5 giây thông qua việc đọc trực tiếp từ S3.
- **Tối ưu chi phí:** Không tự động dịch lại tài liệu cũ khi mở lại, tránh lãng phí chi phí API từ nhà cung cấp mô hình (Gemini/Groq/Mistral).
- **Bảo mật & Quyền riêng tư:** Cô lập thư viện cá nhân theo ID người dùng từ NextAuth; áp dụng Lifecycle Rule xóa file gốc trên S3 sau 90 ngày.

**Scale & Complexity:**
Dự án có độ phức tạp cao (High Complexity) do kết hợp giữa hạ tầng Multi-agent Serverless (AWS Step Functions, Lambda, DynamoDB) và giao diện Web thời gian thực (Next.js App Router, Polling status, Client-side LaTeX rendering).

- Primary domain: Full-Stack Web App (Next.js FE + AWS Serverless BE)
- Complexity level: High
- Estimated architectural components: 7 thành phần chính (Next.js Frontend, NextAuth Engine, API Gateway Proxy, Lambda Supervisor, Step Functions Pipeline, S3 Storage, DynamoDB State Store)

### Technical Constraints & Dependencies
- **NextAuth Integration:** Cần cấu hình NextAuth hoạt động đồng bộ với AWS API Gateway/Lambda (hoặc sử dụng DynamoDB làm adapter lưu trữ phiên).
- **S3 Presigned URLs & CORS:** Cần proxy hoặc thiết lập CORS chính xác để client có thể upload trực tiếp lên S3 uploads bucket an toàn.
- **KaTeX/MathJax dependency:** Cần tích hợp thư viện render LaTeX ở client-side trên Next.js 16/React 19 mượt mà, không làm vỡ giao diện.

### Cross-Cutting Concerns Identified
- **Đồng bộ định danh người dùng:** Đảm bảo userID từ NextAuth được truyền chính xác xuống Lambda/DynamoDB để phân quyền truy cập thư viện và tài liệu tương ứng.
- **Quản lý Vòng đời Tài nguyên:** Lifecycle Rule tự động dọn dẹp file PDF gốc trên S3 sau 90 ngày để kiểm soát chi phí lưu trữ.
- **Xử lý lỗi mạng:** Cơ chế retry/resume upload và phản hồi lỗi mạng đồng bộ giữa Frontend và Backend.


## Starter Template Evaluation

### Primary Technology Domain
Dự án được phát triển dưới dạng **Full-Stack Web Application (Brownfield)** kết hợp giữa Frontend ứng dụng Next.js (App Router, Tailwind CSS, TypeScript) và Backend phi máy chủ (AWS CDK, Step Functions, Lambda, DynamoDB). Do đó, chúng ta sẽ tối ưu và mở rộng trên nền tảng sẵn có thay vì khởi tạo từ đầu.

### Starter Options Considered
1. **Next.js Frontend & AWS CDK Backend (Hiện tại):** Đã hoàn thành core pipeline dịch thuật ở Phase 1. Giữ nguyên cấu trúc thư mục hiện tại (`fe/` và `be/`) để giảm thiểu rủi ro tích hợp.
2. **Auth.js v5 (NextAuth.js@beta):** Lựa chọn chuẩn cho Next.js App Router để tích hợp cơ chế đăng nhập mạng xã hội (Google) và Email Passwordless.
3. **KaTeX core library:** Thư viện render công thức toán học tối ưu nhất cho Next.js (hỗ trợ SSR, tốc độ render vượt trội hơn MathJax và nhẹ hơn các wrapper thư viện bên thứ ba).

### Selected Starter: Existing Workspace + NextAuth & KaTeX Extends

**Rationale for Selection:**
- Việc tiếp tục sử dụng Next.js 16 (App Router) và AWS CDK (TypeScript) giúp tận dụng tối đa pipeline dịch thuật và hạ tầng serverless sẵn có.
- Tích hợp `next-auth@beta` (Auth.js v5) giúp kiểm soát phiên làm việc (Session) trực tiếp ở phía Next.js Edge Middleware một cách nhanh chóng.
- Sử dụng trực tiếp thư viện `katex` chính thức (thay vì các wrapper như `react-katex`) giúp render công thức toán học ở dạng Server Component hoặc Client Component rất nhẹ, ổn định và tránh lỗi vỡ layout (layout shift) khi Nam đọc bài báo.

**Initialization Commands (Frontend):**
```bash
# Di chuyển vào thư mục frontend và cài đặt NextAuth v5 và KaTeX
cd fe
npm install next-auth@beta katex
npm install -D @types/katex
```

### Architectural Decisions Provided by Starter:

**Language & Runtime:**
- **Frontend & Backend:** TypeScript 5.x chạy trên môi trường Node.js 20.x.

**Styling Solution:**
- **TailwindCSS 4.x:** Được sử dụng cho toàn bộ giao diện của Next.js frontend.
- **KaTeX CSS:** Import trực tiếp CSS của KaTeX tại `fe/app/layout.tsx` (`import 'katex/dist/katex.min.css'`) để render công thức chuẩn xác.

**Build Tooling:**
- Next.js webpack/turbopack để tối ưu hóa bundle size và code splitting phía client.

**Testing Framework:**
- Jest / React Testing Library cho Frontend, Jest cho AWS Lambda/CDK backend.

**Code Organization:**
- `be/lib/be-stack.ts`: Quản lý toàn bộ tài nguyên hạ tầng AWS.
- `be/lambda/`: Chứa mã nguồn của Supervisor và các Agent chuyên trách (Extract, Translate, LaTeX, Merge).
- `fe/app/`: Chứa các trang và API Route của Next.js (App Router).
- `fe/components/`: Chứa các component giao diện React (UploadView, ProcessingView, ResultView).


## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Quyết định then chốt):**
- **NextAuth JWT Integration & Secure Verification:** Sử dụng NextAuth (Auth.js v5) để sinh JWT ở Next.js client. Token được ký bằng thuật toán HS256 với mã khóa bí mật `AUTH_SECRET` đồng bộ giữa Next.js (Vercel) và AWS Lambda (Secrets Manager). Lambda Authorizer sẽ kiểm tra chữ ký số của token để xác thực trước khi cho phép truy cập.
- **Secure Download Stream Proxy:** Loại bỏ việc cung cấp trực tiếp Presigned URL tải file Markdown từ S3 cho Client. Thay vào đó, client truy cập qua API Route của Next.js `/api/preview/[jobId]`. API Route này thực hiện xác thực Session qua NextAuth và proxy/stream nội dung Markdown trực tiếp từ S3 về Client để bảo mật tuyệt đối và bypass CORS.
- **S3 Caching & Retrieval:** Client tải trực tiếp file Markdown đã dịch thông qua API Route proxy trên Next.js server (được cache từ S3) khi mở lại tài liệu cũ trong thư viện.
- **Client-Side KaTeX Render:** Tách chuỗi dịch thành text và công thức, sau đó render bằng component `LatexRenderer` client-side.

**Important Decisions (Quyết định quan trọng):**
- **DynamoDB User Library GSI:** Thêm trường `userId` vào bảng DynamoDB `Jobs` (trích xuất trực tiếp từ JWT ở Lambda Authorizer, không tin cậy client-side payload) và tạo GSI (Global Secondary Index) trên `userId` và `createdAt`.
- **Abuse Mitigation for Guest Trial:** Sử dụng AWS WAF để giới hạn tần suất gọi API sinh upload URL. Áp dụng cơ chế khóa tạm IP/Session trong DynamoDB để chặn khách vãng lai spam dịch thử. Cấu hình giới hạn dung lượng upload tối đa `content-length-range` (50MB) trong S3 Presigned Post Policy.
- **S3 Lifecycle Rules:** Tự động xóa file PDF gốc sau 24 giờ ở uploads bucket để tránh tích tụ file rác; giữ lại file dịch Markdown ở outputs bucket vô thời hạn.

**Deferred Decisions (Quyết định hoãn lại):**
- **Multi-PDF Collections & RAG (Phase 3 & 6):** Thiết kế pgvector trên RDS và luồng embedding sẽ được chuyển sang Phase tiếp theo.

### Technical Decomposition (Phân rã kiến trúc)
Hệ thống tích hợp được chia thành 5 module độc lập:
1.  **Module A: Authentication & Session (FE):** Cấu hình NextAuth v5, xử lý đăng nhập Google/Email, sinh JWT token và lưu session stateless ở client.
2.  **Module B: API Gateway & Authorization (Backend Bridge):** Lambda Authorizer giải mã HS256 JWT bằng `AUTH_SECRET` từ Secrets Manager, trích xuất và xác thực `userId`.
3.  **Module C: Document Library Metadata (Database):** Bảng DynamoDB `ScholarJobsTable` lưu trữ metadata dịch và GSI `UserLibraryIndex` phục vụ truy vấn lịch sử theo `userId`.
4.  **Module D: Secure Content Retrieval (S3 Streaming):** API Route `/api/preview/[jobId]` phía Next.js server xác thực session người dùng, dùng AWS SDK đọc file từ S3 và stream nội dung về trình duyệt.
5.  **Module E: LaTeX Client Rendering (FE):** Client Component `LatexRenderer` và bộ phân tách (parser) chuỗi Markdown chứa ký tự toán học (`$` hoặc `$$`) để render bằng KaTeX.

### Data Architecture
- **Caching:** S3 outputs bucket làm cache chính. Tải lại tài liệu cũ trong thư viện thông qua proxy API route của Next.js, đọc trực tiếp từ S3 cache.
- **DynamoDB Schema Updates:**
  - Table: `ScholarJobsTable`
  - Partition Key: `jobId` (string)
  - Attribute: `userId` (string, NextAuth sub ID)
  - Global Secondary Index (GSI): `UserLibraryIndex` (Partition Key: `userId`, Sort Key: `createdAt`)
- **Data Validation:** Sử dụng thư viện `zod` ở cả client-side và server-side.

### Authentication & Security
- **NextAuth v5 (Auth.js):** JWT Strategy (stateless, không lưu database để tối ưu chi phí).
- **API Authorization:** JWT được truyền qua HTTP Header `Authorization`. Lambda Authorizer xác thực chữ ký JWT bằng khóa bí mật lấy từ AWS Secrets Manager.
- **S3 Upload Safety:** Sử dụng Presigned Post URL với điều kiện `content-length-range` tối đa 50MB.
- **Lộ trình nâng cấp khóa:** Trong tương lai, khi hệ thống mở rộng quy mô, NextAuth sẽ được chuyển sang thuật toán ký **RS256** và công bố JWKS endpoint từ Next.js để AWS Lambda tự động fetch public key về xác thực, giữ backend hoàn toàn độc lập với frontend.

### API & Communication Patterns
- **API Design:** RESTful API qua AWS API Gateway + AWS Lambda.
- **State Polling:** Client polling (`setInterval` mỗi 2 giây) kiểm tra trạng thái dịch.
- **CORS Proxy Route:** API route `/api/preview/[jobId]` trên Next.js server làm nhiệm vụ kiểm tra session NextAuth, fetch từ S3 và stream nội dung về trình duyệt để bypass CORS an toàn.

### Frontend Architecture
- **State Management:** React local state (`useState`, `useContext`) + `useSession()` của NextAuth.
- **LaTeX rendering:** Sử dụng KaTeX (`npm install katex`). Tạo component `LatexRenderer` (Client Component) render LaTeX an toàn và tránh layout shift. Import trực tiếp `katex/dist/katex.min.css` vào `fe/app/layout.tsx` để tối ưu hóa việc load font/style ngay từ HTML đầu tiên.

### Infrastructure & Deployment
- **Frontend Hosting:** Vercel (tích hợp Edge Middleware cho NextAuth).
- **Backend Infrastructure:** AWS CDK deploy Serverless (Step Functions, Lambda, DynamoDB, API Gateway, AWS WAF).
- **CI/CD Pipeline:** GitHub Actions kiểm thử và deploy tự động.


## Implementation Patterns & Consistency Rules

### Naming Patterns

**Database Naming Conventions:**
- Bảng chính: `vietai-jobs`
- GSI (Chỉ mục phụ): `userIdIndex`
- Định dạng thuộc tính (Attributes): Sử dụng **camelCase** toàn bộ.
  - Ví dụ đúng: `jobId`, `userId`, `createdAt`, `originalName`, `fileSize`, `status`, `outputKey`.
  - Tránh: `user_id`, `created_at`.

**API Naming Conventions:**
- Endpoint RESTful:
  - `POST /api/jobs`: Khởi tạo lượt dịch (trả về upload presigned URL và `jobId`).
  - `GET /api/jobs`: Lấy danh sách tài liệu đã dịch của người dùng hiện tại (quét theo GSI `userIdIndex`).
  - `GET /api/jobs/{jobId}`: Polling trạng thái tiến trình dịch.
  - `GET /api/preview/{jobId}`: Proxy Route trên Next.js Server (xác thực qua NextAuth và stream file Markdown từ S3).
- Định dạng tham số: `jobId` thay vì `job_id` hoặc `{id}`.

**Code Naming Conventions:**
- **React Components:** PascalCase (Ví dụ: `LatexRenderer.tsx`, `SidebarLibrary.tsx`).
- **Functions & Variables:** camelCase (Ví dụ: `fetchJobStatus`, `isTranslating`).
- **Interfaces & Types:** PascalCase (Ví dụ: `JobMetadata`, `TranslationResponse`).

### Structure Patterns

**Project Organization:**
- **Frontend Components:** Đặt tại `fe/components/shared/LatexRenderer.tsx` (các component dùng chung) và `fe/app/` (các trang theo App Router).
- **Backend Utilities:** Đặt tại `be/lambda/utils/` (Ví dụ: `dynamodb-helpers.ts`).
- **TypeScript Types:** Các type dùng chung được đặt tại `fe/types/jobs.ts` (nguồn chân lý duy nhất cho dữ liệu frontend) và `be/lambda/types/`.

### Format Patterns

**API Response Formats:**
- **Success:** Trả về trực tiếp JSON object chứa thông tin cần thiết.
- **Error:** Định dạng thống nhất `{ error: string }`.
- **Date/Time:** Lưu dưới dạng **Unix epoch timestamp (milliseconds)** dạng `NUMBER` trong DynamoDB để đồng bộ với định nghĩa `sortKey` của `userIdIndex` trong CDK stack.

### Process Patterns

**Authentication Verification Pattern (Lambda Authorizer):**
- Client đính kèm JWT vào header: `Authorization: Bearer <token>`.
- Authorizer Lambda thực hiện giải mã đối xứng HS256 bằng khóa bí mật `AUTH_SECRET` từ Secrets Manager.
- Nếu token hợp lệ, inject `userId` vào request context (`event.requestContext.authorizer.userId`).

**S3 Streaming Proxy Pattern:**
- Next.js route `fe/app/api/preview/[jobId]/route.ts` sẽ:
  1. Gọi `auth()` để kiểm tra NextAuth session. Nếu không có session, trả về `401 Unauthorized`.
  2. Sử dụng AWS SDK với IAM role để gọi `GetObjectCommand` lấy file Markdown từ `ResultsBucket`.
  3. Stream nội dung Markdown trực tiếp về trình duyệt (`ReadableStream`).

**LaTeX Render Pattern:**
- Component `LatexRenderer` sẽ nhận chuỗi Markdown, dùng Regex tách các công thức toán nằm giữa cặp ký tự `$` (inline) hoặc `$$` (block).
- Dùng `katex.renderToString` để chuyển đổi chuỗi công thức thành HTML an toàn.
- Import `katex/dist/katex.min.css` toàn cục tại `fe/app/layout.tsx`.

### Enforcement Guidelines

- **Không tự động sinh code ad-hoc:** Mọi AI Agent tham gia phát triển bắt buộc phải tham chiếu đến các tệp mẫu (`be/lambda/utils/dynamodb-helpers.ts` và `fe/lib/api.ts`) để viết code đúng chuẩn.
- **Tối ưu hóa ghi DynamoDB:** Khi cập nhật tiến trình (status), chỉ sử dụng `UpdateItem` cập nhật thuộc tính `status` và `updatedAt`, nghiêm cấm gọi `PutItem` ghi đè toàn bộ record để tiết kiệm WCU.
- **Xử lý lỗi HTTP:** API luôn trả về mã lỗi HTTP tương ứng (401, 403, 404) kèm theo JSON body `{ error: string }`. Nghiêm cấm trả về HTTP status 200 kèm error message bên trong body.
- **Trạng thái loading:** Đối với Thư viện bài báo, sử dụng hiệu ứng Skeleton shimmer (khung xương xám chạy hiệu ứng shimmer) thay vì icon Spinner xoay tròn truyền thống để tạo trải nghiệm cao cấp.


## Project Structure & Boundaries

### Complete Project Directory Structure
Dưới đây là sơ đồ cây cấu trúc thư mục hoàn chỉnh của dự án VietAI Scholar sau khi tích hợp Phase 2:

```text
viet-ai-scholar/
├── be/                       # BACKEND (AWS CDK & Lambdas)
│   ├── bin/
│   │   └── be.ts             # Điểm chạy CDK app
│   ├── lib/
│   │   └── be-stack.ts       # Cấu hình CDK stack (S3, DynamoDB, API GW, Step Functions)
│   ├── lambda/               # Nguồn mã Lambda
│   │   ├── authorizer.ts     # Lambda Authorizer xác thực JWT bằng Web Crypto API (MỚI)
│   │   ├── supervisor.ts     # Lambda Orchestrator điều khiển pipeline
│   │   ├── types.ts          # Nguồn chân lý duy nhất (Single Source of Truth) cho kiểu dữ liệu
│   │   ├── handlers/         # Các controller Lambda handlers
│   │   │   ├── extract.ts
│   │   │   ├── translate.ts
│   │   │   ├── latex.ts
│   │   │   └── merge.ts
│   │   └── utils/            # Thư viện tiện ích (DynamoDB, S3)
│   │       └── dynamodb-helpers.ts
│   ├── package.json
│   └── tsconfig.json
├── fe/                       # FRONTEND (Next.js Application)
│   ├── app/                  # Next.js App Router
│   │   ├── layout.tsx        # Layout gốc (import KaTeX CSS toàn cục)
│   │   ├── page.tsx          # Trang chủ / Trang dịch tài liệu song song
│   │   ├── library/          # Thư viện cá nhân của người dùng (MỚI)
│   │   │   └── page.tsx
│   │   ├── api/
│   │   │   ├── auth/         # API Endpoint của NextAuth (MỚI)
│   │   │   │   └── [...nextauth]/route.ts
│   │   │   └── preview/      # Proxy API Route để secure stream kết quả
│   │   │       └── [jobId]/
│   │   │           └── route.ts  # Stream file từ S3 sau khi check NextAuth session
│   │   └── globals.css       # Style chính & Tailwind CSS
│   ├── components/           # React Components
│   │   ├── ProcessingView.tsx
│   │   ├── ResultView.tsx
│   │   ├── UploadView.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── SidebarLibrary.tsx # Sidebar hiển thị lịch sử bài dịch (MỚI)
│   │   └── shared/
│   │       └── LatexRenderer.tsx # Render toán học bằng KaTeX (MỚI)
│   ├── lib/                  # Thư viện helper frontend
│   │   └── api.ts            # Client gọi API Backend
│   ├── scripts/
│   │   └── sync-types.js     # Script đồng bộ copy file types từ backend sang frontend (MỚI)
│   ├── types/
│   │   └── jobs.ts           # Types tự động đồng bộ từ backend (MỚI)
│   ├── auth.ts               # Cấu hình NextAuth v5 (MỚI)
│   ├── middleware.ts         # Middleware Next.js kiểm tra session (MỚI)
│   ├── package.json
│   ├── vercel.json           # Cấu hình triển khai trên Vercel
│   └── tsconfig.json
```

### Architectural Boundaries

**API Boundaries:**
- **External API Boundary:** API Gateway đại diện cho cổng kết nối từ bên ngoài vào Backend. Mọi API endpoint thay đổi dữ liệu hoặc lấy dữ liệu cá nhân (`GET /api/jobs`, `POST /api/jobs`) đều phải đi qua `authorizer.ts` Lambda để xác thực JWT.
- **Next.js Auth Boundary:** Session của người dùng được phân tách tại Next.js `middleware.ts`. Các trang riêng tư như `/library` sẽ chuyển hướng (redirect) về trang đăng nhập nếu người dùng chưa đăng nhập.

**Component Boundaries:**
- **LaTeX Rendering Boundary:** Component `LatexRenderer.tsx` đóng gói toàn bộ logic KaTeX. Các component cha (`ResultView.tsx`) chỉ truyền chuỗi văn bản thô vào và không cần biết công thức toán học được xử lý thế nào phía sau.
- **Client/Server Boundary:** Việc lấy file dịch từ S3 được xử lý thông qua API Route phía Server của Next.js (`/api/preview/[jobId]`), ngăn chặn việc lộ token AWS hoặc URL S3 trực tiếp ra phía Client.

**Data Boundaries:**
- **DynamoDB Boundary:** Toàn bộ việc ghi/đọc cơ sở dữ liệu DynamoDB đều phải thông qua các hàm helper trong `be/lambda/utils/dynamodb-helpers.ts` để đảm bảo kiểu dữ liệu an toàn.
- **S3 Caching Boundary:** Client chỉ được tương tác trực tiếp với S3 thông qua Presigned URL có thời gian hiệu lực ngắn (15 phút) cho việc tải PDF gốc lên.

### Requirements to Structure Mapping

**Epic: Authentication & Personal Library (Phase 2)**
- **NextAuth Integration:** `fe/auth.ts`, `fe/app/api/auth/[...nextauth]/route.ts`, và `fe/middleware.ts`.
- **Personal Library View:** `fe/app/library/page.tsx`, `fe/components/SidebarLibrary.tsx`.
- **JWT Authorization Link:** `be/lambda/authorizer.ts` (kiểm tra JWT) và cập nhật `be/lib/be-stack.ts` để gán Authorizer vào API Gateway.
- **Database Query GSI:** Quét dữ liệu qua GSI `userIdIndex` in DynamoDB.

**Epic: Core Pipeline & LaTeX Rendering (Phase 1 & 2)**
- **LaTeX Extractor:** `be/lambda/handlers/latex.ts` và `be/lambda/agents/latex.ts`.
- **Latex Render Component:** `fe/components/shared/LatexRenderer.tsx`.
- **Global CSS styling:** `fe/app/layout.tsx` (import `katex/dist/katex.min.css`).

### File Organization Patterns
- **Configuration Files & Environment Secrets:**
  - Frontend: Biến môi trường local tại `.env.local` và Vercel settings cho production.
  - Backend: `be/cdk.json` và AWS Secrets Manager.
  - **Quy tắc đồng bộ Secrets:** Mã khóa `AUTH_SECRET` bắt buộc phải được đồng bộ thủ công hoặc qua CI/CD giữa Vercel environment variables và AWS Secrets Manager.
- **Source Organization & Types Sync:**
  - `be/lambda/types.ts` là nguồn chân lý duy nhất cho các interface kiểu dữ liệu.
  - Script `fe/scripts/sync-types.js` sẽ chạy tự động trong giai đoạn tiền-build (`prebuild`) của frontend để copy và đồng bộ các file type từ backend sang frontend.
- **Test Organization:** Unit tests nằm kế bên file source code (ví dụ: `LatexRenderer.test.tsx` nằm cùng thư mục với `LatexRenderer.tsx`) để dễ quản lý.


## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
- Next.js 16 (App Router) chạy trên Node.js 20 hoàn toàn tương thích với NextAuth v5 và các thư viện render KaTeX. 
- Môi trường Lambda Node.js 20 tương thích hoàn hảo với việc xác thực JWT bằng Web Crypto API tích hợp sẵn.

**Pattern Consistency:**
- Quy tắc đặt tên camelCase đồng bộ 100% giữa DynamoDB attributes, các schema type định nghĩa ở `be/lambda/types.ts` và API JSON Payload.
- Việc sử dụng `UpdateItem` thay vì `PutItem` đảm bảo hiệu suất tối ưu và tiết kiệm dung lượng WCU cho DynamoDB.

**Structure Alignment:**
- Thư mục backend (`be/`) và frontend (`fe/`) được cấu trúc rõ ràng, hỗ trợ deploy độc lập (Vercel + AWS CDK).
- Cơ chế stream proxy ở Next.js API route `/api/preview/[jobId]` khớp hoàn toàn với mô hình phân rã bảo mật, cô lập tài nguyên S3 khỏi client.

### Requirements Coverage Validation ✅

**Epic/Feature Coverage:**
- **Epic: Authentication & Session:** Được hỗ trợ đầy đủ bởi NextAuth v5 và JWT Token.
- **Epic: Personal Library:** Hỗ trợ đầy đủ bởi GSI `userIdIndex` trên DynamoDB và Next.js proxy route `/api/preview`.
- **Epic: LaTeX Rendering:** Hỗ trợ bởi thư viện KaTeX và component Client-side `LatexRenderer`.

**Functional Requirements Coverage:**
- **FR-3 (Side-by-side View):** LaTeX được render mượt mà không bị layout shift.
- **FR-5 (Secure Library):** Được phân quyền qua JWT và S3 proxy route.
- **FR-8 (File Size Validation):** Giới hạn cứng 50MB bằng `content-length-range` của S3 Presigned Post Policy và kiểm tra client-side trước khi upload.

**Non-Functional Requirements Coverage:**
- **Security:** Mã hóa token HS256, Lambda Authorizer giải mã bằng Web Crypto API, AWS WAF chống spam dịch thử.
- **Performance:** Tải file Markdown trực tiếp từ S3 cache (< 1.5s), NextAuth stateless JWT không tốn chi phí truy vấn database.

### Implementation Readiness Validation ✅

**Decision Completeness:**
- Mọi quyết định kỹ thuật cốt lõi (NextAuth, KaTeX, S3 proxy) đều có cấu trúc triển khai cụ thể, không còn phần mơ hồ.

**Structure Completeness:**
- Thư mục code chi tiết đến từng file mới cần tạo (`authorizer.ts`, `LatexRenderer.tsx`, `sync-types.js`), giúp các Dev Agent dễ dàng thực thi.

**Pattern Completeness:**
- Quy tắc đặt tên, định dạng lỗi HTTP, định dạng Date/Time và loading skeleton đã được quy định chi tiết.

### Gap Analysis Results
- **Critical Gaps:** Không có. Hệ thống đã đủ điều kiện triển khai ngay lập tức.
- **Important Gaps:** Cần đảm bảo đồng bộ hóa khóa bí mật `AUTH_SECRET` giữa Vercel (Frontend) và AWS Secrets Manager (Backend) khi deploy production. Giao điểm này được đưa vào checklist deploy.

### Validation Issues Addressed
- **Trùng lặp kiểu dữ liệu:** Đã xử lý bằng cách đồng bộ hóa tự động qua script `fe/scripts/sync-types.js` chạy ở prebuild.
- **Bảo mật S3 download:** Đã xử lý bằng Next.js Proxy Route thay vì phát trực tiếp Presigned URL.
- **Cold start của Lambda Authorizer:** Đã xử lý bằng cách sử dụng Web Crypto API thuần thay vì cài đặt thêm thư viện JWT bên ngoài.

### Architecture Completeness Checklist

- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION (Toàn bộ 16 hạng mục checklist đều đạt chuẩn và không còn Critical Gap nào).

**Confidence Level:** High (Độ tin cậy cao nhờ sự đồng bộ chặt chẽ với hạ tầng CDK hiện tại).

**Key Strengths:**
- Bảo mật và phân quyền chặt chẽ bằng Lambda Authorizer kết hợp Next.js S3 Proxy Route.
- Hiệu năng tải trang cao nhờ render LaTeX ở Client và caching file Markdown trực tiếp ở S3.
- Tiết kiệm chi phí vận hành (DynamoDB Pay-per-request, Vercel Serverless, stateless NextAuth).

**Areas for Future Enhancement:**
- Chuyển đổi từ HS256 (Mã khóa đối xứng) sang RS256 (Mã khóa bất đối xứng qua JWKS endpoint) khi hệ thống scale ra mô hình nhiều microservices.
- Triển khai Qdrant Cloud làm Vector Store chính thức thay thế các giải pháp AWS đóng để tối ưu hóa chi phí và hiệu suất.

## Luminary Workspace & RAG Architecture (Phase 3+ Expansion)

### 1. Vector Database Integration: Qdrant Cloud
- **Hosting Model:** Qdrant Cloud (Managed Serverless Free Tier / Pay-As-You-Go).
- **Communication Pattern:** AWS Lambda gọi Qdrant Cloud HTTPS API sử dụng `@qdrant/js-client-sdk`.
- **Namespace Strategy:** Cách ly dữ liệu vector (Multi-tenancy) bằng cách sử dụng `collection` duy nhất (ví dụ: `vietai-scholar-chunks`) và lọc bằng payload filter trên trường `userId` và `jobId`.
- **Payload Schema:**
  ```json
  {
    "userId": "string (NextAuth sub)",
    "jobId": "string (UUID)",
    "text_original": "string",
    "text_translated": "string",
    "chunkIndex": "number",
    "section": "string"
  }
  ```

### 2. Ingestion & Embedding Pipeline (Step Functions Upgrade)
Sau khi `MergeAgent` hoàn thành việc kết xuất file dịch song ngữ Markdown:
1.  **Lambda chunking:** Chia nhỏ file Markdown thành các chunk có độ dài 500-1000 ký tự, giữ nguyên cấu trúc đoạn (paragraph boundary) và công thức LaTeX.
2.  **Lambda embedding:** Gọi API Embedding (như `text-embedding-004` của Gemini) thông qua biến môi trường để sinh vector 768-dimension.
3.  **Qdrant Upsert:** Lưu trữ danh sách vector kèm payload tương ứng vào Qdrant Cloud.

### 3. RAG Chat Engine & API Endpoint
- **API Endpoint:** `/api/chat/[jobId]` (Next.js App Router).
- **Security Guard:** Kiểm tra session người dùng qua NextAuth. Chỉ cho phép truy vấn nếu `jobId` thuộc quyền sở hữu của `userId` hiện tại.
- **RAG Retrieval Flow:**
  1. Frontend gửi câu hỏi của người dùng và `jobId`.
  2. Next.js Route sinh vector embedding cho câu hỏi.
  3. Query Qdrant Cloud với filter: `{ "must": [{ "key": "userId", "match": { "value": userId } }, { "key": "jobId", "match": { "value": jobId } }] }`.
  4. Lấy top 3-5 chunks tương đồng nhất.
  5. Đưa câu hỏi và context văn bản (cả bản gốc EN và bản dịch VI) vào Gemini để trả về câu trả lời phân tích có trích dẫn.

### 4. Interactive Learning Tools Generation (Quiz, Flashcard, Mind Map)
- **API Endpoint:** `/api/tools/[jobId]/[toolType]` (Next.js App Router).
- **Quiz & Flashcard Generation:** 
  - Gửi file Markdown dịch thuật từ S3 vào Gemini API.
  - Sử dụng **Structured JSON Output** để yêu cầu Gemini trả về đúng schema câu hỏi trắc nghiệm hoặc bộ thẻ flashcard.
- **Mind Map Generation:**
  - Gemini đọc nội dung bài báo và sinh ra chuỗi mã nguồn **Mermaid.js diagram**.
  - Frontend sử dụng thư viện `@mermaid-js/mermaid` hoặc render SVG để hiển thị sơ đồ tư duy tương tác cho người dùng.

### 5. Semantic Scholar Integration
- **API Endpoint:** `/api/semantic-scholar` (Next.js App Router).
- **Luồng tìm kiếm:** Frontend gửi danh sách các citations từ bài viết hoặc từ khóa chính. Next.js API route gọi Semantic Scholar API (`https://api.semanticscholar.org/graph/v1/paper/search`) để tìm các bài báo liên quan, lấy metadata (title, authors, year, abstract, link PDF) và hiển thị trên Workspace.


### Implementation Handoff

**AI Agent Guidelines:**
- Tuân thủ chính xác cấu trúc camelCase cho các thuộc tính DynamoDB.
- Chỉ chỉnh sửa types tại file gốc `be/lambda/types.ts`, chạy script đồng bộ types trước khi test frontend.
- Sử dụng đúng mã lỗi HTTP tương ứng khi viết các API route hoặc Lambda handler.

**First Implementation Priority:**
- Cài đặt thư viện: `npm install next-auth@beta katex` ở thư mục `fe`.
- Tạo file cấu hình `fe/auth.ts` và script đồng bộ `fe/scripts/sync-types.js`.

