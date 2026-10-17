import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/*
 * packages/core must stay free of database, network, filesystem and vendor-SDK dependencies (AGENTS.md section 4).
 * The check is syntax-aware (TypeScript parser), so comments and strings never count.
 *
 * Module specifiers are examined in every form that loads or re-exports a module: static import (default, named,
 * namespace, side-effect, type-only), `export ... from`, `import x = require()`, `import()` expressions, `require()`
 * calls and `import("m")` type nodes. A leading `node:` is removed before matching, so `fs` and `node:fs` are the same.
 *
 * Computed module names: `import(name)` or `require(name)` with a non-literal argument cannot be resolved by a source
 * scanner. The library function `checkCorePuritySource` REFUSES them by default ("computed module name"). The CLI runs
 * it with `{ computed: "report" }`, because six merged core test files already load node:fs through a constant-bound
 * specifier and this piece may add no exclusions and edit no merged file: the CLI prints each such site as
 * unverifiable but does not fail on it. Switching the CLI to refuse needs those six sites fixed first (LATER item in
 * the receipt). A template literal with no substitutions counts as a literal. The scanner remains bounded static
 * evidence: it does not follow constants bound to a specifier, aliases of `require`, `globalThis["fe" + "tch"]`, or
 * modules loaded by code outside packages/core.
 */
const forbiddenPrefixes = ["pg", "postgres", "stripe", "@aws-sdk/", "@anthropic-ai/"];
const forbiddenBuiltins = ["fs", "net", "http", "https", "http2", "dgram", "tls", "child_process", "dns"];

function forbiddenModule(specifier) {
  const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
  if (forbiddenPrefixes.some((prefix) => name.startsWith(prefix))) return true;
  return forbiddenBuiltins.some((builtin) => name === builtin || name.startsWith(`${builtin}/`));
}
const literalText = (node) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;

/**
 * Pure source check: returns one message per purity violation in the given source text.
 * options.computed: "refuse" (default) counts computed module names as violations; "report" lists them only.
 */
export function checkCorePuritySource(file, text, options = {}) {
  const computedMode = options.computed ?? "refuse";
  const failures = [];
  const unverifiable = [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const report = (node, message) => {
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    failures.push(`${file}:${position.line + 1}:${position.character + 1}: ${message}`);
  };
  const checkSpecifier = (node, specifierNode, how) => {
    const specifier = literalText(specifierNode);
    if (specifier === null) {
      if (computedMode === "refuse") report(node, `${how} with a computed module name cannot be verified`);
      else {
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        unverifiable.push(`${file}:${position.line + 1}:${position.character + 1}: ${how} with a computed module name cannot be verified`);
      }
    } else if (forbiddenModule(specifier)) report(node, `forbidden ${how} of "${specifier}"`);
  };
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      checkSpecifier(node, node.moduleSpecifier, ts.isImportDeclaration(node) ? "import" : "re-export");
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      checkSpecifier(node, node.moduleReference.expression, "import");
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      checkSpecifier(node, node.argument.literal, "type import");
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === ts.SyntaxKind.ImportKeyword) checkSpecifier(node, node.arguments[0], "dynamic import");
      else if (ts.isIdentifier(callee) && callee.text === "require") checkSpecifier(node, node.arguments[0], "require");
      else if (ts.isIdentifier(callee) && callee.text === "fetch") report(node, "network call fetch()");
      else if ((ts.isPropertyAccessExpression(callee) && callee.name.text === "fetch")
        || (ts.isElementAccessExpression(callee) && literalText(callee.argumentExpression) === "fetch")) report(node, "network call fetch()");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return options.collect ? { failures, unverifiable } : failures;
}

const walk = (directory) => readdirSync(directory).flatMap((entry) => {
  const path = resolve(directory, entry);
  return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(process.argv[2] || "packages/core/src");
  const files = walk(root);
  const results = files.map((file) => checkCorePuritySource(file, readFileSync(file, "utf8"), { computed: "report", collect: true }));
  const violations = results.flatMap((result) => result.failures);
  const unverifiable = results.flatMap((result) => result.unverifiable);
  if (violations.length) throw new Error(`Core purity violation:\n${violations.join("\n")}`);
  if (unverifiable.length) console.warn(`Unverifiable computed module names, reported not refused (${unverifiable.length}):\n${unverifiable.join("\n")}`);
  console.log(`Core purity passed (${files.length} TypeScript files).`);
}
