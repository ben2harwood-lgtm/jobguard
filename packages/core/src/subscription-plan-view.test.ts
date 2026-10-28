import { describe, expect, it } from "vitest";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";
import { computeSubscriptionPeriod } from "./subscription-period.js";
import { subscriptionPlanView, subscriptionPounds } from "./subscription-plan-view.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(plan: "Solo" | "Builder" = "Builder", places = 8, length = 30, extraDays = length, upgrade = false) {
  const start = length === 31 ? "2026-03-01" : "2026-04-01";
  const date = (offset: number) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
  const computed = computeSubscriptionPeriod({ version: "subscription-period-preview.v1", meter: {
    version: "meter-supplied-period.v1", environment: "synthetic_demo", policy: syntheticMeterPolicyV1,
    startDate: start, endDateExclusive: date(length), days: Array.from({ length }, (_, n) => ({ date: date(n),
      plan: upgrade && n >= 10 ? "Builder" : plan, countedPlaces: n < extraDays ? places : 7, trial: false, annualPrepaid: false })),
  } });
  return { version: "subscription-persisted-read.v1", hypothetical: true, environment: "synthetic_demo",
    agreements: [{ tenant_id: id(1), id: id(2), revision: 1, plan, cadence: "monthly", anchor_day: 1,
      maximum_pence: plan === "Solo" ? 4900 : 16900, effective_date: start }],
    periods: [{ tenant_id: id(1), id: id(3), period_start: start, period_end: date(length), agreement_revision: 1,
      principal_pence: computed.principal.pence, maximum_pence: computed.maximum.pence }],
    statements: [{ tenant_id: id(1), id: id(4), period_id: id(3), namespace: "subscription.synthetic.v1",
      amount_pence: computed.principal.pence, currency: "GBP", hypothetical: true }],
    work: [] as { tenant_id: string; id: string; statement_id: string; amount_pence: number; environment: string }[],
    attempts: [] as { tenant_id: string; id: string; work_id: string }[],
    results: [] as { tenant_id: string; id: string; work_id: string; outcome: string; environment: string }[],
  };
}
function view(raw: unknown) { return subscriptionPlanView(raw, "2026-04-30"); }
function simulation(outcomes: string[], attempted = true) {
  const raw = fixture();
  raw.work.push({ tenant_id: id(1), id: id(5), statement_id: id(4), amount_pence: 8900, environment: "synthetic_demo" });
  if (attempted) raw.attempts.push({ tenant_id: id(1), id: id(6), work_id: id(5) });
  raw.results = outcomes.map((outcome, n) => ({ tenant_id: id(1), id: id(10 + n), work_id: id(5), outcome, environment: "synthetic_demo" }));
  return raw;
}

describe("MON-2A P2 plan screen projection", () => {
  it.each([
    ["Builder", 8, 30, 30, false, "£89.00"], ["Builder", 8, 30, 15, false, "£79.00"],
    ["Builder", 12, 30, 30, false, "£169.00"], ["Solo", 5, 30, 30, false, "£49.00"],
    ["Solo", 6, 30, 30, false, "£49.00"], ["Solo", 6, 30, 30, true, "£62.33"],
    ["Builder", 8, 31, 1, false, "£69.65"],
  ] as const)("renders engine %s/%i/%i/%i/upgrade:%s as %s", (plan, places, days, extraDays, upgrade, label) => {
    const projected = view(fixture(plan, places, days, extraDays, upgrade));
    expect(projected.periods[0]!.amountLabel).toBe(label);
    expect(projected.periods[0]!.amount.pence).toBeLessThanOrEqual(projected.periods[0]!.maximum.pence);
  });
  it("preserves both twelve-month profiles: £348 and £828, separately from annual plan prices", () => {
    const solo = [1,1,1,2,2,2,2,2,2,3,3,4].reduce((sum, n) => sum + view(fixture("Solo", n)).periods[0]!.amount.pence, 0);
    const builder = [3,4,4,4,4,5,5,5,5,6,6,7].reduce((sum, n) => sum + view(fixture("Builder", n)).periods[0]!.amount.pence, 0);
    expect(subscriptionPounds(solo)).toBe("£348.00"); expect(subscriptionPounds(builder)).toBe("£828.00");
    expect(view(fixture()).plans).toEqual([
      { plan: "Solo", monthlyLabel: "£29.00", includedPlaces: 4, maximumLabel: "£49.00", annualLabel: null },
      { plan: "Builder", monthlyLabel: "£69.00", includedPlaces: 7, maximumLabel: "£169.00", annualLabel: null },
    ]);
    expect(view(fixture()).annualAvailable).toBe(false);
  });
  it.each([
    [[], false, "approved"], [[], true, "outcome_unknown"], [["redirect"], true, "redirect"],
    [["redirect", "outcome_unknown"], true, "outcome_unknown"], [["outcome_unknown", "settled"], true, "settled"],
    [["redirect", "failed"], true, "failed"],
  ] as const)("projects %j, attempted %s as %s independent of row order", (outcomes, attempted, state) => {
    const raw = simulation([...outcomes], attempted);
    const projected = view(raw);
    expect(projected.periods[0]!.payment).toBe(state);
    raw.results.reverse(); expect(view(raw)).toEqual(projected);
    expect(projected.periods[0]!.paymentLabel).not.toBe("Paid");
  });
  it("shows no subscription and no periods for an empty authorised company read", () => {
    expect(view({ ...fixture(), agreements: [], periods: [], statements: [] })).toMatchObject({ agreement: null, periods: [] });
  });
  it("selects applied effective revisions, never a future revision or pending change", () => {
    const raw = fixture();
    raw.agreements.push({ ...raw.agreements[0]!, id: id(20), revision: 2, plan: "Solo", maximum_pence: 4900, effective_date: "2026-05-01" });
    expect(view({ ...raw, changes: [{ plan: "Solo", effective_date: "2026-04-01" }] }).agreement?.plan).toBe("Builder");
    expect(subscriptionPlanView(raw, "2026-05-01").agreement?.plan).toBe("Solo");
    raw.agreements.push({ ...raw.agreements[0]!, id: id(21), revision: 3, plan: "Solo", maximum_pence: 4900 });
    expect(view(raw).agreement?.plan).toBe("Solo");
    expect(view({ ...raw, agreements: [...raw.agreements].reverse() })).toEqual(view(raw));
  });
  it("uses the persisted total including corrections, and ignores fee, hidden and unrelated fields", () => {
    const raw = fixture(); raw.periods[0]!.principal_pence = 9101; raw.statements[0]!.amount_pence = 9101;
    const before = JSON.stringify(raw);
    expect(view(raw).periods[0]!.amountLabel).toBe("£91.01");
    expect(view({ ...raw, hiddenSignals: ["never show"], fees: [{ amount_pence: 99999 }], annualEnabled: true })).toEqual(view(raw));
    expect(JSON.stringify(raw)).toBe(before);
  });
  it("fails closed on invalid money, plans, environments, references, tenant joins and settlement claims", () => {
    const mutations: ((raw: ReturnType<typeof fixture>) => void)[] = [
      r => { r.periods[0]!.principal_pence = 16901; }, r => { r.periods[0]!.principal_pence = 1.2; },
      r => { r.periods[0]!.maximum_pence = 4900; }, r => { r.statements[0]!.amount_pence = 1; },
      r => { r.periods[0]!.tenant_id = id(99); }, r => { r.periods[0]!.agreement_revision = 99; },
      r => { r.statements[0]!.period_id = id(99); }, r => { r.statements.push({ ...r.statements[0]!, id: id(99) }); },
      r => { r.agreements.push({ ...r.agreements[0]!, id: id(99) }); },
    ];
    for (const mutate of mutations) { const raw = fixture(); mutate(raw); expect(() => view(raw)).toThrow("INVALID_SUBSCRIPTION_INPUT"); }
    for (const patch of [{ environment: "production" }, { hypothetical: false }, { periods: null },
      { agreements: [{ ...fixture().agreements[0], plan: "Firm" }] }]) expect(() => view({ ...fixture(), ...patch })).toThrow();
    expect(() => view(simulation(["settled"], false))).toThrow();
    expect(() => view(simulation(["settled", "failed"]))).toThrow();
    const foreign = simulation(["settled"]); foreign.work[0]!.statement_id = id(99); expect(() => view(foreign)).toThrow();
    expect(() => subscriptionPlanView(fixture(), "not-a-date")).toThrow();
  });
  it.each([-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER])("refuses invalid presentation pence %s", value => {
    expect(() => subscriptionPounds(value)).toThrow();
  });
});
