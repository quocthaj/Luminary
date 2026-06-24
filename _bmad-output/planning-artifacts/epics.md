---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - "d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/prd.md"
  - "d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/prds/prd-viet-ai-scholar-2026-06-06/addendum.md"
  - "d:/AI/viet-ai-scholar/_bmad-output/planning-artifacts/architecture.md"
---

# viet-ai-scholar - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for viet-ai-scholar, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

- **FR-1 (Trial Limit):** Visitor session/cookie stores status to limit to 1 free guest translation. If exceeded, blocks upload button, returns HTTP 403 on API, and displays login prompt.
- **FR-2 (Bilingual Side-by-Side Layout):** Parallel columns (English left, Vietnamese right) on desktop. Mobile automatically uses tabs with a tab switcher (EN / VI).
- **FR-3 (LaTeX Rendering & Copy):** Math formulas (marked with `$` or `$$`) render visually using KaTeX. Hovering shows a copy button that copies the clean LaTeX code (without `$` delimiters).
- **FR-4 (NextAuth Integration):** Users login via Google OAuth or Email OTP/Passwordless.
- **FR-5 (Download Login Wall):** Download button triggers login popup for guests. Post-login, the download must start automatically.
- **FR-6 (Library List & Date Filter):** Dashboard grid/list cards showing previous translations, filterable by Day/Week/Month.
- **FR-7 (S3 Cache Loading & Re-process Button):** Opening old job loads Markdown content from S3 in < 1.5s, with a "Re-translate" button to re-trigger AWS Step Functions.
- **FR-8 (File Size Validation & Upload Error Handling):** Drag-drop validation (warn > 30MB, block > 50MB). Auto-retry on network disconnect, 5-minute client-side timeout for presigned upload.
- **FR-9 (Qdrant Chunking & Embedding Ingestion):** Tự động chia nhỏ (chunking) file Markdown dịch song ngữ và sinh vector embedding (Gemini/HuggingFace), sau đó đẩy vào Qdrant Cloud ngay khi dịch xong.
- **FR-10 (RAG Chat API & Sandbox):** API Route `/api/chat/[jobId]` cho phép chat hỏi đáp với tài liệu dựa trên vector tương đồng được truy vấn từ Qdrant (lọc theo `userId` + `jobId` để bảo mật).
- **FR-11 (Workspace UI Layout):** Giao diện Workspace 3 cột trên Desktop (Menu/Library bên trái, Bilingual Reader ở giữa, AI Tutor Panel bên phải). Hỗ trợ collapsible để tối ưu không gian đọc.
- **FR-12 (Semantic Scholar API Integration):** Tích hợp nút "Tìm liên quan" gọi API của Semantic Scholar để tìm các bài báo học thuật liên quan dựa trên tiêu đề hoặc từ khóa của bài nghiên cứu đang đọc.
- **FR-13 (Quiz & Flashcards Generation):** Gọi AI sinh câu hỏi trắc nghiệm (Quiz) và bộ thẻ học tập (Flashcards) theo định dạng JSON cấu trúc từ tài liệu để người dùng tự kiểm tra kiến thức.
- **FR-14 (Mermaid Mindmap Generation):** Gọi AI đọc và phân tích cấu trúc bài viết để xuất ra sơ đồ tư duy định dạng mã nguồn Mermaid.js.
- **FR-15 (Multi-PDF Cross-Paper Synthesis):** Cho phép người dùng chọn nhiều file PDF đã dịch để tạo một báo cáo tổng hợp và chat đối chiếu chéo (cross-reference) giữa các bài báo.
- **FR-16 (Explore Mode Generator):** Cho phép người dùng chọn chủ đề khoa học (AI, Y khoa, Toán học...) để AI Agent tự động tổng hợp và sinh ra các bài viết nghiên cứu kèm hình ảnh trực quan.
- **FR-17 (Scholar Search Agent):** Tích hợp Scholar Search Agent sử dụng Web/Google Scholar Search để tìm kiếm các bài viết liên quan và hiển thị trực tiếp liên kết nguồn.
- **FR-18 (2-Person Audio Overview TTS):** Cho phép tự động sinh kịch bản đối thoại giữa 2 người tóm tắt các tài liệu được chọn và chuyển đổi thành tệp âm thanh (TTS Podcast).

### NonFunctional Requirements

- **NFR-1 (LaTeX Accuracy):** 98% of math formulas render correctly without layout or font breakage.
- **NFR-2 (Conversion Rate):** At least 40% of trial users register to download the translation.
- **NFR-3 (API Latency):** Loading cached translations from S3 must take < 1.5 seconds.
- **NFR-4 (Step Functions Delay):** Re-running the pipeline must not increase average latency by more than 25%.
- **NFR-5 (RAG Response Latency):** Phản hồi từ trợ lý RAG Chat phải được trả về trong vòng dưới 3 giây đối với các câu hỏi thông thường.
- **NFR-6 (Structured Output Accuracy):** Cấu trúc dữ liệu JSON sinh ra cho Quiz và Flashcard phải chính xác 99% để tránh lỗi parse giao diện.
- **NFR-7 (Mindmap Rendering Success):** 98% mã Mermaid.js sinh ra phải hợp lệ để thư viện frontend render sơ đồ tư duy không bị lỗi cú pháp.

### Additional Requirements

- **ADD-1 (camelCase Attributes):** Database schemas and DynamoDB `vietai-jobs` attributes must use camelCase (e.g., `jobId`, `userId`, `createdAt`, `originalName`, `fileSize`, `status`, `outputKey`).
- **ADD-2 (DynamoDB Write Optimization):** Use `UpdateItem` instead of `PutItem` for updating status/updatedAt fields to save WCU.
- **ADD-3 (Standard HTTP Errors):** Return standard HTTP status codes (401, 403, 404) with JSON body `{ error: string }`.
- **ADD-4 (JWT Web Crypto Lambda Authorizer):** Lambda Authorizer decodes JWT token using Node.js 20 native Web Crypto API (HS256) with secret `AUTH_SECRET` to keep bundle size < 10KB.
- **ADD-5 (S3 Streaming Proxy):** Next.js server route `/api/preview/[jobId]` validates session using NextAuth, streams Markdown content from AWS S3 using AWS SDK.
- **ADD-6 (Types Sync Script):** Script `fe/scripts/sync-types.js` copies shared types from `be/lambda/types.ts` to `fe/types/jobs.ts` during prebuild.
- **ADD-7 (Qdrant Multi-tenancy Filter):** Sử dụng chung một collection `vietai-scholar-chunks`, lọc bảo mật bằng điều kiện payload filter chứa `userId` và `jobId` trên mọi request.
- **ADD-8 (Structured JSON Output Mode):** Sử dụng tính năng Structured Outputs của Gemini API để đảm bảo cấu trúc JSON trả về cho Quiz/Flashcards luôn đúng định nghĩa.
- **ADD-9 (Dynamic Mermaid Rendering):** Tích hợp thư viện `@mermaid-js/mermaid` client-side ở frontend để render động mã Mermaid thành đồ họa tương tác.

### UX Design Requirements

- **UX-DR1 (Bilingual Side-by-Side View):** Parallel columns layout on desktop with synchronized scrolling, adapting to mobile via tab switcher.
- **UX-DR2 (KaTeX Formula Render & Copy):** Clean render of block/inline LaTeX formulas with a hover overlay button to copy plain LaTeX.
- **UX-DR3 (Skeleton Shimmer Loader):** Dark mode shimmer skeleton for document lists and loading state.
- **UX-DR4 (Drag-and-Drop Area & Warnings):** Responsive drag-drop file input with size warnings (> 30MB) and auto-retry UI on upload disconnect.
- **UX-DR5 (3-Column Workspace UI):** Bố cục Workspace 3 cột collapsible linh hoạt với tỷ lệ mặc định 15% (Sidebar) - 55% (Reader) - 30% (AI Tutor Panel).
- **UX-DR6 (Interactive Tools Modals):** Hộp thoại hiển thị tương tác: chơi Quiz trắc nghiệm, lật Flashcards học tập, và thu phóng sơ đồ tư duy Mindmap.
- **UX-DR7 (RAG Chat UI):** Khung chat AI Tutor trực quan với bong bóng hội thoại, hiệu ứng đang trả lời (loading bubble) và hiển thị liên kết trích dẫn ngược về đoạn văn bản gốc trong tài liệu.

### FR Coverage Map

- **FR-1 (Trial Limit):** Epic 1 - Dịch thuật & Hiển thị LaTeX Dùng thử
- **FR-2 (Bilingual Side-by-Side Layout):** Epic 1 - Dịch thuật & Hiển thị LaTeX Dùng thử
- **FR-3 (LaTeX Rendering & Copy):** Epic 1 - Dịch thuật & Hiển thị LaTeX Dùng thử
- **FR-4 (NextAuth Integration):** Epic 2 - Xác thực & Thư viện Lưu trữ Cá nhân
- **FR-5 (Download Login Wall):** Epic 2 - Xác thực & Thư viện Lưu trữ Cá nhân
- **FR-6 (Library List & Date Filter):** Epic 2 - Xác thực & Thư viện Lưu trữ Cá nhân
- **FR-7 (S3 Cache Loading & Re-process):** Epic 2 - Xác thực & Thư viện Lưu trữ Cá nhân
- **FR-8 (File Size Validation & Retry):** Epic 1 - Dịch thuật & Hiển thị LaTeX Dùng thử
- **FR-9 (Qdrant Chunking & Embedding Ingestion):** Epic 3 - Không gian làm việc & Luồng RAG Chat
- **FR-10 (RAG Chat API & Sandbox):** Epic 3 - Không gian làm việc & Luồng RAG Chat
- **FR-11 (Workspace UI Layout):** Epic 3 - Không gian làm việc & Luồng RAG Chat
- **FR-12 (Semantic Scholar API Integration):** Epic 3 - Không gian làm việc & Luồng RAG Chat
- **FR-13 (Quiz & Flashcards Generation):** Epic 4 - Bộ Công cụ Học tập Thông minh
- **FR-14 (Mermaid Mindmap Generation):** Epic 4 - Bộ Công cụ Học tập Thông minh
- **FR-15 (Multi-PDF Cross-Paper Synthesis):** Epic 5 - Tổng hợp Đa Tài liệu & Chế độ Khám phá
- **FR-16 (Explore Mode Generator):** Epic 5 - Tổng hợp Đa Tài liệu & Chế độ Khám phá
- **FR-17 (Scholar Search Agent):** Epic 5 - Tổng hợp Đa Tài liệu & Chế độ Khám phá
- **FR-18 (2-Person Audio Overview TTS):** Epic 5 - Tổng hợp Đa Tài liệu & Chế độ Khám phá

## Epic List

### Epic 1: Dịch thuật & Hiển thị LaTeX Dùng thử (Core Translation & LaTeX Rendering)
*   **Epic Goal:** Khách vãng lai và người dùng có thể upload tài liệu PDF dưới 50MB, theo dõi tiến trình và đọc bản dịch song ngữ hai cột English - Tiếng Việt cuộn đồng bộ, các công thức toán học KaTeX được hiển thị đẹp mắt và sao chép dễ dàng. Giới hạn tối đa 1 lượt dịch thử đối với khách vãng lai.
*   **FRs covered:** FR-1, FR-2, FR-3, FR-8

### Epic 2: Xác thực & Thư viện Lưu trữ Cá nhân (User Authentication & Personal Library)
*   **Epic Goal:** Người dùng đăng nhập qua NextAuth Google/Email, mở khóa tính năng tải file và truy cập Dashboard thư viện cá nhân để lưu trữ, đọc lại tài liệu cũ từ S3 cache trong dưới 1.5 giây, có bộ lọc thời gian và nút dịch lại thủ công.
*   **FRs covered:** FR-4, FR-5, FR-6, FR-7

### Epic 3: Không gian làm việc & Luồng RAG Chat (Interactive Workspace & RAG)
*   **Epic Goal:** Người dùng đọc tài liệu trên giao diện Workspace 3 cột collapsible trực quan, sử dụng khung chat RAG hỏi đáp chuyên sâu với bài viết (dựa trên Qdrant DB được bảo mật phân quyền) và tìm kiếm các tài liệu nghiên cứu liên quan thông qua nút tích hợp Semantic Scholar.
*   **FRs covered:** FR-9, FR-10, FR-11, FR-12

### Epic 4: Bộ Công cụ Học tập Thông minh (Learning Tools: Quiz, Flashcard, Mind Map)
*   **Epic Goal:** Người dùng kích hoạt các công cụ học tập thông minh trực tiếp từ Workspace để chơi các trò chơi trắc nghiệm (Quiz), học thẻ lật ghi nhớ (Flashcards) và tương tác với sơ đồ tư duy (Mindmap) do AI sinh tự động từ nội dung bài báo.
*   **FRs covered:** FR-13, FR-14

### Epic 5: Tổng hợp Đa Tài liệu & Chế độ Khám phá (Multi-PDF Synthesis & Explore Mode)
*   **Epic Goal:** Người dùng thực hiện nghiên cứu chuyên sâu bằng cách đối chiếu chéo (cross-reference) và tổng hợp từ 1 đến 10 bài báo khoa học cùng lúc (sử dụng tóm tắt thông tin), tìm kiếm bài báo liên quan thông qua AI Search Agent (chỉ hiển thị liên kết), hoặc tạo file đối thoại âm thanh (TTS Podcast) tóm tắt các tài liệu được chọn, song song với việc cho phép AI Agent tự sinh các bài nghiên cứu theo chủ đề tùy chọn.
*   **FRs covered:** FR-15, FR-16, FR-17, FR-18

---

## Epic 1: Dịch thuật & Hiển thị LaTeX Dùng thử (Core Translation & LaTeX Rendering)

### Story 1.1: Trình tải lên tài liệu & Xác thực kích thước file (File Upload Drag-Drop UI & Size Validation)
As a khách vãng lai hoặc người dùng đã đăng nhập,
I want giao diện kéo thả file PDF học thuật và tự động kiểm tra kích thước file,
So that tôi biết file của mình có hợp lệ để dịch hay không trước khi gửi lên máy chủ.

**Acceptance Criteria:**
- **Given** Người dùng đang ở trang chủ,
- **When** Kéo thả file PDF bất kỳ vào vùng drag-drop,
- **Then** Hệ thống phải kiểm tra dung lượng file:
  - Nếu **dung lượng ≤ 30MB**, cho phép chuẩn bị upload.
  - Nếu **30MB < dung lượng ≤ 50MB**, hiển thị cảnh báo: *"Tài liệu của bạn vượt quá 30MB, thời gian xử lý sẽ lâu hơn bình thường..."* nhưng vẫn cho phép upload.
  - Nếu **dung lượng > 50MB**, chặn upload ngay lập tức và hiển thị thông báo lỗi màu đỏ: *"Kích thước file tối đa được hỗ trợ là 50MB."*
- **And** Nếu cookie/session của khách ghi nhận đã hết lượt dịch thử (từ FR-1), nút upload bị khóa hoàn toàn và hiển thị thông báo yêu cầu đăng nhập.

### Story 1.2: Gọi API Upload & Presigned URL với Xử lý lỗi kết nối (Presigned Upload & Network Error Auto-Retry)
As a khách vãng lai hoặc người dùng đã đăng nhập,
I want hệ thống tự động xin Presigned URL từ backend, tải trực tiếp file PDF lên S3 và tự động thử lại khi mất mạng,
So that quá trình tải lên không bị gián đoạn và an toàn.

**Acceptance Criteria:**
- **Given** File PDF đã qua bước kiểm tra dung lượng ở Story 1.1,
- **When** Bắt đầu upload, client gọi API `POST /api/jobs` để xin S3 Presigned URL:
  - Nếu khách vãng lai đã dùng hết 1 lượt dịch thử, API trả về `403 Forbidden` kèm JSON `{ error: "Trial limit exceeded" }`, client hiển thị popup đăng nhập.
  - Nếu thành công, client thực hiện upload file binary trực tiếp lên S3 Uploads Bucket qua Presigned URL.
- **Then** Nếu bị mất kết nối mạng giữa chừng, quá trình upload tạm dừng, hệ thống hiển thị thông báo: *"Kết nối mạng bị gián đoạn. Vui lòng thử lại"* kèm nút "Thử lại" để tiếp tục tải lên từ byte bị gián đoạn (hoặc tải lại từ đầu) mà không cần tải lại toàn bộ trang web.
- **And** Thiết lập timeout tối đa 5 phút cho client. Nếu vượt quá, client hủy yêu cầu và báo lỗi timeout.

### Story 1.3: Theo dõi Tiến trình & Giao diện Song ngữ Side-by-Side (Translation Progress & Bilingual Side-by-Side Layout)
As a người dùng,
I want theo dõi tiến trình dịch thời gian thực và đọc bản dịch song ngữ hai cột English - Tiếng Việt cuộn đồng bộ,
So that tôi có thể dễ dàng đối chiếu bản gốc và bản dịch của bài báo.

**Acceptance Criteria:**
- **Given** File PDF đã được upload thành công lên S3,
- **When** Client bắt đầu gửi API polling liên tục (`GET /api/jobs/{jobId}`) mỗi 2 giây,
- **Then** Màn hình hiển thị thanh tiến trình trực quan chuyển đổi qua 3 trạng thái: `Extracting` (Trích xuất) -> `Translating` (Đang dịch) -> `Merging` (Đang gộp).
- **And** Khi trạng thái chuyển thành `Completed`, màn hình tự động hiển thị giao diện song ngữ Side-by-Side:
  - Trên Desktop: 2 cột song song (English bên trái, Tiếng Việt bên phải) có tính năng cuộn đồng bộ (sync scroll).
  - Trên Mobile: Hiển thị 2 Tab switcher (Tab EN / Tab VI) để người dùng chuyển đổi qua lại thuận tiện.

### Story 1.4: Tích hợp KaTeX để Render công thức toán và Sao chép LaTeX (KaTeX Formula Render & Plain LaTeX Copy)
As a học giả nghiên cứu toán/khoa học,
I want các công thức toán học hiển thị chuẩn xác trực quan và dễ dàng sao chép mã nguồn LaTeX thô,
So that tôi có thể dán trực tiếp công thức vào báo cáo cá nhân mà không phải gõ lại.

**Acceptance Criteria:**
- **Given** Bản dịch song ngữ đã hiển thị trên màn hình ở Story 1.3,
- **When** Có các tag công thức toán dạng `$ ... $` (inline) hoặc `$$ ... $$` (block) trong văn bản dịch,
- **Then** Hệ thống tự động chuyển đổi và render thành công thức toán đẹp mắt bằng thư viện KaTeX (đảm bảo độ chính xác hiển thị 98%, không bị vỡ font hay layout shift).
- **And** Khi di chuột (hover) vào một công thức toán học bất kỳ, hiển thị một icon Copy nổi lên. Nhấp vào icon này sẽ copy mã nguồn LaTeX thô (ví dụ: `f(x) = \sigma(W^T x + b)`) trực tiếp vào clipboard của máy tính (loại bỏ hoàn toàn ký tự bọc ngoài như `$`).


## Epic 2: Xác thực & Thư viện Lưu trữ Cá nhân (User Authentication & Personal Library)

### Story 2.1: Tích hợp NextAuth Đăng nhập Google & Email (NextAuth Integration for Google & Email Login)
As a khách vãng lai,
I want đăng nhập nhanh bằng tài khoản Google hoặc nhận mã OTP qua Email,
So that tôi có tài khoản cá nhân để lưu bài dịch và mở khóa tính năng tải file.

**Acceptance Criteria:**
- **Given** Khách vãng lai bấm vào nút "Đăng nhập" ở góc màn hình,
- **When** Popup hoặc trang đăng nhập hiển thị,
- **Then** Người dùng có thể chọn:
  - Đăng nhập bằng Google (Google OAuth Provider).
  - Đăng nhập bằng Email OTP (Passwordless OTP Provider).
- **And** Sau khi đăng nhập thành công, NextAuth thiết lập cookie session mã hóa stateless JWT (sử dụng HS256 với khóa bí mật `AUTH_SECRET`), và lưu thông tin người dùng vào trạng thái của client.

### Story 2.2: Tường đăng nhập nút Download & Tự động tải sau khi đăng nhập (Download Login Wall & Post-Login Auto-Download)
As a khách vãng lai đã dịch xong tài liệu thử nghiệm,
I want hệ thống yêu cầu đăng nhập khi tải bản dịch và tự động tải về sau khi đăng nhập xong,
So that tôi không phải thực hiện lại thao tác tải xuống một lần nữa.

**Acceptance Criteria:**
- **Given** Khách vãng lai đã hoàn thành bài dịch thử ở Epic 1 và đang đọc kết quả,
- **When** Khách bấm nút "Tải xuống" (Download) bản dịch dạng Markdown/PDF,
- **Then** Hệ thống chặn tải và hiển thị popup yêu cầu đăng nhập.
- **And** Ngay sau khi khách đăng nhập thành công từ popup này, hệ thống phải tự động thực hiện lệnh tải file bản dịch về máy tính của người dùng ngay lập tức mà không yêu cầu bấm lại nút Download.

### Story 2.3: Lambda Authorizer xác thực JWT (JWT Web Crypto Lambda Authorizer)
As a quản trị viên hệ thống,
I want API Gateway sử dụng Lambda Authorizer để xác thực token JWT gửi từ Frontend,
So that bảo vệ an toàn cho các API của người dùng (như gửi/lấy danh sách bài dịch).

**Acceptance Criteria:**
- **Given** Client gửi request kèm token JWT trong header `Authorization: Bearer <token>`,
- **When** API Gateway nhận request trên các API được bảo vệ (`POST /api/jobs`, `GET /api/jobs`),
- **Then** Lambda Authorizer (`authorizer.ts`) giải mã token sử dụng Web Crypto API thuần của Node.js 20 (thuật toán HS256, so khớp khóa bí mật `AUTH_SECRET` từ AWS Secrets Manager):
  - Nếu token hợp lệ, cho phép request đi tiếp và inject `userId` vào request context.
  - Nếu token không hợp lệ hoặc hết hạn, trả về HTTP status `401 Unauthorized`.
- **And** Dung lượng bundle của Lambda Authorizer phải nhỏ hơn 10KB (không sử dụng thư viện ngoài).

### Story 2.4: Giao diện Thư viện & Bộ lọc thời gian với Skeleton Loader (Personal Library Dashboard & Shimmer Skeleton)
As a người dùng đã đăng nhập,
I want xem danh sách các bài báo đã dịch có bộ lọc thời gian và hiệu ứng tải trang mượt mà,
So that tôi có thể quản lý và tìm kiếm lịch sử dịch thuật dễ dàng.

**Acceptance Criteria:**
- **Given** Người dùng đã đăng nhập truy cập vào Dashboard Thư viện cá nhân (`/library`),
- **When** Trang đang tải dữ liệu lịch sử từ cơ sở dữ liệu DynamoDB (truy vấn theo chỉ mục phụ GSI `userIdIndex` lọc qua `userId`),
- **Then** Giao diện hiển thị các khung xương xám Shimmer Skeleton (Skeleton shimmer loader) theo tông màu tối để làm giảm cảm giác chờ đợi của người dùng.
- **And** Khi tải xong, hiển thị danh sách bài báo dưới dạng Grid/List card, cho phép người dùng chọn bộ lọc thời gian: lọc các bài dịch trong **Ngày hôm nay**, **Tuần này**, hoặc **Tháng này**.

### Story 2.5: S3 Streaming Proxy & Xem lại bài dịch cũ với Nút dịch lại (S3 Streaming Proxy, S3 Cache Loading & Re-process)
As a người dùng đã đăng nhập,
I want mở lại bài viết cũ siêu tốc và có thể yêu cầu dịch lại bài báo khi cần thiết,
So that tôi không bị mất thời gian chờ đợi dịch lại từ đầu và có thể cập nhật bản dịch khi AI nâng cấp.

**Acceptance Criteria:**
- **Given** Người dùng click vào một bài báo cũ trong thư viện,
- **When** Client gọi API Next.js Server Route `/api/preview/[jobId]`,
- **Then** Server Route kiểm tra NextAuth session (trả về 401 nếu chưa đăng nhập), gọi AWS SDK lấy file Markdown dịch từ S3 và stream trực tiếp dữ liệu (Response Stream) về trình duyệt nhằm tránh quá tải bộ nhớ đệm RAM ở serverless (thời gian hoàn thành < 1.5 giây).
- **And** API tự động đính kèm static Cache-Control headers để tối ưu hóa truy xuất lần sau.
- **And** Giao diện đọc kết quả hiển thị nút "Dịch lại" (Re-translate). Khi click nút này, hệ thống sẽ kích hoạt lại AWS Step Functions pipeline để chạy dịch lại từ đầu và cập nhật DynamoDB.


## Epic 3: Không gian làm việc & Luồng RAG Chat (Interactive Workspace & RAG)

### Story 3.1: Giao diện Workspace 3 cột (3-Column Workspace UI Layout & Sidebar)
As a người dùng đã đăng nhập,
I want giao diện Workspace được chia thành 3 cột linh hoạt với khả năng thu gọn (collapsible),
So that tôi có thể tối ưu không gian đọc bài báo song ngữ hoặc tương tác với trợ lý học thuật.

**Acceptance Criteria:**
- **Given** Người dùng đã mở một bài dịch để đọc,
- **When** Giao diện chính hiển thị,
- **Then** Bố cục màn hình Desktop phải hiển thị 3 phần:
  - Cột trái (15%): Danh sách thư viện và danh sách công cụ (Quiz, Flashcard, Mindmap).
  - Cột giữa (55%): Giao diện đọc bản dịch song song (Bilingual Reader).
  - Cột phải (30%): Khung chat AI Tutor và Semantic Scholar panel.
- **And** Người dùng có thể bấm các nút đóng/mở ở biên các cột để thu gọn Cột trái hoặc Cột phải thành dạng thanh trượt hẹp, giúp cột giữa tự động kéo rộng chiếm toàn bộ màn hình đọc sử dụng smooth CSS transitions (`transition-all duration-300`).
- **And** Trên màn hình máy tính bảng và mobile (viewport < 1024px), hệ thống tự động thu gọn các sidebar trái/phải để ưu tiên tối đa cho cột đọc song ngữ ở giữa.

### Story 3.2: Tách đoạn & Embedding lưu trữ Qdrant Cloud (Paragraph Ingestion & Qdrant Upsert Lambda)
As a quản trị viên hệ thống,
I want một Lambda Function tự động chạy sau khi dịch để chia nhỏ văn bản và đẩy vector embedding lên Qdrant Cloud,
So that dữ liệu được lập chỉ mục sẵn sàng cho việc chat hỏi đáp.

**Acceptance Criteria:**
- **Given** AWS Step Functions chạy đến bước hoàn thành gộp file Markdown,
- **When** Step Functions kích hoạt Lambda `embed.ts` (hoặc update Merge Lambda):
  - Hệ thống chia nhỏ tài liệu Markdown thành các block/chunk (độ dài 500-1000 ký tự, ngắt theo ranh giới đoạn văn hoặc thẻ toán).
  - Mỗi đoạn văn bản được chèn mã định danh anchor ẩn ở đầu dưới dạng `{#chunk-X}` (trong đó X là chunkIndex) để đồng bộ định vị DOM.
  - Gọi Gemini API (`text-embedding-004`) để sinh vector 768 chiều cho mỗi chunk.
- **Then** Lưu danh sách vector vào Qdrant Cloud với payload chứa: `userId`, `jobId`, `text_original`, `text_translated` và `chunkIndex`.
- **And** Lọc phân quyền dữ liệu bằng payload metadata, đảm bảo dữ liệu thuộc về đúng `userId` và `jobId` (ADD-7).

### Story 3.3: API RAG Chat an toàn (Secure RAG Chat API & Namespace Filter)
As a người dùng đã đăng nhập,
I want một API Route xử lý tìm kiếm vector tương đồng bảo mật và gọi LLM trả lời câu hỏi,
So that tôi nhận được câu trả lời chính xác dựa trên nội dung bài báo hiện tại mà không lo lộ dữ liệu.

**Acceptance Criteria:**
- **Given** Người dùng gửi câu hỏi từ Workspace,
- **When** Client gọi API Route `POST /api/chat/[jobId]`:
  - API Route kiểm tra NextAuth session (nếu chưa đăng nhập, trả về `401 Unauthorized`).
  - Sử dụng instance Qdrant Client dạng Singleton khởi tạo ở global scope để duy trì HTTP Keep-Alive, triệt tiêu độ trễ TLS handshake do Cold Starts.
  - Xác thực quyền sở hữu `jobId` với `userId` trong DynamoDB.
  - Sinh vector cho câu hỏi của người dùng và gọi Qdrant Cloud API thực hiện tìm kiếm tương đồng (Vector Search) với bộ lọc payload bắt buộc: `userId` và `jobId` (ADD-7).
- **Then** Lấy top 4 chunks tương quan nhất (giới hạn < 3000 tokens context), ghép vào Prompt mẫu làm Context, gửi đến Gemini Pro/Flash để trả về câu trả lời.
- **And** Thời gian phản hồi trung bình của API phải dưới 3 giây (đáp ứng NFR-5).

### Story 3.4: Giao diện AI Tutor Chat (AI Tutor Chat Panel UI & Source Citations)
As a người dùng đã đăng nhập,
I want khung chat AI Tutor hiển thị trực quan các tin nhắn và có thể nhảy đến phần nguồn trích dẫn tương ứng,
So that tôi kiểm chứng được câu trả lời của AI một cách chính xác.

**Acceptance Criteria:**
- **Given** Người dùng đang ở Workspace và hiển thị AI Tutor Chat Panel (Cột phải),
- **When** Người dùng gửi câu hỏi và nhận câu trả lời:
  - Khung chat hiển thị bong bóng tin nhắn (User bên phải màu vàng nhạt, AI bên trái màu xám nhạt).
  - Hiển thị hiệu ứng chờ phản hồi (typing indicator) khi AI đang suy nghĩ.
- **Then** Cuối câu trả lời của AI phải hiển thị các thẻ trích dẫn nguồn (ví dụ: `[Đoạn 12]`, `[Đoạn 15]` tương ứng với chunkIndex).
- **And** Trình biên dịch Markdown ở Cột giữa (Bilingual Reader) tự động phân tích anchor ID `{#chunk-X}` thành thẻ HTML ID `<div id="chunk-X">`.
- **And** Khi người dùng click vào thẻ trích dẫn ở khung chat, Cột giữa tự động cuộn (`scroll-into-view` mượt mà) đến đúng thẻ div có ID tương ứng và kích hoạt hiệu ứng highlight màu vàng nhạt viền ngoài trong 3 giây.

### Story 3.5: Tích hợp API Semantic Scholar (Semantic Scholar Integration & Related Papers Panel)
As a nhà nghiên cứu khoa học,
I want tìm kiếm nhanh các bài báo liên quan đến bài đang đọc chỉ với 1 click,
So that tôi có thể dễ dàng mở rộng mạng lưới tài liệu nghiên cứu.

**Acceptance Criteria:**
- **Given** Người dùng bấm vào nút "Tìm liên quan" (Find related) ở góc Panel AI Tutor,
- **When** Client gọi API Next.js Route `/api/semantic-scholar?jobId=...`,
- **Then** API Route lấy metadata tiêu đề bài báo hiện tại từ DynamoDB, gửi truy vấn tìm kiếm đến Semantic Scholar API (`https://api.semanticscholar.org/graph/v1/paper/search`).
- **And** Trả về danh sách top 5 bài viết liên quan (chứa: Tiêu đề, Tác giả, Năm xuất bản, Tóm tắt sơ bộ, và Link PDF nếu có) hiển thị đẹp mắt dưới dạng các thẻ nhỏ bên cột phải để người dùng click mở đọc trực tiếp.

### Story 3.6: Hệ thống Chat Agentic RAG Tự động Định tuyến và Truy vấn (Active Agentic RAG & Dynamic Tool Routing)
As a nhà nghiên cứu khoa học đọc tài liệu song ngữ,
I want trợ lý AI tự động phân tích câu hỏi để lựa chọn phương pháp truy vấn thông tin phù hợp (tìm kiếm vector cục bộ hoặc đọc tài liệu toàn cục) và tự động kéo thêm ngữ cảnh liền kề khi phát hiện thông tin bị cắt đứt,
So that tôi nhận được câu trả lời chính xác, toàn diện, không bị mất ngữ nghĩa hay bỏ sót dữ liệu do giới hạn chia nhỏ đoạn văn (chunking).

**Acceptance Criteria:**
- **Given** Người dùng gửi câu hỏi trong AI Tutor Chat Panel,
- **When** API Route `/api/chat/[jobId]` tiếp nhận câu hỏi của người dùng,
- **Then** Hệ thống khởi tạo mô hình Gemini 2.0 Flash kèm theo danh sách các Tools được định nghĩa dưới dạng JSON Schema.
- **And** Agent thực hiện phân tích ý định câu hỏi để kích hoạt một hoặc nhiều Tool sau (Reasoning Loop):
  - `vectorSearch(query)`: Thực hiện tìm kiếm vector tương đồng trên Qdrant Cloud để lấy top 4 đoạn có liên quan (dành cho câu hỏi chi tiết, cục bộ).
  - `fetchAdjacentParagraphs(chunkIndex, direction, count)`: Lấy thêm `count` đoạn văn liền trước hoặc liền sau của `chunkIndex` hiện tại từ S3/DynamoDB để bù đắp ngữ cảnh bị đứt gãy.
  - `readExecutiveSummary()`: Trích xuất bản tóm tắt toàn bộ tài liệu (Executive Summary) đã được sinh sẵn dưới dạng cấu trúc JSON trong DynamoDB (dành cho câu hỏi tổng quan, toàn cục).
- **And** Bản tóm tắt (Executive Summary) tự động sinh ra trong pha Ingestion bằng Gemini Structured Outputs với cấu trúc: `tldr` (tóm tắt 1 câu), `keyContributions` (mảng đóng góp), `methodology` (phương pháp), `limitations` (hạn chế).
- **And** Agent tự động tổng hợp thông tin thu thập được từ các Tool, kiểm chứng tính hợp lý của ngữ cảnh trước khi đưa ra câu trả lời cuối cùng.
- **Then** Câu trả lời hiển thị trên UI sử dụng Markdown chuẩn và đính kèm liên kết trích dẫn ngược `[Đoạn X]`.


## Epic 4: Bộ Công cụ Học tập Thông minh (Learning Tools: Quiz, Flashcard, Mind Map)

### Story 4.1: Tự động sinh và làm bài Trắc nghiệm (AI Quiz Generator & Play Modal)
As a sinh viên ôn tập kiến thức,
I want AI tự động tạo bài trắc nghiệm từ nội dung bài viết và chơi trực tiếp trên giao diện,
So that tôi kiểm tra được mức độ hiểu bài của mình.

**Acceptance Criteria:**
- **Given** Người dùng bấm vào công cụ "Quiz" ở cột trái Workspace,
- **When** Client kiểm tra và gọi API `/api/tools/[jobId]/quiz`:
  - Nếu chưa có quiz lưu trong cache S3, Next.js Server gọi Gemini API bằng **Structured Output Mode** (ADD-8) với JSON schema định sẵn (gồm 5 câu hỏi, mỗi câu có 4 phương án lựa chọn và vị trí đáp án đúng).
  - Sử dụng prompt hệ thống có tính ràng buộc cao: ép buộc AI tập trung 100% vào thuật toán, công thức toán cốt lõi, phương pháp thực nghiệm và kết luận chính của nghiên cứu (loại bỏ từ vựng bề nổi).
  - Server lưu kết quả JSON vào S3 kết quả của bài viết và trả về cho Client (NFR-6).
- **Then** Màn hình hiển thị Hộp thoại (Modal) trắc nghiệm tương tác: người dùng chọn đáp án cho từng câu hỏi, bấm "Nộp bài", hệ thống tính điểm và hiển thị đáp án đúng/sai kèm giải thích trực quan.

### Story 4.2: Tự động sinh và học Thẻ ghi nhớ (AI Flashcard Generator & Swiper UI)
As a học viên cần nhớ định nghĩa thuật ngữ khoa học,
I want hệ thống tự động trích xuất các thuật ngữ khó thành thẻ Flashcard lật 2 mặt,
So that tôi học và ôn tập từ vựng dễ dàng.

**Acceptance Criteria:**
- **Given** Người dùng bấm vào công cụ "Flashcard" ở cột trái Workspace,
- **When** Client gọi API `/api/tools/[jobId]/flashcard`, Server sử dụng Structured Output sinh ra danh sách 8-10 thuật ngữ chuyên ngành dưới dạng JSON chứa `term` (thuật ngữ) và `definition` (định nghĩa song ngữ), sau đó trả về cho client.
  - Sử dụng prompt hệ thống ép buộc AI chỉ trích xuất các khái niệm nghiên cứu và thuật ngữ khoa học cốt lõi phục vụ việc hiểu sâu nghiên cứu.
- **Then** Hiển thị giao diện bộ thẻ lật trực quan:
  - Mặt trước hiển thị thuật ngữ tiếng Anh gốc + cách phát âm/dịch nghĩa.
  - Khi nhấp vào thẻ, thẻ chạy hiệu ứng lật 3D (3D flip animation) để hiển thị định nghĩa chi tiết ở mặt sau.
- **And** Người dùng có thể bấm nút "Tiếp theo" / "Quay lại" hoặc vuốt (swipe) để chuyển thẻ mượt mà.

### Story 4.3: Tự động vẽ Sơ đồ Tư duy bằng Mermaid.js (Mermaid Mindmap Generator & Interactive SVG Viewer)
As a người dùng thích học qua hình ảnh (Visual Learner),
I want xem sơ đồ cấu trúc các khái niệm trong bài viết dưới dạng sơ đồ tư duy tương tác,
So that tôi nhanh chóng nắm bắt được mạch liên kết logic của bài viết.

**Acceptance Criteria:**
- **Given** Người dùng bấm vào công cụ "Sơ đồ tư duy" (Mindmap) ở cột trái,
- **When** Client gọi API `/api/tools/[jobId]/mindmap`, Server gửi Markdown vào Gemini yêu cầu xuất ra mã cấu trúc sơ đồ tư duy dạng Mermaid.js định dạng chuẩn (ví dụ: `mindmap\n  root((Chủ đề))...`).
  - Hướng dẫn Gemini chỉ sử dụng cú pháp `mindmap` cơ bản nhất, tuyệt đối không chèn thẻ HTML, ngoặc nhọn sai lệch hay CSS style nội dòng để tránh lỗi parse.
- **Then** Frontend nhận mã Mermaid.js, sử dụng thư viện `@mermaid-js/mermaid` để biên dịch trực tiếp thành đồ họa SVG tương tác trên màn hình (ADD-9).
- **And** Hộp thoại hiển thị Mindmap hỗ trợ các thao tác kéo rê chuột (pan) và cuộn chuột để thu phóng (zoom) sơ đồ tư duy dễ dàng mà không bị vỡ độ nét (render SVG).
- **And** Tích hợp Error Boundary ở frontend: Nếu render SVG bị lỗi cú pháp, tự động gọi API sinh lại mã tối giản 1 lần. Nếu tiếp tục thất bại, hiển thị sơ đồ dạng cây text (nested list) thụt dòng có khả năng copy mã nguồn, thay vì làm crash toàn bộ giao diện.


## Epic 5: Tổng hợp Đa Tài liệu & Chế độ Khám phá (Multi-PDF Synthesis & Explore Mode)

### Story 5.1: Đối chiếu & Tổng hợp chéo nhiều tài liệu (Cross-Paper Multi-PDF Synthesis & Chat)
As a nhà nghiên cứu khoa học viết Literature Review,
I want chọn từ 1 đến 10 tài liệu đã dịch để tạo báo cáo so sánh và chat chéo giữa chúng,
So that tôi tìm ra điểm tương đồng và khác biệt giữa các công trình nghiên cứu mà không bị giới hạn số lượng.

**Acceptance Criteria:**
- **Given** Người dùng đang ở trang Thư viện cá nhân (`/library`),
- **When** Người dùng tích chọn từ 2 đến 10 bài báo và bấm nút "Tổng hợp liên bài viết" (Synthesize Papers),
- **Then** Giao diện chính của Synthesis Mode mở ra với khung hiển thị trung tâm mở rộng (`max-w-6xl` hoặc tương đương) để hiển thị bảng so sánh đối chiếu song ngữ dễ nhìn, không bị gò bó.
- **And** Hai bên panel (Tập tài liệu bên trái và AI Tutor Chat bên phải) hoạt động dưới dạng panel thu phóng linh hoạt, có các nút Toggle Header độc lập ("Tài liệu", "Chat AI") và nút "Tập trung" (Focus Mode) để ẩn/hiện đồng thời cả 2 panel mượt mà (`w-0` khi ẩn).
- **And** Hệ thống gửi yêu cầu lên Backend. Backend truy xuất các bản tóm tắt thông tin (Executive Summaries) của các bài báo đã chọn, sử dụng Gemini 1.5 Pro để sinh ra một báo cáo tổng hợp (Synthesis Report) so sánh phương pháp nghiên cứu, kết quả và hạn chế của từng bài dưới dạng bảng đối chiếu song ngữ.
- **And** Workspace mở ra một giao diện chat đặc biệt, cho phép truy vấn RAG đồng thời trên phạm vi của tất cả các `jobId` đã chọn (sử dụng filter `jobId` dạng list `in` trên Qdrant Cloud), hiển thị rõ câu trả lời kèm theo trích dẫn nguồn lấy từ bài viết nào (ví dụ: `[Tên bài báo - Đoạn X]`).

### Story 5.2: Chế độ Khám phá - AI Agent Tự sinh nội dung học thuật theo chủ đề (Explore Mode Topic-Based Generation)
As a học giả muốn tìm hiểu một lĩnh vực mới,
I want chọn một chủ đề học thuật và nhận được một bài giảng khoa học trực quan sinh động do AI Agent tự tổng hợp,
So that tôi có thể bắt đầu nghiên cứu một chủ đề mới mà không cần tìm tài liệu thô.

**Acceptance Criteria:**
- **Given** Người dùng chuyển sang tab "Khám phá" (Explore Mode) từ thanh điều hướng,
- **When** Người dùng chọn một chủ đề (Ví dụ: "Học sâu trong Y khoa", "Hình học phi Euclid"...) hoặc nhập từ khóa chủ đề tự do,
- **Then** AI Agent chuyên trách sẽ tự động tìm kiếm thông tin khoa học uy tín, biên soạn thành một bài viết cấu trúc phân cấp rõ ràng (gồm lý thuyết, công thức toán LaTeX, ví dụ thực tế và các sơ đồ minh họa bằng Mermaid).
- **And** Hệ thống prompt của AI bắt buộc yêu cầu sinh ra **sơ đồ trực quan chi tiết (tối thiểu 8 - 12 nodes)** mô tả quy trình kỹ thuật, sử dụng các hình khối đa dạng (hình hộp, hình thoi, hình trụ...) và áp dụng các thuộc tính style (ví dụ: tô màu nổi bật cho các node chính như `style Node fill:#1e293b,stroke:#38bdf8`) để tăng tính thẩm mỹ.
- **And** Trình render Mermaid ở frontend phải tự động sửa lỗi cú pháp nhãn chứa ký tự đặc biệt, giải mã an toàn các ký tự mã hóa URL và hiển thị sơ đồ đẹp mắt trên giao diện đọc tương tác.
- **And** Tự động lưu bài viết này vào mục "Bài viết khám phá" trong Thư viện cá nhân của người dùng để đọc lại sau này (tạo record trong DynamoDB và lưu file Markdown vào S3).

### Story 5.3: Scholar Search Agent - Tìm kiếm nâng cao bài viết liên quan (Scholar Search Agent & Related Papers Web Search)
As a nhà nghiên cứu khoa học muốn mở rộng tài liệu tham khảo,
I want trợ lý AI tự động tìm kiếm các bài báo liên quan trên web và Google Scholar chỉ bằng liên kết nguồn,
So that tôi nhanh chóng tiếp cận được các nguồn nghiên cứu bổ sung mà không cần tải file PDF đầy đủ.

**Acceptance Criteria:**
- **Given** Người dùng đang ở màn hình Workspace đọc tài liệu,
- **When** Người dùng bấm vào nút "Tìm liên quan" hoặc gửi yêu cầu tìm tài liệu liên quan trong khung chat,
- **Then** Scholar Search Agent được kích hoạt, sử dụng công cụ Tìm kiếm Web để thực hiện truy vấn Google Scholar / Arxiv / Semantic Scholar dựa trên từ khóa hoặc thông tin trích dẫn của tài liệu hiện tại.
- **And** Trả về danh sách các bài viết liên quan (bao gồm tiêu đề, tác giả, năm xuất bản, tóm tắt ngắn và liên kết nguồn trực tiếp) hiển thị trên giao diện của Workspace để người dùng click mở trang gốc.

### Story 5.4: Đối thoại Audio 2 người - Tóm tắt đa tài liệu (2-Person Audio Overview & TTS Podcast Generator)
As a người học bằng thính giác (Auditory Learner),
I want nghe một cuộc đối thoại tự nhiên giữa 2 MC tóm tắt các tài liệu tôi đã chọn,
So that tôi có thể tiếp thu nhanh các ý tưởng nghiên cứu cốt lõi một cách sinh động.

**Acceptance Criteria:**
- **Given** Người dùng đã chọn các tài liệu từ thư viện và mở giao diện Workspace liên bài viết (ở Story 5.1),
- **When** Người dùng bấm nút "Tạo Podcast tóm tắt" (Generate Audio Overview),
- **Then** Hệ thống gửi yêu cầu lên Backend. Backend sử dụng Gemini để viết kịch bản hội thoại tự nhiên bằng tiếng Việt (hoặc tiếng Anh) giữa 2 người nói (Host A và Host B) phân tích các đóng góp chính và so sánh chéo các tài liệu được chọn.
- **And** Hệ thống sử dụng AWS Polly (hoặc ElevenLabs API) để chuyển đổi kịch bản text thành file âm thanh dạng hai giọng nói hội thoại (Conversational TTS).
- **And** Frontend hiển thị một Audio Player đẹp mắt cho phép người dùng nghe trực tiếp cuộc đối thoại và tải tệp âm thanh (.mp3) về máy tính.

### Story 5.5: Chia sẻ và làm bài trắc nghiệm liên kết công khai (Quiz Sharing & Public Quiz Player)
As a người học muốn chia sẻ tài liệu ôn tập,
I want tạo một liên kết công khai cho bài trắc nghiệm của tôi để gửi cho bạn bè ôn tập cùng,
So that họ có thể học và làm trắc nghiệm trực tuyến mà không cần đăng nhập.

**Acceptance Criteria:**
- **Given** Người dùng đang ở màn hình chơi Quiz trong Workspace,
- **When** Người dùng click nút "Chia sẻ",
- **Then** Client gửi yêu cầu lên Backend. Backend tạo `shareId` duy nhất, lưu vào thuộc tính `quizShares` trong DynamoDB và trả về link `/share/quiz/[shareId]`.
- **When** Người khác truy cập đường dẫn `/share/quiz/[shareId]`,
- **Then** Client gọi API công khai `GET /api/share/quiz/[shareId]`. Backend kiểm tra trạng thái chia sẻ trong DynamoDB và stream file `quiz-{count}.json` tương ứng từ S3 về.
- **And** Giao diện hiển thị trình chơi Quiz độc lập căn giữa màn hình (đẹp mắt, responsive) chỉ chứa nội dung câu hỏi, nút nộp bài và màn hình kết quả/giải thích mà không hiển thị Sidebar hay tài liệu gốc.

