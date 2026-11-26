# TV5: decision và payment (quyết định và chi tiền)

| | |
| --- | --- |
| Repo | `smart-contract-services-decision` (`btl-backend-decision`, cổng 3006), `smart-contract-services-payment` (`btl-backend-payment`, cổng 3007) |
| Màn web | quyết định (`<DecisionTrace>`, bộ luật, chạy thử, kiểm chứng bộ luật), duyệt chi |
| Quy tắc bạn giữ | BR-B01, B02, B04, B06, B07 (decision), BR-B10 (payment) |
| Saga, thí nghiệm | S4 (điều phối); F2 |
| Duyệt chéo | TV4 |

**Mục tiêu**: mỗi mốc được chấm ra trả, giữ, phạt, từ chối kèm vết luật, tái lập được theo phiên bản
luật; lệnh chi chỉ tạo từ quyết định trả tiền, không bao giờ chi hai lần.

## Đọc trước (30 phút)

`../NHIEM_VU.md`; `../LUAN_CU_KIEN_TRUC.md` §2.1b, §8 L6; `../PHAN_TICH_THIET_KE.md` §6, §7, §8 (S4);
`../TAN_DUNG_CODECASH.md` §4.4–4.5; `../../codecash/docs/NGHIEP_VU.md` §5–7.

## Mã cũ để xem và chuyển

Đường dẫn tính từ thư mục repo của bạn (thư mục `codecash` nằm cạnh). Mở AI trong repo của bạn là nó đọc
được các đường dẫn này. Giữ, chỉnh hay bỏ từng phần: ``../TAN_DUNG_CODECASH.md` §4.4–4.5`; bảng đầy đủ đến từng tệp:
`../DOI_CHIEU_CODECASH.md` (backend), `btl-frontend/docs/DOI_CHIEU_CODECASH.md` (web).

| Loại | Đường dẫn | Xem để |
| --- | --- | --- |
| Engine | `../codecash/apps/engine/codecash_engine` | 9 bước chấm một mốc (`pipeline.py`), luật, tính tiền, vết |
| Engine | `../codecash/apps/engine/policy` | bộ luật, profile |
| Engine | `../codecash/apps/engine/server.py` | máy chủ cũ (thay bằng FastAPI) |
| Engine | `../codecash/apps/engine/rule_language.json` | ngôn ngữ luật |
| Backend | `../codecash/apps/api/src/domain/engine.ts` | cách API cũ gọi engine |
| Backend | `../codecash/apps/api/src/domain/policy.ts` | áp phiên bản luật |
| Backend | `../codecash/apps/api/src/trust/rules-service.ts` | quản lý phiên bản luật (viết lại bằng Python) |
| Backend | `../codecash/apps/api/src/trust/rule-workflows.ts` | quy trình của phiên bản luật |
| Backend | `../codecash/apps/api/src/domain/views/verification.ts` | chạy thử, gói kiểm chứng |
| Backend | `../codecash/apps/api/src/domain/actions/payments.ts` | lập lệnh chi |
| Backend | `../codecash/apps/api/src/payment-gateway.ts` | gửi lệnh ra ngân hàng (thành ngân hàng mô phỏng) |
| Web | `../codecash/apps/web/src/features/milestones/pages/MilestoneDecisionPage.tsx` | truy vết quyết định |
| Web | `../codecash/apps/web/src/features/milestones/components/DecisionTrace.tsx` | gốc cho Compound `<DecisionTrace>` (cùng `RulesPanel`, `VariablesPanel`, `ReplayPanel`) |
| Web | `../codecash/apps/web/src/features/milestones/pages/PaymentApprovalPage.tsx` | duyệt chi (cùng `PaymentInstructionPanel`) |
| Web | `../codecash/apps/web/src/features/platform/RuleVersionsPage.tsx` | phiên bản luật (cùng `components/RuleExpressionEditor.tsx`) |
| Web | `../codecash/apps/web/src/features/platform/DataPage.tsx` | gốc cho màn "Kiểm chứng bộ luật" |
| Test | `../codecash/tests` | `test_*.py`, `golden/`: bộ kiểm hồi quy, phải xanh |
| Công cụ | `../codecash/tools/verify_decision.py` | kiểm độc lập một quyết định |
| Công cụ | `../codecash/tools/mutation_check.py` | kiểm đột biến |
| Tài liệu | `../codecash/docs/NGHIEP_VU.md` | §5–7 engine, luật, tính tiền; §14.1, §14.2 |
| Tài liệu | `../codecash/docs/pitch/GIAI_THICH_SO_LIEU_PITCH.md` | số liệu độ đúng của engine (cho chương đánh giá) |
| Ảnh | `../codecash/apps/web/public/guide/images` | `decision*`, `rules-*`, `transfer`, `data*` |

## Phần nền có sẵn cho bạn

`@Idempotent()` cho `POST /payment-orders`, `ServiceClient` có `breaker` + `maxConcurrent` quanh ngân hàng (`MODULES.md`); repo decision đã có khung (đọc `CLAUDE.md` của repo đó). Repo của bạn đã có trên GitHub, CI xanh, `SERVICE.md` điền sẵn thông tin và endpoint dự kiến.

## Việc theo thứ tự

| # | Việc | Xong khi |
| --- | --- | --- |
| 1 | Bước 1 của `NHIEM_VU.md` §4; repo decision (Python) nhóm trưởng dựng sẵn | `pytest` xanh |
| 2 | `openapi.yaml` của decision (gói dữ kiện vào, quyết định + vết ra) và payment | TV4 duyệt |
| 3 | **Chốt D4** (làm tròn tiền phạt khi tiền tính bằng đồng) với nhóm trưởng | ghi `DINH_VI_SAN_PHAM.md` §7 |
| 4 | decision: `POST /evaluations` nhận gói dữ kiện qua JSON, gọi engine, lưu kết quả và vết | bộ kiểm hồi quy khớp đáp án |
| 5 | `GET /decisions/{milestoneId}`, `/trace`; `dryRun` | |
| 6 | Bộ luật có phiên bản: `GET/POST /rule-sets`, `publish`, kiểm an toàn; phát `rule_set.published` | 422, 409 có test |
| 7 | payment: `POST /payment-orders` + `Idempotency-Key`, duyệt, ngân hàng mô phỏng có biến chậm/lỗi | BR-B10 có test |
| 8 | Saga S4: khoá mốc ở execution → xác nhận quyết định → lệnh `APPROVED` → ngân hàng; timeout → `PENDING` + đối soát; lỗi rõ → bù trừ | test ba nhánh |
| 9 | Circuit breaker + bulkhead quanh ngân hàng; phát `payment.settled` | |
| 10 | Màn web: `<DecisionTrace>` (Compound), bộ luật, duyệt chi (hiển thị `PENDING`, gửi lại), kiểm chứng bộ luật | ≥ 5 test mỗi màn; type guard `isPayableDecision` |
| 11 | Compose (hai service + ngân hàng mô phỏng), gateway, ≥ 5 request Postman (có ca 409 `ORDER_EXISTS`) | job `stack` xanh |
| 12 | F2: ngân hàng chậm 5 s, lỗi 30%; đo lệnh trùng, tỷ lệ lỗi, thời gian breaker mở, số lệnh đối soát | bảng số liệu |

## Phối hợp

| Bạn cung cấp | Cho | | Bạn cần | Từ |
| --- | --- | --- | --- | --- |
| `POST /evaluations` | TV4 | | gói dữ kiện của mốc, khoá mốc | TV4 |
| `payment.settled`, `decision.made` | TV4, TV6 | | phong bì sự kiện, hàng đợi | TV6 |

## Tự kiểm riêng

- Gửi lại cùng `Idempotency-Key` → trả lệnh cũ (200), không tạo lệnh mới; lệnh thứ hai cho cùng mốc → 409.
- Quyết định HOLD → không lập được lệnh (409 `DECISION_NOT_PAYABLE`).
- Ngân hàng không trả lời → `PENDING`; trả lời sau → đối soát đúng một lần.
- Công thức phạt: trễ đúng ân hạn, trễ hơn ân hạn 1 ngày, vượt trần; làm tròn đúng D4.

## Báo cáo và vấn đáp

MS 2.5 (L6), MS 3 (decision, payment), MS 4.2 (S4), MS 4.4 (circuit breaker), MS 5.4 (F2), MS 6.3 (độ
đúng của engine); LT d (`<DecisionTrace>`). Câu hỏi: luật first-match; công thức phạt, làm tròn;
`Idempotency-Key`; thay engine thì làm sao không đổi kết quả (chạy bóng).

## Khi chậm

Cắt: kiểm chứng bộ luật trên giao diện (giữ bộ kiểm trong CI) → circuit breaker (giữ timeout + PENDING).
Không cắt `Idempotency-Key`, S4, BR-B10.
