import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const effectSites = [
  ["apps/api/src/effects/fee-posting.ts", "D01"],
  ["apps/api/src/effects/tax-invoice.ts", "D02"],
  ["apps/api/src/effects/provider-dispatch.ts", "D04"],
];

test("every current controlled effect site imports and invokes the shared policy gate", () => {
  for (const [site, decision] of effectSites) {
    const source = readFileSync(site, "utf8");
    assert.match(source, /from "@jobguard\/config"/u, `${site} must import the shared gate`);
    assert.match(source, new RegExp(`requireApprovedDecision\\(mode, "${decision}", decision\\)`, "u"), `${site} must invoke its matching gate`);
  }
});
