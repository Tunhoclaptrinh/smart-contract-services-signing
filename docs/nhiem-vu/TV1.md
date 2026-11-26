# TV1: nhóm trưởng, identity, gateway, phần nền

| | |
| --- | --- |
| Repo | `smart-contract-services` (repo cha: chassis, gateway, `compose.yaml`, Postman, CI), `smart-contract-services-identity`; phần nền của web |
| Màn web | đăng nhập, đăng ký, quên/đặt lại/đổi mật khẩu, mời thành viên, quản trị (`platform`) |
| Quy tắc bạn giữ | BR-I01, I02 |
| Đã xong | chassis (cả circuit breaker, idempotency, outbox, bus), identity (18 endpoint, 34 test), gateway (đủ route), compose đủ 7 service + RabbitMQ, 6 repo service có khung và CI, Postman 25 request, CI `stack` có kiểm bus, xác thực và quản trị trên web |
| Duyệt chéo | TV6 |

**Mục tiêu**: giữ phần nền chạy, gỡ vướng cho mọi người trong ngày, nối từng service vào hệ chung, giữ
lịch và phạm vi.

## Mã cũ để xem và chuyển

Đường dẫn tính từ thư mục repo của bạn (thư mục `codecash` nằm cạnh). Mở AI trong repo của bạn là nó đọc
được các đường dẫn này. Giữ, chỉnh hay bỏ từng phần: ``../TAN_DUNG_CODECASH.md` §2, §5 (platform)`; bảng đầy đủ đến từng tệp:
`../DOI_CHIEU_CODECASH.md` (backend), `btl-frontend/docs/DOI_CHIEU_CODECASH.md` (web).

| Loại | Đường dẫn | Xem để |
| --- | --- | --- |
| Web | `../codecash/apps/web/src/features/platform/ResourcePage.tsx` | màn quản trị dùng chung (tổ chức, người dùng); đã chuyển, làm tiếp phần còn thiếu |
| Web | `../codecash/apps/web/src/features/platform/PermissionMatrixPage.tsx` | ma trận quyền |
| Web | `../codecash/apps/web/src/shared/layout` | khung, menu theo vai trò (đã chuyển vào phần nền web) |
| Backend | `../codecash/apps/api/src/auth.ts` | đăng nhập cũ (đã chuyển thành identity) |
| Backend | `../codecash/apps/api/src/common` | chassis cũ (đã chuyển thành `packages/nest-common`) |
| Tài liệu | `../codecash/docs/30_HUONG_DAN_TIEP_QUAN_VA_PHAT_TRIEN_TIEP.md` | tiếp quản, hướng phát triển (chương 7 báo cáo) |
| Tài liệu | `../codecash/docs/bpmn/luong-tong-the-theo-vai-tro.drawio` | sơ đồ luồng theo vai trò cho báo cáo |
| Ảnh | `../codecash/apps/web/public/guide/images` | `login*`, `nav-*`, `admin-*`: trạng thái cần chụp lại |

## Việc theo thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | Ngày 0: **còn** thêm quyền repo cho từng người và điền tên vào `SERVICE.md` (repo, khung, thông tin đã xong 27/11) | mọi người clone và `pnpm test` (decision: `pytest`) xanh |
| 2 | Họp khởi động (`TRIEN_KHAI_NHOM.md` §3) | mọi người biết việc 3 ngày đầu |
| 3 | Chốt bản nháp gói hợp đồng v1 và phong bì sự kiện (`packages/contracts/schemas/`, đã có) với TV2, TV3, TV4, TV6; sửa rồi đồng bộ | mọi người đồng ý, 28/11 |
| 4 | ~~Outbox relay, RabbitMQ~~ **đã xong 27/11** (`MODULES.md`: `outbox.ts`, `bus.ts`); hỗ trợ TV6 dùng `consume()` | |
| 5 | ~~CI clone repo service~~ **đã xong**: job `stack` tự đọc `compose.yaml` | |
| 6 | Màn quản trị `platform`: nút mời thành viên, 6 test (PR `smart-contract-web#5`, chờ duyệt) | ≥ 5 test |
| 7 | Hằng ngày: họp 9:00, duyệt PR phần nền trong ngày, đồng bộ phần nền sang mọi repo | |
| 8 | 04/12 ngày tích hợp: dẫn chạy luồng demo | luồng chạy hết |
| 9 | Báo cáo: chương 2, 5.1–5.2, 6.1, 7; LT b, c, g, h; ghép hai báo cáo | |

## Can thiệp và hỗ trợ

- Vào mọi repo bất kỳ lúc nào: ngồi cặp, sửa trên nhánh của thành viên (báo trước), nhận bớt việc (ghi
  bảng theo dõi). Code trong service của người khác vẫn qua PR, chủ service duyệt.
- Đổi phạm vi, cắt tính năng theo `TRIEN_KHAI_NHOM.md` §8, ghi `DINH_VI_SAN_PHAM.md` §7.
- Dấu hiệu cần vào ngay: không có PR sau 2 ngày; CI đỏ quá nửa ngày; hai service hiểu hợp đồng API khác nhau.

## Báo cáo và vấn đáp

Câu hỏi: refresh xoay vòng và phát hiện dùng lại; gateway kiểm JWKS khi đổi khoá; vì sao tách 6 service
(`LUAN_CU_KIEN_TRUC.md` §2); outbox gắn với chuỗi băm.
