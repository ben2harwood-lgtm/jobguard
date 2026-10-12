import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditExportRepository, ContractorRepository, type AuthenticatedMembership } from "@jobguard/db";
import { AuditExportApplication, auditExportHttpFailure } from "./audit-export.application.js";

const { bridge } = vi.hoisted(() => ({ bridge: vi.fn() }));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<typeof import("@jobguard/db")>(), contractorSessionContext: bridge,
}));
function setup() {
  const pool = new Pool(), session = randomUUID();
  const member = { tenantId: randomUUID(), membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
  // Only repository stand-ins consume this identity marker; it is never used with withTenant.
  const context = Object.freeze({ tenantId: member.tenantId });
  bridge.mockResolvedValue(context);
  const lookup = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(member);
  const query = vi.spyOn(ContractorRepository.prototype, "query").mockResolvedValue({
    version: "contractor-workspace.v1", environment: "synthetic_demo", tenantId: member.tenantId, membershipId: member.membershipId,
    revision: 0, realExternalActions: 0, units: [], teams: [], members: [], grants: [], teamMemberships: [], clients: [], contracts: [],
  });
  const list = vi.spyOn(AuditExportRepository.prototype, "list").mockResolvedValue([]);
  const create = vi.spyOn(AuditExportRepository.prototype, "create");
  const refuse = vi.spyOn(AuditExportRepository.prototype, "refuse").mockResolvedValue(undefined);
  const application = new AuditExportApplication(pool);
  const request = { version: "audit-export-request.v1", commandId: randomUUID() };
  const actor = { membershipId: member.membershipId, identityUserId: member.identityUserId };
  const call = (action: "list" | "create") => action === "list" ? application.list(session) : application.create(session, request);
  return { pool, session, member, context, lookup, query, list, create, refuse, application, request, actor, call };
}
const failure = (code: string, status: number) => ({ status, body: { version: "audit-export-error.v1", code } });
const response = (work: Promise<unknown>) => work.then(() => undefined, error => auditExportHttpFailure(error));
beforeEach(() => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); bridge.mockReset(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("audit-export shared context boundary tests", () => {
  it.each(["list", "create", "refuse"] as const)("[X1] passes the bridge's exact context to %s with the application's pool and session", async action => {
    const s = setup();
    try {
      // create is an identity stand-in here, with no persistence or provider effect.
      s.create.mockImplementation(async () => { throw new Error("create stand-in reached"); });
      if (action === "refuse") s.query.mockRejectedValue({ code: "FORBIDDEN" });
      await s.call(action === "create" ? "create" : "list").catch(() => undefined);
      expect(bridge.mock.calls).toEqual([[s.pool, s.session]]);
      const method = action === "list" ? s.list : action === "create" ? s.create : s.refuse;
      expect(method).toHaveBeenCalledOnce(); expect(method.mock.calls[0]![0]).toBe(s.context);
      expect(method.mock.calls[0]![1]).toEqual(s.actor);
      if (action === "create") expect(s.create.mock.calls[0]![2]).toEqual(s.request);
      if (action === "refuse") expect(s.refuse.mock.calls[0]![2]).toBe("list");
    } finally { await s.pool.end(); }
  });
  it("[X2] preserves missing/unknown-session errors without a refusal and active-member list/actor results", async () => {
    const s = setup();
    try {
      expect(await response(s.application.list(undefined))).toEqual(failure("AUDIT_EXPORT_UNAUTHENTICATED", 401));
      expect(s.lookup).not.toHaveBeenCalled(); expect(bridge).not.toHaveBeenCalled();
      s.lookup.mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
      expect(await response(s.call("list"))).toEqual(failure("AUDIT_EXPORT_UNAUTHENTICATED", 401));
      expect(s.refuse).not.toHaveBeenCalled(); expect(bridge).not.toHaveBeenCalled();
      expect(await s.call("list")).toEqual({ version: "audit-export-list.v1", environment: "synthetic_demo", notice: "The signature proves export integrity only", sandbox: "Practice sandbox — synthetic data; nothing is sent or charged", exports: [] });
      expect(s.list.mock.calls[0]![1]).toEqual(s.actor);
    } finally { await s.pool.end(); }
  });
  it.each(["list", "create"] as const)("[X2] awaits exactly one durable %s refusal before 403 and preserves refusal failure as 503", async action => {
    const s = setup();
    try {
      s.query.mockRejectedValue({ code: "FORBIDDEN" });
      let commit!: () => void;
      s.refuse.mockImplementationOnce(() => new Promise<void>(resolve => { commit = resolve; }));
      let returned = false;
      const pending = response(s.call(action)).then(value => { returned = true; return value; });
      await new Promise(resolve => setImmediate(resolve));
      expect(s.refuse).toHaveBeenCalledExactlyOnceWith(s.context, s.actor, action);
      expect(returned).toBe(false); expect(s.list).not.toHaveBeenCalled(); expect(s.create).not.toHaveBeenCalled();
      commit(); expect(await pending).toEqual(failure("AUDIT_EXPORT_FORBIDDEN", 403));
      s.refuse.mockRejectedValueOnce(new Error("refusal persistence unavailable"));
      expect(await response(s.call(action))).toEqual(failure("AUDIT_EXPORT_UNAVAILABLE", 503));
    } finally { await s.pool.end(); }
  });
  it.each(["pilot_no_charge", "production_billing", "", undefined])("[X2] preserves held mode %s before database access", async mode => {
    const s = setup();
    try {
      vi.stubEnv("JOBGUARD_ENV", mode);
      const connect = vi.spyOn(s.pool, "connect"), query = vi.spyOn(s.pool, "query");
      for (const action of ["list", "create"] as const) expect(await response(s.call(action))).toEqual(failure("AUDIT_EXPORT_MODE_HELD", 403));
      expect(s.lookup).not.toHaveBeenCalled(); expect(bridge).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled(); expect(query).not.toHaveBeenCalled();
    } finally { await s.pool.end(); }
  });
  it.each(["list", "create", "refuse-list", "refuse-create"] as const)("[X3] refuses disagreeing tenant lookups and bridge UNAUTHENTICATED on %s", async path => {
    const s = setup();
    try {
      if (path.startsWith("refuse")) s.query.mockRejectedValue({ code: "FORBIDDEN" });
      const action = path.endsWith("create") ? "create" : "list";
      for (const disposition of ["different-tenant", "unknown-session"]) {
        if (disposition === "different-tenant") bridge.mockResolvedValueOnce(Object.freeze({ tenantId: randomUUID() }));
        else bridge.mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
        expect(await response(s.call(action))).toEqual(failure("AUDIT_EXPORT_UNAUTHENTICATED", 401));
        expect(s.list).not.toHaveBeenCalled(); expect(s.create).not.toHaveBeenCalled(); expect(s.refuse).not.toHaveBeenCalled();
      }
    } finally { await s.pool.end(); }
  });
  it("[X3] compares tenant uuid values without case differences and propagates other bridge errors unchanged", async () => {
    const s = setup();
    try {
      bridge.mockResolvedValueOnce(Object.freeze({ tenantId: s.member.tenantId.toUpperCase() }));
      await s.call("list"); expect(s.list).toHaveBeenCalledOnce();
      const error = new Error("database unavailable"); bridge.mockRejectedValueOnce(error);
      await expect(s.call("list")).rejects.toBe(error);
    } finally { await s.pool.end(); }
  });
  it("[X4] removes the hand-made adapter and calls the shared bridge once in the typed method", () => {
    const text = readFileSync(new URL("./audit-export.application.ts", import.meta.url), "utf8");
    for (const old of ["resolveVerifiedTenantContext", "AuthProvider", "AuthError", "principal-bridge", "audit-export-internal-bridge", "fictional.invalid"]) expect(text).not.toContain(old);
    expect(text.match(/contractorSessionContext\(/gu)).toHaveLength(1);
    expect(text).toContain("const context: VerifiedTenantContext = await contractorSessionContext(this.pool, sessionId);");
    // Unchanged merged spans are evidenced in the receipt, rather than frozen by a standing test (rule 12).
  });
});
