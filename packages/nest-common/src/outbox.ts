import { Logger } from "@nestjs/common";
import { newEvent, type EventEnvelope, type ServiceName } from "./events";
import type { EventBus } from "./bus";
import { Repository } from "./repository";
import type { RecordEntity } from "./types";

/**
 * Outbox: an event is written in the **same transaction** as the change that causes it, then a
 * relay publishes it. A crash between the write and the publish only delays the event; it is never
 * lost (no dual write).
 *
 * Two sources are relayed:
 * - collection `outbox`: business events a service adds inside `repo.transact([..., "outbox"], …)`
 *   with `enqueue(tables, event)`;
 * - collection `audit`: every audit entry the chassis already seals in the same transaction, sent
 *   as `audit.entry` so the audit service keeps a copy and checks each chain head.
 */
export const OUTBOX = "outbox";
const CURSOR = "outbox-cursor";

/** Adds an event to the outbox inside a transaction that also lists "outbox". */
export function enqueue(
  tables: Record<string, RecordEntity[]>,
  event: EventEnvelope,
) {
  const now = new Date().toISOString();
  (tables[OUTBOX] ??= []).push({
    id: event.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    event,
    attempts: 0,
  });
}

export class OutboxRelay {
  private log = new Logger("Outbox");
  private timer?: NodeJS.Timeout;
  private running = false;
  constructor(
    private repo: Repository,
    private bus: EventBus,
    private source: ServiceName,
    private options: {
      intervalMs?: number;
      batch?: number;
      relayAudit?: boolean;
    } = {},
  ) {}

  start() {
    const every =
      this.options.intervalMs ?? Number(process.env.OUTBOX_INTERVAL_MS ?? 1000);
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass: publishes pending outbox events, then new audit entries. Returns how many went out. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      return (
        (await this.relayOutbox()) +
        (this.options.relayAudit === false ? 0 : await this.relayAudit())
      );
    } catch (error) {
      this.log.warn(`relay paused: ${(error as Error).message}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async relayOutbox() {
    const pending = (await this.repo.list(OUTBOX)).slice(
      0,
      this.options.batch ?? 100,
    );
    let sent = 0;
    for (const item of pending) {
      try {
        await this.bus.publish(item.event as EventEnvelope);
      } catch (error) {
        await this.repo.mutate(OUTBOX, (items) => {
          const row = items.find((x) => x.id === item.id);
          if (row) row.attempts = Number(row.attempts ?? 0) + 1;
        });
        throw error;
      }
      await this.repo.mutate(OUTBOX, (items) => {
        const i = items.findIndex((x) => x.id === item.id);
        if (i >= 0) items.splice(i, 1);
      });
      sent++;
    }
    return sent;
  }

  private async relayAudit() {
    const entries = await this.repo.list("audit");
    const cursor = (await this.repo.list(CURSOR)).find((c) => c.id === "audit");
    const from = cursor
      ? entries.findIndex((e) => e.id === cursor.lastId) + 1
      : 0;
    const batch = entries.slice(from, from + (this.options.batch ?? 100));
    for (const entry of batch) {
      await this.bus.publish(
        newEvent({
          type: "audit.entry",
          source: this.source,
          organizationId: String(entry.organizationId ?? "OPS"),
          subject: {
            resource: String(entry.resource ?? "audit"),
            id: String(entry.recordId ?? entry.id),
          },
          actor: null,
          data: entry,
        }),
      );
      const now = new Date().toISOString();
      await this.repo.mutate(CURSOR, (items) => {
        const row = items.find((c) => c.id === "audit");
        if (row) Object.assign(row, { lastId: entry.id, updatedAt: now });
        else
          items.push({
            id: "audit",
            version: 1,
            createdAt: now,
            updatedAt: now,
            lastId: entry.id,
          });
      });
    }
    return batch.length;
  }
}
