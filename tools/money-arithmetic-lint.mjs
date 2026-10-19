import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const files = ["packages/core/src/money.ts", "packages/core/src/fee.ts"];
// Plain and compound (assignment) forms: `*`, `/`, `*=`, `/=`.
const forbiddenOperators = [
  ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.AsteriskEqualsToken, ts.SyntaxKind.SlashEqualsToken,
];

/** Pure source check: returns one message per forbidden multiplication/division in the given source text. */
export function checkMoneyArithmeticSource(file, text) {
  const failures = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && forbiddenOperators.includes(node.operatorToken.kind)) {
      const position = source.getLineAndCharacterOfPosition(node.operatorToken.getStart(source));
      failures.push(`${file}:${position.line + 1}:${position.character + 1}: multiplication/division belongs in the checked bigint rational module`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = files.flatMap((file) => checkMoneyArithmeticSource(file, readFileSync(file, "utf8")));
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("Money arithmetic boundary check passed.");
  }
}
