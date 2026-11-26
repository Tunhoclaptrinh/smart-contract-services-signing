// Event envelope v1: built from the request context, checked on receipt; schemas and catalogue agree.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { auditContext, isEventEnvelope, newEvent } from "../dist/index.js";

const contracts = fileURLToPath(new URL("../../contracts/", import.meta.url));
const json = (name) => JSON.parse(readFileSync(contracts + name, "utf8"));

test("an event takes the actor and request id of the current request", () => {
  const actor = { id: "u1", role: "SUPPLIER", organizationId: "S015" };
  const event = auditContext.run({ requestId: "req-1", actor }, () =>
    newEvent({
      type: "evidence.submitted",
      source: "execution",
      subject: { resource: "milestones", id: "m1" },
      data: { evidenceId: "e1" },
    }),
  );
  assert.equal(event.requestId, "req-1");
  assert.deepEqual(event.actor, actor);
  assert.equal(event.organizationId, "S015");
  assert.equal(event.version, 1);
  assert.ok(isEventEnvelope(event));
});

test("outside a request the actor is the system", () => {
  const event = newEvent({
    type: "rule_set.published",
    source: "decision",
    subject: { resource: "rule-sets", id: "r1" },
    data: {},
  });
  assert.equal(event.actor, null);
  assert.equal(event.requestId, null);
  assert.equal(event.organizationId, "OPS");
});

test("malformed envelopes are refused", () => {
  const good = newEvent({
    type: "payment.settled",
    source: "payment",
    subject: { resource: "payments", id: "p1" },
    data: { amountVnd: "1000" },
  });
  for (const bad of [
    null,
    { ...good, type: "PaymentSettled" },
    { ...good, version: "1" },
    { ...good, subject: { resource: "payments" } },
    { ...good, data: "x" },
  ])
    assert.equal(isEventEnvelope(bad), false, JSON.stringify(bad));
});

test("schemas parse and the catalogue names each type once with a known producer", () => {
  assert.equal(
    json("schemas/event-envelope.v1.json").$id,
    "scw:event-envelope:v1",
  );
  const pkg = json("schemas/contract-package.v1.json");
  assert.equal(pkg.properties.schema.const, "SCW_CONTRACT_PACKAGE_V1");
  const { events } = json("events.json");
  const types = events.map((e) => e.type);
  assert.equal(new Set(types).size, types.length);
  const sources = json("schemas/event-envelope.v1.json").properties.source.enum;
  for (const e of events)
    if (!e.producer.startsWith("every"))
      assert.ok(sources.includes(e.producer), e.type);
});
