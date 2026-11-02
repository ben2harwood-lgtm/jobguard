/*
 * LATER-B19: bounded static scanner for the SH-1 "one money kernel" seam (BUILD_PLAN SH-1 section).
 *
 * It follows ACTUAL imports and calls (TypeScript parser, so comments and strings never count): a file "reaches" a
 * kernel when a non-test file references an imported binding that resolves to the kernel's definition, or to a module
 * that itself reaches it (wrapper chains, aliases, namespace imports, `@jobguard/core` and `export *` barrels).
 * Discovery is recursive over packages/core/src and packages/db/src, not top-level and filename-only.
 *
 * Limits (bounded evidence, not a proof of program behaviour): reachability is module level (a module that merely
 * contains a call to a reaching import counts, even if a given exported function does not use it); dynamic imports,
 * re-assigned or shadowed bindings, and calls through computed property names are not followed; candidate files are
 * chosen by path pattern, so a fee consumer with an unrelated name is not discovered by pattern (it is still found
 * when it reaches a kernel).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const CORE_INDEX = "packages/core/src/index.ts";

export const KERNELS = Object.freeze([
  Object.freeze({ name: "calculateCumulativeFee", file: "packages/core/src/cumulative-fee.ts" }),
  Object.freeze({ name: "allocateReceiptToLines", file: "packages/core/src/receipt-allocation.ts" }),
]);
const FEE = KERNELS[0], ALLOC = KERNELS[1];
const ROUNDING_HELPERS = ["divideRounded", "multiplyRatio"];

const isTest = (file) => /\.test\.ts$/u.test(file);
const baseName = (file) => posix.basename(file).replace(/\.ts$/u, "");
export const isFeeCandidate = (file) => /^packages\/core\/src\//u.test(file) && /(?:shadow|success|enterprise)/u.test(file) && /fee/u.test(baseName(file)) && file !== FEE.file;
export const isAllocatorCandidate = (file) => /^packages\/(?:core|db)\/src\//u.test(file) && /^(?:receipt-to-line|receipt-allocation|recovery-allocation)/u.test(baseName(file)) && file !== ALLOC.file;

export function createProject(files) {
  const texts = new Map(Object.entries(files).map(([path, text]) => [path.split("\\").join("/"), text]));
  return { texts, parsed: new Map(), reach: new Map() };
}
export function loadRepoProject(root = repoRoot) {
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith(".ts") && !path.endsWith(".d.ts") && !isTest(path)) files[relative(root, path)] = readFileSync(path, "utf8");
    }
  };
  for (const dir of ["packages/core/src", "packages/db/src"]) if (existsSync(join(root, dir))) walk(join(root, dir));
  return createProject(files);
}

function resolveSpecifier(project, from, specifier) {
  if (specifier === "@jobguard/core") return project.texts.has(CORE_INDEX) ? CORE_INDEX : null;
  if (!specifier.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), specifier)).replace(/\.(?:js|ts)$/u, "");
  for (const candidate of [`${base}.ts`, `${base}/index.ts`]) if (project.texts.has(candidate)) return candidate;
  return null;
}

function analyse(project, file) {
  if (project.parsed.has(file)) return project.parsed.get(file);
  const source = ts.createSourceFile(file, project.texts.get(file), ts.ScriptTarget.Latest, true);
  const info = { imports: new Map(), declared: new Set(), exportFrom: [], exportStar: [], exportLocal: new Map(), refs: [], nsRefs: [], calls: new Set() };
  const specifierOf = (node) => (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : null);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && specifierOf(statement) !== null && statement.importClause) {
      const spec = specifierOf(statement), clause = statement.importClause;
      if (clause.name) info.imports.set(clause.name.text, { spec, imported: "default" });
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) info.imports.set(clause.namedBindings.name.text, { spec, imported: "*" });
      else if (clause.namedBindings) for (const el of clause.namedBindings.elements) info.imports.set(el.name.text, { spec, imported: (el.propertyName ?? el.name).text });
    } else if (ts.isExportDeclaration(statement)) {
      const spec = specifierOf(statement);
      if (spec !== null && !statement.exportClause) info.exportStar.push(spec);
      else if (spec !== null && ts.isNamedExports(statement.exportClause)) for (const el of statement.exportClause.elements) info.exportFrom.push({ spec, imported: (el.propertyName ?? el.name).text, exported: el.name.text });
      else if (spec !== null && ts.isNamespaceExport(statement.exportClause)) { /* export * as ns: not followed */ }
      else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) for (const el of statement.exportClause.elements) info.exportLocal.set(el.name.text, (el.propertyName ?? el.name).text);
    } else if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) info.declared.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) if (ts.isIdentifier(decl.name)) info.declared.add(decl.name.text);
    }
  }
  const declNames = new Set();
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isName = (parent && (ts.isPropertyAccessExpression(parent) && parent.name === node))
        || (parent && (ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isClassDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent) || ts.isBindingElement(parent)) && parent.name === node)
        || (parent && ts.isExportSpecifier(parent));
      if (!isName) info.refs.push(node.text);
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) info.nsRefs.push({ ns: node.expression.text, name: node.name.text });
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Math" && node.name.text === "round") info.calls.add("Math.round");
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) info.calls.add(node.expression.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  void declNames;
  project.parsed.set(file, info);
  return info;
}

/** The file that defines `name` as seen from `file`, following `export *`, `export {..} from` and local re-exports. */
export function resolveExport(project, file, name, seen = new Set()) {
  const key = `${file}\0${name}`;
  if (seen.has(key) || !project.texts.has(file)) return null;
  seen.add(key);
  const info = analyse(project, file);
  if (info.declared.has(name)) return file;
  for (const el of info.exportFrom) if (el.exported === name) {
    const target = resolveSpecifier(project, file, el.spec);
    const found = target && resolveExport(project, target, el.imported, seen);
    if (found) return found;
  }
  const local = info.exportLocal.get(name);
  if (local !== undefined && local !== name && info.declared.has(local)) return file;
  if (local !== undefined && info.imports.has(local)) {
    const imp = info.imports.get(local), target = resolveSpecifier(project, file, imp.spec);
    const found = target && imp.imported !== "*" && resolveExport(project, target, imp.imported, seen);
    if (found) return found;
  }
  for (const spec of info.exportStar) {
    const target = resolveSpecifier(project, file, spec);
    const found = target && resolveExport(project, target, name, seen);
    if (found) return found;
  }
  return null;
}

function usedBindings(info) {
  const used = [];
  const refs = new Set(info.refs);
  for (const [local, imp] of info.imports) {
    if (imp.imported === "*") {
      for (const r of info.nsRefs) if (r.ns === local) used.push({ spec: imp.spec, name: r.name });
    } else if (refs.has(local)) used.push({ spec: imp.spec, name: imp.imported });
  }
  return used;
}

/** Does `file` (a non-test module other than the kernel's own file) reach `kernel` through real imported references? */
function reaches(project, file, kernel, visiting = new Set()) {
  const cacheKey = `${kernel.name}\0${file}`;
  if (project.reach.has(cacheKey)) return project.reach.get(cacheKey);
  if (visiting.has(file)) return false;
  visiting.add(file);
  let result = false;
  for (const { spec, name } of usedBindings(analyse(project, file))) {
    const target = resolveSpecifier(project, file, spec);
    if (!target) continue;
    const definedIn = resolveExport(project, target, name);
    if (!definedIn) continue;
    if (definedIn === kernel.file && name === kernel.name) { result = true; break; }
    if (definedIn !== file && definedIn !== kernel.file && reaches(project, definedIn, kernel, visiting)) { result = true; break; }
  }
  visiting.delete(file);
  if (visiting.size === 0) project.reach.set(cacheKey, result);
  return result;
}

/** Sorted non-test files that reach `kernel` by following real imports and wrapper modules. */
export function kernelConsumers(project, kernel) {
  return [...project.texts.keys()].filter(f => !isTest(f) && f !== kernel.file && reaches(project, f, kernel)).sort();
}

/** Messages for non-test files that declare a kernel's name outside its home, or round money directly in fee code. */
export function findCompetingKernels(project, kernels = KERNELS) {
  const found = [];
  for (const file of [...project.texts.keys()].filter(f => !isTest(f)).sort()) {
    const info = analyse(project, file);
    for (const kernel of kernels) if (file !== kernel.file && info.declared.has(kernel.name)) found.push(`${file}: declares competing ${kernel.name}`);
    if (isFeeCandidate(file)) for (const helper of [...ROUNDING_HELPERS, "Math.round"]) if (info.calls.has(helper)) found.push(`${file}: calls ${helper} directly; cumulative rounding belongs to SH-1`);
  }
  return found;
}

/** All violations of the seam: competing kernels, and candidate consumers that never reach their kernel. */
export function checkSharedMoneyOrigin(project) {
  const violations = [...findCompetingKernels(project)];
  for (const file of [...project.texts.keys()].filter(f => !isTest(f)).sort()) {
    if (isFeeCandidate(file) && !reaches(project, file, FEE)) violations.push(`${file}: fee consumer does not reach ${FEE.name} through its imports`);
    if (isAllocatorCandidate(file) && !reaches(project, file, ALLOC)) violations.push(`${file}: allocator does not reach ${ALLOC.name} through its imports`);
  }
  return violations;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = checkSharedMoneyOrigin(loadRepoProject());
  if (violations.length) { console.error(violations.join("\n")); process.exitCode = 1; }
  else console.log("Shared money origin scan passed.");
}
