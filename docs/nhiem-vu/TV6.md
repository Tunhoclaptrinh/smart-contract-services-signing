# TV6: audit, thông báo, hàng đợi

| | |
| --- | --- |
| Repo | `smart-contract-services-audit` → `btl-backend-audit`, cổng 3008, database `audit`; phần nền outbox, hàng đợi cùng nhóm trưởng (repo cha) |
| Màn web | nhật ký, kiểm toàn vẹn, DLQ, tổng quan, thông báo; script chụp màn hình |
| Saga, thí nghiệm | DLQ; F4; tải k6 cho mọi thí nghiệm |
| Duyệt chéo | TV1 |

**Mục tiêu**: mọi thao tác của mọi service về một nơi kiểm toán độc lập, kiểm được không ai sửa lịch sử;
sự kiện không mất, message hỏng không chặn hàng đợi; người dùng được báo đúng việc.

## Đọc trước (30 phút)

`../NHIEM_VU.md`; `../LUAN_CU_KIEN_TRUC.md` §3, §6 (hàng đợi), §8 L7; `../PHAN_TICH_THIET_KE.md` §7, §9;
`../TAN_DUNG_CODECASH.md` §4.6.

## Mã cũ để xem và chuyển

Đường dẫn tính từ thư mục repo của bạn (thư mục `codecash` nằm cạnh). Mở AI trong repo của bạn là nó đọc
được các đường dẫn này. Giữ, chỉnh hay bỏ từng phần: ``../TAN_DUNG_CODECASH.md` §4.6`; bảng đầy đủ đến từng tệp:
`../DOI_CHIEU_CODECASH.md` (backend), `btl-frontend/docs/DOI_CHIEU_CODECASH.md` (web).

| Loại | Đường dẫn | Xem để |
| --- | --- | --- |
| Backend | `../codecash/apps/api/src/trust/service.ts` | neo chuỗi băm |
| Backend | `../codecash/apps/api/src/trust/anchor-provider.ts` | nơi neo |
| Backend | `../codecash/apps/api/src/trust/timestamp.ts` | dấu thời gian |
| Backend | `../codecash/apps/api/src/domain/views/integrity.ts` | kiểm toàn vẹn |
| Backend | `../codecash/apps/api/src/domain/views/activity.ts` | nhật ký hoạt động |
| Backend | `../codecash/apps/api/src/notifications.ts` | thông báo theo người |
| Web | `../codecash/apps/web/src/features/audit/pages` | nhật ký, toàn vẹn |
| Web | `../codecash/apps/web/src/features/dashboard` | tổng quan, biểu đồ, lịch tới hạn |
| Web | `../codecash/apps/web/src/shared/layout/NotificationDrawer.tsx` | ngăn thông báo (cùng `useNotifications.ts`) |
| Test | `../codecash/tests/foundation/trust.test.mjs` | chuỗi băm, neo |
| Test | `../codecash/tests/foundation/notifications.test.mjs` | thông báo |
| Công cụ | `../codecash/tools/verify_audit.py` | bộ kiểm nhật ký độc lập (dùng khi demo kiểm toán) |
| Script | `../codecash/scripts/guide-screenshots.mjs` | chụp màn hình tự động: chuyển sang web |
| Ảnh | `../codecash/apps/web/public/guide/images` | `integrity`, `activity`, `dashboard*`, `notifications` |

## Phần nền có sẵn cho bạn

Outbox relay, RabbitMQ, `consume()` (idempotent, DLQ), `newEvent()`; CI `stack` đã kiểm sự kiện tới bus. Repo audit đã có, CI xanh.

## Việc theo thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | Bước 1 của `NHIEM_VU.md` §4 | |
| 2 | Chốt phong bì sự kiện (bản nháp đã có: `packages/contracts/schemas/event-envelope.v1.json`, danh mục `events.json`) cùng nhóm trưởng | mọi người duyệt |
| 3 | Dùng hạ tầng có sẵn: RabbitMQ đã ở `compose.yaml`, relay tự đẩy mọi mục nhật ký thành `audit.entry` (`MODULES.md`: `outbox.ts`, `bus.ts`) | audit nhận được `audit.entry` của identity |
| 4 | Consumer của audit bằng `consume(bus, repo, { queue: "audit.all", types: ["#"], handle })` (đã idempotent, thử lại 3 lần, DLQ); thêm `GET /dlq`, `POST /dlq/{id}/replay` | message trùng một mục; message hỏng vào DLQ |
| 5 | Lưu bản sao nhật ký; `GET /audit-entries`, `GET /audit/verify` (đối chiếu đầu chuỗi băm từng service) | sửa một mục ở bản sao → verify báo sai |
| 6 | Thông báo trong ứng dụng, email mô phỏng (`GET /notifications`, đánh dấu đã đọc) | |
| 7 | Màn web nhật ký, toàn vẹn, DLQ, tổng quan (số liệu lấy từ API), thông báo | ≥ 5 test mỗi màn |
| 8 | Chuyển script chụp màn hình tự động sang web, trỏ vào gateway (`BAO_CAO_VA_BAO_VE.md` §3.3) | một lệnh ra bộ ảnh |
| 9 | Kịch bản k6 dùng chung cho F1–F4; Lighthouse trước/sau tách bundle | |
| 10 | F4: tắt execution khi hợp đồng vừa ký, thêm một message hỏng; đo số hợp đồng mất trước/sau | bảng số liệu |
| 11 | Compose, gateway, ≥ 5 request Postman | job `stack` xanh |

## Phối hợp

| Bạn cung cấp | Cho | | Bạn cần | Từ |
| --- | --- | --- | --- | --- |
| phong bì sự kiện, hàng đợi, consumer mẫu | mọi người | | outbox trong chassis | nhóm trưởng |
| kịch bản k6 | TV3, TV4, TV5 | | sự kiện của từng service | mọi người |

## Tự kiểm riêng

- Gửi cùng một message hai lần → một mục.
- Message sai cấu trúc → DLQ sau 3 lần, message sau vẫn được xử lý.
- Tắt audit → các service vẫn thao tác được; bật lại → nhật ký về đủ.

## Báo cáo và vấn đáp

MS 2.4 (đồng bộ, bất đồng bộ), MS 4.1, MS 4.3 (outbox, hàng đợi, DLQ), MS 5.4 (F4), MS 6.2 (số liệu thí
nghiệm); LT e (Lighthouse, độ phủ). Câu hỏi: consumer idempotent và DLQ; kiểm chuỗi băm chéo giữa
service; vì sao hàng đợi chỉ ở năm chỗ.

## Khi chậm

Cắt: neo Merkle → email (giữ thông báo trong ứng dụng) → broker (giữ outbox gửi HTTP có thử lại).
