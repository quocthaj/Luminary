# Hướng dẫn cài đặt KaTeX để render công thức LaTeX trong Next.js (App Router)

## 1. Cài đặt các gói cần thiết

```bash
npm install react-markdown remark-math rehype-katex katex
2. Import CSS của KaTeX trong component
Trong component sử dụng ReactMarkdown (ví dụ SideBySideViewer.tsx hoặc ResultView.tsx), thêm dòng:

tsx
import 'katex/dist/katex.min.css';
3. Cấu hình ReactMarkdown với plugins
tsx
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

<ReactMarkdown
  remarkPlugins={[remarkMath]}
  rehypePlugins={[rehypeKatex]}
>
  {content}
</ReactMarkdown>
4. Xử lý lỗi next/font hoặc CSS-in-JS (nếu có)
Nếu gặp lỗi về font, bạn có thể override CSS của KaTeX trong globals.css:

css
.katex { font-size: 1.1em; }
.katex-display { overflow-x: auto; overflow-y: hidden; }
5. Kiểm tra
Viết thử nội dung Markdown có chứa:

markdown
Công thức nổi tiếng: $$E = mc^2$$

Hoặc inline: $x^2 + y^2 = z^2$
Nếu hiển thị đẹp, không bị lỗi plain text → thành công.