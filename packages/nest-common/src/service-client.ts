import {
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
  BadGatewayException,
} from "@nestjs/common";
import { auditContext } from "./audit-events";

/**
 * Calls from one service to another (MS-R5). Every call has a timeout; only infrastructure
 * failures are retried, and only for idempotent methods; a business answer (4xx) of the target
 * comes back unchanged with its status and code, never retried:
 *
 * | Target                          | Caller gets                         | Retried            |
 * | ------------------------------- | ----------------------------------- | ------------------ |
 * | 2xx                             | the `data` of the envelope          | —                  |
 * | 4xx (business, auth)            | same status, same `code`            | no                 |
 * | 5xx                             | 502 `UPSTREAM_ERROR`                | yes (idempotent)   |
 * | refused / unreachable           | 503 `UPSTREAM_UNAVAILABLE`          | yes (idempotent)   |
 * | slower than the timeout         | 504 `UPSTREAM_TIMEOUT`              | yes (idempotent)   |
 *
 * The address comes from an environment variable (`CONTRACT_URL`…), the caller's token and
 * `x-request-id` are passed on so the target checks the same actor and logs one trace.
 */
export interface CallOptions {
  body?: unknown;
  /** Bearer token to pass on (usually the caller's own). */
  token?: string;
  timeoutMs?: number;
  /** Extra attempts after the first, for idempotent calls. */
  retries?: number;
  headers?: Record<string, string>;
  /** Send `Idempotency-Key` so a retried POST is safe on a target that honours it. */
  idempotencyKey?: string;
}

const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

/**
 * Protection for calls to a dependency that may be slow or down (a bank, a signing provider).
 * Circuit breaker: after `failures` infrastructure failures within `windowMs`, calls fail fast with
 * 503 `UPSTREAM_CIRCUIT_OPEN` for `openMs`, then one trial call decides (half-open). Business answers
 * (4xx) never count as failures. Bulkhead: at most `maxConcurrent` calls in flight, the next ones get
 * 503 `UPSTREAM_BUSY` instead of queueing behind a slow target.
 */
export interface Protection {
  breaker?: { failures?: number; windowMs?: number; openMs?: number };
  maxConcurrent?: number;
}
type Defaults = { timeoutMs?: number; retries?: number } & Protection;

export class CircuitBreaker {
  private failures: number[] = [];
  private openUntil = 0;
  private trial = false;
  constructor(
    private limit = 5,
    private windowMs = 10_000,
    private openMs = 10_000,
  ) {}
  get state(): "closed" | "open" | "half-open" {
    if (this.openUntil === 0) return "closed";
    return Date.now() < this.openUntil ? "open" : "half-open";
  }
  /** Whether a call may go out now. */
  allow() {
    const state = this.state;
    if (state === "closed") return true;
    if (state === "open" || this.trial) return false;
    this.trial = true;
    return true;
  }
  success() {
    this.failures = [];
    this.openUntil = 0;
    this.trial = false;
  }
  failure(now = Date.now()) {
    if (this.trial || this.state === "half-open") {
      this.trial = false;
      this.openUntil = now + this.openMs;
      return;
    }
    this.failures = this.failures.filter((t) => now - t < this.windowMs);
    this.failures.push(now);
    if (this.failures.length >= this.limit) this.openUntil = now + this.openMs;
  }
}
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export class ServiceClient {
  constructor(
    /** Name shown in errors and logs, e.g. "contract". */
    readonly target: string,
    /** Base URL ending before `/api/v1`, e.g. process.env.CONTRACT_URL. */
    private baseUrl: string | undefined,
    private defaults: Defaults = {},
  ) {
    const b = defaults.breaker;
    this.breaker = b
      ? new CircuitBreaker(b.failures, b.windowMs, b.openMs)
      : undefined;
  }
  readonly breaker?: CircuitBreaker;
  private inFlight = 0;

  /** Client for `<NAME>_URL`, e.g. `ServiceClient.fromEnv("contract")` reads CONTRACT_URL. */
  static fromEnv(target: string, defaults?: Defaults) {
    const variable = `${target.toUpperCase().replace(/-/g, "_")}_URL`;
    return new ServiceClient(target, process.env[variable], defaults);
  }

  get<T>(path: string, options?: CallOptions) {
    return this.call<T>("GET", path, options);
  }
  post<T>(path: string, options?: CallOptions) {
    return this.call<T>("POST", path, options);
  }
  patch<T>(path: string, options?: CallOptions) {
    return this.call<T>("PATCH", path, options);
  }
  delete<T>(path: string, options?: CallOptions) {
    return this.call<T>("DELETE", path, options);
  }

  async call<T>(
    method: string,
    path: string,
    options: CallOptions = {},
  ): Promise<T> {
    if (this.breaker && !this.breaker.allow())
      throw new ServiceUnavailableException(
        `UPSTREAM_CIRCUIT_OPEN:${this.target}`,
      );
    const max = this.defaults.maxConcurrent;
    if (max !== undefined && this.inFlight >= max)
      throw new ServiceUnavailableException(`UPSTREAM_BUSY:${this.target}`);
    this.inFlight++;
    try {
      const result = await this.send<T>(method, path, options);
      this.breaker?.success();
      return result;
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      if (status >= 500) this.breaker?.failure();
      else this.breaker?.success();
      throw error;
    } finally {
      this.inFlight--;
    }
  }

  private async send<T>(
    method: string,
    path: string,
    options: CallOptions,
  ): Promise<T> {
    if (!this.baseUrl)
      throw new ServiceUnavailableException(
        `UPSTREAM_NOT_CONFIGURED:${this.target}`,
      );
    const timeoutMs = options.timeoutMs ?? this.defaults.timeoutMs ?? 3000;
    const safe = IDEMPOTENT.has(method) || Boolean(options.idempotencyKey);
    const retries = safe ? (options.retries ?? this.defaults.retries ?? 2) : 0;
    const requestId = auditContext.getStore()?.requestId;
    const headers: Record<string, string> = {
      accept: "application/json",
      ...(options.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(requestId ? { "x-request-id": requestId } : {}),
      ...(options.idempotencyKey
        ? { "idempotency-key": options.idempotencyKey }
        : {}),
      ...options.headers,
    };
    const url = `${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`;
    let failure: HttpException = new ServiceUnavailableException(
      "UPSTREAM_UNAVAILABLE",
    );
    for (let attempt = 0; attempt <= retries; attempt++) {
      // Exponential backoff with jitter: 100 ms, 200 ms, … between attempts.
      if (attempt) await sleep(100 * 2 ** (attempt - 1) + Math.random() * 50);
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body:
            options.body === undefined
              ? undefined
              : JSON.stringify(options.body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const timedOut = (error as { name?: string })?.name === "TimeoutError";
        failure = timedOut
          ? new GatewayTimeoutException(`UPSTREAM_TIMEOUT:${this.target}`)
          : new ServiceUnavailableException(
              `UPSTREAM_UNAVAILABLE:${this.target}`,
            );
        continue;
      }
      const text = await res.text();
      let body: { data?: unknown; code?: string; errors?: unknown } | undefined;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        body = undefined;
      }
      if (res.ok) return (body && "data" in body ? body.data : body) as T;
      if (res.status < 500) {
        // A business or authorization answer: pass it on as the target gave it.
        throw new HttpException(
          {
            message: body?.code ?? `UPSTREAM_${res.status}`,
            ...(body?.errors ? { errors: body.errors } : {}),
          },
          res.status,
        );
      }
      failure =
        res.status === 503
          ? new ServiceUnavailableException(
              `UPSTREAM_UNAVAILABLE:${this.target}`,
            )
          : res.status === 504
            ? new GatewayTimeoutException(`UPSTREAM_TIMEOUT:${this.target}`)
            : new BadGatewayException(`UPSTREAM_ERROR:${this.target}`);
    }
    throw failure;
  }
}
