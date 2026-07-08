# Kiến Trúc Tích Hợp (Integration Architecture) — VietAI Scholar

> Tài liệu mô tả cách thức liên kết, luồng dữ liệu end-to-end và cơ chế tích hợp giữa Frontend (Next.js), Backend (AWS CDK + Lambda), Qdrant Cloud và các mô hình AI.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Sơ Đồ Kiến Trúc Tích Hợp Tổng Quan

Hệ thống VietAI Scholar tích hợp các dịch vụ thông qua cơ chế API bất đồng bộ bảo mật bằng JWT Authorizer:

```
                  ┌──────────────────────────────────────────────┐
                  │            Next.js Frontend (fe)             │
                  │  (Library, Workspace, Thesis Defense Studio) │
                  └──────────────────────┬───────────────────────┘
                                         │
                                         │ REST API + JWT
                                         ▼
                             ┌───────────────────────┐
                             │  AWS API Gateway      │
                             │  (Token Authorizer)   │
                             └───────────┬───────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
       ┌──────────────────────┐                     ┌─────────────────────┐
       │ vietai-orchestrator  │                     │   vietai-defense    │
       │ (Main REST Endpoints)│                     │  (Defense Copilot)  │
       └──────────┬───────────┘                     └──────────┬──────────┘
                  │                                            │
                  ├──────────────────────┬─────────────────────┤
                  ▼                      ▼                     ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │ DynamoDB Tables  │  │    S3 Buckets    │  │   Qdrant Cloud   │
         │ (Jobs, Sessions) │  │(Uploads, Results)│  │ (RAG Vector DB)  │
         └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 2. Các Điểm Tích Hợp Kỹ Thuật

### 2.1. Xác thực & Phân quyền (Auth Integration)
*   **Frontend:** Khi học viên đăng nhập thành công qua `LoginModal`, token JWT sẽ được lưu trữ. Tất cả các yêu cầu gửi đến các endpoint bảo mật của backend đều đính kèm tiêu đề: `Authorization: Bearer <JWT_TOKEN>`.
*   **Backend:** API Gateway sử dụng Lambda **`vietai-jwt-authorizer`** kiểm tra chữ ký token bằng mã khóa bí mật cấu hình trong Secrets Manager. Nếu hợp lệ, thông tin `userId` sẽ được gửi kèm trong ngữ cảnh request để chuyển tiếp cho các Lambda xử lý nghiệp vụ (`vietai-orchestrator` hoặc `vietai-defense-copilot`).

### 2.2. Giao tiếp giữa các Lambda Agents (Luồng S3 & Step Functions)
Các tác vụ phân tích tài liệu nặng không giao tiếp trực tiếp để tránh chiếm dụng RAM và timeout. Thay vào đó, chúng truyền tải trạng thái thông qua các tệp trung gian đặt trên **S3 Results Bucket**:
1.  **Extract Agent** tải PDF từ Uploads Bucket, trích xuất văn bản thô, chia thành các chunks nhỏ (tối đa 7000 ký tự) và ghi vào `results/{jobId}/chunks/chunk_{n}.txt`. Đồng thời lưu các mảng placeholders thô.
2.  **Translate Agent** chạy song song (Map state) đọc từng chunk thô, dịch thuật và lưu lại dưới tên `results/{jobId}/chunks/translated_{n}.txt`.
3.  **LaTeX Agent** xử lý các biểu thức toán học và lưu vào `results/{jobId}/latex.json`.
4.  **Merge Agent** đọc toàn bộ các tệp dịch và tệp JSON từ S3, lắp ghép lại và lưu tệp kết quả cuối cùng `results/{jobId}/analysis.md`.
5.  **Ingest Agent** đọc tệp `analysis.md` từ S3, tạo vector embeddings thông qua Gemini Embedding API và cập nhật trực tiếp lên bộ sưu tập của Qdrant Cloud.

### 2.3. Tích hợp RAG & Thesis Defense Studio
Phòng phản biện ảo (Thesis Defense) kết nối chặt chẽ giữa học viên, cơ sở dữ liệu vector và mô hình ngôn ngữ lớn (Gemini 2.5 Flash / Llama 3.3):
1.  Học viên nhập câu trả lời trên giao diện Studio. Giao diện gọi API `POST /explore/defense/answer`.
2.  Lambda `vietai-defense-copilot` nhận dữ liệu, thực hiện tìm kiếm ngữ cảnh khoa học bằng cách tạo vector embedding câu hỏi và truy vấn dữ liệu tham chiếu tương ứng từ **Qdrant Cloud** (RAG).
3.  Kết quả RAG được đưa vào prompt gửi cho LLM đóng vai trò **Evaluator** để chấm điểm mức độ thuyết phục và phát hiện lỗ hổng (`gaps`).
4.  Tiếp theo, kết quả chấm điểm được gửi cho LLM đóng vai trò **Planner** để sinh câu hỏi đào sâu hoặc đổi chủ đề phản biện.
5.  Khi kết thúc phiên (`POST /explore/defense/session/close`), các lỗ hổng kiến thức được đúc kết thành các `SessionFact` và ghi nhận lâu dài vào bảng DynamoDB `vietai-user-competency-profile`.

---

## 3. Luồng Dữ Liệu End-to-End đầy đủ

```
[Học viên] ──► Upload PDF ──► API POST /upload ──► Sinh Presigned S3 URL
    │
    ▼
Tải trực tiếp PDF lên S3 Uploads Bucket
    │
    ▼ Kích hoạt S3 Object Created Event
Lambda Orchestrator ──► Khởi chạy AWS Step Functions Pipeline
    │
    ▼
1. Extract (pdfjs / Textract) ──► Lưu các chunks lên S3
2. Parallel Processing:
   - Map: Dịch song song các chunks (Mistral / Groq / Gemini) ──► Lưu S3
   - LaTeX: Nhận diện & chuẩn hóa công thức toán học ──► Lưu S3
3. Merge ──► Gộp tất cả thành tệp Markdown song ngữ (analysis.md) ──► Lưu S3
4. Ingest ──► Sinh Vector Embeddings ──► Upload lên Qdrant Cloud
    │
    ▼ Cập nhật trạng thái job thành 'completed'
[Học viên Dashboard] ──► Polling GET /job/{jobId} ──► Nhận kết quả & Mở Workspace
    │
    ├─► Chat RAG bài báo (Truy vấn Qdrant Cloud)
    ├─► Sinh Trắc nghiệm / Flashcards / Mindmap / Podcast TTS (Lưu kết quả S3)
    └─► Bắt đầu Thesis Defense Studio (Đọc RAG Qdrant + Vòng lặp Evaluator/Planner)
```

---

## 4. Ranh giới Triển khai (Deployment Boundaries)

*   **Next.js Web Frontend:** Triển khai trên nền tảng **Vercel** để phân phối qua Global CDN có độ trễ thấp.
*   **Backend Serverless (CDK):** Triển khai tại khu vực **AWS Singapore (`ap-southeast-1`)** để đảm bảo tốc độ truyền tải tối ưu về Việt Nam.
*   **Vector Database:** Cơ sở dữ liệu Qdrant Cloud được cấu hình chạy trên cụm Cloud để xử lý tìm kiếm ngữ cảnh thời gian thực.
*   **External AI APIs:** Tích hợp trực tiếp tới các máy chủ API của Google AI (Gemini) và Groq Cloud qua HTTPS an toàn.
