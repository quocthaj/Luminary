---
name: vietai-side-by-side
description: Hiển thị kết quả dịch song ngữ từ file Markdown, render LaTeX bằng KaTeX, bảng Markdown, kèm disclaimer học thuật.
triggers:
  - "hiển thị kết quả dịch"
  - "side-by-side"
  - "song ngữ"
  - "latex"
  - "công thức toán"
---

# Cách hiển thị kết quả dịch từ backend VietAI

Backend trả về file `.md` có cấu trúc:
English
Nội dung gốc...

Vietnamese
Nội dung dịch...


Các bước thực hiện trong React:

1. Fetch file .md từ `downloadUrl` (getResultUrl).
2. Tách nội dung bằng regex `/## English\n([\s\S]*?)\n## Vietnamese\n([\s\S]*)/`.
3. Render 2 cột với `react-markdown` + `remark-math` + `rehype-katex`.
4. Thêm banner disclaimer cố định ở footer.
5. Đảm bảo citations `[1]`, `[Author, Year]` được giữ nguyên (backend đã làm).

Tham khảo file `references/katex-setup.md` để cài đặt.