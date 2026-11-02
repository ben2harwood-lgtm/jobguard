import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineLp0, loadMigrationProofs } from "./migration-proof-loader.js";
import { parseInventory } from "./lp-0-catalog.js";

// Validate all merged proofs, then isolate this piece's LP-0 additions.
describe("M3-5 explicit migration proof", () => {
  it("loads its fragment and extends the unchanged LP-0 baseline without duplicate allowances", () => {
    const { proofs } = loadMigrationProofs();
    const resumableProofs = proofs.filter(proof => proof.migration === "0534_resumable_evidence.sql");
    expect(resumableProofs).toHaveLength(1);
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const combined = parseInventory(combineLp0(baseline, resumableProofs));
    expect(combined.entries.filter(e => e.key.includes("app.synthetic_evidence_chunk"))).toEqual([
      { key: "acl|rel|table|app.synthetic_evidence_chunk|jobguard_runtime|INSERT|-", group: "x-evidence-writes" },
      { key: "acl|rel|table|app.synthetic_evidence_chunk|jobguard_runtime|SELECT|-", group: "a-runtime-reads" },
      { key: "owner|rel:table|app.synthetic_evidence_chunk|jobguard_migration", group: "a-owner-tables-views" },
    ]);
    expect(combined.held).toEqual(baseline.held);
    expect(combined.authorityPaths).toEqual(baseline.authorityPaths);
    expect(combined.targetState).toEqual(baseline.targetState);
  });
});
