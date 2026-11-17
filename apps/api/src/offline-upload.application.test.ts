import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PracticeAccess } from "./practice-access.js";
import { SiteExtraApplication } from "./contractor/site-extra.application.js";
import { JobWorkStateApplication } from "./job-work-state.application.js";
import { OfflineUploadApplication } from "./offline-upload.application.js";
import { OfflineUploadController } from "./offline-upload.controller.js";
import { offlineUploadPayloadHash, offlineUploadV1 } from "./offline-upload.contracts.js";

const { commercialReview } = vi.hoisted(() => ({ commercialReview: vi.fn() }));
vi.mock("@jobguard/db", async importOriginal => ({ ...await importOriginal<typeof import("@jobguard/db")>(), reviewOfflineCommercialIntent: commercialReview }));
const pool = {} as Pool;
const body = () => ({ version: "job-work-state-command.v1" as const, commandId: randomUUID(), expectedRevision: 0, action: "finish" as const });
const upload = (command = body()) => ({ version: "offline-upload.v1", commandId: command.commandId, jobId: randomUUID(), expectedRevision: command.expectedRevision, body: command, payloadHash: "" });
const request = () => { const raw = upload(); raw.payloadHash = offlineUploadPayloadHash(raw.jobId, raw.body); return raw; };
function setup() {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const authority = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: {}, membershipId: randomUUID() } as never);
 const command = vi.spyOn(JobWorkStateApplication.prototype, "command").mockResolvedValue({} as never);
 const site = vi.spyOn(SiteExtraApplication.prototype, "log").mockResolvedValue({} as never);
 return { app: new OfflineUploadApplication(pool, randomUUID()), authority, command, site };
}
afterEach(() => { vi.restoreAllMocks(); commercialReview.mockReset(); vi.unstubAllEnvs(); });
describe("DARK M3-4 upload application", () => {
 it("rechecks membership on every replay and dispatches exact identity/revision to the owning command", async () => {
  const { app, authority, command } = setup(), raw = request();
  expect(await app.upload(raw)).toMatchObject({ state: "acknowledged", code: "RECORDED", realExternalActions: 0 });
  expect(await app.upload(raw)).toMatchObject({ state: "acknowledged" });
  expect(authority).toHaveBeenCalledTimes(2);
  expect(command.mock.calls).toEqual([[raw.jobId, raw.body], [raw.jobId, raw.body]]);
  authority.mockRejectedValue({ code: "NOT_FOUND", secret: "hidden signal" });
  const refused = await app.upload(raw);
  expect(refused).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED" });
  expect(JSON.stringify(refused)).not.toContain("hidden"); expect(command).toHaveBeenCalledTimes(2);
 });
 it.each([
  ["COMMAND_CONFLICT", "IDEMPOTENCY_CONFLICT"], ["WORK_STATE_STALE_REVISION", "STALE_REVISION"],
  ["JOB_WORK_CLOSED", "COMPLETION_CONFLICT"], ["INVALID_WORK_STATE_INPUT", "COMPLETION_CONFLICT"], ["POST_LOCK_WORK_REQUIRES_LINKED_JOB", "LOCKED_BILL"],
 ])("reports %s without silent success", async (code, expected) => {
  const { app, command } = setup(); command.mockRejectedValue({ code });
  expect(await app.upload(request())).toMatchObject({ state: "conflict", code: expected });
 });
 it("rejects tampered hashes, ID/revision mismatches, financial writes and hidden fields before dispatch", async () => {
  const { app, command, site } = setup(), raw = request();
  expect(await app.upload({ ...raw, payloadHash: "0".repeat(64) })).toMatchObject({ state: "rejected", code: "PAYLOAD_HASH_MISMATCH" });
  for (const patch of [{ commandId: randomUUID() }, { expectedRevision: 9 }, { tenantId: randomUUID() }, { approval: true }, { shadowSignals: [] }, { body: { ...raw.body, amountPence: 1 } }, { body: { ...raw.body, action: "reverse_payment" } }, { body: { ...raw.body, action: "allocate_payment", allocationPence: 100 } }, { body: { ...raw.body, action: "approve", approvalId: randomUUID() } }]) {
   await expect(app.upload({ ...raw, ...patch })).rejects.toThrow("INVALID_OFFLINE_UPLOAD");
  }
  expect(command).not.toHaveBeenCalled(); expect(site).not.toHaveBeenCalled();
 });
 it("unknown commit outcomes are retryable and poison items do not block the next independent item", async () => {
  const { app, command } = setup(); command.mockRejectedValueOnce(new Error("secret provider details"));
  expect(await app.upload(request())).toMatchObject({ state: "retryable", code: "UNAVAILABLE" });
  expect(await app.upload(request())).toMatchObject({ state: "acknowledged" });
 });
 it("refuses every live/default mode before authority or dispatch, including direct service calls", async () => {
  const { app, command, authority } = setup();
  for (const mode of ["", "production", "production_billing", "pilot_no_charge"]) {
   vi.stubEnv("JOBGUARD_ENV", mode); await expect(app.upload(request())).rejects.toThrow("SYNTHETIC_MODE_REQUIRED");
  }
  expect(command).not.toHaveBeenCalled(); expect(authority).not.toHaveBeenCalled();
 });
 it("requires Origin on the HTTP adapter and preserves conflict HTTP state", async () => {
  setup(); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://app.fictional.invalid");
  const controller = new OfflineUploadController(pool), response = { status: vi.fn() };
  for (const origin of [undefined, "null", "https://foreign.invalid"]) await expect(controller.upload(request(), undefined, origin, response)).rejects.toMatchObject({ status: 403 });
  vi.spyOn(OfflineUploadApplication.prototype, "upload").mockResolvedValue({ version: "offline-upload-result.v1", commandId: randomUUID(), state: "conflict", code: "STALE_PRICE", realExternalActions: 0 });
  await controller.upload(request(), `jg_session=${randomUUID()}`, "https://app.fictional.invalid", response);
  expect(response.status).toHaveBeenCalledWith(409);
 });
 it("commercial intents remain conflicts and never dispatch approvals, sends or money", async () => {
  const { app, command, site } = setup();
  const jobId = randomUUID(), commandId = randomUUID();
  const body = { version: "offline-commercial-intent.v1" as const, commandId, expectedRevision: 0, acceptedQuoteVersionId: null, authorizationId: randomUUID(), actionType: "send_quote" as const, recipient: "fictional@example.invalid", contentHash: "a".repeat(64), amountPence: 100, currency: "GBP" as const, policyVersion: "synthetic.v1" };
  for (const code of ["ONLINE_REVIEW_REQUIRED", "STALE_PRICE", "ACCEPTED_VERSION_CHANGED", "APPROVAL_EXPIRED", "AUTHORITY_CHANGED"]) {
   commercialReview.mockResolvedValueOnce(code);
   expect(await app.upload({ version: "offline-upload.v1", commandId, jobId, expectedRevision: 0, body, payloadHash: offlineUploadPayloadHash(jobId, body) })).toMatchObject({ state: "conflict", code, realExternalActions: 0 });
  }
  expect(command).not.toHaveBeenCalled(); expect(site).not.toHaveBeenCalled();
 });
 it("bounds commercial amounts and never admits arbitrary approval/table mutations", () => {
  const raw = request();
  for (const amountPence of [-1, 0.5, 1_000_000_000_001, Number.MAX_SAFE_INTEGER + 1]) {
   expect(offlineUploadV1.safeParse({ ...raw, body: { version: "offline-commercial-intent.v1", commandId: raw.commandId, expectedRevision: 0, acceptedQuoteVersionId: null, authorizationId: randomUUID(), actionType: "send_quote", recipient: "fictional@example.invalid", contentHash: "a".repeat(64), amountPence, currency: "GBP", policyVersion: "synthetic.v1" } }).success).toBe(false);
  }
 });
});
