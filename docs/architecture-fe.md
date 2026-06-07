# Kiến Trúc Frontend — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Tóm Tắt

Frontend là ứng dụng Next.js 16 sử dụng App Router, React 19, và TailwindCSS 4. Giao diện đơn trang (SPA-like) với state machine 3 trạng thái: Upload → Processing → Result. Hỗ trợ dark/light theme.

## Tech Stack

| Công nghệ | Phiên bản | Vai trò |
|-----------|-----------|---------|
| Next.js | 16.2.7 | Framework (App Router) |
| React | 19.2.4 | UI library |
| TailwindCSS | ^4 | Utility CSS |
| TypeScript | ^5 | Type safety |
| Fraunces | Google Font | Serif headings (italic) |
| Be Vietnam Pro | Google Font | Body text (Vietnamese-optimized) |

## Design System

### Color Tokens (CSS Custom Properties)

**Dark Mode (mặc định):**
| Token | Giá trị | Mục đích |
|-------|---------|----------|
| `--bg-base` | `#080b12` | Nền chính |
| `--bg-surface` | `#0f1420` | Card/surface |
| `--bg-elevated` | `#161d2e` | Elevated UI |
| `--accent` | `#e8b84b` | Amber/gold accent |
| `--success` | `#4ade80` | Trạng thái thành công |
| `--error` | `#f87171` | Trạng thái lỗi |

**Light Mode (`.light` class):**
| Token | Giá trị |
|-------|---------|
| `--bg-base` | `#f4f0e8` |
| `--bg-surface` | `#ffffff` |
| `--accent` | `#b8872a` |

### Animation System

| Animation | Keyframe | Mô tả |
|-----------|----------|-------|
| `animate-fade-up` | `fade-up` | Fade in + slide up 18px (0.55s) |
| `animate-fade-in` | `fade-in` | Simple opacity fade (0.35s) |
| `animate-ring-in` | `ring-fade-in` | Scale 0.8→1 + fade (0.4s) |
| `spin-cw` | — | Quay thuận chiều (loading) |
| `spin-ccw` | — | Quay ngược chiều (loading) |
| `pulse-dot` | — | Pulse effect cho center dot |
| `draw-check` | — | SVG checkmark draw animation |

Delay classes: `.delay-100` (0.1s), `.delay-200` (0.2s), `.delay-300` (0.32s), `.delay-400` (0.44s)

## Component Architecture

### State Machine (page.tsx)

```
type AppState = 'upload' | 'processing' | 'result';

upload → handleJobCreated(id) → processing
processing → handleComplete() → result
result → handleReset() → upload
```

### Components

#### 1. UploadView
- **Props:** `onJobCreated: (jobId: string) => void`
- **Features:** Drag-drop zone, file validation (PDF only, max 50MB), presigned URL upload
- **Flow:** `createUploadUrl()` → `uploadFile()` → `onJobCreated(jobId)`

#### 2. ProcessingView
- **Props:** `jobId: string, onComplete: () => void`
- **Features:** Polling (3s interval), pipeline stepper (4 bước), dual-ring animation
- **Status pipeline:** `pending` → `queued` → `extracting` → `extracted` → `orchestrating` → `processing` → `completed`
- **Error handling:** Hiển thị error state khi `status === 'failed'`

#### 3. ResultView
- **Props:** `jobId: string, onReset: () => void`
- **Features:** Bilingual preview (EN/VI tabs), Markdown renderer, copy-to-clipboard, download link
- **Markdown renderer:** Custom client-side renderer hỗ trợ headings, bold, italic, code, blockquote, lists, HR
- **Bilingual parser:** `splitBilingual()` — phát hiện `## English` / `## Tiếng Việt` headers hoặc `---` separator

#### 4. ThemeToggle
- **Features:** Dark/light toggle, localStorage persistence
- **Flash prevention:** Script inline trong `<head>` apply theme trước paint
- **Hydration safe:** Server render dark → `useEffect` sync với localStorage

### API Client (lib/api.ts)

| Function | Method | Endpoint | Mô tả |
|----------|--------|----------|-------|
| `createUploadUrl(fileName)` | POST | `/upload` | Tạo presigned URL + jobId |
| `uploadFile(url, file)` | PUT | S3 presigned | Upload PDF trực tiếp |
| `getJobStatus(jobId)` | GET | `/job/{jobId}` | Polling job status |
| `getResultUrl(jobId)` | GET | `/result/{jobId}` | Lấy presigned download URL |
| `fetchPreviewContent(jobId)` | GET | `/api/preview/{jobId}` | Proxy server-side preview |

**API Base:** `https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev`

### Preview API Route

`fe/app/api/preview/[jobId]/route.ts` — Next.js API route proxy:
1. Gọi backend `/result/{jobId}` → nhận `downloadUrl`
2. Fetch nội dung từ S3 presigned URL
3. Trả về text/plain cho client

Mục đích: tránh CORS issues khi fetch trực tiếp từ S3 presigned URL trên client.
