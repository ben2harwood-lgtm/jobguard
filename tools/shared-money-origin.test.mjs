import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";

test("SH-1 money operations use bigint and export one reusable fee/allocation kernel", () => {
  const config=ts.readConfigFile("packages/core/tsconfig.json",ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,resolve("packages/core"));
  const program=ts.createProgram(parsed.fileNames,parsed.options),checker=program.getTypeChecker();
  const index=readFileSync("packages/core/src/index.ts","utf8");
  for(const name of ["cumulative-fee","receipt-allocation","extra-origin"]) assert.ok(index.includes(`export * from "./${name}.js"`));
  for(const file of ["packages/core/src/cumulative-fee.ts","packages/core/src/receipt-allocation.ts"]) {
    const source=program.getSourceFile(resolve(file));assert.ok(source);
    const visit=node=>{
      if(ts.isBinaryExpression(node)&&[ts.SyntaxKind.AsteriskToken,ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind)) {
        for(const operand of [node.left,node.right]) assert.ok(checker.getTypeAtLocation(operand).flags & ts.TypeFlags.BigIntLike,`${file}: monetary multiplication/division must be bigint`);
      }
      ts.forEachChild(node,visit);
    };visit(source);
  }
});

test("SV-1/ENT-4a/M4-8-S consumers must import SH-1 rather than define competing kernels",()=>{
  // These dependent leaves have not landed in this checkout. Enforce the seam
  // when their domain/repository files arrive, without inventing their features.
  const domains=readdirSync("packages/core/src").filter(f=>!f.endsWith(".test.ts") && /^(?:shadow|success|enterprise)-fee.*\.ts$/u.test(f));
  const allocators=readdirSync("packages/db/src").filter(f=>/^(?:receipt-to-line|receipt-allocation).*\.ts$/u.test(f));
  for(const file of domains.map(f=>`packages/core/src/${f}`)) {
    const text=readFileSync(file,"utf8");assert.match(text,/import\s*[\s\S]*?\bcalculateCumulativeFee\b[\s\S]*?from\s*["'](?:\.\/cumulative-fee\.js|@jobguard\/core)["']/u,`${file} must import SH-1`);
    assert.doesNotMatch(text,/(?:function|const)\s+calculateCumulativeFee\b/u);
    assert.doesNotMatch(text,/\b(?:divideRounded|multiplyRatio|Math\.round)\s*\(/u,`${file} must delegate cumulative rounding`);
  }
  for(const file of allocators.map(f=>`packages/db/src/${f}`)) {
    const text=readFileSync(file,"utf8");assert.match(text,/import\s*[\s\S]*?\ballocateReceiptToLines\b[\s\S]*?from\s*["']@jobguard\/core["']/u,`${file} must import SH-1`);
    assert.doesNotMatch(text,/(?:function|const)\s+allocateReceiptToLines\b/u);
  }
  assert.ok(existsSync("packages/core/src/cumulative-fee.test.ts"));
});

test("SH-1 registers the reserved migration and keeps its trigger functions inaccessible",()=>{
  const migrate=readFileSync("packages/db/src/migrate.ts","utf8"),sql=readFileSync("packages/db/migrations/0053_shared_money_origin.sql","utf8");
  assert.equal(migrate.match(/0053_shared_money_origin\.sql/gu)?.length,1);
  assert.match(sql,/variation_requires_origin[\s\S]*DEFERRABLE INITIALLY DEFERRED/u);
  assert.match(sql,/REVOKE ALL ON FUNCTION [\s\S]*FROM PUBLIC,jobguard_runtime;/u);
  assert.doesNotMatch(sql,/GRANT\s+(?:UPDATE|DELETE|TRUNCATE|EXECUTE)/iu);
});
