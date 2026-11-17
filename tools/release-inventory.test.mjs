import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { parseReleaseInventory } from "../packages/config/src/release-inventory.ts";

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
