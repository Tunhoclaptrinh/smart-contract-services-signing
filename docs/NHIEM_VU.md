# Nhiệm vụ của nhóm

Đọc tệp này trước tiên (10 phút). Đọc xong, bạn biết **mình làm gì, làm với ai, làm theo thứ tự nào, tự
kiểm ra sao**. Việc chi tiết của riêng bạn nằm trong thẻ nhiệm vụ ở `docs/nhiem-vu/`.

## 1. Mình làm gì

**Smart Contract Workflow (SCW)**: bên mua và nhà cung cấp soạn, ký và thực hiện hợp đồng trả tiền theo
mốc. Sau mỗi chứng từ, phê duyệt hay tranh chấp, hệ thống tự chấm mốc: **trả, giữ, phạt hay từ chối**,
bao nhiêu tiền, vì sao; lệnh chi không thể tạo hai lần; mọi thao tác vào nhật ký không sửa được.

```
soạn hợp đồng → rà soát → ký → nộp chứng từ, hoá đơn → phê duyệt → engine chấm → chi tiền → kiểm toán
   contract       contract  signing   execution            execution   decision      payment   audit
```

Hệ gồm 6 service nghiệp vụ, identity (đăng nhập) và gateway (một cửa vào), mỗi service một repo và một
database. Web là một repo riêng. Phần dùng chung **đã xong**: chassis (lỗi chuẩn, DTO, gọi service có
timeout và circuit breaker, idempotency, outbox, hàng đợi RabbitMQ), gateway, identity, compose chạy đủ
7 service, CI, đăng nhập và quản trị trên web; **repo của từng service đã tạo sẵn**, có khung chạy
được. Bạn bắt đầu thẳng từ nghiệp vụ.

## 2. Ai làm gì

| Người | Service (repo `smart-contract-services-<tên>`) | Màn web | Thẻ nhiệm vụ |
| --- | --- | --- | --- |
| TV1, nhóm trưởng | identity, gateway, phần nền, `compose.yaml` | đăng nhập, quản trị | `nhiem-vu/TV1.md` |
| TV2 | contract | soạn, rà soát hợp đồng | `nhiem-vu/TV2.md` |
| TV3 | signing (ký, tài liệu, xác minh) | ký, xác minh | `nhiem-vu/TV3.md` |
| TV4 | execution | việc cần làm, mốc, chứng từ, tranh chấp | `nhiem-vu/TV4.md` |
| TV5 | decision, payment | quyết định, bộ luật, duyệt chi | `nhiem-vu/TV5.md` |
| TV6 | audit (nhật ký, thông báo), hàng đợi | nhật ký, tổng quan, thông báo | `nhiem-vu/TV6.md` |

Mỗi người giữ **trọn một lát**: service + màn web gọi nó + test + request Postman + phần báo cáo của
mình. Không sửa repo của người khác; cần gì thì nói với chủ của nó.

## 3. Ai cần gì của ai

Các service nói chuyện qua **hợp đồng API** (`service/openapi.yaml`) và **sự kiện**. Hợp đồng viết trước,
mã viết sau; người dùng hợp đồng duyệt hợp đồng.

| Hợp đồng | Người viết | Người dùng (duyệt PR) | Hạn |
| --- | --- | --- | --- |
| Gói hợp đồng đã ký (hợp đồng, các bên, mốc, thành viên, mã băm văn bản, chữ ký) | TV2 + TV3 | TV4 | 28/11 |
| Khoá và kích hoạt hợp đồng (`POST /contracts/{id}/transitions`) | TV2 | TV3 | 28/11 |
| Gói dữ kiện của một mốc → quyết định + vết (`POST /evaluations`) | TV5 | TV4 | 28/11 |
| Xác minh chứng từ (`POST /verifications`, sự kiện `evidence.verified`) | TV3 | TV4 | 29/11 |
| Khoá mốc khi lập lệnh chi, sự kiện `payment.settled` | TV4 + TV5 | TV5, TV4 | 29/11 |
| Phong bì sự kiện chung (ai, làm gì, trên gì, lúc nào, `requestId`) | TV6 + TV1 | mọi người | 28/11 |

## 4. Làm theo thứ tự này

### Bước 1. Chạy được trên máy (nửa buổi, 27/11)

```bash
mkdir -p ~/btl && cd ~/btl
git clone https://github.com/Tunhoclaptrinh/Code-n-Cash.git codecash        # mã cũ, chỉ đọc
git clone git@github.com:Tunhoclaptrinh/smart-contract-services.git btl-backend
git clone git@github.com:Tunhoclaptrinh/smart-contract-services-identity.git btl-backend-identity
git clone git@github.com:Tunhoclaptrinh/smart-contract-services-<tên>.git btl-backend-<tên>
git clone git@github.com:Tunhoclaptrinh/smart-contract-web.git btl-frontend
cd btl-backend-<tên> && pnpm install && pnpm test                            # phải xanh (decision: pytest)
cd ../btl-backend && docker compose up --build --wait                       # cả hệ, cổng 3000
cd ../btl-frontend && pnpm install && pnpm dev                              # http://127.0.0.1:5173
```

Đăng nhập web bằng `sysadmin@scw.vn` / `Passw0rd!` (hoặc menu tài khoản demo). Được là xong bước 1.
Tên thư mục phải đúng như trên: tài liệu và AI tìm mã cũ ở `../codecash`.

### Bước 2. Viết hợp đồng API (28/11)

`service/openapi.yaml` cho mọi endpoint của bạn (bảng ở `PHAN_TICH_THIET_KE.md` §6), mỗi endpoint một lỗi
nghiệp vụ 4xx có `code`; điền `service/SERVICE.md`. Mở PR, gắn người dùng hợp đồng (§3) duyệt. Prompt mẫu
cho AI: `KICH_BAN_VIBE_CODE.md` §7.

### Bước 3. Làm song song, không chờ nhau (28/11–03/12)

- **Mã cũ của phần bạn** (backend, màn web, test, tài liệu, ảnh màn hình) có sẵn đường dẫn trong mục
  "Mã cũ để xem và chuyển" của thẻ nhiệm vụ; mở xem trước khi viết, chép rồi sửa thay vì viết lại.
- **Backend**: chuyển mã cũ theo checklist `TRIEN_KHAI_NHOM.md` §4.1. Service khác chưa xong thì giả nó
  bằng server HTTP tạm trong test (mẫu: `packages/nest-common/test/service-client.test.mjs`). Token
  trong test tự ký bằng `signActorToken`.
- **Web**: chuyển màn theo `btl-frontend/CLAUDE.md` §4, chạy trên MSW trả đúng `openapi.yaml`; không chờ
  backend.

### Bước 4. Nối vào hệ chung (từ 30/11)

Service của bạn vào `compose.yaml`, tiền tố vào `gateway/routes.json`, request vào `postman/` (PR vào
repo cha, nhánh `main`; checklist `TRIEN_KHAI_NHOM.md` §4.3). Web bỏ MSW cho màn đã có service thật.

### Bước 5. Ghép và kiểm cả luồng

| Ngày | Việc |
| --- | --- |
| 04/12 | **Ngày tích hợp**: cả nhóm chạy luồng demo từ đăng ký tới kiểm toán qua gateway; ai làm gãy thì sửa trước |
| 05–07/12 | Saga (S1–S4), hàng đợi, màn còn lại |
| 08/12 | **Đóng tính năng**: từ đây chỉ sửa lỗi, test, đo thí nghiệm lỗi |
| 11–12/12 | Báo cáo (phần của bạn viết dần từ bước 2), slide, ảnh |
| 13–14/12 | Diễn tập hai lần |

## 5. Tự kiểm trước khi nhờ người khác

Đi từ dưới lên; tầng dưới chưa xanh thì chưa lên tầng trên.

| Tầng | Lệnh | Xanh khi |
| --- | --- | --- |
| 1. Test của service | `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` | mọi test qua, kể cả ca lỗi nghiệp vụ |
| 2. Tài liệu đi cùng mã | `pnpm check:docs`, `pnpm check:base` | không báo đỏ |
| 3. Chạy tay một service | `pnpm dev`, mở Swagger `http://127.0.0.1:<cổng>/api/docs` | gọi thử từng endpoint được |
| 4. Web | `pnpm check` (trong `btl-frontend`) | test, độ phủ ≥ 50%, build qua |
| 5. Qua gateway | `docker compose up --build --wait` rồi `npx newman run postman/smart-contract.postman_collection.json -e postman/local.postman_environment.json` | Newman không lỗi |
| 6. Cả luồng | đăng nhập web, làm luồng của mình như người dùng | không có chỗ gãy |

CI chạy lại tầng 1–2 trên mọi PR và tầng 5 trên `main` của repo cha.

## 6. Cách làm việc chung

| Việc | Luật |
| --- | --- |
| Nhánh | `feat/<phần>-<việc>` từ `main`; không commit thẳng `main` |
| Commit | Conventional Commits, tiếng Anh: `feat(contract): add milestone split check`; mã sạch, không chú thích nhắc dự án cũ |
| PR | một việc, nhỏ; gắn một người duyệt (§3, hoặc cặp đôi: TV2↔TV3, TV4↔TV5, TV6↔TV1); duyệt trong 4 giờ làm việc; CI xanh mới merge (merge commit) |
| Họp | 9:00 mỗi ngày, 15 phút: hôm qua merge gì, hôm nay làm gì, vướng gì |
| Vướng | nghiệp vụ: đọc `../codecash/docs/NGHIEP_VU.md` rồi hỏi người giữ quy tắc đó; phần nền (chassis, gateway, compose, CI): báo nhóm trưởng, xử lý trong ngày |
| AI | mở công cụ AI trong thư mục repo đang làm để nó đọc `CLAUDE.md`; bắt AI nêu luật nghiệp vụ và nguồn trước khi viết mã |

## 7. Nhóm trưởng

Nhóm trưởng (TV1) giữ phần nền và **có thể vào hỗ trợ hoặc code ở bất kỳ repo nào, bất kỳ lúc nào**:

- ngồi cặp gỡ vướng, sửa thẳng trên nhánh của bạn (có báo trước trên kênh nhóm);
- nhận bớt một việc khi bạn chậm (ghi trên bảng theo dõi, `TRIEN_KHAI_NHOM.md` §7);
- đổi phần nền rồi đồng bộ cho mọi repo; đổi phạm vi, cắt bớt tính năng khi trễ (`TRIEN_KHAI_NHOM.md` §8).

Code của nhóm trưởng trong service của bạn vẫn đi qua PR và **bạn duyệt**, để bạn luôn nắm được phần
của mình. Phần nền chỉ nhóm trưởng sửa; bạn cần gì ở phần nền thì nói, đừng tự sửa trong repo service
(CI sẽ chặn).

## 8. Đọc thêm khi cần

| Cần | Đọc |
| --- | --- |
| Việc của riêng bạn, đủ chi tiết | `docs/nhiem-vu/TV<số>.md` |
| Mã cũ của phần bạn ở đâu | thẻ nhiệm vụ, mục "Mã cũ để xem và chuyển"; bảng đầy đủ `DOI_CHIEU_CODECASH.md` |
| Toàn cảnh hệ thống | `HE_THONG.md` |
| Quy tắc nghiệp vụ, API, saga | `PHAN_TICH_THIET_KE.md` |
| Vì sao thiết kế như vậy (để trả lời vấn đáp) | `LUAN_CU_KIEN_TRUC.md` |
| Mã cũ nào giữ, sửa, bỏ | `TAN_DUNG_CODECASH.md`, `DOI_CHIEU_CODECASH.md` |
| Viết báo cáo, slide, demo | `BAO_CAO_VA_BAO_VE.md` |
| Mục lục toàn bộ | `README.md` |
