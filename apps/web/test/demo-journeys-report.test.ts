import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Q62: the demo-journeys report and the V2-DEMO specs agree.
const root = resolve(__dirname, "../../..");
const report = readFileSync(resolve(root, "reviews/v2/demo-journeys-vs-v2.md"), "utf8");
const rows = [...report.matchAll(/^\| ([A-Za-z0-9-]+) \| \d+ \| .*? \| (On V2|On a V2 PR|Missing|Not reached|Shared v1) \|/gmu)].map(m => ({ journey: m[1]!, verdict: m[2]! }));
const headed = [...report.matchAll(/^### ([A-Za-z0-9-]+)$/gmu)].map(m => m[1]!);
const sharedVerdicts = [...report.matchAll(/^### ([A-Za-z0-9-]+)$[\s\S]*?(?=^### |(?![\s\S]))/gmu)]
  .map(m => ({ journey: m[1]!, verdicts: [...m[0].matchAll(/^\| \d+ \| .*? \| (On V2|On a V2 PR|Missing|Shared v1) \|/gmu)].map(v => v[1]!) }));
const journeys = new Set([...rows.map(row => row.journey), ...headed]);

describe("demo journeys report", () => {
  it("has a table for every journey the summary counts, and for every journey it names", () => {
    const counted = Number(/\*\*(\d+) journeys\.\*\*/u.exec(report)?.[1]);
    expect(journeys.size).toBe(counted);
    for (const named of report.slice(report.indexOf("### The five most useful"), report.indexOf("### Where a demo screen")).matchAll(/`((?:TOMMY|DUI|DEMO|real)-[A-Za-z0-9-]+)`/gu))
      expect(journeys.has(named[1]!), named[1]).toBe(true);
    for (const shared of sharedVerdicts) expect(shared.verdicts.length, shared.journey).toBeGreaterThan(0);
  });

  it("gives every wholly On V2 journey a V2-DEMO spec, and no other journey one", () => {
    const byJourney = new Map<string, string[]>();
    for (const row of rows) byJourney.set(row.journey, [...(byJourney.get(row.journey) ?? []), row.verdict]);
    for (const shared of sharedVerdicts) byJourney.set(shared.journey, shared.verdicts);
    for (const [journey, verdicts] of byJourney) {
      const wholly = verdicts.every(verdict => verdict === "On V2");
      expect(existsSync(resolve(root, `apps/web/e2e/V2-DEMO-${journey}.spec.ts`)), journey).toBe(wholly);
    }
  });
});
