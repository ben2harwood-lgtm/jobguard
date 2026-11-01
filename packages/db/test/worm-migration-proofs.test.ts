import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, proofSchema } from "./migration-proof-loader.js";

const proofs = ["0455_worm_durable_commands", "0488_worm_operator_recovery", "0499_worm_operator_alerts"].map(stem =>
  proofSchema.parse(JSON.parse(readFileSync(new URL(`./migration-proofs/${stem}.proof.json`, import.meta.url), "utf8"))));

describe("M4-4 source-reviewed migration proofs", () => {
  it("composes the prerequisite and alert LP-0 fragments against the unchanged baseline", () => {
    const baseline = JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
    const inventory = parseInventory(combineLp0(baseline, proofs));
    expect(inventory.entries).toContainEqual({
      key: "acl|routine|function:app.worm_operator_alerts()|jobguard_worm_operator|EXECUTE|-", group: "a-worm-recovery",
    });
    expect(inventory.entries.some(e => e.key === "acl|routine|function:app.signal_outbox()|PUBLIC|EXECUTE|-")).toBe(false);
    expect(() => combineLp0(baseline, [...proofs, proofs[2]!])).toThrow(/before allowance mismatch/);
  });

  it("applies all exact upgrade attributes and preserves unrelated objects", () => {
    const prior = proofs.flatMap(p => p.upgrade.flatMap(c => c.section === "routines" && c.before !== null ?
      [{ ...c.before, proowner: 42 }] : []));
    const untouched = { nspname: "app", relname: "unrelated", relowner: 42, relacl: null, relrowsecurity: true, relforcerowsecurity: true };
    const upgraded = applyUpgradeProofs({ rows: { "app.unrelated": [{ value: "preserved" }] }, routines: prior,
      relations: [untouched], policies: [] }, proofs, { jobguard_migration: 42 });
    expect(upgraded.rows["app.unrelated"]).toEqual([{ value: "preserved" }]);
    expect(upgraded.relations).toContainEqual(untouched);
    expect(upgraded.routines).toHaveLength(23);
    expect(upgraded.relations).toHaveLength(8);
    expect(upgraded.policies).toHaveLength(3);
    expect(applyTenancyProofs([], proofs, "rls")).toEqual(["worm_attempt", "worm_command", "worm_synthetic_version"].map(relname =>
      ({ relname, relrowsecurity: true, relforcerowsecurity: true, guarded: true })));
    const corrupted = structuredClone(proofs);
    const changed = corrupted[1]!.upgrade.find(c => c.section === "routines" && c.before !== null)!;
    if (changed.section === "routines" && changed.before) changed.before.proacl = "{unexpected=X/jobguard_migration}";
    expect(() => applyUpgradeProofs({ rows: {}, routines: prior, relations: [], policies: [] }, corrupted, { jobguard_migration: 42 }))
      .toThrow(/before allowance mismatch/);
  });
});
