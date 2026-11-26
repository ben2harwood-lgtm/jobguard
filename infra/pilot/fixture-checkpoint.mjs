import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const target = "/fixture-checkpoints/checkpoint.json";
const expected = {
  version: "fixture-checkpoint.v1",
  sequence: 1,
  hash: createHash("sha256").update("fictional-checkpoint").digest("hex"),
};
if (process.argv[2] === "write") {
  await writeFile(target, JSON.stringify(expected), { flag: "wx", mode: 0o600 });
}
assert.deepEqual(JSON.parse(await readFile(target, "utf8")), expected);
console.log("PILOT_FIXTURE_CHECKPOINT_VERIFIED");
