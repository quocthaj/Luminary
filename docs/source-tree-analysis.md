# Phân Tích Cây Mã Nguồn — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Cấu Trúc Thư Mục Tổng Quan

```
viet-ai-scholar/
├── be/                          # ⚡ Backend — AWS CDK + Lambda
│   ├── bin/
│   │   └── be.ts                # 🔵 CDK app entry point
│   ├── lib/
│   │   └── be-stack.ts          # 🔵 Định nghĩa toàn bộ hạ tầng AWS (495 LOC)
│   ├── lambda/
│   │   ├── index.ts             # 🔵 Main Lambda handler — routing + S3 trigger
│   │   ├── supervisor.ts        # 🔵 Supervisor — điều phối agents (Direct + SFN mode)
│   │   ├── types.ts             # 📋 Shared TypeScript interfaces
│   │   ├── agents/
│   │   │   ├── translator.ts    # 🌐 Dịch EN→VI (Mistral→Groq→Gemini fallback)
│   │   │   ├── latex.ts         # 📐 Chuẩn hóa LaTeX (Groq→Gemini fallback)
│   │   │   ├── diagram.ts       # 📊 Mô tả hình/biểu đồ (Groq→Gemini fallback)
│   │   │   ├── citation.ts      # 📚 Phân loại trích dẫn (pure regex, no AI)
│   │   │   └── merge.ts         # 🤝 Gộp kết quả → Markdown song ngữ cuối cùng
│   │   ├── handlers/            # Step Functions worker handlers
│   │   │   ├── extract.ts       # SFN: Extract text + chunk + save to S3
│   │   │   ├── translate.ts     # SFN: Translate single chunk
│   │   │   ├── latex.ts         # SFN: Process LaTeX formulas
│   │   │   └── merge.ts         # SFN: Merge all results → final Markdown
│   │   └── utils/
│   │       ├── ai-providers.ts  # 🤖 Multi-AI client (Mistral, Groq, DeepSeek, Gemini)
│   │       ├── aws-clients.ts   # ☁️  Singleton AWS SDK clients + env vars
│   │       ├── dynamodb-helpers.ts # 📋 DynamoDB CRUD helpers
│   │       ├── placeholder.ts   # 🔍 Regex extraction: formulas, figures, citations
│   │       ├── prompt-builder.ts # 📝 Prompt templates + chunking logic (203 LOC)
│   │       ├── response.ts      # 📨 HTTP response helper
│   │       ├── s3-helpers.ts    # 💾 S3 read/write helpers
│   │       └── text-extraction.ts # 📄 PDF→Text (pdfjs-dist + Textract fallback, 225 LOC)
│   ├── test/
│   │   └── be.test.ts           # Jest test
│   ├── cdk.json                 # CDK config + feature flags
│   ├── cdk.out/                 # CDK synthesized output (CloudFormation templates)
│   ├── package.json             # Backend dependencies
│   └── tsconfig.json            # TypeScript config (ES2022, NodeNext)
│
├── fe/                          # 🎨 Frontend — Next.js 16 + React 19
│   ├── app/
│   │   ├── layout.tsx           # Root layout (fonts, ThemeToggle, metadata)
│   │   ├── page.tsx             # 🔵 Main page — state machine: upload→processing→result
│   │   ├── globals.css          # 🎨 Design system (CSS vars, animations, markdown preview)
│   │   └── api/
│   │       └── preview/[jobId]/
│   │           └── route.ts     # API route: proxy S3 download for preview
│   ├── components/
│   │   ├── UploadView.tsx       # 📤 Drag-drop upload + presigned URL flow
│   │   ├── ProcessingView.tsx   # ⏳ Polling + pipeline stepper animation
│   │   ├── ResultView.tsx       # 📋 Bilingual preview + download + copy
│   │   └── ThemeToggle.tsx      # 🌓 Dark/light theme toggle
│   ├── lib/
│   │   └── api.ts               # 📡 API client (fetch wrapper cho backend endpoints)
│   ├── public/                  # Static assets (SVG icons)
│   ├── vercel.json              # Vercel deployment config
│   ├── package.json             # Frontend dependencies
│   └── tsconfig.json            # TypeScript config
│
├── _bmad/                       # BMad Method configuration
├── _bmad-output/                # BMad workflow output artifacts
├── docs/                        # 📚 Tài liệu dự án (thư mục này)
├── design-artifacts/            # WDS design artifacts (placeholder)
└── package.json                 # Root package.json
```

## Thư Mục Quan Trọng

| Thư mục | Mục đích | Số file nguồn |
|---------|----------|---------------|
| `be/lib/` | Định nghĩa hạ tầng AWS CDK | 1 (be-stack.ts — 495 LOC) |
| `be/lambda/` | Core business logic | 3 (index, supervisor, types) |
| `be/lambda/agents/` | Multi-agent pipeline | 5 agents |
| `be/lambda/handlers/` | Step Functions workers | 4 handlers |
| `be/lambda/utils/` | Shared utilities | 8 utility modules |
| `fe/app/` | Next.js App Router pages | 3 files |
| `fe/components/` | React UI components | 4 components |
| `fe/lib/` | Frontend utilities | 1 (API client) |

## Entry Points

| Entry Point | File | Mục đích |
|-------------|------|----------|
| CDK App | `be/bin/be.ts` | Khởi tạo CDK app, tạo `VietAIScholarStack` |
| Lambda Main | `be/lambda/index.ts` | Handler chính: routing API + S3 trigger |
| Supervisor | `be/lambda/supervisor.ts` | Điều phối agents (export `supervisorHandler`) |
| Frontend | `fe/app/page.tsx` | Main page (state machine UI) |
| API Client | `fe/lib/api.ts` | Frontend→Backend communication |
