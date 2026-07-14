# Kiến Trúc Backend — Luminary Scholar

> Tài liệu mô tả cấu trúc hệ thống, cơ sở hạ tầng Cloud và kiến trúc xử lý của phần Backend (AWS CDK + Lambda).  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Tổng Quan

Phần Backend của Luminary Scholar được xây dựng theo kiến trúc **Serverless** trên nền tảng Amazon Web Services (AWS), sử dụng **AWS CDK** (Infrastructure as Code) viết bằng TypeScript để quản lý tài nguyên. Hệ thống sử dụng mô hình **Multi-Agent** để xử lý song song các tác vụ phân tích, dịch thuật, xử lý LaTeX bài báo khoa học thông qua **AWS Step Functions**.

---

## 2. Cơ Sở Hạ Tầng Cloud (AWS Infrastructure)

### 2.1. Lưu trữ S3 (S3 Buckets)

Hệ thống định nghĩa 3 S3 buckets phục vụ cho các mục đích riêng biệt:

| Bucket | Tên vật lý | Mục đích sử dụng | Vòng đời (Lifecycle) |
| :--- | :--- | :--- | :--- |
| **Uploads** | `vietai-uploads-{accountId}` | Nhận tệp PDF tải lên từ client | Xóa thư mục `temp/` sau 90 ngày |
| **Results** | `vietai-results-{accountId}` | Lưu kết quả dịch và các sản phẩm AI phụ trợ | Xóa cache sau 30 ngày |
| **Frontend** | `vietai-frontend-{accountId}` | Hosting trang giao diện tĩnh (SPA) | — |

*   **Chính sách bảo mật:** Tất cả buckets cấu hình chặn truy cập công khai hoàn toàn (`BlockPublicAccess.BLOCK_ALL`) và mã hóa dữ liệu tự động (`S3_MANAGED`).
*   **Cấu hình CORS:** Uploads bucket cho phép phương thức `PUT` từ mọi nguồn để hỗ trợ upload qua Presigned URL; Results bucket cho phép `GET` và `HEAD` phục vụ tải xuống.

### 2.2. Cơ sở dữ liệu DynamoDB

Hệ thống sử dụng 4 bảng DynamoDB riêng lẻ:

1.  **`vietai-jobs`**: Lưu trữ tiến trình và dữ liệu xử lý chính của bài báo.
    *   *Partition Key:* `jobId` (String)
    *   *GSI (userIdIndex):* Partition `userId` (String) + Sort `createdAt` (Number) để truy vấn danh sách bài báo của người dùng.
    *   *TTL:* Xóa tự động sau 30 ngày qua thuộc tính `expiresAt`.
2.  **`vietai-quiz-shares`**: Quản lý liên kết trắc nghiệm chia sẻ công khai.
    *   *Partition Key:* `shareId` (String)
    *   *TTL:* Tự động hết hạn sau 7 ngày qua thuộc tính `expiresAt`.
3.  **`vietai-thesis-defense-sessions`**: Quản lý các phiên đối thoại phản biện luận án ảo.
    *   *Partition Key:* `sessionId` (String)
4.  **`vietai-user-competency-profile`**: Hồ sơ năng lực lâu dài của học viên (Single-Table Design).
    *   *Partition Key:* `PK` (String, định dạng: `USER#${userId}`)
    *   *Sort Key:* `SK` (String, định dạng: `CONCEPT#${conceptId}`)

### 2.3. Các hàm Lambda (Lambda Functions)

Hạ tầng định nghĩa 8 hàm Lambda cốt lõi:

| Lambda Function | Tên vật lý | Entrypoint | RAM | Timeout | Vai trò chính |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Orchestrator** | `vietai-orchestrator` | `index.ts` | 1024 MB | 600s | Router API Gateway chính và tiếp nhận sự kiện kích hoạt S3 Uploads |
| **Extract** | `vietai-extract` | `handlers/extract.ts` | 2048 MB | 120s | SFN Task: Trích xuất text PDF (pdfjs / Textract OCR) |
| **Translate** | `vietai-translate` | `handlers/translate.ts` | 512 MB | 60s | SFN Task: Dịch song ngữ từng đoạn văn (Mistral / Groq / Gemini) |
| **LaTeX** | `vietai-latex` | `handlers/latex.ts` | 512 MB | 60s | SFN Task: Phát hiện và định dạng toán học LaTeX |
| **Merge** | `vietai-merge` | `handlers/merge.ts` | 512 MB | 60s | SFN Task: Gộp bản dịch và placeholders thành file Markdown |
| **Ingest** | `vietai-ingest` | `handlers/ingest.ts` | 512 MB | 120s | SFN Task: Tạo vector embedding và tải lên Qdrant Cloud |
| **Defense Copilot**| `vietai-defense-copilot` | `handlers/defense-router.ts`| 512 MB | 30s | Quản lý vòng lặp suy luận Thesis Defense và Research Copilot |
| **JWT Authorizer**| `vietai-jwt-authorizer` | `authorizer.ts` | 128 MB | 5s | Lambda Custom Authorizer kiểm định token JWT từ client |

### 2.4. Đường ống Step Functions (State Machine)

Đường ống xử lý tài liệu lớn chạy bất đồng bộ được thiết lập thông qua Step Functions với tên `vietai-processing-pipeline`.

**Sơ đồ logic chạy:**
```
ExtractTask (Extract text)
      │
      ▼
ParallelProcessing (Chạy song song hai nhánh)
  ├── Nhánh 1: TranslateMapState (Map lặp dịch song song từng chunk, tối đa 5 concurrency)
  │      └── TranslateChunkTask
  └── Nhánh 2: LaTeXTask (Xử lý định dạng toán học)
      │
      ▼
MergeTask (Gộp kết quả thô thành Markdown song ngữ)
      │
      ▼
IngestTask (Tạo embedding từ Markdown và nạp lên Qdrant Cloud RAG)
```

---

## 3. Kiến Trúc Multi-Agent & Vòng Lặp Phản Biện

### 3.1. Quản lý Agents Đường ống Dịch
Đường ống dịch cốt lõi sử dụng mô hình điều phối của Supervisor Agent. Khi có tài liệu tải lên:
1.  **Supervisor** (`supervisor.ts`) nhận chuỗi thô từ PDF, thực hiện trích xuất placeholders (`{{formula_X}}`, `{{figure_X}}`, `{{citation_X}}`) để tối ưu prompt.
2.  Sau đó, kích hoạt các Agent chuyên biệt xử lý độc lập thông qua **Step Functions** (ở Production) hoặc chạy song song bằng **Promise.allSettled** (ở môi trường Dev nội bộ).
3.  **Merge Agent** gộp bản dịch, chèn lại các placeholders và định dạng hoàn thiện Markdown.

### 3.2. Vòng Lặp Phản Biện Luận Án Ảo (Reasoning Loop)
Tính năng **Thesis Defense** sử dụng vòng lặp logic phản hồi 2 pha:
```
Học viên nhập câu trả lời
        │
        ▼
Pha 1: Evaluator (Reflect) ──► Gọi Gemini 2.5 Flash đánh giá độ thuyết phục (convincing)
        │                      Tìm kiếm RAG kiểm chứng tri thức từ Qdrant
        │                      Trích xuất lỗ hổng (gaps) & khái niệm liên đới
        ▼
Pha 2: Planner (Act) ───────► Quyết định: deepen (hỏi sâu) | switch (đổi chủ đề) | conclude (kết thúc)
        │                      Sinh câu hỏi tiếp theo
        ▼
Cập nhật trạng thái session & Lưu hồ sơ năng lực học viên lâu dài
```

---

## 4. Quản lý Khóa Bí Mật (Secrets Manager)

Tất cả thông tin nhạy cảm và khóa API được mã hóa và truy vấn trực tiếp từ AWS Secrets Manager thay vì ghi cứng vào mã nguồn:

1.  `vietai/groq-api-key`: API Key kết nối Llama 3.3 trên Groq.
2.  `vietai/gemini-api-key`: API Key kết nối Gemini 2.5 Flash trên Google.
3.  `viet-ai-scholar/deepseek-api-key`: API Key cho mô hình DeepSeek.
4.  `viet-ai-scholar/mistral-api-key`: API Key cho mô hình Mistral.
5.  `vietai/qdrant-config`: Thông tin định tuyến và khóa của Qdrant Cloud.
6.  `vietai/gemini-embedding-key`: Khóa API riêng cho mô hình embedding Gemini.
7.  `vietai/nomic-api-key`: Khóa API của Nomic phục vụ embedding.
8.  `vietai/google-tts`: Chứng chỉ dịch vụ tài khoản liên kết Google Cloud Text-to-Speech.
9.  `vietai/auth-secret`: Khóa bí mật dùng để mã hóa và giải mã token JWT.
