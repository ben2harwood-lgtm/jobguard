import { readFile } from "node:fs/promises";
import ts from "typescript";
import { expect, it } from "vitest";

const root = new URL("../../../../", import.meta.url);
const own = ["packages/core/src/enterprise-dashboard.ts", "packages/core/src/enterprise-dashboard-billing.ts", "packages/core/src/enterprise-signal.ts",
  "packages/db/src/enterprise-dashboard-repository.ts", "packages/db/src/enterprise-dashboard-queries.ts", "apps/api/src/contractor/enterprise-dashboard.application.ts"];
it("[E9-27 E9-34] advisory/read modules import only pure readers and the tenant/session boundary; no writer, provider, outbox or privileged client", async () => {
  const allowed: Record<string, string[]> = {
    core: ["zod", "./money.js", "./evidence-pack.js", "./receipt-allocation.js", "./enterprise-domain/contracts.js", "./enterprise-dashboard.js", "./contractor-billing.js", "./cumulative-fee.js", "./rational.js"],
    db: ["pg", "zod", "@jobguard/core", "./tenant-context.js", "./enterprise-dashboard-queries.js"],
    api: ["pg", "zod", "@jobguard/core", "@jobguard/db"],
  };
  for (const path of own) {
    const text = await readFile(new URL(path, root), "utf8"), ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const tier = path.startsWith("packages/core") ? "core" : path.startsWith("packages/db") ? "db" : "api";
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        expect(allowed[tier]).toContain(node.moduleSpecifier.text);
        const bindings = node.importClause?.namedBindings;
        if (node.moduleSpecifier.text === "@jobguard/db" && bindings && ts.isNamedImports(bindings))
          expect(bindings.elements.map(e => e.name.text).sort()).toEqual(["EnterpriseDashboardRepository", "VerifiedTenantContext", "contractorSessionContext"].sort());
        if (node.moduleSpecifier.text === "./tenant-context.js" && bindings && ts.isNamedImports(bindings))
          expect(bindings.elements.map(e => e.name.text).sort()).toEqual(["VerifiedTenantContext", "withTenant"].sort());
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "query")
        expect(["enterpriseDashboardScopeLockSql", "enterpriseDashboardSourceSql"]).toContain(node.arguments[0]?.getText(ast));
      if (ts.isCallExpression(node)) expect(node.expression.kind).not.toBe(ts.SyntaxKind.ImportKeyword);
      if (ts.isNewExpression(node)) expect(node.expression.getText(ast)).not.toMatch(/Pool|Dispatcher|Outbox|Executor|Writer|Worker/u);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    expect(text).not.toMatch(/\b(?:fetch|require|appendAuditBatch|dispatch|enqueue|executeCommercial|process\.env\.[A-Z_]*(?:DATABASE|CREDENTIAL))\s*\(/u);
  }
});
it("[E9-14 E9-26 E9-27 E9-31] the sole source statement is SELECT-only and calls only existing scoped read functions", async () => {
  const text = await readFile(new URL("packages/db/src/enterprise-dashboard-queries.ts", root), "utf8");
  const ast = ts.createSourceFile("queries.ts", text, ts.ScriptTarget.Latest, true);
  const declarations = ast.statements.filter(ts.isVariableStatement).flatMap(s => [...s.declarationList.declarations]);
  const lock = declarations.find(d => ts.isIdentifier(d.name) && d.name.text === "enterpriseDashboardScopeLockSql")?.initializer;
  expect(lock && ts.isStringLiteral(lock) ? lock.text : null).toBe("SELECT pg_advisory_xact_lock_shared(hashtextextended($1::uuid::text,54))");
  const sql = text.slice(text.indexOf("`\n") + 2, text.lastIndexOf("`"));
  const stripped = sql.replace(/--[^\n]*/gu, "").replace(/'(?:[^']|'')*'/gu, "''");
  expect(stripped.trim()).toMatch(/^WITH\s/u);
  expect(stripped).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|CREATE|ALTER|DROP|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|INTO|FOR\s+UPDATE)\b/iu);
  expect(stripped).not.toContain(";");
  const calls = [...stripped.matchAll(/app\.([a-z_]+)\s*\(/gu)].map(m => m[1]);
  expect([...new Set(calls)].sort()).toEqual(["contractor_job_allowed", "contractor_job_team", "contractor_member_active", "contractor_role_permits", "contractor_session", "xa_decision_id"].sort());
});
