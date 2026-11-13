import { describe, expect, it } from "vitest";
import { evaluateSyncDownloadV1 } from "./sync-download.js";
import { siteAssignedJobsV1 } from "./site-visit.js";
import { logSiteExtraV4, siteExtraContentSha256V1 } from "./site-extra-evidence.js";
import { operativeAssignedJobsViewV1, operativeOfflineExtraV1, planOperativeExtraV1, planOperativeVisitV1 } from "./operative-view-models.js";

const id = (n: number) => `01960000-0000-7000-8000-${n.toString().padStart(12, "0")}`;
const job = { jobId: id(1), workOrderId: id(2), reference: "Fictional WO", priority: "routine", issuedOn: "2026-11-05", dueOn: null, openVisitId: null };
const assigned = { version: "site-assigned-jobs.v1", environment: "synthetic_demo", realExternalActions: 0, jobs: [job], truncated: false };
const authority = { userId: id(3), tenantId: id(4), membershipId: id(5), role: "operative", status: "active", assignedJobIds: [job.jobId] };
const request = { version: "sync-subscription-request.v1", requestedTenantId: authority.tenantId, profile: "contractor_assigned_jobs.v1" };
const source = [{ ...job, tenantId: authority.tenantId, residentContact: "Fictional private contact", amountPence: 100 },
  { ...job, jobId: id(6), tenantId: authority.tenantId, residentContact: "Another operative" },
  { ...job, jobId: id(7), tenantId: id(8), residentContact: "Another tenant" }];
const facts = { version: "sync-download-facts.v1", environment: "synthetic_demo", authority, request, source };
const visit = { assigned, jobId: job.jobId, commandId: id(10), closeoutAnswer: null, online: true };
const photo = { version: "offline-capture-item.v1", environment: "synthetic_demo", uploadId: id(11), jobId: job.jobId,
  scopeItemId: null, kind: "photo", clientSha256: "a".repeat(64), clientMetadata: { deviceCapturedAtMs: 0 },
  contentType: "image/jpeg", byteLength: 10, status: "verified",
  serverVerification: { evidenceId: id(11), objectVersionId: "fictional-version", sha256: "a".repeat(64), byteLength: 10 } };
const draft = { version: "log-site-extra.v4", commandId: id(12), description: "Fictional added latch", note: "Asked on site", workStatus: "not_started" };
const contentHash = siteExtraContentSha256V1({ jobId: job.jobId, description: draft.description, note: draft.note, photoSha256: photo.clientSha256 });
const extra = { assigned, jobId: job.jobId, online: true, draft, photo, shownContentSha256: contentHash };

describe("ENT-12 operative groundwork, synthetic only", () => {
  it("applies the existing download policy independently of RLS and strips resident/financial data", () => {
    const decision = evaluateSyncDownloadV1(facts);
    expect(decision.outcome).toBe("allowed");
    expect(decision.rows).toEqual([job]);
    const response = siteAssignedJobsV1.parse({ ...assigned, jobs: decision.rows });
    const view = operativeAssignedJobsViewV1(response);
    expect(view.jobs).toEqual([{ ...job, visitState: "not_started" }]);
    expect(JSON.stringify(view)).not.toMatch(/resident|contact|amountPence|tenantId|membershipId/iu);
    for (const jobId of [id(6), id(7)]) {
      const narrowed = evaluateSyncDownloadV1({ ...facts, request: { ...request, jobIds: [jobId] } });
      expect(narrowed.rows).toEqual([]);
      expect(() => planOperativeVisitV1({ ...visit, jobId })).toThrow("NOT_ASSIGNED");
      expect(() => planOperativeExtraV1({ ...extra, jobId })).toThrow("NOT_ASSIGNED");
    }
  });
  it.each([null, { ...authority, status: "revoked" }, { ...authority, role: "office" }])("refuses absent/revoked or inappropriate authority: %j", current => {
    expect(evaluateSyncDownloadV1({ ...facts, authority: current })).toMatchObject({ outcome: "refused", reason: "authority_required", rows: [], cleanup: "required" });
  });
  it("cannot change tenant or recover a reassigned job by narrowing selectors", () => {
    expect(evaluateSyncDownloadV1({ ...facts, request: { ...request, requestedTenantId: id(8) } })).toMatchObject({ outcome: "refused", rows: [] });
    expect(evaluateSyncDownloadV1({ ...facts, authority: { ...authority, assignedJobIds: [] } }).rows).toEqual([]);
    expect(evaluateSyncDownloadV1({ ...facts, authority: { ...authority, tenantId: id(8) } }).rows).toEqual([]);
  });
  it("rejects widened read responses and malformed bodies", () => {
    expect(() => operativeAssignedJobsViewV1({ ...assigned, jobs: [{ ...job, residentContact: "Fictional" }] })).toThrow("INVALID_INPUT");
    expect(() => planOperativeVisitV1({ ...visit, tenantId: authority.tenantId })).toThrow("INVALID_INPUT");
    expect(() => planOperativeExtraV1({ ...extra, draft: { ...draft, origin: "site" } })).toThrow("INVALID_INPUT");
  });
  it("uses existing visit bodies and the assigned caller's open visit", () => {
    expect(planOperativeVisitV1(visit)).toMatchObject({ state: "ready_for_server_validation", recorded: false,
      intent: { path: `/contractor/jobs/${job.jobId}/site-visits/start`, body: { version: "start-site-visit.v1", commandId: visit.commandId } } });
    const current = { ...visit, assigned: { ...assigned, jobs: [{ ...job, openVisitId: id(20) }] } };
    expect(planOperativeVisitV1(current)).toMatchObject({ state: "held", reason: "closeout_answer_required", question: { text: "Did the resident ask for anything extra?" } });
    for (const closeoutAnswer of ["yes", "no"]) expect(planOperativeVisitV1({ ...current, closeoutAnswer })).toMatchObject({ intent: {
      path: `/contractor/jobs/${job.jobId}/site-visits/${id(20)}/complete`, body: { version: "complete-site-visit.v1", closeoutAnswer } } });
    expect(planOperativeVisitV1({ ...visit, online: false })).toMatchObject({ state: "held", reason: "online_required", recorded: false });
  });
  it("matches web's v4 body, exact content hash and unverified identity statement", () => {
    const result = planOperativeExtraV1(extra);
    expect(result).toMatchObject({ state: "ready_for_server_validation", recorded: false, originAuthority: "server_on_upload",
      residentStatement: "confirmed on the operative's device; identity not verified", contentSha256: contentHash,
      intent: { path: `/contractor/jobs/${job.jobId}/site-extras`, body: logSiteExtraV4.parse({ ...draft, photoEvidenceId: photo.uploadId, residentConfirmation: { shownContentSha256: contentHash } }) } });
    expect(planOperativeExtraV1(extra)).toEqual(result); // Retry retains command and exact body.
    expect(planOperativeExtraV1({ ...extra, online: false })).toMatchObject({ state: "held", reason: "online_required", recorded: false });
  });
  it.each(["local_only", "uploading", "rejected", "conflict"])("%s photos cannot satisfy the proof gate", status => {
    expect(planOperativeExtraV1({ ...extra, photo: { ...photo, status, serverVerification: null } })).toMatchObject({ state: "held", reason: "photo_not_verified" });
  });
  it("requires confirmation of the exact current job, description, note and verified photo", () => {
    expect(planOperativeExtraV1({ ...extra, shownContentSha256: null })).toMatchObject({ state: "held", reason: "resident_confirmation_required", contentSha256: contentHash });
    for (const patch of [{ description: "Changed" }, { note: "Changed" }])
      expect(() => planOperativeExtraV1({ ...extra, draft: { ...draft, ...patch } })).toThrow("CONFIRMATION_MISMATCH");
    expect(() => planOperativeExtraV1({ ...extra, photo: { ...photo, jobId: id(6) } })).toThrow("INVALID_INPUT");
    expect(() => planOperativeExtraV1({ ...extra, photo: { ...photo, clientSha256: "b".repeat(64), serverVerification: { ...photo.serverVerification, sha256: "b".repeat(64) } } })).toThrow("CONFIRMATION_MISMATCH");
  });
  it("retains offline identity/labelled clocks across retries without minting origin or silently dropping evidence", () => {
    const intent = { version: "offline-intent.v1", jobId: job.jobId,
      clientMetadata: { capturedAt: "1970-01-01T00:00:00Z", hlc: { wallTimeMs: 0, logical: 0, nodeId: "fictional-device" } },
      body: { version: "log-site-extra.v1", commandId: id(30), description: draft.description, note: draft.note } };
    const result = operativeOfflineExtraV1(assigned, intent);
    expect(result).toMatchObject({ state: "queued_intent", recorded: false, originAuthority: "server_on_upload", intent });
    expect(operativeOfflineExtraV1(assigned, structuredClone(intent))).toEqual(result);
    expect(() => operativeOfflineExtraV1(assigned, { ...intent, jobId: id(6) })).toThrow("NOT_ASSIGNED");
    expect(() => operativeOfflineExtraV1(assigned, { ...intent, body: { ...intent.body, photoEvidenceId: photo.uploadId } })).toThrow();
    expect(() => operativeOfflineExtraV1(assigned, { ...intent, body: { ...intent.body, version: "issue-invoice.v1" } })).toThrow();
  });
});
