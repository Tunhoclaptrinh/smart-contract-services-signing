import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
  BadRequestException,
  UseInterceptors,
  applyDecorators,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { from, lastValueFrom, type Observable } from "rxjs";
import { Repository } from "./repository";

/**
 * `Idempotency-Key` for requests that must not take effect twice (create a payment order, sign a
 * step). The first request with a key runs; a repeat with the same key and the same body gets the
 * stored answer (header `Idempotent-Replayed: true`) without running again; the same key with a
 * different body is 422 `IDEMPOTENCY_KEY_REUSED`; a repeat while the first still runs is 409
 * `IDEMPOTENCY_IN_PROGRESS`. A failed first request frees the key so the client can retry.
 * Keys are scoped by caller and route and kept 24 hours (collection `idempotency-keys`).
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const COLLECTION = "idempotency-keys";

export type IdempotentOutcome<T> =
  | { replayed: false; value: T }
  | { replayed: true; value: T; statusCode: number };

@Injectable()
export class IdempotencyStore {
  constructor(@Inject(Repository) private repo: Repository) {}

  async run<T>(
    scope: string,
    key: string,
    body: unknown,
    work: () => Promise<{ value: T; statusCode: number }>,
  ): Promise<IdempotentOutcome<T>> {
    if (!/^[\w.:-]{8,128}$/.test(key))
      throw new BadRequestException("INVALID_IDEMPOTENCY_KEY");
    const id = createHash("sha256").update(`${scope}\n${key}`).digest("hex");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(body ?? null))
      .digest("hex");
    const now = Date.now();
    const seen = await this.repo.mutate(COLLECTION, (items) => {
      for (let i = items.length - 1; i >= 0; i--)
        if (Date.parse(String(items[i].expiresAt)) <= now) items.splice(i, 1);
      const found = items.find((x) => x.id === id);
      if (found) return { ...found };
      const stamp = new Date(now).toISOString();
      items.push({
        id,
        version: 1,
        createdAt: stamp,
        updatedAt: stamp,
        fingerprint,
        status: "IN_PROGRESS",
        runId: randomUUID(),
        expiresAt: new Date(now + IDEMPOTENCY_TTL_MS).toISOString(),
      });
      return null;
    });
    if (seen) {
      if (seen.fingerprint !== fingerprint)
        throw new UnprocessableEntityException("IDEMPOTENCY_KEY_REUSED");
      if (seen.status !== "DONE")
        throw new ConflictException("IDEMPOTENCY_IN_PROGRESS");
      return {
        replayed: true,
        value: seen.response as T,
        statusCode: Number(seen.statusCode),
      };
    }
    try {
      const { value, statusCode } = await work();
      await this.repo.mutate(COLLECTION, (items) => {
        const row = items.find((x) => x.id === id);
        if (row)
          Object.assign(row, {
            status: "DONE",
            response: value,
            statusCode,
            updatedAt: new Date().toISOString(),
          });
      });
      return { replayed: false, value };
    } catch (error) {
      await this.repo.mutate(COLLECTION, (items) => {
        const i = items.findIndex((x) => x.id === id);
        if (i >= 0) items.splice(i, 1);
      });
      throw error;
    }
  }
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(Repository) private repo: Repository) {}
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = ctx.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const key = req.headers["idempotency-key"];
    if (typeof key !== "string" || !key)
      throw new BadRequestException("IDEMPOTENCY_KEY_REQUIRED");
    const scope = `${req.user?.id ?? "anonymous"} ${req.method} ${req.route?.path ?? req.path}`;
    const store = new IdempotencyStore(this.repo);
    return from(
      store
        .run(scope, key, req.body, async () => ({
          value: await lastValueFrom(next.handle()),
          statusCode: res.statusCode,
        }))
        .then((outcome) => {
          if (outcome.replayed) {
            res.status(outcome.statusCode);
            res.setHeader("Idempotent-Replayed", "true");
          }
          return outcome.value;
        }),
    );
  }
}

/** Route decorator: the request needs an `Idempotency-Key` header and takes effect once. */
export const Idempotent = () =>
  applyDecorators(UseInterceptors(IdempotencyInterceptor));
