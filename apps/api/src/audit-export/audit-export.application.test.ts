import { afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { AuditExportRepository, ContractorRepository, type AuthenticatedMembership } from "@jobguard/db";
import { AuditExportController } from "./audit-export.controller.js";
import { createWorkspaceApplication } from "../workspace/application.js";
import { AuditExportApplication, auditExportHttpFailure } from "./audit-export.application.js";
import { auditExportRequestV1 } from "./audit-export.contracts.js";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("ENT-10b application boundary", () => {
  it.each(["pilot_no_charge", "production_billing", ""])('refuses export creation in %s before accessing the database', async mode => {
    vi.stubEnv("JOBGUARD_ENV", mode);
    const pool = new Pool(); const connect = vi.spyOn(pool, "connect");
    await expect(new AuditExportApplication(pool).create(undefined, { version: "audit-export-request.v1", commandId: crypto.randomUUID() })).rejects.toMatchObject({ code: "AUDIT_EXPORT_MODE_HELD" });
    expect(connect).not.toHaveBeenCalled(); await pool.end();
  });
  it("refuses missing sessions with a typed error", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); const pool = new Pool();
    await expect(new AuditExportApplication(pool).list(undefined)).rejects.toMatchObject({ code: "AUDIT_EXPORT_UNAUTHENTICATED" }); await pool.end();
  });
  it("rejects client supplied tenant, checkpoint, key and mode fields", () => {
    const valid = { version: "audit-export-request.v1", commandId: crypto.randomUUID() };
    expect(auditExportRequestV1.safeParse(valid).success).toBe(true);
    for (const field of ["tenantId", "checkpoint", "privateKey", "environment", "recipient"]) expect(auditExportRequestV1.safeParse({ ...valid, [field]: "forged" }).success).toBe(false);
  });
  it("redacts unexpected database errors", () => {
    expect(auditExportHttpFailure(new Error("secret PostgreSQL detail"))).toEqual({ status: 503, body: { version: "audit-export-error.v1", code: "AUDIT_EXPORT_UNAVAILABLE" } });
  });
  it("uses the persisted session and existing principal bridge in the shared composition seam", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = new Pool(), sessionId = crypto.randomUUID();
    const membership = { tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() } as AuthenticatedMembership;
    const resolve = vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(membership);
    vi.spyOn(ContractorRepository.prototype, "query").mockResolvedValue({ version: "contractor-workspace.v1", environment: "synthetic_demo", tenantId: membership.tenantId, membershipId: membership.membershipId, revision: 0, realExternalActions: 0, units: [], teams: [], members: [], grants: [], teamMemberships: [], clients: [], contracts: [] });
    const list = vi.spyOn(AuditExportRepository.prototype, "list").mockResolvedValue([]);
    const application = createWorkspaceApplication({ pool, sessionId });
    expect(await application.auditExports.list()).toMatchObject({ version: "audit-export-list.v1", notice: "The signature proves export integrity only", exports: [] });
    expect(resolve).toHaveBeenCalledWith(sessionId);
    expect(list.mock.calls[0]![0].tenantId).toBe(membership.tenantId);
    expect(list.mock.calls[0]![1]).toEqual({ membershipId: membership.membershipId, identityUserId: membership.identityUserId });
    expect(Object.isFrozen(list.mock.calls[0]![0])).toBe(true);
    await pool.end();
  });
  it("Nest exposes the same service and checks the browser origin before a write", async () => {
    const pool = new Pool(), controller = new AuditExportController(pool), sessionId = crypto.randomUUID();
    const list = vi.spyOn(AuditExportApplication.prototype, "list").mockResolvedValue({ version: "audit-export-list.v1", environment: "synthetic_demo", notice: "The signature proves export integrity only", sandbox: "Practice sandbox — synthetic data; nothing is sent or charged", exports: [] });
    await controller.list(`jg_session=${sessionId}`); expect(list).toHaveBeenCalledWith(sessionId);
    const create = vi.spyOn(AuditExportApplication.prototype, "create");
    expect(() => controller.create(`jg_session=${sessionId}`, "https://foreign.invalid", {})).toThrow(); expect(create).not.toHaveBeenCalled();
    await pool.end();
  });

  it("refuses inactive membership before exports are read", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = new Pool(), sessionId = crypto.randomUUID();
    const membership = { tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() } as AuthenticatedMembership;
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(membership);
    vi.spyOn(ContractorRepository.prototype, "query").mockRejectedValue({ code: "FORBIDDEN" });
    const refuse = vi.spyOn(AuditExportRepository.prototype, "refuse").mockResolvedValue(undefined);
    const list = vi.spyOn(AuditExportRepository.prototype, "list");
    await expect(new AuditExportApplication(pool).list(sessionId)).rejects.toMatchObject({ code: "AUDIT_EXPORT_FORBIDDEN" });
    expect(refuse).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: membership.tenantId }), { membershipId: membership.membershipId, identityUserId: membership.identityUserId }, "list");
    expect(list).not.toHaveBeenCalled(); await pool.end();
  });

  it.each(["list", "create"] as const)("awaits the revoked member's durable %s refusal before returning 403", async action => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = new Pool(), sessionId = crypto.randomUUID();
    const membership = { tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() } as AuthenticatedMembership;
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue(membership);
    vi.spyOn(ContractorRepository.prototype, "query").mockRejectedValue({ code: "FORBIDDEN" });
    let commit!: () => void;
    const refuse = vi.spyOn(AuditExportRepository.prototype, "refuse").mockImplementation(() => new Promise<void>(resolve => { commit = resolve; }));
    const list = vi.spyOn(AuditExportRepository.prototype, "list"), create = vi.spyOn(AuditExportRepository.prototype, "create");
    const application = new AuditExportApplication(pool);
    let returned = false;
    const response = (action === "list" ? application.list(sessionId) : application.create(sessionId, { version: "audit-export-request.v1", commandId: crypto.randomUUID() }))
      .then(() => { returned = true; return undefined; }, error => { returned = true; return auditExportHttpFailure(error); });
    await new Promise(resolve => setImmediate(resolve));
    expect(refuse).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: membership.tenantId }), { membershipId: membership.membershipId, identityUserId: membership.identityUserId }, action);
    expect(Object.isFrozen(refuse.mock.calls[0]![0])).toBe(true);
    expect(returned).toBe(false); expect(list).not.toHaveBeenCalled(); expect(create).not.toHaveBeenCalled();
    commit();
    expect(await response).toEqual({ status: 403, body: { version: "audit-export-error.v1", code: "AUDIT_EXPORT_FORBIDDEN" } });
    await pool.end();
  });

  it("does not write a refusal when the session cannot be attributed to a tenant", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = new Pool();
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockRejectedValue({ code: "UNAUTHENTICATED" });
    const refuse = vi.spyOn(AuditExportRepository.prototype, "refuse");
    await expect(new AuditExportApplication(pool).list(crypto.randomUUID())).rejects.toMatchObject({ code: "AUDIT_EXPORT_UNAUTHENTICATED" });
    expect(refuse).not.toHaveBeenCalled(); await pool.end();
  });

  it.each(["list", "create"] as const)("returns unavailable if the attributable %s refusal cannot be committed", async action => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const pool = new Pool(), sessionId = crypto.randomUUID();
    vi.spyOn(ContractorRepository.prototype, "resolveSession").mockResolvedValue({ tenantId: crypto.randomUUID(), membershipId: crypto.randomUUID(), identityUserId: crypto.randomUUID() } as AuthenticatedMembership);
    vi.spyOn(ContractorRepository.prototype, "query").mockRejectedValue({ code: "FORBIDDEN" });
    vi.spyOn(AuditExportRepository.prototype, "refuse").mockRejectedValue(new Error("refusal persistence unavailable"));
    const application = new AuditExportApplication(pool);
    const response = await (action === "list" ? application.list(sessionId) : application.create(sessionId, { version: "audit-export-request.v1", commandId: crypto.randomUUID() }))
      .then(() => undefined, error => auditExportHttpFailure(error));
    expect(response).toEqual({ status: 503, body: { version: "audit-export-error.v1", code: "AUDIT_EXPORT_UNAVAILABLE" } });
    await pool.end();
  });

});
