import { readFileSync } from "node:fs";
import ts from "typescript";

const files = ["packages/core/src/money.ts", "packages/core/src/fee.ts"];
const failures = [];
for (const file of files) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind)) {
      const position = source.getLineAndCharacterOfPosition(node.operatorToken.getStart(source));
      failures.push(`${file}:${position.line + 1}:${position.character + 1}: multiplication/division belongs in the checked bigint rational module`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Money arithmetic boundary check passed.");
}
