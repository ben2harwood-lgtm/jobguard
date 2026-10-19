// LATER-B19 negative controls for tools/money-arithmetic-lint.mjs. Fictional in-memory source only.
import assert from "node:assert/strict";
import test from "node:test";

const { checkMoneyArithmeticSource } = await import("./money-arithmetic-lint.mjs");
const check = (text) => checkMoneyArithmeticSource("fixture/money.ts", text);

test("B19-M1 multiplication assignment on a money fixture is rejected", () => {
  const failures = check("let pence = 100;\npence *= 3;\n");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /fixture\/money\.ts:2:7/u);
});

test("B19-M2 division assignment on a money fixture is rejected", () => {
  const failures = check("let pence = 100;\npence /= 3;\n");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /fixture\/money\.ts:2:7/u);
});

test("B19-M3 existing multiplication and division refusals remain", () => {
  assert.equal(check("const a = 1 * 2;").length, 1);
  assert.equal(check("const a = 4 / 2;").length, 1);
  assert.equal(check("const a = 1 * 2; const b = 4 / 2;").length, 2);
});

test("B19-M4 comments, strings and permitted non-arithmetic source produce no findings", () => {
  const permitted = [
    "// pence *= 3 and pence /= 3 and a * b / c",
    "/* total *= rate; total /= rate; */",
    'const s = "a *= b /= c * d / e";',
    "const t = `price ${1 + 2} *= x`;",
    "const sum = 1 + 2 - 3;",
    "let n = 5; n += 1; n -= 1; n %= 2;",
    "const r = /ab*c\\/d/u;",
    'import { x } from "./a/b.js";',
  ].join("\n");
  assert.deepEqual(check(permitted), []);
});
