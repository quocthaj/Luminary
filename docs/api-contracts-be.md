# API Contracts — VietAI Scholar Backend

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Base URL

```
https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev
```

## Endpoints

### 1. POST /upload — Tạo Presigned Upload URL

**Mô tả:** Tạo job mới và trả về presigned S3 URL để upload PDF.

**Request:**
```json
{
  "fileName": "document.pdf"
}
```

**Response (200):**
```json
{
  "jobId": "uuid-v4",
  "uploadUrl": "https://vietai-uploads-{account}.s3.amazonaws.com/uploads/{jobId}/{fileName}?...",
  "expiresIn": 300
}
```

**Side Effects:**
- Tạo record DynamoDB với `status: "pending"`, `userId: "guest"`, `expiresAt: now + 30 ngày`
- Presigned URL hợp lệ 5 phút, Content-Type: `application/pdf`

---

### 2. GET /job/{jobId} — Kiểm Tra Trạng Thái Job

**Mô tả:** Polling endpoint — frontend gọi mỗi 3 giây.

**Response (200):**
```json
{
  "jobId": "uuid",
  "status": "processing",
  "fileName": "paper.pdf",
  "s3OutputKey": "results/{jobId}/analysis.md",
  "createdAt": "1717200000",
  "completedAt": "1717200120",
  "error": null
}
```

**Response (404):** `{ "error": "Job not found" }`

**Status Values:**
| Status | Giai đoạn |
|--------|-----------|
| `pending` | Job tạo, chờ upload |
| `queued` | File uploaded, chờ xử lý |
| `extracting` | Đang trích xuất text từ PDF |
| `extracted` | Text đã trích xuất |
| `orchestrating` | Step Function started |
| `processing` | Agents đang chạy |
| `agents_completed` | Agents xong, chờ merge |
| `completed` | Hoàn thành, có kết quả |
| `failed` | Xử lý thất bại |

---

### 3. GET /result/{jobId} — Lấy URL Tải Kết Quả

**Mô tả:** Trả về presigned download URL cho file `analysis.md`.

**Response (200):**
```json
{
  "downloadUrl": "https://vietai-results-{account}.s3.amazonaws.com/results/{jobId}/analysis.md?...",
  "expiresIn": 3600
}
```

**Response (409):** `{ "error": "Result not ready", "status": "processing" }`
**Response (404):** `{ "error": "Job not found" }`

---

### 4. S3 Event Trigger (Internal)

**Trigger:** `OBJECT_CREATED` trên `uploads/` prefix
**Target:** Orchestrator Lambda
**Input event:** Standard S3 event record
**Processing:**
- Extract `jobId` từ S3 key: `uploads/{jobId}/{fileName}`
- Có STATE_MACHINE_ARN → Start Step Functions execution
- Không có → Direct mode (in-process pipeline)

## Error Handling

Tất cả endpoints trả về format thống nhất:

```json
{
  "statusCode": 400 | 404 | 409 | 500,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  "body": "{\"error\": \"message\"}"
}
```
