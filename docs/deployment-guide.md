# Hướng Dẫn Triển Khai — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Tổng Quan Hạ Tầng

| Component | Platform | Region | Phương thức deploy |
|-----------|----------|--------|-------------------|
| Backend Stack | AWS (CDK) | ap-southeast-1 | `cdk deploy` |
| Frontend | Vercel | Global | Git push / `vercel deploy` |

## Backend Deployment (AWS CDK)

### Yêu Cầu

1. AWS CLI đã cấu hình (`aws configure`)
2. AWS CDK CLI đã cài đặt (`npm install -g aws-cdk`)
3. 4 secrets đã tạo trong Secrets Manager (xem Development Guide)
4. CDK bootstrap đã chạy cho region:
   ```bash
   npx cdk bootstrap aws://{ACCOUNT_ID}/ap-southeast-1
   ```

### Quy Trình Deploy

```bash
cd be
npm install
npm run build
npx cdk synth        # Kiểm tra template trước
npx cdk deploy       # Deploy lên AWS
```

### Resources Tạo Bởi CDK

| Resource | Tên |
|----------|-----|
| S3 Bucket (uploads) | `vietai-uploads-{accountId}` |
| S3 Bucket (results) | `vietai-results-{accountId}` |
| S3 Bucket (frontend) | `vietai-frontend-{accountId}` |
| DynamoDB Table | `vietai-jobs` |
| Lambda (orchestrator) | `vietai-orchestrator` |
| Lambda (extract) | `vietai-extract` |
| Lambda (translate) | `vietai-translate` |
| Lambda (latex) | `vietai-latex` |
| Lambda (merge) | `vietai-merge` |
| Step Functions | `vietai-processing-pipeline` |
| API Gateway | `vietai-scholar-api` (stage: dev) |
| IAM Role | Lambda execution role |

### Outputs Sau Deploy

| Output | Export Name |
|--------|------------|
| Uploads Bucket | `VietAI-UploadsBucket` |
| Results Bucket | `VietAI-ResultsBucket` |
| DynamoDB Table | `VietAI-JobsTable` |
| API Endpoint | `VietAI-APIEndpoint` |
| Lambda Function | `VietAI-LambdaFunction` |

### Lưu Ý Quan Trọng

- **RemovalPolicy:** DynamoDB table dùng `DESTROY` (dev). Đổi sang `RETAIN` cho production.
- **CORS:** API Gateway cho phép ALL_ORIGINS (dev). Restrict cho production.
- **Throttling:** 100 req/s, burst 200 (có thể tăng).
- **Lambda timeout:** Orchestrator 10 phút, workers 1-2 phút.
- **Step Functions timeout:** 15 phút tổng pipeline.

## Frontend Deployment (Vercel)

### Cấu Hình

File `vercel.json`:
```json
{
  "framework": "nextjs"
}
```

### Deploy

```bash
cd fe
npx vercel deploy       # Preview
npx vercel deploy --prod  # Production
```

Hoặc kết nối Git repo với Vercel dashboard cho auto-deploy on push.

### Sau Deploy

Cập nhật `API_BASE` trong `fe/lib/api.ts` nếu API Gateway endpoint thay đổi.

## CI/CD

Hiện tại chưa có CI/CD pipeline tự động. Khuyến nghị:

1. **Backend:** GitHub Actions → `cdk deploy` on push to `main`
2. **Frontend:** Vercel auto-deploy từ Git

## Monitoring

- **Lambda logs:** CloudWatch Logs (Lambda execution role có `CloudWatchLogsFullAccess`)
- **Step Functions:** AWS Console → Step Functions → Executions
- **DynamoDB:** DynamoDB Streams (NEW_AND_OLD_IMAGES) — có thể hook EventBridge
- **API Gateway:** CloudWatch Metrics (built-in)
