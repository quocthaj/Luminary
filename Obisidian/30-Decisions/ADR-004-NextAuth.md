# ADR-004 — NextAuth cho Authentication

**Ngày:** 2026-06-06
**Status:** Accepted

---

## Quyết định

Dùng **NextAuth.js** với Google OAuth + Email OTP (Passwordless). JWT stateless (HS256), không dùng database session.

## Lý do chọn

- **Tích hợp tự nhiên với Next.js** — middleware, server components, route handlers đều có `getServerSession`.
- **Stateless JWT:** Không cần bảng sessions trong DynamoDB, giảm read/write cost.
- **Google OAuth:** Đơn giản nhất cho target audience (sinh viên, học giả có Gmail).
- **Email OTP:** Fallback cho người không muốn OAuth, không cần nhớ mật khẩu.

## Lambda Authorizer — tại sao không dùng thư viện JWT

Lambda Authorizer (`authorizer.ts`) dùng **Node.js 20 Web Crypto API thuần** để verify JWT HS256:
- Bundle size < 10KB (requirement ADD-4).
- Không import `jsonwebtoken` hay `jose` → tránh cold start nặng.
- `AUTH_SECRET` lấy từ AWS Secrets Manager, cache in-memory.

## Flow xác thực

```
FE (NextAuth session cookie)
  → Next.js Server Route kiểm tra getServerSession
  → Gọi AWS API Gateway kèm header Authorization: Bearer <JWT>
  → Lambda Authorizer verify HS256 → inject userId vào context
  → Protected Lambda handler nhận userId từ context
```

## Đánh đổi

- Stateless JWT không thể revoke ngay lập tức (phải chờ hết hạn).
- Email OTP cần SMTP provider (cấu hình thêm so với OAuth).

---

## Liên kết
- [[Architecture]] — Auth flow trong hệ thống
