# Deferred Work List

This file tracks technical debt and deferred items from code reviews.

## Deferred from: code review of 1-2-goi-api-upload-presigned-url-voi-xu-ly-loi-ket-noi-presigned-upload-network-error-auto-retry (2026-06-07)
- Dev Test Panel left in code for verification [fe/components/UploadView.tsx:482] — deferred, pre-existing

## Deferred from: code review of 2-3-lambda-authorizer-xac-thuc-jwt-jwt-web-crypto-lambda-authorizer.md (2026-06-08)
- Bảo vệ route GET /job/{jobId} — Trì hoãn (Lý do: Tạm thời muốn build hoàn chỉnh MVP rồi xem xét sau)
- Bật API Gateway Authorizer Cache TTL lên 300s khi deploy môi trường Production [be/lib/be-stack.ts:441] — Trì hoãn (Lý do: Để 0s phục vụ debug dev/testing, sẽ bật 300s khi lên Prod)

## Deferred from: code review of 3-3-api-rag-chat-an-toan-secure-rag-chat-api-namespace-filter.md (2026-06-11)
- Hardcoded AWS Secrets Manager ARN in CDK stack [be/lib/be-stack.ts:217] — deferred, pre-existing (ARN is hardcoded, restricting deployment to account 042360978148)
