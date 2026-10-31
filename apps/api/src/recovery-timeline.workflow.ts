import { createHash } from "node:crypto";
import { z } from "zod";

/** Scheduling, not delivery: the timeline requests a review; Graphile executes approved outbox work. */
export const RECOVERY_SCHEDULING_OWNERS = Object.freeze({
  recovery_wait: "recovery_timeline", builder_response: "recovery_timeline",
  evidence_completion: "recovery_timeline", reminder_review: "recovery_timeline", recovery_closure: "recovery_timeline",
  discover_outbox: "graphile", execute_outbox: "graphile",
} as const);
export function assertRecoverySchedulingOwner(action: keyof typeof RECOVERY_SCHEDULING_OWNERS, owner: string): void {
  if (RECOVERY_SCHEDULING_OWNERS[action] !== owner) throw new RecoveryTimelineError("OWNER_MISMATCH");
}

export class RecoveryTimelineError extends Error {
  constructor(readonly code: "DISABLED" | "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "OWNER_MISMATCH" | "ACTIVITY_FAILED") {
    super(`RECOVERY_TIMELINE_${code}`); this.name = "RecoveryTimelineError";
  }
}
export function requireSyntheticTimeline(environment = "disabled"): void {
  if (environment !== "synthetic_demo") throw new RecoveryTimelineError("DISABLED");
}
const id = z.guid().transform(value => value.toLowerCase());
export const recoveryTimelineRefV1 = z.object({ tenantId: id, jobId: id, caseId: id, runId: id, followUpId: id }).strict();
export type RecoveryTimelineRef = z.infer<typeof recoveryTimelineRefV1>;
const signalSchema = z.object({
  version: z.enum(["recovery-timeline-signal.v1", "recovery-timeline-signal.v2"]),
  signalId: id, ref: recoveryTimelineRefV1,
  kind: z.enum(["timer", "builder_response", "evidence_complete", "cancel", "close"]),
  /** Immutable source-event identity, not an assertion that evidence/response is valid. */
  eventId: id,
}).strict();
export type RecoveryTimelineSignal = z.infer<typeof signalSchema>;
export type TimelineState = "waiting" | "review" | "stopped";
export type TimelineActivity = Readonly<{ ref: RecoveryTimelineRef; kind: RecoveryTimelineSignal["kind"]; commandId: string }>;
export interface RecoveryTimelineActivities {
  /** Recheck current session, membership, scope and consent, including on a replay after a crash. */
  execute(activity: TimelineActivity): Promise<TimelineState>;
}
export interface RecoveryWorkflowRuntime {
  signal(raw: unknown): Promise<TimelineState>;
}

function parseSignal(raw: unknown): RecoveryTimelineSignal {
  const result = signalSchema.safeParse(raw);
  if (!result.success) throw new RecoveryTimelineError("INVALID_INPUT");
  // v2 deliberately preserves v1 semantics and command identities. Future changes need a new explicit branch.
  return { ...result.data, version: "recovery-timeline-signal.v2" };
}
function key(ref: RecoveryTimelineRef): string { return JSON.stringify(ref); }
function commandId(ref: RecoveryTimelineRef, kind: RecoveryTimelineSignal["kind"], eventId: string): string {
  // Timers and closure have one effect per intent, even if a scheduler redelivers under a different signal ID.
  const effect = kind === "timer" ? "due" : kind === "cancel" || kind === "close" ? "stop" : `${kind}:${eventId}`;
  const hash = createHash("sha256").update(`recovery-timeline.v1:${key(ref)}:${effect}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export function recoveryTimelineTransition(previous: TimelineState, kind: RecoveryTimelineSignal["kind"], observed: TimelineState): TimelineState {
  if (previous === "stopped" || kind === "cancel" || kind === "close" || observed === "stopped") return "stopped";
  return observed;
}
type Run = { state: TimelineState };
/** Test history only. Retain this store across fake-worker restarts; it is NOT a durable production host. */
export class InMemoryRecoveryWorkflowStore {
  readonly runs = new Map<string, Run>();
  readonly signals = new Map<string, string>();
  tail: Promise<unknown> = Promise.resolve();
}

/** DARK: no startup registration, endpoints, wall clock, provider calls or production runtime. */
export class InMemoryRecoveryWorkflowRuntime implements RecoveryWorkflowRuntime {
  constructor(private readonly activities: RecoveryTimelineActivities,
    private readonly store = new InMemoryRecoveryWorkflowStore(), private readonly environment = "disabled") {}

  signal(raw: unknown): Promise<TimelineState> {
    requireSyntheticTimeline(this.environment);
    const signal = parseSignal(raw);
    const pending = this.store.tail.then(() => this.apply(signal));
    this.store.tail = pending.catch(() => undefined);
    return pending;
  }

  private async apply(signal: RecoveryTimelineSignal): Promise<TimelineState> {
    const action = { timer: "reminder_review", builder_response: "builder_response", evidence_complete: "evidence_completion", cancel: "recovery_closure", close: "recovery_closure" } as const;
    assertRecoverySchedulingOwner(action[signal.kind], "recovery_timeline");
    const runKey = key(signal.ref), fingerprint = JSON.stringify(signal);
    // Signal IDs cannot be reused for another tenant/job/intent or another payload.
    const previous = this.store.signals.get(signal.signalId);
    if (previous && previous !== fingerprint) throw new RecoveryTimelineError("CONFLICT");
    const run = this.store.runs.get(runKey) ?? { state: "waiting" };
    const command = commandId(signal.ref, signal.kind, signal.eventId);
    // Even a duplicate rechecks access; an old signal can never return data after revocation.
    let observed: TimelineState;
    try { observed = await this.activities.execute({ ref: signal.ref, kind: run.state === "stopped" ? "builder_response" : signal.kind, commandId: command }); }
    catch { throw new RecoveryTimelineError("ACTIVITY_FAILED"); }
    run.state = recoveryTimelineTransition(run.state, signal.kind, observed);
    this.store.signals.set(signal.signalId, fingerprint);
    this.store.runs.set(runKey, run);
    return run.state;
  }
}
