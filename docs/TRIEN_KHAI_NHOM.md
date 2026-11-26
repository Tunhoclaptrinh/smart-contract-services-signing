# Triển khai cho nhóm trong thời gian gấp

Sổ tay làm việc từ 27/11 đến buổi bảo vệ (~15/12). Lịch tổng và prompt mẫu: `KICH_BAN_VIBE_CODE.md`.
Tệp này đi sâu hơn: **trưởng nhóm làm gì hôm nay, từng người làm gì ba ngày đầu, chuyển một mô-đun cũ
theo đúng các bước nào, nhịp họp, theo dõi tiến độ, và cắt gì khi trễ.**

**Luật cập nhật**: trưởng nhóm sửa §1 (tình trạng) mỗi tối; ai đổi cách làm chung (§4, §6) thì sửa
tệp này trong cùng PR với thay đổi đó.

## 1. Tình trạng hôm nay (27/11, tối)

| Đã xong (dùng được ngay) | Còn chờ |
| --- | --- |
| **6 repo service** đã tạo, bảo vệ nhánh, CI xanh: contract, signing, execution, payment, audit (NestJS, khung chassis) và decision (Python FastAPI, khung cùng quy ước: token RS256, problem+json, phong bì, health, Dockerfile, CI) | thêm quyền Write cho từng người (chờ tên GitHub) |
| `SERVICE.md` mỗi repo đã điền chủ (theo số TV), cổng, database, tiền tố gateway, dữ liệu và endpoint dự kiến | điền tên người khi chốt số |
| Chassis: lỗi RFC 9457, DTO, lọc/nhập/xuất, `ServiceClient` có timeout, thử lại, **circuit breaker, bulkhead**; `@Idempotent()`; token RS256; **outbox relay, bus RabbitMQ, `consume()` idempotent có DLQ**; phong bì sự kiện `newEvent()` | — |
| `compose.yaml` chạy **đủ 7 service + gateway + RabbitMQ**, mỗi service một database; `gateway/routes.json` đủ tiền tố; CI `stack` tự clone mọi repo, Newman 25 request xanh, kiểm sự kiện tới được RabbitMQ | — |
| Bản nháp hợp đồng chung: `packages/contracts/schemas/contract-package.v1.json`, `event-envelope.v1.json`, danh mục `events.json` | chủ service chốt nội dung trước 28/11 |
| identity đầy đủ (18 endpoint, 34 test); web: khung, xác thực đầy đủ, quản trị (nút mời thành viên, test màn quản trị), 60 test, độ phủ 73% | PR web `smart-contract-web#5` chờ duyệt |
| Tài liệu: nhiệm vụ, thẻ từng người kèm đường dẫn mã cũ, hệ thống, thiết kế, luận cứ, định vị, tận dụng, báo cáo | — |

## 2. Ngày 0: trưởng nhóm (hôm nay)

Làm theo thứ tự; mỗi dòng có cách kiểm.

| # | Việc | Cách làm | Xong khi |
| --- | --- | --- | --- |
| 1 | Gom tài khoản GitHub và số TV của 5 người | tin nhắn nhóm | có đủ tên |
| 2 | Thêm người vào repo cha, identity, web và repo service của họ, quyền Write | `gh api -X PUT repos/Tunhoclaptrinh/<repo>/collaborators/<tên> -f permission=push` | mọi người clone được |
| 3 | ~~Tạo 5 repo service NestJS~~ | **đã xong 27/11** | CI xanh |
| 4 | ~~Tạo repo decision (Python)~~ | **đã xong 27/11** (khung; engine TV5 chuyển) | CI xanh |
| 5 | Điền "Thông tin" trong `SERVICE.md` từng repo | **đã xong**, còn điền tên người | |
| 6 | ~~Đổi thương hiệu web~~ | **đã xong** | |
| 7 | Họp khởi động 45 phút | §3 | mỗi người biết việc ba ngày đầu |

## 3. Họp khởi động (45 phút)

| Phút | Nội dung | Tài liệu mở trên màn |
| --- | --- | --- |
| 0–5 | Sản phẩm trong một câu; BTL khác bài dự thi ở đâu | `DINH_VI_SAN_PHAM.md` §1–2 |
| 5–12 | Toàn cảnh 8 thành phần, ai giữ cái nào | `HE_THONG.md` §1–2, `KICH_BAN_VIBE_CODE.md` §3 |
| 12–20 | Đồng bộ hay hàng đợi, ba ranh giới dữ liệu | `LUAN_CU_KIEN_TRUC.md` §2–3 |
| 20–27 | Tận dụng: 4 mức hành động, mã sạch, 12 sửa chung C1–C12 | `TAN_DUNG_CODECASH.md` §1, §3 |
| 27–35 | Chạy thử cùng nhau: clone, `pnpm install && pnpm test`, `docker compose up`, đăng nhập web | §2 của `KICH_BAN_VIBE_CODE.md` |
| 35–42 | "Xong là thế nào", nhịp làm việc, nơi hỏi | `KICH_BAN_VIBE_CODE.md` §3.1, §6 của tệp này |
| 42–45 | Mỗi người nói việc ngày mai | §5 |

## 4. Checklist chuyển một mô-đun cũ

### 4.1. Backend (một nhóm tệp của `codecash/apps/api/src` sang service của mình)

1. `git switch main && git pull && git fetch upstream` (có phần nền mới thì đồng bộ trước).
2. `git switch -c feat/<svc>-<việc>`.
3. Tra `TAN_DUNG_CODECASH.md` §4 (hành động, sửa gì) và `DOI_CHIEU_CODECASH.md` (tệp nào).
4. Chép tệp cũ vào `service/src/` giữ tên hàm, tên trường, mã lỗi; sửa import (C1) cho biên dịch được.
5. Liệt kê luật nghiệp vụ trong tệp (bắt AI liệt kê, kèm mục `NGHIEP_VU.md` hoặc mã BR) **trước** khi sửa.
6. Sửa theo mã C1–C12 áp dụng cho tệp, gồm làm sạch chú thích và tham chiếu cũ (C12); mỗi nhóm sửa một
   commit Conventional Commits (`feat(<svc>): …`, `refactor(<svc>): call decision over HTTP`).
7. DTO cho mọi body mới (C4); route REST đúng §6 thiết kế (C10).
8. Test: mỗi endpoint một ca đúng + một ca lỗi 4xx; mỗi quy tắc mình phụ trách một ca vi phạm; chép
   test cũ liên quan (`TAN_DUNG_CODECASH.md` §6).
9. Cập nhật `openapi.yaml`, `SERVICE.md` (sơ đồ mã, endpoint, rà soát, cải tiến): `pnpm check:docs` xanh.
10. Thêm ≥ 1 request Postman cho endpoint mới (`btl-backend/postman/`, PR vào repo cha `main`).
11. `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` xanh → push → PR (PR nhỏ, một việc) → một người duyệt → merge commit.

### 4.2. Web (một màn của `codecash/apps/web/src/features`)

1. Nhánh `feat/<phần>-<màn>` từ `main` của `btl-frontend`.
2. Chép thư mục màn vào `src/features/<phần>/`, giữ cấu trúc và tên; làm sạch chú thích cũ (C12).
3. Thay lời gọi `shared/api/domain.ts`, `workflow.ts` bằng `src/features/<phần>/api.ts` theo `openapi.yaml`.
4. Sửa C6 (tiền), C7 (chữ BTC, Data Pack); mọi chữ qua i18next, cả vi và en.
5. Route lazy trong `src/router.tsx`, quyền trong `navConfig.ts`.
6. Handler MSW theo `openapi.yaml` (service chưa xong vẫn làm được); ≥ 5 test (hàm thuần, tương tác,
   MSW đúng và lỗi).
7. `pnpm check` xanh (độ phủ ≥ 50%), PR kèm ảnh chụp màn.

### 4.3. Service nối vào hệ chạy chung (một lần mỗi service)

1. `compose.yaml` (repo cha `main`): khối service mới theo mẫu identity, database riêng đã có trong
   `infra/postgres-init.sql`, `JWKS_URL` trỏ identity, không mở cổng.
2. `gateway/routes.json`: tiền tố của service, route công khai nếu có.
3. `postman/`: request của service.
4. `docs/HE_THONG.md` §1: đổi trạng thái thành "chạy được".
5. Job CI `stack` của repo cha xanh (CI tự clone mọi repo service mà `compose.yaml` build, không cần
   sửa CI).

## 5. Ba ngày đầu của từng người

Việc đầy đủ của từng người (đến khi bảo vệ): `docs/nhiem-vu/TV<số>.md`.

| Người | 27/11 | 28/11 | 29/11 |
| --- | --- | --- | --- |
| TV1 | ngày 0 (§2) | outbox relay trong chassis (đẩy mục nhật ký đã ghi trong giao dịch), RabbitMQ trong compose (cùng TV6) | nối service đầu tiên xong vào compose, gateway, CI; gỡ vướng phần nền |
| TV2 | clone, chạy thử; `openapi.yaml` contract theo §6 thiết kế; `SERVICE.md` | port `domain/templates.ts`, `contract-templates.ts`; port `drafts.ts` nguyên trạng | tách `drafts.ts` (transitions, milestones), BR-A02…A05 có test; màn danh sách hợp đồng trên MSW |
| TV3 | như trên cho signing; xem `codecash/docs/10_DICH_VU_KY_SO.md` | port `documents.ts`, `pdf-layout.ts`; tải tệp + mã băm, BR-A11 | port `domain/signing.ts`; phiên ký, lượt ký đúng thứ tự (BR-A09) không gọi contract (giả bằng server tạm) |
| TV4 | như trên cho execution; đọc `09_VIEC_CON_LAI_VA_HOP_VIEC.md` | port `records.ts`, `context.ts`, nạp dữ liệu mẫu (D1, D3) | port `actions/evidence.ts`, `approvals.ts`; nộp chứng từ có BR-B03, B08 |
| TV5 | repo decision: chép engine, `pytest` xanh; `openapi.yaml` decision và payment | FastAPI `POST /evaluations` nhận gói dữ kiện; so kết quả với golden | chốt D4 với trưởng nhóm; `openapi.yaml` payment; port `actions/payments.ts` |
| TV6 | như trên cho audit; đọc `trust/*` | RabbitMQ trong compose cùng TV1; consumer idempotent nhận mục nhật ký | `GET /audit/verify` trên bản sao nhận được; chuyển script chụp màn hình sang web (§3.3 báo cáo) |

Mốc cuối ngày 29/11: mỗi repo có `openapi.yaml`, CI xanh, ít nhất 2 endpoint có test; mỗi người có một
màn trên MSW.

## 6. Nhịp làm việc

| Nhịp | Nội dung |
| --- | --- |
| 9:00 hằng ngày, 15 phút | mỗi người: hôm qua merge gì, hôm nay làm gì, vướng gì (vướng phần nền: trưởng nhóm nhận trong ngày) |
| PR | ai mở PR thì gắn một người duyệt; duyệt trong 4 giờ làm việc; CI đỏ thì người mở PR sửa trước khi làm việc mới |
| Cuối ngày | không để nhánh treo; PR những gì đã xong dù nhỏ |
| Thứ Năm / ngày tích hợp (04/12) | kéo `main` mọi repo, `docker compose up`, chạy Newman, chạy luồng demo; ai làm đỏ thì sửa trước |
| Quyết định | quyết định đổi kết quả nghiệp vụ, đổi phạm vi: ghi `DINH_VI_SAN_PHAM.md` §7 |
| Kênh hỏi | câu hỏi nghiệp vụ: đọc `NGHIEP_VU.md` rồi hỏi người giữ quy tắc đó (bảng §4 thiết kế); câu hỏi phần nền: TV1 |

## 7. Bảng theo dõi (dán vào GitHub Projects hoặc bảng tính chung)

Mỗi người một hàng, mỗi cột là một mục "xong là thế nào" (`KICH_BAN_VIBE_CODE.md` §3.1). Trạng thái:
chưa / đang / xong / bỏ (ghi lý do).

| Người | `openapi.yaml` | `SERVICE.md` | endpoint (số xong / tổng) | quy tắc có test | màn (số / tổng) | test web | Postman | compose + gateway | saga | thí nghiệm | chương báo cáo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TV1 | xong | xong | 18/18 | 2/2 | xác thực xong; `platform` đang | 14 | 25 | xong | — | — | |
| TV2 | | | | /8 | | | | | S1 bước 1 | — | |
| TV3 | | | | /3 | | | | | S1, S2 | F3 | |
| TV4 | | | | /6 | | | | | S3 | F1 | |
| TV5 | | | | /6 | | | | | S4 | F2 | |
| TV6 | | | | — | | | | | DLQ | F4 | |

## 8. Khi trễ: cắt theo thứ tự này

Cắt từ trên xuống; mỗi bước ghi vào `DINH_VI_SAN_PHAM.md` §7.

| Thứ tự | Cắt | Vẫn đạt gì | Mất gì |
| --- | --- | --- | --- |
| 1 | Trích xuất AI, tự đặt mã hợp đồng, chính sách duyệt theo ngưỡng (T1, D5, N3) | mọi Must | không đáng kể |
| 2 | Neo Merkle định kỳ, dấu thời gian (giữ chuỗi băm và `/audit/verify`) | kiểm toán | một phần chương 4 |
| 3 | Thông báo email (giữ thông báo trong ứng dụng) | luồng chính | N5 |
| 4 | Ngoại lệ hai người, phụ lục (giữ tranh chấp, thanh lý) | LT-T3 vẫn có máy trạng thái, engine | bớt chiều sâu nghiệp vụ |
| 5 | Broker RabbitMQ → outbox gửi HTTP có thử lại | đúng và không mất sự kiện | điểm cộng MS-B1 (+0,5) |
| 6 | Circuit breaker → chỉ timeout + PENDING | MS-R5, MS-R6 | điểm cộng MS-B3 (+0,25) |
| 7 | Thu audit về mức tối thiểu (nhận nhật ký, `/audit/verify`, thông báo trong ứng dụng); thiếu người thì TV1 nhận phần còn lại | vẫn 6 service | màn DLQ, neo |

Không bao giờ cắt: database riêng, gateway, saga S1 và S4 (ít nhất bù trừ + PENDING), F1 và F2 có số
liệu, Postman ≥ 10 request, test web ≥ 15 ca và độ phủ ≥ 50%.

## 9. Rủi ro và ai gỡ

| Rủi ro | Dấu hiệu sớm | Ai gỡ | Cách gỡ |
| --- | --- | --- | --- |
| Một người chậm | không có PR sau 2 ngày | trưởng nhóm | ngồi cặp nửa ngày; người dự phòng (`../docs/tham-khao/10_…` §5: TV2↔TV3, TV4↔TV5, TV6↔TV1) nhận bớt |
| Phần nền thiếu | nhiều người cùng hỏi một thứ | TV1 | làm ở repo cha trong ngày, đồng bộ |
| Hai service hiểu hợp đồng API khác nhau | test MSW xanh, ghép thật thì đỏ | hai chủ service | `openapi.yaml` là chuẩn; sửa bên lệch; thêm request Postman cho đúng ca đó |
| Engine cho kết quả khác golden sau khi bọc | test hồi quy đỏ | TV5 | không sửa engine; tìm chỗ gói dữ kiện thiếu trường |
| AI sửa phần nền, bịa luật | CI `check-base` đỏ; luật không có nguồn | người dùng AI | hoàn tác; bắt AI trích `NGHIEP_VU.md` trước khi viết |
| Máy demo hỏng hôm bảo vệ | | TV1 | diễn tập trên hai máy; image đã build sẵn; quay video dự phòng các cảnh lỗi |
