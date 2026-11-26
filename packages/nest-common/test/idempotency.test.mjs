// Idempotency-Key: one effect per key, replay with the stored answer, reuse and overlap refused.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import "reflect-metadata";
import { Body, Controller, HttpCode, Module, Post } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { Idempotent, IdempotencyStore, Repository } from "../dist/index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
let repo, store, dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "idem-"));
  Object.assign(process.env, {
    DATA_DIR: dir,
    STORAGE_DRIVER: "file",
    REPO_ROOT: repoRoot,
  });
  repo = new Repository();
  await repo.init();
  store = new IdempotencyStore(repo);
});
afterEach(async () => {
  await repo.onModuleDestroy();
  await rm(dir, { recursive: true, force: true });
});

test("the same key and body run once and replay the stored answer", async () => {
  let runs = 0;
  const work = async () => ({ value: { order: ++runs }, statusCode: 201 });
  const first = await store.run(
    "u1 POST /orders",
    "key-00000001",
    { m: 1 },
    work,
  );
  const again = await store.run(
    "u1 POST /orders",
    "key-00000001",
    { m: 1 },
    work,
  );
  assert.deepEqual(first, { replayed: false, value: { order: 1 } });
  assert.deepEqual(again, {
    replayed: true,
    value: { order: 1 },
    statusCode: 201,
  });
  assert.equal(runs, 1);
});

test("the same key with another body is refused; another caller has its own keys", async () => {
  const work = async () => ({ value: 1, statusCode: 201 });
  await store.run("u1 POST /orders", "key-00000002", { m: 1 }, work);
  await assert.rejects(
    store.run("u1 POST /orders", "key-00000002", { m: 2 }, work),
    (e) => {
      assert.equal(e.getStatus(), 422);
      assert.equal(e.message, "IDEMPOTENCY_KEY_REUSED");
      return true;
    },
  );
  const other = await store.run(
    "u2 POST /orders",
    "key-00000002",
    { m: 2 },
    work,
  );
  assert.equal(other.replayed, false);
});

test("a repeat while the first runs is 409; a failure frees the key", async () => {
  let release;
  const slow = store.run(
    "u1 POST /x",
    "key-00000003",
    {},
    () =>
      new Promise(
        (done) => (release = () => done({ value: 1, statusCode: 200 })),
      ),
  );
  await new Promise((done) => setTimeout(done, 20));
  await assert.rejects(
    store.run("u1 POST /x", "key-00000003", {}, async () => ({})),
    (e) => e.getStatus() === 409,
  );
  release();
  await slow;
  await assert.rejects(
    store.run("u1 POST /y", "key-00000004", {}, async () => {
      throw new Error("boom");
    }),
  );
  const retried = await store.run(
    "u1 POST /y",
    "key-00000004",
    {},
    async () => ({
      value: "ok",
      statusCode: 201,
    }),
  );
  assert.equal(retried.value, "ok");
  await assert.rejects(
    store.run("s", "short", {}, async () => ({})),
    /INVALID_IDEMPOTENCY_KEY/,
  );
});

test("the @Idempotent() route replays over HTTP with the same status", async () => {
  let created = 0;
  class OrdersController {
    create(body) {
      created++;
      return { id: `o${created}`, milestoneId: body.milestoneId };
    }
  }
  Controller("orders")(OrdersController);
  const descriptor = Object.getOwnPropertyDescriptor(
    OrdersController.prototype,
    "create",
  );
  Reflect.decorate(
    [Post(), HttpCode(201), Idempotent()],
    OrdersController.prototype,
    "create",
    descriptor,
  );
  Body()(OrdersController.prototype, "create", 0);
  class AppModule {}
  Module({
    controllers: [OrdersController],
    providers: [{ provide: Repository, useValue: repo }],
  })(AppModule);
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(0, "127.0.0.1");
  const url = `${await app.getUrl()}/orders`;
  const send = (key, body) =>
    fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "idempotency-key": key } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const a = await send("pay-m1-00000001", { milestoneId: "m1" });
    const b = await send("pay-m1-00000001", { milestoneId: "m1" });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await b.json(), await a.json());
    assert.equal(created, 1);
    assert.equal((await send(null, { milestoneId: "m1" })).status, 400);
  } finally {
    await app.close();
  }
});
