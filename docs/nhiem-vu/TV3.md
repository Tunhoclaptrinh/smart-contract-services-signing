# TV3: signing (ký, tài liệu, xác minh)

| | |
| --- | --- |
| Repo | `smart-contract-services-signing` → `btl-backend-signing`, cổng 3004, database `signing` |
| Màn web | `btl-frontend/src/features/signing` (vị trí ký, trình tự, cách ký, thiết bị ký, xác minh công khai), trạng thái xác minh chứng từ |
| Quy tắc bạn giữ | BR-A09…A12 |
| Saga, thí nghiệm | S1 (điều phối), phát S2; F3 |
| Duyệt chéo | TV2 |

**Mục tiêu**: hợp đồng đã chốt được dựng thành văn bản bất biến, ký đúng người đúng lượt, niêm phong;
mọi chữ ký và chứng từ có chữ ký số được xác minh và giữ bằng chứng; khách xác minh văn bản không cần
tài khoản.

## Đọc trước (30 phút)

`../NHIEM_VU.md`; `../LUAN_CU_KIEN_TRUC.md` §2.1c (vì sao ký và xác minh là một service), §8 L3;
`../PHAN_TICH_THIET_KE.md` §6, §8 (S1); `../TAN_DUNG_CODECASH.md` §4.2; `../../codecash/docs/10_DICH_VU_KY_SO.md`.

## Mã cũ để xem và chuyển

Đường dẫn tính từ thư mục repo của bạn (thư mục `codecash` nằm cạnh). Mở AI trong repo của bạn là nó đọc
được các đường dẫn này. Giữ, chỉnh hay bỏ từng phần: ``../TAN_DUNG_CODECASH.md` §4.2`; bảng đầy đủ đến từng tệp:
`../DOI_CHIEU_CODECASH.md` (backend), `btl-frontend/docs/DOI_CHIEU_CODECASH.md` (web).

| Loại | Đường dẫn | Xem để |
| --- | --- | --- |
| Backend | `../codecash/apps/api/src/domain/signing.ts` | phiên ký, lượt ký đúng thứ tự |
| Backend | `../codecash/apps/api/src/domain/signing-layout.ts` | vị trí ký trên trang |
| Backend | `../codecash/apps/api/src/signing-service.ts` | gọi nhà ký |
| Backend | `../codecash/apps/api/src/trust/remote-signer.ts` | ký từ xa |
| Backend | `../codecash/apps/api/src/trust/signing-provider.ts` | giao diện nhà cung cấp ký (gốc cho adapter) |
| Backend | `../codecash/apps/api/src/trust/crypto.ts` | băm, ký, kiểm chữ ký |
| Backend | `../codecash/apps/api/src/documents.ts` | kho tài liệu theo SHA-256 |
| Backend | `../codecash/apps/api/src/pdf-layout.ts` | dựng văn bản PDF |
| Backend | `../codecash/apps/api/src/document-preview.ts` | xem trước tài liệu |
| Backend | `../codecash/apps/api/src/evidence-store.ts` | lưu tệp chứng từ (execution gọi sang) |
| Nhà ký mô phỏng | `../codecash/apps/signer/src` | tiến trình riêng: ký, QR, điện thoại; thành `simulator/` |
| Web | `../codecash/apps/web/src/features/signing/pages` | vị trí ký, trình tự, cách ký, thiết bị, xác minh |
| Web | `../codecash/apps/web/src/features/signing/device` | ký trên thiết bị |
| Test | `../codecash/tests/foundation/signer.test.mjs` | ca ký đúng, sai lượt, ký lại |
| Tài liệu | `../codecash/docs/10_DICH_VU_KY_SO.md` | luồng ký, bảo mật, xử lý lỗi, chuyển sang ký thật |
| Tài liệu | `../codecash/docs/NGHIEP_VU.md` | §11 ký số và tài liệu |
| Ảnh | `../codecash/apps/web/public/guide/images` | `signing-*`, `sign-*`, `verify`, `review-signature-*` |

## Phần nền có sẵn cho bạn

`@Idempotent()` cho lượt ký, `ServiceClient` có `breaker` cho nhà ký mô phỏng, `enqueue()` để phát `contract.activated` (`MODULES.md`). Repo của bạn đã có trên GitHub, CI xanh, `SERVICE.md` điền sẵn thông tin và endpoint dự kiến.

## Việc theo thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | Bước 1 của `NHIEM_VU.md` §4 | |
| 2 | `openapi.yaml`, `SERVICE.md`; cùng TV2 viết gói hợp đồng v1 | TV2, TV4 duyệt |
| 3 | Kho tài liệu: `POST /documents`, `GET /documents/{id}`, nội dung kèm mã băm (chuyển `documents.ts`, `pdf-layout.ts`) | BR-A11 có test (415, 413) |
| 4 | Phiên ký, lượt ký đúng thứ tự (chuyển `domain/signing.ts`), `Idempotency-Key` cho lượt | BR-A09, A10 có test |
| 5 | Nhà cung cấp ký mô phỏng (chuyển `apps/signer` thành tiến trình `simulator/`, có biến làm chậm, làm lỗi); timeout 3 s → `PENDING_PROVIDER`, job đối soát | gọi chậm vẫn trả 202 |
| 6 | Saga S1: khoá hợp đồng ở contract → dựng, đóng băng văn bản → tạo phiên; lỗi thì bù trừ ngược | test: lỗi bước 3 thì hợp đồng về `AGREED` |
| 7 | Lượt cuối: niêm phong, gọi contract kích hoạt, phát `contract.activated` kèm gói v1 qua outbox (S2) | TV4 nhập được |
| 8 | Xác minh: `POST /verifications` (bất đồng bộ), kiểm chứng thư, thu hồi, dấu thời gian, tra cứu hoá đơn (mô phỏng), lưu bằng chứng; phát `evidence.verified` / `evidence.rejected` | BR-A12; TV4 nhận được |
| 9 | Trang khách `GET /public/verify?hash=` (thêm route công khai ở gateway) | khách không đăng nhập vẫn xác minh |
| 10 | Màn web ký, xác minh | ≥ 5 test mỗi màn |
| 11 | Compose (thêm `simulator`), gateway, ≥ 5 request Postman (có ca 409 `NOT_YOUR_TURN`) | job `stack` xanh |
| 12 | F3: lỗi giữa S1, đo số hợp đồng kẹt ở `SIGNING` trước/sau | bảng số liệu |

## Phối hợp

| Bạn cung cấp | Cho | | Bạn cần | Từ |
| --- | --- | --- | --- | --- |
| `contract.activated` + gói v1 | TV4, TV6 | | khoá, kích hoạt hợp đồng | TV2 |
| kho tài liệu, `POST /verifications` | TV4 | | phong bì sự kiện, hàng đợi | TV6 |

## Tự kiểm riêng

- Người không được gán ký → 403; ký lượt chưa tới → 409; ký lại → 409 (cùng `Idempotency-Key` thì trả kết quả cũ).
- Đổi một byte văn bản sau chữ ký đầu → 409 `DOCUMENT_CHANGED`.
- Tắt simulator khi ký → 202 `PENDING_PROVIDER`; bật lại → job hoàn tất.
- Tệp `.exe` đổi đuôi `.pdf` → 415 (kiểm theo nội dung).

## Báo cáo và vấn đáp

MS 2.5 (L3), MS 3 (signing), MS 4.2 (S1), MS 5.4 (F3); LT f. Câu hỏi: bù trừ S1 theo thứ tự ngược;
PENDING và đối soát; vì sao phải lưu bằng chứng lúc ký; chữ ký mô phỏng khác chữ ký số thế nào.

## Khi chậm

Cắt: ký trên điện thoại (giữ ký một lần bấm) → tra cứu hoá đơn (giữ kiểm chữ ký). Không cắt S1, BR-A09, A10.
