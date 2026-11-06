import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { EnterpriseLivePromptPersistenceError } from "@jobguard/core";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ session: "00000000-0000-4000-8000-000000000001" as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => auth.session ? { value: auth.session } : undefined }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { POST } from "./route";
const job = "00000000-0000-4000-8000-000000000002";
const context = { params: Promise.resolve({ id: job }) };
const body = () => ({ version: "end-check.v1", commandId: crypto.randomUUID() });
const request = (raw: unknown = body(), origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/contractor/jobs/${job}/finish`, { method: "POST", headers: { origin, "content-type": "application/json", "x-tenant-id": job, "x-actor-id": job }, body: JSON.stringify(raw) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); auth.session = "00000000-0000-4000-8000-000000000001"; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("uses only the cookie session and path job, preserving command identity on replay", async () => {
 const result = { jobId: job, checkRan: true, promptsRaised: 1, finishedAt: "2026-11-04T12:00:00Z" };
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "endCheck").mockResolvedValue(result), raw = body();
 for (let i = 0; i < 2; i++) {
  const response = await POST(request(raw), context);
  expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual(result);
 }
 expect(write.mock.calls).toEqual([[auth.session, { ...raw, jobId: job }], [auth.session, { ...raw, jobId: job }]]);
});
it.each(["tenantId", "actorId", "tenant", "actor", "role", "time", "finishedAt", "checkRan", "endOfJobCheck", "jobId", "completionEventId", "visitId"])("rejects caller field %s before execution", async key => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "endCheck");
 const response = await POST(request({ ...body(), [key]: job }), context);
 expect(response.status).toBe(400); expect(write).not.toHaveBeenCalled();
});
it("requires trusted origin, synthetic mode and a valid session", async () => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "endCheck");
 expect((await POST(request(body(), "https://foreign.invalid"), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge"); expect((await POST(request(), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); auth.session = undefined;
 expect((await POST(request(), context)).status).toBe(401); expect(write).not.toHaveBeenCalled();
});
it.each(["EXTRA_FORBIDDEN", "PROMPT_CONFLICT"] as const)("preserves %s without exposing stored details", async code => {
 vi.spyOn(EnterpriseLivePromptRepository.prototype, "endCheck").mockRejectedValue(new EnterpriseLivePromptPersistenceError(code));
 const response = await POST(request(), context);
 expect(response.status).toBe(code === "EXTRA_FORBIDDEN" ? 403 : 409);
 expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code });
});
it("rejects malformed JSON and job ids, and redacts unexpected failures", async () => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "endCheck").mockRejectedValue(new Error("private agreement details"));
 expect((await POST(request(), context)).status).toBe(503);
 expect((await POST(request(), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
 const malformed = new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" });
 expect((await POST(malformed, context)).status).toBe(400);
 expect(write).toHaveBeenCalledTimes(1);
});
