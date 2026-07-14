# Kiến Trúc Frontend — Luminary Scholar

> Tài liệu mô tả chi tiết tech stack, phân bổ định tuyến (routing), kiến trúc thành phần (components) và hệ thống thiết kế (Design System) của phần Frontend (Next.js 16 + React 19).  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Tổng Quan Kỹ Thuật

Phần Frontend của Luminary Scholar được xây dựng trên framework **Next.js 16 (App Router)** và **React 19**, mang lại hiệu suất render tối ưu kết hợp giữa Server-side Rendering (SSR) và Client-side Hydration. Toàn bộ phần giao diện được lập trình bằng ngôn ngữ TypeScript và định hình phong cách qua **TailwindCSS v4**.

---

## 2. Công Nghệ & Định Cấu Hình (Tech Stack)

| Công nghệ | Phiên bản | Vai trò |
| :--- | :--- | :--- |
| **Next.js** | `16.2.7` | Framework ứng dụng chính (App Router) |
| **React** | `19.2.4` | Thư viện giao diện chính |
| **TailwindCSS** | `v4` | Hệ thống CSS utility tiện ích |
| **TypeScript** | `v5.x` | Ràng buộc kiểu dữ liệu tĩnh |
| **Next-Auth** | `^5.0.0-beta` | Quản lý phiên đăng nhập và bảo mật các trang |
| **Mermaid** | `^11.15.0` | Tạo sơ đồ tư duy dạng mã đồ thị tự động |
| **KaTeX** | `^0.17.0` | Hiển thị chính xác công thức toán học LaTeX |
| **DOMPurify** | `^3.4.11` | Lọc mã HTML độc hại khi render nội dung Markdown |
| **React Force Graph**| `^1.29.1` | Vẽ đồ thị Knowledge Graph động |

---

## 3. Hệ Thống Định Tuyến (Routing Structure)

Next.js App Router quản lý việc định tuyến các trang trong thư mục `fe/app/`:

*   `layout.tsx`: Định nghĩa bố cục gốc, nạp phông chữ, thiết lập Theme Provider và thanh điều hướng chung.
*   `page.tsx`: Trang chủ giới thiệu (Landing View) hoặc Trang điều khiển chính (Dashboard) để tải lên tệp PDF.
*   `library/page.tsx`: Thư viện tài liệu học tập của cá nhân học viên, cho phép xem lại các bài báo cũ, khởi động làm bài trắc nghiệm, thẻ ghi nhớ, hoặc bắt đầu phòng phản biện luận án ảo.
*   `explore/page.tsx`: Chế độ tìm hiểu và khám phá chủ đề tự do (Explore Mode), sinh bản đồ tri thức (Topic Map).
*   `explore/[jobId]/page.tsx`: Xem tiến trình và kết quả tải nạp chủ đề khám phá.
*   `explore/studio/[sessionId]/page.tsx`: 🏛️ **Thesis Defense Studio** — Giao diện làm việc 3 cột chuyên nghiệp:
    *   *Cột 1:* Khung chat đối thoại trực tiếp với AI Giáo sư phản biện.
    *   *Cột 2:* Khu vực ghi chú (Notepad) học tập của học viên.
    *   *Cột 3:* Bảng gợi ý nhiệm vụ nghiên cứu (Research Copilot) và đồ thị Knowledge Graph về năng lực học tập hiện tại.
*   `synthesis/page.tsx`: Trình tổng hợp nghiên cứu liên bài báo (Cross-Paper Synthesis), cho phép chọn nhiều tệp và thảo luận RAG chéo.
*   `share/page.tsx`: Giao diện làm bài trắc nghiệm công khai dành cho khách mời (được chia sẻ link từ học viên), tích hợp các cơ chế chống Spam EDoS.
*   `api/preview/[jobId]/route.ts`: Điểm cuối API trung gian Next.js để tải nội dung Markdown đã dịch từ S3 về Client nhằm phòng tránh lỗi chặn CORS của trình duyệt.

---

## 4. Hệ Thống Thiết Kế (Design System)

Hệ thống kế thừa cấu trúc chỉ dẫn thiết kế thương hiệu từ `DESIGN.md` để mang lại trải nghiệm ấm áp, mang tính xuất bản học thuật (Warm Editorial):

### 4.1. Bảng màu thương hiệu (Brand Palette)
*   **Warm Canvas** (`#faf9f5`): Nền giấy ấm áp chủ đạo, mang lại cảm giác thoải mái khi đọc nghiên cứu dài.
*   **Coral Primary** (`#cc785c`): Sắc cam san hô làm điểm nhấn thương hiệu (nút kêu gọi hành động CTA, thẻ liên kết chính).
*   **Ink Text** (`#141413`): Màu chữ đen ấm ngả xám đậm, nâng cao độ tương phản đọc.
*   **Surface Dark** (`#181715`): Nền tối thanh lịch áp dụng cho các khối mã nguồn (Code-window cards), trình phát audio podcast, và chân trang (footer).

### 4.2. Kiểu chữ (Typography)
*   **Display Font (Headings):** Sử dụng phông chữ Slab-Serif *Copernicus* (hoặc *Cormorant Garamond* / *EB Garamond* làm phông thay thế mở rộng) ở mức độ Regular (weight 400) kết hợp với khoảng cách chữ hẹp (negative tracking) mang phong thái tạp chí khoa học chuyên nghiệp.
*   **Body Font:** Phông chữ Sans-serif nhân văn *StyreneB* (hoặc phông *Inter* thay thế) giúp đọc thông tin văn bản mượt mà trên màn hình.

---

## 5. Kiến Trúc Thành Phần Giao Diện (Components Architecture)

Frontend phân tách logic hiển thị qua 13 thành phần React chính tại `fe/components/`:

1.  **`LandingView`**: Hiển thị trang giới thiệu dịch vụ và các ưu thế của Luminary Scholar.
2.  **`LoginModal`**: Hộp thoại đăng nhập để lấy thông tin mã xác thực JWT của học viên.
3.  **`UploadView`**: Khung tiếp nhận tệp tin PDF kéo thả, gọi API tạo Presigned URL và thực thi upload trực tiếp lên AWS S3.
4.  **`ProcessingView`**: Hiển thị trạng thái xử lý bất đồng bộ qua Stepper chuyển động tròn.
5.  **`ResultView`**: Hiển thị nhanh kết quả dịch song ngữ sau khi hoàn thành.
6.  **`WorkspaceView`**: Khu vực làm việc chính sau khi bài báo xử lý xong. Chứa giao diện phân táp (Reader song ngữ song song, chat RAG bài báo, và bảng công cụ).
7.  **`QuizModal`**: Khung làm bài trắc nghiệm kiến thức đa lựa chọn, chấm điểm và hiện giải thích chi tiết từ AI.
8.  **`FlashcardModal`**: Trình học tập từ vựng, thuật ngữ bài báo qua thẻ lật ghi nhớ.
9.  **`MindmapModal`**: Render sơ đồ tư duy phân cấp cấu trúc bài báo thông qua thư viện Mermaid.js.
10. **`PodcastPlayer`**: Trình phát âm thanh podcast đối thoại tóm tắt bài báo, tích hợp kéo chỉnh timeline và tốc độ đọc.
11. **`DefenseModal`**: Hộp thoại cấu hình và khởi tạo nhanh một phòng bảo vệ luận án ảo từ bài báo đang xem.
12. **`ObsidianGraphView`**: Vẽ đồ thị Knowledge Graph liên kết các khái niệm tri thức của học viên bằng Canvas 2D (qua thư viện d3-force).
13. **`ThemeToggle`**: Nút chuyển đổi giao diện Dark/Light mode, ghi nhớ trạng thái qua localStorage.
