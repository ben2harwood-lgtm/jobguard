import { z } from "zod";

const uuid = z.guid({ error: "Invalid uuid" });
/** Canonical UTC microseconds are compared as text. Date is used only for calendar validation. */
export const workFactTimeV1 = z.iso.datetime({ precision: 6, error: "Invalid datetime" }).refine(value => {
 const date = new Date(value);
 return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19);
});
export const closeReasonV1 = z.enum(["cancelled_by_customer", "abandoned", "completed_outside_jobguard", "other"]);
const note = z.string().trim().min(1).max(2000);
const command = { version: z.literal("job-work-state-command.v1"), commandId: uuid, expectedRevision: z.number().int().nonnegative().safe() };
/** Input structure only; persisted command authority is checked in the SQL boundary. */
export const jobWorkStateCommandV1 = z.discriminatedUnion("action", [
 z.object({ ...command, action: z.literal("finish") }).strict(),
 z.object({ ...command, action: z.literal("cancel_finish"), markerId: uuid }).strict(),
 z.object({ ...command, action: z.literal("close"), reason: closeReasonV1, note }).strict(),
 z.object({ ...command, action: z.literal("reopen"), closeEventId: uuid }).strict(),
 z.object({ ...command, action: z.literal("resume") }).strict(),
]);
export const jobLinkCommandV1 = z.object({ version: z.literal("job-link-command.v1"), commandId: uuid, successorJobId: uuid, expectedRevision: z.number().int().nonnegative().safe(), predecessorBindingId: uuid, successorBindingId: uuid }).strict();

export const jobWorkStateEventV1 = z.object({
 version: z.literal("job-work-state-event.v1"), id: uuid, jobId: uuid, sequence: z.number().int().positive().safe(),
 kind: z.enum(["first_site_evidence", "site_activity", "finished_on_site", "finished_cancelled", "closed", "reopened", "resumed"]),
 factAt: workFactTimeV1, recordedAt: workFactTimeV1, sourceReceiptId: uuid.nullable(), commandId: uuid.nullable(),
 predecessorId: uuid.nullable(), closeReason: closeReasonV1.nullable(), closeNote: note.nullable(),
}).strict().superRefine((event, ctx) => {
 const invalid = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
 if ((event.kind === "closed") !== (event.closeReason !== null && event.closeNote !== null)) invalid("Close requires a reason and note");
 if (event.kind !== "closed" && (event.closeReason !== null || event.closeNote !== null)) invalid("Only close carries reason and note");
 if (["finished_cancelled", "reopened"].includes(event.kind) !== (event.predecessorId !== null)) invalid("Cancellation and reopening require a predecessor");
 if (event.predecessorId === event.id) invalid("A fact cannot precede itself");
 if (["first_site_evidence", "site_activity"].includes(event.kind) && event.sourceReceiptId === null) invalid("Site facts require a durable source");
 if (!["first_site_evidence", "site_activity", "finished_cancelled"].includes(event.kind) && (event.commandId === null || event.sourceReceiptId !== null)) invalid("Lifecycle facts require a command identity");
 if (event.kind === "finished_cancelled" && ((event.commandId === null) === (event.sourceReceiptId === null))) invalid("Cancellation requires exactly one command or site source");
});
export type JobWorkStateEvent = z.infer<typeof jobWorkStateEventV1>;

const source = { version: z.literal("job-site-source.v1") };
export const siteSourceV1 = z.discriminatedUnion("kind", [
 z.object({ ...source, kind: z.literal("photo"), original: z.boolean(), verified: z.boolean(), invalidated: z.boolean(), purpose: z.enum(["progress", "proof", "snagging"]), objectVersionId: z.string().min(1).max(1024), sha256: z.string().regex(/^[a-f0-9]{64}$/u), byteLength: z.number().int().positive().safe() }).strict(),
 z.object({ ...source, kind: z.literal("delivery_note"), ready: z.boolean(), sourceVersionId: uuid }).strict(),
 ...(["goods_receipt", "builder_extra", "stage_completion", "order", "supplier_invoice", "quote", "message", "readiness", "billing", "final_review", "jobguard_catch", "repricing", "approval", "rejection", "withdrawal"] as const).map(kind => z.object({ ...source, kind: z.literal(kind) }).strict()),
]);
export function classifySiteSource(raw: unknown): { firstEvidence: boolean; activity: boolean } {
 const fact = siteSourceV1.safeParse(raw);
 if (!fact.success) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
 const value = fact.data;
 const firstEvidence = value.kind === "goods_receipt" || (value.kind === "delivery_note" && value.ready) || (value.kind === "photo" && value.original && value.verified && !value.invalidated && value.purpose !== "snagging");
 return { firstEvidence, activity: firstEvidence || value.kind === "builder_extra" || value.kind === "stage_completion" };
}

export class JobWorkStateError extends Error {
 constructor(readonly code: "WORK_STATE_CONFLICT" | "JOB_NOT_LIVE" | "WORK_STATE_STALE_REVISION" | "CAPACITY_ADMISSION_UNAVAILABLE" | "METER_UPGRADE_REQUIRED" | "METER_PROJECTION_MISMATCH" | "INVALID_WORK_STATE_INPUT" | "WORK_FACT_IDENTITY_CONFLICT" | "WORK_STATE_FORBIDDEN" | "SYNTHETIC_MODE_REQUIRED" | "POST_LOCK_WORK_REQUIRES_LINKED_JOB" | "JOB_WORK_CLOSED") { super(code); this.name = "JobWorkStateError"; }
}
const canonicalEvent = (e: JobWorkStateEvent) => JSON.stringify([e.version, e.id, e.jobId, e.sequence, e.kind, e.factAt, e.recordedAt, e.sourceReceiptId, e.commandId, e.predecessorId, e.closeReason, e.closeNote]);
export function orderWorkFacts(raw: readonly unknown[]): JobWorkStateEvent[] {
 const unique = new Map<string, JobWorkStateEvent>();
 for (const value of raw) {
  const parsed = jobWorkStateEventV1.safeParse(value);
  if (!parsed.success) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
  const event = parsed.data, prior = unique.get(event.id);
  if (prior && canonicalEvent(prior) !== canonicalEvent(event)) throw new JobWorkStateError("WORK_FACT_IDENTITY_CONFLICT");
  unique.set(event.id, event);
 }
 return [...unique.values()].sort((a, b) => a.factAt < b.factAt ? -1 : a.factAt > b.factAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
const lockV1 = z.object({ id: uuid, lockedAt: workFactTimeV1 }).strict();
/** Only immutable fact inputs. Timer deadlines, intervals and eligibility await Q-01/Q-04/Q-05. */
export function projectWorkFacts(raw: readonly unknown[], lock: z.infer<typeof lockV1> | null) {
 const events = orderWorkFacts(raw);
 const bySequence = [...events].sort((a, b) => a.sequence - b.sequence);
 let finishedMarkerId: string | null = null, closedEventId: string | null = null;
 const seen = new Map<string, JobWorkStateEvent>();
 for (const event of bySequence) {
  if (event.kind === "finished_on_site") finishedMarkerId = event.id;
  if (event.kind === "closed") closedEventId = event.id;
  if (event.kind === "finished_cancelled") {
   if (seen.get(event.predecessorId!)?.kind !== "finished_on_site" || finishedMarkerId !== event.predecessorId || seen.get(event.predecessorId!)!.factAt > event.factAt) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
   finishedMarkerId = null;
  }
  if (event.kind === "reopened") {
   if (seen.get(event.predecessorId!)?.kind !== "closed" || closedEventId !== event.predecessorId) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
   closedEventId = null;
  }
  seen.set(event.id, event);
 }
 if (finishedMarkerId !== null) {
  const marker = seen.get(finishedMarkerId)!;
  if (events.some(event => ["site_activity", "first_site_evidence"].includes(event.kind) && (event.factAt > marker.factAt || (event.factAt === marker.factAt && event.id > marker.id)))) finishedMarkerId = null;
 }
 return { version: "job-work-facts.v1" as const, events, firstSiteEvidenceId: events.find(e => e.kind === "first_site_evidence")?.id ?? null, finishedMarkerId, closedEventId, lock: lock === null ? null : lockV1.parse(lock), policyStatus: "intervals_and_command_authority_held" as const };
}
export const LINKED_JOB_COPY = "Start a linked job for this customer and site";
export const linkedJobOfferV1 = z.object({ version: z.literal("job-linked-offer.v1"), code: z.literal("POST_LOCK_WORK_REQUIRES_LINKED_JOB"), message: z.literal(LINKED_JOB_COPY), jobId: uuid, customerId: uuid, siteId: uuid }).strict();
export function classifyPostLockFact(kind: "catch_confirmation" | "invoice" | "payment" | "credit" | "retention" | "snagging_photo" | "order" | "supplier_invoice" | "progress_photo" | "builder_extra" | "stage_work") {
 return (["catch_confirmation", "invoice", "payment", "credit", "retention", "snagging_photo"] as readonly string[]).includes(kind) ? "no_activity" as const : "linked_job_required" as const;
}

export const jobWorkStateReadV1 = z.object({
 version:z.literal("job-work-state-read.v1"),jobId:uuid,events:z.array(jobWorkStateEventV1),
 links:z.array(z.object({id:uuid,predecessorJobId:uuid,successorJobId:uuid,linkedAt:workFactTimeV1}).strict()),
 lock:lockV1.nullable(),environment:z.literal("synthetic_demo"),realExternalActions:z.literal(0),
}).strict();

export const jobWorkStateMutationV1 = z.union([jobWorkStateCommandV1, jobLinkCommandV1.extend({action:z.literal("link")}).strict()]);
/** Pure transition checks are not authentication, admission or command execution. */
export function assertWorkStateTransition(raw: unknown,state: {finishedMarkerId:string|null;closedEventId:string|null}) {
 const parsed=jobWorkStateCommandV1.safeParse(raw);
 if(!parsed.success) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
 const command=parsed.data;
 if(command.action === "cancel_finish" && command.markerId !== state.finishedMarkerId) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
 if(command.action === "reopen" && command.closeEventId !== state.closedEventId) throw new JobWorkStateError("INVALID_WORK_STATE_INPUT");
 if(command.action !== "reopen" && state.closedEventId !== null) throw new JobWorkStateError("JOB_WORK_CLOSED");
 return command;
}
export function assertCompletedWorkResultOpen(closedEventId: string|null): void {
 if(closedEventId !== null) throw new JobWorkStateError("JOB_WORK_CLOSED");
}
