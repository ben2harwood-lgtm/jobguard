import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineLp0, loadMigrationProofs, PROOF_DIRECTORY } from "./migration-proof-loader.js";
import { parseInventory } from "./lp-0-catalog.js";

// Isolate this piece from unrelated migrations awaiting their own proof fragments.
describe("M3-5 explicit migration proof", () => {
  it("loads its fragment and extends the unchanged LP-0 baseline without duplicate allowances", () => {
    const legacy = JSON.parse(readFileSync(new URL("./migration-proofs/legacy-migrations.json", import.meta.url), "utf8")) as string[];
    const { proofs } = loadMigrationProofs(PROOF_DIRECTORY, [...legacy, "0573_resumable_evidence.sql"]);
    const baseline = parseInventory(JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8")));
    const combined = parseInventory(combineLp0(baseline, proofs));
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
