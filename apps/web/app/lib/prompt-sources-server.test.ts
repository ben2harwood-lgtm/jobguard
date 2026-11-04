import { beforeEach, expect, it, vi } from "vitest";
import { EnterpriseLivePromptPersistenceError } from "@jobguard/core";
const mocks = vi.hoisted(() => ({ session: "10000000-0000-4000-8000-000000000001", materials: vi.fn(), observations: vi.fn(), evaluate: vi.fn(), pool: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jg_session" ? { value: mocks.session } : undefined }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: mocks.pool }));
vi.mock("@jobguard/db", () => ({ EnterpriseLivePromptRepository: class { importMaterials = mocks.materials; registerObservation = mocks.observations; evaluate = mocks.evaluate; } }));
import { POST as materials } from "../api/contractor/jobs/[id]/possible-extras/materials/route";
import { POST as observations } from "../api/contractor/jobs/[id]/possible-extras/observations/route";
import { POST as evaluate } from "../api/contractor/jobs/[id]/possible-extras/evaluate/route";
const id = "10000000-0000-4000-8000-000000000002";
const body = { version: "materials-issue.v1", commandId: id, sourceId: "stores", eventId: "event", workIdentity: "REPAIR-DOOR", unit: "each", quantity: "100", occurredAtMicros: "1792310400000000", kind: "issue" };
const observation = { version: "completion-observation.v1", commandId: id, evidenceId: id, sha256: "a".repeat(64), objectVersion: "v1", workIdentity: "FIT-LOCK", locator: { kind: "photo_tag", tag: "lock" } };
const evaluation = { version: "evaluate-live-prompts.v1", commandId: id };
const result = { promptIds: [id], quarantinedComparisons: 0, unevaluatedComparisons: 0 };
const cases = [ [materials, body, mocks.materials, { sourceId: id, quarantinedComparisons: 0, unevaluatedComparisons: 0 }], [observations, observation, mocks.observations, { observationId: id, evaluation: result }], [evaluate, evaluation, mocks.evaluate, result] ] as const;
const request = (input: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/contractor/jobs/x/possible-extras", { method: "POST", headers: { origin, "content-type": "application/json", "x-tenant-id": id, "x-role": "owner" }, body: JSON.stringify(input) });
const context = { params: Promise.resolve({ id }) };
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.session = "10000000-0000-4000-8000-000000000001"; });
it.each(cases)("routes bind only the session cookie and path, and project exact safe answers (%#)", async (post, input, method, answer) => {
  method.mockResolvedValue({ ...answer, ...("evaluation" in answer ? { evaluation: { ...answer.evaluation, price: 123, fee: 456 } } : {}), price: 123, fee: 456, origin: "forged" });
  const response = await post(request(input), context);
  expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
  expect(method).toHaveBeenCalledWith(mocks.session, { ...input, jobId: id });
  expect(await response.json()).toEqual(answer);
});
it.each(cases)("strictly refuses every authority or money override (%#)", async (post, input) => {
  for (const key of ["tenant", "tenantId", "job", "jobId", "actor", "actorId", "role", "origin", "price", "fee"]) {
    const response = await post(request({ ...input, [key]: id }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "INVALID_PROMPT_COMMAND" });
  }
  expect(mocks.pool).not.toHaveBeenCalled();
});
it.each(cases)("checks origin, mode, session, JSON and path before persistence (%#)", async (post, input) => {
  expect((await post(request(input, "https://attacker.invalid"), context)).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await post(request(input), context)).status).toBe(403);
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); mocks.session = "";
  expect((await post(request(input), context)).status).toBe(401); mocks.session = id;
  expect((await post(request(input), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
  expect((await post(new Request("http://localhost:3000", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" }), context)).status).toBe(400);
  expect(mocks.pool).not.toHaveBeenCalled();
});
it.each(cases)("preserves typed refusals without leaking persistence details (%#)", async (post, input, method) => {
  for (const [code, status, projected] of [["EXTRA_FORBIDDEN", 404, "NOT_FOUND"], ["PROMPT_CONFLICT", 409, "PROMPT_CONFLICT"], ["PROMPT_SOURCE_INVALID", 409, "PROMPT_SOURCE_INVALID"]] as const) {
    method.mockRejectedValue(new EnterpriseLivePromptPersistenceError(code));
    const response = await post(request(input), context);
    expect(response.status).toBe(status); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: projected });
  }
  method.mockRejectedValue(new Error("private SQL and data"));
  const response = await post(request(input), context); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ version: "enterprise-live-prompt-error.v1", code: "PROMPT_UNAVAILABLE" });
});
