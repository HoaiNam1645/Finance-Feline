# Kế hoạch phát triển website Thu - Chi (Next.js + PostgreSQL + Prisma + Redis Queue)

## 1) Mục tiêu dự án
Xây dựng hệ thống quản lý dòng tiền cho công ty, đảm bảo:
- Ghi nhận toàn bộ dòng tiền vào/ra.
- Phân loại thu chi rõ ràng (lương, đơn hàng, chi phí văn phòng, ...).
- Quản lý quy trình đề xuất mua hàng: `User tạo yêu cầu -> Admin duyệt -> Kế toán thanh toán + ghi giao dịch`.
- Hệ thống phân quyền mạnh, kiểm soát truy cập theo vai trò và quyền chi tiết.
- Ghi log đầy đủ mọi thao tác thêm/sửa/xóa/phê duyệt/thanh toán để truy vết.
- Hỗ trợ đa tiền tệ (VND, USD), tỷ giá mặc định `1 USD = 25,000 VND`.
- Bắt buộc sử dụng toàn bộ component của `shadcn/ui` trong hệ thống (theo kế hoạch mapping component bên dưới).

## 2) Công nghệ và phiên bản đề xuất (latest tại thời điểm 2026-03-04)
- Next.js: `16.1.6`
- Prisma ORM: `7.4.2`
- PostgreSQL: `18.x` (khuyến nghị dùng minor mới nhất tại thời điểm triển khai)
- Redis: `8.6.1`
- Redis Queue: `BullMQ` (chạy trên Redis)
- Runtime: Node.js `22 LTS`

## 3) Kiến trúc tổng thể
- Frontend + Backend API: Next.js (App Router).
- Database chính: PostgreSQL.
- ORM/Migration: Prisma.
- Queue & background jobs: Redis + BullMQ.
- AuthN/AuthZ:
  - Đăng nhập bằng email/password (hoặc SSO ở phase sau).
  - Session JWT/HTTP-only cookie.
  - RBAC + Permission-based access control.
- Audit log bất biến (append-only), không cho sửa/xóa trực tiếp.

## 4) Module chức năng chính
- Quản lý người dùng & phân quyền.
- Danh mục thu/chi (category master data).
- Sổ quỹ/giao dịch thu chi.
- Yêu cầu mua hàng (purchase request workflow).
- Duyệt yêu cầu (admin).
- Thanh toán & hạch toán giao dịch (kế toán).
- Nhật ký hệ thống (audit log).
- Báo cáo tổng hợp theo kỳ (ngày/tháng/quý/năm).

### 4.1 Yêu cầu UI bắt buộc: shadcn/ui
- Toàn bộ giao diện phải xây từ `shadcn/ui` component trên Next.js. hãy cài tất cả
- Bắt buộc có `component usage matrix`: mỗi component `shadcn/ui` phải có ít nhất 1 màn hình/use-case sử dụng thực tế.
- Không dùng component library khác để thay thế

## 5) Thiết kế cơ sở dữ liệu (mức nghiệp vụ)

### 5.1 Bảng người dùng và phân quyền
- `users`
  - id, email (unique), password_hash, full_name, status, created_at, updated_at.
- `roles`
  - id, code (`ADMIN`, `ACCOUNTANT`, `EMPLOYEE`), name.
- `permissions`
  - id, code (`transaction.create`, `request.approve`, `audit.read`, ...), name.
- `user_roles`
  - user_id, role_id.
- `role_permissions`
  - role_id, permission_id.

### 5.2 Bảng danh mục và cấu hình tiền tệ
- `transaction_categories`
  - id, code, name, type (`INCOME` | `EXPENSE`), is_active.
  - Ví dụ: `SALARY`, `ORDER_COST`, `OFFICE_COST`.
- `currencies`
  - code (`VND`, `USD`), name, precision.
- `exchange_rates`
  - id, from_currency, to_currency, rate, source, effective_from.
  - Dữ liệu mặc định: USD->VND = `25000`.

### 5.3 Bảng giao dịch thu/chi
- `transactions`
  - id, direction (`IN`|`OUT`), category_id, amount_original, currency_code,
    exchange_rate_to_vnd, amount_vnd,
    description, transaction_date,
    payment_method, created_by, approved_by (nullable),
    purchase_request_id (nullable), status,
    created_at, updated_at.

### 5.4 Bảng yêu cầu mua và phê duyệt
- `purchase_requests`
  - id, requester_id, title, description,
    expected_amount, currency_code,
    status (`DRAFT`,`PENDING_APPROVAL`,`APPROVED`,`REJECTED`,`PAID`,`CANCELLED`),
    created_at, updated_at.
- `purchase_request_items`
  - id, request_id, item_name, qty, unit_price, currency_code, subtotal.
- `purchase_request_approvals`
  - id, request_id, action (`APPROVE`,`REJECT`), actor_id, note, acted_at.

### 5.5 Bảng log/audit bắt buộc
- `audit_logs`
  - id, actor_id, actor_role_snapshot,
    action, entity_type, entity_id,
    before_data (jsonb), after_data (jsonb),
    ip_address, user_agent, request_id,
    created_at.

Gợi ý kỹ thuật:
- Dùng soft delete cho dữ liệu nghiệp vụ (`deleted_at`) nhưng `audit_logs` là append-only.
- Thêm index cho các cột tìm kiếm nhiều: `transaction_date`, `category_id`, `status`, `requester_id`, `created_at`.

## 6) Ma trận quyền tối thiểu
- `EMPLOYEE`
  - Tạo/sửa yêu cầu mua của chính mình khi còn `DRAFT` hoặc `REJECTED`.
  - Xem yêu cầu của chính mình.
- `ADMIN`
  - Xem toàn bộ yêu cầu.
  - Duyệt/từ chối yêu cầu.
  - Quản trị user/role/permission.
- `ACCOUNTANT`
  - Xem yêu cầu đã duyệt.
  - Ghi nhận thanh toán và tạo giao dịch thu/chi chính thức.
  - Quản lý danh mục thu/chi, tỷ giá, báo cáo.

## 7) Luồng nghiệp vụ chuẩn
1. User tạo `purchase_request` và submit -> trạng thái `PENDING_APPROVAL`.
2. Admin duyệt:
   - Nếu từ chối -> `REJECTED` (kèm lý do).
   - Nếu duyệt -> `APPROVED`.
3. Kế toán thanh toán:
   - Tạo bản ghi `transactions` (gắn `purchase_request_id`).
   - Cập nhật trạng thái yêu cầu -> `PAID`.
4. Mọi thao tác đều ghi `audit_logs`.

## 8) Redis Queue dùng cho gì
Dùng BullMQ để tách tác vụ nền, giảm tải request đồng bộ:
- Gửi thông báo khi yêu cầu được tạo/duyệt/từ chối/thanh toán.
- Tạo báo cáo tổng hợp định kỳ (daily/monthly).
- Kiểm tra dữ liệu bất thường (ví dụ giao dịch vượt ngưỡng).
- Đồng bộ log sang kho lưu trữ phân tích (nếu mở rộng).

## 9) Nguyên tắc tiền tệ và số liệu
- Lưu song song:
  - `amount_original` theo currency gốc.
  - `exchange_rate_to_vnd` tại thời điểm ghi nhận.
  - `amount_vnd` để báo cáo chuẩn hóa.
- Dùng kiểu `DECIMAL(20,4)` cho amount/rate, tránh float.
- Tỷ giá mặc định hệ thống: `25000`, nhưng cho phép kế toán cập nhật theo ngày.

## 10) Bảo mật và kiểm soát
- Hash password bằng Argon2/Bcrypt.
- Bắt buộc HTTPS, secure cookie, CSRF protection cho form nhạy cảm.
- Row-level authorization ở API layer (không chỉ UI).
- Audit trail không được phép chỉnh sửa.
- Rate limit API đăng nhập và endpoint nhạy cảm.

## 11) Kế hoạch triển khai theo giai đoạn

### Phase 0 - Khởi tạo dự án (1-2 ngày)
- Scaffold Next.js + TypeScript + ESLint + Prettier.
- Cài và init `shadcn/ui`, import toàn bộ component cần dùng vào codebase.
- Cấu hình Prisma + PostgreSQL + Redis.
- Thiết lập CI cơ bản (lint, test, prisma migrate check).

### Phase 1 - Nền tảng dữ liệu và auth (3-5 ngày)
- Thiết kế schema Prisma cho users/roles/permissions/audit/categories/currency.
- Tạo migration + seed dữ liệu mẫu (role, permission, category, tỷ giá mặc định).
- Xây auth + RBAC middleware.

### Phase 2 - Yêu cầu mua + duyệt + thanh toán (5-8 ngày)
- API + UI cho purchase requests.
- API + UI duyệt admin.
- API + UI kế toán thanh toán + sinh transaction.
- Ghi audit log toàn bộ hành động.

### Phase 3 - Thu/chi trực tiếp + báo cáo (4-6 ngày)
- Form nhập giao dịch thu/chi trực tiếp.
- Dashboard: tổng thu, tổng chi, số dư, top danh mục.
- Bộ lọc theo ngày, danh mục, trạng thái, người tạo.
- Hoàn thiện `component usage matrix` để xác nhận đã dùng đủ toàn bộ component `shadcn/ui`.

### Phase 4 - Queue + tối ưu vận hành (2-4 ngày)
- Tích hợp BullMQ cho notification/report jobs.
- Retry policy, dead-letter strategy, monitoring job queue.

### Phase 5 - Hardening & Go-live (3-5 ngày)
- Kiểm thử phân quyền, kiểm thử audit, kiểm thử concurrency.
- Backup/restore PostgreSQL.
- Viết tài liệu vận hành và checklist release.

## 12) Tiêu chí hoàn thành (Definition of Done)
- Không có thao tác nghiệp vụ nào thiếu audit log.
- Mọi endpoint đều qua kiểm tra quyền.
- Quy trình `request -> approve -> pay -> transaction` chạy xuyên suốt.
- Báo cáo tổng hợp đúng theo VND quy đổi.
- Test pass và migration chạy sạch trên môi trường staging.
- Đạt 100% checklist sử dụng component `shadcn/ui` theo `component usage matrix`.

## 13) Rủi ro và cách giảm thiểu
- Sai lệch tỷ giá: chốt tỷ giá tại thời điểm transaction, không hồi tố.
- Lỗi phân quyền: viết integration test cho từng role.
- Dữ liệu lớn chậm: index chuẩn + phân trang + cache báo cáo qua Redis.
- Mất log: dùng transaction DB hoặc outbox pattern để đảm bảo ghi log.

## 14) Danh sách công việc code ngay sau khi bạn duyệt kế hoạch
- Khởi tạo project Next.js + Prisma schema ban đầu.
- Dựng migration cho toàn bộ bảng cốt lõi.
- Seed role/permission/category/currency/rate mặc định.
- Tạo bộ API auth + RBAC + audit middleware.
- Xây UI CRUD yêu cầu mua, duyệt, thanh toán và sổ giao dịch.
