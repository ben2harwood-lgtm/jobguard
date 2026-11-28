import { z } from "zod";

/** QW-4: the job's snag list. Practice mode only; no notifications and no screens yet. */
export const SNAG_PHOTO_LIMIT = 6;

export type SnagErrorCode = "INVALID_SNAG_INPUT" | "SNAG_NOT_FOUND" | "SNAG_COMMAND_CONFLICT" | "SNAG_REVISION_CONFLICT"
  | "SNAG_TRANSITION_REFUSED" | "SNAG_CHECKER_MUST_DIFFER" | "SNAG_PHOTO_REFUSED" | "PHOTO_LIMIT_REACHED" | "SNAG_PRACTICE_ONLY";
export class SnagError extends Error {
  constructor(readonly code: SnagErrorCode) { super(code); this.name = "SnagError"; }
}
export const snagErrorCodes: readonly SnagErrorCode[] = ["INVALID_SNAG_INPUT", "SNAG_NOT_FOUND", "SNAG_COMMAND_CONFLICT", "SNAG_REVISION_CONFLICT",
  "SNAG_TRANSITION_REFUSED", "SNAG_CHECKER_MUST_DIFFER", "SNAG_PHOTO_REFUSED", "PHOTO_LIMIT_REACHED", "SNAG_PRACTICE_ONLY"];

const id = z.guid();
/** A real calendar date, YYYY-MM-DD. */
export const snagDateV1 = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid date");
/** Trimmed, non-empty text of at most `max` characters, with no control characters. */
const text = (max: number) => z.string().trim().min(1).refine(value => [...value].length <= max, `At most ${max} characters`)
  .refine(value => !/[\u0000-\u001f\u007f]/u.test(value), "No control characters");
const optional = (max: number) => text(max).nullable().optional().transform(value => value ?? null);
const details = {
  title: text(200),
  location: optional(120),
  /** Who's fixing it: free text such as "Dave (sparky)", because subcontractors are not members yet. */
  assigneeLabel: optional(120),
  dueOn: snagDateV1.nullable().optional().transform(value => value ?? null),
};
export const snagCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ version: z.literal("snag.v1"), action: z.literal("add"), commandId: id, snagId: id, ...details }),
  z.strictObject({ version: z.literal("snag.v1"), action: z.literal("revise"), commandId: id, snagId: id,
    expectedRevision: z.number().int().min(1).max(1_000_000), ...details }),
]);
export type SnagCommand = z.infer<typeof snagCommandV1>;
export const snagEventCommandV1 = z.strictObject({ version: z.literal("snag-event.v1"), commandId: id,
  action: z.enum(["mark_fixed", "mark_checked", "reopen"]) });
export type SnagEventCommand = z.infer<typeof snagEventCommandV1>;
export const snagEventKind = { mark_fixed: "fixed", mark_checked: "checked", reopen: "reopened" } as const;
/** Practice photos are generated fixtures, uploaded through the verified begin/finalize flow. */
export const snagPhotoCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ version: z.literal("snag-photo.v1"), action: z.literal("begin"), commandId: id, fixture: z.enum(["completion-photo", "j3-drainage-photo"]) }),
  z.strictObject({ version: z.literal("snag-photo.v1"), action: z.literal("finalize"), commandId: id, uploadId: id, objectVersionId: z.string().min(1).max(120) }),
]);
export type SnagPhotoCommand = z.infer<typeof snagPhotoCommandV1>;

export function parseSnag<T>(schema: z.ZodType<T>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new SnagError("INVALID_SNAG_INPUT");
  return parsed.data;
}

export type SnagState = "open" | "fixed" | "checked";
export type SnagEventKind = "fixed" | "checked" | "reopened";
/** The latest event decides: none or reopened is open, fixed is fixed, checked is checked (closed). */
export function deriveSnagState(events: readonly { sequence: number; kind: SnagEventKind }[]): SnagState {
  const last = [...events].sort((a, b) => a.sequence - b.sequence).at(-1);
  if (!last || last.kind === "reopened") return "open";
  return last.kind;
}
/** Which events the current state allows. Mirrors app.snag_record_event. */
export function allowedSnagEvents(state: SnagState): SnagEventKind[] {
  return state === "open" ? ["fixed"] : state === "fixed" ? ["checked", "reopened"] : ["reopened"];
}

const ukDate = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" });
/** Today's calendar date in the UK, whatever the host's time zone. */
export function ukCalendarDate(now: Date): string {
  if (Number.isNaN(now.getTime())) throw new SnagError("INVALID_SNAG_INPUT");
  const parts = ukDate.formatToParts(now), field = (name: string) => parts.find(part => part.type === name)!.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}
/** Overdue: still open, and its due date is before today's UK date. Due today is not overdue; a fixed snag waits on its check, not the builder. */
export function isSnagOverdue(dueOn: string | null, state: SnagState, now: Date): boolean {
  return dueOn !== null && state === "open" && dueOn < ukCalendarDate(now);
}

export type SnagRow = {
  id: string; revision: number; title: string; location: string | null; assigneeLabel: string | null; dueOn: string | null;
  createdAt: string; createdByMembershipId: string;
  events: { sequence: number; kind: SnagEventKind; actorMembershipId: string; recordedAt: string }[];
  photos: { evidenceId: string; position: number; sha256: string; receivedAt: string; withdrawn: boolean }[];
};
export type SnagListItem = SnagRow & { state: SnagState; overdue: boolean; nextActions: SnagEventKind[] };
export type SnagList = { version: "snag-list.v1"; environment: "synthetic_demo"; jobId: string; asOf: string;
  counts: Record<SnagState | "overdue", number>; snags: SnagListItem[]; realExternalActions: 0 };

/** The read model: oldest snag first, with its derived state and the UK-date overdue rule. */
export function buildSnagListV1(jobId: string, now: Date, rows: readonly SnagRow[]): SnagList {
  const snags = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map(row => {
    const events = [...row.events].sort((a, b) => a.sequence - b.sequence), photos = [...row.photos].sort((a, b) => a.position - b.position);
    const state = deriveSnagState(events);
    return { ...row, events, photos, state, overdue: isSnagOverdue(row.dueOn, state, now), nextActions: allowedSnagEvents(state) };
  });
  const count = (match: (snag: SnagListItem) => boolean) => snags.filter(match).length;
  return { version: "snag-list.v1", environment: "synthetic_demo", jobId, asOf: ukCalendarDate(now),
    counts: { open: count(s => s.state === "open"), fixed: count(s => s.state === "fixed"), checked: count(s => s.state === "checked"), overdue: count(s => s.overdue) },
    snags, realExternalActions: 0 };
}
