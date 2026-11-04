import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateFoundationGates } from "../packages/config/src/foundation-gates.ts";

const root = new URL("../", import.meta.url);
const rootPath = realpathSync(fileURLToPath(root)) + "/";
const read = path => {
  try {
    const file = realpathSync(fileURLToPath(new URL(path, root)));
    if (!file.startsWith(rootPath)) return undefined;
    return readFileSync(file, "utf8");
  } catch { return undefined; }
};

test("M0-13d: committed foundation pack is complete as an index, opens no gates, and contains no approvals", () => {
  const pack = validateFoundationGates(JSON.parse(read("config/foundation-gates.v1.json")), read);
  assert.deepEqual(pack.gates, { G0: "not_met", G1: "not_met" });
  assert.equal(pack.contractorPilotEvidence, null);
  assert.ok(pack.rows.every(row => row.ownerApproval === null));
});
