# Hướng Dẫn Phát Triển — VietAI Scholar

> Tự động tạo bởi BMad Document Project · 2026-06-06

## Yêu Cầu Hệ Thống

| Yêu cầu | Phiên bản |
|----------|-----------|
| Node.js | ≥ 20.x |
| npm | ≥ 9.x |
| AWS CLI | ≥ 2.x |
| AWS CDK CLI | 2.1123.0 |
| TypeScript | ~5.9.3 |

## Cài Đặt

### Backend

```bash
cd be
npm install
```

### Frontend

```bash
cd fe
npm install
```

## Chạy Local

### Frontend (Development Server)

```bash
cd fe
npm run dev
```

→ Mở `http://localhost:3000`

### Backend (CDK)

```bash
cd be
npm run build          # Compile TypeScript
npx cdk synth          # Synthesize CloudFormation template
npx cdk deploy         # Deploy lên AWS
```

### Testing

```bash
cd be
npm test               # Run Jest tests
```

## Biến Môi Trường

### Backend Lambda (tự động set bởi CDK)

| Biến | Mô tả |
|------|-------|
| `S3_UPLOADS_BUCKET` | Tên bucket upload PDF |
| `S3_RESULTS_BUCKET` | Tên bucket kết quả |
| `DYNAMODB_TABLE` | Tên bảng DynamoDB |
| `GROQ_SECRET_ARN` | ARN secret Groq API key |
| `GEMINI_SECRET_ARN` | ARN secret Gemini API key |
| `DEEPSEEK_SECRET_ARN` | ARN secret DeepSeek API key |
| `MISTRAL_SECRET_ARN` | ARN secret Mistral API key |
| `STATE_MACHINE_ARN` | ARN Step Functions (tự động inject) |
| `AWS_REGION` | Tự động có trong Lambda runtime |

### Frontend

| Biến | Giá trị | File |
|------|---------|------|
| API_BASE | Hardcoded trong `lib/api.ts` | `fe/lib/api.ts` |

## Build Commands

| Command | Thư mục | Mô tả |
|---------|---------|-------|
| `npm run build` | `be/` | TypeScript compile |
| `npm run watch` | `be/` | TypeScript watch mode |
| `npm test` | `be/` | Jest tests |
| `npm run cdk` | `be/` | CDK CLI shortcut |
| `npm run dev` | `fe/` | Next.js dev server |
| `npm run build` | `fe/` | Next.js production build |
| `npm start` | `fe/` | Next.js production server |
| `npm run lint` | `fe/` | ESLint |

## AWS Secrets Setup

Trước khi deploy, cần tạo 4 secrets trong AWS Secrets Manager:

```bash
aws secretsmanager create-secret --name vietai/groq-api-key --secret-string "your-groq-key"
aws secretsmanager create-secret --name vietai/gemini-api-key --secret-string "your-gemini-key"
aws secretsmanager create-secret --name viet-ai-scholar/deepseek-api-key --secret-string "your-deepseek-key"
aws secretsmanager create-secret --name viet-ai-scholar/mistral-api-key --secret-string "your-mistral-key"
```

## Quy Trình Deploy

### Backend

```bash
cd be
npm run build
npx cdk deploy
```

CDK sẽ:
1. Bundle Lambda functions (esbuild)
2. Copy pdfjs-dist vào bundle
3. Tạo/cập nhật CloudFormation stack `VietAIScholarStack`
4. Output: API endpoint URL, bucket names, table name

### Frontend

```bash
cd fe
npm run build
# Deploy lên Vercel (đã có vercel.json)
```

**vercel.json config:**
```json
{ "framework": "nextjs" }
```

## Cấu Hình TypeScript

### Backend (`be/tsconfig.json`)
- Target: ES2022
- Module: NodeNext
- Strict mode: Bật
- Inline source maps: Bật

### Frontend (`fe/tsconfig.json`)
- Next.js default config

## Testing

- **Framework:** Jest + ts-jest
- **Config:** `be/jest.config.js`
- **Test files:** `be/test/be.test.ts`
- **Convention:** `*.test.ts`
