import { describe, expect, it } from "vitest";
import { FakeFinancialReconciliationRunner, reconcileFinancialSnapshot, reconciliationAdjustmentHash, type ReconciliationAuthority } from "./financial-reconciliation.js";
import { MAX_MONEY_PENCE } from "./money.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const scope = { tenantId: id(1), jobId: id(2) };
const invoiceId = id(3), revision = id(4);
const provider = (n: number, kind: "payment" | "refund" | "fee" | "payout" | "bank", amount: number, parentId: string | null = id(10)) => ({ ...scope, id: id(n), effectId: id(n+100), invoiceId, kind, amount, parentId, late: false });
const journal = (n: number, kind: "payment" | "refund" | "fee" | "payout" | "allocation" | "allocation_reversal" | "reservation" | "release", amount: number, sourceId: string) => ({ ...scope, id: id(n), invoiceId, kind, amount, sourceId });
const fixture = () => ({ version: "financial-reconciliation-snapshot.v1", environment: "synthetic_demo", ...scope,
 invoices: [{ ...scope,id: invoiceId,revision,net: 10000,vat: 2000,gross: 12000 }],
 provider: [provider(10,"payment",12000,null),provider(11,"fee",200),provider(12,"payout",11800),provider(13,"bank",11800,id(12))],
 journals: [journal(20,"payment",12000,id(10)),journal(21,"fee",200,id(11)),journal(22,"payout",11800,id(12)),journal(23,"allocation",10000,id(10)),journal(24,"reservation",2000,id(10))],
});
const auth = (overrides: Partial<ReconciliationAuthority> = {}): ReconciliationAuthority => ({ ...scope,actorId: id(5),currentMember: true,canRun: true,canAdjust: true,approves: () => false,...overrides });
const run = (n = 50, trigger = "on_demand", day = "2026-10-29") => ({ version: "financial-reconciliation-run.v1",environment: "synthetic_demo",...scope,commandId: id(n),trigger,day });
const codes = (raw: unknown) => reconcileFinancialSnapshot(raw).queue.map(i => i.code);
const adjustment = (reportHash: string) => ({ version: "financial-reconciliation-adjustment.v1",...scope,commandId: id(60),reportHash,invoiceRevision: revision,fact: journal(25,"fee",200,id(11)) });

describe("M4-17 dark operational reconciliation", () => {
 it("explains gross, VAT, provider fee, net payout, bank, allocations and reservations independently", () => {
  const f = fixture(), before = JSON.stringify(f), r = reconcileFinancialSnapshot(f);
  expect(r).toMatchObject({ productionEnabled: false,referenceOnly: true,authoritativeSourceVerification: false,realExternalActions: 0,queue: [],balances: {
   invoicedNet: { pence: 10000 },vat: { pence: 2000 },grossCharged: { pence: 12000 },providerFees: { pence: 200 },netPayout: { pence: 11800 },bankObserved: { pence: 11800 },allocated: { pence: 10000 },reserved: { pence: 2000 },outstandingClearing: { pence: 0 },
  }});
  expect(JSON.stringify(f)).toBe(before);
 });
 it("canonical hashes survive ordering; a changed invoice revision changes the binding", () => {
  const f = fixture(), a = reconcileFinancialSnapshot(f); f.journals.reverse(); f.provider.reverse();
  expect(reconcileFinancialSnapshot(f)).toEqual(a);
  f.invoices[0]!.revision = id(99); expect(reconcileFinancialSnapshot(f).sourceHash).not.toBe(a.sourceHash);
 });
 it("surfaces partial payouts, missing bank observations and outstanding clearing", () => {
  const f = fixture(); f.provider[2]!.amount = 5000; f.provider[3]!.amount = 3000; f.journals[2]!.amount = 5000;
  const r = reconcileFinancialSnapshot(f); expect(r.balances.outstandingClearing.pence).toBe(6800); expect(r.balances.payoutInTransit.pence).toBe(2000);
  expect(codes(f)).toEqual(expect.arrayContaining(["OUTSTANDING_CLEARING","PAYOUT_AWAITING_BANK"]));
 });
 it("missing, duplicate and late observations surface without doubling money", () => {
  const f = fixture(); f.provider.push({ ...f.provider[0]!,id: id(90) });
  expect(codes(f)).toContain("DUPLICATE_PROVIDER_EFFECT"); expect(reconcileFinancialSnapshot(f).balances.grossCharged.pence).toBe(0);
  const late = fixture(); late.provider[0]!.late = true; expect(codes(late)).toContain("LATE_PROVIDER_EVENT");
  const missing = fixture(); missing.provider = missing.provider.filter(p => p.kind !== "payment");
  expect(codes(missing)).toContain("MISSING_OR_WRONG_PREDECESSOR"); expect(reconcileFinancialSnapshot(missing).balances.netPayout.pence).toBe(0);
 });
 it("orphaned provider payments never imply recovery or clear an invoice", () => {
  const f = fixture(); f.provider[0]!.invoiceId = id(99); expect(codes(f)).toContain("ORPHAN_PROVIDER_PAYMENT");
  expect(reconcileFinancialSnapshot(f).balances.grossCharged.pence).toBe(0);
 });
 it("refund-before-payment is unresolved until its original arrives; order never changes the answer", () => {
  const f = fixture(); f.provider = [provider(14,"refund",2000)]; f.journals = [];
  expect(codes(f)).toContain("MISSING_OR_WRONG_PREDECESSOR"); expect(reconcileFinancialSnapshot(f).balances.refunds.pence).toBe(0);
  f.provider.push(provider(10,"payment",12000,null)); const r = reconcileFinancialSnapshot(f);
  expect(r.balances.refunds.pence).toBe(2000); f.provider.reverse(); expect(reconcileFinancialSnapshot(f)).toEqual(r);
 });
 it("over-refunds, reversal discrepancies and wrong-invoice references stay in the queue", () => {
  const f = fixture(); f.provider.push(provider(14,"refund",12001)); expect(codes(f)).toContain("SOURCE_AMOUNT_EXCEEDED");
  const reversed = fixture(); reversed.journals.push(journal(30,"allocation_reversal",10001,id(23))); expect(codes(reversed)).toContain("REVERSAL_DISCREPANCY");
  const wrong = fixture(); wrong.invoices.push({ ...wrong.invoices[0]!,id: id(90) }); wrong.provider[1]!.invoiceId = id(90); expect(codes(wrong)).toContain("MISSING_OR_WRONG_PREDECESSOR");
 });
 it("refunds require releasing allocations/reservations; fees and payouts never become gross recovery", () => {
  const f = fixture(); f.provider[2]!.amount = 9800; f.provider[3]!.amount = 9800; f.journals[2]!.amount = 9800;
  f.provider.push(provider(14,"refund",2000)); f.journals.push(journal(26,"refund",2000,id(14)));
  expect(codes(f)).toContain("ALLOCATION_OR_RESERVATION_LIMIT");
  f.journals.push(journal(27,"release",2000,id(24))); expect(codes(f)).toEqual([]);
  expect(reconcileFinancialSnapshot(f).balances).toMatchObject({ grossCharged: { pence: 12000 },refunds: { pence: 2000 },netPayout: { pence: 9800 },reserved: { pence: 0 } });
 });
 it("cancellations before or after reservation are order independent and missing originals are explicit", () => {
  const f = fixture(); f.journals.unshift(journal(27,"release",2000,id(24))); const a = reconcileFinancialSnapshot(f);
  f.journals.reverse(); expect(reconcileFinancialSnapshot(f)).toEqual(a);
  f.journals = f.journals.filter(j => j.id !== id(24)); expect(codes(f)).toContain("REVERSAL_DISCREPANCY");
 });
 it.each([0,-1,1.1,MAX_MONEY_PENCE+1])("rejects invalid movement amount %s without reflecting input", n => {
  const f = fixture(); f.provider[0]!.amount = n; expect(() => reconcileFinancialSnapshot(f)).toThrow("INVALID_RECONCILIATION");
 });
 it("keeps pennies exact, refuses overflowing totals and does not infer VAT", () => {
  const f = fixture(); f.invoices = [{ ...f.invoices[0]!,net: 1,vat: 0,gross: 1 }]; f.provider = [provider(10,"payment",1,null)]; f.journals = [journal(20,"payment",1,id(10))];
  expect(reconcileFinancialSnapshot(f).balances.grossCharged.pence).toBe(1);
  f.invoices[0]!.vat = 1; expect(() => reconcileFinancialSnapshot(f)).toThrow("INVALID_RECONCILIATION");
  const overflow = fixture(); overflow.provider = [provider(10,"payment",MAX_MONEY_PENCE,null),provider(11,"payment",1,null)];
  expect(() => reconcileFinancialSnapshot(overflow)).toThrow("INVALID_RECONCILIATION");
 });
 it.each(["tenantId","jobId"] as const)("rejects cross-scope %s in every record family", field => {
  for (const family of ["invoices","provider","journals"] as const) {
   const f = fixture(); f[family][0]![field] = id(999); expect(() => reconcileFinancialSnapshot(f)).toThrow("RECONCILIATION_FORBIDDEN");
  }
 });
 it("refuses live environments, unknown fields, personal text, hidden data and overrides", () => {
  for (const extra of [{ environment: "production" },{ shadowSignals: ["secret@example.test"] },{ providerKey: "secret" },{ approved: true }]) {
   expect(() => reconcileFinancialSnapshot({ ...fixture(),...extra })).toThrow("INVALID_RECONCILIATION");
  }
  const f = fixture(); Object.assign(f.journals[0]!,{ reason: "private" });
  try { reconcileFinancialSnapshot(f); } catch (e) { expect(String(e)).not.toMatch(/private|secret|example/u); }
 });
 it("defaults disabled and refuses production even with explicit fake enablement", () => {
  expect(() => new FakeFinancialReconciliationRunner(fixture()).run(run(),auth())).toThrow("RECONCILIATION_DISABLED");
  expect(() => new FakeFinancialReconciliationRunner({ ...fixture(),environment: "production" },true)).toThrow("INVALID_RECONCILIATION");
  expect(() => new FakeFinancialReconciliationRunner(fixture(),true).run({ ...run(),environment: "production" },auth())).toThrow("INVALID_RECONCILIATION");
 });
 it("runs daily once per day, on demand over current observations, with command replay protection", () => {
  const runner = new FakeFinancialReconciliationRunner(fixture(),true), a = auth();
  const daily = runner.run(run(50,"daily"),a); runner.observe(provider(90,"payment",1,null),a);
  expect(runner.run(run(51,"daily"),a)).toEqual(daily);
  expect(runner.run(run(52),a).sourceHash).not.toBe(daily.sourceHash);
  expect(runner.run(run(50,"daily"),a)).toEqual(daily);
  expect(() => runner.run(run(50,"on_demand"),a)).toThrow("RECONCILIATION_CONFLICT");
  expect(runner.run(run(53,"daily","2026-10-30"),a).sourceHash).not.toBe(daily.sourceHash);
 });
 it("provider delivery replay is idempotent; changed payload under the same ID refuses atomically", () => {
  const runner = new FakeFinancialReconciliationRunner(fixture(),true), a = auth(), before = runner.inspect(a);
  runner.observe(provider(10,"payment",12000,null),a); expect(runner.inspect(a)).toEqual(before);
  expect(() => runner.observe(provider(10,"payment",12001,null),a)).toThrow("RECONCILIATION_CONFLICT"); expect(runner.inspect(a)).toEqual(before);
 });
 it("only an exact authorized append repairs a missing journal; no rows are edited; replay does not append audit twice", () => {
  const f = fixture(); f.journals = f.journals.filter(j => j.kind !== "fee");
  const runner = new FakeFinancialReconciliationRunner(f,true), a = auth(), report = runner.run(run(),a), command = adjustment(report.sourceHash);
  expect(() => runner.appendAdjustment(command,a)).toThrow("RECONCILIATION_FORBIDDEN");
  const approved = auth({ approves: b => b.action === "append_reconciliation_fact" && b.actorId === id(5) && b.contentHash === reconciliationAdjustmentHash(command) && b.reportHash === report.sourceHash });
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  const state = runner.inspect(a); expect(state.audit).toHaveLength(1);
  expect(state.audit[0]).toMatchObject({ ...scope,actorId:id(5),sequence:1,action:"append_reconciliation_fact" });
  expect(() => runner.appendAdjustment(command,auth({currentMember:false}))).toThrow("RECONCILIATION_FORBIDDEN"); expect(state.snapshot.journals).toHaveLength(f.journals.length+1);
  for (const j of f.journals) expect(state.snapshot.journals).toContainEqual(j);
  expect(() => runner.appendAdjustment({ ...command,fact: { ...command.fact,amount: 201 } },approved)).toThrow("RECONCILIATION_CONFLICT");
 });
 it("rejects revoked membership on replay, wrong jobs, permissions and changed snapshot/revision before approval", () => {
  const f = fixture(); f.journals = f.journals.filter(j => j.kind !== "fee");
  const runner = new FakeFinancialReconciliationRunner(f,true), a = auth({ approves: () => true }), command = adjustment(runner.run(run(),a).sourceHash);
  for (const denied of [auth({currentMember: false}),auth({tenantId: id(99)}),auth({jobId: id(99)}),auth({canAdjust: false})]) expect(() => runner.appendAdjustment(command,denied)).toThrow("RECONCILIATION_FORBIDDEN");
  expect(() => runner.appendAdjustment({ ...command,invoiceRevision: id(99) },a)).toThrow("RECONCILIATION_CONFLICT");
  expect(() => runner.appendAdjustment({ ...command,fact: { ...command.fact,jobId: id(99) } },a)).toThrow("RECONCILIATION_FORBIDDEN");
  runner.observe(provider(90,"payment",1,null),a); expect(() => runner.appendAdjustment(command,a)).toThrow("RECONCILIATION_CONFLICT");
  expect(runner.inspect(a).audit).toEqual([]);
 });
 it("cannot fabricate amounts, rebind a locked invoice revision, edit a fact, or add an invalid reversal through adjustment", () => {
  const runner = new FakeFinancialReconciliationRunner(fixture(),true), a = auth({ approves: () => true }), report = runner.run(run(),a), command = adjustment(report.sourceHash), before = runner.inspect(a);
  for (const fact of [journal(25,"payment",1,id(10)),journal(25,"allocation_reversal",10001,id(23)),journal(25,"fee",201,id(11)),journal(20,"payment",12000,id(10))]) {
   expect(() => runner.appendAdjustment({ ...command,fact },a)).toThrow("RECONCILIATION_CONFLICT");
  }
  expect(runner.inspect(a)).toEqual(before);
  const copy = runner.inspect(a); copy.snapshot.invoices[0]!.revision = id(99); copy.audit.push({ ...scope,actorId:id(5),action:"append_reconciliation_fact",sequence:1,commandId:id(99),contentHash:"x",previousHash:null,hash:"x"}); expect(runner.inspect(a)).toEqual(before);
 });
 it.each(["provider","journal"] as const)("repairs duplicate %s observations only through exact approved append-only correction facts", target => {
  const f = fixture();
  if (target === "provider") f.provider.push({ ...f.provider[0]!,id: id(90) });
  else f.journals.push({ ...f.journals[0]!,id: id(90) });
  const runner = new FakeFinancialReconciliationRunner(f,true), a = auth(), report = runner.run(run(),a);
  const command = { version: "financial-reconciliation-adjustment.v1",...scope,commandId: id(60),reportHash: report.sourceHash,invoiceRevision: revision,
   correction: { ...scope,id: id(91),invoiceId,target,voidId: id(90),duplicateOf: target === "provider" ? id(10) : id(20) } };
  expect(() => runner.appendAdjustment(command,a)).toThrow("RECONCILIATION_FORBIDDEN");
  const approved = auth({ approves: b => b.contentHash === reconciliationAdjustmentHash(command) });
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  expect(runner.inspect(a).snapshot[target === "provider" ? "provider" : "journals"]).toHaveLength(f[target === "provider" ? "provider" : "journals"].length);
  expect(runner.inspect(a).snapshot.corrections).toHaveLength(1); expect(runner.inspect(a).audit).toHaveLength(1);
 });
 it("rejects correction of different money, chained exclusions and foreign invoice targets", () => {
  const f = fixture(); f.provider.push({ ...f.provider[0]!,id: id(90),amount: 11999 });
  const runner = new FakeFinancialReconciliationRunner(f,true), a = auth({ approves: () => true });
  const report = runner.run(run(),a), before = runner.inspect(a);
  const command = { version: "financial-reconciliation-adjustment.v1",...scope,commandId: id(60),reportHash: report.sourceHash,invoiceRevision: revision,
   correction: { ...scope,id: id(91),invoiceId,target: "provider",voidId: id(90),duplicateOf: id(10) } };
  expect(() => runner.appendAdjustment(command,a)).toThrow("INVALID_RECONCILIATION"); expect(runner.inspect(a)).toEqual(before);
  const valid = fixture(); valid.provider.push({ ...valid.provider[0]!,id: id(90) });
  const corrections = [{ ...command.correction },{ ...command.correction,id: id(92),voidId: id(10),duplicateOf: id(90) }];
  expect(() => reconcileFinancialSnapshot({ ...valid,corrections })).toThrow("INVALID_RECONCILIATION");
  expect(() => reconcileFinancialSnapshot({ ...valid,corrections: [{ ...command.correction,invoiceId: id(99) }] })).toThrow("INVALID_RECONCILIATION");
 });
 it("current run and observation access is checked even on a known command/event", () => {
  const runner = new FakeFinancialReconciliationRunner(fixture(),true), a = auth(); runner.run(run(),a);
  for (const denied of [auth({currentMember: false}),auth({canRun: false}),auth({tenantId: id(99)}),auth({jobId: id(99)})]) {
   expect(() => runner.run(run(),denied)).toThrow("RECONCILIATION_FORBIDDEN");
   expect(() => runner.observe(provider(10,"payment",12000,null),denied)).toThrow("RECONCILIATION_FORBIDDEN");
  }
  expect(() => runner.run({ ...run(),day: "2026-02-30" },a)).toThrow("INVALID_RECONCILIATION");
  expect(() => runner.run({ ...run(),jobId: id(99) },a)).toThrow("RECONCILIATION_FORBIDDEN");
 });

 it("a reversal cannot restore budget from an invalid original allocation", () => {
  const f = fixture(); f.journals[3]!.sourceId = id(999); f.journals.push(journal(27,"allocation_reversal",10000,id(23)));
  expect(codes(f)).toEqual(expect.arrayContaining(["JOURNAL_SOURCE_MISMATCH","REVERSAL_DISCREPANCY"]));
  expect(reconcileFinancialSnapshot(f).balances.allocated.pence).toBe(0);
 });
 it("rejects free-text audit actors and never exposes personal text in authority errors", () => {
  const runner = new FakeFinancialReconciliationRunner(fixture(),true);
  expect(() => runner.run(run(),auth({ actorId: "secret@example.test" }))).toThrow("RECONCILIATION_FORBIDDEN");
  expect(() => runner.run(run(),auth({ actorId: "secret@example.test" }))).not.toThrow("secret@example.test");
 });

 it("repairs a refund allocation discrepancy with an approved release fact", () => {
  const f = fixture(); f.provider[2]!.amount = 9800; f.provider[3]!.amount = 9800; f.journals[2]!.amount = 9800;
  f.provider.push(provider(14,"refund",2000)); f.journals.push(journal(26,"refund",2000,id(14)));
  const runner = new FakeFinancialReconciliationRunner(f,true), report = runner.run(run(),auth());
  const command = { ...adjustment(report.sourceHash),fact: journal(27,"release",2000,id(24)) };
  const approved = auth({ approves: b => b.contentHash === reconciliationAdjustmentHash(command) });
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  expect(runner.inspect(approved).snapshot.journals).toContainEqual(f.journals.find(j => j.id === id(24)));
 });
 it("repairs a reversal delivered before its allocation by appending the exact missing original", () => {
  const f = fixture(), original = f.journals.find(j => j.id === id(23))!;
  f.journals = f.journals.filter(j => j.id !== original.id); f.journals.push(journal(27,"allocation_reversal",10000,id(23)));
  const runner = new FakeFinancialReconciliationRunner(f,true), report = runner.run(run(),auth());
  expect(report.queue.map(i => i.code)).toContain("REVERSAL_DISCREPANCY");
  const command = { ...adjustment(report.sourceHash),fact: original };
  const approved = auth({ approves: b => b.contentHash === reconciliationAdjustmentHash(command) });
  expect(runner.appendAdjustment(command,approved).queue).toEqual([]);
  expect(runner.inspect(approved).snapshot.journals).toHaveLength(f.journals.length+1);
 });

});
