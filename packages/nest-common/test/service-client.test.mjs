// Calls between services: timeout, retry rules, 4xx passed on, 503/504 mapping, trace headers.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { CircuitBreaker, ServiceClient, auditContext } from "../dist/index.js";

let server, base;
const seen = [];
let flaky = 0;
before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url, method: req.method, headers: req.headers });
    const send = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url.endsWith("/ok"))
      return send(200, { success: true, data: { n: 1 } });
    if (req.url.endsWith("/conflict"))
      return send(409, { code: "INVALID_TRANSITION", status: 409 });
    if (req.url.endsWith("/boom")) return send(500, { code: "INTERNAL_ERROR" });
    if (req.url.endsWith("/flaky"))
      return ++flaky < 3
        ? send(503, {})
        : send(200, { success: true, data: "late" });
    if (req.url.endsWith("/slow")) return setTimeout(() => send(200, {}), 500);
    send(404, { code: "NOT_FOUND" });
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});
const count = (suffix) => seen.filter((s) => s.url.endsWith(suffix)).length;

test("a 2xx answer returns the envelope's data and forwards token and request id", async () => {
  const client = new ServiceClient("demo", base);
  const data = await auditContext.run({ requestId: "req-1" }, () =>
    client.get("/ok", { token: "t0k" }),
  );
  assert.deepEqual(data, { n: 1 });
  const last = seen.at(-1);
  assert.equal(last.url, "/api/v1/ok");
  assert.equal(last.headers.authorization, "Bearer t0k");
  assert.equal(last.headers["x-request-id"], "req-1");
});

test("a business 4xx comes back unchanged and is never retried", async () => {
  const client = new ServiceClient("demo", base, { retries: 3 });
  await assert.rejects(client.get("/conflict"), (e) => {
    assert.equal(e.getStatus(), 409);
    assert.equal(e.message, "INVALID_TRANSITION");
    return true;
  });
  assert.equal(count("/conflict"), 1);
});

test("idempotent calls retry infrastructure failures, POST does not", async () => {
  const client = new ServiceClient("demo", base);
  assert.equal(await client.get("/flaky"), "late");
  assert.equal(count("/flaky"), 3);
  await assert.rejects(client.post("/boom", { body: {} }), (e) => {
    assert.equal(e.getStatus(), 502);
    assert.equal(e.message, "UPSTREAM_ERROR:demo");
    return true;
  });
  assert.equal(count("/boom"), 1);
});

test("slow targets give 504, unreachable ones 503, missing config 503", async () => {
  await assert.rejects(
    new ServiceClient("demo", base).get("/slow", {
      timeoutMs: 100,
      retries: 0,
    }),
    (e) => e.getStatus() === 504 && e.message === "UPSTREAM_TIMEOUT:demo",
  );
  await assert.rejects(
    new ServiceClient("gone", "http://127.0.0.1:1").get("/x", { retries: 0 }),
    (e) => e.getStatus() === 503 && e.message === "UPSTREAM_UNAVAILABLE:gone",
  );
  delete process.env.NOWHERE_URL;
  await assert.rejects(
    ServiceClient.fromEnv("nowhere").get("/x"),
    (e) =>
      e.getStatus() === 503 && e.message === "UPSTREAM_NOT_CONFIGURED:nowhere",
  );
});

test("the circuit opens after repeated infrastructure failures and fails fast", async () => {
  const client = new ServiceClient("bank", "http://127.0.0.1:1", {
    retries: 0,
    breaker: { failures: 2, windowMs: 10_000, openMs: 200 },
  });
  for (let i = 0; i < 2; i++)
    await assert.rejects(
      client.get("/x"),
      (e) => e.message === "UPSTREAM_UNAVAILABLE:bank",
    );
  assert.equal(client.breaker.state, "open");
  const started = Date.now();
  await assert.rejects(
    client.get("/x"),
    (e) => e.message === "UPSTREAM_CIRCUIT_OPEN:bank",
  );
  assert.ok(Date.now() - started < 50, "fails fast without calling");
  await new Promise((done) => setTimeout(done, 220));
  assert.equal(client.breaker.state, "half-open");
});

test("business answers do not open the circuit; a good trial closes it", async () => {
  const breaker = new CircuitBreaker(1, 10_000, 50);
  breaker.failure();
  assert.equal(breaker.state, "open");
  await new Promise((done) => setTimeout(done, 60));
  assert.equal(breaker.allow(), true);
  assert.equal(breaker.allow(), false, "one trial at a time");
  breaker.success();
  assert.equal(breaker.state, "closed");
  const client = new ServiceClient("demo", base, {
    breaker: { failures: 1 },
    retries: 0,
  });
  await assert.rejects(client.get("/conflict"), (e) => e.getStatus() === 409);
  assert.equal(client.breaker.state, "closed");
});

test("the bulkhead refuses calls beyond the limit instead of queueing", async () => {
  const client = new ServiceClient("demo", base, {
    maxConcurrent: 1,
    timeoutMs: 1000,
    retries: 0,
  });
  const slow = client.get("/slow");
  await assert.rejects(
    client.get("/ok"),
    (e) => e.getStatus() === 503 && e.message === "UPSTREAM_BUSY:demo",
  );
  await slow;
  assert.deepEqual(await client.get("/ok"), { n: 1 });
});
