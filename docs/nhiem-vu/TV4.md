# TV4: execution (thực hiện mốc)

| | |
| --- | --- |
| Repo | `smart-contract-services-execution` → `btl-backend-execution`, cổng 3005, database `execution` |
| Màn web | `btl-frontend/src/features/milestones` (việc cần làm, bảng mốc, chi tiết hợp đồng, nộp chứng từ), `disputes`, ngoại lệ |
| Quy tắc bạn giữ | BR-B03, B05, B08, B09, B11, B12, B13 |
| Saga, thí nghiệm | S3, nhận S2; F1 |
| Duyệt chéo | TV5 |

**Mục tiêu**: hợp đồng đã ký tự xuất hiện; các bên nộp chứng từ, phê duyệt, mở tranh chấp; mỗi thao tác
chấm lại mốc; ai cũng thấy "việc còn lại" của mình.

## Đọc trước (30 phút)

`../NHIEM_VU.md`; `../LUAN_CU_KIEN_TRUC.md` §2.9, §8 L4–L5; `../PHAN_TICH_THIET_KE.md` §5.2, §6, §8 (S3);
`../TAN_DUNG_CODECASH.md` §4.3; `../../codecash/docs/09_VIEC_CON_LAI_VA_HOP_VIEC.md`.

## Mã cũ để xem và chuyển

Đường dẫn tính từ thư mục repo của bạn (thư mục `codecash` nằm cạnh). Mở AI trong repo của bạn là nó đọc
được các đường dẫn này. Giữ, chỉnh hay bỏ từng phần: ``../TAN_DUNG_CODECASH.md` §4.3`; bảng đầy đủ đến từng tệp:
`../DOI_CHIEU_CODECASH.md` (backend), `btl-frontend/docs/DOI_CHIEU_CODECASH.md` (web).

| Loại | Đường dẫn | Xem để |
| --- | --- | --- |
| Backend | `../codecash/apps/api/src/domain/records.ts` | bảng nghiệp vụ |
| Backend | `../codecash/apps/api/src/domain/context.ts` | đọc theo người gọi |
| Backend | `../codecash/apps/api/src/domain/service.ts` | ghi trong một giao dịch |
| Backend | `../codecash/apps/api/src/domain/datapack.ts` | nạp dữ liệu mẫu |
| Backend | `../codecash/apps/api/src/domain/actions` | chứng từ, nghiệm thu, phê duyệt, tranh chấp, ngoại lệ, phụ lục, thanh lý (giữ logic) |
| Backend | `../codecash/apps/api/src/domain/views` | việc cần làm, trách nhiệm, mốc, hợp đồng, tổng quan (giữ) |
| Backend | `../codecash/apps/api/src/domain/vocabulary.ts` | bên nào được tạo chứng từ gì |
| Backend | `../codecash/apps/api/src/domain/engine-contract.ts` | gói dữ kiện gửi engine (đổi thành gọi HTTP sang decision) |
| Backend | `../codecash/apps/api/src/workflow.controller.ts` | route cũ dạng RPC: lấy logic, đổi sang REST |
| Web | `../codecash/apps/web/src/features/milestones/pages/TaskInboxPage.tsx` | việc cần làm |
| Web | `../codecash/apps/web/src/features/milestones/pages/ContractDetailPage.tsx` | chi tiết hợp đồng và mốc |
| Web | `../codecash/apps/web/src/features/milestones/pages/EvidenceSubmissionPage.tsx` | nộp chứng từ |
| Web | `../codecash/apps/web/src/features/milestones/components` | `PendingItems`, `MilestoneJourney`, `InvoiceFormModal`, `EvidenceViewer`, `AmendmentsPanel`, `LiquidationPanel`… |
| Web | `../codecash/apps/web/src/features/disputes` | tranh chấp |
| Web | `../codecash/apps/web/src/features/audit/pages/ExceptionQueuePage.tsx` | hàng chờ ngoại lệ |
| Test | `../codecash/tests/foundation/workflow.test.mjs` | luồng chứng từ, phê duyệt, tranh chấp |
| Test | `../codecash/tests/foundation/business-rules.test.mjs` | quy tắc BR-B |
| Tài liệu | `../codecash/docs/09_VIEC_CON_LAI_VA_HOP_VIEC.md` | việc còn lại, hộp việc |
| Tài liệu | `../codecash/docs/11_HOP_DONG_TRONG_UNG_DUNG.md` | bước 7–10: chứng từ, duyệt chi, phụ lục, thanh lý |
| Tài liệu | `../codecash/docs/33_LUONG_NGHIEP_VU_DAU_CUOI.md` | câu chuyện đầu–cuối |
| Ảnh | `../codecash/apps/web/public/guide/images` | `tasks*`, `contract-detail*`, `evidence*`, `approval*`, `dispute*`, `exception*`, `amendment-*`, `liquidation-review` |

## Phần nền có sẵn cho bạn

`consume()` để nhận `contract.activated`, `evidence.verified`, `payment.settled`; `enqueue()` để phát sự kiện; `ServiceClient` gọi decision (`MODULES.md`). Repo của bạn đã có trên GitHub, CI xanh, `SERVICE.md` điền sẵn thông tin và endpoint dự kiến.

## Việc theo thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | Bước 1 của `NHIEM_VU.md` §4 | |
| 2 | `openapi.yaml`, `SERVICE.md`; duyệt gói hợp đồng (TV2, TV3) và gói dữ kiện (TV5) | |
| 3 | Bảng nghiệp vụ, nạp dữ liệu mẫu cho tổ chức demo, tiền bằng đồng (chuyển `records.ts`, `context.ts`, `datapack.ts`) | mở máy có hợp đồng ở mọi trạng thái |
| 4 | Nộp chứng từ, hoá đơn đủ trường (chuyển `actions/evidence.ts`) | BR-B03, B08, B11, B13 có test |
| 5 | Phê duyệt, từ chối (chuyển `actions/approvals.ts`, `acceptance.ts`) | BR-B05 có test |
| 6 | Gọi decision sau mỗi thao tác (gửi gói dữ kiện), timeout 2 s → `PENDING_EVALUATION`, job chấm lại | test với decision giả: tắt thì không mất chứng từ |
| 7 | Việc cần làm, chi tiết mốc (chuyển `views/tasks.ts`, `responsibility.ts`, `milestones.ts`) | màn đọc không gọi service khác |
| 8 | Tranh chấp, ngoại lệ, phụ lục, thanh lý | BR-B09, B12 có test |
| 9 | Nhập hợp đồng từ `contract.activated` (idempotent), nhận `payment.settled`, gửi yêu cầu xác minh và nhận kết quả | nhập hai lần vẫn một hợp đồng |
| 10 | Màn web; bảng mốc ≥ 200 dòng ảo hoá, đo React Profiler trước/sau | ≥ 5 test mỗi màn; ảnh Profiler |
| 11 | Compose, gateway, ≥ 5 request Postman (có ca 403 `NOT_AUTHORIZED_PARTY`) | job `stack` xanh |
| 12 | F1: tắt decision khi đang nộp chứng từ, đo tỷ lệ thành công, p95, thời gian chấm lại hết | bảng số liệu |

## Phối hợp

| Bạn cung cấp | Cho | | Bạn cần | Từ |
| --- | --- | --- | --- | --- |
| khoá mốc `PAYMENT_REQUESTED` (và trả lại khi bù trừ) | TV5 | | gói hợp đồng, `contract.activated` | TV3 |
| gói dữ kiện của mốc | TV5 | | `POST /evaluations` | TV5 |
| sự kiện chứng từ, phê duyệt, tranh chấp | TV6 | | `POST /verifications`, tệp chứng từ | TV3 |

## Tự kiểm riêng

- Bên không có thẩm quyền nộp loại chứng từ → 403; nộp trùng mã → 409; mốc đã chi → 409.
- Cùng một vai trò duyệt hai lần → 409; vai trò không cần → 403.
- Mở tranh chấp thứ hai → 409; nhà cung cấp đóng tranh chấp → 403.
- Tổng hoá đơn lệch giá trị mốc → 422 `INVOICE_AMOUNT_MISMATCH`.

## Báo cáo và vấn đáp

MS 1.2, MS 2.5 (L4, L5, L8), MS 3 (execution), MS 4.2 (S3), MS 5.4 (F1); LT e (Profiler, ảo hoá). Câu
hỏi: vì sao chấm đồng bộ mà không mất chứng từ khi decision sập; "việc còn lại" tính thế nào; vì sao chứng
từ, phê duyệt, tranh chấp ở cùng một service.

## Khi chậm

Cắt: chính sách duyệt theo ngưỡng → phụ lục → ngoại lệ hai người (giữ tranh chấp, thanh lý).
