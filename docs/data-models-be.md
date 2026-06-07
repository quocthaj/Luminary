# Data Models — VietAI Scholar Backend

> Tự động tạo bởi BMad Document Project · 2026-06-06

## DynamoDB: Bảng `vietai-jobs`

### Cấu Trúc Bảng

| Attribute | Type | Vai trò |
|-----------|------|---------|
| `jobId` | String (UUID v4) | **Partition Key** |
| `userId` | String | GSI Partition Key (mặc định: `"guest"`) |
| `createdAt` | Number (epoch seconds) | GSI Sort Key |
| `expiresAt` | Number (epoch seconds) | TTL attribute (30 ngày) |

### GSI: `userIdIndex`

| Key | Type |
|-----|------|
| Partition | `userId` (String) |
| Sort | `createdAt` (Number) |
| Projection | ALL |

### Schema Item Đầy Đủ

```typescript
interface JobItem {
  // Keys
  jobId: string;           // UUID v4, partition key
  userId: string;          // "guest" (default), GSI partition key
  createdAt: number;       // epoch seconds, GSI sort key
  expiresAt: number;       // TTL: createdAt + 30 ngày

  // Core fields
  status: JobStatus;       // see below
  fileName: string;        // tên file gốc (e.g. "paper.pdf")
  s3Key: string;           // S3 upload path: "uploads/{jobId}/{fileName}"

  // Completion fields (set when done)
  s3OutputKey?: string;    // "results/{jobId}/analysis.md"
  completedAt?: number;    // epoch seconds khi hoàn thành
  errorMsg?: string;       // error message nếu failed

  // Metadata flags (set by Supervisor)
  hasFormula?: boolean;    // tài liệu có công thức toán
  hasDiagram?: boolean;    // tài liệu có hình/biểu đồ
  hasCitation?: boolean;   // tài liệu có trích dẫn
}

type JobStatus =
  | 'pending'           // Job tạo, chờ upload
  | 'queued'            // File uploaded, chờ Step Function
  | 'extracting'        // Đang trích xuất text (pdfjs/Textract)
  | 'extracted'         // Text đã trích xuất xong
  | 'orchestrating'     // Step Function started (SFN mode only)
  | 'processing'        // Agents đang chạy
  | 'agents_completed'  // Agents xong (Direct mode only)
  | 'completed'         // Kết quả đã lưu S3
  | 'failed';           // Xử lý thất bại
```

## S3 Object Structure

### Uploads Bucket (`vietai-uploads-{accountId}`)

```
uploads/
└── {jobId}/
    └── {fileName}           # PDF gốc (e.g. paper.pdf)
```

### Results Bucket (`vietai-results-{accountId}`)

```
results/
└── {jobId}/
    ├── original.txt          # Text gốc sau khi extract + normalize
    ├── chunks/
    │   ├── chunk_0.txt       # Text chunk 0 (max 7000 chars)
    │   ├── chunk_1.txt       # Text chunk 1
    │   ├── translated_0.txt  # Bản dịch chunk 0
    │   └── translated_1.txt  # Bản dịch chunk 1
    ├── translator.txt        # Bản dịch hoàn chỉnh (Direct mode)
    ├── latex.json             # LaTeX formulas processed
    ├── diagram.json           # Diagram descriptions
    ├── citation.json          # Citation classifications
    └── analysis.md            # ⭐ Kết quả cuối cùng (Markdown song ngữ)
```

## TypeScript Interfaces

### Agent Communication

```typescript
interface AgentInput {
  jobId: string;
  fileName: string;
  text: string;           // cleaned text (placeholders thay thế)
  formulas?: string[];    // raw formula strings
  figures?: string[];     // raw figure references
  citations?: string[];   // raw citation strings
}

interface AgentResult {
  agentName: string;      // "translator" | "latex" | "diagram" | "citation"
  success: boolean;
  output?: string;        // inline result
  outputKey?: string;     // S3 key nếu đã save
  error?: string;
}
```

### Supervisor Communication

```typescript
interface SupervisorInput {
  jobId: string;
  fileName: string;
  extractedText: string;  // raw text from PDF extraction
}

interface SupervisorOutput {
  jobId: string;
  status: string;
  outputKey?: string;     // S3 key of final analysis.md
  hasFormula: boolean;
  hasDiagram: boolean;
  hasCitation: boolean;
  agentResults: AgentResult[];
}
```

### Merge Communication

```typescript
interface MergeAgentInput {
  jobId: string;
  fileName: string;
  cleanedText: string;     // text gốc (đã thay placeholder)
  agentResults: AgentResult[];
}

interface MergeAgentResult {
  jobId: string;
  success: boolean;
  outputKey?: string;      // "results/{jobId}/analysis.md"
  error?: string;
}
```

### Placeholder System

```typescript
interface PlaceholderResult {
  cleanedText: string;     // text sau khi thay placeholder
  formulas: string[];      // raw formula matches
  figures: string[];       // raw figure matches
  citations: string[];     // raw citation matches
}
```
