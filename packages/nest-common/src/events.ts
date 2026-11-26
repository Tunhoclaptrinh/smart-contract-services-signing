import { randomUUID } from "node:crypto";
import { auditContext } from "./audit-events";
import type { Actor } from "./types";

/**
 * Events between services (draft v1; packages/contracts/schemas/event-envelope.v1.json is the
 * contract, packages/contracts/events.json the catalogue). Consumers deduplicate by `id`.
 */
export type ServiceName =
  | "identity"
  | "contract"
  | "signing"
  | "execution"
  | "decision"
  | "payment"
  | "audit";

export interface EventEnvelope<T extends object = Record<string, unknown>> {
  id: string;
  type: string;
  version: number;
  occurredAt: string;
  source: ServiceName;
  organizationId: string;
  actor: { id: string; role: string; organizationId?: string } | null;
  subject: { resource: string; id: string };
  requestId: string | null;
  data: T;
}

/** A new envelope; actor and request id come from the current request when there is one. */
export function newEvent<T extends object>(input: {
  type: string;
  source: ServiceName;
  subject: { resource: string; id: string };
  data: T;
  organizationId?: string;
  actor?: Actor | null;
  version?: number;
}): EventEnvelope<T> {
  const context = auditContext.getStore();
  const actor = input.actor ?? (context?.actor as Actor | undefined) ?? null;
  return {
    id: randomUUID(),
    type: input.type,
    version: input.version ?? 1,
    occurredAt: new Date().toISOString(),
    source: input.source,
    organizationId: input.organizationId ?? actor?.organizationId ?? "OPS",
    actor: actor
      ? { id: actor.id, role: actor.role, organizationId: actor.organizationId }
      : null,
    subject: input.subject,
    requestId: context?.requestId ?? null,
    data: input.data,
  };
}

const TYPE = /^[a-z]+(_[a-z]+)*\.[a-z]+(_[a-z]+)*$/;
/** Shape check for a received envelope (the consumer still checks the data of its own types). */
export function isEventEnvelope(value: unknown): value is EventEnvelope {
  const e = value as Partial<EventEnvelope> | null;
  return Boolean(
    e &&
    typeof e === "object" &&
    typeof e.id === "string" &&
    typeof e.type === "string" &&
    TYPE.test(e.type) &&
    Number.isInteger(e.version) &&
    typeof e.occurredAt === "string" &&
    typeof e.source === "string" &&
    typeof e.organizationId === "string" &&
    e.subject &&
    typeof e.subject.resource === "string" &&
    typeof e.subject.id === "string" &&
    e.data &&
    typeof e.data === "object",
  );
}

/** Signed contract package v1 (schemas/contract-package.v1.json). Money: whole VND as a string. */
export interface ContractPackageV1 {
  schema: "SCW_CONTRACT_PACKAGE_V1";
  contract: {
    id: string;
    code: string;
    title: string;
    type: string;
    valueVnd: string;
    start: string;
    end: string;
    approvalPolicy: string;
    legalProfile?: string;
  };
  parties: { buyer: PackageParty; supplier: PackageParty };
  milestones: {
    sequence: number;
    type: string;
    due: string;
    percent: string;
    plannedVnd: string;
    requiredEvents: string[];
    approvalRoles: string[];
    graceDays?: number;
    penaltyRatePct?: string;
    maxPenaltyPct?: string;
    latePenalty?: boolean;
  }[];
  members: {
    userId: string;
    side: "BUYER" | "SUPPLIER";
    duty: string;
    milestones?: number[];
    eventTypes?: string[];
  }[];
  document: { id: string; sha256: string; sealedAt: string };
  signatures: {
    step: number;
    signerId: string;
    signedAt: string;
    level: "SIMULATED" | "DIGITAL";
  }[];
  ruleSet: { id: string; version: string; sha256?: string };
}
export interface PackageParty {
  id: string;
  name: string;
  taxCode?: string;
  approvalLimitVnd?: string;
}
