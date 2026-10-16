import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { ContractorRepository, PracticeWorkerSwitchRepository, withTenant } from "@jobguard/db";
import { ContractorError, PracticeWorkerSwitchError, practiceWorkerSwitchErrorCodes, practiceWorkerSwitchHttpStatus } from "@jobguard/core";
import { PracticeWorkerSwitchApplication, practiceWorkerSwitchHttpFailure } from "./practice-worker-switch.application.js";
const session = randomUUID(), worker = randomUUID();
const principal = { version: "contractor-principal.v1", sessionId: session };
const on = () => ({ version: "practice-worker-switch-on.v1", commandId: randomUUID() });
const off = () => ({ version: "practice-worker-switch-off.v1", commandId: randomUUID() });
const answer = { version: "practice-worker-switch-state.v1", environment: "synthetic_demo", realExternalActions: 0, state: "owner", switchId: null, workerMembershipId: null, startedAt: null, expiresAt: null, endedAt: null, endReason: null };
const query = vi.fn(async () => ({ rows: [] }));
const release = vi.fn();
const pool = { query, connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
const app = new PracticeWorkerSwitchApplication(pool);
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(["pilot_no_charge", "production_billing", "", undefined, "SYNTHETIC_DEMO", " synthetic_demo"])("[PW19] mode %s refuses every operation before database access", async mode => {
 if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
 for (const work of [() => app.start(principal, worker, on()), () => app.end(principal, off()), () => app.read(principal)]) await expect(work()).rejects.toMatchObject({ code: "MODE_FORBIDDEN" });
 expect(query).not.toHaveBeenCalled(); expect(pool.connect).not.toHaveBeenCalled();
});
it("[PW9] [PW20] ended and unknown sessions have identical refusal for every body and target", async () => {
 vi.spyOn(ContractorRepository.prototype, "resolveSession").mockRejectedValue(new ContractorError("UNAUTHENTICATED"));
 for (const target of [worker, randomUUID(), "invalid", undefined]) for (const body of [on(), {}, { tenantId: randomUUID() }]) {
  await expect(app.start(principal, target, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  await expect(app.end(principal, body)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
 }
 await expect(app.read(principal)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
it("[PW21] exact persisted actor and route target reach the repository through the genuine bridge", async () => {
 const resolve = vi.spyOn(ContractorRepository.prototype, "resolveSession");
 // Resolve one real-shaped actor through the existing repository, then retain its exact object.
 resolve.mockRestore();
 query.mockResolvedValueOnce({ rows: [{ tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() }] } as never);
 const actor = await new ContractorRepository(pool).resolveSession(session);
 const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(actor);
 const repo = vi.spyOn(PracticeWorkerSwitchRepository.prototype, "switchOn").mockImplementation(async (context, received, value, raw) => {
  expect(received).toBe(actor); expect(value).toBe(session); expect(raw).toMatchObject({ workerId: worker });
  await withTenant(pool, context, async () => undefined);
  return answer as never;
 });
 const raw = on(); expect(await app.start(principal, worker, raw)).toEqual(answer);
 expect(lookup).toHaveBeenCalledTimes(2); expect(repo).toHaveBeenCalledTimes(1); expect(query).toHaveBeenCalledWith("COMMIT");
});
it("[PW21] unknown authority fields are refused after authentication", async () => {
 query.mockResolvedValue({ rows: [{ tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() }] } as never);
 for (const field of ["tenantId", "membershipId", "role", "sessionId", "workerMembershipId", "targetMembershipId", "environment", "expiresAt", "extra"]) {
  await expect(app.start(principal, worker, { ...on(), [field]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  await expect(app.end(principal, { ...off(), [field]: randomUUID() })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 }
 await expect(app.start(principal, "invalid", on())).rejects.toMatchObject({ code: "NOT_FOUND" });
});
it("[PW23] [PW24] all failures are closed and diagnostics cannot escape", () => {
 for (const code of practiceWorkerSwitchErrorCodes) expect(practiceWorkerSwitchHttpFailure(new PracticeWorkerSwitchError(code))).toEqual({ status: practiceWorkerSwitchHttpStatus(code), body: { version: "practice-worker-switch-error.v1", code } });
 expect(practiceWorkerSwitchHttpFailure(Object.assign(new Error("private PostgreSQL diagnostic"), { code: "42501" }))).toEqual({ status: 503, body: { version: "practice-worker-switch-error.v1", code: "SWITCH_UNAVAILABLE" } });
});
it("[PW27] routine privilege refusal becomes unavailable and writes nothing", async () => {
 query.mockImplementation(async () => { throw Object.assign(new Error("permission denied for function"), { code: "42501" }); });
 const resolved = vi.spyOn(ContractorRepository.prototype, "resolveSession");
 resolved.mockRestore();
 expect(practiceWorkerSwitchHttpFailure(await app.read(principal).catch(error => error)).body.code).toBe("SWITCH_UNAVAILABLE");
});
it.each([null, undefined, {}, { state: "acting" }, { state: "owner", switch: null, worker: null, startedAt: null, expiresAt: null, extra: true }])("[PW23] strict routine response refuses incomplete or extra facts %j", async result => {
 const localQuery = vi.fn(async (sql: string) => {
  if (sql === "SELECT * FROM app.contractor_session($1)") return { rows: [{ tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() }] };
  if (sql.includes("practice_worker_switch_state")) return { rows: [{ result }] };
  return { rows: [] };
 });
 // A fixed persisted actor is needed across the application's two authentication reads.
 const p = { query: localQuery, connect: vi.fn(async () => ({ query: localQuery, release: vi.fn() })) } as unknown as Pool;
 const localApp = new PracticeWorkerSwitchApplication(p);
 await expect(localApp.read(principal)).rejects.toMatchObject({ code: "SWITCH_UNAVAILABLE" });
 expect(localQuery).toHaveBeenCalledWith("ROLLBACK"); expect(localQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO app.audit_event"))).toBe(false);
});
it("[PW27] revoking switch-on execute yields unavailable after authentication with no audit write", async () => {
 const actorRow = { tenant_id: randomUUID(), membership_id: randomUUID(), identity_user_id: randomUUID() };
 const localQuery = vi.fn(async (sql: string) => {
  if (sql.includes("app.contractor_session")) return { rows: [actorRow] };
  if (sql.includes("app.practice_worker_switch_on")) throw Object.assign(new Error("permission denied for function"), { code: "42501" });
  return { rows: [] };
 });
 const p = { query: localQuery, connect: async () => ({ query: localQuery, release: vi.fn() }) } as unknown as Pool;
 const failure = await new PracticeWorkerSwitchApplication(p).start(principal, worker, on()).catch(error => error);
 expect(practiceWorkerSwitchHttpFailure(failure)).toEqual({ status: 503, body: { version: "practice-worker-switch-error.v1", code: "SWITCH_UNAVAILABLE" } });
 expect(localQuery).toHaveBeenCalledWith("ROLLBACK"); expect(localQuery.mock.calls.some(([sql]) => sql.includes("INSERT INTO"))).toBe(false);
});
