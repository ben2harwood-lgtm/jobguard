import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { approveVariation, priceVariation, ContractorError, type VariationProposal } from "@jobguard/core";
import { VariationRepository, approvePricedVariation, insertPricedVariation, insertVariationProposal } from "../src/variation-repository.js";
import { ContractorRepository } from "../src/contractor-repository.js";
import { ContractorPartyRepository } from "../src/contractor-party-repository.js";
import { SorRepository } from "../src/sor-repository.js";
import { WorkOrderRepository } from "../src/work-order-repository.js";
import { demoClientName, generateWorkOrderSample, prepareWorkOrderDemo } from "../src/work-order-fixtures.js";
import { WorkOrderApplication } from "../../../apps/api/src/contractor/work-order.application.js";
import { ProofCommandService } from "../src/proof-repository.js";
import type { AuthenticatedMembership, TenantTransaction } from "../src/tenant-context.js";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Descending UUIDs make the ordering defect deterministic. Scripted SQL is not PostgreSQL assurance.
vi.mock("node:crypto", async original => {
  const actual = await original<typeof import("node:crypto")>();
  let next = 100000;
  return { ...actual, randomUUID: () => `00000000-0000-4000-8000-${String(next--).padStart(12, "0")}` };
});
vi.mock("../src/audit.js", async original => ({ ...await original<typeof import("../src/audit.js")>(), appendAuditBatch: vi.fn().mockResolvedValue([]) }));
const rows = (items: unknown[]) => ({ rows: items, rowCount: items.length });
const tenantId = "11111111-1111-4111-8111-111111111111", context = testTenantContext(tenantId);
const principal = { tenantId, membershipId: randomUUID(), identityUserId: randomUUID() } as AuthenticatedMembership;
const poolOf = (query: (sql: string, values?: unknown[]) => Promise<unknown>) => ({ connect: async () => ({ query, release() {} }) }) as unknown as Pool;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

class VariationSql {
  state = "draft";
  scopeState = "reserved";
  existingScopeId: string | null = null;
  revisionId: string | null = null;
  progress: { revision: number; stage: string } | null = null;
  approvals: string[] = [];
  rejections: string[] = [];
  calls: string[] = [];
  readonly jobId = randomUUID();
  readonly scopeId = randomUUID();
  readonly bytes = Buffer.from("fictional verified evidence");
  readonly sha256 = createHash("sha256").update(this.bytes).digest("hex");
  query = async (sql: string, values: unknown[] = []) => {
    this.calls.push(sql);
    if (sql.includes("FROM app.variation_revision")) return rows([{}]);
    if (sql.includes("FROM app.variation WHERE")) return rows([{ job_id: this.jobId, scope_item_id: this.scopeId, existing_scope_item_id: this.existingScopeId, state: this.state, current_revision_id: this.revisionId }]);
    if (sql.includes("INSERT INTO app.variation_approval")) {
      if (this.approvals.length) return rows([]);
      this.approvals.push(values[0] as string); return rows([{ id: values[0] }]);
    }
    if (sql.includes("FROM app.variation_approval")) return rows([{ id: this.approvals[0] }]);
    if (sql.includes("INSERT INTO app.variation_rejection")) { this.rejections.push(values[0] as string); return rows([]); }
    if (sql.includes("UPDATE app.variation SET state='approved'")) this.state = "approved";
    if (sql.includes("UPDATE app.variation SET state='priced'")) { this.state = "priced"; this.revisionId = values[0] as string; }
    if (sql.includes("UPDATE app.variation SET state='rejected'")) this.state = "rejected";
    if (sql.includes("UPDATE app.scope_identity")) this.scopeState = "confirmed";
    if (sql.includes("INSERT INTO app.scope_progress")) this.progress ??= { revision: 0, stage: "not_started" };
    if (sql.includes("FROM app.scope_progress")) return rows(this.progress ? [this.progress] : []);
    if (sql.includes("transition_scope_progress")) { this.progress = { revision: this.progress!.revision + 1, stage: sql.includes("'complete'") ? "complete" : "in_progress" }; return rows([this.progress]); }
    if (sql.includes("app.require_watchdog_live")) return rows([]);
    if (sql.includes("INSERT INTO app.watchdog_command_identity")) return rows([{ command_id: values[1] }]);
    if (sql.includes("UNION ALL SELECT")) return rows([]);
    if (sql.includes("FROM app.job WHERE")) return rows([{ status: "live", revision: 0 }]);
    if (sql.includes("FROM app.membership")) return rows([{}]);
    if (sql.includes("FROM app.watchdog_command_identity") || sql.includes("FROM app.command_receipt")) return rows([]);
    if (sql.includes("INSERT INTO app.command_receipt")) return rows([{ command_id: values[0] }]);
    if (sql.includes("FROM app.evidence_object")) return rows([{ id: values[1], object_key: "fictional", object_version_id: "v1", sha256: this.sha256 }]);
    if (sql.includes("SELECT id FROM app.evidence_link")) return rows([{ id: randomUUID() }]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory|INSERT INTO|UPDATE app\.)/u.test(sql)) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  db() { return { $client: { query: this.query } } as unknown as TenantTransaction; }
  async approved() {
    const proposal: VariationProposal = { version: "variation-proposal.v1", id: randomUUID(), jobId: this.jobId, scopeItemId: this.scopeId, existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional new extra", description: "Fictional new extra", suggestion: null };
    await insertVariationProposal(this.db(), tenantId, proposal);
    const revision = priceVariation({ id: randomUUID(), variationId: proposal.id, previous: null, proposal, description: proposal.description, contentHash: "a".repeat(64), confirmed: { quantity: "2", unit: "each", unitRatePence: 12500, direction: "addition", confirmedByMembershipId: principal.membershipId, rateProvenance: { kind: "human_entered", sourceRef: "fixture://extra", sourceHash: "b".repeat(64), rateVersion: "fixture-v1" } } });
    await insertPricedVariation(this.db(), tenantId, revision);
    const approval = approveVariation(revision, { id: randomUUID(), revisionId: revision.id, revision: 1, contentHash: revision.contentHash, signedDeltaPence: 25000, method: "builder_attestation", actorMembershipId: principal.membershipId, evidenceId: null, approvedAt: new Date() });
    await approvePricedVariation(this.db(), tenantId, proposal.id, approval);
    return { proposal, revision, approval };
  }
}
function fixtureSql(finance = false) {
  const teamId = randomUUID(), branchId = randomUUID(), operative = randomUUID(), scheduleId = randomUUID(), sorVersionId = randomUUID();
  const sites: string[] = [];
  let allowed = true;
  let client: { id: string; name: string; branch_id: string } | undefined;
  let contract: { id: string; contract_id: string; client_id: string; document: Record<string, unknown> } | undefined;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (sql.includes("app.work_order_import_permitted")) return rows([{ track: "contractor", active: true, allowed }]);
    if (sql.includes("FROM app.site_revision")) return rows([...sites].sort().map(id => ({ id })));
    if (sql.includes("FROM app.contractor_member")) return rows([{ membership_id: operative }]);
    if (sql.includes("FROM app.sor_version")) return rows([{ schedule_id: scheduleId }]);
    if (sql.includes("FROM app.team")) return rows([{ id: teamId, branch_id: branchId }]);
    if (sql.includes("INSERT INTO app.site_revision")) sites.push(values[1] as string);
    if (/^(SELECT pg_advisory|BEGIN|COMMIT|ROLLBACK|SELECT set_config|INSERT INTO)/u.test(sql)) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const view = vi.spyOn(ContractorRepository.prototype, "query").mockImplementation(async (_p, raw) => {
    if (finance && (raw as { resource: string }).resource === "organisation") throw new ContractorError("NOT_FOUND");
    return { version: "contractor-workspace.v1", environment: "synthetic_demo", tenantId, membershipId: principal.membershipId, revision: 0, realExternalActions: 0, units: [], teams: finance ? [] : [{ id: teamId, branch_id: branchId, name: "Fictional team" }], clients: client ? [client] : [], contracts: contract ? [{ ...contract, revision: 1, rule_version_id: randomUUID(), rules: {} }] : [], members: [], grants: [], teamMemberships: [] };
  });
  vi.spyOn(ContractorRepository.prototype, "command").mockImplementation(async (_p, raw) => {
    const c = raw as Record<string, any>;
    if (c.kind === "client.create") client = { id: c.id, name: demoClientName, branch_id: branchId };
    if (c.kind === "contract.revise") contract = { id: c.id, contract_id: c.contractId, client_id: c.clientId, document: c.document };
    return { id: c.kind === "member.invite" ? operative : c.id, revision: 1, kind: c.kind, environment: "synthetic_demo", realExternalActions: 0 };
  });
  vi.spyOn(SorRepository.prototype, "importVersion").mockResolvedValue({ versionId: sorVersionId } as never);
  vi.spyOn(ContractorPartyRepository.prototype, "linkCustomer").mockResolvedValue({} as never);
  return { pool: poolOf(query), sites, view, query, deny() { allowed = false; }, existing() { client = { id: randomUUID(), name: demoClientName, branch_id: branchId }; contract = { id: randomUUID(), contract_id: randomUUID(), client_id: client.id, document: { sorVersionIds: [sorVersionId], tenderedAdjustment: { numerator: "-35", denominator: "1000" } } }; sites.push(...Array.from({ length: 5 }, () => randomUUID())); } };
}

describe("AUDIT-FIX-DBSRC-17 scripted repository regressions", () => {
  it("reject cannot revoke an approved variation", async () => {
    const sql = new VariationSql(), { proposal, revision } = await sql.approved();
    await expect(new VariationRepository(poolOf(sql.query)).reject(sql.db(), tenantId, { id: randomUUID(), variationId: proposal.id, revisionId: revision.id, actorMembershipId: principal.membershipId })).rejects.toThrow("EXACT_CURRENT_PRICED_REVISION_REQUIRED");
    expect(sql.state).toBe("approved"); expect(sql.rejections).toEqual([]);
    expect(sql.approvals).toHaveLength(1);
    expect(sql.state === "approved" ? revision.signedDeltaPence : 0).toBe(25000);
  });
  it("generated samples preserve sites across preparation", async () => {
    const sql = fixtureSql();
    const first = await prepareWorkOrderDemo(sql.pool, principal);
    const second = await prepareWorkOrderDemo(sql.pool, principal);
    expect(first.siteRevisionIds).toEqual(second.siteRevisionIds);
    expect(generateWorkOrderSample("starter_orders", first)).toBe(generateWorkOrderSample("starter_orders", second));
  });
  it("finance can import generated orders", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const sql = fixtureSql(true); sql.existing();
    vi.spyOn(WorkOrderRepository.prototype, "resolveSession").mockResolvedValue(principal);
    const imported = vi.spyOn(WorkOrderRepository.prototype, "importCsv").mockResolvedValue({ created: 5, rejected: 0 } as never);
    await expect(new WorkOrderApplication(sql.pool).importGenerated({ version: "contractor-principal.v1", sessionId: randomUUID() }, { version: "work-order-import-request.v1", environment: "synthetic_demo", commandId: randomUUID(), source: { kind: "generated", sample: "starter_orders" } })).resolves.toMatchObject({ created: 5, rejected: 0 });
    expect(imported).toHaveBeenCalledOnce();
  });
  it("approved new extra supports proof completion", async () => {
    const sql = new VariationSql(); await sql.approved();
    const storage = { readExactVersion: async () => ({ versionId: "v1", bytes: sql.bytes }) } as unknown as PrivateVersionedStorage;
    await expect(new ProofCommandService(poolOf(sql.query), storage).complete(context, { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: principal.membershipId, jobId: sql.jobId, scopeItemId: sql.scopeId, stage: "extra-stage", evidenceId: randomUUID(), requiredEvidenceType: "electrical_certificate", decisionId: null })).resolves.toMatchObject({ state: "complete" });
    expect(sql.scopeState).toBe("confirmed"); expect(sql.progress?.stage).toBe("complete");
    expect(sql.calls.filter(c => c.includes("INSERT INTO app.scope_progress"))).toHaveLength(1);
  });
});


describe("AUDIT-FIX-DBSRC-17 additional refusal/replay cases", () => {
  it.each(["draft", "approved"])("refuses rejection in %s state before any rejection write", async state => {
    const sql = new VariationSql(); sql.state = state; sql.revisionId = randomUUID();
    await expect(new VariationRepository(poolOf(sql.query)).reject(sql.db(), tenantId, { id: randomUUID(), variationId: randomUUID(), revisionId: sql.revisionId, actorMembershipId: principal.membershipId })).rejects.toThrow("EXACT_CURRENT_PRICED_REVISION_REQUIRED");
    expect(sql.state).toBe(state); expect(sql.rejections).toEqual([]);
  });
  it("refuses rejection of a stale revision", async () => {
    const sql = new VariationSql(); sql.state = "priced"; sql.revisionId = randomUUID();
    await expect(new VariationRepository(poolOf(sql.query)).reject(sql.db(), tenantId, { id: randomUUID(), variationId: randomUUID(), revisionId: randomUUID(), actorMembershipId: principal.membershipId })).rejects.toThrow("EXACT_CURRENT_PRICED_REVISION_REQUIRED");
    expect(sql.state).toBe("priced"); expect(sql.rejections).toEqual([]);
  });
  it("continues to allow rejection of the exact current priced revision", async () => {
    const sql = new VariationSql(); sql.state = "priced"; sql.revisionId = randomUUID();
    const input = { id: randomUUID(), variationId: randomUUID(), revisionId: sql.revisionId, actorMembershipId: principal.membershipId };
    expect(await new VariationRepository(poolOf(sql.query)).reject(sql.db(), tenantId, input)).toEqual(input);
    expect(sql.state).toBe("rejected"); expect(sql.rejections).toEqual([input.id]);
  });
  it("approval replay preserves progress and does not insert another progress row", async () => {
    const sql = new VariationSql(), { proposal, approval } = await sql.approved();
    sql.progress = { stage: "complete", revision: 2 };
    await approvePricedVariation(sql.db(), tenantId, proposal.id, approval);
    expect(sql.progress).toEqual({ stage: "complete", revision: 2 });
    expect(sql.calls.filter(c => c.includes("INSERT INTO app.scope_progress"))).toHaveLength(1);
  });
  it("an existing-scope variation does not reset or initialize operational progress", async () => {
    const sql = new VariationSql(); sql.existingScopeId = sql.scopeId; sql.scopeState = "confirmed";
    sql.progress = { stage: "in_progress", revision: 7 };
    await sql.approved();
    expect(sql.progress).toEqual({ stage: "in_progress", revision: 7 });
    expect(sql.calls.filter(c => c.includes("INSERT INTO app.scope_progress"))).toHaveLength(0);
  });
  it("denies fixture reuse without current import permission before reading inputs", async () => {
    const sql = fixtureSql(true); sql.existing(); sql.deny();
    await expect(prepareWorkOrderDemo(sql.pool, principal)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(sql.view).not.toHaveBeenCalled();
    expect(sql.query.mock.calls.some(([text]) => text.includes("FROM app.site_revision"))).toBe(false);
  });
  it("finance cannot create an unprepared organisation", async () => {
    const sql = fixtureSql(true);
    await expect(prepareWorkOrderDemo(sql.pool, principal)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ContractorRepository.prototype.command).not.toHaveBeenCalled();
    expect(sql.sites).toEqual([]);
  });
});
