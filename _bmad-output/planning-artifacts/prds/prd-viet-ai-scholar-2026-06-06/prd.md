---
title: VietAI Scholar PRD
status: final
created: 2026-06-06
updated: 2026-06-06
---

# Product Requirements Document (PRD) — VietAI Scholar (Luminary)

## 0. Document Purpose
Tài liệu này định nghĩa các yêu cầu sản phẩm cho **VietAI Scholar** (tên thương mại: **Luminary**), nền tảng dịch thuật và phân tích tài liệu học thuật PDF từ tiếng Anh sang tiếng Việt. 
Tài liệu tập trung chi tiết vào việc hoàn thiện **Phase 1 (Core Pipeline & LaTeX rendering)** và **Phase 2 (Auth & Session)** nhằm chuẩn bị cho bản phát hành rộng rãi đầu tiên (**Public Launch / Production**). 

---

## 1. Vision
**VietAI Scholar** hướng đến việc phá bỏ rào cản ngôn ngữ và kỹ thuật đối với học sinh, sinh viên, nghiên cứu sinh và các học giả Việt Nam khi tiếp cận các công bố khoa học quốc tế. 
Bằng cách kết hợp sức mạnh của hệ thống dịch thuật đa tác nhân (Multi-agent AI) và khả năng xử lý công thức toán học chuyên sâu, nền tảng giúp chuyển đổi các bài báo học thuật tiếng Anh phức tạp thành tài liệu song ngữ tiếng Việt dễ hiểu nhất, đồng thời giữ nguyên cấu trúc toán học LaTeX chuẩn xác để người dùng đối chiếu, nghiên cứu và học tập hiệu quả.

---

## 2. Target User

### 2.1 Jobs To Be Done (JTBD)
- **Nhu cầu chức năng:** Dịch nhanh các bài báo nghiên cứu khoa học tiếng Anh sang tiếng Việt với độ chính xác cao về thuật ngữ chuyên ngành và công thức toán học.
- **Nhu cầu so sánh:** Xem bản gốc tiếng Anh và bản dịch tiếng Việt song song cùng lúc để kiểm chứng ý nghĩa chính xác của bài viết.
- **Nhu cầu tiện ích:** Sao chép nhanh công thức toán học dạng LaTeX để dán vào tài liệu nghiên cứu cá nhân.
- **Nhu cầu lưu trữ:** Lưu trữ các tài liệu đã dịch vào thư viện cá nhân để dễ dàng tìm kiếm và xem lại sau này mà không cần tải lại file gốc.

### 2.2 Non-Users (v1)
- Người dùng chỉ có nhu cầu dịch thuật văn bản phổ thông (không chứa công thức toán hoặc thuật ngữ học thuật phức tạp).
- Người dùng muốn dịch sách dài hàng trăm trang (v1 giới hạn kích thước file tối đa 50MB).

### 2.3 Key User Journeys

#### UJ-1. Nam dịch thử tài liệu học thuật và sao chép công thức LaTeX (Chưa đăng nhập)
- **Persona + context:** Nam là học viên cao học cần dịch nhanh một tài liệu PDF toán học để phục vụ bài nghiên cứu tuần này. Cậu ấy là người dùng mới truy cập trang web lần đầu.
- **Entry state:** Chưa đăng nhập (Guest), ở trang chủ ứng dụng.
- **Path:** 
  1. Nam kéo thả file PDF nặng 15MB vào vùng upload.
  2. Hệ thống nhận diện file và hiển thị thanh tiến trình xử lý (Extracting -> Translating -> Merging).
  3. Sau khi xử lý xong, hệ thống hiển thị giao diện **Bản dịch song song (Bilingual Side-by-Side)**: tiếng Anh ở bên trái và tiếng Việt ở bên phải.
  4. Nam rê chuột vào một công thức toán học phức tạp ở bản dịch tiếng Việt, hệ thống hiển thị nút "Copy LaTeX". Nam nhấn nút để sao chép mã nguồn LaTeX.
- **Climax:** Nam hiểu rõ nội dung nghiên cứu nhờ bản dịch tiếng Việt chính xác và dán được công thức LaTeX chuẩn `$f(x) = \sigma(W^T x + b)$` vào báo cáo của mình.
- **Resolution:** Nam bấm nút "Tải xuống" bản dịch định dạng Markdown/PDF. Hệ thống hiển thị hộp thoại yêu cầu đăng nhập/đăng ký.
- **Edge cases:** 
  - *File > 30MB nhưng ≤ 50MB:* Hệ thống hiển thị thông báo cảnh báo: *"Tài liệu của bạn vượt quá 30MB, thời gian xử lý sẽ lâu hơn bình thường. Vui lòng không đóng trình duyệt."*
  - *File > 50MB:* Hệ thống từ chối nhận file ngay từ bước upload và báo lỗi: *"Kích thước file tối đa được hỗ trợ là 50MB."*

#### UJ-2. Nam quản lý thư viện cá nhân và xem lại bản dịch cũ (Đã đăng nhập)
- **Persona + context:** Nam đã đăng ký tài khoản qua Google và muốn quản lý các bài báo cũ đã dịch để xem lại.
- **Entry state:** Đã đăng nhập, đang ở giao diện **Thư viện cá nhân**.
- **Path:**
  1. Nam xem danh sách các bài báo mình đã dịch được sắp xếp trực quan.
  2. Nam sử dụng bộ lọc thời gian (Date Filter) để tìm các bài báo đã xử lý từ tuần trước.
  3. Nam bấm vào bài báo cần đọc.
  4. Hệ thống tải trực tiếp và hiển thị ngay kết quả bản dịch đã lưu từ S3. Nếu Nam muốn làm mới bản dịch, cậu ấy có thể bấm nút "Dịch lại / Cập nhật bản dịch".
- **Climax:** Nam mở lại được tài liệu mong muốn ngay lập tức và đối chiếu bản dịch song ngữ side-by-side.
- **Resolution:** Nam tiếp tục đọc và đối chiếu bản dịch, hoặc thực hiện tải xuống kết quả mà không gặp rào cản đăng nhập.

---

## 3. Glossary
- **Bản dịch song song (Bilingual Side-by-Side View)** — Giao diện hiển thị đồng thời văn bản tiếng Anh gốc ở một cột (bên trái) và bản dịch tiếng Việt ở cột còn lại (bên phải), giúp người dùng dễ dàng đối chiếu.
- **Thư viện cá nhân (Personal Library)** — Không gian lưu trữ danh sách các tài liệu đã được người dùng upload và dịch thành công, gắn liền với tài khoản của người dùng.
- **Bản dịch dùng thử (Trial Translation)** — Quyền dịch thử tối đa 1 file PDF miễn phí cho người dùng chưa đăng nhập tài khoản.
- **Công thức LaTeX (LaTeX Formula)** — Các ký hiệu toán học được chuẩn hóa sang cú pháp LaTeX chuẩn và được render hiển thị đẹp đẽ thông qua thư viện render LaTeX (KaTeX/MathJax).
- **Bộ lọc thời gian (Date Filter)** — Công cụ lọc tìm kiếm tài liệu trong Thư viện cá nhân dựa trên khoảng thời gian upload (ngày, tuần, tháng).
- **Trình điều phối (Orchestrator)** — Thành phần backend (Lambda supervisor) nhận file PDF, chia nhỏ và phân phối cho các agent AI dịch thuật, xử lý LaTeX và gộp kết quả.

---

## 4. Features

### 4.1 Guest Trial Translation (Dịch dùng thử không cần tài khoản)
**Description:** Cho phép người dùng trải nghiệm ngay sức mạnh dịch thuật của hệ thống mà không cần đăng ký tài khoản trước. Giới hạn nghiêm ngặt ở mức 1 lần dịch thử.
- Realizes: UJ-1

**Functional Requirements:**
- **FR-1 (Trial Limit):** Hệ thống lưu trữ session/cookie của khách truy cập để giới hạn tối đa 1 lượt dịch thử. Nếu vượt quá, nút upload sẽ bị khóa và hiển thị yêu cầu đăng nhập.
  - *Consequences:* Nếu cookie hoặc session ID đã tồn tại lịch sử dịch thử, hệ thống chặn tạo presigned URL và trả về lỗi HTTP 403.
- **FR-2 (Bilingual Side-by-Side Layout):** Giao diện hiển thị hai cột song song (English trái, Tiếng Việt phải) trên màn hình desktop. Trên mobile, tự động chuyển sang dạng Tab switcher (EN / VI).
- **FR-3 (LaTeX Rendering & Copy):** Tất cả các công thức toán học (định dạng `$ ... $` hoặc `$$ ... $$`) phải được render hiển thị đúng chuẩn toán học trực quan (dùng KaTeX hoặc MathJax). Khi di chuột vào công thức, xuất hiện icon Copy cho phép copy mã nguồn LaTeX dạng plain text vào clipboard.
  - *Consequences:* Click vào icon copy sẽ sao chép chính xác đoạn text LaTeX (ví dụ: `\sum_{i=1}^n x_i`) không bao gồm các ký tự bọc ngoài như `$`.

### 4.2 Auth & Session Management (Đăng nhập và quản lý phiên)
**Description:** Hệ thống định danh người dùng qua các phương thức đăng nhập phổ biến để mở khóa các tính năng nâng cao (Tải file, lưu thư viện).
- Realizes: UJ-1, UJ-2

**Functional Requirements:**
- **FR-4 (NextAuth Integration):** Người dùng đăng nhập thông qua NextAuth (hỗ trợ Google Login và Email OTP/Passwordless).
- **FR-5 (Download Login Wall):** Nút tải xuống (Download) kết quả (Markdown/PDF) sẽ yêu cầu đăng nhập. Khách chưa đăng nhập bấm vào nút này sẽ kích hoạt popup đăng nhập.
  - *Consequences:* Sau khi đăng nhập thành công từ popup này, hệ thống phải tự động thực hiện tải xuống ngay lập tức mà không bắt người dùng bấm lại.

### 4.3 Personal Library & Re-processing (Thư viện cá nhân và xử lý lại)
**Description:** Không gian lưu trữ bài báo cá nhân giúp quản lý và xem lại lịch sử nghiên cứu.
- Realizes: UJ-2

**Functional Requirements:**
- **FR-6 (Library List & Date Filter):** Giao diện Dashboard hiển thị danh sách các bài báo đã dịch dưới dạng Grid/List card, có bộ lọc lọc theo ngày/tuần/tháng gần nhất.
- **FR-7 (S3 Cache Loading & Re-process Button):** Khi người dùng mở lại một bài báo từ thư viện, hệ thống phải tải ngay kết quả từ S3 results bucket. Hiển thị thêm nút "Dịch lại" (Re-translate) trên giao diện kết quả.
  - *Consequences:* 
    - Việc mở lại bài viết cũ phải hoàn thành trong < 1.5 giây (tải trực tiếp file Markdown từ S3).
    - Khi người dùng click nút "Dịch lại", hệ thống mới kích hoạt lại pipeline dịch thuật của AWS Step Functions.


### 4.4 File Upload & Validation Guardrails (Kiểm soát file upload)
**Description:** Bảo vệ hệ thống khỏi các file quá tải hoặc định dạng không hợp lệ ở cấp độ Client và Server.
- Realizes: UJ-1

**Functional Requirements:**
- **FR-8 (File Size Validation & Upload Error Handling):** 
  - File ≤ 30MB: Upload và xử lý bình thường.
  - 30MB < File ≤ 50MB: Cho phép xử lý nhưng hiển thị cảnh báo thời gian chờ lâu.
  - File > 50MB: Chặn upload ngay lập tức ở giao diện Drag-drop và trả về mã lỗi 400 nếu gửi qua API.
  - *Consequences:* 
    - Nếu xảy ra lỗi mạng trong quá trình upload (mất kết nối đột ngột), hệ thống hiển thị thông báo lỗi: *"Kết nối mạng bị gián đoạn. Vui lòng thử lại"* kèm nút "Thử lại" để upload lại file hiện tại mà không cần reload trang.
    - Thời gian timeout tối đa cho yêu cầu upload presigned URL là 5 phút. Nếu vượt quá, client hủy upload và báo lỗi timeout.

### 4.5 Advanced Learning Tools & Sharing (Công cụ học tập & Chia sẻ)
**Description:** Hỗ trợ tính năng cộng tác, chia sẻ tài nguyên ôn tập học thuật.

**Functional Requirements:**
- **FR-19 (Quiz Sharing):** Cho phép người dùng tạo liên kết chia sẻ công khai cho một bài trắc nghiệm (Quiz). Người nhận liên kết có thể làm bài trắc nghiệm trực tiếp mà không cần đăng nhập hay truy cập vào tài liệu gốc.

### 4.6 Autonomous Research Studio (Explore Mode 2.0)
**Description:** Chuyển đổi chế độ Khám Phá thành một môi trường trợ lý nghiên cứu khoa học chuyên sâu toàn diện, tự động tìm kiếm đề tài từ đa nguồn, thiết lập lộ trình học tập phân cấp và hướng dẫn ghi chép nhật ký nghiên cứu tích hợp.
- Realizes: UJ-3

**Functional Requirements:**
- **FR-20 (Multi-Source Discovery Engine):** Tự động truy vấn và tổng hợp từ các nguồn học thuật uy tín (Arxiv, Semantic Scholar, GitHub Trends, Medical News) để đưa ra 3 nhóm gợi ý đề tài nghiên cứu: *Hot Trends*, *Niche Gaps*, và *Cross-domain*.
- **FR-21 (Guided Research Roadmap):** Tự động thiết lập Lộ trình nghiên cứu 4 chặng phân cấp (*Foundations -> Landmark Papers -> Modern SOTA -> Open Challenges*) kèm theo thanh đo phần trăm tiến trình hoàn thành.
- **FR-22 (Integrated Research Journal & Lab Notebook):** Cung cấp giao diện Research Studio 3 cột tích hợp khung sổ tay ghi chép cá nhân. Hỗ trợ tự động trích dẫn nguồn (Auto-Citations), gợi ý câu hỏi nhật ký hàng ngày (Daily Log Prompts), và đồng bộ/xuất toàn bộ bộ dữ liệu dưới dạng file nén `.zip` chứa các file Markdown chuẩn Obsidian Vault.

---


## 5. Non-Goals (Explicit)
- **Không hỗ trợ dịch thuật ngoại tuyến (Offline translation):** Hệ thống bắt buộc phải có kết nối mạng ổn định để gọi API các AI providers.
- **Không dịch tự động toàn bộ thư viện:** Chỉ thực hiện dịch khi người dùng chủ động upload hoặc bấm mở lại bài báo.
- **Không lưu trữ file PDF gốc vô thời hạn:** File PDF gốc tải lên S3 Uploads bucket sẽ bị tự động xóa sau 90 ngày bằng Lifecycle Rule để tiết kiệm dung lượng lưu trữ.

---

## 6. MVP Scope

### 6.1 In Scope
- Core pipeline: Dịch thuật tài liệu PDF tiếng Anh chuyên ngành có công thức toán sang Tiếng Việt song ngữ.
- Sửa lỗi hiển thị LaTeX thô trên giao diện web (tích hợp KaTeX/MathJax).
- Tính năng sao chép công thức LaTeX từ bản dịch.
- Đăng nhập qua Google / Email sử dụng NextAuth.
- Giới hạn dịch thử 1 lần cho khách vãng lai.
- Chặn tải file bản dịch đối với khách vãng lai (yêu cầu đăng nhập).
- Thư viện lưu trữ lịch sử các tài liệu đã dịch kèm bộ lọc thời gian.
- Tải ngay kết quả từ S3 cache khi mở tài liệu cũ, hỗ trợ nút "Dịch lại" thủ công.
- Kiểm soát kích thước file (Cảnh báo > 30MB, Chặn > 50MB).

### 6.2 Out of Scope for MVP
- Phase 3: pgvector và RAG Infrastructure (sẽ cập nhật ở v1.1).
- Phase 4-5: AI Tutor, Tạo Quiz & Flashcards.
- Phase 6: Dịch nhiều file cùng lúc (Multi-PDF) và tạo Collections.
- Phase 8: Thanh toán và gói Subscription (mọi tính năng trong MVP đều miễn phí hoặc giới hạn số lượt).

---

## 7. Success Metrics
- **SM-1 (Độ chính xác LaTeX):** 98% công thức toán học được hiển thị chính xác (không lỗi font, không vỡ layout) thông qua công cụ render trên UI. (Validates: FR-3)
- **SM-2 (Tỷ lệ chuyển đổi đăng ký):** Ít nhất 40% người dùng dịch thử 1 lần thực hiện đăng ký tài khoản để tải file dịch xuống. (Validates: FR-1, FR-5)
- **SM-C1 (Độ trễ Pipeline - Counter-metric):** Việc chạy lại pipeline khi mở lại tài liệu cũ không được làm tăng thời gian phản hồi trung bình của hệ thống quá 25% so với lần chạy đầu tiên.

---

## 8. Open Questions
*Không có câu hỏi mở nào chưa giải quyết tại thời điểm này. Các quyết định kiến trúc chính về Caching và Authentication đã được chốt và đưa vào bản yêu cầu chính thức.*

---

## 9. Assumptions Index
*Tất cả các giả định ban đầu về thiết kế đã được làm rõ thông qua thảo luận và không còn giả định nào chưa được xác nhận.*
