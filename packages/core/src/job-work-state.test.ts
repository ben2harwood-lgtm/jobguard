import { describe, expect, it } from "vitest";
import { jobWorkStateCommandV1, jobWorkStateEventV1, siteSourceV1, classifySiteSource, orderWorkFacts, projectWorkFacts, linkedJobOfferV1, classifyPostLockFact, JobWorkStateError, jobWorkStateReadV1 } from "./job-work-state.js";

const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const time = "2026-10-13T10:00:00.000001Z";
const activity = (n = 1, factAt = time) => ({ version: "job-work-state-event.v1", id: id(n), jobId: id(90), sequence: n, kind: "site_activity", factAt, recordedAt: "2026-10-14T10:00:00.000001Z", sourceReceiptId: id(n + 100), commandId: null, predecessorId: null, closeReason: null, closeNote: null });
const source = (kind: string, fields = {}) => ({ version: "job-site-source.v1", kind, ...fields });
describe("CH-4 separable fact contracts (command authority and interval policies held)", () => {
 it("CH4-A01 strict commands reject authority and server-time fields", () => {
  const command = { version: "job-work-state-command.v1", commandId: id(1), expectedRevision: 0, action: "close", reason: "other", note: "Customer asked to stop" };
  expect(jobWorkStateCommandV1.parse(command)).toEqual(command);
  for (const key of ["tenantId", "actorMembershipId", "mode", "serverTime", "workState", "lock", "role", "approved", "sessionDigest"]) expect(jobWorkStateCommandV1.safeParse({ ...command, [key]: id(2) }).success).toBe(false);
  for (const fields of [{ commandId: "invalid" }, { expectedRevision: -1 }, { expectedRevision: 0.1 }, { reason: "finished" }, { note: "\n\t " }]) expect(jobWorkStateCommandV1.safeParse({ ...command, ...fields }).success).toBe(false);
 });
 it("CH4-A02 only explicitly verified original photos and ready delivery or goods facts qualify", () => {
  expect(classifySiteSource(source("photo", { original: true, verified: true, invalidated: false, purpose: "progress", objectVersionId: "version-1", sha256: "a".repeat(64), byteLength: 80 }))).toEqual({ firstEvidence: true, activity: true });
  for (const fields of [{ original: false }, { verified: false }, { invalidated: true }, { purpose: "snagging" }]) expect(classifySiteSource(source("photo", { original: true, verified: true, invalidated: false, purpose: "progress", objectVersionId: "version-1", sha256: "a".repeat(64), byteLength: 80, ...fields }))).toEqual({ firstEvidence: false, activity: false });
  expect(classifySiteSource(source("delivery_note", { ready: true, sourceVersionId: id(3) }))).toEqual({ firstEvidence: true, activity: true });
  expect(classifySiteSource(source("delivery_note", { ready: false, sourceVersionId: id(3) }))).toEqual({ firstEvidence: false, activity: false });
  expect(classifySiteSource(source("goods_receipt"))).toEqual({ firstEvidence: true, activity: true });
  for (const kind of ["order", "supplier_invoice", "quote", "message", "readiness", "billing", "jobguard_catch", "final_review"]) expect(classifySiteSource(source(kind))).toEqual({ firstEvidence: false, activity: false });
  expect(siteSourceV1.safeParse(source("photo", { mime: "image/png" })).success).toBe(false);
 });
 it("CH4-A04 capture activity follows command origin rather than variation writes", () => {
  expect(classifySiteSource(source("builder_extra"))).toEqual({ firstEvidence: false, activity: true });
  for (const kind of ["repricing", "approval", "rejection", "withdrawal", "final_review", "jobguard_catch"]) expect(classifySiteSource(source(kind))).toEqual({ firstEvidence: false, activity: false });
 });
 it("CH4-A05 stage completion is activity and planning is not; diary and in-progress are reserved", () => {
  expect(classifySiteSource(source("stage_completion"))).toEqual({ firstEvidence: false, activity: true });
  expect(classifySiteSource(source("readiness"))).toEqual({ firstEvidence: false, activity: false });
  for (const kind of ["diary", "stage_in_progress"]) expect(siteSourceV1.safeParse(source(kind)).success).toBe(false);
 });
 it("CH4-A06 CH4-A07 CH4-A09 finished cancellation close reopen and resume have immutable representations", () => {
  const finish = { ...activity(), kind: "finished_on_site", sourceReceiptId: null, commandId: id(11) };
  expect(jobWorkStateEventV1.safeParse(finish).success).toBe(true);
  expect(jobWorkStateEventV1.safeParse({ ...finish, kind: "finished_cancelled" }).success).toBe(false);
  expect(jobWorkStateEventV1.safeParse({ ...finish, kind: "finished_cancelled", predecessorId: finish.id }).success).toBe(false);
  expect(jobWorkStateEventV1.safeParse({ ...finish, id: id(2), kind: "finished_cancelled", predecessorId: finish.id }).success).toBe(true);
  for (const kind of ["closed", "reopened", "resumed"]) {
   const event = { ...finish, kind, predecessorId: kind === "reopened" ? id(5) : null, closeReason: kind === "closed" ? "abandoned" : null, closeNote: kind === "closed" ? "Customer stopped work" : null };
   expect(jobWorkStateEventV1.safeParse(event).success).toBe(true);
   expect(jobWorkStateEventV1.safeParse({ ...event, closeReason: "unissued_reason" }).success).toBe(false);
  }
  expect(jobWorkStateEventV1.safeParse({ ...finish, kind: "closed", closeReason: "other", closeNote: " " }).success).toBe(false);
 });
 it("CH4-A10 CH4-A11 deterministic ordering preserves microseconds and rejects changed duplicate identities", () => {
  const before = activity(2, "2026-10-13T10:00:00.000000Z"), after = activity(1);
  expect(orderWorkFacts([after, before, after])).toEqual([before, after]);
  expect(orderWorkFacts([before, after])).toEqual(orderWorkFacts([after, before]));
  expect(() => orderWorkFacts([after, { ...after, recordedAt: time }])).toThrow(JobWorkStateError);
  expect(jobWorkStateEventV1.safeParse({ ...after, factAt: "2026-02-30T10:00:00.000001Z" }).success).toBe(false);
  expect(jobWorkStateEventV1.safeParse({ ...after, factAt: "2026-10-13T10:00:00Z" }).success).toBe(false);
 });
 it("CH4-A03 CH4-A11 first evidence is selected by original fact time and identity, never processing order", () => {
  const a = { ...activity(2), kind: "first_site_evidence" }, b = { ...activity(1), kind: "first_site_evidence" };
  expect(projectWorkFacts([a, b], null).firstSiteEvidenceId).toBe(b.id);
  expect(projectWorkFacts([b, a], null)).toEqual(projectWorkFacts([a, b], null));
 });
 it("CH4-A09 a locked job never restarts; fact projection exposes no interval or eligibility policy", () => {
  const result = projectWorkFacts([activity()], { id: id(8), lockedAt: time });
  expect(result.lock).toEqual({ id: id(8), lockedAt: time });
  expect(result.policyStatus).toBe("intervals_and_command_authority_held");
  expect(result).not.toHaveProperty("intervals"); expect(result).not.toHaveProperty("eligible");
 });
 it("CH4-A13 CH4-A14 linked offer is strict and post-lock billing classes never become activity", () => {
  const offer = { version: "job-linked-offer.v1", code: "POST_LOCK_WORK_REQUIRES_LINKED_JOB", message: "Start a linked job for this customer and site", jobId: id(1), customerId: id(2), siteId: id(3) };
  expect(linkedJobOfferV1.parse(offer)).toEqual(offer);
  expect(linkedJobOfferV1.safeParse({ ...offer, activate: true }).success).toBe(false);
  for (const kind of ["catch_confirmation", "invoice", "payment", "credit", "retention", "snagging_photo"] as const) expect(classifyPostLockFact(kind)).toBe("no_activity");
  for (const kind of ["order", "supplier_invoice", "progress_photo", "builder_extra", "stage_work"] as const) expect(classifyPostLockFact(kind)).toBe("linked_job_required");
 });
});

it("CH4-A01 CH4-A23 CH4-A27 read output is strict and synthetic-only",()=>{
 const view={version:"job-work-state-read.v1",jobId:id(90),events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
 expect(jobWorkStateReadV1.parse(view)).toEqual(view);
 for(const fields of [{environment:"production"},{realExternalActions:1},{intervals:[]},{signalCount:1}])expect(jobWorkStateReadV1.safeParse({...view,...fields}).success).toBe(false);
});

it("CH4-A06 CH4-A11 late historical activity does not cancel a later finished marker",()=>{
 const finish={...activity(1,"2026-10-14T10:00:00.000001Z"),kind:"finished_on_site",commandId:id(81),sourceReceiptId:null};
 const older=activity(2,"2026-10-13T10:00:00.000001Z");
 expect(projectWorkFacts([finish,older],null).finishedMarkerId).toBe(finish.id);
 expect(projectWorkFacts([older,finish],null).finishedMarkerId).toBe(finish.id);
});
