# Addendum — Luminary Scholar / Luminary

Tài liệu này lưu trữ các quyết định kỹ thuật, phương án cân nhắc và nội dung chuyên sâu nằm ngoài phạm vi cốt lõi của PRD v1.

## Các Quyết Định Thiết Kế & Lựa Chọn Công Nghệ

### 1. Hiển thị công thức LaTeX trên Frontend
- **Vấn đề:** Trích xuất công thức từ PDF và dịch thuật thường làm hỏng định dạng toán học.
- **Giải pháp:** Sử dụng hệ thống placeholder `{{formula_X}}` để bảo vệ công thức trong quá trình dịch. LaTeX Agent sẽ chuẩn hóa công thức sang dạng LaTeX chuẩn (`$...$` hoặc `$$...$$`).
- **Frontend Rendering:** Cần tích hợp thư viện hiển thị LaTeX chuyên dụng (như KaTeX hoặc MathJax) vào component `ResultView.tsx` của Next.js để render công thức mượt mà, tránh tình trạng hiển thị thô dạng text.

### 2. Tìm kiếm và đề xuất "Papers liên quan" (Phase 6)
- **Tùy chọn cân nhắc:**
  1. **Internal (Similarity-based):** Sử dụng RAG và so sánh độ tương đồng vector (`pgvector` trên RDS) trong tập hợp tài liệu hiện có của user. Ưu điểm: Tốc độ nhanh, không tốn chi phí API ngoài.
  2. **External API (Internet search):**
     - *Semantic Scholar API:* Lựa chọn tối ưu nhất cho học thuật, cung cấp API miễn phí và chất lượng dữ liệu tốt.
     - *OpenAlex:* API mở hoàn toàn, không giới hạn, rất tốt cho việc xây dựng citation network.
     - *CrossRef:* Tốt cho việc tra cứu thông tin DOI và trích dẫn.
     - *Google Scholar:* Tránh sử dụng do không có API chính thức, cào dữ liệu (scraping) vi phạm Điều khoản dịch vụ (ToS).
- **Quyết định đề xuất:** Kết hợp cả hai. Phiên bản đầu tiên dùng Semantic Scholar/OpenAlex cho dữ liệu ngoài và pgvector cho dữ liệu trong bộ sưu tập (Collection) của người dùng.

---

## Tầm Nhìn Phát Triển Tương Lai (v2 Roadmap)

Dựa trên thảo luận định hướng sản phẩm, Luminary sẽ tập trung phát triển hai tính năng cốt lõi đột phá để cạnh tranh vượt trội với Google NotebookLM và các công cụ học thuật khác:

### 1. Giả lập hội đồng bảo vệ khóa luận (AI Thesis Defense Jury)
- **Mục tiêu:** Giúp học sinh, sinh viên và nghiên cứu sinh chuẩn bị tốt nhất cho buổi bảo vệ luận văn hoặc báo cáo khoa học.
- **Tính năng chi tiết:**
  - Thiết lập phòng họp ảo với 3 giám khảo AI (Jury members) mang các vai trò khác nhau: Người phản biện phương pháp luận (Methodology Critic), Người thẩm định chi tiết kỹ thuật/công thức (Technical Expert), và Người đánh giá tính thực tiễn (Practical Evaluator).
  - Hỗ trợ giao tiếp bằng giọng nói hai chiều (Voice-to-Voice) hoặc chat.
  - AI chấm điểm mức độ thuyết phục, chỉ ra các lỗ hổng lập luận và gợi ý cách trả lời/phản biện tối ưu hơn cho từng câu hỏi.

### 2. Bản đồ tri thức tự động (Auto-generated Knowledge Graph)
- **Mục tiêu:** Giúp người dùng nắm bắt bức tranh toàn cảnh và sự liên kết giữa các tài liệu trong bộ sưu tập cá nhân.
- **Tính năng chi tiết:**
  - AI quét toàn bộ các tài liệu đã dịch trong thư viện cá nhân để trích xuất các thực thể tri thức (khái niệm, thuật ngữ, phương pháp nghiên cứu).
  - Xây dựng sơ đồ mạng lưới (Knowledge Graph) trực quan, cho phép người dùng click vào các node khái niệm để xem các bài báo liên quan và mối quan hệ kế thừa/phản bác giữa các nghiên cứu.
  - Tích hợp điều hướng nhanh từ node tri thức đến các đoạn văn bản chứa khái niệm đó trong trình đọc song ngữ.

