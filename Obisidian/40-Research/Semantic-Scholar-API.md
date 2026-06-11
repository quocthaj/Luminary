# Semantic Scholar API — Research Notes

> Chuẩn bị cho Story 3.5

## Endpoint cần dùng

```
GET https://api.semanticscholar.org/graph/v1/paper/search
  ?query=<title hoặc keywords>
  &fields=title,authors,year,abstract,openAccessPdf
  &limit=5
```

Không cần API key cho public search (rate limit ~100 req/5 phút).

## Response mẫu

```json
{
  "data": [
    {
      "paperId": "...",
      "title": "Attention Is All You Need",
      "authors": [{ "name": "Ashish Vaswani" }],
      "year": 2017,
      "abstract": "...",
      "openAccessPdf": { "url": "https://..." }
    }
  ]
}
```

## Plan implement Story 3.5

```
Next.js Route: GET /api/semantic-scholar?jobId=...
  → DynamoDB lấy fileName/originalName của jobId
  → Trích title từ fileName (bỏ extension, trim)
  → Gọi Semantic Scholar API
  → Return top 5: { title, authors, year, abstract, pdfUrl }
```

## Edge cases cần xử lý

- FileName có thể là tên file lộn xộn (`2106.03415.pdf`) — cần fallback dùng keyword extraction từ nội dung.
- Abstract có thể `null` — hiển thị "Không có tóm tắt".
- `openAccessPdf` có thể `null` — ẩn button PDF.
- Rate limit: nếu nhiều user query cùng lúc → cần cache result theo jobId (lưu vào S3 hoặc DynamoDB TTL cache).

## Giao diện đề xuất (cột phải)

```
┌─────────────────────────────┐
│ 🔍 Bài báo liên quan        │
├─────────────────────────────┤
│ [Title] (2024)              │
│ Authors: A, B, C            │
│ Abstract preview...         │
│ [📄 PDF] [🔗 Link]          │
├─────────────────────────────┤
│ [Title] (2023)              │
│ ...                         │
└─────────────────────────────┘
```

---

## Liên kết
- [[../20-Sprints/Epic-3-Current]] — Story 3.5 trong backlog
