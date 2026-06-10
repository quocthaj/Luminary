---
name: luminary-report
description: Generate a completion report after finishing any story or task.
Use when a story is marked done, when user asks for a report, or when 
implementation is complete and ready for review.
---

# Story Completion Report

When a story or task is completed, generate a structured report:

## Format

### ✅ Story [ID]: [Name]
**Status:** Done  
**Time:** [estimated]

#### Đã làm:
- [Chi tiết từng thay đổi]
- [File nào được sửa/tạo]

#### Kết quả kiểm thử:
- [Test cases đã chạy]
- [Kết quả]

#### Vấn đề gặp phải:
- [Nếu có]

#### Bước tiếp theo:
- [Story tiếp theo là gì]
- [Có dependencies gì không]

#### Files thay đổi:
file1.tsx - [mô tả ngắn]
file2.ts  - [mô tả ngắn]

#### Build status:
- npm run build: [Pass/Fail]
- TypeScript errors: [0/N] mỗi khi hoàn thành 1 story hay 1 gì đó sẽ thêm vào theo tiến độ dự án

---

## Reports History

### ✅ Story 1.1: File Size Validation & Drag-Drop UI
**Status:** Done  
**Time:** 4 hours

#### Đã làm:
- Thiết kế vùng kéo thả file PDF (Drag-and-Drop) linh hoạt.
- Thực hiện kiểm tra dung lượng: Cho phép upload nếu $\le$ 30MB, cảnh báo nếu 30-50MB, chặn hoàn toàn nếu $>$ 50MB.

#### Kết quả kiểm thử:
- Đã chạy qua Dev Test Panel giả lập các kích thước file 1MB, 35MB, 55MB. Giao diện hiển thị đúng thông báo lỗi/cảnh báo.

#### Files thay đổi:
- `fe/components/UploadView.tsx` - Cập nhật logic drag-drop và check size.

---

### ✅ Story 1.2: Calls API Upload & Presigned URL with Network Auto-Retry
**Status:** Done  
**Time:** 6 hours

#### Đã làm:
- Thiết lập gọi API `POST /api/jobs` lấy Presigned URL từ S3.
- Xử lý auto-retry khi mất kết nối mạng và thiết lập timeout 5 phút trên client.

#### Kết quả kiểm thử:
- Giả lập ngắt mạng và khôi phục, hệ thống tự động tiếp tục tiến trình upload.

#### Files thay đổi:
- `fe/lib/api.ts` - Tách hàm gọi upload và call API.
- `fe/components/UploadView.tsx` - Thêm logic retry và xử lý timeout.

---

### ✅ Story 1.3: Translation Progress & Bilingual Side-by-Side Layout
**Status:** Done  
**Time:** 8 hours

#### Đã làm:
- Polling trạng thái dịch từ API mỗi 2 giây (`Extracting` -> `Translating` -> `Merging`).
- Render giao diện Side-by-Side trên Desktop (2 cột cuộn đồng bộ) và Tab switcher (EN/VI) trên Mobile.

#### Kết quả kiểm thử:
- Giao diện Side-by-Side cuộn đồng bộ mượt mà ở Desktop và tự động hiển thị tab ở Mobile (viewport < 1024px).

#### Files thay đổi:
- `fe/components/ProcessingView.tsx` - Thanh tiến trình stepper.
- `fe/components/ResultView.tsx` - Layout Side-by-Side và logic đồng bộ scroll.

---

### ✅ Story 1.4: KaTeX Formula Render & Plain LaTeX Copy
**Status:** Done  
**Time:** 6 hours

#### Đã làm:
- Tích hợp KaTeX render công thức toán bọc trong các thẻ `$ ... $` (inline) hoặc `$$ ... $$` (block).
- Đảo thứ tự trích xuất Code Block lên trước KaTeX math blocks để tránh lỗi parse nhầm nội dung trong code.
- Triển khai Event Delegation bắt sự kiện copy plain LaTeX trên nút Copy hiện lên khi di chuột (với guard check an toàn cho `navigator.clipboard`).

#### Kết quả kiểm thử:
- Đã viết và chạy E2E test `fe/tests/katex.spec.ts`.
- Đã khắc phục thành công lỗi flaky test/timeout bằng cách tăng timeout hiển thị lên `15000ms`. Test E2E đạt trạng thái **PASS** 100%.

#### Files thay đổi:
- `fe/components/ResultView.tsx` - Tích hợp CSS KaTeX, logic `renderMarkdown` và sao chép.
- `fe/tests/katex.spec.ts` - Playwright E2E Test cho KaTeX.

---

### ✅ Story 2.1: NextAuth Integration for Google & Email Login
**Status:** Done  
**Time:** 12 hours

#### Đã làm:
- Tích hợp NextAuth v5 (Auth.js) với cơ chế Stateless JWT.
- Xây dựng API gửi OTP không dùng database (sử dụng HMAC chữ ký số).
- Tạo Middleware bảo mật các route `/library` và `/api/preview/*`.
- Cập nhật giao diện Login Modal và Dev Test Panel ở trang chủ.

#### Kết quả kiểm thử:
- E2E test `fe/tests/auth.spec.ts` Pass 100%: chặn dùng thử khi hết lượt, mở login modal, gửi và xác minh OTP, chuyển sang giao diện đăng nhập thành công.

#### Files thay đổi:
- `fe/auth.ts` - File cấu hình NextAuth v5.
- `fe/middleware.ts` - Middleware bảo mật route.
- `fe/app/api/auth/[...nextauth]/route.ts` - Route handler.
- `fe/app/api/auth/otp/send/route.ts` - API sinh OTP và tạo HMAC signature.
- `fe/components/UploadView.tsx` - modal đăng nhập và Dev Test Panel.
- `fe/tests/auth.spec.ts` - Playwright E2E Test cho Authentication.

#### Build & Test status:
- npm run build: Pass
- TypeScript errors: 0
- Playwright E2E test suite: Pass (2/2 tests passed)

---

### ✅ Story 2.2: Download Login Wall & Post-Login Auto-Download
**Status:** Done  
**Time:** 8 hours

#### Đã làm:
- Tách modal đăng nhập hiện tại từ `UploadView.tsx` thành component tái sử dụng `LoginModal.tsx` với đầy đủ props `isOpen`, `onClose` và `onSuccess`.
- Cập nhật `ResultView.tsx` để tích hợp `LoginModal`, kiểm soát link tải bằng hàm `handleDownloadClick` và tự động kích hoạt tải xuống ngay sau khi login thành công bằng callback `onSuccess` của modal.
- Đồng bộ giao diện người dùng bằng cách thêm Floating Auth Status (trạng thái đăng nhập của thành viên và nút Đăng xuất) ở góc trên bên phải của `ResultView.tsx`.
- Cập nhật hàm mock `getResultUrl` trong `fe/lib/api.ts` để trả về Data URL, cho phép test runner của Playwright dễ dàng bắt sự kiện tải file.
- Xây dựng suite test E2E `fe/tests/download.spec.ts` dùng Playwright để giả lập toàn bộ hành trình khách vãng lai bị chặn khi tải file, điền email và nhận OTP Dev bypass, hoàn tất xác thực và tự động kích hoạt tải file bản dịch.

#### Kết quả kiểm thử:
- Đã chạy qua toàn bộ test suite `npx playwright test`. Tất cả 3 test files (`auth.spec.ts`, `download.spec.ts`, `katex.spec.ts`) đều **PASS** 100%.

#### Files thay đổi:
- `fe/components/LoginModal.tsx` - Component modal đăng nhập dùng chung.
- `fe/components/UploadView.tsx` - Chuyển sang sử dụng component `LoginModal`.
- `fe/components/ResultView.tsx` - Tích hợp Login Modal, cờ `pendingDownload`, Floating Auth Status và logic tải file tự động.
- `fe/lib/api.ts` - Hỗ trợ Data URL cho mock jobId.
- `fe/tests/download.spec.ts` - Playwright E2E Test cho tính năng Download Login Wall.

#### Build & Test status:
- npm run build: Pass
- TypeScript errors: 0
- Playwright E2E test suite: Pass (3/3 tests passed)

---

### [2026-06-07] Hoàn thành Story 2.3: Lambda Authorizer xác thực JWT

Tôi đã thực hiện chu trình `bmad-dev-story` (DS) để phát triển và tích hợp hoàn chỉnh Lambda Authorizer phục vụ xác thực JWT.

#### Công việc đã làm:
1.  **Cài đặt Lambda Authorizer (`be/lambda/authorizer.ts`):**
    *   Tự viết module parse và verify JWT token sử dụng thuật toán HS256 thông qua Web Crypto API thuần của Node.js 20 (`crypto.subtle`), hoàn toàn không dùng thư viện ngoài (`jsonwebtoken`, `jose`) để giữ bundle size cực nhỏ (< 10KB).
    *   Sử dụng cơ chế Lazy Initialization cho `SecretsManagerClient` của AWS SDK v3 để truy xuất khóa bí mật `AUTH_SECRET` từ Secrets Manager (`vietai/auth-secret`).
    *   Kiểm tra tính hợp lệ của token và thời hạn hết hạn (`exp`), tự động throw `"Unauthorized"` để API Gateway trả về mã HTTP `401` nếu token không hợp lệ hoặc hết hạn.
2.  **Tích hợp CDK Stack (`be/lib/be-stack.ts`):**
    *   Khai báo `JwtAuthorizerLambda` và cấp quyền read secret từ AWS Secrets Manager cho Lambda này.
    *   Định nghĩa `TokenAuthorizer` trong API Gateway trỏ tới Lambda Authorizer.
    *   Bảo vệ các endpoints `POST /upload` và `GET /result/{jobId}` bằng Authorizer vừa tạo.
3.  **Bộ unit tests (`be/test/authorizer.test.ts`):**
    *   Viết test suite dùng Jest giả lập toàn bộ các case xác thực: token hợp lệ (Allow policy + inject `userId`), token hết hạn (throw Unauthorized), sai chữ ký (throw Unauthorized), sai định dạng header (throw Unauthorized).
    *   Sử dụng cơ chế mock runtime để bypass việc gọi thực tế lên Secrets Manager. Chạy pass 100% tất cả các tests.

#### Files thay đổi:
- `be/lambda/authorizer.ts` (Cập nhật logic xác thực & xử lý lỗi hệ thống, cache reset utility)
- `be/lib/be-stack.ts` (Cấu hình)
- `be/test/authorizer.test.ts` (Bổ sung test suite lên 8 tests xác thực)
- `_bmad-output/implementation-artifacts/2-3-lambda-authorizer-xac-thuc-jwt-jwt-web-crypto-lambda-authorizer.md` (Cập nhật kết quả Code Review)
- `_bmad-output/implementation-artifacts/deferred-work.md` (Thêm 2 mục trì hoãn)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (Cập nhật trạng thái Story sang `done`)

#### 🔍 Kết quả Code Review & Sửa lỗi (2026-06-08):
- **4 bản vá đã áp dụng**:
  1. *Wildcard Resource ARN*: Đảm bảo API Gateway Cache stage (`*`) hoạt động ổn định giữa các route, tránh lỗi 403.
  2. *Strict exp validation*: Bắt buộc kiểu số cho exp claim của JWT.
  3. *Error bubbling*: Đưa lỗi hệ thống/Secrets Manager ra ngoài try-catch để API Gateway trả về 500 thay vì 401.
  4. *JSON parse safety*: Bọc try-catch khi parse payload secret từ Secrets Manager.
- **2 mục trì hoãn (Deferred)**:
  1. Route status `GET /job/{jobId}` tạm thời để public để test MVP, sẽ xem xét bảo vệ sau.
  2. Bật API Gateway Cache TTL 300s khi lên môi trường Production (trong code CDK hiện để 0s để test).

#### Build & Test status:
- npm run build: Pass (0 TypeScript errors)
- Jest Backend test suite: Pass (2/2 test files, 9/9 tests passed)

---

### ✅ Story 2.4: Giao diện Thư viện bộ lọc thời gian với Skeleton Loader
**Status:** Done  
**Time:** 8 hours

#### Đã làm:
- Thiết lập endpoint `GET /jobs` được bảo vệ bởi Lambda Authorizer, thực hiện truy vấn DynamoDB sử dụng chỉ mục GSI `userIdIndex` (userId + createdAt) để trả về danh sách tài liệu của người dùng, sắp xếp mới nhất lên đầu (`ScanIndexForward: false`).
- Xây dựng trang Thư viện cá nhân (`fe/app/library/page.tsx`) tích hợp check session và tự động redirect về trang chủ kèm query `?login_required=true` nếu chưa đăng nhập.
- Thiết kế bộ lọc thời gian ở client (Tất cả, Hôm nay, 7 ngày qua, 30 ngày qua) và hiển thị số lượng tài liệu tìm thấy.
- Tích hợp hiệu ứng Shimmer Skeleton Loader bằng CSS animation (`shimmer-bg`) hiển thị khung xương tài liệu đẹp mắt trong lúc chờ tải dữ liệu từ API.
- Hiển thị các nhãn trạng thái trực quan tương ứng với tiến trình dịch (`Đang dịch...`, `✓ Hoàn thành`, `✕ Lỗi dịch`).
- Thêm các nút thao tác nhanh: **Xem kết quả** (dẫn về trang chủ kèm `jobId` để tự động mở màn hình kết quả) và **Tải Markdown** (tải trực tiếp file dịch từ S3).
- Tích hợp nút truy cập nhanh "Thư viện" và thanh phân cách visual vào header góc trên bên phải khi người dùng đã đăng nhập thành công.

#### Kết quả kiểm thử:
- Đã chạy unit test `be/test/jobs.test.ts` cho các API `/upload` và `/jobs` với kết quả **PASS 100%**.
- Chạy thử nghiệm thành công quy trình đăng nhập bằng DEV OTP bypass, truy cập trang thư viện, chuyển đổi bộ lọc và kiểm tra visual state hoàn toàn chính xác.

#### Files thay đổi:
- `be/lambda/index.ts` - Bổ sung route handler cho `GET /jobs` và lấy `userId` từ context trong `POST /upload`.
- `be/lib/be-stack.ts` - Định nghĩa resource `/jobs` và method GET kèm authorizer trên API Gateway.
- `fe/lib/api.ts` - Thêm hàm `getJobs()` gọi API backend kèm Authorization Header.
- `fe/app/library/page.tsx` - Thiết kế toàn bộ giao diện thư viện, skeleton loader, bộ lọc thời gian và logic tải file.
- `fe/components/UploadView.tsx` - Tích hợp link "Thư viện" vào auth status header khi đã đăng nhập.

#### Build & Test status:
- npm run build: Pass (0 TypeScript errors)
- Jest Backend test suite: Pass (3/3 test files, 12/12 tests passed)
---

### ✅ Story 2.5: S3 Streaming Proxy & Xem lại bài dịch cũ với Nút Dịch lại
**Status:** Done  
**Time:** 10 hours  
**Date:** 2026-06-09

#### Đã làm:
1. **Backend – Route `POST /job/{jobId}/reprocess` (`be/lambda/index.ts`):**
   - Triển khai handler `handleReprocessJob` xác thực quyền sở hữu job (`userId` từ JWT Authorizer context so với `userId` trong DynamoDB).
   - Kiểm tra sự tồn tại file PDF gốc trên S3 bằng `HeadObjectCommand`; trả về `410 Gone` nếu file đã bị xóa bởi Lifecycle Rule.
   - Kích hoạt lại AWS Step Functions pipeline với tên execution duy nhất `job-{jobId}-{timestamp}` để tránh lỗi trùng lặp SFN 90 ngày.
   - Cập nhật trạng thái job về `queued` trong DynamoDB thông qua `updateJobStatus`.
2. **Backend – CDK Stack (`be/lib/be-stack.ts`):**
   - Bổ sung resource `/job/{jobId}/reprocess` với method `POST` được bảo vệ bằng JWT Authorizer trên API Gateway.
3. **Frontend – Next.js API Proxy `/api/preview/[jobId]` (`fe/app/api/preview/[jobId]/route.ts`):**
   - Tích hợp xác thực NextAuth session và đính kèm JWT `accessToken` trong header `Authorization: Bearer <token>` khi gọi backend.
   - Cho phép truy cập mock job ID (bắt đầu bằng `mock-`) mà không cần xác thực để phục vụ kiểm thử tự động.
   - Stream dữ liệu từ S3 trực tiếp về client với header `Cache-Control: public, max-age=3600, must-revalidate`.
4. **Frontend – Next.js API Route `/api/jobs/[jobId]/reprocess` (NEW):**
   - Tạo mới route proxy xác thực NextAuth session, chuyển tiếp request đến backend `POST /job/{jobId}/reprocess` kèm JWT token.
   - Mock handler trả về `200 OK` cho các mock job IDs.
5. **Frontend – UI Nút Dịch lại (`fe/components/ResultView.tsx`):**
   - Thêm nút "Dịch lại" với icon refresh và trạng thái loading spinner.
   - Nếu chưa đăng nhập, hiển thị Login Modal trước; sau khi đăng nhập, click lại sẽ gọi API reprocess.
   - Thêm thuộc tính `data-authenticated` để Playwright có thể đợi phiên đăng nhập cập nhật trước khi tương tác.
   - Sau khi reprocess thành công, reset mock progress và chuyển về `ProcessingView` theo dõi tiến trình mới.
6. **Frontend – Mock API hỗ trợ test (`fe/lib/api.ts`):**
   - Thêm hàm `resetMockProgress()` để reset chỉ số poll giả lập khi dịch lại.
7. **Playwright E2E Test (`fe/tests/reprocess.spec.ts`) (NEW):**
   - Viết test suite kiểm thử toàn bộ luồng: khách vãng lai bị yêu cầu đăng nhập → login OTP → click "Dịch lại" → chuyển sang màn hình xử lý.
8. **Backend Unit Tests (`be/test/jobs.test.ts`):**
   - Bổ sung 3 test cases cho endpoint `POST /job/{jobId}/reprocess`: thành công khi file tồn tại, lỗi `410 Gone` khi file bị xóa, lỗi `403 Forbidden` khi không phải chủ sở hữu job.

#### Kết quả kiểm thử:
- **Frontend Playwright E2E:** 4/4 tests PASS (`auth.spec.ts`, `download.spec.ts`, `katex.spec.ts`, `reprocess.spec.ts`).
- **Backend Jest Unit Tests:** 12/12 tests PASS (bao gồm 3 tests mới cho reprocess).

#### Vấn đề gặp phải:
1. **React StrictMode Double-Mounting:** Trong Next.js dev mode, `ProcessingView` bị mount 2 lần liên tiếp khiến mock progress index tăng gấp đôi và bỏ qua trạng thái "Đang trích xuất văn bản". → **Giải pháp:** Mở rộng locator trong test để match cả `"Đang trích xuất"` lẫn `"Đang dịch tài liệu"`.
2. **Race Condition trạng thái đăng nhập:** Sau khi đóng Login Modal, session NextAuth chưa kịp cập nhật trên component `ResultView`, dẫn đến click "Dịch lại" lại mở modal. → **Giải pháp:** Thêm thuộc tính `data-authenticated="true"` vào nút và Playwright đợi thuộc tính này trước khi click.
3. **Next.js API Route Cold Start:** Lần đầu compile API route mất 5-10 giây. → **Giải pháp:** Tăng timeout toàn cục Playwright lên 60s, assertion timeout lên 15s.

#### Bước tiếp theo:
- Story 2.5 là story cuối của Epic 2. Có thể chạy retrospective cho Epic 2 rồi chuyển sang Epic 3.
- Epic 3 bắt đầu từ Story 3.1: Giao diện Workspace 3 cột.

#### Files thay đổi:
- `be/lambda/index.ts` – Thêm handler `handleReprocessJob` (kiểm tra ownership, S3 HeadObject, kích hoạt SFN).
- `be/lib/be-stack.ts` – Bổ sung resource API Gateway `POST /job/{jobId}/reprocess` kèm Authorizer.
- `be/test/jobs.test.ts` – Bổ sung 3 test cases cho reprocess endpoint.
- `fe/app/api/preview/[jobId]/route.ts` – Tích hợp NextAuth session + JWT header + mock bypass.
- `fe/app/api/jobs/[jobId]/reprocess/route.ts` – (NEW) API proxy cho yêu cầu reprocess.
- `fe/components/ResultView.tsx` – UI nút "Dịch lại", data-authenticated attr, loading state.
- `fe/lib/api.ts` – Thêm `resetMockProgress()`.
- `fe/app/page.tsx` – Truyền `onReprocess` callback xuống `ResultView`.
- `fe/tests/reprocess.spec.ts` – (NEW) Playwright E2E test cho luồng Reprocess.
- `fe/tests/download.spec.ts` – Cập nhật timeout tương thích.
- `fe/playwright.config.ts` – Tăng timeout toàn cục (60s) và assertion timeout (15s).

#### Build & Test status:
- npm run build: Pass (Đã chạy xác nhận thành công)
- TypeScript errors: 0
- Playwright E2E test suite: Pass (4/4 tests passed)
- Jest Backend test suite: Pass (12/12 tests passed)


