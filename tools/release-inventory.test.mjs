import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseReleaseInventory, releaseRecordV1Schema } from "../packages/config/src/release-inventory.ts";

const root = new URL("../", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

test("M4-23: CI validates the actual policy/payment rail inventory against all decision records", () => {
  const inventory = parseReleaseInventory(JSON.parse(read("config/release-inventory.v1.json")));
  const records = readdirSync(new URL("docs/decisions/", root)).filter(name => /^d\d\d-.*\.md$/u.test(name));
  assert.deepEqual(inventory.policies.map(p => p.record).sort(), records.map(name => `docs/decisions/${name}`).sort());
  for (const policy of inventory.policies) {
    const source = read(policy.record);
    const field = label => source.match(new RegExp(`\\*\\*${label}:\\*\\* \x60([^\x60]+)\x60`, "u"))?.[1];
    assert.equal(policy.id.toLowerCase(), policy.record.split("/").at(-1).slice(0, 3));
    assert.equal(policy.policyVersion, field("Policy version"));
    assert.equal(policy.status, field("Status"));
    assert.equal(policy.gate, field("Executable feature gate"));
  }
  // No approval or activation is part of this piece. Deliberate future enablement
  // must update this assertion as well as supply the separately reviewed records.
  assert.ok([...inventory.policies, ...inventory.rails].every(row => !row.enabled && row.releaseRecordId === null));
  assert.deepEqual(inventory.releaseRecords, []);
});

for (const [gate, track] of [["G4-C", "contractor"], ["G4-S", "small-builder"]]) {
  const example = JSON.parse(read(`packages/config/test/fixtures/release-record.${gate.toLowerCase()}.example.json`));

  test(`M4-23: ${gate} fictional blank-slot example validates format but cannot enable inventory`, () => {
    const record = releaseRecordV1Schema.parse(example);
    assert.equal(record.track, track);
    assert.equal(record.phase, "bounded_smoke");
    assert.equal(record.retroactivePilotBilling, false);
    assert.deepEqual(record.policies, []);
    assert.equal(record.gates[0].id, gate);
    assert.equal(record.gates[0].status, "revoked");
    assert.equal(record.gates[0].approver, "____");
    assert.equal(record.gates[0].evidence, "____");
    assert.equal(record.consentEvidence, "____");
    assert.equal(record.sandboxAcceptanceEvidence, "____");
    assert.ok(read(record.rollbackDisablePlan).includes("Nothing is enabled"));

    const inventory = JSON.parse(read("config/release-inventory.v1.json"));
    inventory.releaseRecords.push(record);
    const rail = inventory.rails.find(row => row.id === record.enabledRailIds[0]);
    rail.enabled = true;
    rail.releaseRecordId = record.id;
    assert.throws(() => parseReleaseInventory(inventory), /Missing matching track gate/u);
  });

  test(`M4-23: ${gate} general rollout requires a nonblank reconciled smoke review`, () => {
    for (const review of [undefined, null, "", "   "]) {
      assert.throws(() => releaseRecordV1Schema.parse({
        ...example, phase: "general", reconciledSmokeReview: review,
      }));
    }
    // A fictional reference proves format only; the checklist requires inspection
    // of its actual scope, execution, reconciliation and independent review.
    assert.equal(releaseRecordV1Schema.parse({
      ...example, phase: "general", reconciledSmokeReview: "fixture:reconciled-review",
    }).phase, "general");
  });
}
