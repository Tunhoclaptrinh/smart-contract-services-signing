import { Logger } from "@nestjs/common";
import { isEventEnvelope, type EventEnvelope } from "./events";
import { Repository } from "./repository";

/**
 * The event bus between services. Production: RabbitMQ (BUS_URL=amqp://…), one topic exchange
 * `scw.events` routed by event type, one durable queue per consumer, a dead-letter queue
 * `<queue>.dlq` next to it. Tests and single-process runs: the in-memory bus, same semantics.
 *
 * Delivery is at least once; `consume()` makes a consumer idempotent (collection
 * `processed-messages`, keyed by the event id), retries a failing handler `MAX_ATTEMPTS` times and
 * then parks the message in the dead-letter queue, so one bad message never blocks the queue.
 */
export const EXCHANGE = "scw.events";
export const DEAD_LETTER_EXCHANGE = "scw.dlx";
export const MAX_ATTEMPTS = 3;

export interface Delivery {
  event: EventEnvelope;
  attempt: number;
}
export type Handler = (delivery: Delivery) => Promise<void>;

export interface EventBus {
  publish(event: EventEnvelope): Promise<void>;
  /** Listens on `queue` for the given event types (`*` and `#` wildcards as in AMQP). */
  subscribe(queue: string, types: string[], handler: Handler): Promise<void>;
  /** Messages parked after `MAX_ATTEMPTS` failures (or malformed), oldest first. */
  deadLetters(queue: string): Promise<unknown[]>;
  close(): Promise<void>;
}

/** AMQP topic pattern: `*` one word, `#` zero or more words. */
export function topicMatches(pattern: string, type: string): boolean {
  const p = pattern.split(".");
  const t = type.split(".");
  const walk = (i: number, j: number): boolean => {
    if (i === p.length) return j === t.length;
    if (p[i] === "#") return walk(i + 1, j) || (j < t.length && walk(i, j + 1));
    if (j === t.length) return false;
    return (p[i] === "*" || p[i] === t[j]) && walk(i + 1, j + 1);
  };
  return walk(0, 0);
}

/** In-process bus with the same retry and dead-letter rules (tests, one-process demos). */
export class MemoryBus implements EventBus {
  private queues = new Map<string, { types: string[]; handler: Handler }>();
  private parked = new Map<string, unknown[]>();
  readonly published: EventEnvelope[] = [];
  async publish(event: EventEnvelope) {
    this.published.push(event);
    for (const [queue, q] of this.queues)
      if (q.types.some((t) => topicMatches(t, event.type)))
        await this.deliver(queue, q.handler, event);
  }
  private async deliver(queue: string, handler: Handler, event: EventEnvelope) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await handler({ event, attempt });
        return;
      } catch {
        // retried below; parked after the last attempt
      }
    }
    this.parked.set(queue, [...(this.parked.get(queue) ?? []), event]);
  }
  async subscribe(queue: string, types: string[], handler: Handler) {
    this.queues.set(queue, { types, handler });
  }
  /** Delivers a raw (possibly malformed) message, as a broker would. */
  async deliverRaw(queue: string, raw: unknown) {
    const q = this.queues.get(queue);
    if (!q) return;
    if (!isEventEnvelope(raw)) {
      this.parked.set(queue, [...(this.parked.get(queue) ?? []), raw]);
      return;
    }
    await this.deliver(queue, q.handler, raw);
  }
  async deadLetters(queue: string) {
    return this.parked.get(queue) ?? [];
  }
  async close() {}
}

type AmqpModule = typeof import("amqplib");
type Channel = import("amqplib").ConfirmChannel;

/** RabbitMQ through amqplib; reconnects on the next call after a dropped connection. */
export class AmqpBus implements EventBus {
  private log = new Logger("Bus");
  private connection?: import("amqplib").ChannelModel;
  private channel?: Channel;
  constructor(private url: string) {}

  private async open(): Promise<Channel> {
    if (this.channel) return this.channel;
    const amqp: AmqpModule = await import("amqplib");
    const connection = await amqp.connect(this.url);
    connection.on("error", () => undefined);
    connection.on("close", () => {
      this.channel = undefined;
      this.connection = undefined;
    });
    const channel = await connection.createConfirmChannel();
    await channel.assertExchange(EXCHANGE, "topic", { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, "topic", {
      durable: true,
    });
    this.connection = connection;
    this.channel = channel;
    return channel;
  }

  async publish(event: EventEnvelope) {
    const channel = await this.open();
    channel.publish(EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
      persistent: true,
      messageId: event.id,
      contentType: "application/json",
      type: event.type,
      headers: { "x-attempt": 1 },
    });
    await channel.waitForConfirms();
  }

  async subscribe(queue: string, types: string[], handler: Handler) {
    const channel = await this.open();
    await channel.assertQueue(`${queue}.dlq`, { durable: true });
    await channel.bindQueue(`${queue}.dlq`, DEAD_LETTER_EXCHANGE, queue);
    await channel.assertQueue(queue, {
      durable: true,
      deadLetterExchange: DEAD_LETTER_EXCHANGE,
      deadLetterRoutingKey: queue,
    });
    for (const type of types) await channel.bindQueue(queue, EXCHANGE, type);
    await channel.prefetch(10);
    await channel.consume(queue, async (message) => {
      if (!message) return;
      let event: unknown;
      try {
        event = JSON.parse(message.content.toString("utf8"));
      } catch {
        event = undefined;
      }
      if (!isEventEnvelope(event)) return channel.nack(message, false, false);
      const attempt = Number(message.properties.headers?.["x-attempt"] ?? 1);
      try {
        await handler({ event, attempt });
        channel.ack(message);
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) {
          this.log.warn(
            `${queue}: ${event.type} ${event.id} parked after ${attempt} attempts`,
          );
          channel.nack(message, false, false);
          return;
        }
        // Back of the same queue with the attempt counted; other consumers are not disturbed.
        channel.sendToQueue(queue, message.content, {
          ...message.properties,
          headers: { ...message.properties.headers, "x-attempt": attempt + 1 },
        });
        channel.ack(message);
        void error;
      }
    });
  }

  async deadLetters(queue: string) {
    const channel = await this.open();
    const parked: unknown[] = [];
    for (;;) {
      const message = await channel.get(`${queue}.dlq`, { noAck: false });
      if (!message) break;
      parked.push(JSON.parse(message.content.toString("utf8")));
      channel.nack(message, false, true);
      if (parked.length >= 100) break;
    }
    return parked;
  }

  async close() {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}

/** The bus for this process: BUS_URL (amqp://…) or, when unset, an in-memory bus. */
export function createBus(url = process.env.BUS_URL): EventBus {
  return url ? new AmqpBus(url) : new MemoryBus();
}

/**
 * Subscribes an idempotent consumer: an event already handled (same id) is acknowledged without
 * running the handler again; the handler's own writes and the "handled" mark should go in one
 * `repo.transact` when they must not diverge (the handler receives the repository for that).
 */
export async function consume(
  bus: EventBus,
  repo: Repository,
  options: {
    queue: string;
    types: string[];
    handle: (event: EventEnvelope, attempt: number) => Promise<void>;
  },
) {
  await bus.subscribe(
    options.queue,
    options.types,
    async ({ event, attempt }) => {
      const seen = (await repo.list("processed-messages")).some(
        (m) => m.id === `${options.queue}:${event.id}`,
      );
      if (seen) return;
      await options.handle(event, attempt);
      const now = new Date().toISOString();
      await repo.mutate("processed-messages", (items) => {
        if (!items.some((m) => m.id === `${options.queue}:${event.id}`))
          items.push({
            id: `${options.queue}:${event.id}`,
            version: 1,
            createdAt: now,
            updatedAt: now,
            type: event.type,
          });
      });
    },
  );
}
