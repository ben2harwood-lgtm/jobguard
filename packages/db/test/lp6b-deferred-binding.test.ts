import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

it("permits deferred binding only at the named retained call sites", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const found: string[] = [];
  function visitDirectory(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { visitDirectory(path); continue; }
      if (!path.endsWith(".ts") || path.endsWith(".test.ts")) continue;
      const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
      function visit(node: ts.Node) {
        if (ts.isImportSpecifier(node) && node.propertyName?.text === "withTenant") expect(node.name.text).toBe("withTenant");
        if (ts.isCallExpression(node) && /(?:^|\.)withTenant$/u.test(node.expression.getText(source)) && node.arguments.length > 3) {
          let ancestor: ts.Node | undefined = node;
          while (ancestor && !ts.isMethodDeclaration(ancestor)) ancestor = ancestor.parent;
          found.push(`${relative(root, path)}#${ancestor?.name?.getText(source)}:${node.arguments[3]!.getText(source)}`);
          expect(node.arguments).toHaveLength(4);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  visitDirectory(root);
  expect(found.sort()).toEqual([
    'audit-export-repository.ts#refuse:"audit-export-refusal"',
    'enterprise-identity-repository.ts#admin:"identity-sso"',
    'enterprise-identity-repository.ts#allowed:"identity-sso"',
    'enterprise-identity-repository.ts#view:"identity-sso"',
    'oidc-repository.ts#create:"identity-oidc"',
    'shadow-detection-repository.ts#persist:"shadow-persist"',
    'sso-required-repository.ts#command:"identity-sso-required"',
    'sso-required-repository.ts#detail:"identity-sso-required"',
    'sso-required-repository.ts#view:"identity-sso-required"',
  ].sort());
});
