# Kế Hoạch Redesign Dashboard Theo Team

## 1) Hiện trạng hệ thống (đã kiểm tra code)
- **Dashboard hiện tại**: chỉ thống kê tổng thu/chi toàn công ty theo kỳ thời gian, chưa có lọc theo team.
- **Database hiện tại**: chưa có bảng/trường `team` trong `prisma/schema.prisma`.
- **Dữ liệu seed đang có 3 role**: `ADMIN`, `ACCOUNTANT`, `EMPLOYEE` (đây là quyền, **không phải team**).

Kết luận: hiện tại hệ thống **chưa thể trả lời chính xác “công ty có bao nhiêu team”** vì chưa lưu team như một thực thể dữ liệu.

## 2) Mục tiêu redesign
- Quản lý được danh sách team của công ty.
- Mỗi giao dịch thu/chi gắn được với team.
- Dashboard xem được:
  - Tổng quan toàn công ty.
  - So sánh từng team.
  - Drill-down 1 team (doanh thu, chi phí, lợi nhuận, top danh mục).

## 3) Thiết kế dữ liệu đề xuất

### 3.1 Prisma models mới
```prisma
model Team {
  id          String   @id @default(cuid())
  code        String   @unique
  name        String
  isActive    Boolean  @default(true) @map("is_active")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  users        UserTeam[]
  transactions Transaction[]

  @@map("teams")
}

model UserTeam {
  userId String @map("user_id")
  teamId String @map("team_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  team   Team   @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@id([userId, teamId])
  @@map("user_teams")
}
```

### 3.2 Bổ sung vào model hiện có
```prisma
model Transaction {
  // existing fields...
  teamId String? @map("team_id")
  team   Team?   @relation(fields: [teamId], references: [id])

  @@index([teamId, transactionDate])
}

model User {
  // existing fields...
  teams UserTeam[]
}
```

## 4) API cần bổ sung
- `GET /api/teams`: danh sách team.
- `POST /api/teams`: tạo team (admin).
- `PATCH /api/teams/:id`: sửa team (admin).
- `GET /api/dashboard/team-summary?from&to`: trả về KPI theo từng team.
- `GET /api/dashboard/team-detail?teamId&from&to`: trả về biểu đồ + top category cho 1 team.

## 5) Quy tắc nghiệp vụ đề xuất
- Mọi giao dịch mới **bắt buộc** chọn `teamId` (trừ dữ liệu cũ cho phép null).
- Nếu user thuộc nhiều team, có thể chọn team khi tạo giao dịch.
- `ADMIN`: xem toàn bộ team.
- `ACCOUNTANT`: mặc định xem tất cả team, có lọc team.
- `EMPLOYEE`: chỉ xem team mà user thuộc về.

## 6) Wireframe trang chủ mới (Dashboard v2)

```text
+-----------------------------------------------------------------------------------+
| Dashboard Tài Chính Theo Team                                 [Kỳ: Tháng này  v] |
|                                                               [Team: Tất cả  v]  |
+-----------------------------------------------------------------------------------+
| Tổng Doanh Thu | Tổng Chi Phí | Lợi Nhuận Ròng | Biên Lợi Nhuận | Số Team Hoạt Động |
| 2.4 tỷ         | 1.6 tỷ       | 0.8 tỷ          | 33.3%          | 6                  |
+-----------------------------------------------------------------------------------+
| Doanh thu vs Chi phí theo Team (bar chart)                                        |
| Team A █████████████  Team B ████████  Team C ███████ ...                        |
+-----------------------------------------------------------------------------------+
| Xu hướng theo tháng (line chart)                                                   |
| Thu  ────────────                                                               |
| Chi  ────────                                                                    |
+-----------------------------------------------------------------------------------+
| Bảng xếp hạng Team                                                                |
| Team | Doanh thu | Chi phí | Lợi nhuận | % Chi/Thu | Số giao dịch | Cảnh báo       |
| A    | ...       | ...     | ...       | ...       | ...          | OK             |
| B    | ...       | ...     | ...       | ...       | ...          | Vượt ngưỡng    |
+-----------------------------------------------------------------------------------+
| Team Detail (khi chọn 1 team)                                                     |
| - Top 5 danh mục chi tiêu                                                         |
| - Top 5 nguồn doanh thu                                                           |
| - 10 giao dịch gần nhất                                                           |
+-----------------------------------------------------------------------------------+
```

## 7) Lộ trình triển khai (khuyến nghị)
1. **Sprint 1**: thêm schema `Team`, migration, seed team mẫu, cập nhật form tạo giao dịch có `teamId`.
2. **Sprint 2**: build API dashboard theo team + phân quyền truy cập dữ liệu team.
3. **Sprint 3**: build Dashboard v2 UI (KPI + chart + bảng xếp hạng + team detail).
4. **Sprint 4**: backfill dữ liệu cũ (gán team mặc định), kiểm thử, rollout.

## 8) Rủi ro và cách xử lý
- Dữ liệu cũ không có `teamId`: tạo job backfill theo rule (theo user tạo giao dịch hoặc team mặc định).
- User đa team gây nhập sai team: bắt buộc chọn team + log audit khi sửa.
- Dashboard nặng: tổng hợp ở server theo khoảng thời gian, thêm index `[teamId, transactionDate]`.

## 9) Quyết định cần bạn chốt trước khi code
- Team là 1 user có thể thuộc **1 team** hay **nhiều team**?
- Cho phép xem chéo team ở mức nào với `ACCOUNTANT`?
- KPI chuẩn dùng: `doanh thu - chi phí` hay thêm `công nợ/chưa ghi nhận`?
