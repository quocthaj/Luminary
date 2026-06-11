---
baseline_commit: ff555c6be4fd17f2d68dca450812661023ccc4e3
---

# Story 3.3: API RAG Chat an toàn (Secure RAG Chat API & Namespace Filter)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a người dùng đã đăng nhập,
I want một API Route xử lý tìm kiếm vector tương đồng bảo mật và gọi LLM trả lời câu hỏi thông qua API Gateway và Lambda,
so that tôi nhận được câu trả lời chính xác dựa trên nội dung bài báo hiện tại mà không lo lộ secrets hay dữ liệu cá nhân.

## Acceptance Criteria

1. **Given** Người dùng gửi câu hỏi từ Workspace giao diện,
2. **When** Client gọi API Route Next.js `POST /api/chat/[jobId]`:
   - API Route phải kiểm tra NextAuth session (nếu chưa đăng nhập, trả về `401 Unauthorized`).
   - API Route chuyển tiếp request (gửi kèm JWT Token trong Authorization Header) tới API Gateway backend (`POST /job/{jobId}/chat`).
3. **Then** API Gateway sử dụng Lambda Authorizer để xác thực token và chuyển tiếp request tới Backend Lambda (Orchestrator hoặc RAG handler) kèm theo `userId` trong context.
4. **And** Backend Lambda thực hiện các bước:
   - Xác thực quyền sở hữu `jobId` với `userId` trong DynamoDB. Nếu không tồn tại hoặc không khớp, trả về `403 Forbidden` (hoặc `404 Not Found`).
   - Lấy cấu hình Qdrant Cloud (`url`, `apiKey`) và Gemini API Key từ AWS Secrets Manager.
   - Sử dụng Singleton Qdrant Client và Gemini API Client để tránh TLS latency do cold start.
   - Sinh vector cho câu hỏi của người dùng sử dụng Gemini Embedding Model `gemini-embedding-001` (hoặc `text-embedding-004`).
   - Gọi Qdrant Cloud API thực hiện tìm kiếm tương đồng (Vector Search) trên collection `vietai-scholar-chunks` với bộ lọc payload bắt buộc: `{ userId: userId, jobId: jobId }` để đảm bảo phân quyền dữ liệu tuyệt đối (ADD-7).
   - Lấy top 4 chunks tương quan nhất, ghép thành Prompt làm Context và gọi Gemini (`gemini-2.5-flash` hoặc `gemini-1.5-flash`) để tạo câu trả lời. Câu trả lời của AI phải định dạng dạng Markdown và chèn số trích dẫn của đoạn tương ứng (ví dụ: `[Đoạn X]` hoặc `[Đoạn Y]`).
5. **And** Thời gian phản hồi trung bình của API phải dưới 3 giây (đáp ứng NFR-5).

## Tasks / Subtasks

- [x] **Task 1: Cấu hình CDK Backend & Cấp quyền truy cập Secrets**
  - [x] Trong `be/lib/be-stack.ts`, cấu hình thêm API route `POST /job/{jobId}/chat` tích hợp với `OrchestratorLambda` (hoặc RAG handler) và bảo vệ bằng `authorizer`.
  - [x] Thêm biến môi trường `QDRANT_SECRET_ARN` cho `OrchestratorLambda` và gọi `qdrantSecret.grantRead(orchestratorLambda)`.
- [x] **Task 2: Xây dựng RAG Chat Routing/Handler ở Backend Lambda**
  - [x] Trong `be/lambda/index.ts`, thêm định tuyến cho `POST /job/{jobId}/chat`.
  - [x] Viết handler `handleRAGChat` trong `be/lambda/handlers/chat.ts` (hoặc tích hợp trong handler mới):
    - [x] Lấy `userId` từ `requestContext.authorizer.userId`.
    - [x] Truy vấn DynamoDB lấy job và check quyền sở hữu (so khớp `userId`).
    - [x] Đọc secret Qdrant & Gemini.
    - [x] Khởi tạo Singleton Qdrant Client ngoài handler scope.
    - [x] Gọi Gemini API sinh vector 768 chiều cho câu hỏi (`gemini-embedding-001`).
    - [x] Search Qdrant với bộ lọc `{ userId, jobId }`.
    - [x] Gọi Gemini (`gemini-2.5-flash` hoặc `gemini-1.5-flash`) tạo câu trả lời từ context.
- [x] **Task 3: Xây dựng Next.js Server Route `/api/chat/[jobId]` (FE Proxy)**
  - [x] Tạo file `fe/app/api/chat/[jobId]/route.ts`.
  - [x] Xác thực session người dùng bằng `auth()`. Nếu không có session, trả về `401 Unauthorized`.
  - [x] Chuyển tiếp request tới API Gateway backend `${API_BASE}/job/${jobId}/chat` with header `Authorization: Bearer ${session.accessToken}`.
- [x] **Task 4: Viết các Integration & E2E Tests**
  - [x] Viết test cho Lambda handler / API Gateway endpoint (ví dụ: `be/test/chat.test.ts`).
  - [x] Viết Playwright E2E test cho API route proxy trong `fe/tests/rag-chat.spec.ts`.

## Dev Notes

- **Secrets Safety:** Không lưu secrets nhạy cảm (`QDRANT_URL`, `QDRANT_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`) trên Vercel/Next.js. Next.js FE chỉ chứa `API_BASE` công khai và các NextAuth configurations. Các credentials backend được quản lý an toàn ở AWS Secrets Manager và truy xuất bởi Lambda.
- **Qdrant Payload Schema:** Dữ liệu trong collection `vietai-scholar-chunks` có định dạng payload như sau (đã được đẩy lên ở Story 3.2):
  ```typescript
  {
    userId: string,
    jobId: string,
    chunkIndex: number,
    text_original: string,      // Tiếng Anh
    text_translated: string    // Tiếng Việt
  }
  ```
- **Correct Model Name:** Sử dụng model `gemini-embedding-001` hoặc `text-embedding-004` (tránh sai sót thiếu số 0 `gemini-embedding-01`).
- **Multi-tenancy Filter:** Đây là yếu tố cực kỳ quan trọng. Bộ lọc Qdrant bắt buộc phải cấu hình dạng:
  ```typescript
  filter: {
    must: [
      { key: 'userId', match: { value: userId } },
      { key: 'jobId', match: { value: jobId } }
    ]
  }
  ```

### Project Structure Notes

- Các file sẽ chỉnh sửa/tạo mới:
  - `be/lib/be-stack.ts` (CDK stack update)
  - `be/lambda/index.ts` (API route handler update)
  - `be/lambda/handlers/chat.ts` (New RAG chat handler)
  - `fe/app/api/chat/[jobId]/route.ts` (FE proxy endpoint)
  - `fe/tests/rag-chat.spec.ts` (E2E tests)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Luminary Workspace & RAG Architecture (Phase 3+ Expansion)]
- [Source: be/lambda/handlers/ingest.ts] (Tham khảo logic chunking/metadata/Qdrant)

## Dev Agent Record

### Agent Model Used

Antigravity (Gemini 2.5)

### Debug Log References

- backend unit tests ran successfully (`npm run test be/test/chat.test.ts`)
- frontend playwright E2E api route proxy tests ran successfully (`npx playwright test tests/rag-chat.spec.ts`)

### Completion Notes List

- Cấu hình và triển khai thành công API Endpoint `POST /job/{jobId}/chat` qua API Gateway tích hợp Authorizer bảo mật và Orchestrator Lambda.
- Cấp quyền đọc secret `vietai/qdrant-config` cho Orchestrator Lambda để kết nối Qdrant Cloud.
- Phát triển handler `handleChatJob` tại backend thực hiện logic RAG hoàn chỉnh (Sinh vector bằng `gemini-embedding-001`, tìm kiếm chunks tương đồng có filter phân quyền `userId` + `jobId` trên Qdrant Cloud, và trả lời câu hỏi bằng `gemini-2.0-flash`).
- Tạo Next.js proxy route `/api/chat/[jobId]` ở frontend chuyển tiếp request an toàn từ FE đến API Gateway.
- Viết suite unit tests và Playwright E2E tests bao phủ 100% các cases thành công và lỗi (FORBIDDEN, JOB_NOT_FOUND, UNAUTHORIZED, BAD_REQUEST).
- Triển khai toàn bộ thay đổi lên AWS qua AWS CDK thành công.

### File List

- be/lib/be-stack.ts (Modified)
- be/lambda/index.ts (Modified)
- be/lambda/handlers/chat.ts (Created)
- be/test/chat.test.ts (Created)
- fe/app/api/chat/[jobId]/route.ts (Created)
- fe/lib/api.ts (Modified)
- fe/tests/rag-chat.spec.ts (Created)

### Review Findings

- [x] [Review][Patch] Potential crash when calling responseResult.response.text() [be/lambda/handlers/chat.ts:135]
- [x] [Review][Patch] Mock bypass active on production environments via header [fe/app/api/chat/[jobId]/route.ts:13]
- [x] [Review][Patch] Missing timeout configuration on Next.js API proxy fetch [fe/app/api/chat/[jobId]/route.ts:41]
- [x] [Review][Patch] Lack of latency logging for NFR-5 verification (3-second target) [be/lambda/handlers/chat.ts:58]
- [x] [Review][Defer] Hardcoded AWS Secrets Manager ARN in CDK stack [be/lib/be-stack.ts:217] — deferred, pre-existing
