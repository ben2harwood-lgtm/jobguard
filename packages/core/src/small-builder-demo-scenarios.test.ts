// @ts-expect-error Test-only JSON asset resolved by Vitest; core does not enable resolveJsonModule.
import inputs from "../../../docs/fixtures/small-builder-demo-inputs.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { demoCatalogue } from "./small-builder-demo-scenarios.js";

// Test-only input grammar. No production parser, route, provider or dispatcher is installed.
const recipe = z.object({ id: z.string().min(1), family: z.enum(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"]), source: z.object({ kind: z.literal("text"), text: z.string().min(1) }).strict() }).strict();
const fixture = z.object({ version: z.literal("small-builder-demo-inputs.v1"), purpose: z.literal("fictional-source-input-only"), recipes: z.array(recipe).length(5) }).strict();

describe("DEMO-P1 documentation and fixture contract only", () => {
  it("DP1-01/04 covers every matrix row and both viewport projects", () => {
    const expected = [["DC",8],["DR",11],["DS",7],["DM",13],["DT",8],["DV",2]].flatMap(([prefix, count]) => Array.from({length: Number(count)}, (_, i) => `${prefix}-${String(i+1).padStart(2,"0")}`));
    expect(demoCatalogue.steps.map(s => s.id).sort()).toEqual(expected.sort());
    expect(new Set(demoCatalogue.steps.map(s => s.id)).size).toBe(49);
    for (const step of demoCatalogue.steps) {
      expect(step.operation.length).toBeGreaterThan(20);
      expect(step.expectedEvidence.length).toBeGreaterThan(20);
      expect(step.bindingIds.length).toBeGreaterThan(0);
      expect(step.projects).toEqual(["mobile-360", "desktop"]);
      for (const id of step.bindingIds) expect(demoCatalogue.bindings.some(b => b.id === id)).toBe(true);
      expect(step.execution).toBe("NOT_RUN");
    }
  });
  it("DP1-02 rejects hidden end states at every source-input level", () => {
    const valid = fixture.parse(inputs);
    const forbidden = ["tenantId","actor","completed","counts","dailyCounts","qualifyingNetPence","Q","feePence","settled","trial","signals","locked","approval","PASS","expected","timestamp"];
    for (const key of forbidden) {
      expect(fixture.safeParse({...valid, [key]: 0}).success).toBe(false);
      const first = valid.recipes[0]!;
      expect(recipe.safeParse({...first, [key]: 0}).success).toBe(false);
      expect(recipe.safeParse({...first, source: {...first.source, [key]: 0}}).success).toBe(false);
    }
  });
  it("DP1-03 separates source inputs from assertions and supplies no runtime mapping", () => {
    const parsed = fixture.parse(inputs);
    expect(new Set(parsed.recipes.map(r => r.family)).size).toBe(5);
    expect(demoCatalogue.purpose).toBe("documentation-only");
    expect(demoCatalogue.executableMap).toBe("BLOCKED_NOT_COMPLETE");
    for (const binding of demoCatalogue.bindings) {
      expect(binding.status).toBe("HELD");
      expect(binding.acceptanceEvidence).toBeNull();
      expect(binding.holds.length).toBeGreaterThan(0);
      expect(binding.resultRecovery.length).toBeGreaterThan(10);
      expect(binding.authority.length).toBeGreaterThan(10);
    }
  });
  it("DP1-04 retains required dedicated negatives as unexecuted branches", () => {
    expect(demoCatalogue.negatives.map(n => n.id)).toEqual(["no-proof","prevention","disclosure-before-lock","evidence-after-lock","disputed-attribution","unpaid-catches","partial-receipts","duplicate-receipts","stale-authority","unknown-outcomes","tenant-isolation","corrupted-evidence"]);
    for (const branch of demoCatalogue.negatives) {
      expect(branch.execution).toBe("NOT_RUN");
      expect(branch.expectedEvidence.length).toBeGreaterThan(10);
    }
  });
  it("DP1-01 retains the required figures as conditional evidence only", () => {
    const figures = {
      "DC-02": ["£900", "£1,000", "£1,200"], "DC-05": ["£1,320"],
      "DC-06": ["£500", "£820"], "DC-07": ["£100", "£20", "£120", "£700"],
      "DR-06": ["£2,820", "£282", "£250", "£2,538"], "DR-09": ["£250", "£32", "£288"],
      "DS-04": ["£33,600", "£3,600"], "DS-06": ["£34,400", "£6,880", "£41,280"],
      "DS-07": ["£800", "£80", "£720", "£3,600"],
      "DM-01": ["£348"], "DM-02": ["£828"], "DM-03": ["£89"], "DM-04": ["£79"],
      "DM-05": ["£169"], "DM-06": ["£49"], "DM-08": ["£62.33"], "DM-09": ["£69.65"],
      "DM-10": ["track_review_due", "14–17", "£169"], "DV-01": ["£500", "£100", "£50", "£2,400"],
    };
    for (const [id, amounts] of Object.entries(figures)) {
      const step = demoCatalogue.steps.find(s => s.id === id);
      const evidence = `${step?.operation} ${step?.expectedEvidence}`;
      for (const amount of amounts) expect(evidence, `${id}: ${amount}`).toContain(amount);
    }
    expect(demoCatalogue.coreCorrection).toEqual({status: "PROPOSED_HELD", hold: "H-CORE-CORRECTION", netPence: 10000, taxPence: 2000, grossPence: 12000, remainingDuePence: 70000});
    expect(demoCatalogue.requiredPrerequisites).toHaveLength(29);
  });
  it("DP1-06 keeps policy, correction, source and acceptance holds explicit", () => {
    for (const id of ["H-CORE-CORRECTION","H-DEMO-P1-EXEC","H-OPERATION-READ","H-CUSTOMER","H-COMPANY","H-TRIAL","H-REVIEW","H-MON7"]) expect(demoCatalogue.holds.some(h => h.id === id)).toBe(true);
    expect(demoCatalogue.steps.find(s => s.id === "DC-07")?.expectedEvidence).toContain("£700");
    expect(demoCatalogue.steps.find(s => s.id === "DS-07")?.expectedEvidence).toContain("£800");
    expect(demoCatalogue.steps.find(s => s.id === "DR-09")?.expectedEvidence).toContain("£288");
  });
});
