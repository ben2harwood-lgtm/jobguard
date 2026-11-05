import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "@jobguard/db";
import { EnterpriseLivePromptPersistenceError } from "@jobguard/core";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ session: "00000000-0000-4000-8000-000000000001" as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => auth.session ? { value: auth.session } : undefined }) }));
vi.mock("../../../../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { GET } from "./route";
import { GET as detail } from "./[promptId]/route";
import { POST as confirm } from "./[promptId]/confirm/route";
import { POST as dismiss } from "./[promptId]/dismiss/route";
import { POST as registerObservation } from "./observations/route";
const job = "00000000-0000-4000-8000-000000000002", promptId = "00000000-0000-4000-8000-000000000003";
const context = { params: Promise.resolve({ id: job, promptId }) };
const body = () => ({ version: "confirm-prompt.v1", commandId: crypto.randomUUID(), promptHash: "a".repeat(64) });
const request = (raw: unknown = body(), origin = "http://localhost:3000") => new Request(`http://localhost:3000/api/contractor/jobs/${job}/possible-extras/${promptId}/confirm`, { method: "POST", headers: { origin, "content-type": "application/json", "x-tenant-id": "ignored", "x-actor-id": "ignored" }, body: JSON.stringify(raw) });
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); auth.session = "00000000-0000-4000-8000-000000000001"; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("forwards pagination, detail and dismiss to the existing session-bound repository", async () => {
 const list = vi.spyOn(EnterpriseLivePromptRepository.prototype, "list").mockResolvedValue({ items: [], nextCursor: null });
 const read = vi.spyOn(EnterpriseLivePromptRepository.prototype, "detail").mockResolvedValue({ id: promptId });
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "dismiss").mockResolvedValue({ kind: "dismissed" });
 const response = await GET(new Request(`http://localhost:3000/?limit=10&after=${promptId}`), context);
 expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(list).toHaveBeenCalledWith(auth.session, { version: "live-prompt-list.v1", jobId: job, limit: 10, after: promptId });
 expect((await detail(new Request("http://localhost:3000"), context)).status).toBe(200);
 expect(read).toHaveBeenCalledWith(auth.session, { version: "live-prompt-detail.v1", jobId: job, promptId });
 const raw = { ...body(), version: "dismiss-prompt.v1", reason: "Fictional duplicate" };
 expect((await dismiss(request(raw), context)).status).toBe(201);
 expect(write).toHaveBeenCalledWith(auth.session, { ...raw, jobId: job, promptId });
});
it.each(["actor", "actorId", "tenant", "tenantId", "role", "jobId"])("rejects body authority field %s before repository execution", async key => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "confirm");
 const response = await confirm(request({ ...body(), [key]: job }), context);
 expect(response.status).toBe(400); expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "INVALID_PROMPT_COMMAND" }); expect(write).not.toHaveBeenCalled();
});
it("rejects untrusted origins, disabled mode and missing session before repository execution", async () => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "confirm");
 expect((await confirm(request(body(), "https://attacker.invalid"), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "production_billing"); expect((await confirm(request(), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); auth.session = undefined;
 expect((await confirm(request(), context)).status).toBe(401); expect(write).not.toHaveBeenCalled();
});
it.each(["another tenant's job", "role cannot resolve"])("preserves the database refusal for %s", async () => {
 vi.spyOn(EnterpriseLivePromptRepository.prototype, "confirm").mockRejectedValue(new EnterpriseLivePromptPersistenceError("EXTRA_FORBIDDEN"));
 const response = await confirm(request(), context);
 expect(response.status).toBe(403); expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "EXTRA_FORBIDDEN" }); expect(response.headers.get("cache-control")).toBe("no-store");
});
it("passes the exact stale hash and returns the database conflict", async () => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "confirm").mockRejectedValue(new EnterpriseLivePromptPersistenceError("PROMPT_CONFLICT"));
 const raw = { ...body(), promptHash: "b".repeat(64) };
 expect((await confirm(request(raw), context)).status).toBe(409);
 expect(write).toHaveBeenCalledWith(auth.session, { ...raw, jobId: job, promptId });
});
it("preserves command identity on replay rather than inventing another command", async () => {
 const result = { kind: "created", variationId: crypto.randomUUID() };
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "confirm").mockResolvedValue(result);
 const raw = body();
 for (let i = 0; i < 2; i++) expect(await (await confirm(request(raw), context)).json()).toEqual(result);
 expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
});
it("redacts unexpected failures and refuses malformed JSON and list queries", async () => {
 vi.spyOn(EnterpriseLivePromptRepository.prototype, "detail").mockRejectedValue(new Error("private PostgreSQL details"));
 expect(await (await detail(new Request("http://localhost"), context)).json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "PROMPT_UNAVAILABLE" });
 expect((await confirm(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" }), context)).status).toBe(400);
 expect((await GET(new Request("http://localhost:3000/?role=supervisor"), context)).status).toBe(400);
});

it("fails reads closed for mode, session and database authority, with no-store responses", async () => {
 const list = vi.spyOn(EnterpriseLivePromptRepository.prototype, "list").mockRejectedValue(new EnterpriseLivePromptPersistenceError("EXTRA_FORBIDDEN"));
 const read = vi.spyOn(EnterpriseLivePromptRepository.prototype, "detail").mockRejectedValue(new EnterpriseLivePromptPersistenceError("EXTRA_FORBIDDEN"));
 for (const handler of [GET, detail]) {
  const response = await handler(new Request("http://localhost:3000"), context);
  expect(response.status).toBe(403); expect(response.headers.get("cache-control")).toBe("no-store");
 }
 list.mockClear(); read.mockClear();
 vi.stubEnv("JOBGUARD_ENV", "production_billing");
 expect((await GET(new Request("http://localhost:3000"), context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); auth.session = undefined;
 expect((await detail(new Request("http://localhost:3000"), context)).status).toBe(401);
 expect(list).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
});
it("dismiss rejects body authority and untrusted origins before repository execution", async () => {
 const write = vi.spyOn(EnterpriseLivePromptRepository.prototype, "dismiss");
 const raw = { ...body(), version: "dismiss-prompt.v1", reason: "Fictional dismissal" };
 for (const key of ["tenantId", "actorId", "role"]) expect((await dismiss(request({ ...raw, [key]: job }), context)).status).toBe(400);
 expect((await dismiss(request(raw, "https://untrusted.invalid"), context)).status).toBe(403);
 expect(write).not.toHaveBeenCalled();
});

it("registers observations through the same session, origin, mode and strict body boundary", async () => {
 const POST = registerObservation;
 const write=vi.spyOn(EnterpriseLivePromptRepository.prototype,"registerObservation").mockResolvedValue({observationId:promptId,evaluation:{promptIds:[],quarantinedComparisons:0,unevaluatedComparisons:0}});
 const raw={version:"completion-observation.v1",commandId:crypto.randomUUID(),evidenceId:promptId,sha256:"a".repeat(64),objectVersion:"fictional-v1",workIdentity:"FIT-VENT",locator:{kind:"photo_tag",tag:"Fictional vent"}};
 const response=await POST(request(raw),context);
 expect(response.status).toBe(201);expect(response.headers.get("cache-control")).toBe("no-store");
 expect(write).toHaveBeenCalledWith(auth.session,{...raw,jobId:job});write.mockClear();
 for(const key of ["actorId","tenantId","role","jobId"]) expect((await POST(request({...raw,[key]:job}),context)).status).toBe(400);
 expect((await POST(request(raw,"https://untrusted.invalid"),context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV","production_billing");expect((await POST(request(raw),context)).status).toBe(403);
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");auth.session=undefined;
 expect((await POST(request(raw),context)).status).toBe(401);expect(write).not.toHaveBeenCalled();
 auth.session=job;write.mockRejectedValue(new EnterpriseLivePromptPersistenceError("EXTRA_FORBIDDEN"));
 expect((await POST(request(raw),context)).status).toBe(403);
});

it("refuses an unvalidated observation projection with a no-store unavailable response", async () => {
 vi.spyOn(EnterpriseLivePromptRepository.prototype,"registerObservation").mockResolvedValue({observationId:promptId});
 const raw={version:"completion-observation.v1",commandId:crypto.randomUUID(),evidenceId:promptId,sha256:"a".repeat(64),objectVersion:"fictional-v1",workIdentity:"FIT-VENT",locator:{kind:"photo_tag",tag:"Fictional vent"}};
 const response=await registerObservation(request(raw),context);
 expect(response.status).toBe(503);
 expect(response.headers.get("cache-control")).toBe("no-store");
 expect(await response.json()).toEqual({version:"enterprise-live-prompt-error.v1",code:"PROMPT_UNAVAILABLE"});
});
