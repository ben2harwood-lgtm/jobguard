// LATER-B19 negative controls for tools/shared-money-origin-scan.mjs. Real-file cases read the checkout (read only);
// all competing/forged cases are fictional in-memory sources.
import assert from "node:assert/strict";
import test from "node:test";

const scan = await import("./shared-money-origin-scan.mjs");
const { KERNELS, loadRepoProject, createProject, kernelConsumers, findCompetingKernels, checkSharedMoneyOrigin } = scan;
const fee = KERNELS.find(k => k.name === "calculateCumulativeFee");
const alloc = KERNELS.find(k => k.name === "allocateReceiptToLines");

const KERNEL_FILES = {
  "packages/core/src/cumulative-fee.ts": "export function calculateCumulativeFee(input: unknown) { return input; }",
  "packages/core/src/receipt-allocation.ts": "export function allocateReceiptToLines(input: unknown) { return input; }",
  "packages/core/src/index.ts": 'export * from "./cumulative-fee.js";\nexport * from "./receipt-allocation.js";\nexport * from "./recovery-allocation.js";',
};
const project = (extra) => createProject({ ...KERNEL_FILES, ...extra });

test("B19-S1 discovery reaches the actual nested enterprise and shadow fee consumers", () => {
  const repo = loadRepoProject();
  const reached = kernelConsumers(repo, fee);
  assert.ok(reached.includes("packages/core/src/enterprise-domain/fee.ts"), "enterprise-domain/fee.ts");
  assert.ok(reached.includes("packages/core/src/shadow-domain/success-fee.ts"), "shadow-domain/success-fee.ts");
  assert.ok(!reached.includes("packages/core/src/cumulative-fee.ts"), "the kernel is not its own consumer");
  assert.ok(!reached.some(f => /\.test\.ts$/u.test(f)), "test files are never consumers");
  assert.deepEqual(checkSharedMoneyOrigin(repo), []);
});

test("B19-S2 the recovery allocator's existing wrapper chain reaches SH-1", () => {
  const repo = loadRepoProject();
  const reached = kernelConsumers(repo, alloc);
  assert.ok(reached.includes("packages/core/src/recovery-allocation.ts"), "core wrapper calls the kernel directly");
  assert.ok(reached.includes("packages/db/src/recovery-allocation-repository.ts"), "db repository reaches the kernel via @jobguard/core");
  assert.ok(reached.includes("packages/core/src/enterprise-domain/fee.ts"));
  assert.ok(reached.includes("packages/core/src/shadow-domain/success-fee.ts"));
});

test("B19-S3 a fictional nested competing kernel is detected", () => {
  const p = project({
    "packages/core/src/enterprise-domain/rival/fee.ts": "export function calculateCumulativeFee(i: unknown) { return i; }",
    "packages/core/src/shadow-domain/deep/success-fee.ts": 'import { divideRounded } from "../../rational.js";\nexport const f = (a: bigint) => divideRounded(a, 10n);',
    "packages/db/src/nested/receipt-allocation-x.ts": "export const allocateReceiptToLines = () => [];",
  });
  const competing = findCompetingKernels(p, KERNELS);
  assert.ok(competing.some(m => m.includes("enterprise-domain/rival/fee.ts") && m.includes("calculateCumulativeFee")), competing.join("\n"));
  assert.ok(competing.some(m => m.includes("shadow-domain/deep/success-fee.ts") && m.includes("divideRounded")), competing.join("\n"));
  assert.ok(competing.some(m => m.includes("nested/receipt-allocation-x.ts") && m.includes("allocateReceiptToLines")), competing.join("\n"));
  const violations = checkSharedMoneyOrigin(p);
  assert.ok(violations.some(m => m.includes("rival/fee.ts")));
  assert.ok(violations.some(m => m.includes("deep/success-fee.ts")), "a nested fee consumer that never reaches SH-1 is refused");
  // the canonical kernel files themselves are never competing kernels
  assert.deepEqual(findCompetingKernels(project({}), KERNELS), []);
});

test("B19-S4 aliases and legitimate relative imports resolve without a particular import spelling", () => {
  const p = project({
    "packages/core/src/shadow-domain/success-fee.ts": 'import { calculateCumulativeFee as ccf } from "../cumulative-fee.js";\nexport const x = () => ccf({});',
    "packages/core/src/enterprise-domain/fee.ts": 'import * as K from "../cumulative-fee";\nexport const y = () => K.calculateCumulativeFee({});',
    "packages/core/src/enterprise-domain/wrapper.ts": 'import { y } from "./fee.js";\nexport const z = () => y();',
    "packages/core/src/enterprise-fee-statement.ts": 'import { z } from "./enterprise-domain/wrapper.js";\nexport const s = () => z();',
    "packages/db/src/receipt-allocation-repo.ts": 'import { allocateReceiptToLines } from "@jobguard/core";\nexport const r = () => allocateReceiptToLines({});',
    "packages/db/src/receipt-to-line-wrapped.ts": 'import { mapIt } from "@jobguard/core";\nexport const q = () => mapIt();',
    "packages/core/src/recovery-allocation.ts": 'import { allocateReceiptToLines as alloc } from "./receipt-allocation.js";\nexport const mapIt = () => alloc({});',
  });
  const reached = kernelConsumers(p, fee);
  for (const f of ["packages/core/src/shadow-domain/success-fee.ts", "packages/core/src/enterprise-domain/fee.ts", "packages/core/src/enterprise-domain/wrapper.ts", "packages/core/src/enterprise-fee-statement.ts"]) assert.ok(reached.includes(f), f);
  assert.ok(kernelConsumers(p, alloc).includes("packages/db/src/receipt-to-line-wrapped.ts"), "wrapper chain through @jobguard/core");
  assert.deepEqual(checkSharedMoneyOrigin(p), []);
});

test("B19-S5 comments, strings and unused imports mentioning SH-1 cannot satisfy the check", () => {
  const p = project({
    "packages/core/src/shadow-domain/success-fee.ts": '// import { calculateCumulativeFee } from "../cumulative-fee.js"; calculateCumulativeFee({});\n/* calculateCumulativeFee */\nexport const s = "calculateCumulativeFee({})";',
    "packages/core/src/enterprise-domain/fee.ts": 'import { calculateCumulativeFee } from "../cumulative-fee.js";\nexport const unused = 1;',
    "packages/core/src/enterprise-fee-x.ts": 'import { other } from "./other.js";\nexport const c = () => other(); // calculateCumulativeFee',
    "packages/core/src/other.ts": "export const other = () => 1;",
  });
  const reached = kernelConsumers(p, fee);
  assert.ok(!reached.includes("packages/core/src/shadow-domain/success-fee.ts"));
  assert.ok(!reached.includes("packages/core/src/enterprise-domain/fee.ts"), "an import that is never called is not delegation");
  assert.ok(!reached.includes("packages/core/src/enterprise-fee-x.ts"));
  const violations = checkSharedMoneyOrigin(p);
  for (const f of ["shadow-domain/success-fee.ts", "enterprise-domain/fee.ts", "enterprise-fee-x.ts"]) assert.ok(violations.some(m => m.includes(f)), f);
});
