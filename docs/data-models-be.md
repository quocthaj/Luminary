# Mô hình Dữ liệu (Data Models) — VietAI Scholar Backend

> Mô tả chi tiết cấu trúc lưu trữ cơ sở dữ liệu DynamoDB, cấu trúc tệp tin S3 và các giao diện TypeScript cốt lõi trong hệ thống.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Cơ sở dữ liệu DynamoDB

Hệ thống sử dụng cơ sở dữ liệu Amazon DynamoDB để lưu trữ trạng thái các công việc (Jobs), quản lý chia sẻ liên kết trắc nghiệm, điều phối các phiên bảo vệ luận án ảo và lưu trữ hồ sơ năng lực của học viên.

### 1.1. Bảng `vietai-jobs`
*   **Mô tả:** Lưu trữ thông tin và trạng thái xử lý tài liệu PDF được đăng tải.
*   **Khóa chính (Primary Key):**
    *   `jobId` (String - UUID v4) — **Partition Key (PK)**
*   **Chỉ mục phụ toàn cục (Global Secondary Index - GSI):** `userIdIndex`
    *   Partition Key: `userId` (String)
    *   Sort Key: `createdAt` (Number - Unix epoch timestamp)
    *   Projection: `ALL`
*   **Cơ chế dọn dẹp tự động (Time-to-Live - TTL):** Kích hoạt trên thuộc tính `expiresAt` (mặc định dọn dẹp sau 30 ngày kể từ lúc tạo).

### 1.2. Bảng `vietai-quiz-shares`
*   **Mô tả:** Quản lý mã chia sẻ các bộ trắc nghiệm công khai (không cần login).
*   **Khóa chính (Primary Key):**
    *   `shareId` (String - UUID v4) — **Partition Key (PK)**
*   **Cơ chế dọn dẹp tự động (Time-to-Live - TTL):** Kích hoạt trên thuộc tính `expiresAt` (mặc định link chia sẻ hết hạn sau 7 ngày).

### 1.3. Bảng `vietai-thesis-defense-sessions`
*   **Mô tả:** Quản lý trạng thái các phiên đối thoại phản biện luận án ảo (`ACTIVE` hoặc `CLOSED`) giữa học viên và AI Giáo sư.
*   **Khóa chính (Primary Key):**
    *   `sessionId` (String - UUID v4) — **Partition Key (PK)**

### 1.4. Bảng `vietai-user-competency-profile`
*   **Mô tả:** Lưu trữ dài hạn hồ sơ năng lực của từng học viên theo thiết kế Single-Table Design.
*   **Khóa chính (Primary Key):**
    *   `PK` (String) — **Partition Key (PK)** (Định dạng: `USER#${userId}`)
    *   `SK` (String) — **Sort Key (SK)** (Định dạng: `CONCEPT#${conceptId}`)

---

## 2. Cấu trúc lưu trữ Amazon S3

Hệ thống sử dụng hai nhóm S3 bucket chính phân tách giữa tệp tải lên thô và kết quả trung gian/cuối cùng.

### 2.1. Uploads Bucket (`vietai-uploads-{accountId}`)
```
uploads/
└── {jobId}/
    └── {fileName}           # Tệp PDF thô ban đầu (ví dụ: paper.pdf)
```

### 2.2. Results Bucket (`vietai-results-{accountId}`)
```
results/
└── {jobId}/
    ├── original.txt          # Toàn bộ văn bản thô trích xuất từ PDF
    ├── translator.txt        # Bản dịch thô được gom lại
    ├── latex.json             # Danh sách các công thức LaTeX đã xử lý
    ├── diagram.json           # Mô tả nội dung hình vẽ/sơ đồ tư duy
    ├── citation.json          # Phân loại và cấu trúc các trích dẫn bài báo
    ├── analysis.md            # ⭐ Bản dịch song ngữ Anh-Việt Markdown hoàn chỉnh
    ├── quiz.json              # Bộ câu hỏi trắc nghiệm đã sinh
    ├── flashcard.json         # Danh sách thẻ ghi nhớ (flashcards)
    ├── mindmap.json           # Mã nguồn Mermaid của sơ đồ tư duy bài báo
    ├── podcast.mp3            # Tệp audio đối thoại podcast (TTS)
    └── chunks/
        ├── chunk_0.txt       # Đoạn văn bản thô thứ 0
        ├── chunk_1.txt       # Đoạn văn bản thô thứ 1
        ├── translated_0.txt  # Đoạn văn bản dịch thứ 0
        └── translated_1.txt  # Đoạn văn bản dịch thứ 1
```

---

## 3. Khai báo Giao diện TypeScript (Types & Interfaces)

### 3.1. Các thực thể dữ liệu chính (Core Database Items)

#### JobItem (Bảng `vietai-jobs`)
```typescript
export type JobStatus =
  | 'pending'           // Job vừa tạo, chờ upload file
  | 'queued'            // File đã upload, chờ kích hoạt Step Functions
  | 'extracting'        // Đang trích xuất văn bản (Textract/pdfjs)
  | 'extracted'         // Trích xuất thành công
  | 'orchestrating'     // Đang khởi chạy Step Functions
  | 'processing'        // Các tác vụ AI Agent đang xử lý song song
  | 'agents_completed'  // Các Agent hoàn thành, chờ gộp kết quả
  | 'completed'         // Tạo phân tích thành công, đã lưu S3
  | 'failed';           // Lỗi xử lý

export interface JobItem {
  jobId: string;           // UUID v4 (Partition Key)
  userId: string;          // ID người dùng hoặc "guest" (GSI Partition Key)
  createdAt: number;       // Unix epoch timestamp (GSI Sort Key)
  expiresAt: number;       // Unix epoch timestamp (TTL - 30 ngày)
  status: JobStatus;
  fileName: string;        // Tên file gốc (ví dụ: "deep_learning.pdf")
  s3Key: string;           // Đường dẫn file gốc trên S3: "uploads/{jobId}/{fileName}"
  s3OutputKey?: string;    // Đường dẫn kết quả: "results/{jobId}/analysis.md"
  completedAt?: number;    // Thời gian hoàn thành
  errorMsg?: string;       // Chi tiết lỗi nếu status là 'failed'
  hasFormula?: boolean;    // Cờ đánh dấu tài liệu chứa công thức toán học
  hasDiagram?: boolean;    // Cờ đánh dấu tài liệu chứa hình vẽ/sơ đồ
  hasCitation?: boolean;   // Cờ đánh dấu tài liệu chứa trích dẫn khoa học
}
```

#### QuizShareItem (Bảng `vietai-quiz-shares`)
```typescript
export interface QuizShareItem {
  shareId: string;         // UUID chia sẻ (Partition Key)
  jobId: string;           // ID của bài báo gốc
  userId: string;          // Người tạo liên kết chia sẻ
  count: number;           // Số lượng câu hỏi được chia sẻ
  createdAt: number;       // Thời điểm tạo liên kết
  expiresAt: number;       // Thời điểm hết hạn link (TTL - 7 ngày)
}
```

#### DefenseSession (Bảng `vietai-thesis-defense-sessions`)
```typescript
export interface SessionTurn {
  question: string;        // Câu hỏi của AI Giáo sư phản biện
  answer?: string;         // Câu trả lời của học viên
  convincing?: boolean;    // Kết quả đánh giá: câu trả lời có thuyết phục không?
  gaps?: string[];         // Lỗ hổng kiến thức được phát hiện trong lượt này
}

export interface ConceptStatus {
  concept_id: string;      // ID khái niệm (ví dụ: "gradient_descent")
  status: 'MASTERED' | 'WARNING' | 'GAP'; // Mức độ làm chủ trong phiên hiện tại
  last_gap_summary?: string; // Tóm tắt lỗ hổng kiến thức gần nhất của khái niệm này
}

export interface DefenseSession {
  sessionId: string;       // UUID phiên bảo vệ (Partition Key)
  userId: string;          // ID học viên tham gia
  jobId: string;           // ID bài báo/chủ đề đang bảo vệ
  status: 'ACTIVE' | 'CLOSED'; // Trạng thái phiên
  recent_turns: SessionTurn[]; // Cửa sổ trượt chứa tối đa 3 lượt đối thoại gần nhất
  concept_status: ConceptStatus[]; // Trạng thái làm chủ tích lũy các khái niệm trong phiên
  createdAt: string;       // ISO Timestamp lúc bắt đầu
  updatedAt: string;       // ISO Timestamp cập nhật gần nhất
  archivedAt?: string;     // ISO Timestamp lúc đóng và lưu hồ sơ năng lực
}
```

#### UserCompetencyProfile (Bảng `vietai-user-competency-profile`)
```typescript
export interface GapRecord {
  session_id: string;      // ID phiên bảo vệ phát sinh lỗ hổng
  gap_summary: string;     // Tóm tắt nội dung lỗ hổng kiến thức
  timestamp: string;       // ISO Timestamp ghi nhận
}

export interface UserCompetencyProfile {
  PK: string;              // Định dạng: "USER#${userId}" (Partition Key)
  SK: string;              // Định dạng: "CONCEPT#${conceptId}" (Sort Key)
  mastery_score: number;   // Điểm số làm chủ khái niệm (Thang số [0.0 - 1.0])
  status: 'MASTERED' | 'WARNING' | 'GAP'; // Đánh giá mức độ làm chủ tích lũy lâu dài
  gap_history: GapRecord[]; // Lịch sử các lỗ hổng kiến thức đã phát hiện
  last_reviewed_at: string;// ISO Timestamp lượt kiểm tra gần nhất
  review_count: number;    // Tổng số lượt đã được hỏi về khái niệm này
  updated_at: string;      // ISO Timestamp cập nhật hồ sơ
}
```

### 3.2. Cấu trúc Trao đổi của AI Agent (Pipeline & Supervisor)

#### Trích xuất Placeholders (`PlaceholderResult`)
```typescript
export interface PlaceholderResult {
  cleanedText: string;     // Văn bản đã được lọc và thay thế bằng các thẻ tạm giữ
  formulas: string[];      // Mảng chứa các chuỗi công thức toán học trích xuất ra
  figures: string[];       // Mảng chứa các tham chiếu hình vẽ/sơ đồ trích xuất ra
  citations: string[];     // Mảng chứa các tham chiếu trích dẫn tài liệu trích xuất ra
}
```

#### Dữ liệu đầu vào Agent (`AgentInput`)
```typescript
export interface AgentInput {
  jobId: string;
  fileName: string;
  text: string;            // Đoạn văn bản cần xử lý
  formulas?: string[];
  figures?: string[];
  citations?: string[];
}
```

#### Dữ liệu đầu ra Agent (`AgentResult`)
```typescript
export interface AgentResult {
  agentName: string;       // Tên agent: "translator" | "latex" | "diagram" | "citation"
  success: boolean;
  output?: string;         // Nội dung phản hồi (nếu nhỏ)
  outputKey?: string;      // Đường dẫn file trên S3 chứa kết quả (nếu lớn)
  error?: string;          // Chi tiết lỗi nếu thất bại
}
```

#### Đầu ra Điều phối Supervisor (`SupervisorOutput`)
```typescript
export interface SupervisorOutput {
  jobId: string;
  status: string;
  outputKey?: string;      // Đường dẫn S3 của tệp analysis.md gộp cuối cùng
  hasFormula: boolean;
  hasDiagram: boolean;
  hasCitation: boolean;
  agentResults: AgentResult[]; // Mảng chứa chi tiết trạng thái chạy của từng Agent
}
```

#### Thông tin phiên thu hoạch từ Thesis Defense (`SessionFact`)
```typescript
export interface SessionFact {
  concept_id: string;
  verdict: 'MASTERED' | 'WARNING' | 'GAP';
  gap_summary: string;
}
```
