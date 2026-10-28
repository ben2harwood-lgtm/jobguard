// @ts-expect-error Test-only JSON asset resolved by Vitest; core does not enable resolveJsonModule.
import inputs from "../../../docs/fixtures/small-builder-demo-inputs.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { JobRecordProposal } from "./capture.js";
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
  it.each(Object.entries({
      "DC-05": ["B13", "B14", "B15", "B27"],
      "DC-08": ["B30", "B31"],
      "DR-03": ["B13", "B14", "B15", "B27"],
      "DR-05": ["B19", "B20", "B21", "B23", "B29"],
      "DR-06": ["B19", "B20", "B21", "B23", "B29"],
      "DR-08": ["B19", "B20", "B21", "B23", "B29"],
      "DR-10": ["B30", "B31"],
      "DR-11": ["B16", "B17", "B18"],
      "DV-01": ["B16", "B19", "B20", "B21", "B23", "B29"],
      "DS-03": ["B11", "B12", "B32"],
      "DS-05": ["B08", "B27", "B28", "B29"],
      "DS-07": ["B17", "B23", "B29", "B30"],
      "DT-01": ["B01", "B02", "B03", "B04", "B05", "B06", "B07", "B24", "B26"],
      "DT-02": ["B13", "B14", "B24", "B26", "B27", "B29"],
      "DT-03": ["B24", "B26"],
      "DT-04": ["B25", "B26"],
      "DT-05": ["B24", "B25", "B26"],
      "DT-06": ["B26"],
      "DT-07": ["B24", "B26"],
      "DT-08": ["B24", "B25", "B26"],
    ...Object.fromEntries(Array.from({ length: 13 }, (_, index) => {
      const i = index + 1;
      return [`DM-${String(i).padStart(2, "0")}`, ["B24", "B25", ...(i === 12 ? ["B26"] : [])]];
    })),
  }))("r1 A pins required producer ports for %s", (id, bindings) => {
      expect([...(demoCatalogue.steps.find(s => s.id === id)?.bindingIds ?? [])].sort(), id).toEqual([...bindings].sort());
  });
  it.each(Object.entries({
      B24: "MON-1", B25: "MON-2A", B26: "MON-3", B27: "SV-5",
      B28: "MON-5", B29: "SV-6", B30: "CH-9", B31: "DEMO-I", B32: "SV-3/SV-5",
  }))("r1 A documents %s separately for %s as HELD", (id, owner) => {
      const binding = demoCatalogue.bindings.find(b => b.id === id);
      expect(binding?.operation, id).toContain(owner);
      expect(binding?.status, id).toBe("HELD");
      expect(binding?.acceptanceEvidence, id).toBeNull();
  });
  it.each([["B24", "DemoMeterCommands"], ["B25", "DemoSubscriptionCommands"], ["B26", "DemoTrialCommands"]])("r1 A isolates %s port %s", (id, port) => {
      const binding = demoCatalogue.bindings.find(b => b.id === id);
      expect(binding?.commandSchemaAndRoute).toContain(port);
      for (const other of ["DemoMeterCommands", "DemoSubscriptionCommands", "DemoTrialCommands"].filter(p => p !== port)) expect(binding?.commandSchemaAndRoute).not.toContain(other);
  });
  it.each(["core-1000", "recovery-18800", "shadow-30000", "meter", "trial"])("r1 B parses %s source with the installed capture parser", async family => {
    // Load the actual pure parser source through Vitest without adding an AI dependency
    // to core's production graph or pulling another package under core's rootDir.
    const parserUrl = new URL("../../ai/src/capture-fixture-parser.ts", import.meta.url);
    const { parseCaptureFixture } = await import(parserUrl.href) as {
      parseCaptureFixture: (sourceId: string, text: string) => JobRecordProposal;
    };
    const input = fixture.parse(inputs).recipes.find(r => r.family === family)!;
    const result = parseCaptureFixture(input.id, input.source.text);
    expect(result.lines.map(line => line.description.value)).toEqual([
      "Protect room", "Prepare walls", "Paint walls", "Finish trim", "Clean site", "Replace shelves",
    ]);
    expect(result.questions.map(q => q.question.value)).toEqual(["Confirm disposal and waste allowance"]);
    expect(result.lines.every(line => line.unitPricePence.value === null)).toBe(true);
    expect(input.source.text).not.toMatch(/Customer:|recipient:|@/iu);
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
