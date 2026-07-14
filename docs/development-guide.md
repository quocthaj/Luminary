# Hướng Dẫn Phát Triển (Development Guide) — Luminary Scholar

> Tài liệu hướng dẫn lập trình viên thiết lập môi trường, quản lý biến môi trường, thiết lập khóa bảo mật và thực thi kiểm thử.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Yêu Cầu Môi Trường Cài Đặt

| Công cụ / Nền tảng | Phiên bản yêu cầu | Ghi chú |
| :--- | :--- | :--- |
| **Node.js** | $\ge$ 20.x | Runtime thực thi JavaScript/TypeScript chính |
| **npm** | $\ge$ 9.x | Trình quản lý package của Monorepo |
| **AWS CLI** | $\ge$ 2.x | Quản lý kết nối tài khoản AWS thông qua terminal |
| **AWS CDK CLI** | `~2.1123.0` | Công cụ deploy hạ tầng Cloud |
| **TypeScript** | `~5.9.3` (BE) / `^5` (FE) | Ngôn ngữ phát triển |

---

## 2. Hướng Dẫn Khởi Chạy Ban Đầu

### 2.1. Cài đặt toàn bộ dependencies trong workspace
Tại thư mục gốc của monorepo:
```bash
npm install
```

### 2.2. Khởi chạy Frontend ở local (Next.js Dev Server)
```bash
cd fe
npm run dev
```
Truy cập ứng dụng tại địa chỉ `http://localhost:3000`.

### 2.3. Kiểm thử và deploy Backend (AWS CDK)
```bash
cd be
# Biên dịch TypeScript sang JS trong thư mục dist/
npm run build

# Chạy thử unit test Jest
npm test

# Deploy hạ tầng CDK lên tài khoản AWS
npx cdk deploy
```

---

## 3. Quản lý các Biến Môi Trường (Environment Variables)

### 3.1. Các biến được CDK tự động nạp vào Lambda Functions

| Biến môi trường | Loại giá trị | Vai trò |
| :--- | :--- | :--- |
| `S3_UPLOADS_BUCKET` | Tên S3 Bucket | Lưu trữ tệp PDF tải lên từ client |
| `S3_RESULTS_BUCKET` | Tên S3 Bucket | Lưu trữ kết quả Markdown, flashcards, mindmaps, audio |
| `DYNAMODB_TABLE` | Tên bảng | Liên kết bảng `vietai-jobs` |
| `DYNAMODB_TABLE_QUIZ_SHARES` | Tên bảng | Liên kết bảng `vietai-quiz-shares` |
| `DYNAMODB_TABLE_DEFENSE_SESSIONS`| Tên bảng | Liên kết bảng `vietai-thesis-defense-sessions` |
| `DYNAMODB_TABLE_COMPETENCY_PROFILE`| Tên bảng | Liên kết bảng `vietai-user-competency-profile` |
| `GROQ_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Groq API key |
| `GEMINI_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Gemini API key |
| `DEEPSEEK_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa DeepSeek API key |
| `MISTRAL_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Mistral API key |
| `AUTH_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa auth secret key của JWT |
| `QDRANT_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa url và apiKey của Qdrant Cloud |
| `GEMINI_EMBEDDING_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Gemini Embedding key |
| `NOMIC_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Nomic key |
| `GOOGLE_TTS_SECRET_ARN` | ARN Secrets Manager | Bản ghi bí mật chứa Google TTS JSON credentials |
| `STATE_MACHINE_ARN` | ARN State Machine | Định vị đường ống chạy Step Functions |

### 3.2. Cấu hình biến môi trường Frontend (`fe/.env.local`)
```env
# Cấu hình Next-Auth
NEXTAUTH_URL=http://localhost:3000
AUTH_SECRET=chuoi_khoa_bi_mat_32_ky_tu_auth_next

# Địa chỉ URL của REST API Gateway sau khi deploy backend thành công
NEXT_PUBLIC_API_URL=https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev
```

---

## 4. Tạo Khóa Bí Mật Trên AWS Secrets Manager

Chạy các lệnh CLI sau để thiết lập khóa bí mật phục vụ hệ thống AI Agent, Vector DB và xác thực:

```bash
# 1. Groq API Key
aws secretsmanager create-secret --name vietai/groq-api-key --secret-string "YOUR_GROQ_API_KEY"

# 2. Google Gemini API Key
aws secretsmanager create-secret --name vietai/gemini-api-key --secret-string "YOUR_GEMINI_API_KEY"

# 3. DeepSeek API Key
aws secretsmanager create-secret --name viet-ai-scholar/deepseek-api-key --secret-string "YOUR_DEEPSEEK_API_KEY"

# 4. Mistral API Key
aws secretsmanager create-secret --name viet-ai-scholar/mistral-api-key --secret-string "YOUR_MISTRAL_API_KEY"

# 5. JWT Auth Secret
aws secretsmanager create-secret --name vietai/auth-secret --secret-string "YOUR_JWT_HS256_SECRET_KEY"

# 6. Qdrant Cloud Config JSON
aws secretsmanager create-secret --name vietai/qdrant-config --secret-string '{"url":"https://YOUR_CLUSTER.cloud.qdrant.io","apiKey":"YOUR_API_KEY"}'

# 7. Gemini Embedding API Key
aws secretsmanager create-secret --name vietai/gemini-embedding-key --secret-string "YOUR_GEMINI_EMBEDDING_API_KEY"

# 8. Nomic API Key
aws secretsmanager create-secret --name vietai/nomic-api-key --secret-string "YOUR_NOMIC_API_KEY"

# 9. Google Cloud TTS Credentials
aws secretsmanager create-secret --name vietai/google-tts --secret-string "YOUR_GOOGLE_CLOUD_SERVICE_ACCOUNT_JSON"
```

---

## 5. Quy Chuẩn Kiểm Thử (Testing Guidelines)

### 5.1. Unit Test Backend (Jest)
*   **Thư mục:** `be/test/`
*   **Công cụ:** Jest kết hợp `ts-jest`
*   **Thực thi:**
    ```bash
    cd be
    npm test
    ```

### 5.2. E2E Test Frontend (Playwright)
*   **Thư mục:** `fe/e2e/` (hoặc cấu hình tại `fe/tests/`)
*   **Cài đặt trình duyệt chạy thử:**
    ```bash
    cd fe
    npx playwright install
    ```
*   **Thực thi:**
    ```bash
    # Chạy toàn bộ các ca kiểm thử E2E (headless)
    npx playwright test
    
    # Mở giao diện Playwright UI runner để debug trực quan
    npx playwright test --ui
    ```

---

## 6. Quy Tắc Lập Trình Quan Trọng (Development Rules)

> [!IMPORTANT]
> 1. **Tuyệt đối không compile file TypeScript (.ts) ra file .js hay .d.ts trực tiếp trong thư mục src/ hoặc lambda/**. Tất cả sản phẩm build chỉ được đặt trong thư mục `dist/` hoặc `cdk.out/`.
> 2. **Luôn chạy Jest test (`npm test`) và Next.js build (`npm run build`) tại local** trước khi push code lên Git hoặc chạy deploy CDK.
> 3. **Không hardcode các API Key nhạy cảm**. Bất kỳ khóa API nào cũng phải được khai báo qua Secrets Manager và nạp động.
> 4. **Cập nhật báo cáo tiến độ thay đổi** vào thư mục `.report/luminary-report/SKILL.md` theo quy trình.
