# Bản đồ chassis `@sc/nest-common`

Tra ở đây trước khi mở mã nguồn: mỗi module 1–3 dòng (làm gì, dùng gì). **Luật**: PR `core/…` nào
thêm, đổi hay bỏ một module hay một hàm xuất ra thì sửa bảng này trong cùng PR, kèm `CHANGELOG.md`
gốc.

## Khởi động và HTTP

| Tệp | Làm gì | Dùng |
| --- | --- | --- |
| `bootstrap.ts` | Khởi động service giống nhau ở mọi nơi: `.env`, tiền tố `/api/v1`, request id, pipe, filter, interceptor, Swagger `/api/docs` | `bootstrapService({ module, name, port })` |
| `problem.ts` | Lỗi RFC 9457 (`application/problem+json`), `ValidationPipe` toàn cục, đổi lỗi class-validator sang mã của mình | `throw new ValidationProblem(["REQUIRED:name"])`, `createValidationPipe()` |
| `filters/all-exceptions.filter.ts` | Mọi lỗi ra một dạng problem+json; ghi lỗi 4xx/5xx vào nhật ký (gộp lỗi lặp trong 60 giây) | tự gắn trong `bootstrapService` |
| `interceptors/transform.interceptor.ts` | Bọc kết quả `{ success, data, requestId }` | tự gắn |
| `interceptors/logging.interceptor.ts` | Log phương thức, đường dẫn, thời gian | tự gắn |
| `audit-http.ts` | Ghi nhật ký lượt xem có chủ đích một bản ghi, tài liệu (không ghi lượt tải lại danh sách) | tự gắn |
| `health.controller.ts` | `GET /health`: sẵn sàng, gồm một lượt hỏi kho dữ liệu (`repo.ping()`); kho hỏng thì 503 `STORAGE_UNAVAILABLE` | thêm vào module service |
| `service-client.ts` | Gọi service khác (MS-R5): timeout (mặc định 3 s), chỉ thử lại lỗi hạ tầng với method idempotent (backoff 100, 200 ms…), 4xx của đích trả nguyên, 5xx → 502 `UPSTREAM_ERROR`, không tới được → 503 `UPSTREAM_UNAVAILABLE`, chậm → 504 `UPSTREAM_TIMEOUT`; chuyển tiếp token và `x-request-id`; địa chỉ từ `<TÊN>_URL` | `ServiceClient.fromEnv("contract").get("/contracts/1", { token })` |
| `service-client.ts` (bảo vệ) | `breaker: { failures, windowMs, openMs }`: lỗi hạ tầng liên tiếp thì mở mạch, trả nhanh 503 `UPSTREAM_CIRCUIT_OPEN`, sau đó thử một lời gọi (half-open); 4xx không tính là lỗi. `maxConcurrent`: quá số lời gọi đồng thời thì 503 `UPSTREAM_BUSY` | `new ServiceClient("bank", url, { breaker: { failures: 5 }, maxConcurrent: 5 })` |
| `idempotency.ts` | `@Idempotent()` trên route: cần header `Idempotency-Key`; lặp lại cùng khoá, cùng body thì trả lại kết quả cũ (`Idempotent-Replayed: true`), khác body 422 `IDEMPOTENCY_KEY_REUSED`, đang chạy 409 `IDEMPOTENCY_IN_PROGRESS`; lỗi thì nhả khoá; giữ 24 giờ (collection `idempotency-keys`). `IdempotencyStore.run()` để dùng ngoài route | `@Post() @Idempotent() create(...)` |
| `events.ts` | Phong bì sự kiện v1 (`newEvent`, `isEventEnvelope`), kiểu `ContractPackageV1`; hợp đồng ở `packages/contracts/schemas/*.json`, danh mục `packages/contracts/events.json` (bản nháp, chốt 28/11) | `newEvent({ type: "evidence.submitted", source: "execution", subject, data })` |

## Xác thực và quyền

| Tệp | Làm gì | Dùng |
| --- | --- | --- |
| `auth-token.ts` | JWT RS256: identity ký bằng `JWT_PRIVATE_KEY`, công bố `publicJwks()`; nơi khác kiểm bằng `JWT_PUBLIC_KEY` hoặc `JWKS_URL` (tự tải lại khi gặp `kid` lạ); dev tự sinh khoá ở `.data-jwt` (production chỉ khi `JWT_GENERATE_KEY=true`); `JwtAuthGuard` đặt `req.user` từ claims, không gọi identity | `signActorToken`, `verifyActorTokenAsync`, `JwtAuthGuard`, `publicJwks` |
| `permissions.ts` | Ma trận quyền từ `packages/contracts/permissions.json`, phạm vi `all`/`own` | `@RequirePermission("x:read")`, `can(role, key)`, `scopeOf` |
| `roles.ts`, `guards/roles.guard.ts`, `decorators/*` | Vai trò, `@Public()`, `@Roles()`, `@CurrentUser()`, `@TenantId()` | decorator trên controller |
| `permissions.controller.ts` | `GET /permissions`: xem ma trận quyền (cần `permissions:read`) | thêm vào module |

## Dữ liệu và nhật ký

| Tệp | Làm gì | Dùng |
| --- | --- | --- |
| `repository.ts` | Kho dữ liệu (file hoặc Postgres theo `STORAGE_DRIVER`); ghi qua `mutate`/`transact` kèm mục nhật ký trong cùng giao dịch | `repo.list(name)`, `repo.mutate(name, fn, audit)` |
| `postgres-store.ts` | Bản Postgres: một schema mỗi service (`PG_SCHEMA`), khoá advisory theo collection | qua `Repository` |
| `audit-chain.ts`, `merkle.ts`, `audit-events.ts`, `audit-export.ts` | Chuỗi băm nhật ký, bằng chứng Merkle, ngữ cảnh request, xuất nhật ký | `verifyChain`, `inclusionProof` |

## CRUD chung `/resources/:resource` (lọc, nhập, xuất)

Định nghĩa resource ở `packages/contracts/resources.json`; trường có `key`, `type` (`string`,
`textarea`, `email`, `number`, `boolean`, `select`), `required`, `options`, `ref`,
`min`/`max`/`integer`, `maxLength`, `pattern`, `label`, `description`, `unique`, `filterable`,
`sortable`.

| Endpoint | Ghi chú |
| --- | --- |
| `GET /resources` | Định nghĩa mọi resource (web dựng form, kiểm trường bằng cùng `fieldProblem`) |
| `GET /resources/:r/columns` | Mô tả cột: kiểu, nhãn, `operators`, `options`, `ref`, `facet`, `system` |
| `GET /resources/:r` | `page`, `limit` (≤ 100), `search`, `sortBy`, `sortOrder`, `filters`, `columns`, `facets` → `{ items, total, page, limit, totalPages, scopeTotal, facets? }` |
| `GET /resources/:r/export` | như danh sách, thêm `format=csv\|json\|xlsx`, `header=key\|label`; tối đa 10.000 dòng (413 `EXPORT_TOO_LARGE`) |
| `GET /resources/:r/template` | CSV mẫu; `header=label` để tiêu đề là nhãn |
| `POST /resources/:r/import/validate` | chạy thử: mỗi dòng `status`, `action` (`create`/`update`), `errors`; `summary`, `plan` |
| `POST /resources/:r/import` | `items` hoặc `csv` (+ `mapping`), `mode=all-or-nothing\|skip-invalid\|upsert`, `key` |
| `POST/PATCH/DELETE`, `bulk-delete` | sửa cần `version` (khoá lạc quan, 409 `VERSION_CONFLICT`) |

**Bộ lọc** (`filters` là JSON):

```jsonc
{ "kind": "BUYER" }                        // eq
{ "kind": ["BUYER", "SUPPLIER"] }          // in
{ "amount": { "gte": 1000, "lte": 5000 } } // nhiều toán tử trên một trường (AND)
{ "createdAt": { "between": ["2026-11-01", "2026-11-30"] } } // mốc ngày phủ cả ngày
{ "email": { "isNull": true } }
```

Toán tử theo kiểu: chuỗi `eq ne in nin contains startsWith isNull`; số và `createdAt`/`updatedAt` thêm
`gt gte lt lte between` (không có `contains`); `select`/`ref` `eq ne in nin isNull`; boolean
`eq ne isNull`. Giá trị từ query string đổi theo kiểu trường (`"5"` → 5, `"true"` → true). Sai thì
400 `INVALID_FILTER`.

| Tệp | Làm gì |
| --- | --- |
| `services/base.service.ts` | Toàn bộ luật trên: phạm vi tổ chức, quyền theo thao tác, kiểm trường, tham chiếu, trùng `unique`, nhật ký |
| `controllers/base.controller.ts` | Route; `columns`, `export`, `template` khai báo trước `:id` |
| `dto/resource.dto.ts` | DTO lớp 1 (hình dạng): `ListQueryDto`, `ExportQueryDto`, `ImportBodyDto`, `BulkDeleteDto`, `TemplateQueryDto` |
| `utils/query-builder.ts` | `parseFilterConditions`, `meets`, `operatorsFor`, `compareCells` (thứ tự tiếng Việt) |
| `utils/csv.ts`, `utils/csv-parse.ts`, `utils/xlsx.ts` | Ghi CSV (BOM, chống chèn công thức `safeCell`), đọc CSV RFC 4180, ghi XLSX; `attachmentHeader`, `stampedName` |
| `field-validation.ts` | `fieldProblem`: luật một trường, **cùng bản** với `@codecash/contracts` ở web |
| `listing.ts` | Engine danh sách trong bộ nhớ cho dữ liệu không qua `/resources` (dữ liệu mẫu, luồng); cùng ý nghĩa `contains`/`gte`/`lte` |

## Định dạng lỗi

```json
{
  "type": "urn:problem:required", "title": "Bad Request", "status": 400,
  "detail": "REQUIRED:name", "instance": "/api/v1/resources/organizations",
  "code": "REQUIRED:name", "traceId": "…",
  "errors": [{ "field": "name", "code": "REQUIRED" }, { "field": "kind", "code": "INVALID_OPTION", "row": 2 }],
  "statusCode": 400, "message": "REQUIRED:name", "requestId": "…"
}
```

`code`/`message` là mã đầu tiên (giữ cho client cũ); `errors` là đủ mọi lỗi. 400 dữ liệu sai,
401 chưa đăng nhập hoặc token sai, 403 không có quyền, 404 không có hoặc ngoài phạm vi, 409 xung
đột phiên bản hoặc trùng, 413 quá lớn.

## Đáp ứng yêu cầu LTWNC (LT-07)

| Yêu cầu | Ở đâu |
| --- | --- |
| DTO + ValidationPipe | `dto/resource.dto.ts`, `createValidationPipe()` (whitelist, forbidNonWhitelisted, transform) |
| Mã 400/401/403/404 đúng, lỗi thống nhất | `problem.ts` + `AllExceptionsFilter` (RFC 9457) |
| Module – Controller – Service, DI | `BaseController` → `BaseService` → `Repository` (inject) |
| ≥ 1 Interceptor | `LoggingInterceptor`, `TransformInterceptor`, `AuditReadsInterceptor` |
| ≥ 1 Exception Filter | `AllExceptionsFilter` |
| Kiểm nhiều lớp | pipe (hình dạng) → `BaseService` (luật trường, tham chiếu, trùng, quyền, phạm vi) |
| Phân trang máy chủ (LT-04) | `GET /resources/:r` (`limit` ≤ 100) |
| Schema dùng chung web–server (đề 4) | `GET /resources` + `fieldProblem` cùng bản ở `@codecash/contracts` |

## Test

`packages/nest-common/test/*.test.mjs` (chạy trên `dist`, `pnpm test`): `problem`, `list-engine`,
`import`, `export`, `auth-token`, `service-client`, `idempotency`, `events`; `postgres.test.mjs` chạy khi có `DATABASE_URL`.
