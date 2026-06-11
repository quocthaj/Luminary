# Project Context & Rules for AI Agents

Welcome to the **VietAI Scholar** workspace. This file establishes the persistent rules and context that all AI assistants (including Antigravity, Claude, and BMad agents) must follow when editing this codebase.

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
