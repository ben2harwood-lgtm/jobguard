import { z } from "zod";
import { MAX_MONEY_PENCE, money } from "./money.js";
import { londonMeterDateV1 } from "./jobs-on-the-go.js";
import { getSubscriptionCatalogue, parseSubscription, subscriptionAnnualAvailable, subscriptionPlanV1, SubscriptionError } from "./subscription.js";

const id = z.string().uuid();
const pence = z.number().int().safe().min(0).max(16900);
const maximum = z.union([z.literal(4900), z.literal(16900)]);
const row = { tenant_id: id, id };
const agreement = z.object({ ...row, revision: z.number().int().positive(), plan: subscriptionPlanV1,
  cadence: z.literal("monthly"), anchor_day: z.number().int().min(1).max(31), maximum_pence: maximum,
  effective_date: londonMeterDateV1,
}).refine(v => v.maximum_pence === (v.plan === "Solo" ? 4900 : 16900));
const period = z.object({ ...row, period_start: londonMeterDateV1, period_end: londonMeterDateV1,
  agreement_revision: z.number().int().positive(), principal_pence: pence, maximum_pence: maximum,
}).refine(v => v.period_start < v.period_end && v.principal_pence <= v.maximum_pence);
const statement = z.object({ ...row, period_id: id, namespace: z.literal("subscription.synthetic.v1"),
  amount_pence: pence, currency: z.literal("GBP"), hypothetical: z.literal(true), artifact_hash: z.string().regex(/^[a-f0-9]{64}$/u).optional() });
const work = z.object({ ...row, statement_id: id, amount_pence: pence, environment: z.literal("synthetic_demo") });
const attempt = z.object({ ...row, work_id: id });
const result = z.object({ ...row, work_id: id, outcome: z.enum(["redirect", "settled", "outcome_unknown", "failed"]),
  environment: z.literal("synthetic_demo") });
/** Consumed projection of the C1 read. Other persisted fields are stripped, never displayed or used for money. */
export const subscriptionPlanReadV1 = z.object({
  version: z.literal("subscription-persisted-read.v1"), environment: z.literal("synthetic_demo"), hypothetical: z.literal(true),
  agreements: z.array(agreement), periods: z.array(period), statements: z.array(statement),
  work: z.array(work), attempts: z.array(attempt), results: z.array(result),
});

/** Integer-only presentation; no new rounding or subscription calculation. */
export function subscriptionPounds(value: number): string {
  const amount = BigInt(parseSubscription(z.number().int().safe().min(0).max(MAX_MONEY_PENCE), value));
  return `£${amount / 100n}.${String(amount % 100n).padStart(2, "0")}`;
}
function requireValid(condition: boolean): asserts condition {
  if (!condition) throw new SubscriptionError("INVALID_SUBSCRIPTION_INPUT");
}
export const subscriptionPaymentLabels = {
  not_started: "Simulation not started", approved: "Simulation approved", outcome_unknown: "Simulation outcome unknown — reconciliation required",
  redirect: "Simulated redirect — not settled", settled: "Simulated settlement — no real money paid", failed: "Simulation failed",
} as const;

/** Read-only: authority belongs to C1; the caller supplies today's London date, never an implicit clock. */
export function subscriptionPlanView(raw: unknown, asOf: unknown) {
  const data = parseSubscription(subscriptionPlanReadV1, raw);
  const date = parseSubscription(londonMeterDateV1, asOf);
  const rows = [...data.agreements, ...data.periods, ...data.statements, ...data.work, ...data.attempts, ...data.results];
  requireValid(new Set(rows.map(r => r.tenant_id)).size <= 1);
  for (const collection of [data.agreements, data.periods, data.statements, data.work, data.attempts, data.results]) {
    requireValid(new Set(collection.map(r => r.id)).size === collection.length);
  }
  requireValid(new Set(data.agreements.map(a => a.revision)).size === data.agreements.length);
  requireValid(new Set(data.statements.map(s => s.period_id)).size === data.statements.length);
  requireValid(new Set(data.work.map(w => w.statement_id)).size === data.work.length);
  requireValid(data.statements.every(s => data.periods.some(p => p.id === s.period_id)));
  requireValid(data.work.every(w => data.statements.some(s => s.id === w.statement_id)));
  requireValid(data.attempts.every(a => data.work.some(w => w.id === a.work_id)));
  requireValid(data.results.every(r => data.work.some(w => w.id === r.work_id)));
  const current = data.agreements.filter(a => a.effective_date <= date)
    .sort((a, b) => b.effective_date.localeCompare(a.effective_date) || b.revision - a.revision)[0];
  const periods = data.periods.map(p => {
    const accepted = data.agreements.find(a => a.revision === p.agreement_revision);
    requireValid(!!accepted);
    const statements = data.statements.filter(s => s.period_id === p.id);
    requireValid(statements.length === 1);
    const s = statements[0]!;
    requireValid(s.amount_pence === p.principal_pence);
    const works = data.work.filter(w => w.statement_id === s.id);
    requireValid(works.length <= 1);
    const w = works[0];
    requireValid(!w || w.amount_pence === s.amount_pence);
    const results = w ? data.results.filter(r => r.work_id === w.id) : [];
    const outcomes = new Set(results.map(r => r.outcome));
    requireValid(!(outcomes.has("settled") && outcomes.has("failed")));
    const attempted = !!w && data.attempts.some(a => a.work_id === w.id);
    requireValid(results.length === 0 || attempted);
    const payment = outcomes.has("settled") ? "settled" : outcomes.has("failed") ? "failed"
      : outcomes.has("outcome_unknown") ? "outcome_unknown" : outcomes.has("redirect") ? "redirect"
      : attempted ? "outcome_unknown" : w ? "approved" : "not_started";
    return { id: p.id, statementId: s.id, contentHash: s.artifact_hash, plan: accepted.plan, startDate: p.period_start, endDateExclusive: p.period_end,
      amount: money(p.principal_pence), amountLabel: subscriptionPounds(p.principal_pence),
      maximum: money(p.maximum_pence), maximumLabel: subscriptionPounds(p.maximum_pence),
      payment, paymentLabel: subscriptionPaymentLabels[payment] };
  }).sort((a, b) => b.startDate.localeCompare(a.startDate) || a.id.localeCompare(b.id));
  return { version: "subscription-plan-view.v1" as const, hypothetical: true as const,
    revision: Math.max(0, ...data.agreements.map(a => a.revision)),
    annualAvailable: subscriptionAnnualAvailable,
    plans: getSubscriptionCatalogue({ version: "subscription-catalogue-request.v1", policyVersion: "subscription_pricing_policy_v4" })
      .map(p => ({ plan: p.plan, monthlyLabel: subscriptionPounds(p.monthlyPence), includedPlaces: p.included,
        maximumLabel: subscriptionPounds(p.maximumPence), annualLabel: subscriptionAnnualAvailable ? subscriptionPounds(p.annualPence) : null })),
    agreement: current ? { plan: current.plan, cadence: current.cadence, anchorDay: current.anchor_day,
      maximumLabel: subscriptionPounds(current.maximum_pence), effectiveDate: current.effective_date } : null,
    periods };
}
export type SubscriptionPlanView = ReturnType<typeof subscriptionPlanView>;

/** Exact demonstration consent copy, rendered by the server and included in the approval hash. */
export const subscriptionConsentText = "Made-up company demonstration only. No real payments are taken. Monthly principal excluding VAT: Solo £29.00, including 4 jobs, maximum £49.00; Builder £69.00, including 7 jobs, maximum £169.00. Annual plans are unavailable. The selected plan, billing anchor and monthly maximum apply. Upgrades apply today. Downgrades are requested for the next billing boundary and depend on available capacity. Issued periods cannot be changed.";
