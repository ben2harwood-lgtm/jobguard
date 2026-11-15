import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billingImportCommandV1, billingStatusV1, deriveUnambiguousBilling, normalizeBillingStatus, type BillingStatus } from "@jobguard/core";
import { EnterpriseFeeRepository, withTenant } from "../src/index.js";
import { canonicalJson } from "../src/work-order-repository.js";
import { cluster, code, world, type World } from "./contractor-billing-fixtures.js";
import { reference } from "./enterprise-fee-reference-fixtures.js";
import { digestOf } from "./contractor-practice-session-fixtures.js";
import { newJob } from "./extra-approval-chain-fixtures.js";

function inconsistentPayment(invoice: BillingStatus): BillingStatus {
  // Schema-valid, fully matched payment exceeds the invoice's outstanding
  // balance. Unlike composition ambiguity, this is a malformed derivation.
  return billingStatusV1.parse({ ...invoice, sourceEventId: randomUUID(), factType: "paid",
    effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: randomUUID(),
    amount: { netPence: invoice.amount.netPence + 1, vatPence: invoice.amount.vatPence,
      grossPence: invoice.amount.grossPence + 1 } });
}

it("schema-valid inconsistent movement throws BillingDataError rather than returning a held projection", () => {
  const invoice = billingStatusV1.parse({ version: "billing-status.v1", clientContractId: randomUUID(),
    source: "fictional", sourceEventId: "invoice", invoiceNumber: "INV", factType: "invoiced",
    effectiveAt: "2026-10-02T12:00:00Z", remittanceReference: null, reconciliationId: null,
    originalEventId: null, amount: { netPence: 1000, vatPence: 200, grossPence: 1200 },
    composition: { declared: { netPence: 1000, vatPence: 200, grossPence: 1200 }, lines: [
      { externalInvoiceLineId: "order", kind: "original_order", existedAt: "2026-10-01T00:00:00Z",
        netPence: 1000, vatPence: 200, grossPence: 1200, match: null },
    ] }, explicit: null, separateInvoice: false, lineAdjustments: [] });
  expect(() => deriveUnambiguousBilling([invoice, inconsistentPayment(invoice)])).toThrowError("BILLING_INVALID");
});

describe("LATER-SAFETY-152 real PostgreSQL atomic import failure", () => {
  let c: Awaited<ReturnType<typeof cluster>>;
  beforeAll(async () => { c = await cluster(); }, 240000);
  afterAll(async () => { await c?.close(); });

  // Compare complete rows, including history, hashes and IDs, not just balances.
  // Snapshot the whole tenant so a cross-job partial write cannot hide.
  const tables = ["app.command_receipt", "app.billing_status_import", "app.billing_fact", "app.billing_line_match",
    "app.billing_quarantine", "app.billing_allocation_run", "app.billing_application_event",
    "app.contractor_receipt_line_allocation", "app.extra_event", "app.audit_event", "audit_control.audit_head",
    "app.enterprise_fee_derivation", "app.enterprise_fee_contribution", "app.enterprise_fee_statement",
    "app.enterprise_fee_statement_section", "app.enterprise_fee_statement_approval",
    "app.platform_enterprise_fee", "app.platform_enterprise_fee_line"];
  async function snapshot(w: World) {
    return Object.fromEntries(await Promise.all(tables.map(async table => [table,
      (await c.admin.query(`SELECT coalesce(jsonb_agg(r ORDER BY r::text),'[]'::jsonb) rows
        FROM (SELECT to_jsonb(t) r FROM ${table} t WHERE tenant_id=$1) q`, [w.w.p.tenantId])).rows[0].rows,
    ])));
  }
  const importEvents = (w: World, events: unknown[]) => w.repo.import(w.ctx, w.session, w.s.jobId, w.importInput(events));
  async function setupPaid() {
    const w = await world(c), invoice = billingStatusV1.parse({ ...await w.invoice(), invoiceNumber: "Z-ENT-F2" });
    const payment = w.event("paid", { invoiceNumber: invoice.invoiceNumber, effectiveAt: "2026-10-03T12:00:00Z",
      reconciliationId: randomUUID(), amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
    await importEvents(w, [invoice, payment]);
    return { w, invoice };
  }

  // This rollback-only probe proves the schema-valid input gets past authority,
  // ingest and matching. It uses actual SQL routines and the actual pure module.
  // In the multi-group case it persists the first group's projection before the
  // second group throws. Nothing from the probe is allowed to commit.
  async function probe(w: World, raw: ReturnType<World["importInput"]>, expectedGroups: string[]) {
    const parsed = billingImportCommandV1.parse(raw);
    const payload = { ...parsed, events: parsed.events.map(e => normalizeBillingStatus(e).event) };
    const derived: string[] = [];
    await expect(withTenant(c.runtime, w.ctx, async db => {
      await db.$client.query("SELECT app.cb_begin($1,$2,$3,'ImportBillingStatus',$4::jsonb)",
        [w.session, w.s.jobId, parsed.commandId, canonicalJson(payload)]);
      await db.$client.query("SELECT app.cb_ingest($1,$2,$3,$4::jsonb)",
        [w.session, w.s.jobId, parsed.commandId, canonicalJson(payload)]);
      const groups = (await db.$client.query("SELECT app.cb_inputs($1,$2) groups", [w.session, w.s.jobId])).rows[0].groups as {
        source: string; invoiceNumber: string; inputHash: string;
        facts: { payload: BillingStatus; match_valid: boolean; ambiguous: boolean }[];
      }[];
      expect(groups.map(g => g.invoiceNumber)).toEqual(expectedGroups);
      expect(groups.flatMap(g => g.facts).every(f => f.match_valid && !f.ambiguous)).toBe(true);
      for (const g of groups) {
        const projection = deriveUnambiguousBilling(g.facts.map(f => f.payload));
        await db.$client.query("SELECT app.cb_derive($1,$2,$3,$4,$5,$6,$7::jsonb)",
          [w.session, w.s.jobId, parsed.commandId, g.source, g.invoiceNumber, g.inputHash, canonicalJson(projection)]);
        derived.push(g.invoiceNumber);
      }
    })).rejects.toMatchObject({ name: "BillingDataError", code: "BILLING_INVALID" });
    expect(derived).toEqual(expectedGroups.slice(0, -1));
  }

  it("retains ENT-F2 qualifying principal and the posted 806p fee after a malformed additional movement", async () => {
    const { w, invoice } = await setupPaid(), repo = new EnterpriseFeeRepository(c.runtime), id = randomUUID();
    // Existing ENT-F2 agreement/reference fixtures; operations setup only.
    await c.admin.query(`INSERT INTO app.enterprise_agreement_version(tenant_id,id,agreement_ref,rate_numerator,rate_denominator,basis,policy_version,effective_from,end_of_job_check,content_hash,environment,operations_actor_ref)
      VALUES($1,$2,'fictional-import-failure',1,10,'on_payment','enterprise_site_capture_policy_v1','2000-01-01T00:00:00Z',false,$3,'synthetic_demo','operations:fictional')`,
      [w.w.p.tenantId, id, "c".repeat(64)]);
    const period = (await c.admin.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'Europe/London','YYYY-MM') p")).rows[0].p as string;
    const derive = async (p: string) => {
      const r = await repo.derive(w.ctx, w.session, { version: "enterprise-fee-derive.v1", commandId: randomUUID(), agreementVersionId: id, period: p });
      return repo.read(w.ctx, w.session, r.derivationId);
    };
    const first = await derive(period), ref = reference({ w, id }, [{ approved: 24000, billed: 24000, paid: { numerator: "250000", denominator: "31" } }]);
    expect(first.qualifyingPrincipal).toEqual({ numerator: "250000", denominator: "31" });
    expect(first.cumulativeFeePence).toBe(ref.cumulativeFee.pence);
    expect(first.cumulativeFeePence).toBe(806);
    const { statementId } = await repo.prepareStatement(w.ctx, w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period });
    const statement = await repo.readStatement(w.ctx, w.session, statementId);
    const { authorizationId } = await repo.approveStatement(w.ctx, w.session, { version: "enterprise-fee-approve-statement.v1", commandId: randomUUID(), statementId,
      contentHash: statement.contentHash, totalDeltaPence: statement.totalDeltaPence, expiresAt: new Date(Date.now() + 600000).toISOString() });
    await repo.postStatement(w.ctx, w.session, { version: "enterprise-fee-post-statement.v1", commandId: randomUUID(), statementId, authorizationId });
    const posted = await repo.readPostings(w.ctx, w.session, statementId);
    expect(posted).toEqual([expect.objectContaining({ kind: "accrual", amountPence: 806 })]);
    const before = await snapshot(w), view = await w.repo.read(w.ctx, w.session, w.s.jobId);
    const bad = w.importInput([inconsistentPayment(invoice)]);
    await probe(w, bad, [invoice.invoiceNumber]);
    expect(await snapshot(w)).toEqual(before);
    expect(await code(w.repo.import(w.ctx, w.session, w.s.jobId, bad))).toBe("BILLING_INVALID");
    expect(await snapshot(w)).toEqual(before);
    expect(await w.repo.read(w.ctx, w.session, w.s.jobId)).toEqual(view);
    const [year, month] = period.split("-").map(Number) as [number, number];
    const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
    expect(await derive(next)).toMatchObject({ qualifyingPrincipal: first.qualifyingPrincipal, cumulativeFeePence: 806 });
    const later = await repo.prepareStatement(w.ctx, w.session, { version: "enterprise-fee-prepare-statement.v1", commandId: randomUUID(), period: next });
    const laterStatement = await repo.readStatement(w.ctx, w.session, later.statementId);
    expect(laterStatement.totalDeltaPence).toBe(0);
    expect(laterStatement.sections).toEqual([expect.objectContaining({ priorNetPostedPence: 806, deltaPence: 0 })]);
    expect(await repo.readPostings(w.ctx, w.session, later.statementId)).toEqual([]);
    expect(await repo.readPostings(w.ctx, w.session, statementId)).toEqual(posted);
  });

  it("rolls back every invoice group, then accepts corrected input with the unconsumed command ID", async () => {
    const { w, invoice } = await setupPaid();
    const ordinary = w.event("invoiced", { invoiceNumber: "A-ordinary", amount: { netPence: 1000, vatPence: 200, grossPence: 1200 },
      composition: { declared: { netPence: 1000, vatPence: 200, grossPence: 1200 }, lines: [
        { externalInvoiceLineId: "ordinary", kind: "original_order", existedAt: "2026-10-01T00:00:00Z", netPence: 1000, vatPence: 200, grossPence: 1200, match: null },
      ] } });
    const bad = inconsistentPayment(invoice), command = w.importInput([ordinary, bad]), before = await snapshot(w);
    await probe(w, command, ["A-ordinary", invoice.invoiceNumber]);
    expect(await snapshot(w)).toEqual(before);
    expect(await code(w.repo.import(w.ctx, w.session, w.s.jobId, command))).toBe("BILLING_INVALID");
    expect(await snapshot(w)).toEqual(before);
    const corrected = { ...command, events: [ordinary, { ...bad, amount: { netPence: 1000, vatPence: 200, grossPence: 1200 } }] };
    const result = await w.repo.import(w.ctx, w.session, w.s.jobId, corrected), after = await snapshot(w);
    expect(await w.repo.import(w.ctx, w.session, w.s.jobId, corrected)).toEqual(result);
    expect(await snapshot(w)).toEqual(after);
    expect(await code(w.repo.import(w.ctx, w.session, w.s.jobId, { ...corrected, transport: "csv" }))).toBe("BILLING_CONFLICT");
    expect(await snapshot(w)).toEqual(after);
    expect((await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices).toHaveLength(2);
  });

  it("keeps a policy-held payment held while preserving the last valid projection", async () => {
    const { w, invoice } = await setupPaid();
    const before = (await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices[0]!;
    const composition = structuredClone(invoice.composition)!;
    composition.lines[0]!.existedAt = "2026-10-01T00:00:01Z";
    const heldPayment = billingStatusV1.parse(w.event("paid", { invoiceNumber: invoice.invoiceNumber,
      effectiveAt: "2026-10-04T12:00:00Z", reconciliationId: randomUUID(), composition,
      amount: { netPence: 1000, vatPence: 200, grossPence: 1200 } }));
    const priorPayment = (await c.admin.query("SELECT payload FROM app.billing_fact WHERE tenant_id=$1 AND payload->>'factType'='paid'", [w.w.p.tenantId])).rows[0].payload as BillingStatus;
    expect(() => deriveUnambiguousBilling([invoice, priorPayment, heldPayment])).toThrowError("BILLING_POLICY_HELD");
    const command = w.importInput([heldPayment]);
    const result = await w.repo.import(w.ctx, w.session, w.s.jobId, command);
    const after = await w.repo.read(w.ctx, w.session, w.s.jobId), current = after.invoices[0]!;
    expect(current.runId).not.toBe(before.runId);
    expect(current.projection).toEqual({ ...before.projection, held: [invoice, priorPayment, heldPayment]
      .map(e => ({ sourceEventId: e.sourceEventId, reason: "COMPOSITION_REQUIRED" }))
      .sort((a, b) => a.sourceEventId.localeCompare(b.sourceEventId)) });
    expect(current.projection.totals.matchedExtraNet).toEqual({ numerator: "250000", denominator: "31" });
    const fact = (await c.admin.query("SELECT id FROM app.billing_fact WHERE tenant_id=$1 AND source_event_id=$2", [w.w.p.tenantId, heldPayment.sourceEventId])).rows[0];
    expect(after.quarantine).toContainEqual({ fact_id: fact.id, reason: "COMPOSITION_REQUIRED" });
    const saved = await snapshot(w);
    expect(await w.repo.import(w.ctx, w.session, w.s.jobId, command)).toEqual(result);
    expect(await snapshot(w)).toEqual(saved);
  });

  it("keeps a genuinely empty first invoice, missing prerequisites, ambiguous and quarantined facts successful", async () => {
    const w = await world(c), invoice = await w.invoice();
    await importEvents(w, [w.event("invoiced", { invoiceNumber: "EMPTY" })]);
    expect((await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices[0]!.projection).toMatchObject({ lines: [], allocations: [], held: [expect.objectContaining({ reason: "COMPOSITION_REQUIRED" })] });
    const payment = w.event("paid", { effectiveAt: "2026-10-03T12:00:00Z", reconciliationId: randomUUID(), amount: { netPence: 41667, vatPence: 8333, grossPence: 50000 } });
    await importEvents(w, [payment]);
    expect((await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices.find(i => i.invoiceNumber === invoice.invoiceNumber)!.projection.held).toContainEqual({ sourceEventId: payment.sourceEventId, reason: "INVOICE_REQUIRED" });
    await importEvents(w, [invoice]);
    expect((await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices.find(i => i.invoiceNumber === invoice.invoiceNumber)!.projection.totals.matchedExtraNet).toEqual({ numerator: "250000", denominator: "31" });
    // A conflicting observation is deliberately returned as ambiguous by cb_inputs.
    await importEvents(w, [{ ...payment, sourceEventId: randomUUID(), amount: { netPence: 1000, vatPence: 200, grossPence: 1200 } }]);
    const view = await w.repo.read(w.ctx, w.session, w.s.jobId);
    expect(view.invoices.find(i => i.invoiceNumber === invoice.invoiceNumber)!.projection.held).toHaveLength(2);
    await importEvents(w, [{ ...invoice, sourceEventId: randomUUID(), invoiceNumber: "QUARANTINED" }]);
    expect((await w.repo.read(w.ctx, w.session, w.s.jobId)).quarantine).toContainEqual(expect.objectContaining({ reason: "EXPORT_LINE_ALREADY_MATCHED" }));
  });

  for (const kind of ["credited", "rejected", "payment_reversed"] as const) it(`preserves legitimate ${kind} movement behavior`, async () => {
    const { w, invoice } = await setupPaid();
    const payment = (await c.admin.query("SELECT payload FROM app.billing_fact WHERE tenant_id=$1 AND payload->>'factType'='paid'", [w.w.p.tenantId])).rows[0].payload as BillingStatus;
    await importEvents(w, [w.event(kind, { invoiceNumber: invoice.invoiceNumber, effectiveAt: "2026-10-04T12:00:00Z",
      originalEventId: kind === "payment_reversed" ? payment.sourceEventId : invoice.sourceEventId,
      reconciliationId: kind === "payment_reversed" ? randomUUID() : null,
      amount: kind === "payment_reversed" ? payment.amount : { netPence: 1000, vatPence: 200, grossPence: 1200 },
      lineAdjustments: kind === "payment_reversed" ? [] : [{ externalInvoiceLineId: "extra", netPence: 1000, vatPence: 200, grossPence: 1200 }] })]);
    const projection = (await w.repo.read(w.ctx, w.session, w.s.jobId)).invoices[0]!.projection;
    expect(projection.held).toEqual([]);
    if (kind === "credited") expect(projection.totals.creditedNet).toEqual({ numerator: "1000", denominator: "1" });
    if (kind === "rejected") expect(projection.lines.find(l => l.lineId === "extra")!.rejected).toBe(true);
    if (kind === "payment_reversed") expect(projection.totals.matchedExtraNet).toEqual({ numerator: "0", denominator: "1" });
  });

  it("refuses non-finance and foreign tenant/job imports with otherwise valid data and no writes", async () => {
    const { w, invoice } = await setupPaid(), foreign = await world(c), otherJob = await newJob(c, w.w);
    const supervisorSession = randomUUID(), supervisor = w.w.members.supervisor.member;
    await c.admin.query(`INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id,session_digest,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,clock_timestamp(),clock_timestamp()+interval '1 hour')`,
      [supervisorSession, w.w.p.tenantId, supervisor.membershipId, supervisor.identityUserId, digestOf(supervisorSession)]);
    const valid = w.importInput([{ ...inconsistentPayment(invoice), amount: { netPence: 1000, vatPence: 200, grossPence: 1200 } }]);
    expect(billingImportCommandV1.safeParse(valid).success).toBe(true);
    const before = await snapshot(w), foreignBefore = await snapshot(foreign);
    expect(await code(w.repo.import(w.ctx, supervisorSession, w.s.jobId, valid))).toBe("BILLING_FORBIDDEN");
    expect(await code(w.repo.import(foreign.ctx, foreign.session, w.s.jobId, valid))).toBe("BILLING_NOT_FOUND");
    // Existing source-event IDs cannot be rebound to another job, even in one tenant.
    expect(await code(w.repo.import(w.ctx, w.session, otherJob, w.importInput([invoice])))).toBe("BILLING_CONFLICT");
    expect(await snapshot(w)).toEqual(before);
    expect(await snapshot(foreign)).toEqual(foreignBefore);
  });
});
