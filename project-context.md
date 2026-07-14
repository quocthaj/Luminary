# Project Context & Rules for AI Agents

Welcome to the **Luminary Scholar** workspace. This file establishes the persistent rules and context that all AI assistants (including Antigravity, Claude, and BMad agents) must follow when editing this codebase.

## 🚨 Critical Development Rules

1. **Keep Codebase Clean:**
   - Do not output compiled `.js` or `.d.ts` files inside the source folders (`be/lambda/`, `be/lib/`, `be/bin/`).
   - All TypeScript compilation must write to the `dist/` directory.

2. **Always Run Tests & Build Verification:**
   - Verify changes by running `npm run build` and existing test suites on both frontend and backend before completing a task.

## 📝 Automatic Task Completion Reporting Rule

Whenever you complete a Story, Epic task, or major codebase modification:
1. **You must automatically log the progress** by appending a new report to the bottom of `.report/luminary-report/SKILL.md` under the `## Reports History` section.
2. The log entry must follow the established structure:
   - **Header:** `### ✅ Story [ID]: [Name]`
   - **Metadata:** Status (`Done`), Estimated Time, Date.
   - **Đã làm:** Bullet points detailing what you changed/added.
   - **Kết quả kiểm thử:** Test suites executed and their outcomes.
   - **Files thay đổi:** Files created or modified.
   - **Build status:** Build and typescript check statuses.

## 📅 Quy trình Quản lý Obsidian & Nhật ký Session (Obsidian & Session Workflow)

Mỗi khi bắt đầu một phiên phát triển (dev session), tất cả các Agent/Developer phải tuân thủ quy trình sau:
1. **Mở file Dashboard trước:** Đầu tiên phải mở file `00-Workspace-Dashboard.md` (hoặc `00-Dashboard.md`) trong Obsidian Vault của dự án.
2. **Sao chép Session mới:** Sao chép/Cập nhật thông tin session mới nhất từ nhật ký phiên hoặc checklist hiện tại.
3. **Ghi chép quyết định nhỏ:** Ghi lại các quyết định kỹ thuật nhỏ phát sinh trong ngày trực tiếp vào file dashboard này.
4. **Viết ADR (Architectural Decision Record):** Chỉ viết file ADR riêng khi quyết định đó đủ quan trọng (ảnh hưởng lớn đến cấu trúc hệ thống, cơ sở dữ liệu, hoặc bảo mật) hoặc khi bạn lo lắng sau này sẽ quên lý do đưa ra quyết định đó.

