// CI ONLY: runtime PostgreSQL regressions, fictional legacy v1 data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, type FinalCheckFixture } from "./final-check-fixture.js";
import { legacyRecoveryFixture } from "./migfix-6-fixture.js";
let f: FinalCheckFixture;
let legacy: Awaited<ReturnType<typeof legacyRecoveryFixture>>;
const priorEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  f = await createFinalCheckFixture();
  legacy = await legacyRecoveryFixture(f.admin, f.runtime);
}, 180000);
afterAll(async () => {
  await closeFinalCheckFixture(f);
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
});
describe("MIGFIX-6 legacy derivation", () => {
  const world = (credit: boolean) => legacy.world(credit);
  const openCase: typeof legacy.openCase = (...args) => legacy.openCase(...args);
  const receipt: typeof legacy.receipt = (...args) => legacy.receipt(...args);
  const payload: typeof legacy.payload = (...args) => legacy.payload(...args);
  const land: typeof legacy.land = (...args) => legacy.land(...args);
  const reverse: typeof legacy.reverse = (...args) => legacy.reverse(...args);
  const derivations: typeof legacy.derivations = (...args) => legacy.derivations(...args);
  const journal: typeof legacy.journal = (...args) => legacy.journal(...args);
  const net: typeof legacy.net = (...args) => legacy.net(...args);
  const counts: typeof legacy.counts = (...args) => legacy.counts(...args);
  it("rejects eligible net above allocated gross", async () => {
    const w = await world(false); await openCase(w, 100_000);
    const r = await receipt(w, 1);
    await expect(land(payload(w, r, 1, 100_000))).rejects.toMatchObject({ code: "23514" });
    expect(await counts(w.job)).toEqual({ allocations: 0, derivations: 0, journals: 0 });
    // The bound is also a table fact, so no later writer can rely on the routine alone.
    await expect(f.admin.query("INSERT INTO app.landing_allocation(id,tenant_id,job_id,case_id,receipt_id,evidence_id,eligibility_approval_id,landing_approval_id,gross_pence,eligible_net_pence,currency,policy_version) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,1,100000,'GBP','reference_fee_policy_v1')",
      [w.tenant, w.job, w.caseId, r, w.evidence, w.eligibility, w.landing])).rejects.toMatchObject({ code: "23514" });
  }, 120_000);

  it("two complete reversals remove all recovery liability", async () => {
    const w = await world(true); await openCase(w, 250_000);
    const first = payload(w, await receipt(w, 100_000), 100_000, 100_000), second = payload(w, await receipt(w, 100_000), 100_000, 100_000);
    await land(first); await land(second);
    expect((await derivations(w.job)).at(-1)).toMatchObject({ landed: 200_000, credit: 7900, liability: 12_100 });
    await reverse(first.allocationId, 100_000);
    expect((await derivations(w.job)).at(-1)).toMatchObject({ landed: 100_000, credit: 7900, liability: 2100 });
    await reverse(second.allocationId, 100_000);
    const rows = await derivations(w.job), last = rows.at(-1)!;
    expect(last).toMatchObject({ landed: 0, credit: 0, liability: 0 });
    const entries = await journal(w.job);
    expect(net(entries)).toBe(0);
    expect(entries.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([10_000, 2100]);
  }, 120_000);

  it("partial reversal preserves liability without settled plan credit", async () => {
    const a = await world(false); await openCase(a, 250_000);
    const landed = payload(a, await receipt(a, 100_000), 100_000, 100_000);
    await land(landed);
    expect((await derivations(a.job)).at(-1)).toMatchObject({ credit: 0, liability: 10_000 });
    await reverse(landed.allocationId, 40_000);
    expect((await derivations(a.job)).at(-1)).toMatchObject({ landed: 60_000, credit: 0, liability: 6000 });
    const entries = await journal(a.job);
    expect(entries.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([4000]);
    expect(net(entries)).toBe(6000);
    const b = await world(false); await openCase(b, 250_000);
    const bigger = payload(b, await receipt(b, 200_000), 200_000, 200_000);
    await land(bigger); await reverse(bigger.allocationId, 50_000);
    expect((await derivations(b.job)).at(-1)).toMatchObject({ landed: 150_000, credit: 0, liability: 15_000 });
    const rows = await journal(b.job);
    expect(rows.filter(row => row.kind === "compensation").map(row => row.amount)).toEqual([5000]);
    expect(net(rows)).toBe(15_000);
  }, 120_000);
});
