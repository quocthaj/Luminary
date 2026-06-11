# VietAI Scholar — Tài Liệu Tổng Quan Hợp Tác Nhóm

Tài liệu này cung cấp cái nhìn tổng quan về dự án **VietAI Scholar**, bao gồm công nghệ sử dụng (Tech Stack), hướng dẫn cài đặt và chạy thử nghiệm (Getting Started), cùng với danh sách các tính năng/nhiệm vụ đã hoàn thành để giúp các thành viên mới nhanh chóng làm quen và bắt đầu tham gia phát triển.

---

## 1. Giới Thiệu Dự Án

**VietAI Scholar** là nền tảng hỗ trợ dịch thuật tài liệu học thuật định dạng PDF từ tiếng Anh sang tiếng Việt sử dụng công nghệ AI. 

### Các điểm nổi bật:
- **Xử lý PDF thông minh**: Trích xuất nội dung văn bản gốc, giữ nguyên hoặc tối ưu các công thức toán học dưới dạng LaTeX.
- **Dịch thuật đa Agent**: Pipeline dịch thuật chạy song song kết hợp mô tả hình ảnh/biểu đồ, chuẩn hóa trích dẫn, sau đó gộp lại thành bản dịch song ngữ định dạng Markdown.
- **Trình đọc song ngữ Bilingual Reader**: Đọc hai ngôn ngữ song song với khả năng cuộn đồng bộ trên Desktop và tối ưu tab switcher trên Mobile.
- **AI Tutor & Tra cứu tài liệu**: Tách nhỏ tài liệu theo từng phân đoạn (chunk), sinh vector embedding và lưu trữ vào Qdrant Cloud để phục vụ tính năng chat giải đáp và tra cứu thông minh sau này.

---

## 2. Bảng Tóm Tắt Công Nghệ (Tech Stack)

Dự án được cấu trúc theo mô hình Monorepo chia làm hai phần chính: **Backend (be/)** phát triển bằng mô hình serverless trên AWS CDK và **Frontend (fe/)** sử dụng Next.js.

| Thành phần | Công nghệ / Thư viện | Phiên bản | Mô tả / Vai trò |
| :--- | :--- | :--- | :--- |
| **Monorepo** | npm Workspaces | | Quản lý dự án đa thành phần (`be` và `fe`) |
| **Backend Core** | TypeScript / Node.js | ^5.9.3 / 20.x | Ngôn ngữ phát triển chính và runtime cho các AWS Lambda |
| **Infrastructure** | AWS CDK | 2.1123.0 | Quản lý hạ tầng dưới dạng mã nguồn (IaC) |
| **API Gateway** | Amazon API Gateway | | REST API endpoints giao tiếp giữa FE và BE, bảo mật bằng Authorizer |
| **Authentication (BE)** | Custom Lambda Authorizer | | Xác thực stateless JWT token bằng Web Crypto API (HS256) |
| **Orchestration** | AWS Step Functions | | Quản lý pipeline dịch thuật tự động: Extract → (Translate + LaTeX) → Merge → Ingest |
| **Database** | Amazon DynamoDB | | Lưu trữ thông tin Jobs, trạng thái xử lý và danh mục tài liệu của User |
| **Storage** | Amazon S3 | | Lưu trữ file PDF tải lên, kết quả Markdown tạm thời và kết quả cuối cùng |
| **Vector Database** | Qdrant Cloud | | Lưu trữ vector embedding 768 chiều của từng đoạn tài liệu |
| **AI Models** | Google Gemini (embedding-001 / flash), Llama 3.3 (Groq), Mistral | | Đa dạng hóa nhà cung cấp mô hình AI với cơ chế fallback tự động |
| **Frontend Core** | Next.js (App Router) | 16.2.7 | Framework ứng dụng web của Client |
| **UI Library** | React | 19.2.4 | Thư viện giao diện chính |
| **Styling** | TailwindCSS | ^4 | Hệ thống styling và thiết kế giao diện |
| **Authentication (FE)** | NextAuth.js (Auth.js) | v5 | Xác thực qua Google OAuth và Custom Email OTP (stateless HMAC) |
| **Math Rendering** | KaTeX | | Hiển thị các công thức toán học LaTeX trực quan và hỗ trợ copy mã nguồn |
| **Testing** | Jest + Playwright | | Kiểm thử đơn vị backend (Jest) và kiểm thử E2E frontend (Playwright) |

---

## 3. Hướng Dẫn Sử Dụng & Phát Triển (How-to-Use Guide)

### 3.1. Yêu cầu hệ thống ban đầu
- **Node.js** phiên bản $\ge$ 20.x
- **npm** phiên bản $\ge$ 9.x
- **AWS CLI** đã cấu hình xác thực quyền truy cập AWS account của bạn.
- **AWS CDK CLI** (`npm install -g aws-cdk` hoặc dùng qua `npx`).

### 3.2. Cài đặt các thành phần

Từ thư mục gốc của dự án, bạn có thể cài đặt dependencies cho toàn bộ workspace:
```bash
# Cài đặt toàn bộ dependencies trong monorepo
npm install
```
Hoặc cài đặt riêng lẻ:
```bash
# Đối với Backend
cd be
npm install

# Đối với Frontend
cd fe
npm install
```

### 3.3. Cấu hình biến môi trường & AWS Secrets

#### Tạo Secrets trên AWS Secrets Manager
Trước khi triển khai Backend, bạn cần tạo các secret key tương ứng trên AWS Secrets Manager để Lambda functions có quyền truy cập API của AI Providers và Qdrant:
```bash
# 1. Groq API Key
aws secretsmanager create-secret --name vietai/groq-api-key --secret-string "your-groq-key"

# 2. Google Gemini API Key
aws secretsmanager create-secret --name vietai/gemini-api-key --secret-string "your-gemini-key"

# 3. DeepSeek API Key
aws secretsmanager create-secret --name viet-ai-scholar/deepseek-api-key --secret-string "your-deepseek-key"

# 4. Mistral API Key
aws secretsmanager create-secret --name viet-ai-scholar/mistral-api-key --secret-string "your-mistral-key"

# 5. Auth Secret (dùng cho JWT Lambda Authorizer)
aws secretsmanager create-secret --name vietai/auth-secret --secret-string "your-auth-secret-string"

# 6. Qdrant Cloud Config (dạng JSON chứa url và apiKey)
aws secretsmanager create-secret --name vietai/qdrant-config --secret-string '{"url":"https://your-qdrant-cluster.cloud.qdrant.io","apiKey":"your-qdrant-api-key"}'
```

#### Thiết lập biến môi trường Frontend
Tạo file `fe/.env.local` với cấu hình NextAuth và API URL:
```env
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=your-auth-secret-string
NEXT_PUBLIC_API_URL=https://<api-gateway-id>.execute-api.ap-southeast-1.amazonaws.com/prod
```
*Lưu ý: API URL sẽ nhận được sau khi chạy lệnh deploy backend thành công.*

### 3.4. Chạy dự án ở môi trường Local

#### Phát triển Frontend (Dev Mode)
```bash
cd fe
npm run dev
```
Mở trình duyệt truy cập `http://localhost:3000`.

#### Biên dịch và Deploy Backend (AWS CDK)
```bash
cd be
# Biên dịch TypeScript sang JS trong thư mục dist/
npm run build

# Xem trước CloudFormation template tạo ra
npx cdk synth

# Triển khai hạ tầng lên AWS
npx cdk deploy
```

### 3.5. Chạy Kiểm Thử (Testing)

#### Chạy Unit Test Backend (Jest)
```bash
cd be
npm test
```

#### Chạy E2E Test Frontend (Playwright)
```bash
cd fe
# Chạy tất cả các test case E2E
npx playwright test

# Chạy có giao diện UI tương tác để debug
npx playwright test --ui
```

---

## 4. Các Task Đã Hoàn Thành (Project Milestones)

Dưới đây là lịch sử và tiến độ các công việc đã thực hiện thành công trong dự án:

### 🌟 Epic 1: Giao diện cơ bản & Luồng tải tài liệu
- **Story 1.1: File Size Validation & Drag-Drop UI**
  - Thiết kế vùng kéo thả file PDF (Drag-and-Drop) tại trang chủ.
  - Tích hợp validator dung lượng file: Hỗ trợ tối đa 30MB, cảnh báo từ 30-50MB, và chặn tải lên nếu $>$ 50MB.
- **Story 1.2: Calls API Upload & Presigned URL**
  - Kết nối frontend tới endpoint `POST /api/jobs` để lấy S3 Presigned URL.
  - Triển khai cơ chế auto-retry khi mất kết nối mạng và thiết lập thời gian chờ tối đa (timeout) 5 phút.
- **Story 1.3: Translation Progress & Bilingual Side-by-Side Layout**
  - Triển khai cơ chế Polling định kỳ 2 giây cập nhật trạng thái xử lý (`Extracting` → `Translating` → `Merging`).
  - Xây dựng giao diện Bilingual Reader: 2 cột dịch song ngữ cuộn đồng bộ trên Desktop; tự động chuyển đổi tab (EN/VI) trên các thiết bị Mobile.
- **Story 1.4: KaTeX Formula Render & Plain LaTeX Copy**
  - Tích hợp render công thức toán LaTeX (inline `$ ... $` và block `$$ ... $$`) bằng KaTeX.
  - Thêm nút copy nhanh mã nguồn LaTeX thô khi di chuột lên công thức. Viết bộ Playwright E2E test kiểm chứng.

### 🌟 Epic 2: Xác thực thành viên, Thư viện & Xem lại/Dịch lại
- **Story 2.1: NextAuth Integration for Google & Email Login**
  - Tích hợp NextAuth v5 bảo mật ứng dụng bằng cơ chế Stateless JWT.
  - Xây dựng cơ chế gửi OTP xác thực không cần cơ sở dữ liệu (sử dụng chữ ký số HMAC).
  - Triển khai Middleware bảo vệ các route `/library` và `/api/preview/*`.
- **Story 2.2: Download Login Wall & Post-Login Auto-Download**
  - Chặn người dùng chưa đăng nhập tải file dịch (Download Login Wall).
  - Tự động kích hoạt tải xuống file dịch ngay sau khi người dùng hoàn tất đăng nhập.
  - Thiết kế Floating Auth Status hiển thị thông tin đăng nhập/đăng xuất góc phải màn hình đọc.
- **Story 2.3: Lambda Authorizer xác thực JWT trên API Gateway**
  - Viết module verify JWT thuật toán HS256 sử dụng Web Crypto API thuần của Node.js (`crypto.subtle`) cho bundle size siêu nhẹ.
  - Tích hợp Lambda Authorizer trong CDK để bảo vệ các API nhạy cảm (`POST /upload` và `GET /result/{jobId}`).
- **Story 2.4: Giao diện Thư viện tài liệu cá nhân & Bộ lọc thời gian**
  - Tạo API `GET /jobs` truy vấn DynamoDB sử dụng GSI (`userIdIndex`) lấy danh sách tài liệu của từng user.
  - Xây dựng trang Thư viện (`/library`) hiển thị danh sách tài liệu, đi kèm Shimmer Skeleton Loader đẹp mắt khi tải dữ liệu.
  - Triển khai bộ lọc tài liệu theo thời gian (Hôm nay, 7 ngày trước, 30 ngày trước).
- **Story 2.5: S3 Streaming Proxy & Nút Dịch lại**
  - Thêm API reprocess (`POST /job/{jobId}/reprocess`) kích hoạt lại pipeline Step Functions với tên execution duy nhất để tránh trùng lặp.
  - Tạo Next.js API Proxy `/api/preview/[jobId]` stream tài liệu trực tiếp từ S3 về client và đính kèm JWT token.
  - Thêm nút "Dịch lại" trên giao diện Bilingual Reader, tự động đưa người đọc về màn hình chờ xử lý khi yêu cầu dịch lại.

### 🌟 Epic 3: Không gian làm việc thông minh & Phân đoạn Vector hóa
- **Story 3.1: Giao diện Workspace 3 cột chuyên nghiệp**
  - Tái cấu trúc giao diện đọc tài liệu thành Workspace 3 cột chính thức trên Desktop:
    1. **Cột trái (Sidebar 15%)**: Thư viện cá nhân và danh sách công cụ tiện ích.
    2. **Cột giữa (Bilingual Reader 55%)**: Đọc bản dịch song ngữ EN-VI.
    3. **Cột phải (AI Tutor Panel 30%)**: Khung chat hỗ trợ và tra cứu học thuật Semantic Scholar.
  - Thiết kế các nút handle đóng/mở sidebar linh hoạt. Cột chính tự động co giãn mượt mà.
  - Responsive ẩn các sidebar trên thiết bị di động để tối ưu trải nghiệm đọc.
- **Story 3.2: Tách đoạn & Embedding lưu trữ Qdrant Cloud**
  - Merge Lambda gộp bản dịch theo từng phân đoạn, gắn kèm anchor định vị ẩn `{#chunk-index}`.
  - Phát triển Lambda Ingestion mới trong Step Functions pipeline: phân tích file Markdown, trích xuất các cặp đoạn văn gốc-dịch qua anchor.
  - Gọi Google Gemini Embedding API (`gemini-embedding-001`) lấy vector 768 chiều cho từng đoạn tiếng Anh.
  - Đẩy (Upsert) dữ liệu vector kèm metadata lên Qdrant Cloud. Sử dụng UUIDv5 để ghi đè dữ liệu cũ khi dịch lại, tránh trùng lặp bản ghi.
  - Nâng cấp `renderMarkdown` ở Frontend ẩn cú pháp anchor thô và gán thành thuộc tính `id="chunk-index"` để highlight/cuộn đến đoạn văn tương ứng.

---

## 5. Hướng Dẫn Phối Hợp Làm Việc Nhóm

Khi tham gia phát triển dự án, xin vui lòng tuân thủ các nguyên tắc sau:
1. **Quản lý nhánh (Branching)**: Các tính năng mới nên được viết trên nhánh tính năng riêng bắt đầu bằng `feat/` hoặc `fix/` từ nhánh `main` (ví dụ: `feat/epic-3-ai-chat-tutor`).
2. **Kiểm tra code tại Local trước khi Commit**:
   - Chạy `npm run build` ở backend để đảm bảo không lỗi biên dịch TypeScript.
   - Chạy `npm test` ở backend để pass hết Jest tests.
   - Chạy `npx playwright test` ở frontend để kiểm thử giao diện không bị hỏng (broken UI).
3. **AWS CDK Guidelines**:
   - Tránh sửa trực tiếp tài nguyên trên AWS Console. Hãy viết tất cả trong CDK stack (`be/lib/be-stack.ts`) để đồng bộ hóa hạ tầng giữa các thành viên.
   - Đảm bảo các API key nhạy cảm luôn được lấy từ Secrets Manager thông qua CDK Secrets references, tuyệt đối không hardcode trong Lambda code hay CDK code.
