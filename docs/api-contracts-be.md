# Đặc tả Hợp đồng API (API Contracts) — VietAI Scholar Backend

> Tài liệu kỹ thuật chi tiết về các điểm cuối (endpoints) API được triển khai qua API Gateway, Lambda và Step Functions.  
> Cập nhật mới nhất: 2026-07-07

## 1. Địa chỉ Base URL

```
https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev
```

---

## 2. Các điểm cuối (API Endpoints)

### 2.1. Nhóm Quản lý Tệp tin & Xử lý PDF (Bản dịch & Phân tích)

#### POST /upload — Tạo Presigned URL để Upload tài liệu
*   **Mô tả:** Đăng ký job mới và sinh URL tạm thời (presigned S3 URL) để frontend upload trực tiếp file PDF của bài báo khoa học.
*   **Xác thực:** Không bắt buộc (Public).
*   **Request Body:**
    ```json
    {
      "fileName": "paper_research.pdf"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "jobId": "uuid-v4",
      "uploadUrl": "https://vietai-uploads-{accountId}.s3.amazonaws.com/uploads/{jobId}/paper_research.pdf?AWSAccessKeyId=...",
      "expiresIn": 300
    }
    ```
*   **Side Effects:** Tạo một bản ghi mới trong DynamoDB `vietai-jobs` với trạng thái `pending`.

#### GET /job/{jobId} — Kiểm tra Trạng thái Xử lý
*   **Mô tả:** Polling endpoint để frontend theo dõi tiến trình của đường ống xử lý (extract, translate, latex, merge, ingest).
*   **Xác thực:** Không bắt buộc (Public).
*   **Response (200 OK):**
    ```json
    {
      "jobId": "uuid-v4",
      "status": "completed",
      "fileName": "paper_research.pdf",
      "s3OutputKey": "results/{jobId}/analysis.md",
      "createdAt": 1717200000,
      "completedAt": 1717200120,
      "error": null,
      "hasFormula": true,
      "hasDiagram": true,
      "hasCitation": true
    }
    ```
*   **Các trạng thái (`status`):** `pending` | `queued` | `extracting` | `extracted` | `orchestrating` | `processing` | `agents_completed` | `completed` | `failed`.

#### GET /result/{jobId} — Lấy Link tải Tệp phân tích Markdown (.md)
*   **Mô tả:** Trả về presigned URL để tải tệp markdown song ngữ Anh-Việt (`analysis.md`) đã qua xử lý.
*   **Xác thực:** Không bắt buộc (Public).
*   **Response (200 OK):**
    ```json
    {
      "downloadUrl": "https://vietai-results-{accountId}.s3.amazonaws.com/results/{jobId}/analysis.md?AWSAccessKeyId=...",
      "expiresIn": 3600
    }
    ```
*   **Response (409 Conflict):** Trả về khi bài báo chưa xử lý xong.
    ```json
    {
      "error": "Result not ready",
      "status": "processing"
    }
    ```

#### POST /job/{jobId}/reprocess — Thực hiện lại Quy trình Dịch thuật
*   **Mô tả:** Yêu cầu chạy lại Step Functions để sinh lại bản dịch/latex.
*   **Xác thực:** Bắt buộc JWT (header: `Authorization: Bearer <token>`).
*   **Response (200 OK):**
    ```json
    {
      "message": "Reprocessing started",
      "executionArn": "arn:aws:states:..."
    }
    ```

---

### 2.2. Nhóm Tính năng Trợ lý Nghiên cứu & RAG (Từng bài báo)

#### POST /job/{jobId}/chat — Hồi đáp Hỏi đáp RAG
*   **Mô tả:** Chat bot trả lời các câu hỏi về bài báo sử dụng vector search từ Qdrant Cloud.
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "message": "Phương pháp chính được sử dụng để tối ưu hóa trong bài báo này là gì?"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "answer": "Trong nghiên cứu này, các tác giả đã áp dụng..."
    }
    ```

#### POST /job/{jobId}/quiz — Yêu cầu tạo Trắc nghiệm
*   **Mô tả:** AI tạo một bộ câu hỏi trắc nghiệm kiến thức dựa trên nội dung bài báo khoa học.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "status": "created",
      "s3Key": "results/{jobId}/quiz.json"
    }
    ```

#### GET /job/{jobId}/quiz — Tải Bộ câu hỏi Trắc nghiệm
*   **Mô tả:** Lấy danh sách câu hỏi trắc nghiệm đã sinh.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "questions": [
        {
          "questionId": "q1",
          "questionText": "Phương pháp A vượt trội hơn phương pháp B ở điểm nào?",
          "options": ["Tốc độ hội tụ", "Độ chính xác", "Khả năng mở rộng", "Tất cả các ý trên"],
          "correctAnswerIndex": 3,
          "explanation": "Được ghi rõ tại mục 4.2..."
        }
      ]
    }
    ```

#### POST /job/{jobId}/share/quiz — Sinh Link chia sẻ Trắc nghiệm công khai
*   **Mô tả:** Sinh link trắc nghiệm công khai có kèm mã băm chống Spam/EDoS.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "shareId": "share-uuid",
      "shareUrl": "https://vietai.scholar/share/quiz/share-uuid",
      "expiresAt": 1719792000
    }
    ```

#### GET /share/quiz/{shareId} — Lấy thông tin Trắc nghiệm công khai
*   **Mô tả:** Điểm cuối công khai cho phép học viên khác tham gia làm bài trắc nghiệm mà không cần login. Tích hợp EDoS Throttling (hạn chế lượt tải/IP).
*   **Xác thực:** Không bắt buộc (Public).
*   **Response (200 OK):**
    ```json
    {
      "jobId": "job-uuid",
      "questions": [...],
      "count": 5,
      "expiresAt": 1719792000
    }
    ```

#### POST /job/{jobId}/flashcard — Tạo Thẻ Ghi nhớ (Flashcards)
*   **Mô tả:** AI tự động sinh flashcards hệ thống hóa thuật ngữ/khái niệm chuyên ngành.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "status": "created",
      "s3Key": "results/{jobId}/flashcard.json"
    }
    ```

#### GET /job/{jobId}/flashcard — Lấy Danh sách Flashcards
*   **Mô tả:** Lấy danh sách flashcards đã sinh.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "flashcards": [
        {
          "id": "f1",
          "front": "RAG (Retrieval-Augmented Generation)",
          "back": "Mô hình tạo lập tăng cường bằng truy xuất thông tin..."
        }
      ]
    }
    ```

#### POST & GET /job/{jobId}/mindmap — Sinh và Lấy Sơ đồ tư duy
*   **Mô tả:** Trích xuất sơ đồ tư duy dạng mã Mermaid/JSON để vẽ đồ thị bài báo.
*   **Xác thực:** Bắt buộc JWT.
*   **GET Response (200 OK):**
    ```json
    {
      "mindmap": "graph TD\n  A[Tên bài báo] --> B[Phương pháp]\n  B --> C[Dataset]..."
    }
    ```

#### POST & GET /job/{jobId}/podcast — Sinh và Lấy Audio Podcast TTS
*   **Mô tả:** Yêu cầu Google Cloud TTS (hoặc AWS Polly làm fallback) tổng hợp giọng đọc hội thoại tóm tắt bài báo dạng Audio Podcast.
*   **Xác thực:** Bắt buộc JWT.
*   **GET Response (200 OK):**
    ```json
    {
      "status": "completed",
      "downloadUrl": "https://vietai-results-{accountId}.s3.amazonaws.com/results/{jobId}/podcast.mp3?..."
    }
    ```

---

### 2.3. Nhóm Nghiên cứu Tổng hợp liên bài báo (Cross-Paper Synthesis)

#### GET /jobs — Lấy Danh sách Bài báo của Người dùng
*   **Mô tả:** Trả về danh sách tất cả các bài báo học viên đã đăng tải lên hệ thống.
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "jobs": [
        {
          "jobId": "uuid-1",
          "fileName": "transformer.pdf",
          "status": "completed",
          "createdAt": 1717200000
        }
      ]
    }
    ```

#### POST /synthesis — Khởi tạo Báo cáo Tổng hợp Liên Bài báo
*   **Mô tả:** Lựa chọn nhiều bài báo từ thư viện của mình và sinh báo cáo so sánh, đối chiếu học thuật chéo (Cross-Paper Synthesis Report).
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "jobIds": ["job-uuid-1", "job-uuid-2", "job-uuid-3"],
      "topic": "So sánh kiến trúc Transformers với State Space Models"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "synthesisReport": "## Báo cáo Tổng hợp...\n...",
      "keyContributions": [...],
      "limitations": [...]
    }
    ```

#### POST /synthesis/chat — Thảo luận Chéo đa bài báo
*   **Mô tả:** Hỏi đáp RAG trên phạm vi không gian vector gộp của nhiều bài nghiên cứu đồng thời.
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "jobIds": ["job-uuid-1", "job-uuid-2"],
      "message": "Các bài báo này mâu thuẫn hay bổ sung cho nhau về mặt giả thuyết thực nghiệm?"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "answer": "Nghiên cứu A chỉ ra... Trong khi nghiên cứu B..."
    }
    ```

---

### 2.4. Nhóm Khám phá Độc lập & Bảo vệ Luận án Thử nghiệm (Explore & Thesis Defense)

#### POST /explore — Khởi động Chế độ Khám phá Chủ đề độc lập (Explore Mode)
*   **Mô tả:** Cho phép học viên tự nhập một chủ đề nghiên cứu bất kỳ, AI sẽ sinh dàn ý kiến thức (Topic Map) và tìm kiếm tự động để nạp dữ liệu.
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "topic": "Học sâu tăng cường trong quản lý chuỗi cung ứng"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "jobId": "explore-job-uuid",
      "status": "queued"
    }
    ```

#### POST /explore/defense/session — Khởi tạo/Khôi phục Phiên bảo vệ luận án thử nghiệm
*   **Mô tả:** Thiết lập một phòng phản biện ảo, AI sẽ đóng vai Giáo sư phản biện đặt các câu hỏi mở sắc sảo trực diện vào đề tài.
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "jobId": "job-uuid"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "sessionId": "session-uuid",
      "userId": "user-uuid",
      "jobId": "job-uuid",
      "status": "ACTIVE",
      "recent_turns": [
        {
          "question": "Chào mừng bạn đến với phiên phản biện đề tài. Xin vui lòng làm rõ đóng góp cốt lõi và luận điểm đột phá..."
        }
      ],
      "concept_status": [],
      "createdAt": "2026-07-07T14:50:00.000Z",
      "updatedAt": "2026-07-07T14:50:00.000Z"
    }
    ```

#### POST /explore/defense/answer — Gửi Câu trả lời & Chạy Vòng lặp Suy luận (Reasoning Loop)
*   **Mô tả:** Học viên nộp câu trả lời phản biện. AI thực hiện vòng lặp 2 pha:
    1.  **Evaluator (Reflect):** So sánh câu trả lời với tài liệu gốc (RAG), xác định xem câu trả lời thuyết phục chưa (`convincing: true/false`), liệt kê lỗ hổng (`gaps`) và cập nhật verdict năng lực của khái niệm (`MASTERED` | `WARNING` | `GAP`).
    2.  **Planner (Act):** Dựa vào lịch sử, quyết định tiếp tục đào sâu câu hỏi (`deepen`), chuyển khái niệm (`switch`) hay kết thúc tổng kết (`conclude`).
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "sessionId": "session-uuid",
      "userAnswer": "Kiến trúc mô hình của tôi sử dụng cơ chế chú ý phân cấp giúp giảm độ phức tạp..."
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "sessionId": "session-uuid",
      "thinking_steps": [
        "Phân tích câu trả lời: học viên hiểu rõ cơ chế chú ý nhưng chưa chứng minh được độ phức tạp giảm tuyến tính.",
        "Quyết định: deepen (đào sâu thêm)."
      ],
      "next_question": "Cơ sở thực nghiệm nào chứng minh độ phức tạp giảm từ bình phương xuống tuyến tính? Hãy nêu rõ số lượng tham số thử nghiệm.",
      "status": "ACTIVE",
      "recent_turns": [
        {
          "question": "Cơ sở thực nghiệm nào...",
          "answer": null
        }
      ],
      "concept_status": [
        {
          "concept_id": "computational_complexity",
          "status": "WARNING",
          "last_gap_summary": "Thiếu minh chứng thực nghiệm về độ phức tạp thời gian."
        }
      ]
    }
    ```

#### POST /explore/defense/session/close — Kết thúc Phiên bảo vệ Luận án
*   **Mô tả:** Đóng phòng phản biện ảo, trích xuất tất cả `SessionFact` thu hoạch được, cập nhật lâu dài vào Hồ sơ năng lực của học viên (`vietai-user-competency-profile`).
*   **Xác thực:** Bắt buộc JWT.
*   **Request Body:**
    ```json
    {
      "sessionId": "session-uuid"
    }
    ```
*   **Response (200 OK):**
    ```json
    {
      "status": "CLOSED",
      "message": "Session closed and competency profile updated.",
      "report": {
        "concepts_evaluated": [
          {
            "concept_id": "computational_complexity",
            "status": "GAP",
            "last_gap_summary": "Không phản hồi được số liệu tham số phần cứng thực nghiệm."
          }
        ],
        "facts": [
          {
            "concept_id": "computational_complexity",
            "verdict": "GAP",
            "gap_summary": "Thiếu thực nghiệm đo đạc độ phức tạp tuyến tính."
          }
        ]
      }
    }
    ```

#### GET /explore/copilot/suggest — Nhận Gợi ý Nghiên cứu (Research Copilot)
*   **Mô tả:** Phân tích các lỗ hổng kiến thức hiện tại của học viên (trong phiên phản biện hiện tại hoặc lịch sử hồ sơ năng lực) để tự động đề xuất 3-5 nhiệm vụ nghiên cứu tiếp theo (Research tasks).
*   **Xác thực:** Bắt buộc JWT.
*   **Query Parameters:**
    *   `jobId` (bắt buộc)
    *   `sessionId` (tùy chọn)
*   **Response (200 OK):**
    ```json
    {
      "suggestions": [
        {
          "taskId": "task-1",
          "title": "Bổ sung đo lường bộ nhớ thực tế (VRAM) của mô hình",
          "description": "Để phản bác ý kiến giáo sư về độ phức tạp tính toán, bạn cần chạy benchmark so sánh VRAM tiêu thụ với mô hình nền tảng.",
          "priority": "HIGH",
          "relevant_concept": "computational_complexity"
        }
      ]
    }
    ```

#### GET /explore/competency/profile — Lấy Hồ sơ Năng lực Học viên
*   **Mô tả:** Trả về danh sách toàn bộ các khái niệm khoa học chuyên ngành mà học viên đã tương tác, kèm điểm số thành thạo (mastery_score) và lịch sử phát hiện lỗ hổng kiến thức để hiển thị dạng Đồ thị Kiến thức (Knowledge Graph).
*   **Xác thực:** Bắt buộc JWT.
*   **Response (200 OK):**
    ```json
    {
      "userId": "user-uuid",
      "competencies": [
        {
          "concept_id": "computational_complexity",
          "mastery_score": 0.35,
          "status": "GAP",
          "review_count": 2,
          "last_reviewed_at": "2026-07-07T14:50:00.000Z",
          "gap_history": [
            {
              "session_id": "session-uuid",
              "gap_summary": "Thiếu thực nghiệm đo đạc độ phức tạp tuyến tính.",
              "timestamp": "2026-07-07T14:51:00.000Z"
            }
          ]
        }
      ]
    }
    ```

---

## 3. Quản lý Lỗi (Error Handling)

Tất cả các API khi gặp lỗi sẽ trả về định dạng JSON chuẩn thống nhất:

```json
{
  "statusCode": 400 | 401 | 403 | 404 | 409 | 500,
  "headers": {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  },
  "body": "{\"error\": \"Chi tiết thông báo lỗi học thuật ở đây\"}"
}
```
*   `400 Bad Request`: Định dạng JSON không hợp lệ hoặc thiếu thuộc tính bắt buộc.
*   `401 Unauthorized`: Header `Authorization` bị thiếu hoặc token JWT không hợp lệ/hết hạn.
*   `403 Forbidden`: Người dùng cố truy cập dữ liệu của học viên khác.
*   `404 Not Found`: Không tìm thấy Job, Session hoặc tài liệu tương ứng.
*   `409 Conflict`: Trạng thái xung đột (ví dụ: yêu cầu tải kết quả khi RAG chưa hoàn thành trích xuất).
*   `500 Internal Server Error`: Lỗi phát sinh trong quá trình suy luận của LLM hoặc thao tác với DynamoDB/Qdrant.
