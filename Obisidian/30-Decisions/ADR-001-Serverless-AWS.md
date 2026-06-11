# ADR-001 — Serverless AWS (Lambda + Step Functions)

**Ngày:** 2026-06-06
**Status:** Accepted

---

## Quyết định

Dùng AWS Lambda + Step Functions thay vì container (ECS/EC2) hoặc long-running server.

## Bối cảnh

Pipeline dịch PDF nặng (extract + translate nhiều chunk + LaTeX) có thể chạy 3–10 phút tùy kích thước file. Traffic không đều — có thể 0 request/giờ lúc khuya, bùng lên khi share.

## Lý do chọn

- **Pay-per-use:** Không phát sinh cost khi không có job nào đang chạy.
- **Scale tự động:** Step Functions Map state chạy translate với `concurrency=5` mà không cần cấu hình thêm.
- **Timeout đủ dùng:** Lambda timeout 15 phút cho pipeline đủ xử lý PDF lớn.
- **CDK as IaC:** Toàn bộ hạ tầng là TypeScript code, deploy 1 lệnh.

## Đánh đổi

- Cold start Lambda có thể thêm ~1-2s cho request đầu tiên sau thời gian idle.
- Khó debug locally hơn container (dùng `cdk synth` + SAM local hoặc test trực tiếp trên AWS).
- Step Functions có giới hạn execution history 25,000 events.

## Lựa chọn bị loại

- **ECS Fargate:** Phải trả tiền 24/7, over-engineered cho traffic thấp hiện tại.
- **Long-running Express server:** Không scale tốt, cần manage uptime.

---

## Liên kết
- [[Architecture]] — Sơ đồ hệ thống
- [docs/architecture-be.md](../../docs/architecture-be.md)
