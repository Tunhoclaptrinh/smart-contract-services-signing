// Outbox and bus: events leave with the transaction that caused them, never twice for a consumer,
// a bad message is parked instead of blocking, and the relay never feeds itself.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_ATTEMPTS,
  MemoryBus,
  OutboxRelay,
  Repository,
  consume,
  enqueue,
  newEvent,
  topicMatches,
} from "../dist/index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
let repo, dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "outbox-"));
  Object.assign(process.env, {
    DATA_DIR: dir,
    STORAGE_DRIVER: "file",
    REPO_ROOT: repoRoot,
  });
  repo = new Repository();
  await repo.init();
});
afterEach(async () => {
  await repo.onModuleDestroy();
  await rm(dir, { recursive: true, force: true });
});
const event = (type = "contract.activated", data = { contractId: "c1" }) =>
  newEvent({
    type,
    source: "signing",
    subject: { resource: "contracts", id: "c1" },
    data,
  });

test("topic patterns match like AMQP", () => {
  assert.ok(topicMatches("contract.*", "contract.activated"));
  assert.ok(topicMatches("#", "payment.settled"));
  assert.ok(topicMatches("evidence.#", "evidence.verified"));
  assert.equal(topicMatches("contract.*", "payment.settled"), false);
  assert.equal(topicMatches("audit.entry", "audit.entry.x"), false);
});

test("an event written with the change is published once, and the relay goes quiet", async () => {
  const bus = new MemoryBus();
  const relay = new OutboxRelay(repo, bus, "signing", { relayAudit: false });
  await repo.transact(["contracts", "outbox"], (tables) => {
    tables.contracts.push({
      id: "c1",
      version: 1,
      createdAt: "",
      updatedAt: "",
      status: "ACTIVE",
    });
    enqueue(tables, event());
  });
  assert.equal(await relay.tick(), 1);
  assert.equal(bus.published[0].type, "contract.activated");
  assert.equal((await repo.list("outbox")).length, 0);
  assert.equal(await relay.tick(), 0);
});

test("audit entries go out as audit.entry once each; bookkeeping writes add none", async () => {
  const bus = new MemoryBus();
  const relay = new OutboxRelay(repo, bus, "contract");
  await repo.mutate("contract-drafts", (items) =>
    items.push({
      id: "d1",
      version: 1,
      createdAt: "",
      updatedAt: "",
      title: "A",
    }),
  );
  const first = await relay.tick();
  assert.ok(first >= 1);
  assert.ok(bus.published.every((e) => e.type === "audit.entry"));
  // Updating the cursor must not create audit entries that the relay would then publish again.
  for (let i = 0; i < 3; i++) assert.equal(await relay.tick(), 0);
  await repo.mutate("contract-drafts", (items) => (items[0].title = "B"));
  assert.equal(await relay.tick(), 1);
});

test("a failed publish keeps the event for the next pass", async () => {
  const bus = new MemoryBus();
  let down = true;
  const flaky = {
    publish: async (e) => {
      if (down) throw new Error("broker down");
      return bus.publish(e);
    },
  };
  const relay = new OutboxRelay(repo, flaky, "payment", { relayAudit: false });
  await repo.transact(["outbox"], (tables) =>
    enqueue(tables, event("payment.settled")),
  );
  assert.equal(await relay.tick(), 0);
  assert.equal((await repo.list("outbox"))[0].attempts, 1);
  down = false;
  assert.equal(await relay.tick(), 1);
  assert.equal(bus.published.length, 1);
});

test("a consumer handles an event once even when it is delivered twice", async () => {
  const bus = new MemoryBus();
  const handled = [];
  await consume(bus, repo, {
    queue: "execution.contracts",
    types: ["contract.activated"],
    handle: async (e) => void handled.push(e.id),
  });
  const e = event();
  await bus.publish(e);
  await bus.publish(e);
  assert.deepEqual(handled, [e.id]);
});

test("a failing handler is retried, then parked; the queue keeps flowing", async () => {
  const bus = new MemoryBus();
  let attempts = 0;
  const handled = [];
  await consume(bus, repo, {
    queue: "audit.all",
    types: ["#"],
    handle: async (e) => {
      if (e.data.bad) {
        attempts++;
        throw new Error("cannot store");
      }
      handled.push(e.id);
    },
  });
  await bus.publish(event("evidence.submitted", { bad: true }));
  await bus.deliverRaw("audit.all", { not: "an envelope" });
  const good = event("evidence.submitted", { ok: true });
  await bus.publish(good);
  assert.equal(attempts, MAX_ATTEMPTS);
  assert.equal((await bus.deadLetters("audit.all")).length, 2);
  assert.deepEqual(handled, [good.id]);
});
