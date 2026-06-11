# Commands — Quick Reference

## Frontend (fe/)

```bash
# Dev server
cd fe && pnpm dev

# Build
cd fe && pnpm build

# Type check
cd fe && pnpm tsc --noEmit

# Sync types từ backend
cd fe && pnpm prebuild   # chạy scripts/sync-types.js
```

## Backend (be/)

```bash
# Deploy toàn bộ stack
cd be && npx cdk deploy

# Synthesize CloudFormation (không deploy)
cd be && npx cdk synth

# Xem diff trước khi deploy
cd be && npx cdk diff

# Build + package Lambda
cd be && pnpm build

# Run tests
cd be && pnpm test
```

## AWS CLI

```bash
# Xem log Lambda Orchestrator (tail)
aws logs tail /aws/lambda/vietai-orchestrator --follow --region ap-southeast-1

# Xem log Lambda Extract
aws logs tail /aws/lambda/vietai-extract --follow --region ap-southeast-1

# List DynamoDB jobs của user
aws dynamodb query \
  --table-name vietai-jobs \
  --index-name userIdIndex \
  --key-condition-expression "userId = :uid" \
  --expression-attribute-values '{":uid":{"S":"<userId>"}}' \
  --region ap-southeast-1

# Xem Step Functions executions gần nhất
aws stepfunctions list-executions \
  --state-machine-arn <ARN> \
  --max-results 5 \
  --region ap-southeast-1
```

## Qdrant

```bash
# Health check (thay URL bằng Qdrant Cloud endpoint của bạn)
curl https://<cluster>.qdrant.io/health

# Xem collection info
curl https://<cluster>.qdrant.io/collections/vietai-scholar-chunks \
  -H "api-key: <key>"

# Count vectors
curl -X POST https://<cluster>.qdrant.io/collections/vietai-scholar-chunks/points/count \
  -H "api-key: <key>" \
  -H "Content-Type: application/json" \
  -d '{"exact": false}'
```

## Git

```bash
# Feature branch mới
git checkout -b feat/story-3-4-chat-panel-ui

# Push + PR
git push -u origin feat/story-3-4-chat-panel-ui
gh pr create --title "feat(3.4): AI Tutor Chat Panel UI"
```

---

## Liên kết
- [docs/development-guide.md](../../docs/development-guide.md)
- [docs/deployment-guide.md](../../docs/deployment-guide.md)
