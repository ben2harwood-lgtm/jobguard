// LATER-B19: shows, with fictional detector substitutions evaluated in a bounded socket-free subprocess, that the
// original combined fixture cannot separate an import-only detector from an execution-only one, while the isolated
// fixtures can. The production detector is imported read-only and never changed.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { forbiddenCommercialBoundarySource } from "./commercial-boundary-lint.mjs";

const combined = 'import type { CommercialAdapter } from "./commercial-adapter.port.js";\nadapter.execute();';
const importOnly = 'import type { CommercialAdapter } from "./commercial-adapter.port.js";';
const executionOnly = "adapter.execute();";
const outside = "apps/api/src/jobs/send.ts";

const runSubstitutions = () => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
const detectors = {
  importOnly: (s) => /commercial-adapter\\.port/u.test(s),
  executionOnly: (s) => /\\.execute\\s*\\(\\s*\\)/u.test(s),
};
const fixtures = ${JSON.stringify({ combined, importOnly, executionOnly })};
const out = {};
for (const [name, detect] of Object.entries(detectors)) out[name] = Object.fromEntries(Object.entries(fixtures).map(([k, v]) => [k, detect(v)]));
console.log(JSON.stringify(out));
`], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }));

test("B19-C1 the original combined fixture cannot distinguish the import-only from the execution-only detector", () => {
  const result = runSubstitutions();
  assert.equal(result.importOnly.combined, true);
  assert.equal(result.executionOnly.combined, true);
  assert.equal(forbiddenCommercialBoundarySource(combined, outside), true);
});

test("B19-C2 the isolated fixtures separate the two weakened detectors, and the real detector refuses both", () => {
  const result = runSubstitutions();
  assert.deepEqual([result.importOnly.importOnly, result.importOnly.executionOnly], [true, false]);
  assert.deepEqual([result.executionOnly.importOnly, result.executionOnly.executionOnly], [false, true]);
  assert.equal(forbiddenCommercialBoundarySource(importOnly, outside), true);
  assert.equal(forbiddenCommercialBoundarySource(executionOnly, outside), true);
});
