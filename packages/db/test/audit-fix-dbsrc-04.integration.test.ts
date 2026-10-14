import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscrepancyRepository } from "../src/discrepancy-repository.js";
import { createWatchdogHarness } from "./watchdog-command-harness.js";

const h = createWatchdogHarness("audit-fix-dbsrc-04", 62200);
beforeAll(() => h.boot(), 120000);
afterAll(() => h.stop());
const count = async (table: "supplier_bill_supersession" | "discrepancy_review_outcome", job: string) =>
  Number((await h.admin.query(`SELECT count(*) n FROM app.${table} WHERE tenant_id=$1 AND job_id=$2`, [h.tenant, job])).rows[0].n);
const confirmFixture = async (job: string, fixtureId: "materials-B-invoice" | "materials-B-revised-invoice" | "materials-320-invoice", expectedRevision: number,
  quantity: string, unitPricePence: number, netPence: number) => {
  const { docs } = h.repos;
  const intake = await docs.intake(h.ctx, job, { version: "supplier-document-intake.v1", commandId: randomUUID(), fixtureId, channel: "picker", expectedRevision });
  await docs.confirm(h.ctx, job, { version: "supplier-fact-correction.v1", commandId: randomUUID(), documentId: intake.documentId,
    documentType: "invoice", quantity, unitPricePence, netPence, expectedRevision: 0 });
  return (await h.admin.query("SELECT id FROM app.supplier_fact_revision WHERE tenant_id=$1 AND job_id=$2 AND document_id=$3", [h.tenant, job, intake.documentId])).rows[0].id as string;
};
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
// Pause an already-started transaction before the Things-to-check lock. No sleeps
// or timestamp edits: created_at really is the older transaction's start time.
function pauseThingsLock(pool: Pool, gate: Promise<void>, reached: () => void): Pool {
  return new Proxy(pool, { get(target, property) {
    if (property === "connect") return async () => {
      const client = await target.connect();
      return new Proxy(client, { get(inner, name) {
        if (name === "query") return async (...args: any[]) => {
          if (typeof args[0] === "string" && args[0].includes("pg_advisory_xact_lock") && args[1]?.[0]?.endsWith(":things-to-check")) {
            reached(); await gate;
          }
          return (inner.query as any)(...args);
        };
        const value = Reflect.get(inner, name, inner); return typeof value === "function" ? value.bind(inner) : value;
      } });
    };
    const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value;
  } }) as Pool;
}

describe("AUDIT-FIX-DBSRC-04 runtime-role PostgreSQL regressions", () => {
  it("supersession rejects unrelated confirmed invoices", async () => {
    const job = await h.live(), original = await confirmFixture(job, "materials-320-invoice", 0, "40", 2800, 112000),
      replacement = await confirmFixture(job, "materials-B-revised-invoice", 1, "8", 2000, 16000);
    await expect(h.repos.checks.supersede(h.ctx, job, { commandId: randomUUID(), originalFactRevisionId: original,
      replacementFactRevisionId: replacement, expectedRevision: 0 })).rejects.toThrow("UNRELATED_SUPPLIER_BILLS");
    expect(await count("supplier_bill_supersession", job)).toBe(0);
    expect((await h.repos.checks.view(h.ctx, job)).confirmedBillReductionPence).toBe(0);
  });

  it("retains the related 250 to 160 replacement", async () => {
    const job = await h.live(), original = await confirmFixture(job, "materials-B-invoice", 0, "10", 2500, 25000),
      replacement = await confirmFixture(job, "materials-B-revised-invoice", 1, "8", 2000, 16000);
    expect((await h.repos.checks.supersede(h.ctx, job, { commandId: randomUUID(), originalFactRevisionId: original,
      replacementFactRevisionId: replacement, expectedRevision: 0 })).confirmedBillReductionPence).toBe(9000);
  });

  it("latest supersession follows committed revision order", async () => {
    const job = await h.live(), [original, one, two] = await h.pre.facts(job), gate = deferred(), reached = deferred();
    const commandB = randomUUID();
    const b = new DiscrepancyRepository(pauseThingsLock(h.runtime, gate.promise, reached.resolve)).supersede(h.ctx, job,
      { commandId: commandB, originalFactRevisionId: original!, replacementFactRevisionId: two!, expectedRevision: 1 });
    // Attach an error observer immediately and release B even if A fails.
    void b.catch(() => undefined);
    let a;
    try {
      await reached.promise;
      a = await h.repos.checks.supersede(h.ctx, job, { commandId: randomUUID(), originalFactRevisionId: original!, replacementFactRevisionId: one!, expectedRevision: 0 });
    } finally { gate.resolve(); }
    const result = await b;
    expect(a.confirmedBillReductionPence).toBe(5000);
    expect((await h.admin.query("SELECT revision FROM app.supplier_bill_supersession WHERE tenant_id=$1 AND command_id=$2", [h.tenant, commandB])).rows[0].revision).toBe(2);
    expect(result.confirmedBillReductionPence).toBe(7000);
    expect((await h.repos.checks.view(h.ctx, job)).confirmedBillReductionPence).toBe(7000);
  });

  it("match correction invalidates the previous actionable finding", async () => {
    const job = await h.live(), findingId = await h.pre.finding(job), { checks, match } = h.repos;
    expect((await checks.view(h.ctx, job)).finding).toMatchObject({ state: "actionable", totalPence: 9000 });
    const before = await match.view(h.ctx, job);
    await match.correct(h.ctx, job, h.correction(before.proposal, randomUUID(), before.revision, "6"));
    expect((await checks.view(h.ctx, job)).finding).toMatchObject({ id: findingId, state: "superseded", totalPence: 9000 });
    await expect(checks.review(h.ctx, job, { commandId: randomUUID(), findingId, expectedRevision: 0, outcome: "disputed", reason: "Synthetic correction" })).rejects.toThrow("FINDING_SUPERSEDED");
    expect(await count("discrepancy_review_outcome", job)).toBe(0);
    const evaluated = await checks.evaluate(h.ctx, job, { commandId: randomUUID(), ruleRevision: h.RULE });
    const corrected = (await h.admin.query("SELECT id FROM app.supplier_match_revision WHERE tenant_id=$1 AND job_id=$2 AND proposal_id=$3 AND revision=$4", [h.tenant, job, before.proposal.id, before.revision + 1])).rows[0].id;
    expect(evaluated.finding).toMatchObject({ state: "actionable", totalPence: 13000, matchRevisionId: corrected });
    expect(evaluated.finding!.id).not.toBe(findingId);
  });

  it("evaluates confirmed fractional quantities", async () => {
    const job = await h.live(); await h.pre.delivery(job);
    await confirmFixture(job, "materials-B-invoice", 1, "2.5", 2500, 6250);
    const { match, checks } = h.repos;
    const created = await match.create(h.ctx, job, { commandId: randomUUID(), expectedRevision: 0 });
    await match.correct(h.ctx, job, h.correction(created.proposal, randomUUID(), created.revision, "2.5"));
    const result = await checks.evaluate(h.ctx, job, { commandId: randomUUID(), ruleRevision: h.RULE });
    expect(result.finding).toMatchObject({ state: "actionable", pricePence: 1250, quantityPence: 0, totalPence: 1250 });
    const persisted = (await h.admin.query("SELECT price_pence,quantity_pence,total_pence,match_revision_id FROM app.discrepancy_finding_revision WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [h.tenant, job, result.finding!.id])).rows[0];
    expect(persisted).toMatchObject({ price_pence: "1250", quantity_pence: "0", total_pence: "1250", match_revision_id: result.finding!.matchRevisionId });
  });
});
