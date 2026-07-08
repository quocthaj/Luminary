# Phân Tích Cây Mã Nguồn (Source Tree Analysis) — VietAI Scholar

> Mô tả chi tiết cấu trúc thư mục, các tệp mã nguồn và các điểm phân phối chính (entry points) của hệ thống monorepo VietAI Scholar.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Cấu Trúc Thư Mục Tổng Quan

```
viet-ai-scholar/
├── be/                          # ⚡ Backend — AWS CDK Infrastructure + Lambda Services
│   ├── bin/
│   │   └── be.ts                # 🔵 CDK App Entry Point
│   ├── lib/
│   │   └── be-stack.ts          # 🔵 Định nghĩa toàn bộ hạ tầng AWS (CDK Stack: S3, DynamoDB, API Gateway, Step Functions)
│   ├── lambda/
│   │   ├── index.ts             # 🔵 Main Lambda Handler — routing chung API + S3 uploads trigger
│   │   ├── supervisor.ts        # 🔵 Supervisor Agent — điều phối luồng xử lý song song (Direct / SFN mode)
│   │   ├── authorizer.ts        # 🔒 Lambda Token Authorizer (Xác thực JWT)
│   │   ├── types.ts             # 📋 Các khai báo Type và Interface TypeScript dùng chung
│   │   ├── agents/              # Các tác vụ AI Agent của đường ống (pipeline) cốt lõi
│   │   │   ├── translator.ts    # Agent dịch thuật EN→VI (Groq/Gemini fallback)
│   │   │   ├── latex.ts         # Agent chuẩn hóa công thức toán LaTeX
│   │   │   ├── diagram.ts       # Agent chuyển đổi mô tả hình vẽ thành text
│   │   │   ├── citation.ts      # Agent xử lý, phân loại các trích dẫn khoa học
│   │   │   └── merge.ts         # Agent gộp các kết quả thô thành file Markdown song ngữ
│   │   ├── handlers/            # Các Lambda Handlers độc lập xử lý API và Step Functions
│   │   │   ├── extract.ts       # SFN: Trích xuất text từ S3 PDF (pdfjs + Textract)
│   │   │   ├── translate.ts     # SFN: Dịch thuật song ngữ cho từng đoạn (chunk)
│   │   │   ├── latex.ts         # SFN: Xử lý LaTeX trên đoạn
│   │   │   ├── merge.ts         # SFN: Gom và gộp các chunk kết quả
│   │   │   ├── ingest.ts        # SFN: Tạo embedding và nạp vector vào Qdrant Cloud
│   │   │   ├── chat.ts          # API: Trả lời hỏi đáp RAG trên tài liệu
│   │   │   ├── quiz.ts          # API: Tạo câu hỏi trắc nghiệm kiến thức bài báo
│   │   │   ├── share.ts         # API: Quản lý chia sẻ bài trắc nghiệm công khai
│   │   │   ├── flashcard.ts     # API: Tạo và quản lý thẻ ghi nhớ thông minh
│   │   │   ├── mindmap.ts       # API: Tạo sơ đồ tư duy dạng đồ thị Mermaid
│   │   │   ├── podcast.ts       # API: Sinh hội thoại audio podcast tóm tắt (TTS)
│   │   │   ├── synthesis.ts     # API: Tạo báo cáo tổng hợp & Chat chéo liên bài báo (Cross-Paper)
│   │   │   ├── explore.ts       # API: Khởi tạo khám phá chủ đề tự do (Explore Mode)
│   │   │   ├── defense-router.ts# API: Router phân phối các yêu cầu Thesis Defense & Research Copilot
│   │   │   └── defense.ts       # API: Vòng lặp phản biện Thesis Defense & quản lý hồ sơ năng lực
│   │   └── utils/               # Các mô-đun tiện ích dùng chung ở backend
│   │       ├── ai-providers.ts  # Tương tác với LLMs (Gemini, Groq, Mistral, DeepSeek)
│   │       ├── auth-helpers.ts  # Tiện ích mã hóa & kiểm tra JWT
│   │       ├── aws-clients.ts   # Quản lý cấu hình & kết nối SDK AWS
│   │       ├── competency.ts    # Thuật toán tính điểm năng lực học tập và suy hao (decay)
│   │       ├── dynamodb-helpers.ts # Đọc ghi dữ liệu trên bảng DynamoDB
│   │       ├── placeholder.ts   # Regex trích xuất và thay thế thẻ placeholders
│   │       ├── prompt-builder.ts # Tạo prompt và chia văn bản thành các đoạn hợp lý
│   │       ├── response.ts      # Tiện ích định dạng phản hồi HTTP cho API Gateway
│   │       ├── s3-helpers.ts    # Thao tác đọc ghi tệp trên S3 Buckets
│   │       └── text-extraction.ts # Xử lý trích xuất văn bản từ tệp PDF
│   ├── package.json             # Danh sách thư viện và scripts backend
│   └── tsconfig.json            # Cấu hình biên dịch TypeScript backend
│
│
├── fe/                          # 🎨 Frontend — Ứng dụng Next.js 16 (React 19 + Tailwind v4)
│   ├── app/
│   │   ├── layout.tsx           # Layout gốc (Font family, ThemeToggle, Providers)
│   │   ├── page.tsx             # Trang chủ (Landing view & Dashboard tải tệp)
│   │   ├── globals.css          # Cấu hình Tailwind CSS v4 & Biến giao diện hệ thống
│   │   ├── not-found.tsx        # Trang hiển thị lỗi 404 tùy chỉnh
│   │   ├── api/
│   │   │   └── preview/[jobId]/
│   │   │       └── route.ts     # API Next.js proxy tải tài liệu từ kết quả S3
│   │   ├── explore/             # Nhóm chức năng Khám phá chủ đề (Explore Mode)
│   │   │   ├── page.tsx         # Bản đồ chủ đề và thanh tìm kiếm đề tài
│   │   │   ├── [jobId]/
│   │   │   │   └── page.tsx     # Chi tiết luồng xử lý khám phá chủ đề
│   │   │   └── studio/
│   │   │       └── [sessionId]/
│   │   │           └── page.tsx # 🏛️ Giao diện 3 cột Phòng phản biện ảo (Thesis Defense Studio)
│   │   ├── library/
│   │   │   └── page.tsx         # Thư viện quản lý tài liệu cá nhân
│   │   ├── share/
│   │   │   └── page.tsx         # Trang làm bài trắc nghiệm chia sẻ công khai
│   │   └── synthesis/
│   │       └── page.tsx         # Giao diện Tổng hợp & Đối chiếu liên bài báo (Cross-Paper Synthesis)
│   ├── components/              # Các thành phần giao diện React có tính tái sử dụng cao
│   │   ├── LandingView.tsx      # Giao diện giới thiệu VietAI Scholar
│   │   ├── LoginModal.tsx       # Hộp thoại đăng nhập & lấy JWT token
│   │   ├── UploadView.tsx       # Khung kéo thả tệp PDF và xử lý URL tải lên
│   │   ├── ProcessingView.tsx   # Hiệu ứng nạp tệp và các bước xử lý tiến trình
│   │   ├── ResultView.tsx       # Trình xem song ngữ, sao chép & tải về Markdown
│   │   ├── QuizModal.tsx        # Hộp thoại làm bài trắc nghiệm kiến thức sinh ra từ bài báo
│   │   ├── FlashcardModal.tsx   # Hộp thoại học tập dạng thẻ ghi nhớ thông minh
│   │   ├── MindmapModal.tsx     # Hộp thoại hiển thị Sơ đồ tư duy bài báo (Mermaid)
│   │   ├── PodcastPlayer.tsx    # Trình nghe Audio Podcast tóm tắt thông tin bài báo
│   │   ├── DefenseModal.tsx     # Trình khởi chạy nhanh phiên bảo vệ luận án ảo từ workspace
│   │   ├── ObsidianGraphView.tsx# Thành phần vẽ Knowledge Graph năng lực học viên dạng 2D
│   │   ├── ThemeToggle.tsx      # Nút chuyển đổi Dark/Light mode
│   │   └── WorkspaceView.tsx    # Giao diện làm việc trung tâm (bản dịch, chat RAG, phím tắt công cụ)
│   ├── lib/
│   │   └── api.ts               # API Client thực hiện các lệnh gọi fetch lên AWS API Gateway
│   └── package.json             # Danh sách thư viện và scripts frontend
```

---

## 2. Thống kê Phân bổ Mã Nguồn

| Phân vùng | Mục đích chính | Số lượng tệp chính |
| :--- | :--- | :--- |
| `be/lib/` | Định nghĩa hạ tầng và liên kết AWS CDK | 1 tệp (`be-stack.ts`) |
| `be/lambda/` | Điểm tiếp nhận API, xác thực và cấu hình kiểu dữ liệu | 4 tệp chính |
| `be/lambda/agents/` | Điều phối logic xử lý song song của các AI Agent riêng lẻ | 5 tệp Agents |
| `be/lambda/handlers/` | Điểm cuối (handlers) của Lambda cho từng tài nguyên API Gateway & Step Functions | 15 tệp Handlers |
| `be/lambda/utils/` | Các mô-đun dịch vụ phụ trợ như kết nối AWS, LLMs, auth, thuật toán | 10 tệp tiện ích |
| `fe/app/` | Định nghĩa cấu trúc định tuyến (routes) trang của Next.js | 8 tệp trang (`page.tsx`, `layout.tsx`) |
| `fe/components/` | Thư viện thành phần giao diện React tương tác | 13 tệp components |

---

## 3. Các Điểm Phân Phối Kỹ Thuật (Entry Points)

*   **CDK App Entry:** `be/bin/be.ts` — Biên dịch cấu trúc CloudFormation để triển khai hạ tầng.
*   **API Gateway & S3 Entry:** `be/lambda/index.ts` — Routing API Gateway cấp cao và bắt sự kiện tải lên bucket `vietai-uploads`.
*   **Thesis Defense Entry:** `be/lambda/handlers/defense-router.ts` — Tiếp nhận các truy vấn liên quan đến vòng lặp đối thoại phản biện và cập nhật hồ sơ năng lực.
*   **Step Functions Entry:** Định nghĩa chuỗi trong `be-stack.ts` kích hoạt tuần tự qua `vietai-processing-pipeline`.
*   **Frontend Entry:** `fe/app/page.tsx` — Giao diện hạ cánh đầu tiên xử lý đăng nhập, quản lý trạng thái tải lên bài báo.
*   **RAG Vector Entry:** `be/lambda/handlers/ingest.ts` — Điểm nạp dữ liệu vector song ngữ lên Qdrant Cloud.
