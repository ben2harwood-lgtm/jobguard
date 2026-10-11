import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PreventionCheckApplication } from "./prevention-check.application.js";
import { PracticeAccess } from "./practice-access.js";
import { PreventionCheckRepository, createLivePreventionAdapter, preventionRegisterFixtures } from "@jobguard/db";

describe("MON-7a application boundary", () => {
  it("authenticates before parsing an untrusted command", async () => {
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockRejectedValueOnce(Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" }));
    await expect(new PreventionCheckApplication({} as Pool).command("hidden", {})).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(access).toHaveBeenCalledWith("hidden"); access.mockRestore();
  });
  it("does not let a forged type or flag reach persistence", async () => {
    const access = vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context: {}, membershipId: "m", digest: "d" } as never);
    const persistence = vi.spyOn(PreventionCheckRepository.prototype, "command");
    const app = new PreventionCheckApplication({} as Pool, "session");
    await expect(app.command("job", { version: "prevention-command.v1",commandId:"11111111-1111-4111-8111-111111111111",action:"company",expectedBindingId:"22222222-2222-4222-8222-222222222222",scenarioNow:"2026-10-07T13:00:00.000Z",fixture:"fresh", customerType: "business", isIndividual: false })).rejects.toMatchObject({ code: "INVALID_PREVENTION_COMMAND" });
    expect(persistence).not.toHaveBeenCalled(); persistence.mockRestore(); access.mockRestore();
  });
  it("fixtures never call an external source and every live factory refuses", () => {
    const outbound=vi.fn();vi.stubGlobal("fetch",outbound);
    try {
      for(const fixture of ["mixed","fresh","stale","missing"] as const){
        const results=preventionRegisterFixtures(["listed_building","conservation_area","article_4","planning_history","flood","company","companies_house_feed","gazette_feed"],fixture,"2026-10-07T13:00:00.000Z");
        if(fixture==="stale"||fixture==="missing")expect(results.every(result=>result.status==="unknown")).toBe(true);
      }
      expect(()=>createLivePreventionAdapter()).toThrow("LIVE_PREVENTION_ROUTE_DISABLED_D04_D12_REQUIRED");expect(outbound).not.toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();}
  });
  it("repositories reject all non-synthetic modes before opening a database connection", async () => {
    const previous=process.env.JOBGUARD_ENV;
    try { for(const mode of [undefined,"pilot_no_charge","provider_sandbox","production_billing"]){if(mode===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=mode;
      await expect(new PreventionCheckRepository({} as Pool).view(undefined as never,"member","job")).rejects.toMatchObject({code:"SYNTHETIC_ONLY"});
    } }finally{if(previous===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous;}
  });
});

describe("DW4 prevention severance architecture", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const walk = (path: string): string[] => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(resolve(path, entry.name)) : [resolve(path, entry.name)]);
  it("money, recovery, value, charging, meter, plan and entitlement modules cannot import prevention modules or exports", () => {
    const protectedFiles = ["packages/core/src", "packages/db/src", "apps/api/src", "apps/web/app"].flatMap(path => walk(resolve(root, path)))
      .filter(path => /\.(ts|tsx)$/u.test(path) && !/\.test\./u.test(path) && /(?:fee|ledger|journal|recovery|charging|billing|meter|entitlement|subscription|(?:^|[/-])plan(?:[./-])|(?:^|[/-])value(?:[./-]))/iu.test(path));
    expect(protectedFiles.length).toBeGreaterThan(20);
    for (const file of protectedFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/(?:from\s*["'][^"']*prevention|import\s*\(["'][^"']*prevention|\b(?:Prevention[A-Z]\w*|prevention[A-Z]\w*|evaluatePrevention\w*|PREVENTION_[A-Z_]+))/u);
    }
  });
});
