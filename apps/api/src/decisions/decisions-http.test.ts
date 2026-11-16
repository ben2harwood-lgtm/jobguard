import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";

const repositories = vi.hoisted(() => ({ evaluate: vi.fn(), list: vi.fn() }));
vi.mock("@jobguard/db", async importOriginal => ({
 ...await importOriginal<typeof import("@jobguard/db")>(),
 evaluateDecisionChecks: repositories.evaluate, listDecisionInbox: repositories.list,
}));
import { CommandError, DEMO_TENANT_ID, RequestBindingRefusedError, UserCommandDispatcher } from "@jobguard/db";
import { AppModule } from "../app.module.js";
import { DecisionsController } from "./decisions.controller.js";
import { DecisionsError } from "./decisions.application.js";

const token = "a1000000-0000-4000-8000-000000000001";
const jobId = "a1000000-0000-4000-8000-000000000002";
const membershipId = "a1000000-0000-4000-8000-000000000003";
const decisionId = "a1000000-0000-4000-8000-000000000004";
const evaluate = { version: "finding-evaluation-command.v1", tenantId: DEMO_TENANT_ID, jobId, commandId: token };
const dismiss = { version: "decision-resolution-command.v1", tenantId: DEMO_TENANT_ID, decisionId,
 commandId: token, findingFingerprint: "a".repeat(64), resolution: "dismissed", expectedSnapshotRevision: 1 };
const inbox = { version: "decision-inbox.v1", decisions: [], counts: { mandatory: 0, advisory: 0, pending: 0 } };
const sqlError = (code: string, message: string) => Object.assign(new Error(message), { code, detail: "private SQL detail" });
let expired = false, owned = true;
// Script only the persistence boundary. PracticeAccess, authentication, ownership and tenant binding run unchanged.
const query = vi.fn(async (sql: string) => {
 if (sql.includes("app.authenticate_practice_session")) {
  if (expired) throw sqlError("28000", "expired credential");
  return { rows: [{ tenant_id: DEMO_TENANT_ID, membership_id: membershipId,
   identity_user_id: token, owner_digest: "d".repeat(64) }] };
 }
 if (sql.includes("app.current_actor()")) return { rows: [{ actor: membershipId, tenant: DEMO_TENANT_ID }] };
 if (sql.startsWith("WITH RECURSIVE practice_owned_job")) return { rows: owned ? [{ id: jobId }] : [] };
 if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) || sql.startsWith("SELECT app.bind_request(") || sql.startsWith("SELECT set_config(")) return { rows: [] };
 throw new Error(`Unexpected fixture query: ${sql}`);
});
const pool = { query, connect: async () => ({ query, release: vi.fn() }) };
let app: INestApplication;
let get: ReturnType<typeof vi.spyOn>, post: ReturnType<typeof vi.spyOn>;
const dispatch = vi.spyOn(UserCommandDispatcher.prototype, "dismissDecision");

beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Pool).useValue(pool).compile();
 app = module.createNestApplication();
 app.useLogger(false);
 get = vi.spyOn(app.getHttpAdapter(), "get");
 post = vi.spyOn(app.getHttpAdapter(), "post");
 await app.init();
 expect(app.get(DecisionsController)).toBeInstanceOf(DecisionsController);
});
afterAll(async () => { await app?.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
beforeEach(() => {
 query.mockClear(); expired = false; owned = true;
 repositories.list.mockReset().mockResolvedValue([]);
 repositories.evaluate.mockReset().mockResolvedValue({ ...inbox, evaluation: { created: 0, replayed: 0 } });
 dispatch.mockReset().mockResolvedValue({ decisionId, resolution: "dismissed", authorizedAction: false });
});

async function http(path: string, body?: unknown, cookie: string | undefined = `jg_session=${token}`) {
 const routes = path === "/decisions" ? get : post;
 const route = routes.mock.calls.find(([registered]: [unknown, ...unknown[]]) => registered === path);
 expect(route).toBeDefined();
 const response = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn(), getHeader: vi.fn() };
 await route![1]({ path, method: path === "/decisions" ? "GET" : "POST", params: {},
  headers: { ...(cookie ? { cookie } : {}), "x-jobguard-verified-tenant": DEMO_TENANT_ID },
  query: { jobId }, body }, response, vi.fn());
 return { status: response.status.mock.calls.at(-1)?.[0], body: response.json.mock.calls.at(-1)?.[0] };
}

it("valid list/evaluate/dismiss traverse the real Nest handlers and application", async () => {
 expect(await http("/decisions")).toEqual({ status: 200, body: inbox });
 expect((await http("/decisions/evaluate", evaluate)).status).toBe(201);
 expect(await http("/decisions/resolve", dismiss)).toEqual({ status: 201, body: {
  version: "decision-resolution-result.v1", decisionId, resolution: "dismissed", authorizedAction: false,
  label: "Dismissed — no action authorized",
 } });
 expect(repositories.evaluate).toHaveBeenCalledWith(expect.anything(), evaluate, "d".repeat(64), expect.any(Function));
 expect(dispatch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
  semanticKey: `dismiss:${dismiss.findingFingerprint}`, actorMembershipId: membershipId,
 }));
});
it.each([
 ["/decisions/evaluate", { ...evaluate, commandId: "bad" }],
 ["/decisions/evaluate", { ...evaluate, version: "bad" }],
 ["/decisions/resolve", { ...dismiss, findingFingerprint: "bad" }],
])("owned routing envelope with malformed command returns 400: %s", async (path, body) => {
 expect(await http(path, body)).toEqual({ status: 400, body: { code: "INVALID_COMMAND" } });
 expect(repositories.evaluate).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
it.each([
 ["INVALID_COMMAND", 400], ["CONFLICT", 409], ["FORBIDDEN", 403], ["NOT_FOUND", 404],
] as const)("maps domain %s on every Decisions route", async (code, status) => {
 repositories.list.mockRejectedValue(new DecisionsError(code));
 repositories.evaluate.mockRejectedValue(new DecisionsError(code));
 dispatch.mockRejectedValue(new DecisionsError(code));
 for (const [path, body] of [["/decisions", undefined], ["/decisions/evaluate", evaluate], ["/decisions/resolve", dismiss]] as const)
  expect(await http(path, body)).toEqual({ status, body: { code } });
});
it.each([
 ["22023", "INVALID_COMMAND", 400, "INVALID_COMMAND"],
 ["23505", "IDEMPOTENCY_CONFLICT", 409, "CONFLICT"],
 ["42501", "NOT_FOUND", 404, "NOT_FOUND"],
])("normalizes the exact evaluate SQL refusal %s/%s", async (sqlstate, message, status, code) => {
 repositories.evaluate.mockRejectedValue(sqlError(sqlstate, message));
 expect(await http("/decisions/evaluate", evaluate)).toEqual({ status, body: { code } });
});
it("reused command with changed payload returns conflict after ownership", async () => {
 repositories.evaluate.mockResolvedValueOnce(inbox).mockRejectedValueOnce(sqlError("23505", "IDEMPOTENCY_CONFLICT"));
 expect((await http("/decisions/evaluate", evaluate)).status).toBe(201);
 expect(await http("/decisions/evaluate", { ...evaluate, jobId: decisionId })).toEqual({ status: 409, body: { code: "CONFLICT" } });
});
it.each([
 ["COMMAND_CONFLICT", 409, "CONFLICT"], ["FORBIDDEN", 403, "FORBIDDEN"], ["AUTHORIZATION_INVALID", 403, "FORBIDDEN"],
] as const)("normalizes typed dispatcher %s", async (failure, status, code) => {
 dispatch.mockRejectedValue(new CommandError(failure));
 expect(await http("/decisions/resolve", dismiss)).toEqual({ status, body: { code } });
});
it.each([
 new Error("private database failure"), sqlError("22023", "private SQL failure"),
 sqlError("XX000", "INVALID_COMMAND"), new Error("INVALID_COMMAND"),
 sqlError("XX000", "IDEMPOTENCY_CONFLICT"), sqlError("XX000", "NOT_FOUND"),
])("unknown/mismatched evaluate failure stays a generic private 500: %s", async error => {
 repositories.evaluate.mockRejectedValue(error);
 expect(await http("/decisions/evaluate", evaluate)).toEqual({ status: 500, body: { statusCode: 500, message: "Internal server error" } });
});
it.each([new Error("FORBIDDEN"), { code: "COMMAND_CONFLICT" }, sqlError("22023", "INVALID_COMMAND")])(
 "untyped dispatcher failures are not promoted to trusted refusals", async error => {
 dispatch.mockRejectedValue(error);
 expect(await http("/decisions/resolve", dismiss)).toEqual({ status: 500, body: { statusCode: 500, message: "Internal server error" } });
});
it.each(["missing", "expired", "foreign"])("%s practice authority wins over malformed commands", async refusal => {
 expired = refusal === "expired"; owned = refusal !== "foreign";
 for (const [path, body] of [["/decisions", undefined], ["/decisions/evaluate", { ...evaluate, version: "bad" }],
  ["/decisions/resolve", { ...dismiss, findingFingerprint: "bad" }]] as const) {
  expect(await http(path, body, refusal === "missing" ? "" : `jg_session=${token}`)).toEqual({
   status: refusal === "foreign" ? 404 : 401, body: { code: refusal === "foreign" ? "NOT_FOUND" : "UNAUTHENTICATED" },
  });
 }
 expect(repositories.list).not.toHaveBeenCalled(); expect(repositories.evaluate).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
});
it.each(["practice", "real"] as const)("binding refusal retains its existing %s filter", async kind => {
 repositories.evaluate.mockRejectedValue(new RequestBindingRefusedError(kind));
 expect(await http("/decisions/evaluate", evaluate)).toEqual({
  status: kind === "practice" ? 401 : 403, body: { code: kind === "practice" ? "UNAUTHENTICATED" : "FORBIDDEN" },
 });
});
