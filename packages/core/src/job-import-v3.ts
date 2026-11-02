import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { instantV1 } from "./receipt-allocation.js";
import { isSmallJobV3 } from "./small-job-v3.js";
import { sha256 } from "./evidence-pack.js";
function freezeJson<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freezeJson); Object.freeze(value); }
  return value;
}

const uuid = z.string().uuid().refine(v => v !== "00000000-0000-0000-0000-000000000000", "Nil is not an identity").transform(v => v.toLowerCase());
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
const text = z.string().min(1).max(2000).refine(v => v.trim().length > 0 && !v.includes("\0"));
const fixtureId = z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/u);
const lifecycle = z.enum(["live", "invoiced"]);

export const jobImportSourceV1 = z.object({ version: z.literal("job-import-source.v1"), bindingId: uuid.nullable() }).strict();

/** Public intent only. The path identifies the already-owned source job/party binding. */
export const jobPartiesImportV3 = z.object({
  version: z.literal("job-parties-import.v3"), commandId: uuid, expectedBindingId: uuid,
  fixtureId, lifecyclePoint: lifecycle, previewHash: hash, attest: z.literal(true),
}).strict().transform(v => freezeJson(v));

const sourceLine = z.object({ sourceLineId: uuid, description: text, netPence: pence }).strict();
const historyEntry = z.object({
  sourceId: uuid, sourceLineId: uuid.nullable(), evidenceId: uuid,
  objectVersionId: z.string().min(1).max(300), sha256: hash,
  byteLength: z.number().int().positive().safe(),
  // Attested historical metadata, deliberately not a server receive/adoption timestamp.
  sourceOccurredAt: z.string().max(200).pipe(instantV1).nullable(),
}).strict();

function reconcile(lines: readonly { sourceLineId: string; netPence: number }[], total: number, ctx: z.RefinementCtx): void {
  // Zod also runs refinements after a dirty numeric parse; never throw from safeParse.
  if (!Number.isSafeInteger(total) || lines.some(line => !Number.isSafeInteger(line.netPence))) return;
  if (lines.reduce((sum, line) => sum + BigInt(line.netPence), 0n) !== BigInt(total))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_BASELINE_TOTAL_MISMATCH" });
  if (new Set(lines.map(line => line.sourceLineId)).size !== lines.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_DUPLICATE_SOURCE_LINE" });
}

/** Approved content, not authorization. Session, clock and generated identities remain server-owned. */
export const adoptJobV3 = z.object({
  version: z.literal("adopt-job.v3"), fixtureId, sourceJobId: uuid,
  parties: z.object({ bindingId: uuid, customerRevisionId: uuid, siteRevisionId: uuid, payingPartyRevisionId: uuid }).strict(),
  lifecyclePoint: lifecycle,
  baseline: z.object({ sourceBaselineId: uuid, sourceHash: hash, description: text, acceptedNetPence: pence, lines: z.array(sourceLine).min(1).max(1000) }).strict(),
  terms: z.object({ version: z.literal("synthetic_demo_import.v3"), policyVersion: z.literal("reference_fee_policy_v3"), commercialTrack: z.literal("small_builder") }).strict(),
  attestation: z.object({ version: z.literal("import-attestation.v3"), wording: text, attest: z.literal(true) }).strict(),
  historyManifest: z.array(historyEntry).max(1000),
}).strict().superRefine((v, ctx) => {
  reconcile(v.baseline.lines, v.baseline.acceptedNetPence, ctx);
  const ids = new Set(v.baseline.lines.map(line => line.sourceLineId));
  for (const entry of v.historyManifest) if (entry.sourceLineId !== null && !ids.has(entry.sourceLineId))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_HISTORY_LINE_MISMATCH" });
  if (new Set(v.historyManifest.map(entry => entry.evidenceId)).size !== v.historyManifest.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_DUPLICATE_HISTORY" });
  if (new Set(v.historyManifest.map(entry => JSON.stringify([entry.objectVersionId, entry.sha256]))).size !== v.historyManifest.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_DUPLICATE_ORIGINAL" });
}).transform(v => freezeJson(v));
export type AdoptJobV3 = z.infer<typeof adoptJobV3>;

export const jobImportResultV3 = z.object({
  version: z.literal("job-import-result.v3"), importId: uuid, jobId: uuid, termsId: uuid, baselineId: uuid,
  provenance: z.literal("imported"), lineageStrength: z.literal("builder_attested_weaker"), lifecyclePoint: lifecycle,
  linkedJobIds: z.array(uuid).max(1000), meterResultRef: uuid, actionHash: hash,
  environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0),
  baseline: z.object({ acceptedNetPence: pence, lines: z.array(z.object({ sourceLineId: uuid, scopeItemId: uuid, netPence: pence, origin: z.literal("builder_baseline") }).strict()).min(1).max(1000) }).strict(),
}).strict().superRefine((v, ctx) => {
  reconcile(v.baseline.lines, v.baseline.acceptedNetPence, ctx);
  if (new Set(v.baseline.lines.map(line => line.scopeItemId)).size !== v.baseline.lines.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_DUPLICATE_SCOPE_ID" });
  if (new Set(v.linkedJobIds).size !== v.linkedJobIds.length || v.linkedJobIds.includes(v.jobId))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IMPORT_INVALID_LINKS" });
}).transform(v => freezeJson(v));
export type JobImportResultV3 = z.infer<typeof jobImportResultV3>;

export class ImportContractError extends Error {
  constructor(public readonly code: "IMPORT_RESULT_SNAPSHOT_MISMATCH" | "INVALID_IMPORT_CONTRACT" | "IMPORT_INTENT_SNAPSHOT_MISMATCH" = "IMPORT_RESULT_SNAPSHOT_MISMATCH") { super(code); this.name = "ImportContractError"; }
}

function parse<T>(schema: z.ZodType<T, unknown>, raw: unknown): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ImportContractError("INVALID_IMPORT_CONTRACT");
  return parsed.data;
}

/** Future authenticated preview/adoption must call this before authorization. */
export function assertImportIntentV3(intentRaw: unknown, snapshotRaw: unknown): AdoptJobV3 {
  const intent = parse(jobPartiesImportV3, intentRaw), snapshot = parse(adoptJobV3, snapshotRaw);
  if (intent.fixtureId !== snapshot.fixtureId || intent.lifecyclePoint !== snapshot.lifecyclePoint || intent.expectedBindingId !== snapshot.parties.bindingId || intent.previewHash !== importActionHashV3(snapshot))
    throw new ImportContractError("IMPORT_INTENT_SNAPSHOT_MISMATCH");
  return snapshot;
}

/** Bind a server result to exactly the approved source lines; never mint or replace scope identities. */
export function assertImportResultV3(snapshotRaw: unknown, resultRaw: unknown): JobImportResultV3 {
  const snapshot = parse(adoptJobV3, snapshotRaw), receipt = parse(jobImportResultV3, resultRaw);
  const lines = new Map(snapshot.baseline.lines.map(line => [line.sourceLineId, line.netPence]));
  if (receipt.actionHash !== importActionHashV3(snapshot) || receipt.lifecyclePoint !== snapshot.lifecyclePoint ||
    receipt.baseline.acceptedNetPence !== snapshot.baseline.acceptedNetPence || receipt.baseline.lines.length !== lines.size ||
    receipt.baseline.lines.some(line => lines.get(line.sourceLineId) !== line.netPence)) throw new ImportContractError();
  return receipt;
}

/** Sorted object keys, ordered arrays, exact strings; only already-parsed JSON is supplied here. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const importActionHashV3 = (raw: unknown): string => sha256(canonical(parse(adoptJobV3, raw)));
// Preview and authorization bind the same complete snapshot, including wording and history.
export const importPreviewHashV3 = importActionHashV3;
/** No quoted outbound revisions exist for this import baseline. MON-1 still owns grouping/admission. */
export const importedJobIsSmallV3 = (raw: unknown): boolean => isSmallJobV3(parse(adoptJobV3, raw).baseline.acceptedNetPence, 0);
