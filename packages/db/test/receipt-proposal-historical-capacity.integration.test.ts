// CI ONLY: genuine synthetic writers and PostgreSQL; no providers or live money.
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { type NeutralReceiptFactResult } from "../src/receipt-line-allocation-repository.js";
import { bindIssuedCredential } from "../src/tenant-context.js";
import { closeFinalCheckFixture, createFinalCheckFixture, type FinalCheckFixture } from "./final-check-fixture.js";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let f: FinalCheckFixture;
const environment = process.env.JOBGUARD_ENV;
const version = "receipt-line-allocation-command.v1";
beforeAll(async () => { f = await createFinalCheckFixture(); }, 120000);
afterAll(async () => {
  await closeFinalCheckFixture(f);
  if (environment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = environment;
});
type Fixture = Awaited<ReturnType<typeof realReceiptFixture>>;
const execute = (x: Fixture, p: unknown) => x.producer.command(x.context, x.actor, x.auth.digest, x.jobId, p);
async function reviewCommand(x: Fixture, paymentId: string) {
  const current = await x.producer.readCurrent(x.context, x.actor, x.auth.digest, { jobId: x.jobId });
  return { version, action: "review", commandId: randomUUID(), expectedSourceRevision: current.revision, paymentId };
}
const approval = (r: NeutralReceiptFactResult, action = "approve") => ({
  version, action, commandId: randomUUID(), expectedSourceRevision: r.sourceRevision,
  reviewId: r.reviewId, approvalHash: r.approvalHash,
});
async function snapshot(x: Fixture) {
  const result: Record<string, unknown> = {};
  // Include immutable input money, decisions, execution and audit facts as well
  // as distributions: failed review must not leave even a new Decision behind.
  for (const table of ["customer_invoice", "customer_payment", "customer_payment_reversal", "customer_credit_note",
    "final_account_invoiced_line", "receipt_allocation_fact_command", "receipt_allocation_fact_review",
    "receipt_allocation_fact_revision", "receipt_allocation_fact_source", "receipt_allocation_fact_line"] as const) {
    result[table] = (await f.admin.query(`SELECT row_to_json(r)::text bytes FROM app.${table} r
      WHERE tenant_id=$1 AND job_id=$2 ORDER BY row_to_json(r)::text`, [x.context.tenantId, x.jobId])).rows;
  }
  for (const table of ["decision", "decision_resolution", "action_authorization", "audit_event"] as const) {
    result[table] = (await f.admin.query(`SELECT row_to_json(r)::text bytes FROM app.${table} r
      WHERE tenant_id=$1 ORDER BY row_to_json(r)::text`, [x.context.tenantId])).rows;
  }
  return result;
}
async function reverse(x: Fixture, kind: "payment_reversal" | "credit_note", netPence = 80000) {
  let sourceId: string;
  if (kind === "payment_reversal") {
    await x.invoices.reverseReceipt(x.context, {
      jobId: x.jobId, invoiceId: x.invoiceId, paymentId: x.paymentId,
      actorMembershipId: x.actor.membershipId, commandId: randomUUID(), reason: "Fictional refund",
    });
    sourceId = (await f.admin.query("SELECT id FROM app.customer_payment_reversal WHERE tenant_id=$1 AND payment_id=$2",
      [x.context.tenantId, x.paymentId])).rows[0].id;
  } else {
    const input = { jobId: x.jobId, invoiceId: x.invoiceId, netPence, reason: "Fictional item credit" };
    const preview = await x.invoices.previewCredit(x.context, input);
    sourceId = (await x.invoices.issueCredit(x.context, {
      ...input, actorMembershipId: x.actor.membershipId, commandId: randomUUID(), previewHash: preview.previewHash,
    })).creditNoteId;
  }
  const current = await x.producer.readCurrent(x.context, x.actor, x.auth.digest, { jobId: x.jobId });
  // Gross is confirmation of the stored source, never a requested allocation size.
  const grossPence = kind === "payment_reversal"
    ? Number(BigInt(x.produced.input.receipt.gross.numerator) / BigInt(x.produced.input.receipt.gross.denominator))
    : Number(BigInt(netPence) * 6n / 5n);
  const request = {
    version, action: "review_reverse", commandId: randomUUID(), expectedSourceRevision: current.revision,
    allocationRevisionId: x.produced.allocationRevisionId, reversalSource: { kind, sourceId }, grossPence,
  };
  await expect(execute(x, { ...request, commandId: randomUUID(), grossPence: grossPence + 1 }))
    .rejects.toThrow("RECEIPT_LINE_REVERSAL_AMOUNT_CHANGED");
  const review = await execute(x, request);
  expect(await execute(x, request)).toEqual({ ...review, replayed: true });
  const command = approval(review, "reverse"), saved = await execute(x, command);
  expect(await execute(x, command)).toEqual({ ...saved, replayed: true });
  await expect(execute(x, { ...command, approvalHash: "b".repeat(64) }))
    .rejects.toThrow("RECEIPT_LINE_IDEMPOTENCY_CONFLICT");
  const after = await x.producer.readCurrent(x.context, x.actor, x.auth.digest, { jobId: x.jobId });
  await expect(execute(x, { ...request, commandId: randomUUID(), expectedSourceRevision: after.revision }))
    .rejects.toThrow("RECEIPT_LINE_NOT_AVAILABLE");
  for (const line of saved.lines) {
    expect(BigInt(line.gross.numerator)).toBeLessThan(0n);
    expect(line.reversesLineAllocationId).toBeTruthy();
  }
  return saved;
}
async function refuseAtomically(x: Fixture, paymentId: string, error: string) {
  const request = await reviewCommand(x, paymentId), before = await snapshot(x);
  await expect(execute(x, request)).rejects.toMatchObject({ code: "23514", message: error });
  expect(await snapshot(x)).toEqual(before);
  return request;
}

it("refuses a replacement at review after a fully allocated line is refunded, before any approval facts", async () => {
  const x = await realReceiptFixture(f, "F7", version);
  expect(x.fact.gross).toEqual({ numerator: "96000", denominator: "1" });
  expect(x.fact.originalLineGrossPence).toBe(96000);
  const positive = await snapshot(x);
  const negative = await reverse(x, "payment_reversal");
  expect(negative.lines[0]).toMatchObject({ gross: { numerator: "-96000", denominator: "1" }, reversesLineAllocationId: x.fact.lineAllocationId });
  const paymentId = await x.receipt(48000, "receipt-480-a");
  const request = await refuseAtomically(x, paymentId, "RECEIPT_LINE_CAPACITY_EXCEEDED");
  expect((await snapshot(x)).customer_invoice).toEqual(positive.customer_invoice);
  expect((await f.admin.query(`SELECT row_to_json(l)::text bytes FROM app.receipt_allocation_fact_line l
    WHERE tenant_id=$1 AND job_id=$2 AND reverses_line_allocation_id IS NULL ORDER BY row_to_json(l)::text`,
    [x.context.tenantId, x.jobId])).rows).toEqual(positive.receipt_allocation_fact_line);

  // Disposable mutation removes just the new bound. The same early-refusal
  // assertion must fail; rollback restores the function before any further test.
  const sql = await readFile(new URL("../migrations/0747_receipt_proposal_historical_capacity.sql", import.meta.url), "utf8");
  const start = sql.indexOf("CREATE OR REPLACE FUNCTION"), end = sql.indexOf("END $$;", start) + "END $$;".length;
  const body = sql.slice(start, end);
  const checkStart = body.indexOf("  -- Historical positive capacity,"), checkEnd = body.indexOf("  g:=gcd(gn,gd);", checkStart);
  expect(checkStart).toBeGreaterThan(0); expect(checkEnd).toBeGreaterThan(checkStart);
  const db = await f.admin.connect();
  try {
    await db.query("BEGIN");
    await bindIssuedCredential(db,x.context);
    await db.query("SELECT set_config('app.tenant_id',$1,true)", [x.context.tenantId]);
    await db.query("SELECT set_config('app.practice_material_digest',$1,true)", [x.auth.digest]);
    await db.query(body.slice(0, checkStart) + body.slice(checkEnd));
    const probe = () => expect(db.query("SELECT app.receipt_fact_proposal($1,$2,$3::jsonb)",
      [x.context.tenantId, x.jobId, request])).rejects.toMatchObject({ code: "23514", message: "RECEIPT_LINE_CAPACITY_EXCEEDED" });
    await expect(probe()).rejects.toThrow(/resolved/u);
  } finally { await db.query("ROLLBACK"); db.release(); }
  await refuseAtomically(x, paymentId, "RECEIPT_LINE_CAPACITY_EXCEEDED");
});

it.each([20000, 80000])("keeps the earlier credit-composition refusal after a genuine %i net linked credit", async netPence => {
  const x = await realReceiptFixture(f, "F7", version), negative = await reverse(x, "credit_note", netPence);
  expect(negative.lines).toHaveLength(1);
  expect(negative.lines[0]!.net).toEqual({ numerator: String(-netPence), denominator: "1" });
  const paymentId = await x.receipt(48000, "receipt-480-a");
  // Credit changes commercial composition; preserving rule priority is required.
  await refuseAtomically(x, paymentId, "RECEIPT_LINE_CREDIT_COMPOSITION_REQUIRED");
});

it("refuses exact fractional pro-rata replacement shares that exceed historical positives", async () => {
  // £100 baseline + £800 catch, gross £1080. A £480 first payment
  // allocates 128000/3 pence to the catch, with no deemed-net rounding.
  const x = await realReceiptFixture(f, "F7", 10000, false, version, undefined, { combined: true, partial: true });
  expect(x.fact.gross).toEqual({ numerator: "128000", denominator: "3" });
  expect(x.fact.net).toEqual({ numerator: "320000", denominator: "9" });
  await reverse(x, "payment_reversal");
  const paymentId = await x.receipt(96000, "receipt-960");
  await refuseAtomically(x, paymentId, "RECEIPT_LINE_CAPACITY_EXCEEDED");
});

it("still reviews and saves identical exact shares when historical positive capacity remains", async () => {
  const x = await realReceiptFixture(f, "F7", 100000, false, version, undefined, { combined: true, partial: true });
  await reverse(x, "payment_reversal");
  const paymentId = await x.receipt(96000, "receipt-960"), request = await reviewCommand(x, paymentId);
  const reviewed = await execute(x, request);
  expect(reviewed.lines.find(l => l.lineId === x.line)).toMatchObject({
    rule: "pro_rata", gross: { numerator: "128000", denominator: "3" }, net: { numerator: "320000", denominator: "9" },
  });
  const command = approval(reviewed), saved = await execute(x, command);
  expect(saved.lines).toEqual(reviewed.lines);
  expect(saved.input).toEqual(reviewed.input);
  const stored = (await f.admin.query(`SELECT l.line_id, l.gross_numerator, l.gross_denominator, l.net_numerator, l.net_denominator
    FROM app.receipt_allocation_fact_line l JOIN app.receipt_allocation_fact_source s
      ON (s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.source_id)
    WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.allocation_revision_id=$3 ORDER BY l.line_id`,
    [x.context.tenantId, x.jobId, saved.allocationRevisionId])).rows;
  expect(stored).toEqual(reviewed.lines.map(l => ({
    line_id: l.lineId, gross_numerator: l.gross.numerator, gross_denominator: l.gross.denominator,
    net_numerator: l.net.numerator, net_denominator: l.net.denominator,
  })).sort((a, b) => a.line_id.localeCompare(b.line_id)));
  expect(await execute(x, command)).toEqual({ ...saved, replayed: true });
  await expect(execute(x, { ...command, approvalHash: "b".repeat(64) })).rejects.toThrow("RECEIPT_LINE_IDEMPOTENCY_CONFLICT");
});

it("retains job/tenant, stale source/approval and concurrent alternate allocation refusals", async () => {
  const x = await realReceiptFixture(f, "F7", 3360000, false, version, undefined, { partial: true });
  const other = await realReceiptFixture(f, "F7", version);
  const paymentId = await x.receipt(48000, "receipt-480-b"), request = await reviewCommand(x, paymentId);
  await expect(execute(other, await reviewCommand(other, paymentId))).rejects.toThrow("RECEIPT_LINE_FORBIDDEN");
  await expect(x.producer.command(testTenantContext(randomUUID()), x.actor, x.auth.digest, x.jobId, request)).rejects.toThrow();
  await expect(execute(x, { ...request, expectedSourceRevision: request.expectedSourceRevision + 1 })).rejects.toThrow("RECEIPT_LINE_SOURCE_CHANGED");
  const a = await execute(x, request), b = await execute(x, { ...request, commandId: randomUUID() });
  await expect(execute(x, { ...approval(a), approvalHash: "b".repeat(64) })).rejects.toThrow("RECEIPT_LINE_APPROVAL_CHANGED");
  const outcomes = await Promise.allSettled([execute(x, approval(a)), execute(x, approval(b))]);
  expect(outcomes.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(outcomes.filter(r => r.status === "rejected")).toHaveLength(1);
  await expect(execute(x, { ...request, commandId: randomUUID() })).rejects.toThrow("RECEIPT_LINE_SOURCE_CHANGED");
  const rejected = outcomes.find(r => r.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "40001", message: "RECEIPT_LINE_SOURCE_CHANGED" });
  expect((await f.admin.query(`SELECT count(*)::int n FROM app.receipt_allocation_fact_revision
    WHERE tenant_id=$1 AND job_id=$2 AND payment_id=$3 AND direction='receipt'`,
    [x.context.tenantId, x.jobId, paymentId])).rows).toEqual([{ n: 1 }]);
});

it("rejects an approval whose source watermark changes without an allocation revision", async () => {
  const x = await realReceiptFixture(f, "F7", 3360000, false, version, undefined, { partial: true });
  const paymentId = await x.receipt(48000, "receipt-480-b");
  const review = await execute(x, await reviewCommand(x, paymentId));
  // An unmatched payment changes the bound source hash, but not the revision.
  await x.invoices.recordReceipt(x.context, {
    jobId: x.jobId, invoiceId: x.invoiceId, actorMembershipId: x.actor.membershipId,
    commandId: randomUUID(), paidOn: "2026-10-28", amountPence: 38400,
    method: "bank_transfer", reference: "Fictional new source after review",
  });
  const before = await snapshot(x);
  await expect(execute(x, approval(review))).rejects.toThrow("RECEIPT_LINE_APPROVAL_CHANGED");
  expect(await snapshot(x)).toEqual(before);
});
