// ENT-3d thin Next adapter: log-site-extra.v3 beside v1. Written before the route change.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSiteExtraV1, logSiteExtraV3, SiteExtraError } from "@jobguard/core";
const { log, workspace } = vi.hoisted(() => { const log = vi.fn(); return { log, workspace: vi.fn<() => Promise<{ siteExtras: { log: (jobId: string, raw: unknown) => Promise<unknown> } }>>(async () => ({ siteExtras: { log } })) }; });
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { POST } from "./route";
const photoId = "00000000-0000-4000-8000-0000000000aa", shown = "c".repeat(64);
const v3 = (extra: Record<string, unknown> = {}) => ({ version: "log-site-extra.v3", commandId: crypto.randomUUID(), note: "Fictional note", description: "Fictional extra", ...extra });
const post = (body: string, origin: string | undefined = "https://app.fictional.invalid") => POST(new Request("https://app.fictional.invalid/api/contractor/jobs/ignored/site-extras", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000001" }) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("VERCEL", "1"); vi.stubEnv("VERCEL_URL", "app.fictional.invalid"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", ""); log.mockReset(); workspace.mockClear(); log.mockResolvedValue({ version: "site-extra-logged.v3" }); });
afterEach(() => vi.unstubAllEnvs());
const forbidden = ["evidenceId", "residentConfirmationEvidenceId", "confirmationId", "document", "documentText", "documentSha256", "contentHash", "contentSha256", "content", "label", "statement", "residentName", "name", "signature", "signedAt", "confirmedAt", "confirmedBy", "evidenceType", "contentType", "sha256", "photoSha256", "photo", "objectKey", "objectVersionId", "uploadId", "tenantId", "membershipId", "role", "commandType", "grantId"];

describe("ENT-3d thin Next adapter", () => {
 it("[E5] a v3 body reaches the service with only parsed values and the path id; a v1 body is passed unchanged", async () => {
  const body = v3({ photoEvidenceId: photoId, residentConfirmation: { shownContentSha256: shown } }), response = await post(JSON.stringify(body));
  expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(log).toHaveBeenCalledExactlyOnceWith("00000000-0000-4000-8000-000000000001", logSiteExtraV3.parse(body));
  log.mockClear(); const one = { ...v3(), version: "log-site-extra.v1" }; expect((await post(JSON.stringify(one))).status).toBe(201);
  expect(log).toHaveBeenCalledExactlyOnceWith("00000000-0000-4000-8000-000000000001", logSiteExtraV1.parse(one));
 });
 it.each(forbidden)("[E5] refuses top-level key %s as INVALID_COMMAND before the service", async key => {
  const response = await post(JSON.stringify(v3({ [key]: "tampered" }))); expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" }); expect(log).not.toHaveBeenCalled(); expect(response.headers.get("cache-control")).toBe("no-store");
 });
 it.each(["name", "signature", "document", "contentSha256", "confirmed", "time"])("[E5] refuses key %s inside residentConfirmation before the service", async key => {
  const response = await post(JSON.stringify(v3({ residentConfirmation: { shownContentSha256: shown, [key]: "x" } }))); expect(response.status).toBe(400); expect(log).not.toHaveBeenCalled();
 });
 it("[E5] v3 fields under the v1 version and an unknown version are both INVALID_COMMAND", async () => {
  for (const raw of [{ ...v3({ photoEvidenceId: photoId }), version: "log-site-extra.v1" }, { ...v3(), version: "log-site-extra.v2" }]) { const response = await post(JSON.stringify(raw)); expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code: "INVALID_COMMAND" }); }
  expect(log).not.toHaveBeenCalled();
 });
 it.each(["PHOTO_NOT_ACCEPTED", "CONFIRMATION_MISMATCH"] as const)("[E5] %s is the code-only envelope with status 422 and no-store", async code => {
  log.mockRejectedValue(new SiteExtraError(code)); const response = await post(JSON.stringify(v3({ photoEvidenceId: photoId })));
  expect(response.status).toBe(422); expect(await response.json()).toEqual({ version: "site-extra-error.v1", code }); expect(response.headers.get("cache-control")).toBe("no-store");
 });
});
