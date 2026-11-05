import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), session: "00000000-0000-4000-8000-000000000001", pool: {} }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: mocks.session }) }) }));
vi.mock("@jobguard/db", () => ({ EnterpriseLivePromptRepository: class { observationEvidence = mocks.read; } }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => mocks.pool }));
import { observationEvidenceResponse as read } from "./observation-evidence-server";
const job = "00000000-0000-4000-8000-000000000002";
const source = { evidenceId: job, sha256: "a".repeat(64), objectVersion: "stored-v1", mediaKind: "completion_photo", photoTags: ["Fictional vent"], capturedAt: null };
const result = { version: "observation-evidence.v1", items: [source] };
const params = Promise.resolve({ id: job });
const request = (suffix = "") => new Request(`http://localhost/evidence${suffix}`, { headers: { "x-tenant-id": "ignored", "x-role": "owner", authorization: "Bearer ignored" } });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.session = "00000000-0000-4000-8000-000000000001"; mocks.read.mockReset().mockResolvedValue(result); });
afterEach(() => vi.unstubAllEnvs());
it("uses only the session and route job; exact response has no secret or financial fields", async () => {
 const response = await read(request(), params);
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(await response.json()).toEqual(result); expect(mocks.read).toHaveBeenCalledWith(mocks.session, job);
});
it.each(["bytes", "storageKey", "objectKey", "uploader", "price", "fee"])("refuses unexpected repository field %s instead of leaking it", async field => {
 mocks.read.mockResolvedValue({ ...result, items: [{ ...source, [field]: "private" }] });
 const response = await read(request(), params); expect(response.status).toBe(503);
 expect(await response.json()).toEqual({ version: "observation-evidence-error.v1", code: "EVIDENCE_UNAVAILABLE" });
});
it.each(["foreign tenant", "uncovered job", "revoked grant", "refused role", "unknown job"])("returns uniform not-found for %s", async () => {
 mocks.read.mockRejectedValue({ code: "EXTRA_FORBIDDEN" });
 const response = await read(request(), params); expect(response.status).toBe(404);
 expect(await response.json()).toEqual({ version: "observation-evidence-error.v1", code: "NOT_FOUND" });
 expect(response.headers.get("cache-control")).toBe("no-store");
});
it("fails mode, cookie, job and query checks before reading", async () => {
 vi.stubEnv("JOBGUARD_ENV", "production_billing"); expect((await read(request(), params)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.session = ""; expect((await read(request(), params)).status).toBe(401);
 mocks.session = job; expect((await read(request("?tenantId=forged"), params)).status).toBe(400);
 expect((await read(request(), Promise.resolve({ id: "invalid" }))).status).toBe(400);
 expect(mocks.read).not.toHaveBeenCalled();
});
it("redacts unexpected failures", async () => {
 mocks.read.mockRejectedValue(new Error("private database data"));
 expect(await (await read(request(), params)).json()).toEqual({ version: "observation-evidence-error.v1", code: "EVIDENCE_UNAVAILABLE" });
});

it.each(["42501", "FORBIDDEN", "JOB_NOT_LIVE", "UNAUTHENTICATED"])("keeps checked-routine permission refusal %s not-found", async code => {
 mocks.read.mockRejectedValue({ code });
 const response = await read(request(), params); expect(response.status).toBe(404);
 expect(await response.json()).toEqual({ version: "observation-evidence-error.v1", code: "NOT_FOUND" });
});
