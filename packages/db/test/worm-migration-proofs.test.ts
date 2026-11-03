import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInventory } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, proofSchema } from "./migration-proof-loader.js";

const proofs = ["0740_worm_durable_commands", "0741_worm_operator_recovery", "0742_worm_operator_alerts"].map(stem =>
  proofSchema.parse(JSON.parse(readFileSync(new URL(`./migration-proofs/${stem}.proof.json`, import.meta.url), "utf8"))));

describe("M4-4 source-reviewed migration proofs", () => {
  it("composes the prerequisite and alert LP-0 fragments against the unchanged baseline", () => {
    const baseline = JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
    const inventory = parseInventory(combineLp0(baseline, proofs));
    expect(inventory.entries).toContainEqual({
      key: "acl|routine|function:worm_control.worm_operator_alerts()|jobguard_worm_operator|EXECUTE|-", group: "a-worm-recovery",
    });
    expect(inventory.entries.some(e => e.key === "acl|routine|function:app.signal_outbox()|PUBLIC|EXECUTE|-")).toBe(true);
    expect(() => combineLp0(baseline, [...proofs, proofs[2]!])).toThrow(/before allowance mismatch/);
  });

  it("leaves shared trigger ACLs and protections unchanged", () => {
    const recovery = proofs[1]!;
    expect(recovery.lp0.every(c => c.before === null)).toBe(true);
    expect(recovery.upgrade.every(c => c.before === null)).toBe(true);
    const baseline = JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
    const inventory = parseInventory(combineLp0(baseline, proofs));
    const triggers = baseline.recorded.routines.filter((r: { returnsTrigger: boolean }) => r.returnsTrigger);
    for (const trigger of triggers) {
      expect(inventory.recorded.routines.find(r => r.identity === trigger.identity)).toEqual(trigger);
    }
    expect(inventory.entries.filter(e => e.group === "x-public-definer-trigger-functions"))
      .toEqual(baseline.entries.filter((e: { group: string }) => e.group === "x-public-definer-trigger-functions"));
    expect(inventory.entries).toContainEqual({ key: "acl|schema|worm_control|jobguard_worm_operator|USAGE|-", group: "a-worm-recovery" });
    expect(inventory.entries.some(e => e.key === "acl|schema|app|jobguard_worm_operator|USAGE|-" )).toBe(false);
    expect(inventory.entries.some(e => e.key.startsWith("member|jobguard_runtime|jobguard_worm_executor|"))).toBe(false);
    for (const role of ["jobguard_worm_executor", "jobguard_worm_operator"]) {
      expect(inventory.entries.some(e => e.key.startsWith(`role|${role}|super=f,inherit=f,`))).toBe(true);
    }
  });

  it("applies all exact upgrade attributes and preserves unrelated objects", () => {
    const prior = proofs.flatMap(p => p.upgrade.flatMap(c => c.section === "routines" && c.before !== null ?
      [{ ...c.before, proowner: c.before.proowner === "postgres" ? 10 : 42 }] : []));
    const untouched = { nspname: "app", relname: "unrelated", relowner: 42, relacl: null, relrowsecurity: true, relforcerowsecurity: true };
    const upgraded = applyUpgradeProofs({ rows: { "app.unrelated": [{ value: "preserved" }] }, routines: prior,
      relations: [untouched], policies: [] }, proofs, { jobguard_migration: 42, postgres: 10 });
    expect(upgraded.rows["app.unrelated"]).toEqual([{ value: "preserved" }]);
    expect(upgraded.relations).toContainEqual(untouched);
    expect(upgraded.routines).toHaveLength(7);
    expect(upgraded.relations).toHaveLength(8);
    expect(upgraded.policies).toHaveLength(3);
    expect(applyTenancyProofs([], proofs, "rls")).toEqual(["worm_attempt", "worm_command", "worm_synthetic_version"].map(relname =>
      ({ relname, relrowsecurity: true, relforcerowsecurity: true, guarded: true })));
    const corrupted = structuredClone(proofs);
    const changed = corrupted[0]!.upgrade.find(c => c.section === "routines")!;
    if (changed.section === "routines" && changed.after) changed.before = { ...changed.after, proacl: "{unexpected=X/jobguard_migration}" };
    expect(() => applyUpgradeProofs({ rows: {}, routines: prior, relations: [], policies: [] }, corrupted, { jobguard_migration: 42, postgres: 10 }))
      .toThrow(/before allowance mismatch/);
  });
});
