import { describe, expect, it } from "vitest";
import { computeSubscriptionPeriod } from "./subscription-period.js";
import { syntheticMeterPolicyV1 } from "./jobs-on-the-go.js";

// Match core's existing test-only dynamic file import convention; no Node types in the domain package.
const fileModule = "node:fs";
const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string };
const modules = ["subscription.ts", "subscription-period.ts", "subscription-track-review.ts"];
function imports(file: URL) {
  const source = readFileSync(file,"utf8");
  return [...source.matchAll(/(?:import|export)\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gu)].map(m => m[1]!);
}
describe("MON-2A architecture", () => {
  it("M2A-08 M2A-29 direct subscription imports exclude fee, shadow, database and provider code", () => {
    const allowed = new Set(["zod","./jobs-on-the-go.js","./money.js","./rational.js","./subscription.js"]);
    for (const module of modules) for (const name of imports(new URL(module,import.meta.url))) expect(allowed.has(name), `${module}: ${name}`).toBe(true);
  });
  it("M2A-08 M2A-29 transitive calculator dependencies exclude fee and shadow modules", () => {
    const visited = new Set<string>();
    const walk = (file: URL) => {
      if (visited.has(file.href)) return;
      visited.add(file.href);
      for (const name of imports(file)) if (name.startsWith(".")) walk(new URL(name.replace(/\.js$/u,".ts"),file));
    };
    walk(new URL("subscription-period.ts",import.meta.url));
    expect([...visited].map(url => new URL(url).pathname).filter(path => /\/shadow-domain\/|\/success-fee\./u.test(path))).toEqual([]);
  });
  it("M2A-13 M2A-30 pure preview has hypothetical money only and accepts no quote, fee or settlement facts", () => {
    const meter = { version: "meter-supplied-period.v1", environment: "pilot_no_charge", policy: syntheticMeterPolicyV1,
      startDate: "2026-02-01", endDateExclusive: "2026-03-01", days: Array.from({ length: 28 }, (_,i) => ({ date: `2026-02-${String(i+1).padStart(2,"0")}`, plan: "Solo", countedPlaces: 0, trial: false, annualPrepaid: false })) };
    const preview = { version: "subscription-period-preview.v1", meter };
    expect(computeSubscriptionPeriod(preview)).toMatchObject({ hypothetical: true, realExternalActions: 0 });
    for (const field of ["quoteId","quoteAcceptance","feePrincipal","landingAllocation","settled","redirect","hiddenSignals"]) expect(() => computeSubscriptionPeriod({ ...preview, [field]: [] })).toThrow();
  });
});
