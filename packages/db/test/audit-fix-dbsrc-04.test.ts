import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supplierFixtures } from "@jobguard/core";
import { DiscrepancyRepository } from "../src/discrepancy-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Scripted SQL adapter tests execute repository control flow; PostgreSQL coverage
// is in audit-fix-dbsrc-04.integration.test.ts and must run separately in CI.
const boundary = vi.hoisted(() => ({ db: null as any }));
vi.mock("../src/tenant-context.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/tenant-context.js")>(),
  withTenant: async (_pool: unknown, _ctx: unknown, fn: any) => fn(boundary.db),
}));
vi.mock("../src/audit.js", () => ({ appendAuditBatch: async () => [{ id: randomUUID() }] }));
vi.mock("../src/watchdog.js", async importOriginal => ({
  ...await importOriginal<typeof import("../src/watchdog.js")>(),
  requireLiveJob: async () => {}, beginStoredCommand: async () => ({ replay: false }), storeCommandResult: async () => {},
}));

const ctx = testTenantContext(randomUUID()), job = randomUUID();
const fixtureFact = (fixtureId: "materials-B-invoice" | "materials-B-revised-invoice" | "materials-320-invoice", net: number) => ({
  id: randomUUID(), document_id: randomUUID(), revision: 1, document_type: "invoice",
  supplier_context: "fictional-merchant", document_number: supplierFixtures[fixtureId].number,
  content_hash: createHash("sha256").update(supplierFixtures[fixtureId].bytes).digest("hex"), net_pence: net,
});
let calls: string[], facts: any[], finding: any;
const repo = new DiscrepancyRepository({} as Pool);
beforeEach(() => {
  calls = []; facts = []; finding = null;
  boundary.db = { $client: { query: async (sql: string) => {
    calls.push(sql);
    if (sql.includes("SELECT f.*")) return { rows: finding ? [{ ...finding, outcome: null }] : [] };
    if (sql.includes("SELECT id FROM app.discrepancy_finding_revision")) return { rows: finding ? [{ id: finding.id }] : [] };
    if (sql.includes("FROM app.supplier_fact_revision") && sql.includes("ANY(")) return { rows: facts };
    if (sql.includes("SELECT count(*) n")) return { rows: [{ n: 0 }] };
    if (sql.includes("SELECT s.confirmed_reduction_pence")) return { rows: [] };
    if (sql.includes("SELECT f.id,f.net_pence")) return { rows: facts };
    if (sql.includes("SELECT o.payload_hash")) return { rows: [] };
    if (sql.includes("pg_advisory_xact_lock") || sql.startsWith("INSERT")) return { rows: [] };
    throw new Error(`Unexpected SQL: ${sql}`);
  } } };
});

describe("audit discrepancy repository regressions (scripted SQL)", () => {
  it("supersession rejects unrelated confirmed invoices", async () => {
    facts = [fixtureFact("materials-320-invoice", 112000), fixtureFact("materials-B-revised-invoice", 16000)];
    await expect(repo.supersede(ctx, job, { commandId: randomUUID(), originalFactRevisionId: facts[0].id,
      replacementFactRevisionId: facts[1].id, expectedRevision: 0 })).rejects.toThrow("UNRELATED_SUPPLIER_BILLS");
    expect(calls.some(sql => sql.startsWith("INSERT INTO app.supplier_bill_supersession"))).toBe(false);
  });

  it("retains the related synthetic 250 to 160 replacement", async () => {
    facts = [fixtureFact("materials-B-invoice", 25000), fixtureFact("materials-B-revised-invoice", 16000)];
    await expect(repo.supersede(ctx, job, { commandId: randomUUID(), originalFactRevisionId: facts[0].id,
      replacementFactRevisionId: facts[1].id, expectedRevision: 0 })).resolves.toBeDefined();
  });

  it.each(["supplier", "bytes", "credit", "reversed_revision"])("rejects unrelated replacement identity: %s", async kind => {
    facts = [fixtureFact("materials-B-invoice", 25000), fixtureFact("materials-B-revised-invoice", 16000)];
    if (kind === "supplier") facts[1].supplier_context = "another-fictional-merchant";
    if (kind === "bytes") facts[1].content_hash = "a".repeat(64);
    if (kind === "credit") facts[1].document_type = "credit";
    if (kind === "reversed_revision") { facts[1].document_id = facts[0].document_id; facts[0].revision = 2; }
    await expect(repo.supersede(ctx, job, { commandId: randomUUID(), originalFactRevisionId: facts[0].id,
      replacementFactRevisionId: facts[1].id, expectedRevision: 0 })).rejects.toThrow("UNRELATED_SUPPLIER_BILLS");
  });

  it("latest supersession follows committed revision order", async () => {
    await repo.view(ctx, job);
    // Audit sequence is tenant-wide commit order, unlike transaction start time
    // or revisions scoped to different original invoices.
    expect(calls.find(sql => sql.includes("SELECT s.confirmed_reduction_pence"))).toContain("ORDER BY se.sequence DESC");
  });

  it("match correction invalidates the previous actionable finding", async () => {
    finding = { id: randomUUID(), state: "actionable", invalidated: true, revision: 1, total_pence: 9000 };
    expect((await repo.view(ctx, job)).finding?.state).toBe("superseded");
  });

  it("review rejects an invalidated finding before writing an outcome", async () => {
    finding = { id: randomUUID(), state: "actionable", invalidated: true, revision: 1, total_pence: 9000 };
    await expect(repo.review(ctx, job, { commandId: randomUUID(), findingId: finding.id, expectedRevision: 0,
      outcome: "disputed", reason: "Synthetic correction" })).rejects.toThrow("FINDING_SUPERSEDED");
    expect(calls.some(sql => sql.startsWith("INSERT INTO app.discrepancy_review_outcome"))).toBe(false);
  });

  it("queries invalidation against the same match proposal and the audit cutoff", async () => {
    await repo.view(ctx, job);
    const sql = calls.find(sql => sql.includes("SELECT f.*"))!;
    expect(sql).toContain("(newer.tenant_id,newer.job_id,newer.proposal_id)=(source.tenant_id,source.job_id,source.proposal_id)");
    expect(sql).toContain("newer.revision>source.revision AND newer.invalidates_unresolved_findings");
    expect(sql).toContain("me.sequence<=$3::bigint");
  });
});
