# Addendum — VietAI Scholar / Luminary

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
