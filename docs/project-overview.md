# VietAI Scholar — Tổng Quan Dự Án

> Tài liệu giới thiệu tổng quan mục tiêu, đối tượng sử dụng và các tính năng chính của hệ thống VietAI Scholar.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Tóm Tắt Dự Án

**VietAI Scholar** là nền tảng hỗ trợ học thuật và nghiên cứu khoa học chuyên sâu dành cho học viên và nhà nghiên cứu Việt Nam. Hệ thống không chỉ dịch thuật song ngữ Anh-Việt tối ưu cho các bài báo khoa học PDF (giữ nguyên cấu trúc công thức LaTeX và trích dẫn), mà còn cung cấp một hệ sinh thái các công cụ học tập tương tác: Trắc nghiệm (Quiz), Thẻ ghi nhớ (Flashcards), Sơ đồ tư duy (Mindmap), Audio Podcast và đặc biệt là phòng phản biện luận án thử nghiệm (Thesis Defense Studio) giúp đánh giá và phát triển năng lực của học viên dựa trên hồ sơ năng lực thực tế.

---

## 2. Bảng Tóm Tắt Công Nghệ & Dịch Vụ

| Danh mục | Công nghệ / Dịch vụ áp dụng | Vai trò |
| :--- | :--- | :--- |
| **Ngôn ngữ** | TypeScript | Đồng bộ mã nguồn Backend (~5.9.3) và Frontend (^5) |
| **Hạ tầng Cloud** | AWS CDK (v2) | Infrastructure as Code quản lý hạ tầng Serverless |
| **Tính toán** | AWS Lambda (Node.js 20.x) | 8 hàm Lambda xử lý API, Step Functions và authorizer |
| **Điều phối luồng** | AWS Step Functions | Điều khiển đường ống xử lý: Extract → (Translate + LaTeX) → Merge → Ingest |
| **Lưu trữ** | Amazon S3 | 3 buckets: uploads (PDF thô), results (kết quả và audio), frontend (tĩnh) |
| **Cơ sở dữ liệu** | Amazon DynamoDB | 4 bảng: jobs (bài báo), shares (trắc nghiệm), sessions (phản biện), profile (năng lực) |
| **Vector Database** | Qdrant Cloud | Cơ sở dữ liệu Vector lưu trữ embeddings RAG phục vụ hỏi đáp và phản biện |
| **Xác thực** | Next-Auth v5 + Custom Authorizer | Đăng nhập an toàn, phân phối JWT token bảo mật API |
| **Mô hình AI** | Gemini 2.5 Flash, Llama 3.3, Mistral | Các LLM phục vụ dịch thuật, đánh giá phản biện, sinh câu hỏi và tóm tắt |
| **Tạo giọng nói** | Google Cloud TTS + AWS Polly | Tổng hợp giọng đọc podcast tóm tắt bài báo |
| **Giao diện Web** | Next.js 16 (App Router) + React 19 | Giao diện Single Page Application tối ưu, tải trang nhanh |
| **Định hình CSS** | TailwindCSS v4 | Styling tiện ích hiện đại với design tokens HSL và chuyển động mượt |

---

## 3. Các Phân Hệ Tính Năng Cốt Lõi

Hệ thống VietAI Scholar bao gồm 6 phân hệ tính năng lớn kết hợp chặt chẽ:

### 3.1. Đường ống Xử lý & Dịch thuật thông minh (Pipeline)
*   **Trích xuất PDF:** Sử dụng `pdfjs-dist` chạy cục bộ để trích xuất văn bản nhanh, tự động fallback sang **Amazon Textract** chạy OCR bất đồng bộ nếu tệp PDF dạng ảnh scan hoặc cấu hình layout phức tạp.
*   **Bảo toàn cấu trúc:** Tách riêng các công thức toán học (`LaTeX`), sơ đồ bảng biểu và các trích dẫn khoa học (`Citations`) thành placeholders trước khi dịch để tránh AI phá hủy định dạng cấu trúc nguyên bản.
*   **Dịch song ngữ song song:** Dịch thuật chuyên ngành chất lượng cao và gộp thành tệp Markdown song ngữ (`analysis.md`) hiển thị hai cột đối chiếu trực quan.

### 3.2. Không gian làm việc Trung tâm (Workspace View)
*   **Bản đọc song ngữ:** Chế độ hiển thị song song hoặc xem riêng lẻ tiếng Anh / tiếng Việt, hỗ trợ công thức KaTeX sắc nét.
*   **Chat RAG trên tài liệu:** Cung cấp chatbot hỏi đáp chi tiết về bài báo nghiên cứu, lấy dữ liệu thời gian thực từ không gian vector Qdrant Cloud.

### 3.3. Bộ Công cụ Học tập Tương tác (Interactive Tools)
*   **Trắc nghiệm Kiến thức (Quiz):** AI tự động tạo bài kiểm tra kiến thức đa lựa chọn từ bài báo, cho phép học viên tự đánh giá mức độ hiểu bài. Hỗ trợ tạo mã chia sẻ công khai có bảo mật chống Spam EDoS.
*   **Thẻ ghi nhớ (Flashcards):** Tự động trích xuất các định nghĩa và thuật ngữ mới thành thẻ lật để học tập ghi nhớ nhanh.
*   **Sơ đồ tư duy (Mindmap):** Sinh sơ đồ tư duy Mermaid mô tả cấu trúc phần mục của bài báo.
*   **Audio Podcast:** Chuyển đổi bài báo thành một cuộc hội thoại nói chuyện tóm tắt bằng âm thanh sống động (TTS).

### 3.4. Nghiên cứu Tổng hợp (Cross-Paper Synthesis)
*   Học viên có thể chọn nhiều bài báo trong thư viện cá nhân để yêu cầu AI lập báo cáo đối chiếu, so sánh chênh lệch học thuật chéo và tham gia chat RAG đa tài liệu.

### 3.5. Chế độ Khám phá Chủ đề Tự do (Explore Mode)
*   Học viên chỉ cần nhập chủ đề nghiên cứu mong muốn (ví dụ: "Kiến trúc GPT-4"), AI sẽ tự động sinh Topic Map (dàn ý kiến thức) và chủ động cào nạp dữ liệu để học viên bắt đầu nghiên cứu mà không cần chuẩn bị trước file PDF.

### 3.6. Phòng Phản Biện Luận Án Ảo (Thesis Defense Studio)
*   Mô phỏng phiên bảo vệ trước hội đồng khoa học. AI đóng vai Giáo sư phản biện đặt các câu hỏi học thuật hóc búa xoay quanh đề tài nghiên cứu.
*   Hệ thống chấm điểm câu trả lời của học viên qua hai pha **Evaluator (chấm lỗ hổng gaps)** và **Planner (lập kế hoạch hỏi tiếp/dừng)**.
*   Cập nhật hồ sơ năng lực học viên (`vietai-user-competency-profile`) để theo dõi sự tiến bộ và hiển thị trực quan dưới dạng Đồ thị Kiến thức (Knowledge Graph 2D).

---

## 4. Liên Kết Tài Liệu Kỹ Thuật

*   [Mục lục chính tài liệu](./index.md)
*   [Kiến trúc hệ thống Backend](./architecture-be.md)
*   [Kiến trúc hệ thống Frontend](./architecture-fe.md)
*   [Hợp đồng chi tiết các API](./api-contracts-be.md)
*   [Thiết kế Mô hình Dữ liệu](./data-models-be.md)
*   [Sơ đồ cấu trúc cây mã nguồn](./source-tree-analysis.md)
*   [Hướng dẫn triển khai hệ thống](./deployment-guide.md)
*   [Hướng dẫn phát triển nội bộ](./development-guide.md)
