import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * M0-6L card: "the only callers that construct a verifiedContext/effective_tenant_id for withTenant are the authenticated
 * principal bridge". This scans ALL application source (apps/api/src, apps/web/app, app-level files, packages/<each>/src
 * and /tools, and repository-root tools/) with the
 * TypeScript parser, not text search, and fails on any constructor call, alias, cast to VerifiedTenantContext or
 * effective-tenant identifier outside explicit, individually tested categories:
 *
 *   real       apps/api/src/auth/principal-bridge.ts: exactly one call, fed by the verified membership lookup.
 *   definition packages/db/src/tenant-context.ts: exactly TENANT-STAMP-1's two constructors, each with one frozen
 *              literal cast and one add to its module-private WeakSet; withTenant must check the stamp first.
 *   worker     apps/api/src/worker.ts: one queued-job constructor call, fed only by a strictly validated queue payload (server-created, never a request).
 *   synthetic  retained practice-sandbox composition: ONLY the files named in APPROVED_SYNTHETIC_FILES (a new caller needs a
 *              reviewed edit to that list). Every call/cast is fed ONLY the fixed DEMO_* tenant and membership constants, and
 *              those identifiers must resolve to the authoritative fixture module (see below). The file carries no
 *              request-derived tenant selector. Reachability is separately proven by identity.test.ts (global Nest guard;
 *              synthetic cookie refused outside synthetic_demo) and by the web adapters, which check JOBGUARD_ENV.
 *   practice   APPROVED_PRACTICE_FILES: the seven source-pinned, reviewed membership bridges (three from main 41d83ac, four from ENT-2).
 *              Only practice-session.ts's exact authentication result may carry its stamped context in a principal
 *              envelope. No general container exception, production/pilot authority or approval follows from this list.
 *   rehearsal  packages/db/tools/synthetic-restore.mjs: disposable synthetic restore rehearsal that refuses any other mode.
 *
 * Aliases (round 3): the constructor and the context type may be imported, exported and destructured ONLY under their own
 * names, so every use is visible to the scan by name. A local type alias, interface, `import X = ns.T`,
 * `ReturnType<typeof constructor>` or `typeof withTenant` is a derivation of the context type: it is tracked to a fixed point
 * within the file when it is a cast target, and exporting one is refused (another file could import and cast it).
 * Context values follow an allow-list (round 7): pass whole as a call argument, return whole, bind whole to a const
 * that follows these same rules, or read .tenantId as a value; non-escaping !/nullish/typeof checks are also permitted. Every other use is refused at the original use, including
 * containers, destructuring, spread/rest, member storage/writes, computed access/keys and mutable bindings. All Object.*
 * and Reflect.* helpers, and their static aliases, are refused (also JSON and structuredClone for earlier regressions).
 * Inferred const aliases and local forwarding function returns propagate provenance to a fixed point. Whole-context
 * returns from closures passed as call arguments are refused; ordinary whole returns/getters remain allowed.
 * Only the context definition may freeze its literal BEFORE minting; the principal bridge returns the minted value whole.
 *
 * Fixture binding (round 3): a name such as DEMO_TENANT_ID is trusted because of WHERE IT COMES FROM, not because of how it
 * is spelled. In all application source such a name may only be an unaliased import from `@jobguard/db` or, inside
 * packages/db/src, from ./demo-seed; any local declaration, parameter, destructuring, catch variable, rename, default or
 * namespace import is refused, and packages/db/src/demo-seed.ts itself must hold each as an exported const literal UUID.
 * An object passed to the constructor by name resolves only to exactly one top-level const declaration, and every
 * constructor argument must be a plain literal (no spread, computed key, accessor or duplicate property). Property uses
 * are checked through expression wrappers and nested destructuring targets, including deletion and iteration assignments.
 *
 * Limits, stated so nobody mistakes the scan for a type-checker: it cannot see a context laundered through `any`/`never`
 * or a type derived through an arbitrary signature (for example Parameters<SomeClass["method"]>[0]), or a dynamically
 * selected reconstruction helper. Pass-through functions (O11 Promise.resolve, R8 Promise.all, R10 an imported generic
 * patch helper), and `id<typeof c>({tenantId} as any)` (a type argument with an `any` cast), are outside a per-file
 * syntax scan. TENANT-STAMP-1's runtime check refuses that reconstruction. It closes context substitution: withTenant
 * rejects every unregistered reconstruction before connecting. Returning the unchanged stamped object is safe.
 * TypeScript branding and this scan alone do not prove runtime provenance; constructor callers remain a reviewed
 * authentication trust boundary, and the stamp is not proof against compromised authentication/database credentials.
 *
 * Tests, fixtures and generated output are not application source.
 */
const REAL = "apps/api/src/auth/principal-bridge.ts";
const DEFINITION = "packages/db/src/tenant-context.ts";
const WORKER = "apps/api/src/worker.ts";
const REHEARSAL = "packages/db/tools/synthetic-restore.mjs";
const FIXTURE_MODULE = "packages/db/src/demo-seed.ts";
const SYNTHETIC_ROOTS = ["apps/api/src/", "packages/db/src/"];
/** The complete, explicit set of retained synthetic-sandbox files that may build a context from the fixed DEMO identity. */
const APPROVED_SYNTHETIC_FILES = [
  "packages/db/src/demo-runtime.ts",
  "packages/db/src/fee-illustration-repository.ts",
  "packages/db/src/recovery-demo-repository.ts",
];
/** Reviewed persisted practice-session bridges only; this list grants no pilot/production authority. */
const APPROVED_PRACTICE_FILES = [
  "packages/db/src/practice-session.ts",
  "packages/db/src/contractor-repository.ts",
  "packages/db/src/contractor-party-repository.ts",
  "packages/db/src/work-order-repository.ts",
  "packages/db/src/sor-repository.ts",
  "packages/db/src/job-scheduling-repository.ts",
  "packages/db/src/work-order-fixtures.ts",
];
// Bound to the source-inspected main 41d83ac implementations and ENT-2's four contractor files at main fd81315
// (Ben, 9 Oct, card jobguard-m06l-scanner-ent2-files-2026-10-09), not arbitrary code at these paths.
// A change to any bridge requires renewed caller review; the hashes are NOT computed from the tree under test.
const REVIEWED_PRACTICE_SOURCES: Readonly<Record<string, string>> = {
  "packages/db/src/practice-session.ts": "9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14",
  "packages/db/src/contractor-repository.ts": "56b95b80360434f0cf58376ef2ec44d0354b194e5080bcfd9414ac283971006c",
  "packages/db/src/contractor-party-repository.ts": "e5852288e5355b53f7548c4d5741aef54ee55a2b8a66dd56a54b08963cd1fdb0",
  "packages/db/src/work-order-repository.ts": "4d101604ad160801f1d70b24ee7e3f55287bed2f3d53b9ed83b3d0113d4580a3",
  "packages/db/src/sor-repository.ts": "45e54b465b2a12747d838ea1cbb7c6a8d859f12894848940be5401ab17e000d5",
  "packages/db/src/job-scheduling-repository.ts": "ce9b3fee004db9e7e303511f169d55b4a8a2339521927816c9b378b79517e52d",
  "packages/db/src/work-order-fixtures.ts": "cfcd6d41a3618dd626544b3443e52fdba2c879accacb38637e49e531b4137386",
};
const reviewedPracticeSource = (file: SourceFile) => REVIEWED_PRACTICE_SOURCES[file.path] === createHash("sha256").update(file.text).digest("hex");
const REQUEST_DERIVED = /x-tenant-id|tenantHeader|request\.headers|searchParams|\bcookies\s*\(|principal-bridge|resolveVerifiedTenantContext|IdentityApplication/u;
// A synthetic service may read a client-supplied tenant only to REFUSE any value other than the fixed demo tenant.
const CLIENT_TENANT = /requested_tenant_id|requestedTenantId/u;
const CLIENT_TENANT_REFUSED = /requested_tenant_id\s*!==\s*DEMO_TENANT_ID/u;
const CONSTRUCTOR = "verifiedTenantContextFromMembership";
const QUEUED_CONSTRUCTOR = "verifiedTenantContextForQueuedJob";
const CONSTRUCTORS = new Set([CONSTRUCTOR, QUEUED_CONSTRUCTOR]);
const CONTEXT_TYPE = "VerifiedTenantContext";
const WATCHED = new Set([...CONSTRUCTORS, CONTEXT_TYPE]);
const DEMO_TENANT = new Set(["DEMO_TENANT_ID", "DEMO_EMPTY_TENANT_ID"]);
/** Names whose meaning is "the fixed demo identity" and therefore must come from the fixture module. */
const FIXTURE_NAME = /^DEMO_(?:[A-Z]+_)*(?:TENANT_ID|MEMBERSHIP_ID|IDENTITY_USER_ID)$/u;
const UUID_LITERAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// A type that is the context type without naming it: the constructor's return type, or the context parameter of withTenant.
const CONTEXT_DERIVED = /\bReturnType\s*<\s*typeof\s+[\w$.]*verifiedTenantContext(?:FromMembership|ForQueuedJob)\b|\btypeof\s+[\w$.]*withTenant\b/u;
// Cheap pre-filter so only files that can possibly hold an occurrence are parsed (a file without any of these words cannot
// construct, alias, cast to or assign an effective tenant context, nor bind a fixture constant). Keeps the scan fast.
const RELEVANT = /verifiedTenantContextFromMembership|verifiedTenantContextForQueuedJob|VerifiedTenantContext|effective_tenant_id|effectiveTenantId|resolveVerifiedTenantContext|typeof\s+[\w$.]*withTenant|DEMO_[A-Z_]*(?:TENANT_ID|MEMBERSHIP_ID|IDENTITY_USER_ID)/u;

interface SourceFile { path: string; text: string }
type Occurrence =
  | { kind: "call"; argument: ts.Expression | undefined; node: ts.Node }
  | { kind: "declaration" | "reference" | "effective"; node: ts.Node }
  | { kind: "cast"; operand: ts.Expression; node: ts.Node };
/** One binding of a name in a file, at any scope. */
type Binding =
  | { kind: "import"; node: ts.Node; module: string; aliased: boolean }
  | { kind: "variable"; node: ts.VariableDeclaration }
  | { kind: "other"; node: ts.Node };
interface Analysis { found: Occurrence[]; source: ts.SourceFile; problems: string[]; bindings: Map<string, Binding[]> }

const unwrap = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
};
/** Follow wrappers around a use, rather than just inspecting its immediate parent. */
function outerExpression(node: ts.Node): ts.Node {
  let current = node;
  while ((ts.isAsExpression(current.parent) || ts.isTypeAssertionExpression(current.parent) || ts.isParenthesizedExpression(current.parent) || ts.isNonNullExpression(current.parent) || ts.isSatisfiesExpression(current.parent)) && current.parent.expression === current) current = current.parent;
  return current;
}
const literalKey = (name: ts.PropertyName): string | undefined =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name) ? name.text : undefined;
const propertyInitializer = (literal: ts.ObjectLiteralExpression, name: string): ts.Expression | "shorthand" | undefined => {
  for (const property of literal.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return "shorthand";
    if (ts.isPropertyAssignment(property) && literalKey(property.name) === name) return unwrap(property.initializer);
  }
  return undefined;
};
/** A fixed object: only literal, non-duplicated keys with plain values, so no spread, computed key or accessor can override a property. */
const plainLiteral = (literal: ts.ObjectLiteralExpression): boolean => {
  const seen = new Set<string>();
  for (const property of literal.properties) {
    const name = ts.isShorthandPropertyAssignment(property) ? property.name.text : ts.isPropertyAssignment(property) ? literalKey(property.name) : undefined;
    if (name === undefined || seen.has(name)) return false;
    seen.add(name);
  }
  return true;
};
const identifierIn = (value: ts.Expression | "shorthand" | undefined, allowed: (name: string) => boolean): boolean =>
  value !== undefined && value !== "shorthand" && ts.isIdentifier(value) && allowed(value.text);
const bindingNames = (name: ts.BindingName): ts.Identifier[] =>
  ts.isIdentifier(name) ? [name] : name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
const isExported = (node: ts.Node): boolean => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
const moduleText = (specifier: ts.Expression | undefined): string | undefined => specifier && ts.isStringLiteral(specifier) ? specifier.text : undefined;
/** The only modules a fixture constant may come from: the db package entry, or (inside packages/db/src) the fixture module. */
function authoritativeModule(from: string, specifier: string | undefined): boolean {
  if (specifier === undefined) return false;
  if (specifier === "@jobguard/db") return true;
  return specifier.startsWith(".") && posix.join(posix.dirname(from), specifier).replace(/\.(?:js|ts|mjs)$/u, "") === FIXTURE_MODULE.replace(/\.ts$/u, "");
}

const parsed = new Map<string, Analysis>();
function occurrences(file: SourceFile): Analysis {
  const key = `${file.path}\0${file.text}`;
  const cached = parsed.get(key);
  if (cached) return cached;
  const result = parse(file);
  parsed.set(key, result);
  return result;
}
function parse(file: SourceFile): Analysis {
  if (!RELEVANT.test(file.text)) return { found: [], source: ts.createSourceFile(file.path, "", ts.ScriptTarget.Latest), problems: [], bindings: new Map() };
  const kind = /\.(mjs|js)$/u.test(file.path) ? ts.ScriptKind.JS : file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
  const at = (node: ts.Node) => `${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
  const found: Occurrence[] = [];
  const problems: string[] = [];
  const bindings = new Map<string, Binding[]>();
  const bind = (name: string, binding: Binding) => { const list = bindings.get(name); if (list) list.push(binding); else bindings.set(name, [binding]); };
  const assertions: (ts.AsExpression | ts.TypeAssertion)[] = [];
  const values: (ts.VariableDeclaration | ts.ParameterDeclaration)[] = [];
  const functions: (ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration)[] = [];
  const objects: ts.ObjectLiteralExpression[] = [];
  const assignments: ts.BinaryExpression[] = [];
  const contextUses: ts.Expression[] = [];
  const members: (ts.PropertyDeclaration | ts.PropertySignature)[] = [];
  // Type declarations that may be (an alias of) the context type, and local names exported without a module specifier.
  const typeNames: { name: string; text: string; node: ts.Node; exported: boolean }[] = [];
  const exportedLocals: { name: string; node: ts.Node }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) assertions.push(node);
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) values.push(node);
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) functions.push(node);
    if (ts.isObjectLiteralExpression(node)) objects.push(node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) assignments.push(node);
    if (ts.isIdentifier(node) || ts.isCallExpression(node) || ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) contextUses.push(node);
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) members.push(node);

    // Bindings of every name, at any scope (variables, parameters, patterns, functions, classes, imports).
    if (ts.isVariableDeclaration(node)) for (const id of bindingNames(node.name)) bind(id.text, ts.isIdentifier(node.name) ? { kind: "variable", node } : { kind: "other", node });
    else if (ts.isParameter(node)) for (const id of bindingNames(node.name)) bind(id.text, { kind: "other", node });
    else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) && node.name && ts.isIdentifier(node.name)) bind(node.name.text, { kind: "other", node });
    else if (ts.isImportClause(node) && node.name) bind(node.name.text, { kind: "other", node });
    else if (ts.isNamespaceImport(node)) bind(node.name.text, { kind: "other", node });
    else if (ts.isImportEqualsDeclaration(node)) {
      bind(node.name.text, { kind: "other", node });
      if (!ts.isExternalModuleReference(node.moduleReference)) typeNames.push({ name: node.name.text, text: node.moduleReference.getText(source), node, exported: isExported(node) });
    } else if (ts.isImportSpecifier(node)) {
      const declaration = node.parent.parent.parent;
      bind(node.name.text, { kind: "import", node, module: moduleText(declaration.moduleSpecifier) ?? "", aliased: node.propertyName !== undefined && node.propertyName.text !== node.name.text });
    } else if (ts.isTypeAliasDeclaration(node)) typeNames.push({ name: node.name.text, text: node.type.getText(source), node, exported: isExported(node) });
    else if (ts.isInterfaceDeclaration(node)) typeNames.push({ name: node.name.text, text: (node.heritageClauses ?? []).filter(h => h.token === ts.SyntaxKind.ExtendsKeyword).map(h => h.getText(source)).join(" "), node, exported: isExported(node) });

    // Renames of the constructor or the context type: every use must stay visible to the scan by its own name.
    if ((ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) && node.propertyName && node.propertyName.text !== node.name.text && (WATCHED.has(node.propertyName.text) || WATCHED.has(node.name.text))) {
      problems.push(`${at(node)} renames ${node.propertyName.text} to ${node.name.text}: the context constructor and type may not be imported or re-exported under another name`);
    }
    if (ts.isBindingElement(node) && node.propertyName && !ts.isComputedPropertyName(node.propertyName) && WATCHED.has(node.propertyName.text) && !(ts.isIdentifier(node.name) && node.name.text === node.propertyName.text)) {
      problems.push(`${at(node)} destructures ${node.propertyName.text} under another name: the context constructor and type may not be bound under another name`);
    }
    if (ts.isExportSpecifier(node)) {
      const declaration = node.parent.parent;
      const local = (node.propertyName ?? node.name).text;
      if (!declaration.moduleSpecifier) exportedLocals.push({ name: local, node });
      // A fixture constant may only be re-exported under its own name, from the fixture module.
      if (FIXTURE_NAME.test(node.name.text) || FIXTURE_NAME.test(local)) {
        if (local !== node.name.text || (declaration.moduleSpecifier && !authoritativeModule(file.path, moduleText(declaration.moduleSpecifier)))) {
          problems.push(`${at(node)} fixture constant ${node.name.text} must be exported only under its own name and only from the fixture module`);
        }
      }
    }

    const named = ts.isIdentifier(node) || ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.parent !== undefined && (ts.isElementAccessExpression(node.parent) && node.parent.argumentExpression === node || ts.isPropertyAssignment(node.parent) && node.parent.name === node));
    if (named && (node as ts.Identifier | ts.StringLiteral).text.match(/^(effective_tenant_id|effectiveTenantId)$/u)) found.push({ kind: "effective", node });
    if (named && CONSTRUCTORS.has((node as ts.Identifier | ts.StringLiteral).text)) {
      const parent = node.parent;
      if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) { /* module plumbing, not a use */ }
      else if (ts.isTypeQueryNode(parent)) { /* type position only */ }
      else if (ts.isFunctionDeclaration(parent) && parent.name === node) found.push({ kind: "declaration", node });
      else {
        const callee = ts.isPropertyAccessExpression(parent) && parent.name === node ? parent : ts.isElementAccessExpression(parent) && parent.argumentExpression === node ? parent : node;
        const call = callee.parent;
        if (ts.isCallExpression(call) && call.expression === callee) found.push({ kind: "call", argument: call.arguments[0], node: call });
        else found.push({ kind: "reference", node });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  // Which local names denote the context type: the type itself plus every alias, interface or derivation of it, to a fixed point.
  const tainted = new Set([CONTEXT_TYPE]);
  for (let changed = true; changed;) {
    changed = false;
    const taint = new RegExp(`\\b(?:${[...tainted].map(name => name.replace(/\$/gu, "\\$")).join("|")})\\b`, "u");
    for (const declared of typeNames) if (!tainted.has(declared.name) && (taint.test(declared.text) || CONTEXT_DERIVED.test(declared.text))) { tainted.add(declared.name); changed = true; }
  }
  let taintPattern = new RegExp(`\\b(?:${[...tainted].map(name => name.replace(/\$/gu, "\\$")).join("|")})\\b`, "u");
  const contextValues = new Set<string>();
  const contextMembers = new Set<string>();
  const contextType = (type: ts.TypeNode | undefined): boolean => {
    if (!type) return false;
    if (taintPattern.test(type.getText(source)) || CONTEXT_DERIVED.test(type.getText(source))) return true;
    if (ts.isTypeQueryNode(type)) {
      const name = type.exprName;
      if (ts.isIdentifier(name) ? contextValues.has(name.text) : ts.isQualifiedName(name) && contextMembers.has(name.right.text)) return true;
    }
    if (ts.isIndexedAccessTypeNode(type) && ts.isLiteralTypeNode(type.indexType) && ts.isStringLiteralLike(type.indexType.literal) && contextMembers.has(type.indexType.literal.text)) return true;
    // typeof values and indexed members can occur within unions/utility types and aliases.
    return ts.forEachChild(type, child => ts.isTypeNode(child) && contextType(child) ? true : undefined) === true;
  };

  // The allow-list is checked at the original context use. In particular, a context cannot enter a
  // container, binding pattern or reflection helper in the first place; tracking every way OUT of a
  // container is unnecessary. Propagation only identifies additional uses to check, never authorizes one.
  for (const value of values) if (ts.isIdentifier(value.name) && contextType(value.type)) contextValues.add(value.name.text);
  for (const member of members) if (contextType(member.type)) { const name = literalKey(member.name); if (name) contextMembers.add(name); }
  const contextFunctions = new Set<string>(["resolveVerifiedTenantContext"]);
  const functionName = (fn: typeof functions[number]): string | undefined =>
    fn.name && ts.isIdentifier(fn.name) ? fn.name.text : ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name) ? fn.parent.name.text : undefined;
  for (const fn of functions.filter(fn => contextType(fn.type))) {
    const name = functionName(fn);
    if (name) contextFunctions.add(name);
  }
  const callName = (expression: ts.Expression): string | undefined => {
    const value = unwrap(expression);
    if (ts.isIdentifier(value)) return value.text;
    if (ts.isPropertyAccessExpression(value)) {
      const receiver = callName(value.expression);
      return receiver === undefined ? undefined : `${receiver}.${value.name.text}`;
    }
    if (ts.isElementAccessExpression(value) && value.argumentExpression && ts.isStringLiteralLike(value.argumentExpression)) {
      const receiver = callName(value.expression);
      return receiver === undefined ? undefined : `${receiver}.${value.argumentExpression.text}`;
    }
    return undefined;
  };
  // Refuse every Object/Reflect helper, rather than maintaining a list of mutation methods.
  // JSON/structuredClone remain refused to preserve earlier serialization/copy regressions.
  const helperValues = new Set(["Object", "Reflect", "JSON", "structuredClone", "Array", "Map", "Set"]);
  // Known containers cannot receive the context through push/add/set (or a helper alias of these).
  const containerType = (type: ts.TypeNode | undefined): boolean => type !== undefined && /\b(?:Array|ReadonlyArray|Map|ReadonlyMap|Set|ReadonlySet)\b|\[\]/u.test(type.getText(source));
  const helperMembers = new Set(members.filter(member => containerType(member.type)).map(member => literalKey(member.name)).filter((name): name is string => name !== undefined));
  for (const value of values) if (containerType(value.type)) for (const id of bindingNames(value.name)) helperValues.add(id.text);
  const helperMemo = new Map<ts.Expression, boolean>();
  const helperExpression = (expression: ts.Expression): boolean => {
    const cached = helperMemo.get(expression);
    if (cached !== undefined) return cached;
    const result = inspectHelperExpression(expression);
    helperMemo.set(expression, result);
    return result;
  };
  const inspectHelperExpression = (expression: ts.Expression): boolean => {
    const value = unwrap(expression);
    if (ts.isIdentifier(value)) return helperValues.has(value.text);
    if (ts.isPropertyAccessExpression(value)) return helperMembers.has(value.name.text) || ["Object", "Reflect", "JSON", "structuredClone", "Array", "Map", "Set"].includes(value.name.text) || helperExpression(value.expression);
    if (ts.isElementAccessExpression(value)) return helperExpression(value.expression) || ts.isStringLiteralLike(value.argumentExpression) && helperValues.has(value.argumentExpression.text);
    if (ts.isCallExpression(value) || ts.isNewExpression(value)) return helperExpression(value.expression);
    if (ts.isConditionalExpression(value)) return helperExpression(value.whenTrue) || helperExpression(value.whenFalse);
    if (ts.isArrayLiteralExpression(value)) return true;
    if (ts.isObjectLiteralExpression(value)) return value.properties.some(property =>
      ts.isPropertyAssignment(property) ? helperExpression(property.initializer) : ts.isShorthandPropertyAssignment(property) ? helperValues.has(property.name.text) : ts.isSpreadAssignment(property) && helperExpression(property.expression));
    return false;
  };
  const contextMemo = new Map<ts.Expression, boolean>();
  const contextExpression = (expression: ts.Expression): boolean => {
    const cached = contextMemo.get(expression);
    if (cached !== undefined) return cached;
    const result = inspectContextExpression(expression);
    contextMemo.set(expression, result);
    return result;
  };
  const inspectContextExpression = (expression: ts.Expression): boolean => {
    if ((ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression) || ts.isSatisfiesExpression(expression)) && contextType(expression.type)) return true;
    const value = unwrap(expression);
    if (ts.isIdentifier(value)) return contextValues.has(value.text);
    if (ts.isAwaitExpression(value)) return contextExpression(value.expression);
    if (ts.isPropertyAccessExpression(value)) return contextMembers.has(value.name.text);
    if (ts.isCallExpression(value)) {
      const callee = unwrap(value.expression);
      if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) return returnValues(callee).some(contextExpression);
      const name = callName(callee)?.split(".").at(-1);
      return name !== undefined && (CONSTRUCTORS.has(name) || contextFunctions.has(name));
    }
    return false;
  };
  const returnValues = (fn: typeof functions[number]): ts.Expression[] => {
    if (!fn.body) return [];
    if (!ts.isBlock(fn.body)) return [fn.body];
    const returned: ts.Expression[] = [];
    const visitReturns = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) return; // A nested function has its own return provenance.
      if (ts.isReturnStatement(node) && node.expression) returned.push(node.expression);
      ts.forEachChild(node, visitReturns);
    };
    visitReturns(fn.body);
    return returned;
  };
  const returns = new Map(functions.map(fn => [fn, returnValues(fn)]));
  const functionsByName = new Map<string, typeof functions>();
  for (const fn of functions) {
    const name = functionName(fn);
    if (name) functionsByName.set(name, [...(functionsByName.get(name) ?? []), fn]);
  }
  const localCalls = contextUses.filter(ts.isCallExpression).flatMap(call => {
    const callee = unwrap(call.expression);
    const targets = ts.isArrowFunction(callee) || ts.isFunctionExpression(callee) ? [callee] : ts.isIdentifier(callee) ? functionsByName.get(callee.text) ?? [] : [];
    return targets.map(fn => ({ call, fn }));
  });
  const inferredParameters = new Set<ts.ParameterDeclaration>();
  for (let changed = true; changed;) {
    changed = false;
    contextMemo.clear();
    helperMemo.clear();
    for (const { call, fn } of localCalls) {
      for (let i = 0; i < fn.parameters.length; i++) {
        const parameter = fn.parameters[i]!, argument = call.arguments[i];
        if (argument && contextExpression(argument)) {
          inferredParameters.add(parameter);
          for (const id of bindingNames(parameter.name)) if (!contextValues.has(id.text)) { contextValues.add(id.text); changed = true; }
        }
      }
    }
    // Type/value provenance is mutually dependent: typeof an inferred const, and aliases of it, need another pass.
    for (const declared of typeNames) {
      if (ts.isTypeAliasDeclaration(declared.node) && !tainted.has(declared.name) && contextType(declared.node.type)) {
        tainted.add(declared.name); changed = true;
        taintPattern = new RegExp(`\\b(?:${[...tainted].map(name => name.replace(/\$/gu, "\\$")).join("|")})\\b`, "u");
      }
    }
    for (const member of members) {
      const name = literalKey(member.name);
      if (name && !contextMembers.has(name) && contextType(member.type)) { contextMembers.add(name); changed = true; }
    }
    for (const fn of functions) {
      const name = functionName(fn);
      if (name && !contextFunctions.has(name) && contextType(fn.type)) { contextFunctions.add(name); changed = true; }
    }
    for (const value of values) {
      if (ts.isIdentifier(value.name) && !contextValues.has(value.name.text) && contextType(value.type)) { contextValues.add(value.name.text); changed = true; }
      if (ts.isIdentifier(value.name) && value.initializer && !contextValues.has(value.name.text) && contextExpression(value.initializer)) { contextValues.add(value.name.text); changed = true; }
      if (ts.isIdentifier(value.name) && value.initializer) {
        const name = callName(value.initializer);
        if (name && contextFunctions.has(name.split(".").at(-1)!) && !contextFunctions.has(value.name.text)) { contextFunctions.add(value.name.text); changed = true; }
      }
      if (value.initializer && helperExpression(value.initializer)) for (const id of bindingNames(value.name)) if (!helperValues.has(id.text)) { helperValues.add(id.text); changed = true; }
    }
    for (const assignment of assignments) {
      const target = unwrap(assignment.left);
      if (ts.isIdentifier(target) && !contextValues.has(target.text) && contextExpression(assignment.right)) { contextValues.add(target.text); changed = true; }
      if (ts.isIdentifier(target) && !helperValues.has(target.text) && helperExpression(assignment.right)) { helperValues.add(target.text); changed = true; }
    }
    for (const member of members) {
      const name = literalKey(member.name);
      if (name && ts.isPropertyDeclaration(member) && member.initializer && helperExpression(member.initializer) && !helperMembers.has(name)) { helperMembers.add(name); changed = true; }
    }
    for (const fn of functions) {
      const name = functionName(fn);
      if (name && !contextFunctions.has(name) && returns.get(fn)!.some(contextExpression)) { contextFunctions.add(name); changed = true; }
      if (name && !helperValues.has(name) && returns.get(fn)!.some(helperExpression)) { helperValues.add(name); changed = true; }
    }
  }
  contextMemo.clear();
  helperMemo.clear();
  const refuse = (node: ts.Node): void => {
    problems.push(`${at(node)} use outside the allow-list reconstructs a verified tenant context or mutates a verified tenant context; pass or return the whole context, bind it to const, or read .tenantId as a value`);
  };
  const constantBinding = (node: ts.VariableDeclaration): boolean => ts.isIdentifier(node.name) && ts.isVariableDeclarationList(node.parent) && (node.parent.flags & ts.NodeFlags.Const) !== 0;
  for (const value of values) {
    if (!contextType(value.type) && !(ts.isParameter(value) && inferredParameters.has(value)) && !(value.initializer && contextExpression(value.initializer))) continue;
    if (ts.isVariableDeclaration(value) ? !constantBinding(value) : !ts.isIdentifier(value.name) || ts.isParameterPropertyDeclaration(value, value.parent)) refuse(value);
  }
  for (const member of members) if (ts.isPropertyDeclaration(member) && (contextType(member.type) || member.initializer && contextExpression(member.initializer))) refuse(member);

  const valueUse = (node: ts.Node): ts.Node => {
    let current = outerExpression(node);
    while (ts.isAwaitExpression(current.parent)) current = outerExpression(current.parent);
    return current;
  };
  const writeTarget = (node: ts.Node): boolean => {
    let current = valueUse(node);
    for (;;) {
      const parent = current.parent;
      if (ts.isBinaryExpression(parent) && parent.left === current && parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return true;
      if (ts.isDeleteExpression(parent) || ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken))) return true;
      if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === current) return true;
      if (ts.isPropertyAssignment(parent) && parent.initializer === current || ts.isObjectLiteralExpression(parent) || ts.isArrayLiteralExpression(parent) || ((ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)) && parent.expression === current)) current = valueUse(parent);
      else return false;
    }
  };
  const allowedUse = (node: ts.Expression): boolean => {
    const outer = valueUse(node), parent = outer.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(outer as ts.Expression)) return !helperExpression(parent.expression);
    if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken || ts.isTypeOfExpression(parent)) return true;
    const nullish = (value: ts.Expression) => { const unwrapped = unwrap(value); return unwrapped.kind === ts.SyntaxKind.NullKeyword || ts.isIdentifier(unwrapped) && unwrapped.text === "undefined" || ts.isVoidExpression(unwrapped) && ts.isNumericLiteral(unwrapped.expression) && unwrapped.expression.text === "0"; };
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind) && nullish(parent.left === outer ? parent.right : parent.left)) return true;
    if (ts.isReturnStatement(parent) && parent.expression === outer || ts.isArrowFunction(parent) && parent.body === outer) {
      let fn: ts.Node | undefined = parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      const closure = fn && outerExpression(fn), use = closure?.parent;
      return !(use && ts.isCallExpression(use) && use.arguments.includes(closure as ts.Expression));
    }
    // The one source-pinned practice authentication bridge returns its stamped context in its principal envelope.
    // This authorizes only the exact reviewed return, never arbitrary containers in this file or other applications.
    if (file.path === "packages/db/src/practice-session.ts" && reviewedPracticeSource(file) && ts.isShorthandPropertyAssignment(parent) && parent.name === outer && parent.name.text === "context") {
      const object = parent.parent, returned = object.parent;
      if (ts.isObjectLiteralExpression(object) && ts.isReturnStatement(returned) && returned.expression === object && object.getText(source).replace(/\s+/gu, "") === "{context,digest,membershipId:principal.membership_id,identityUserId:principal.identity_user_id}") return true;
    }
    if (ts.isVariableDeclaration(parent) && parent.initializer === outer) return constantBinding(parent);
    if (ts.isPropertyAccessExpression(parent) && parent.expression === outer && parent.name.text === "tenantId") {
      const property = valueUse(parent), use = property.parent;
      return !writeTarget(property) && !(ts.isCallExpression(use) && use.expression === property) && !(ts.isNewExpression(use) && use.expression === property);
    }
    return false;
  };
  for (const node of contextUses) {
    // A named forwarding closure passed as an argument can escape via the callee's container, just like an inline one.
    const use = outerExpression(node), call = use.parent;
    if (ts.isIdentifier(node) && contextFunctions.has(node.text) && ts.isCallExpression(call) && call.arguments.includes(use as ts.Expression)) refuse(node);
    if (!contextExpression(node)) continue;
    const parent = node.parent;
    // Declarations, member names and type positions are not value uses. Binding legality was checked above.
    if (ts.isIdentifier(node)) {
      if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent)) && parent.name === node) continue;
      if (ts.isPropertyAccessExpression(parent) && parent.name === node || ts.isPropertyAssignment(parent) && parent.name === node || ts.isBindingElement(parent) && parent.propertyName === node) continue;
      let inType = false;
      for (let ancestor: ts.Node | undefined = parent; ancestor; ancestor = ancestor.parent) if (ts.isTypeNode(ancestor)) { inType = true; break; }
      if (inType) continue;
    }
    if (!allowedUse(node)) refuse(node);
  }
  for (const object of objects) {
    let contextual = false;
    for (let wrapped: ts.Node = object; wrapped !== outerExpression(object); wrapped = wrapped.parent) {
      if (ts.isSatisfiesExpression(wrapped.parent) && contextType(wrapped.parent.type)) contextual = true;
    }
    const outer = outerExpression(object), parent = outer.parent;
    if (ts.isVariableDeclaration(parent) && parent.initializer === outer && contextType(parent.type)) contextual = true;
    if (ts.isArrowFunction(parent) && parent.body === outer && contextType(parent.type)) contextual = true;
    if (ts.isReturnStatement(parent)) {
      for (let ancestor: ts.Node | undefined = parent.parent; ancestor; ancestor = ancestor.parent) {
        if (ts.isFunctionLike(ancestor)) { contextual ||= contextType(ancestor.type); break; }
      }
    }
    if (contextual || contextExpression(object)) problems.push(`${at(object)} reconstructs a verified tenant context; forward the verified value or use an authorized constructor instead`);
  }
  for (const node of assertions) {
    if (contextType(node.type)) found.push({ kind: "cast", operand: unwrap(node.expression), node });
  }
  for (const declared of typeNames) if (declared.exported && declared.name !== CONTEXT_TYPE && tainted.has(declared.name)) problems.push(`${at(declared.node)} exports an alias of ${CONTEXT_TYPE} (${declared.name}); another file could import it and cast to it`);
  for (const exported of exportedLocals) if (exported.name !== CONTEXT_TYPE && tainted.has(exported.name)) problems.push(`${at(exported.node)} exports an alias of ${CONTEXT_TYPE} (${exported.name}); another file could import it and cast to it`);

  // Fixture constants: in all application source a DEMO_* identity name is only ever the authoritative import; the fixture
  // module itself defines each as an exported const literal UUID.
  for (const [name, list] of bindings) {
    if (!FIXTURE_NAME.test(name)) continue;
    for (const binding of list) {
      if (file.path === FIXTURE_MODULE) {
        const statement = binding.kind === "variable" ? binding.node.parent.parent : undefined;
        const initializer = binding.kind === "variable" ? binding.node.initializer : undefined;
        const literal = initializer !== undefined && (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) && UUID_LITERAL.test(initializer.text);
        const constant = binding.kind === "variable" && (binding.node.parent.flags & ts.NodeFlags.Const) !== 0;
        if (!(statement && ts.isVariableStatement(statement) && statement.parent === source && isExported(statement) && constant && literal)) problems.push(`${at(binding.node)} fixture constant ${name} must be an exported const holding a literal UUID`);
      } else if (!(binding.kind === "import" && !binding.aliased && authoritativeModule(file.path, binding.module))) {
        problems.push(`${at(binding.node)} fixture constant ${name} must be the unaliased import from the fixture module; a local declaration, rename or other source is refused`);
      }
    }
  }
  return { found, source, problems, bindings };
}

/** The identifier bound to the authoritative fixture constant: exactly one binding in the file, an unaliased import from the fixture module. */
function fixtureBound(file: SourceFile, bindings: Map<string, Binding[]>, name: string): boolean {
  const list = bindings.get(name);
  const only = list?.length === 1 ? list[0]! : undefined;
  return only?.kind === "import" && !only.aliased && authoritativeModule(file.path, only.module);
}
/**
 * True when every use of `name` is a read of one of its properties or the (possibly cast) argument of the constructor: nothing
 * writes, deletes, calls through, spreads, aliases or hands the object to other code, so its literal is what the constructor sees.
 */
function onlyReadOrConstructed(source: ts.SourceFile, name: string): boolean {
  const isAssignmentOperator = (kind: ts.SyntaxKind) => kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
  const writeTarget = (node: ts.Node): boolean => {
    let current = outerExpression(node);
    for (;;) {
      const parent = current.parent;
      if (ts.isBinaryExpression(parent) && parent.left === current && isAssignmentOperator(parent.operatorToken.kind)) return true;
      if (ts.isDeleteExpression(parent) || ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken))) return true;
      if ((ts.isForOfStatement(parent) || ts.isForInStatement(parent)) && parent.initializer === current) return true;
      // In an assignment pattern the target can sit arbitrarily deep inside object/array/rest elements.
      if ((ts.isPropertyAssignment(parent) && parent.initializer === current) || ts.isObjectLiteralExpression(parent) || ts.isArrayLiteralExpression(parent) || ((ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)) && parent.expression === current)) current = outerExpression(parent);
      else return false;
    }
  };
  const allowed = (node: ts.Identifier): boolean => {
    const outer = outerExpression(node), parent = outer.parent;
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === outer) {
      const property = outerExpression(parent), use = property.parent;
      return !writeTarget(property) && !(ts.isCallExpression(use) && use.expression === property);
    }
    const call = outer.parent;
    return ts.isCallExpression(call) && call.arguments[0] === outer && ((ts.isIdentifier(call.expression) && call.expression.text === CONSTRUCTOR) || (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === CONSTRUCTOR));
  };
  let ok = true;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) {
      const parent = node.parent;
      const declaration = ts.isVariableDeclaration(parent) && parent.name === node;
      const key = (ts.isPropertyAccessExpression(parent) && parent.name === node) || (ts.isPropertyAssignment(parent) && parent.name === node) || (ts.isBindingElement(parent) && parent.propertyName === node) || (ts.isQualifiedName(parent) && parent.right === node);
      let inType = false;
      for (let ancestor: ts.Node | undefined = parent; ancestor; ancestor = ancestor.parent) if (ts.isTypeNode(ancestor)) { inType = true; break; }
      if (!declaration && !key && !inType && !allowed(node)) ok = false;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return ok;
}
/** An object passed to the constructor by name resolves only to exactly one top-level const object literal that nothing changes or passes on. */
function resolveFixedObject(source: ts.SourceFile, bindings: Map<string, Binding[]>, name: string): ts.ObjectLiteralExpression | undefined {
  const list = bindings.get(name);
  const only = list?.length === 1 ? list[0]! : undefined;
  if (only?.kind !== "variable" || only.node.parent.parent.parent !== source || (only.node.parent.flags & ts.NodeFlags.Const) === 0 || !only.node.initializer) return undefined;
  const value = unwrap(only.node.initializer);
  return ts.isObjectLiteralExpression(value) && onlyReadOrConstructed(source, name) ? value : undefined;
}

/** Every rule violation in the given files; an empty list means the boundary holds. */
const boundaryResults = new Map<string, readonly string[]>();
export function boundaryViolations(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    // Each rule is local to a file. Reuse its complete result when planting attacks into the unchanged real tree;
    // the full path AND source text are the key, so any edit or new fixture is checked afresh.
    const key = `${file.path}\0${file.text}`;
    const cached = boundaryResults.get(key);
    if (cached) { problems.push(...cached); continue; }
    const start = problems.length;
    const { found, source, problems: aliasProblems, bindings } = occurrences(file);
    problems.push(...aliasProblems);
    if (!found.length) { boundaryResults.set(key, problems.slice(start)); continue; }
    const at = (node: ts.Node) => `${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const calls = found.filter((o): o is Extract<Occurrence, { kind: "call" }> => o.kind === "call");
    const casts = found.filter((o): o is Extract<Occurrence, { kind: "cast" }> => o.kind === "cast");
    const declarations = found.filter(o => o.kind === "declaration");
    for (const o of found.filter(f => f.kind === "reference")) problems.push(`${at(o.node)} aliases or passes ${CONSTRUCTOR} instead of calling it`);
    for (const o of found.filter(f => f.kind === "effective")) if (file.path !== REAL) problems.push(`${at(o.node)} effective tenant identifier outside the principal bridge`);

    const membershipCalls = calls.filter(c => ts.isCallExpression(c.node) && (ts.isIdentifier(c.node.expression) ? c.node.expression.text === CONSTRUCTOR : ts.isPropertyAccessExpression(c.node.expression) ? c.node.expression.name.text === CONSTRUCTOR : ts.isElementAccessExpression(c.node.expression) && ts.isStringLiteralLike(c.node.expression.argumentExpression) && c.node.expression.argumentExpression.text === CONSTRUCTOR));
    const queuedCalls = calls.filter(c => !membershipCalls.includes(c));
    if (file.path !== WORKER && queuedCalls.length) problems.push(`${file.path} only the worker may call the queued-job constructor`);
    if (file.path === REAL) {
      if (calls.length !== 1 || membershipCalls.length !== 1 || casts.length || declarations.length) problems.push(`${file.path} must contain exactly one constructor call and no casts`);
      for (const c of calls) {
        const argument = c.argument && unwrap(c.argument);
        if (!argument || !ts.isCallExpression(argument) || !ts.isIdentifier(argument.expression) || argument.expression.text !== "asAuthenticatedMembership") problems.push(`${at(c.node)} the bridge may only construct from the verified membership lookup`);
      }
    } else if (file.path === DEFINITION) {
      const compact = (node: ts.Node) => node.getText(source).replace(/\s+/gu, "");
      const constructors = source.statements.filter(ts.isFunctionDeclaration).filter(fn => fn.name && CONSTRUCTORS.has(fn.name.text));
      if (declarations.length !== 2 || constructors.length !== 2 || calls.length || casts.length !== 2) problems.push(`${file.path} must declare two stamped constructors, each casting once`);
      const bodies = new Map([
        [CONSTRUCTOR, `{if(!membership||!UUID.test(membership.identityUserId)||!UUID.test(membership.membershipId)||!UUID.test(membership.tenantId)){thrownewInvalidTenantContextError();}constcontext=Object.freeze({tenantId:membership.tenantId})asVerifiedTenantContext;genuineTenantContexts.add(context);returncontext;}`],
        [QUEUED_CONSTRUCTOR, `{if(typeoftenantId!=="string"||!UUID.test(tenantId)){thrownewInvalidTenantContextError();}constcontext=Object.freeze({tenantId})asVerifiedTenantContext;genuineTenantContexts.add(context);returncontext;}`],
      ]);
      for (const name of CONSTRUCTORS) {
        const matching = constructors.filter(fn => fn.name!.text === name);
        if (matching.length !== 1 || !matching[0]!.body || compact(matching[0]!.body!) !== bodies.get(name)) problems.push(`${file.path} ${name} must validate, freeze its own literal, cast once, add once to the private stamp list and return that same context`);
      }
      const stampBindings = bindings.get("genuineTenantContexts");
      const stamp = stampBindings?.length === 1 ? stampBindings[0] : undefined;
      if (!stamp || stamp.kind !== "variable" || stamp.node.parent.parent.parent !== source || (stamp.node.parent.flags & ts.NodeFlags.Const) === 0 || isExported(stamp.node.parent.parent) || !stamp.node.initializer || compact(stamp.node.initializer) !== "newWeakSet<object>()") problems.push(`${file.path} the stamp must be one module-private const WeakSet<object>`);
      const stampUses: ts.Identifier[] = [];
      const inspectStamp = (node: ts.Node): void => { if (ts.isIdentifier(node) && node.text === "genuineTenantContexts") stampUses.push(node); ts.forEachChild(node, inspectStamp); };
      inspectStamp(source);
      if (stampUses.length !== 4 || source.statements.some(statement => ts.isExportDeclaration(statement) && statement.exportClause?.getText(source).includes("genuineTenantContexts"))) problems.push(`${file.path} the stamp list may only be declared, added to by the two constructors and checked by withTenant; it cannot escape`);
      const tenantBoundary = source.statements.filter(ts.isFunctionDeclaration).find(fn => fn.name?.text === "withTenant");
      const first = tenantBoundary?.body?.statements[0];
      if (!first || compact(first) !== `if(!genuineTenantContexts.has(context)||typeofcontext.tenantId!=="string"||!UUID.test(context.tenantId)){thrownewInvalidTenantContextError();}`) problems.push(`${file.path} withTenant must refuse unstamped contexts before opening a connection`);
    } else if (file.path === WORKER) {
      if (calls.length !== 1 || queuedCalls.length !== 1 || declarations.length || casts.length) problems.push(`${file.path} must contain exactly one queued-job constructor call and no casts`);
      for (const c of calls) if (!c.argument || c.argument.getText(source) !== "parsed.tenantId" || !/const parsed=z\.object\(\{[^}]*tenantId:z\.string\(\)\.uuid\(\)[^}]*\}\)\.strict\(\)\.parse\(payload\)/u.test(file.text)) problems.push(`${at(c.node)} worker tenant must come only from a strictly validated queue payload`);
    } else if (APPROVED_PRACTICE_FILES.includes(file.path)) {
      // Exact reviewed source identities and call shapes; a name on the list alone never authorizes another minting path.
      const EXPECTED_PRACTICE_CALLS: Readonly<Record<string, number>> = { "packages/db/src/practice-session.ts": 1, "packages/db/src/contractor-repository.ts": 2, "packages/db/src/contractor-party-repository.ts": 3, "packages/db/src/work-order-repository.ts": 4, "packages/db/src/sor-repository.ts": 2, "packages/db/src/job-scheduling-repository.ts": 2, "packages/db/src/work-order-fixtures.ts": 3 };
      const expectedCalls = EXPECTED_PRACTICE_CALLS[file.path] ?? -1;
      if (!reviewedPracticeSource(file) || membershipCalls.length !== expectedCalls || queuedCalls.length || casts.length || declarations.length) problems.push(`${file.path} practice constructors must match the exact reviewed authenticated practice-session source; changed code needs renewed caller review and grants no pilot/production authority`);
    } else if (file.path === REHEARSAL) {
      if (casts.length || declarations.length || calls.length !== 2 || !/SYNTHETIC_REHEARSAL_ONLY/u.test(file.text) || !/requiredMode/u.test(file.text)) problems.push(`${file.path} must be exactly two calls inside the synthetic-only rehearsal`);
      for (const c of calls) {
        const argument = c.argument && unwrap(c.argument);
        const tenant = argument && ts.isObjectLiteralExpression(argument) ? propertyInitializer(argument, "tenantId") : undefined;
        if (!tenant || tenant === "shorthand" || !/^ids\.(tenant|otherTenant)$/u.test(tenant.getText(source))) problems.push(`${at(c.node)} rehearsal tenants must be its generated ids`);
      }
    } else {
      // Retained synthetic composition: only the approved files, fixed DEMO_* identity only, no request-derived selector.
      if (declarations.length) problems.push(`${file.path} declares a second ${CONSTRUCTOR}`);
      if (!SYNTHETIC_ROOTS.some(root => file.path.startsWith(root))) problems.push(`${file.path} is outside the synthetic composition roots and may not construct a tenant context`);
      else if (!APPROVED_SYNTHETIC_FILES.includes(file.path)) problems.push(`${file.path} is not an approved retained synthetic file; a new caller of the tenant-context constructor needs a reviewed edit to the approved list`);
      else if (REQUEST_DERIVED.test(file.text)) problems.push(`${file.path} constructs a tenant context but handles a request-derived tenant selector`);
      else if (CLIENT_TENANT.test(file.text) && !CLIENT_TENANT_REFUSED.test(file.text)) problems.push(`${file.path} reads a client tenant without refusing everything but the fixed DEMO tenant`);
      else if (![...DEMO_TENANT].some(name => file.text.includes(name))) problems.push(`${file.path} constructs a tenant context without the fixed DEMO tenant`);
      // The identifiers count only when they resolve to the authoritative fixture constants (see the header).
      const demoTenant = (name: string) => DEMO_TENANT.has(name) && fixtureBound(file, bindings, name);
      const demoMembership = (name: string) => /^DEMO_[A-Z_]*MEMBERSHIP_ID$/u.test(name) && fixtureBound(file, bindings, name);
      for (const c of calls) {
        let argument = c.argument && unwrap(c.argument);
        if (argument && ts.isIdentifier(argument)) argument = resolveFixedObject(source, bindings, argument.text);
        if (!argument || !ts.isObjectLiteralExpression(argument) || !plainLiteral(argument)) { problems.push(`${at(c.node)} synthetic constructor argument must be a fixed, plain literal object (one top-level const, no spread, computed key, accessor or duplicate property)`); continue; }
        const tenant = propertyInitializer(argument, "tenantId"), membership = propertyInitializer(argument, "membershipId");
        const tenantOk = identifierIn(tenant, demoTenant);
        const membershipOk = identifierIn(membership, demoMembership);
        if (!tenantOk || !membershipOk) problems.push(`${at(c.node)} synthetic constructor must use the fixed DEMO tenant and membership`);
      }
      for (const c of casts) {
        if (!ts.isObjectLiteralExpression(c.operand) || !plainLiteral(c.operand) || !identifierIn(propertyInitializer(c.operand, "tenantId"), demoTenant)) problems.push(`${at(c.node)} synthetic cast to a verified tenant context must wrap the fixed DEMO tenant`);
      }
    }
    boundaryResults.set(key, problems.slice(start));
  }
  return problems;
}

/** The fixture-identity constants a given demo-seed text exports (used to assert the scan trusts every name it relies on). */
function fixtureConstantNames(text: string): string[] {
  const source = ts.createSourceFile(FIXTURE_MODULE, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) continue;
    for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && FIXTURE_NAME.test(declaration.name.text)) names.push(declaration.name.text);
  }
  return names;
}

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const SKIP = new Set(["node_modules", "dist", ".next", "test-results", "coverage"]);
const applicationFile = (name: string): boolean => /\.(ts|tsx|mjs|js)$/u.test(name) && !/\.(test|spec)\.(ts|tsx|mjs|js)$/u.test(name) && !name.endsWith(".d.ts");
async function walk(directory: string, out: string[] = []): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return out; }
  await Promise.all(entries.map(async entry => {
    if (SKIP.has(entry.name)) return;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (applicationFile(entry.name)) out.push(path);
  }));
  return out;
}
async function applicationSource(repositoryRoot: string = repository): Promise<SourceFile[]> {
  const repository = repositoryRoot;
  const roots = [join(repository, "apps/api/src"), join(repository, "apps/web/app"), join(repository, "tools")];
  for (const name of await readdir(join(repository, "packages"))) for (const folder of ["src", "tools"]) roots.push(join(repository, "packages", name, folder));
  const paths = (await Promise.all(roots.map(root => walk(root)))).flat();
  // Next conventions (middleware.ts, instrumentation.ts) and similar sit directly in the app folder, beside src/ or app/.
  for (const app of ["apps/api", "apps/web"]) {
    for (const entry of await readdir(join(repository, app), { withFileTypes: true })) {
      if (entry.isFile() && applicationFile(entry.name)) paths.push(join(repository, app, entry.name));
    }
  }
  // These are small local source files. Avoid hundreds of competing thread-pool reads during the security scan.
  return paths.map(path => ({ path: relative(repository, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));
}

// An approved retained synthetic file that still constructs after SBOX-SESSION-1: shape tests run at this path so each negative case still fails for ITS OWN
// reason and not merely because a made-up path is not on the approved list (that rule has its own tests further down).
const APPROVED_SYNTHETIC = "packages/db/src/fee-illustration-repository.ts";
const validSynthetic = `import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, verifiedTenantContextFromMembership } from "@jobguard/db";
const context = () => verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any);`;

describe("M0-6L sole-constructor boundary across all application source", () => {
  it("holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context", async () => {
    const files = await applicationSource();
    expect(files.length).toBeGreaterThan(200);
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining([REAL, DEFINITION, WORKER, REHEARSAL, "apps/web/app/lib/identity-server.ts"]));
    expect(boundaryViolations(files)).toEqual([]);
    // The real-user path has exactly one bridge. Other calls are the explicitly reviewed practice/fixed-fixture bridges or queued work.
    const constructors = files.filter(f => occurrences(f).found.some(o => o.kind === "call")).map(f => f.path);
    expect(constructors).toContain(REAL);
    expect(constructors.filter(path => path.startsWith("apps/web/"))).toEqual([]);
    // Planting one extra caller in the real tree, anywhere, must fail the same scan (the files that cannot matter are
    // skipped by the pre-filter, so the planted run uses the relevant subset to stay fast).
    const relevant = files.filter(f => RELEVANT.test(f.text));
    expect(relevant.map(f => f.path)).toEqual(expect.arrayContaining([REAL, DEFINITION, WORKER]));
    for (const planted of ["apps/api/src/planted.application.ts", "apps/web/app/lib/planted.ts", "packages/core/src/planted.ts", "apps/api/src/auth/planted.ts"]) {
      expect(boundaryViolations([...relevant, { path: planted, text: "export const context = (tenantId: string) => verifiedTenantContextFromMembership({ tenantId } as never);" }]), planted).not.toEqual([]);
    }
    expect(boundaryViolations([...relevant, { path: WORKER, text: "const x = {} as VerifiedTenantContext;" }].filter((f, i, all) => f.path !== WORKER || i === all.length - 1))).not.toEqual([]);
  });

  it("accepts the retained synthetic shape and rejects every other constructor, alias, cast or effective-tenant assignment", () => {
    const rogue = (path: string, text: string) => boundaryViolations([{ path, text }]);
    expect(rogue(APPROVED_SYNTHETIC, validSynthetic)).toEqual([]);
    // A new application feeding a request-chosen tenant.
    expect(rogue(APPROVED_SYNTHETIC, `import { verifiedTenantContextFromMembership } from "@jobguard/db";
export const context = (tenantId: string, membershipId: string) => verifiedTenantContextFromMembership({ identityUserId: "x", membershipId, tenantId } as any);`)).not.toEqual([]);
    // The same fixed-demo shape is not acceptable in web source or any other package.
    expect(rogue("apps/web/app/lib/x.ts", validSynthetic)).toEqual([expect.stringContaining("outside the synthetic composition roots")]);
    expect(rogue("packages/core/src/x.ts", validSynthetic)).not.toEqual([]);
    // Demo-shaped, but the file also reads a request selector.
    expect(rogue(APPROVED_SYNTHETIC, `${validSynthetic}\nexport const pick = (headers: Record<string, string>) => headers["x-tenant-id"];`)).not.toEqual([]);
    expect(rogue(APPROVED_SYNTHETIC, validSynthetic.replace("DEMO_TENANT_ID }", "otherTenant }"))).not.toEqual([]);
    // A client-supplied tenant may only be refused, never used.
    expect(rogue(APPROVED_SYNTHETIC, `${validSynthetic}\nexport const guard = (d: { requested_tenant_id: string }) => { if (d.requested_tenant_id !== DEMO_TENANT_ID) throw new Error("TENANT_FORBIDDEN"); };`)).toEqual([]);
    expect(rogue(APPROVED_SYNTHETIC, `${validSynthetic}\nexport const use = (d: { requested_tenant_id: string }) => d.requested_tenant_id;`)).not.toEqual([]);
    expect(rogue(APPROVED_SYNTHETIC, validSynthetic.replace("membershipId: DEMO_MEMBERSHIP_ID", "membershipId: membershipFromRequest"))).not.toEqual([]);
    // Casts, including a double cast, and aliases.
    expect(rogue("apps/api/src/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = { tenantId: input } as VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/web/app/lib/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = ({ tenantId: input } as unknown) as VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = <VerifiedTenantContext>{ tenantId: input };`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `export const c = { tenantId: input } as import("@jobguard/db").VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import * as db from "@jobguard/db";\nexport const c = { tenantId: input } as Readonly<db.VerifiedTenantContext>;`)).not.toEqual([]);
    expect(rogue(APPROVED_SYNTHETIC, `import { DEMO_TENANT_ID } from "@jobguard/db";\nexport const c = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;`)).toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import { verifiedTenantContextFromMembership } from "@jobguard/db";\nexport const make = verifiedTenantContextFromMembership;`)).toEqual(expect.arrayContaining([expect.stringContaining("aliases or passes")]));
    expect(rogue("apps/api/src/x.ts", `import * as db from "@jobguard/db";\nexport const make = db["verifiedTenantContextFromMembership"](input);`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import * as db from "@jobguard/db";\nexport const make = db.verifiedTenantContextFromMembership(input);`)).not.toEqual([]);
    // Effective-tenant identifiers anywhere but the bridge.
    expect(rogue("apps/api/src/x.ts", "export const effective_tenant_id = tenantFromBody;")).not.toEqual([]);
    expect(rogue("apps/web/app/lib/x.ts", "const scope = { effectiveTenantId: body.tenant };")).not.toEqual([]);
    expect(rogue(REAL, "const effective_tenant_id = membership.tenantId;")).not.toContain(expect.stringContaining("effective tenant identifier"));
  });

  it("allows the bridge exactly one verified-membership constructor, the worker exactly one payload constructor, and nothing else", () => {
    const rogue = (path: string, text: string) => boundaryViolations([{ path, text }]);
    const bridge = `import { verifiedTenantContextFromMembership } from "@jobguard/db";
export const make = (membership: unknown) => verifiedTenantContextFromMembership(asAuthenticatedMembership(membership));`;
    expect(rogue(REAL, bridge)).toEqual([]);
    expect(rogue(REAL, `${bridge}\nexport const second = (body: any) => verifiedTenantContextFromMembership({ tenantId: body.tenant });`)).not.toEqual([]);
    expect(rogue(REAL, bridge.replace("asAuthenticatedMembership(membership)", "membership"))).not.toEqual([]);
    expect(rogue(REAL, `${bridge}\nexport const c = { tenantId: "x" } as VerifiedTenantContext;`)).not.toEqual([]);
    const worker = `const parsed=z.object({actionId:z.string().uuid(),tenantId:z.string().uuid()}).strict().parse(payload);
await executor.execute(verifiedTenantContextForQueuedJob(parsed.tenantId),parsed.actionId);`;
    expect(rogue(WORKER, worker)).toEqual([]);
    expect(rogue(WORKER, `${worker}\nawait executor.execute(verifiedTenantContextForQueuedJob(other),id);`)).not.toEqual([]);
    expect(rogue(WORKER, worker.replace(".strict()", ""))).not.toEqual([]);
    expect(rogue(WORKER, worker.replace("parsed.tenantId", "payload.tenantId"))).not.toEqual([]);
    expect(rogue(WORKER, `${worker}\nconst c = verifiedTenantContextFromMembership({ tenantId: DEMO_TENANT_ID });`)).not.toEqual([]);
    const definition = readFileSync(join(repository, DEFINITION), "utf8");
    expect(rogue(DEFINITION, definition)).toEqual([]);
    expect(rogue(DEFINITION, definition.replace("tenantId: membership.tenantId", "tenantId: input"))).not.toEqual([]);
    expect(rogue("apps/api/src/other.ts", `export function verifiedTenantContextFromMembership(m: M) { return m; }`)).not.toEqual([]);
  });
});

describe("M0-6L round 4: reconstruction, mutation targets and root tools", () => {
  const contextImport = `import type { VerifiedTenantContext } from "@jobguard/db";`;

  it.each([
    ["typed return", `function changeTenant(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { return { ...context, tenantId }; }`],
    ["inferred return", `function changeTenant(context: VerifiedTenantContext, tenantId: string) { return { ...context, tenantId }; }`],
    ["typed variable", `function changeTenant(context: VerifiedTenantContext, tenantId: string) { const result: VerifiedTenantContext = { ...context, tenantId }; return result; }`],
    ["satisfies", `function changeTenant(context: VerifiedTenantContext, tenantId: string) { return { ...context, tenantId } satisfies VerifiedTenantContext; }`],
    ["value alias", `function changeTenant(context: VerifiedTenantContext, tenantId: string) { const original = context; return { ...original, tenantId }; }`],
    ["type alias", `type Context = Readonly<VerifiedTenantContext>; function changeTenant(context: Context, tenantId: string) { return { ...context, tenantId }; }`],
    ["inferred constructor result", `import { verifiedTenantContextFromMembership } from "@jobguard/db"; function changeTenant(membership: Parameters<typeof verifiedTenantContextFromMembership>[0], tenantId: string) { const context = verifiedTenantContextFromMembership(membership); return { ...context, tenantId }; }`],
  ])("rejects context reconstruction via %s", (_name, code) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\n${code}`), path).toEqual(mentions("reconstructs a verified tenant context"));
    // Even an otherwise-approved synthetic constructor does not authorize cloning and changing its result.
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\n${CALL_FIXTURES}\n${contextImport}\n${code}`)).toEqual(mentions("reconstructs a verified tenant context"));
  });

  it("allows context forwarding and ordinary object spreads", () => {
    expect(rogueAt(PLANT_PATHS[0]!, `${contextImport}
function forward(context: VerifiedTenantContext): VerifiedTenantContext { return context; }
const forwardArrow = (context: VerifiedTenantContext): VerifiedTenantContext => context;
function ordinary(input: { tenantId: string }, tenantId: string) { return { ...input, tenantId }; }`)).toEqual([]);
  });

  const namedMembership = (extra: string) => `import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, verifiedTenantContextFromMembership } from "@jobguard/db";
const membership = { identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID };
${extra}
export const context = () => verifiedTenantContextFromMembership(membership as Parameters<typeof verifiedTenantContextFromMembership>[0]);`;
  it.each([
    ["parenthesized assignment", `(membership.tenantId) = input.tenant;`],
    ["wrapped receiver", `((membership).tenantId) = input.tenant;`],
    ["compound assignment", `((membership.tenantId)) += input.tenant;`],
    ["object destructuring", `({ tenantId: membership.tenantId } = input);`],
    ["nested destructuring", `({ nested: { values: [membership.tenantId] } } = { nested: { values: [input.tenant] } });`],
    ["array destructuring", `[membership["tenantId"]] = [input.tenant];`],
    ["destructuring default", `({ tenantId: membership.tenantId = input.tenant } = input);`],
    ["bare parenthesized deletion", `delete (membership.tenantId);`],
    ["parenthesized deletion", `delete ((membership as Partial<typeof membership>).tenantId);`],
    ["parenthesized increment", `++((membership as unknown as { tenantId: number }).tenantId);`],
    ["iteration target", `for (membership.tenantId of [input.tenant]) {}`],
  ])("rejects fixed membership mutation via %s", (_name, mutation) => {
    expect(rogueAt(APPROVED_SYNTHETIC, namedMembership(`export const swap = (input: { tenantId: string; tenant: string }) => { ${mutation} };`))).toEqual(mentions("fixed, plain literal object"));
  });

  it("keeps wrapped property reads and destructuring source reads valid", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, namedMembership(`export const read = () => { const value = { tenantId: (membership.tenantId) }; return value; };`))).toEqual([]);
  });

  it("collects repository-root tools and rejects a planted caller while excluding test files", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "jg-m0-6l-tools-"));
    try {
      for (const directory of ["apps/api/src", "apps/web/app", "packages/example/tools", "tools/nested"]) await mkdir(join(fixture, directory), { recursive: true });
      const planted = `import { verifiedTenantContextFromMembership } from "@jobguard/db"; export const context = (tenantId) => verifiedTenantContextFromMembership({ tenantId });`;
      const included = ["tools/planted.ts", "tools/nested/planted.tsx", "tools/planted.mjs", "tools/planted.js", "packages/example/tools/control.mjs"];
      const excluded = ["tools/control.test.ts", "tools/control.test.tsx", "tools/control.test.mjs", "tools/control.test.js", "tools/control.spec.ts", "tools/control.spec.mjs", "tools/control.d.ts", "tools/node_modules/generated.ts", "tools/dist/generated.js"];
      for (const path of [...included, ...excluded]) {
        await mkdir(join(fixture, posix.dirname(path)), { recursive: true });
        await writeFile(join(fixture, path), planted);
      }
      const files = await applicationSource(fixture);
      expect(files.map(f => f.path).sort()).toEqual(included.sort());
      for (const file of files) expect(boundaryViolations([file]), file.path).toEqual(mentions("outside the synthetic composition roots"));
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
});

describe("M0-6L round 5: copied contexts retain their boundary taint", () => {
  const contextImport = `import type { VerifiedTenantContext } from "@jobguard/db";`;

  it.each([
    ["Object.assign reconstruction", `function change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { return Object.assign({}, context, { tenantId }); }`],
    ["Object.assign mutation", `function change(context: VerifiedTenantContext, tenantId: string) { return Object.assign(context, { tenantId }); }`],
    ["structuredClone mutation", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = structuredClone(context); copy.tenantId = tenantId; return copy; }`],
  ])("rejects %s", (_name, code) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\n${code}`), path).toEqual(mentions("verified tenant context"));
  });
});

describe("M0-6L round 6: refuse every identifiable context reconstruction", () => {
  const contextImport = `import type { VerifiedTenantContext } from "@jobguard/db";`;
  it.each([
    ["Object.create with shadowing tenant", `const copy = Object.create(context); copy.tenantId = tenantId;`],
    ["Reflect.set on a clone", `const copy = structuredClone(context); Reflect.set(copy, "tenantId", tenantId);`],
    ["Object.defineProperty on a clone", `const copy = structuredClone(context); Object.defineProperty(copy, "tenantId", { value: tenantId });`],
    ["Object.defineProperties on a clone", `const copy = structuredClone(context); Object.defineProperties(copy, { tenantId: { value: tenantId } });`],
    ["Object.assign with variable source", `const replacement = { tenantId }; const copy = Object.assign({}, context, replacement);`],
    ["Object.assign with spread source", `const replacement = { tenantId }; const copy = Object.assign({}, context, { ...replacement });`],
    ["destructuring into a clone", `const copy = structuredClone(context); const mutable: { tenantId: string } = copy; ({ tenantId: mutable.tenantId } = { tenantId });`],
    ["constant computed tenant key", `const copy = structuredClone(context); const mutable: { tenantId: string } = copy; const key = "tenantId"; mutable[key] = tenantId;`],
    ["clone assigned after declaration then descriptor mutation", `let copy; copy = structuredClone(context); Object.defineProperty(copy, "tenantId", { value: tenantId });`],
  ])("rejects %s (regression against 098a064)", (_name, code) => {
    for (const path of PLANT_PATHS) {
      expect(rogueAt(path, `${contextImport}\nfunction change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { ${code} return copy; }`), path)
        .toEqual(mentions("verified tenant context"));
    }
  });

  it.each([
    ["unchanged clone", `const copy = structuredClone(context);`],
    ["unchanged assign copy", `const copy = Object.assign({}, context);`],
    ["unchanged prototype copy", `const copy = Object.create(context);`],
    ["bracketed prototype copy", `const copy = Object["create"](context);`],
    ["entry reconstruction through aliases", `const entries = Object.entries(context); let copy; copy = Object.fromEntries(entries);`],
    ["serialized reconstruction through aliases", `const serialized = JSON.stringify(context); const copy = JSON.parse(serialized);`],
  ])("refuses %s before a replacement is visible", (_name, code) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\nfunction copyContext(context: VerifiedTenantContext) { ${code} return copy; }`), path).toEqual(mentions("reconstructs a verified tenant context"));
  });

  // These have no reconstruction: the mutation rules must stand on their own, including aliases assigned later.
  it.each([
    `Reflect.set(context, "tenantId", tenantId);`,
    `Object.defineProperty(context, "tenantId", { value: tenantId });`,
    `Object.defineProperties(context, { tenantId: { value: tenantId } });`,
    `const mutable: { tenantId: string } = context; ({ tenantId: mutable.tenantId } = { tenantId });`,
    `const mutable: { tenantId: string } = context; const key = "tenantId"; mutable[key] = tenantId;`,
    `let alias; alias = context; Object.defineProperty(alias, "tenantId", { value: tenantId });`,
    `const mutable: { tenantId: string } = context; delete mutable[unknownKey];`,
  ])("rejects direct or aliased mutation: %s", code => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\nfunction change(context: VerifiedTenantContext, tenantId: string, unknownKey: string) { ${code} }`), path).toEqual(mentions("mutates a verified tenant context"));
  });

  it("permits original-value forwarding, const aliases and ordinary object copies", () => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}
function forward(context: VerifiedTenantContext): VerifiedTenantContext { const alias = context; return alias; }
function read(context: VerifiedTenantContext) { return context.tenantId; }
function ordinary(input: { tenantId: string }) { return Object.assign({}, input); }`), path).toEqual([]);
  });
});

describe("M0-6L round 7: context use allow-list", () => {
  const contextImport = `import type { VerifiedTenantContext } from "@jobguard/db";`;
  it.each([
    ["Sol: destructured typed parameter", `function change({ ...copy }: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { copy.tenantId = tenantId; return copy; }`],
    ["Sol: local object destructuring", `function change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { const { ...copy } = context; copy.tenantId = tenantId; return copy; }`],
    ["Sol: local array destructuring", `function change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { const [copy] = [context]; return Object.assign({}, copy, { tenantId }); }`],
    ["Sol: object container access", `function change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { const copy = { context }.context; return Object.assign({}, copy, { tenantId }); }`],
    ["Sol: typed class member", `class Holder { constructor(readonly context: VerifiedTenantContext) {} change(tenantId: string): VerifiedTenantContext { return Object.assign({}, this.context, { tenantId }); } }`],
    ["Sol: static Object.assign alias", `function change(context: VerifiedTenantContext, tenantId: string): VerifiedTenantContext { const assign = Object.assign; return assign({}, context, { tenantId }); }`],
  ])("rejects %s", (_name, code) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\n${code}`), path).toEqual(mentions("verified tenant context"));
  });

  it.each([
    ["let alias", `let alias = context; return alias;`],
    ["var alias", `var alias = context; return alias;`],
    ["delayed alias", `let alias; alias = context; return alias;`],
    ["reassignment of typed binding", `let alias: VerifiedTenantContext = context; alias = replacement; return alias;`],
    ["destructured tenant", `const { tenantId } = context; return tenantId;`],
    ["array container", `return [context];`],
    ["object container", `return { original: context };`],
    ["shorthand container", `return { context };`],
    ["Map container", `return new Map([["context", context]]);`],
    ["Set container", `return new Set([context]);`],
    ["Map.set storage", `const holder = new Map(); holder.set("context", context);`],
    ["Set.add storage", `const holder = new Set(); holder.add(context);`],
    ["array push storage", `const holder = []; holder.push(context);`],
    ["typed Map storage", `function store(holder: Map<string, VerifiedTenantContext>) { holder.set("context", context); }`],
    ["aliased container method", `const holder = new Map(); const store = holder.set.bind(holder); store("context", context);`],
    ["helper factory alias", `function getAssign() { return Object.assign; } const assign = getAssign(); return assign({}, context, { tenantId });`],
    ["global Object alias", `const assign = globalThis.Object.assign; return assign({}, context, { tenantId });`],
    ["member assignment", `holder.context = context;`],
    ["typed class field", `class Holder { context: VerifiedTenantContext = context; } return new Holder();`],
    ["computed key", `return { [context]: replacement };`],
    ["computed lookup", `return holder[context];`],
    ["computed tenant read", `return context["tenantId"];`],
    ["unknown member read", `return context.other;`],
    ["escaping boolean use", `return context || replacement;`],
    ["conditional use", `return context ? replacement : replacement;`],
    ["comparison", `return context === replacement;`],
    ["context callee", `return context();`],
    ["spread call", `return forward(...context);`],
    ["captured context mutation", `return () => { context.tenantId = tenantId; };`],
    ["captured alias reassignment", `const alias = context; return () => { alias = replacement; };`],
    ["nested assignment target", `({ nested: [context.tenantId] } = input);`],
    ["assignment default", `({ tenantId: context.tenantId = tenantId } = input);`],
    ["iteration target", `for (context.tenantId of input) {}`],
    ["delete", `delete context.tenantId;`],
    ["increment", `context.tenantId++;`],
    ["unlisted Object helper", `return Object.getOwnPropertyDescriptors(context);`],
    ["unlisted Reflect helper", `return Reflect.ownKeys(context);`],
    ["Object namespace alias", `const helpers = Object; return helpers.assign({}, context, { tenantId });`],
    ["Reflect destructuring alias", `const { set: mutate } = Reflect; mutate(context, "tenantId", tenantId);`],
    ["Object destructuring alias", `const { assign } = Object; return assign({}, context, { tenantId });`],
    ["helper alias chain", `const first = Object.assign; const second = first; return second({}, context, { tenantId });`],
    ["bracketed helper alias", `const assign = Object["assign"]; return assign({}, context, { tenantId });`],
    ["bound helper alias", `const assign = Object.assign.bind(Object); return assign({}, context, { tenantId });`],
    ["container helper alias", `const helpers = { assign: Object.assign }; return helpers.assign({}, context, { tenantId });`],
    ["delayed helper alias", `let assign; assign = Object.assign; return assign({}, context, { tenantId });`],
    ["inline forwarding result", `const alias = ((value) => value)(context); return { ...alias, tenantId };`],
    ["unannotated forwarding result", `function forward(value) { return value; } const alias = forward(context); return { ...alias, tenantId };`],
    ["generic helper reconstruction", `function copy<T extends { tenantId: string }>(value: T) { return { ...value, tenantId }; } return copy(context);`],
    ["generic mutable parameter", `function mutate<T extends { tenantId: string }>(value: T) { value.tenantId = tenantId; } mutate(context);`],
    ["forwarding function alias", `function forward(value: VerifiedTenantContext) { return value; } const pass = forward; const alias = pass(context); return { ...alias, tenantId };`],
    ["inferred forwarding return", `const forward = () => context; const alias = forward(); return { ...alias, tenantId };`],
    ["inferred async forwarding return", `async function forward() { return context; } const alias = await forward(); return { ...alias, tenantId };`],
  ])("refuses uses outside the allow-list: %s", (_name, body) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\nasync function change(context: VerifiedTenantContext, replacement: VerifiedTenantContext, tenantId: string) { ${body} }`), path).toEqual(mentions("verified tenant context"));
  });

  it("accepts only whole forwarding, const chains and value reads, including captured returns", () => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}
function forward(context: VerifiedTenantContext) { const first = context; const second = first; forwardWhole(second); return second; }
const arrow = (context: VerifiedTenantContext) => context;
function read(context: VerifiedTenantContext) { const tenantId = context.tenantId; return { tenantId }; }
function capture(context: VerifiedTenantContext) { return () => context; }
function wrapped(context: VerifiedTenantContext) { return ((context)); }
async function resolved() { const context = await resolveVerifiedTenantContext(provider, request, origin); return context; }`), path).toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, `${validSynthetic}
const original = context(); const alias = original; forwardWhole(alias); const tenantId = alias.tenantId;`)).toEqual([]);
  });

  it("rejects container use of an inferred minted context and never exempts a context getter's mutation", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, `${validSynthetic}\nconst original = context(); const alias = original; const holder = { alias };`)).toEqual(mentions("verified tenant context"));
    expect(rogueAt(PLANT_PATHS[0]!, `${contextImport}\nfunction capture(context: VerifiedTenantContext) { Object.defineProperty(holder, "context", { get: () => { context.tenantId = "other"; return context; } }); }`)).toEqual(mentions("verified tenant context"));
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Round 3 (Sol check of 25499d1): aliases must not launder the constructor or the context type, and the retained synthetic
// exception must be bound to the authoritative fixture constants, not to identifiers that merely share their names.
// ---------------------------------------------------------------------------------------------------------------------
const IMPORT_FIXTURES = `import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, verifiedTenantContextFromMembership } from "@jobguard/db";`;
const CALL_FIXTURES = `export const context = () => verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any);`;
const rogueAt = (path: string, text: string) => boundaryViolations([{ path, text }]);
const mentions = (fragment: string) => expect.arrayContaining([expect.stringContaining(fragment)]);
// Every place a request-fed context could be planted: api composition, api auth, web, another package.
const PLANT_PATHS = ["apps/api/src/new-feature.application.ts", "apps/api/src/auth/planted.ts", "apps/web/app/lib/planted.ts", "packages/core/src/planted.ts"];

describe("M0-6L round 3: renamed imports cannot bypass the constructor boundary", () => {
  it("rejects a constructor imported under another name, wherever it is planted", () => {
    for (const path of PLANT_PATHS) {
      expect(rogueAt(path, `import { verifiedTenantContextFromMembership as makeContext } from "@jobguard/db";
export const context = (tenantId: string) => makeContext({ tenantId } as never);`), path).toEqual(mentions("under another name"));
    }
    // A string-literal module export name is the same import.
    expect(rogueAt(PLANT_PATHS[0]!, `import { "verifiedTenantContextFromMembership" as makeContext } from "@jobguard/db";
export const context = (tenantId: string) => makeContext({ tenantId } as never);`)).toEqual(mentions("under another name"));
    // Destructuring under another name from a namespace import is the same rename.
    expect(rogueAt(PLANT_PATHS[0]!, `import * as db from "@jobguard/db";
const { verifiedTenantContextFromMembership: makeContext } = db;
export const context = (tenantId: string) => makeContext({ tenantId } as never);`)).toEqual(mentions("under another name"));
  });

  it("rejects the context type imported under another name, however it is then used", () => {
    for (const path of PLANT_PATHS) {
      expect(rogueAt(path, `import type { VerifiedTenantContext as Context } from "@jobguard/db";
export const context = (tenantId: string) => ({ tenantId }) as Context;`), path).toEqual(mentions("under another name"));
    }
    expect(rogueAt(PLANT_PATHS[0]!, `import { type VerifiedTenantContext as Context } from "@jobguard/db";
export const context = <Context>{ tenantId: input };`)).toEqual(mentions("under another name"));
  });

  it("rejects a re-exported alias, so another file cannot import the renamed form", () => {
    expect(rogueAt("apps/api/src/laundry.ts", `export { verifiedTenantContextFromMembership as makeContext } from "@jobguard/db";`)).toEqual(mentions("under another name"));
    expect(rogueAt("apps/api/src/laundry.ts", `export type { VerifiedTenantContext as Context } from "@jobguard/db";`)).toEqual(mentions("under another name"));
    expect(rogueAt("apps/api/src/laundry.ts", `import { verifiedTenantContextFromMembership } from "@jobguard/db";
export { verifiedTenantContextFromMembership as makeContext };`)).toEqual(mentions("under another name"));
    // The laundering pair as two files: the barrel renames, the second file only ever sees the harmless-looking alias.
    const problems = boundaryViolations([
      { path: "apps/api/src/laundry.ts", text: `export { verifiedTenantContextFromMembership as makeContext } from "@jobguard/db";` },
      { path: "apps/api/src/new-feature.application.ts", text: `import { makeContext } from "./laundry.js";
export const context = (tenantId: string) => makeContext({ tenantId } as never);` },
    ]);
    expect(problems).toEqual(mentions("apps/api/src/laundry.ts:1"));
    // The bridge, the definition and the worker are bound by the same rule.
    expect(rogueAt(REAL, `import { verifiedTenantContextFromMembership as make } from "@jobguard/db";
export const context = (membership: unknown) => make(asAuthenticatedMembership(membership));`)).toEqual(mentions("under another name"));
  });

  it("rejects a local alias or derivation of the context type used as a cast target", () => {
    const base = `import type { VerifiedTenantContext } from "@jobguard/db";\n`;
    const control = rogueAt("apps/api/src/x.ts", `${base}type Ctx = { tenantId: string };\nexport const c = { tenantId: input } as Ctx;`);
    expect(control).toEqual([]);
    for (const [name, text] of Object.entries({
      "type alias": `${base}type Ctx = VerifiedTenantContext;\nexport const c = { tenantId: input } as Ctx;`,
      "alias of an alias": `${base}type Ctx = Readonly<VerifiedTenantContext>;\ntype Again = Ctx;\nexport const c = { tenantId: input } as Again;`,
      "interface extends": `${base}interface Ctx extends VerifiedTenantContext {}\nexport const c = { tenantId: input } as Ctx;`,
      "return type of the constructor": `import { verifiedTenantContextFromMembership } from "@jobguard/db";\nexport const c = { tenantId: input } as ReturnType<typeof verifiedTenantContextFromMembership>;`,
      "second parameter of withTenant": `import { withTenant } from "@jobguard/db";\nexport const c = { tenantId: input } as Parameters<typeof withTenant>[1];`,
      "import-equals alias": `import db = require("@jobguard/db");\nimport Ctx = db.VerifiedTenantContext;\nexport const c = { tenantId: input } as Ctx;`,
    })) {
      for (const path of ["apps/api/src/x.ts", "apps/web/app/lib/x.ts", "packages/core/src/x.ts"]) expect(rogueAt(path, text), `${name} in ${path}`).not.toEqual([]);
    }
    // An alias that is exported can be imported and cast elsewhere, so exporting one is itself a violation.
    expect(rogueAt("apps/api/src/x.ts", `${base}export type Ctx = VerifiedTenantContext;`)).toEqual(mentions("exports an alias"));
    expect(rogueAt("apps/api/src/x.ts", `${base}type Ctx = VerifiedTenantContext;\nexport { Ctx };`)).toEqual(mentions("exports an alias"));
    expect(rogueAt("apps/api/src/x.ts", `${base}export interface Ctx extends VerifiedTenantContext {}`)).toEqual(mentions("exports an alias"));
  });

  it("still allows name-preserving plumbing and the argument-type derivation the synthetic sandbox uses", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\nexport const context = () => verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as Parameters<typeof verifiedTenantContextFromMembership>[0]);`)).toEqual([]);
    expect(rogueAt("packages/db/src/index.ts", `export { verifiedTenantContextFromMembership, withTenant, type VerifiedTenantContext } from "./tenant-context.js";\nexport * from "./demo-seed.js";`)).toEqual([]);
  });
});

describe("M0-6L round 3: the retained synthetic exception is bound to the authoritative fixture constants", () => {
  const importOnly = `import { verifiedTenantContextFromMembership } from "@jobguard/db";\n`;

  it("accepts the shape only in an explicitly approved, existing file", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\n${CALL_FIXTURES}`)).toEqual([]);
    // The identical, perfectly shaped text in any other file is refused: a new caller needs a reviewed edit to the approved list.
    for (const path of ["apps/api/src/new-feature.application.ts", "apps/api/src/auth/new.ts", "packages/db/src/new-repository.ts"]) {
      expect(rogueAt(path, `${IMPORT_FIXTURES}\n${CALL_FIXTURES}`), path).toEqual(mentions("not an approved retained synthetic file"));
    }
  });

  it("rejects local replacements of the fixture constants, even when they hold request input", () => {
    // Sol's reproduction: both identifiers assigned from request input, same names, no import.
    expect(rogueAt(APPROVED_SYNTHETIC, `${importOnly}const DEMO_TENANT_ID = request.tenant;\nconst DEMO_MEMBERSHIP_ID = request.membership;\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `${importOnly}const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";\nconst DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    // Declared as a function, a class or a mutable variable.
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES.replace("DEMO_TENANT_ID, ", "")}\nlet DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";\nDEMO_TENANT_ID = body.tenant;\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES.replace("DEMO_MEMBERSHIP_ID, ", "")}\nfunction DEMO_MEMBERSHIP_ID() { return body.membership; }\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_MEMBERSHIP_ID"));
  });

  it("rejects shadowing in any inner scope", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\nexport const context = (DEMO_TENANT_ID: string) => verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any);`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\nexport const context = (input: { tenant: string }) => { const DEMO_TENANT_ID = input.tenant; return verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any); };`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\nexport const context = (input: { DEMO_MEMBERSHIP_ID: string }) => { const { DEMO_MEMBERSHIP_ID } = input; return verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any); };`)).toEqual(mentions("fixture constant DEMO_MEMBERSHIP_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `${IMPORT_FIXTURES}\nexport const context = () => { try { return 1; } catch (DEMO_TENANT_ID) { return verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any); } };`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
  });

  it("requires an unaliased import from the fixture module itself", () => {
    expect(rogueAt(APPROVED_SYNTHETIC, `import { verifiedTenantContextFromMembership } from "@jobguard/db";\nimport { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./my-constants.js";\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `import { verifiedTenantContextFromMembership, requestedTenant as DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID } from "@jobguard/db";\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `import { verifiedTenantContextFromMembership, DEMO_MEMBERSHIP_ID } from "@jobguard/db";\nimport DEMO_TENANT_ID from "./tenant.js";\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt(APPROVED_SYNTHETIC, `import { verifiedTenantContextFromMembership, DEMO_MEMBERSHIP_ID } from "@jobguard/db";\nimport * as DEMO_TENANT_ID from "./tenant.js";\n${CALL_FIXTURES}`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    // Inside packages/db the only authoritative relative module is demo-seed.
    const dbText = `import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "./demo-seed.js";\nimport { verifiedTenantContextFromMembership } from "./tenant-context.js";\n${CALL_FIXTURES}`;
    expect(rogueAt("packages/db/src/demo-runtime.ts", dbText)).toEqual([]);
    expect(rogueAt("packages/db/src/demo-runtime.ts", dbText.replace("./demo-seed.js", "./not-the-seed.js"))).toEqual(mentions("fixture constant"));
    expect(rogueAt("packages/db/src/demo-runtime.ts", dbText.replace("./demo-seed.js", "../../elsewhere/demo-seed.js"))).toEqual(mentions("fixture constant"));
    // The relative form is not a way for the api to read some other file of the same name.
    expect(rogueAt("apps/api/src/material.application.ts", dbText)).toEqual(mentions("fixture constant"));
  });

  it("requires every property of the constructor argument to be a literal property, so nothing can override the fixed tenant", () => {
    const withBody = (body: string) => `${IMPORT_FIXTURES}\nexport const context = (input: Record<string, string>) => verifiedTenantContextFromMembership(${body} as any);`;
    const fixed = `{ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID }`;
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(fixed))).toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(`{ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID, ...input }`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(`{ ...input, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID }`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(`{ membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID, ["tenant" + "Id"]: input.tenant }`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(`{ membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID, "tenantId": input.tenant }`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, withBody(`{ membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID, get identityUserId() { return input.id; } }`))).not.toEqual([]);
  });

  it("resolves an object passed by name only when exactly one top-level constant declares it", () => {
    const named = (extra: string) => `import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, verifiedTenantContextFromMembership } from "@jobguard/db";
const membership = { identityUserId: DEMO_IDENTITY_USER_ID, membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID };
${extra}
export const context = () => verifiedTenantContextFromMembership(membership as any);`;
    expect(rogueAt(APPROVED_SYNTHETIC, named(""))).toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, named(`export const other = (membership: Record<string, string>) => membership;`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, named(`const later = (input: Record<string, string>) => { const membership = input; return membership; };`))).not.toEqual([]);
    expect(rogueAt(APPROVED_SYNTHETIC, named(`let mutable = 1;`).replace("const membership =", "let membership ="))).not.toEqual([]);
    // Resolution is by NAME only while the object cannot change afterwards: reads of its properties are fine, anything that
    // writes, deletes, hands it on or spreads it is not.
    expect(rogueAt(APPROVED_SYNTHETIC, named(`export const read = () => ({ id: membership.membershipId, who: membership.identityUserId });`))).toEqual([]);
    for (const [name, extra] of Object.entries({
      "property write": `export const swap = (input: { tenant: string }) => { (membership as Record<string, string>).tenantId = input.tenant; };`,
      "element write": `export const swap = (input: { tenant: string }) => { (membership as Record<string, string>)["tenantId"] = input.tenant; };`,
      "compound write": `export const swap = (input: { tenant: string }) => { (membership as Record<string, string>).tenantId += input.tenant; };`,
      "delete": `export const swap = () => { delete (membership as Record<string, string>).tenantId; };`,
      "handed to a function": `export const hand = (mutate: (value: object) => void) => mutate(membership);`,
      "Object.assign": `export const merge = (body: object) => Object.assign(membership, body);`,
      "spread": `export const copy = () => ({ ...membership });`,
      "aliased": `export const alias = membership;`,
      "shorthand": `export const wrap = () => ({ membership });`,
      "method call": `export const call = () => (membership as { toString(): string }).toString();`,
    })) expect(rogueAt(APPROVED_SYNTHETIC, named(extra)), name).toEqual(mentions("fixed, plain literal object"));
  });

  it("holds the fixture module itself to literal UUID constants and keeps every other file from redefining them", () => {
    const seed = `export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";`;
    expect(boundaryViolations([{ path: "packages/db/src/demo-seed.ts", text: seed }])).toEqual([]);
    for (const bad of [
      `export const DEMO_TENANT_ID = process.env.TENANT_ID;\nexport const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";`,
      `export let DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";\nexport const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";`,
      `export const DEMO_TENANT_ID = "not-a-uuid";\nexport const DEMO_MEMBERSHIP_ID = "d1500000-0000-4000-8000-000000000003";`,
      `export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";\nexport const DEMO_MEMBERSHIP_ID = \`d1500000-0000-4000-8000-\${suffix}\`;`,
    ]) expect(boundaryViolations([{ path: "packages/db/src/demo-seed.ts", text: bad }]), bad).toEqual(mentions("fixture constant"));
    // A barrel that shadows or re-sources a fixture name.
    expect(rogueAt("packages/db/src/index.ts", `export * from "./demo-seed.js";\nexport const DEMO_TENANT_ID = input;`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt("packages/db/src/index.ts", `export * from "./demo-seed.js";\nexport { DEMO_TENANT_ID } from "./other.js";`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt("packages/db/src/index.ts", `export * from "./demo-seed.js";\nexport { somethingElse as DEMO_TENANT_ID } from "./demo-seed.js";`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt("packages/db/src/index.ts", `export * from "./demo-seed.js";\nexport { DEMO_TENANT_ID } from "./demo-seed.js";`)).toEqual([]);
    // A file that never constructs anything may not mint a look-alike either.
    expect(rogueAt("apps/api/src/harmless.ts", `export const DEMO_TENANT_ID = request.tenant;`)).toEqual(mentions("fixture constant DEMO_TENANT_ID"));
    expect(rogueAt("apps/web/app/lib/harmless.ts", `export const DEMO_MEMBERSHIP_ID = cookie;`)).toEqual(mentions("fixture constant DEMO_MEMBERSHIP_ID"));
  });

  it("pins the approved list to files that exist and still construct, and it covers every file the real tree constructs in", async () => {
    const files = await applicationSource();
    const present = new Set(files.map(f => f.path));
    const constructing = files.filter(f => occurrences(f).found.some(o => o.kind === "call" || o.kind === "cast")).map(f => f.path);
    expect(APPROVED_SYNTHETIC_FILES.filter(path => !present.has(path))).toEqual([]);
    expect(APPROVED_SYNTHETIC_FILES.filter(path => !constructing.includes(path))).toEqual([]);
    const special = new Set([REAL, DEFINITION, WORKER, REHEARSAL]);
    expect(APPROVED_PRACTICE_FILES.filter(path => !present.has(path) || !constructing.includes(path))).toEqual([]);
    expect(constructing.filter(path => !special.has(path) && !APPROVED_SYNTHETIC_FILES.includes(path) && !APPROVED_PRACTICE_FILES.includes(path))).toEqual([]);
    // The authoritative fixture module really holds literal UUID constants for every name the scan trusts.
    const seed = files.find(f => f.path === "packages/db/src/demo-seed.ts")!;
    expect(boundaryViolations([seed])).toEqual([]);
    // Next conventions such as middleware.ts live beside the app folder, so top-level application files are scanned too.
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining(["apps/web/playwright.config.ts", "apps/web/vitest.config.ts"]));
    expect(rogueAt("apps/web/middleware.ts", `${IMPORT_FIXTURES}\n${CALL_FIXTURES}`)).toEqual(mentions("outside the synthetic composition roots"));
    expect(fixtureConstantNames(seed.text)).toEqual(expect.arrayContaining(["DEMO_TENANT_ID", "DEMO_EMPTY_TENANT_ID", "DEMO_MEMBERSHIP_ID", "DEMO_EMPTY_MEMBERSHIP_ID", "DEMO_IDENTITY_USER_ID"]));
  });
});


describe("M0-6L round 8: dd0f53f typed substitutions", () => {
  const contextImport = `import type { VerifiedTenantContext } from "@jobguard/db";`;
  it.each([
    ["O14 typeof context", `function change(context: VerifiedTenantContext, tenantId: string) { return withTenant(pool, { tenantId } as typeof context, work); }`],
    ["R9 typeof context getter", `function change(context: VerifiedTenantContext, tenantId: string) { return { get tenantId() { return tenantId; } } as typeof context; }`],
    ["typeof inferred alias", `function change(context: VerifiedTenantContext, tenantId: string) { const original = context; type C = typeof original; return { tenantId } as C; }`],
    ["O16 indexed interface member", `interface Req { verifiedTenantContext: VerifiedTenantContext } function change(tenantId: string) { return { tenantId } as Req["verifiedTenantContext"]; }`],
    ["indexed nested alias member", `type Req = { auth: { context: VerifiedTenantContext } }; type C = Req["auth"]["context"]; function change(tenantId: string) { return { tenantId } as C; }`],
    ["indexed readonly optional member", `interface Req { readonly context?: Readonly<VerifiedTenantContext> } function change(tenantId: string) { return { tenantId } as Req["context"]; }`],
    ["G1 globalThis structuredClone assign", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = globalThis.structuredClone(context); Object.assign(copy, { tenantId }); return copy; }`],
    ["G2 globalThis structuredClone write", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = globalThis.structuredClone(context); (copy as { tenantId: string }).tenantId = tenantId; return copy; }`],
    ["R7 self structuredClone", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = self.structuredClone(context); Object.assign(copy, { tenantId }); return copy; }`],
    ["arbitrary receiver structuredClone", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = receiver().structuredClone(context); return copy; }`],
    ["receiver Object", `function change(context: VerifiedTenantContext, tenantId: string) { return receiver().Object.assign({}, context, { tenantId }); }`],
    ["receiver Reflect", `function change(context: VerifiedTenantContext) { return receiver().Reflect.ownKeys(context); }`],
    ["receiver JSON", `function change(context: VerifiedTenantContext) { return receiver()["JSON"].stringify(context); }`],
    ["receiver structuredClone alias", `function change(context: VerifiedTenantContext) { const clone = receiver()["structuredClone"]; return clone(context); }`],
    ["R1 map closure return", `function change(context: VerifiedTenantContext, tenantId: string) { const copy = [0].map(() => context)[0]!; return { ...copy, tenantId }; }`],
    ["callback block return", `function change(context: VerifiedTenantContext) { return consume(function () { return ((context)); }); }`],
    ["callback async return", `function change(context: VerifiedTenantContext) { return consume(async () => context); }`],
    ["named callback return", `function change(context: VerifiedTenantContext) { const callback = () => context; return consume(callback); }`],
  ])("rejects %s", (_name, code) => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}\n${code}`), path).toEqual(mentions("verified tenant context"));
  });

  it("accepts only non-escaping truth/null/typeof checks", () => {
    for (const path of PLANT_PATHS) expect(rogueAt(path, `${contextImport}
function guard(context: VerifiedTenantContext | undefined) {
 if (!context || context == null || null === context || context !== undefined || typeof context !== "object") return;
 return context;
}`), path).toEqual([]);
    // Comparisons expose only a boolean, but do not exempt the other operand's escaping use.
    expect(rogueAt(PLANT_PATHS[0]!, `${contextImport}\nfunction bad(context: VerifiedTenantContext) { return context == store(context); }`)).not.toEqual([]);
  });
});


describe("M0-6L round 8: exact stamped definition and reviewed practice callers", () => {
  it("keeps the merged stamp private and requires both constructors to mint once before returning", () => {
    const definition = readFileSync(join(repository, DEFINITION), "utf8");
    expect(rogueAt(DEFINITION, definition)).toEqual([]);
    for (const changed of [
      definition.replace("const genuineTenantContexts", "export const genuineTenantContexts"),
      `${definition}\nexport { genuineTenantContexts };`,
      definition.replace("new WeakSet<object>()", "new Set<object>()"),
      definition.replace("genuineTenantContexts.add(context);", ""),
      definition.replace("genuineTenantContexts.add(context);", "genuineTenantContexts.add(context); genuineTenantContexts.add(context);"),
      definition.replace("genuineTenantContexts.add(context);", "genuineTenantContexts.add({ ...context });"),
      definition.replace("return context;", "return { ...context };"),
      definition.replace("const context = Object.freeze({ tenantId })", "const context = Object.freeze({ tenantId: input })"),
      definition.replace("!genuineTenantContexts.has(context)", "!context"),
      definition.replace(" as VerifiedTenantContext;", " as typeof context;"),
    ]) expect(rogueAt(DEFINITION, changed)).not.toEqual([]);
  });

  it("approves each main practice caller only at its exact reviewed source identity", () => {
    for (const path of APPROVED_PRACTICE_FILES) {
      const source = readFileSync(join(repository, path), "utf8");
      expect(rogueAt(path, source), path).toEqual([]);
      // Neither this file's name nor another reviewed file's contents suffice for new authority.
      expect(rogueAt(path, `${source}\nconst extra = verifiedTenantContextFromMembership(input);`), path).not.toEqual([]);
      expect(rogueAt("packages/db/src/new-practice.ts", source), path).not.toEqual([]);
      expect(rogueAt(path, source.replace("verifiedTenantContextFromMembership(", "verifiedTenantContextFromMembership(requestTenant || ")), path).not.toEqual([]);
    }
    const path = "packages/db/src/practice-session.ts", source = readFileSync(join(repository, path), "utf8");
    for (const changed of [source.replace("syntheticOnly(); const parsed", "const parsed"), source.replace("principalV1.parse(row)", "requestPrincipal"), source.replace("return {context,digest", "return {copy:context,context,digest")]) expect(rogueAt(path, changed)).not.toEqual([]);
  });

  it("revokes the superseded fixed-fixture constructor grants after request-scoped practice integration", () => {
    for (const path of ["apps/api/src/material.application.ts", "apps/api/src/recovery-case.application.ts", "apps/api/src/evidence-pack.application.ts", "packages/db/src/sandbox-repository.ts"]) expect(rogueAt(path, validSynthetic)).toEqual(mentions("not an approved retained synthetic file"));
    // The queue mint cannot be imported/aliased into a new business constructor either.
    for (const path of PLANT_PATHS) {
      expect(rogueAt(path, `import { verifiedTenantContextForQueuedJob } from "@jobguard/db"; export const context = verifiedTenantContextForQueuedJob(input);`)).not.toEqual([]);
      expect(rogueAt(path, `import { verifiedTenantContextForQueuedJob as mint } from "@jobguard/db"; export const context = mint(input);`)).toEqual(mentions("under another name"));
    }
  });
});
