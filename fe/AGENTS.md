# VietAI Scholar - Frontend

## Stack
Next.js 14 App Router, TailwindCSS, TypeScript

## API
Base: https://5c2wlnvtsh.execute-api.ap-southeast-1.amazonaws.com/dev
- POST /upload → { jobId, uploadUrl }
- GET /job/{jobId} → { status }
- GET /result/{jobId} → { downloadUrl }

## Rules
- API calls qua lib/api.ts only
- Poll mỗi 3s, clear interval on unmount
- PDF only, max 50MB