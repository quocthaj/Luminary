# Hướng Dẫn Triển Khai (Deployment Guide) — VietAI Scholar

> Tài liệu mô tả cấu trúc triển khai hạ tầng, quy trình publish Backend lên AWS Cloud và Frontend lên Vercel.  
> Cập nhật mới nhất: 2026-07-07

---

## 1. Tổng Quan Triển Khai

Hệ thống monorepo VietAI Scholar được phân chia thành hai khu vực triển khai chính để tối ưu hóa chi phí và tốc độ tải trang:

| Phân vùng | Nền tảng triển khai | Vùng vật lý (Region) | Phương thức cập nhật |
| :--- | :--- | :--- | :--- |
| **Backend Infrastructure**| Amazon Web Services (AWS) | `ap-southeast-1` (Singapore)| AWS CDK CLI (`cdk deploy`) |
| **Web Frontend** | Vercel | Global CDN (Vercel Edge) | Vercel Git Integration / Vercel CLI |

---

## 2. Triển Khai Backend Lên AWS Cloud

### 2.1. Yêu cầu chuẩn bị
1.  **AWS CLI** đã xác thực và cấu hình tài khoản qua lệnh `aws configure`.
2.  Đã cài đặt **AWS CDK CLI** (`npm install -g aws-cdk`).
3.  Triển khai CDK Bootstrap trên region mong muốn (Singapore):
    ```bash
    npx cdk bootstrap aws://{YOUR_ACCOUNT_ID}/ap-southeast-1
    ```
4.  Thiết lập đầy đủ 9 Keys bí mật trên **AWS Secrets Manager** (chi tiết xem tại [Hướng dẫn phát triển](./development-guide.md#4-tao-khoa-bi-mat-tren-aws-secrets-manager)).

### 2.2. Lệnh thực thi deploy
```bash
cd be
npm install
npm run build
npx cdk synth        # Tạo và kiểm tra CloudFormation Template
npx cdk deploy       # Triển khai trực tiếp lên AWS
```

### 2.3. Danh sách tài nguyên Cloud được tạo lập bởi CDK

#### Cơ sở dữ liệu & Lưu trữ (Storage & Database)
*   **S3 Buckets**:
    1.  `vietai-uploads-{accountId}`: Nhận PDF tải lên.
    2.  `vietai-results-{accountId}`: Lưu trữ Markdown song ngữ, flashcards, mindmaps, audio podcast.
    3.  `vietai-frontend-{accountId}`: Lưu trữ bản build tĩnh frontend (nếu sử dụng hosting S3).
*   **DynamoDB Tables**:
    1.  `vietai-jobs`: Lưu trữ thông tin tiến trình dịch.
    2.  `vietai-quiz-shares`: Lưu thông tin mã trắc nghiệm chia sẻ.
    3.  `vietai-thesis-defense-sessions`: Lưu trữ các phiên phản biện ảo.
    4.  `vietai-user-competency-profile`: Lưu trữ hồ sơ năng lực học viên.

#### Điện toán Serverless (Serverless Compute & APIs)
*   **AWS Lambda Functions**:
    1.  `vietai-orchestrator`: Nhận API Gateway routing & S3 upload trigger.
    2.  `vietai-extract`: Trích xuất PDF text.
    3.  `vietai-translate`: Dịch thuật song ngữ từng đoạn.
    4.  `vietai-latex`: Phát hiện & chuẩn hóa công thức LaTeX.
    5.  `vietai-merge`: Gộp kết quả và chèn placeholders.
    6.  `vietai-ingest`: Vector hóa và upload dữ liệu lên Qdrant Cloud.
    7.  `vietai-defense-copilot`: Điều phối Thesis Defense và Research Copilot.
    8.  `vietai-jwt-authorizer`: Lambda Custom Authorizer kiểm chứng JWT token.
*   **API Gateway**: `vietai-scholar-api` (Stage: `dev` hoặc `prod`)
*   **AWS Step Functions**: Đường ống điều phối bất đồng bộ `vietai-processing-pipeline`.

---

## 3. Triển Khai Frontend Lên Vercel

Ứng dụng Next.js 16 được cấu hình tối ưu để triển khai trực tiếp trên nền tảng đám mây Vercel.

### 3.1. Cấu hình Vercel (`fe/vercel.json`)
```json
{
  "framework": "nextjs"
}
```

### 3.2. Cấu hình biến môi trường trên Vercel Dashboard
Trước khi kích hoạt build, bạn cần khai báo các biến môi trường sau tại Vercel Settings -> Environment Variables:
1.  `NEXTAUTH_URL`: Địa chỉ URL trang web của bạn (ví dụ: `https://vietai-scholar.vercel.app` hoặc `http://localhost:3000` cho dev).
2.  `AUTH_SECRET`: Khóa bí mật dùng để mã hóa session cookie Next-Auth.
3.  `NEXT_PUBLIC_API_URL`: Địa chỉ API Gateway Endpoint nhận được sau khi chạy lệnh `cdk deploy` ở mục 2.2 (ví dụ: `https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev`).

### 3.3. Các lệnh deploy thủ công qua Vercel CLI
```bash
cd fe
# Triển khai bản xem trước (Preview Deployment)
npx vercel

# Triển khai bản chính thức (Production Deployment)
npx vercel --prod
```
*Lưu ý: Cách triển khai tốt nhất là kết nối repository GitHub của bạn với Vercel để hệ thống tự động kích hoạt CI/CD trigger deploy mỗi khi có sự thay đổi trên nhánh `main`.*

---

## 4. Giám Sát Hệ Thống & Kiểm Tra Log (Monitoring)

### 4.1. Hệ thống Log của AWS Lambdas
Mọi hoạt động và lỗi phát sinh từ Lambda được ghi nhận trực tiếp trên **Amazon CloudWatch Logs**:
*   Truy cập CloudWatch -> Log groups -> Tìm kiếm `/aws/lambda/vietai-*`.
*   *Mẹo:* Lambda Authorizer và Orchestrator là hai vị trí chính cần kiểm tra nếu frontend nhận mã lỗi `401 Unauthorized` hoặc `500 Internal Server Error`.

### 4.2. Giám sát đường ống Step Functions
*   Truy cập AWS Console -> Step Functions -> State Machines -> Chọn `vietai-processing-pipeline`.
*   Tại đây, bạn có thể xem lại lịch sử từng lượt chạy (executions), xem bước nào bị lỗi (failed) và kiểm tra dữ liệu đầu vào/đầu ra của từng State.

### 4.3. Giám sát Vector Database & AI Services
*   **Qdrant Cloud:** Đăng nhập vào bảng điều khiển Qdrant Cloud dashboard để kiểm tra số lượng vectors trong collection `vietai-scholar-chunks`, dung lượng lưu trữ và số lượt truy vấn.
*   **Google Cloud Console:** Theo dõi hạn ngạch (quotas) và số lượng yêu cầu gọi API dịch thuật Text-to-Speech (TTS).

---

## 5. Lưu Ý Vận Hành Production (Production Checklist)

> [!WARNING]
> 1. **Cờ RemovalPolicy trong CDK**: Trong tệp `be/lib/be-stack.ts`, hãy chuyển đổi `removalPolicy: RemovalPolicy.DESTROY` của các bảng DynamoDB và S3 Buckets thành `RemovalPolicy.RETAIN` trước khi deploy Production để tránh nguy cơ mất mát dữ liệu khi xóa/cập nhật stack.
> 2. **Hạn chế CORS API Gateway**: Thu hẹp phạm vi `allowOrigins` của API Gateway từ `Cors.ALL_ORIGINS` sang danh sách tên miền cụ thể của bạn (ví dụ: `https://your-domain.com`).
> 3. **Hạn ngạch AI Providers**: Đảm bảo tài khoản thanh toán của Groq, Google Cloud và Qdrant đã được kích hoạt thẻ tín dụng để tránh lỗi gián đoạn do vượt quá hạn ngạch miễn phí (Rate limit / Quota limits).
