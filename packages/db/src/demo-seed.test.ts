import { describe, expect, it } from "vitest";
import { DEMO_JOB_ID, DEMO_SCOPE_ITEM_ID, DEMO_TENANT_ID, demoCheckpoints, seedDemo, type DemoSeedCommand } from "./demo-seed.js";

describe("M1-15 synthetic demo seed", () => {
  it("is deterministic, idempotent, separate, and retains job/scope lineage", async () => {
    const stored = new Map<string, DemoSeedCommand>();
    const boundary = { execute: async (command: DemoSeedCommand) => stored.has(command.semanticKey) ? "replayed" as const : (stored.set(command.semanticKey, command), "created" as const) };
    expect((await seedDemo("synthetic_demo", boundary)).map(x => x.result)).toEqual(demoCheckpoints.map(() => "created"));
    expect((await seedDemo("synthetic_demo", boundary)).map(x => x.result)).toEqual(demoCheckpoints.map(() => "replayed"));
    expect([...stored.values()].every(x => x.tenantId === DEMO_TENANT_ID && x.jobId === DEMO_JOB_ID && x.scopeItemId === DEMO_SCOPE_ITEM_ID)).toBe(true);
    expect(stored.get("m1-15.demo-seed.v1:recorded_payment")?.amount).toEqual({ pence: 150000, currency: "GBP" });
  });

  it.each(["production", "pilot_no_charge"] as const)("refuses %s before invoking a write", async environment => {
    let writes = 0;
    await expect(seedDemo(environment, { execute: async () => { writes++; return "created"; } })).rejects.toMatchObject({ code: "DEMO_SEED_ENVIRONMENT_FORBIDDEN" });
    expect(writes).toBe(0);
  });
});
