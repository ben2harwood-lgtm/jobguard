// EP-D2: hand-worked expected outcomes (docs/contracts/connector-expected-outcomes-v1.md) fed through the existing
// made-up-data paths. Expected values come from the fixture, never from the code under test. Cases whose stored result
// is only reachable through PostgreSQL are listed as skipped "not run here" so the D3 groundwork can judge them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BillingDataError, calculateCumulativeFee, deriveUnambiguousBilling, diffWorkOrderRevision, matchWorkOrderLines,
  priceWorkOrderLines, renderBillingExport, validateWorkOrderRow, workOrderContentFields, type WorkOrderPricedLine,
} from "@jobguard/core";
import type { OutboundAction } from "@jobguard/db";
import { connectorInputV1 } from "../connectors/inbound.js";
import { createSyntheticBillingAdapter } from "./billing.adapters.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fx: any = JSON.parse(readFileSync(new URL("../../../../docs/fixtures/connector-expected-outcomes-v1.json", import.meta.url), "utf8"));
const caseOf = (id: string) => fx.cases.find((c: any) => c.id === id);
const pgOnly = (id: string, what: string) => it.skip(`${id} NOT RUN HERE (PostgreSQL path, for D3): ${what}`, () => undefined);

// --- exact fractions, only to compare and to apply the plan's Q formula (BUILD_PLAN §9.1.9) ---
type F = { n: bigint; d: bigint };
const f = (v: string | { numerator: string; denominator: string }): F => typeof v === "string"
  ? (([n, d]) => ({ n: BigInt(n!), d: BigInt(d ?? "1") }))(v.split("/")) : { n: BigInt(v.numerator), d: BigInt(v.denominator) };
const cmp = (a: F, b: F) => { const x = a.n * b.d, y = b.n * a.d; return x < y ? -1 : x > y ? 1 : 0; };
const sub = (a: F, b: F): F => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const min = (...xs: F[]) => xs.reduce((a, b) => cmp(a, b) <= 0 ? a : b);
const same = (actual: any, expected: string) => expect(cmp(f(actual), f(expected)), `${JSON.stringify(actual)} vs ${expected}`).toBe(0);
function q(line: any): F {
  const A = f(String(fx.fee.approvedNetPence)), value = min(A, sub(f(line.billedNet), f(line.creditedNet)), f(line.paidNet));
  return value.n < 0n ? { n: 0n, d: 1n } : value;
}
// A negative delta must name the posting it compensates; a made-up earlier derivation stands in for it.
function fee(Q: F, priorPence: number, compensates: string | null = null) {
  const g = (a: bigint, b: bigint): bigint => b === 0n ? a : g(b, a % b), k = g(Q.n < 0n ? -Q.n : Q.n, Q.d) || 1n;
  return calculateCumulativeFee({ version: "cumulative-fee.v1",
    rate: { version: "fee-rate.v1", policyVersion: fx.fee.policyVersion, ...fx.fee.rate },
    cumulativeQualifyingPrincipal: { numerator: String(Q.n / k), denominator: String(Q.d / k) },
    priorNetPostedPence: priorPence, priorPolicyVersion: fx.fee.policyVersion, compensatesDerivationId: compensates });
}
const earlierDerivation = "30000000-0000-4000-8000-000000000031";

// --- fixture builders ---
const match = { exportLineId: fx.ids.exportLineId, jobId: fx.ids.job, extraId: fx.ids.extra, scopeItemId: fx.ids.extraScopeItem,
  revisionId: fx.ids.extraRevision, revisionHash: fx.ids.revisionHash };
function event(name: string) {
  const { compositionLines, ...e } = fx.events[name];
  const composition = compositionLines ? { declared: e.amount, lines: compositionLines.map((l: string) =>
    ({ ...fx.lines[l], match: fx.lines[l].match ? match : null })) } : null;
  return { ...fx.eventDefaults, ...e, composition };
}
const derive = (...names: string[]) => deriveUnambiguousBilling(names.map(event));
const line = (r: any, id: string) => r.lines.find((l: any) => l.lineId === id);
const row = (name: string) => {
  const v = validateWorkOrderRow({ ...fx.workOrderRowDefaults, clientId: fx.ids.client, contractId: fx.ids.clientContract,
    siteRevisionId: fx.ids.siteRevision, ...fx.workOrderRows[name] });
  if (!v.ok) throw new Error(`fixture row ${name}: ${v.code}`);
  return v.row;
};
const items = new Map(Object.entries(fx.schedule.items)) as Map<string, { unit: string; ratePence: number }>;
const price = (name: string) => {
  const r = row(name);
  return priceWorkOrderLines(r.lines, items, fx.schedule.adjustment).map((p, i) => ({ ...p, clientLineReference: r.lines[i]!.clientLineReference }));
};
const scopeFor: Record<string, string> = { L1: fx.ids.scopeL1, L2: fx.ids.scopeL2 };
const rev1Lines = (): WorkOrderPricedLine[] => matchWorkOrderLines([], price("rev1"), (() => { const ids = [fx.ids.scopeL1, fx.ids.scopeL2]; return () => ids.shift()!; })());
const sameContent = (a: string, b: string) => JSON.stringify(workOrderContentFields(row(a))) === JSON.stringify(workOrderContentFields(row(b)));
const nets = (lines: readonly { net: { pence: number } }[]) => lines.map(l => l.net.pence);

describe("work orders", () => {
  it("EO-01 same delivery repeated: identical revisable content, same prices", () => {
    const e = caseOf("EO-01").expected.pure;
    expect(sameContent("rev1", "rev1")).toBe(e.contentEqual);
    expect(nets(price("rev1"))).toEqual(e.lineNetPence);
    expect(nets(price("rev1")).reduce((a, b) => a + b, 0)).toBe(e.orderNetPence);
  });
  pgOnly("EO-01", "second row outcome 'unchanged', still one revision, no audit event; same file again after a clean import replays");

  it("EO-02 same key, changed payload: identities kept, only L1 changed, half-even tie on L1", () => {
    const e = caseOf("EO-02").expected.pure;
    expect(sameContent("rev1", "rev2")).toBe(e.contentEqual);
    const previous = rev1Lines();
    const next = matchWorkOrderLines(previous, price("rev2"), () => { throw new Error("no new identity expected"); });
    expect(next.map(l => l.scopeItemId)).toEqual(e.keptScopeIdentities.map((r: string) => scopeFor[r]));
    const r1 = row("rev1"), r2 = row("rev2");
    const diff = diffWorkOrderRevision({ ...r1, lines: previous }, { ...r2, lines: next });
    expect(diff.changed).toEqual(e.changedLines.map((r: string) => scopeFor[r]));
    expect(nets(next)).toEqual(e.lineNetPence);
    expect(nets(next).reduce((a, b) => a + b, 0)).toBe(e.orderNetPence);
  });
  pgOnly("EO-02", "outcome 'revised', revision 2 appended, revision 1 untouched; same command id with a different file is COMMAND_CONFLICT");

  it("EO-03 out-of-order revision: rev3 differs from rev1 and rev2 and prices to the hand-worked figure", () => {
    const e = caseOf("EO-03").expected.pure;
    expect(sameContent("rev1", "rev3")).toBe(false);
    expect(sameContent("rev2", "rev3")).toBe(false);
    expect(nets(price("rev3"))).toEqual(e.rev3LineNetPence);
    expect(nets(price("rev3")).reduce((a, b) => a + b, 0)).toBe(e.rev3OrderNetPence);
  });
  pgOnly("EO-03", "rev3 first is STALE_REVISION with nothing written; rev2 then rev3 revise to 2 and 3; late rev2 is STALE_REVISION");

  it("EO-04 cancellation is revisable content that carries no lines", () => {
    const e = caseOf("EO-04").expected.pure;
    const content = workOrderContentFields(row("cancel"));
    expect(content.status).toBe(e.cancelContentStatus);
    expect(content.lines).toEqual(e.cancelContentLines);
    expect(sameContent("rev1", "cancel")).toBe(e.contentEqualToRev1);
  });
  pgOnly("EO-04", "cancel appends revision 2 keeping rev-1 lines and identities; job stays live; the logged extra is unchanged");
});

describe("billing export delivery", () => {
  const artifact = () => renderBillingExport(fx.exportInput);
  const action = (over: Partial<OutboundAction> = {}): OutboundAction => {
    const a = artifact();
    return { version: "outbound-action.v1", id: "30000000-0000-4000-8000-000000000021", authorizationId: "30000000-0000-4000-8000-000000000022",
      adapter: "fake_sftp", providerEffectKey: "fictional-effect-eo", actionType: "billing_export", recipient: "billing.invalid",
      contentHash: a.jsonHash, immutableContent: a.json, aggregateRevision: 1, amountPence: a.totalNet.pence,
      currency: "GBP", policyVersion: "billing-export.v1", authorizationExpiresAt: new Date("2026-12-01T00:00:00Z"), ...over };
  };
  const adapter = (scenario: string) => createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel: "fake_sftp", scenario });

  it("EO-05 export delivered twice: one artifact, one simulated effect, changed binding conflicts", async () => {
    const e = caseOf("EO-05").expected.pure;
    const [a, b] = [artifact(), artifact()];
    expect(a.json === b.json && a.jsonHash === b.jsonHash && a.csvHash === b.csvHash).toBe(e.identicalArtifacts);
    expect(a.json).toContain(fx.ids.exportLineId);
    expect(a.totalNet.pence).toBe(e.totalNetPence);
    const sftp = adapter("success");
    const first = await sftp.deliver(action()), second = await sftp.deliver(action());
    expect(second).toEqual(first);
    expect(first.kind).toBe("succeeded");
    expect(sftp.simulatedEffects).toBe(e.simulatedEffectsAfterTwoDeliveries);
    await expect(sftp.deliver(action({ recipient: "other-billing.invalid" }))).rejects.toMatchObject({ code: e.changedBinding });
    expect(sftp.simulatedEffects).toBe(e.simulatedEffectsAfterConflict);
  });

  it.each(["unknown_accepted", "unknown_unresolved", "unknown_not_accepted"])("EO-06 unknown outcome (%s) is reconciled, never blindly resent", async scenario => {
    const e = caseOf("EO-06").expected.pure[scenario];
    const sftp = adapter(scenario);
    const results = [(await sftp.deliver(action())).kind, (await sftp.deliver(action())).kind,
      await sftp.reconcile("fictional-effect-eo"), (await sftp.deliver(action())).kind];
    expect(results).toEqual(e.results);
    expect(sftp.simulatedEffects).toBe(e.simulatedEffects);
  });
  pgOnly("EO-06", "retry only after durable reconciliation shows safe non-delivery under current authority");
});

describe("billing status", () => {
  it("EO-07 invoice before the export acknowledgement: billed, unpaid, no fee; the ack carries no money", () => {
    const e = caseOf("EO-07").expected.pure;
    const r = derive("inv-1");
    same(line(r, "EXT-1").billedNet, String(e.extraBilledNetPence));
    same(r.totals.billedNet, String(e.invoiceBilledNetPence));
    same(r.totals.paidNet, String(e.paidNetPence));
    same(r.totals.matchedExtraNet, e.matchedExtraNet);
    expect(r.held).toEqual(e.held);
    expect(fee(q(line(r, "EXT-1")), 0).cumulativeFee.pence).toBe(e.feePence);
    const ack = { version: "connector-input.v1", eventId: "fixture:export_received", kind: "export_delivery", subject: "fixture:export_batch", revision: 1, outcome: "received" };
    expect(connectorInputV1.safeParse(ack).success).toBe(e.ackParses);
    expect(!connectorInputV1.safeParse({ ...ack, amountPence: 24000 }).success).toBe(e.ackWithMoneyFieldRefused);
  });
  pgOnly("EO-07", "the acknowledgement is a staged receipt with domainEffects 0");

  it("EO-08 part payment then balance: pro rata over the whole invoice, fee rounded once on the cumulative value", () => {
    const e = caseOf("EO-08").expected.pure;
    const part = derive("inv-1", "pay-part");
    same(line(part, "EXT-1").paidGross, e.afterPart.extraPaidGross);
    same(line(part, "EXT-1").paidNet, e.afterPart.extraPaidNet);
    same(line(part, "ORD-1").paidGross, e.afterPart.orderPaidGross);
    same(part.totals.paidNet, e.afterPart.totalPaidNet);
    expect(cmp(q(line(part, "EXT-1")), f(e.afterPart.q))).toBe(0);
    const f1 = fee(q(line(part, "EXT-1")), 0);
    expect([f1.cumulativeFee.pence, f1.postingDelta.pence]).toEqual([e.afterPart.feePence, e.afterPart.deltaPence]);
    const full = derive("inv-1", "pay-part", "pay-balance");
    same(line(full, "EXT-1").paidNet, e.afterBalance.extraPaidNet);
    same(line(full, "ORD-1").paidNet, e.afterBalance.orderPaidNet);
    same(full.totals.paidGross, e.afterBalance.totalPaidGross);
    expect(cmp(q(line(full, "EXT-1")), f(e.afterBalance.q))).toBe(0);
    const f2 = fee(q(line(full, "EXT-1")), f1.cumulativeFee.pence);
    expect([f2.cumulativeFee.pence, f2.postingDelta.pence]).toEqual([e.afterBalance.feePence, e.afterBalance.deltaPence]);
  });

  it("EO-09 credit after payment lowers Q by the credited net and compensates the fee", () => {
    const e = caseOf("EO-09").expected.pure;
    const r = derive("inv-1", "pay-full", "credit-ext");
    same(line(r, "EXT-1").creditedNet, e.extraCreditedNet);
    same(line(r, "EXT-1").paidNet, e.extraPaidNet);
    expect(cmp(q(line(r, "EXT-1")), f(e.q))).toBe(0);
    const result = fee(q(line(r, "EXT-1")), e.priorPence, earlierDerivation);
    expect([result.cumulativeFee.pence, result.postingDelta.pence]).toEqual([e.feePence, e.deltaPence]);
  });

  it("EO-10 payment reversal returns paid to zero and compensates the whole fee", () => {
    const e = caseOf("EO-10").expected.pure;
    const r = derive("inv-1", "pay-full", "reverse-full");
    same(r.totals.paidGross, e.totalPaidGross);
    same(line(r, "EXT-1").paidNet, e.extraPaidNet);
    expect(cmp(q(line(r, "EXT-1")), f(e.q))).toBe(0);
    const result = fee(q(line(r, "EXT-1")), e.priorPence, earlierDerivation);
    expect([result.cumulativeFee.pence, result.postingDelta.pence]).toEqual([e.feePence, e.deltaPence]);
  });

  it("EO-11 billing rejection marks the extra line rejected and earns nothing", () => {
    const e = caseOf("EO-11").expected.pure;
    const r = derive("inv-1", "reject-ext");
    expect(line(r, "EXT-1").rejected).toBe(e.extraRejected);
    same(line(r, "EXT-1").creditedNet, e.extraCreditedNet);
    same(line(r, "EXT-1").paidNet, e.extraPaidNet);
    const result = fee(q(line(r, "EXT-1")), 0);
    expect([result.cumulativeFee.pence, result.postingDelta.pence]).toEqual([e.feePence, e.deltaPence]);
  });
  pgOnly("EO-11", "a connector cannot link a rejected fact (BILLING_COMPOSITION_REQUIRED)");

  it("EO-12 mixed invoice: order and other lines are paid but contribute nothing to the fee base", () => {
    const e = caseOf("EO-12").expected.pure;
    const r = derive("inv-2", "pay-mixed");
    same(r.totals.paidNet, e.totalPaidNet);
    for (const [id, value] of Object.entries(e.matchedExtraNetByLine)) same(line(r, id).matchedExtraNet, value as string);
    expect(cmp(q(line(r, "EXT-1")), f(e.q))).toBe(0);
    expect(fee(q(line(r, "EXT-1")), 0).cumulativeFee.pence).toBe(e.feePence);
  });

  it("EO-13 same event key: an identical repeat is one fact; a changed payload conflicts", () => {
    const e = caseOf("EO-13").expected.pure;
    expect(JSON.stringify(derive("inv-1", "pay-full", "pay-full")) === JSON.stringify(derive("inv-1", "pay-full"))).toBe(e.repeatEqualsSingle);
    let code: string | undefined;
    try { derive("inv-1", "pay-full", "pay-full-changed"); } catch (error) { code = error instanceof BillingDataError ? error.code : String(error); }
    expect(code).toBe(e.changed);
  });
  pgOnly("EO-13", "the first stored result is kept after the conflicting delivery");
});
