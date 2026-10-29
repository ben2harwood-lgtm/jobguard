import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// Factory references cannot escape into variables, aliases, properties or direct
// execute calls. Construction must pass straight into the checked gateway.
export function checkAiProviderBoundarySource(file, text) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const failures = [];
  const providerNamespaces = new Set(["ai"]);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) &&
      (statement.moduleSpecifier.text === "@jobguard/ai" || /(?:^|\/)claude-provider\.[cm]?[jt]s$/.test(statement.moduleSpecifier.text))) {
      providerNamespaces.add(bindings.name.text);
    }
  }
  const visit = node => {
    if (ts.isElementAccessExpression(node)) {
      let target = node.expression;
      while (ts.isParenthesizedExpression(target) || ts.isAsExpression(target) || ts.isNonNullExpression(target)) target = target.expression;
      if (ts.isIdentifier(target) && providerNamespaces.has(target.text)) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${file}:${line + 1}: computed AI provider access must not bypass new AiGateway()`);
      }
    }
    if ((ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === "createDarkClaudeProvider") {
      const parent = node.parent;
      const declaration = file === "packages/ai/src/claude-provider.ts" && ts.isFunctionDeclaration(parent) && parent.name === node;
      const namedImport = ts.isImportSpecifier(parent) && parent.name === node && !parent.propertyName;
      const wrappedCall = ts.isIdentifier(node) && ts.isCallExpression(parent) && parent.expression === node &&
        ts.isNewExpression(parent.parent) && ts.isIdentifier(parent.parent.expression) &&
        parent.parent.expression.text === "AiGateway" && parent.parent.arguments?.[0] === parent;
      if (!declaration && !namedImport && !wrappedCall) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        failures.push(`${file}:${line + 1}: dark Claude provider must be constructed directly inside new AiGateway()`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return failures;
}

export function checkAiProviderBoundary(root = process.cwd()) {
  const failures = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", ".next", ".turbo"].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
        failures.push(...checkAiProviderBoundarySource(relative(root, path), readFileSync(path, "utf8")));
      }
    }
  };
  for (const directory of ["apps", "packages"]) walk(join(root, directory));
  if (failures.length) throw new Error(failures.join("\n"));
}
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) checkAiProviderBoundary();
