import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, posix, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * M0-6L card: "the only callers that construct a verifiedContext/effective_tenant_id for withTenant are the authenticated
 * principal bridge". This scans ALL application source (apps/api/src, apps/web/app, packages/<each>/src and /tools) with the
 * TypeScript parser, not text search, and fails on any constructor call, alias, cast to VerifiedTenantContext or
 * effective-tenant identifier outside four explicit, individually tested categories:
 *
 *   real       apps/api/src/auth/principal-bridge.ts: exactly one call, fed by the verified membership lookup.
 *   definition packages/db/src/tenant-context.ts: the function itself and its one frozen { tenantId } cast.
 *   worker     apps/api/src/worker.ts: one cast, fed only by a strictly validated queue payload (server-created, never a request).
 *   synthetic  retained practice-sandbox composition: ONLY the files named in APPROVED_SYNTHETIC_FILES (a new caller needs a
 *              reviewed edit to that list). Every call/cast is fed ONLY the fixed DEMO_* tenant and membership constants, and
 *              those identifiers must resolve to the authoritative fixture module (see below). The file carries no
 *              request-derived tenant selector. Reachability is separately proven by identity.test.ts (global Nest guard;
 *              synthetic cookie refused outside synthetic_demo) and by the web adapters, which check JOBGUARD_ENV.
 *   rehearsal  packages/db/tools/synthetic-restore.mjs: disposable synthetic restore rehearsal that refuses any other mode.
 *
 * Aliases (round 3): the constructor and the context type may be imported, exported and destructured ONLY under their own
 * names, so every use is visible to the scan by name. A local type alias, interface, `import X = ns.T`,
 * `ReturnType<typeof constructor>` or `typeof withTenant` is a derivation of the context type: it is tracked to a fixed point
 * within the file when it is a cast target, and exporting one is refused (another file could import and cast it).
 *
 * Fixture binding (round 3): a name such as DEMO_TENANT_ID is trusted because of WHERE IT COMES FROM, not because of how it
 * is spelled. In all application source such a name may only be an unaliased import from `@jobguard/db` or, inside
 * packages/db/src, from ./demo-seed; any local declaration, parameter, destructuring, catch variable, rename, default or
 * namespace import is refused, and packages/db/src/demo-seed.ts itself must hold each as an exported const literal UUID.
 * An object passed to the constructor by name resolves only to exactly one top-level const declaration, and every
 * constructor argument must be a plain literal (no spread, computed key, accessor or duplicate property).
 *
 * Limits, stated so nobody mistakes the scan for a type-checker: it cannot see a context laundered through `any`/`never`
 * or a type derived through an arbitrary signature (for example Parameters<SomeClass["method"]>[0]), or a member name
 * computed at run time. Those stay covered by the TypeScript compiler, the explicit approved-file list and review.
 *
 * Tests, fixtures and generated output are not application source.
 */
const REAL = "apps/api/src/auth/principal-bridge.ts";
const DEFINITION = "packages/db/src/tenant-context.ts";
const WORKER = "apps/api/src/worker.ts";
const REHEARSAL = "packages/db/tools/synthetic-restore.mjs";
const DECISIONS = "apps/api/src/decisions/decisions.application.ts";
const FIXTURE_MODULE = "packages/db/src/demo-seed.ts";
const SYNTHETIC_ROOTS = ["apps/api/src/", "packages/db/src/"];
/** The complete, explicit set of retained synthetic-sandbox files that may build a context from the fixed DEMO identity. */
const APPROVED_SYNTHETIC_FILES = [
  "apps/api/src/capture/capture.application.ts",
  "apps/api/src/customer-invoice.application.ts",
  "apps/api/src/decisions/decisions.application.ts",
  "apps/api/src/evidence-pack.application.ts",
  "apps/api/src/final-account.application.ts",
  "apps/api/src/inbox-relevance.application.ts",
  "apps/api/src/material.application.ts",
  "apps/api/src/proof/proof.application.ts",
  "apps/api/src/purchase-order.application.ts",
  "apps/api/src/quote/quote.application.ts",
  "apps/api/src/readiness.application.ts",
  "apps/api/src/recovery-case.application.ts",
  "apps/api/src/supplier-document.application.ts",
  "apps/api/src/supplier-match.application.ts",
  "apps/api/src/things-to-check.application.ts",
  "apps/api/src/value/value.application.ts",
  "apps/api/src/variation/variation.application.ts",
  "packages/db/src/demo-runtime.ts",
  "packages/db/src/fee-illustration-repository.ts",
  "packages/db/src/recovery-demo-repository.ts",
  "packages/db/src/sandbox-repository.ts",
];
const REQUEST_DERIVED = /x-tenant-id|tenantHeader|request\.headers|searchParams|\bcookies\s*\(|principal-bridge|resolveVerifiedTenantContext|IdentityApplication/u;
// A synthetic service may read a client-supplied tenant only to REFUSE any value other than the fixed demo tenant.
const CLIENT_TENANT = /requested_tenant_id|requestedTenantId/u;
const CLIENT_TENANT_REFUSED = /requested_tenant_id\s*!==\s*DEMO_TENANT_ID/u;
const CONSTRUCTOR = "verifiedTenantContextFromMembership";
const CONTEXT_TYPE = "VerifiedTenantContext";
const WATCHED = new Set([CONSTRUCTOR, CONTEXT_TYPE]);
const DEMO_TENANT = new Set(["DEMO_TENANT_ID", "DEMO_EMPTY_TENANT_ID"]);
/** Names whose meaning is "the fixed demo identity" and therefore must come from the fixture module. */
const FIXTURE_NAME = /^DEMO_(?:[A-Z]+_)*(?:TENANT_ID|MEMBERSHIP_ID|IDENTITY_USER_ID)$/u;
const UUID_LITERAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
// A type that is the context type without naming it: the constructor's return type, or the context parameter of withTenant.
const CONTEXT_DERIVED = /\bReturnType\s*<\s*typeof\s+[\w$.]*verifiedTenantContextFromMembership\b|\btypeof\s+[\w$.]*withTenant\b/u;
// Cheap pre-filter so only files that can possibly hold an occurrence are parsed (a file without any of these words cannot
// construct, alias, cast to or assign an effective tenant context, nor bind a fixture constant). Keeps the scan fast.
const RELEVANT = /verifiedTenantContextFromMembership|VerifiedTenantContext|effective_tenant_id|effectiveTenantId|typeof\s+[\w$.]*withTenant|DEMO_[A-Z_]*(?:TENANT_ID|MEMBERSHIP_ID|IDENTITY_USER_ID)/u;

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
  // Type declarations that may be (an alias of) the context type, and local names exported without a module specifier.
  const typeNames: { name: string; text: string; node: ts.Node; exported: boolean }[] = [];
  const exportedLocals: { name: string; node: ts.Node }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) assertions.push(node);

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
    if (named && (node as ts.Identifier | ts.StringLiteral).text === CONSTRUCTOR) {
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
  const taintPattern = new RegExp(`\\b(?:${[...tainted].map(name => name.replace(/\$/gu, "\\$")).join("|")})\\b`, "u");
  for (const node of assertions) {
    const target = node.type.getText(source);
    if (taintPattern.test(target) || CONTEXT_DERIVED.test(target)) found.push({ kind: "cast", operand: unwrap(node.expression), node });
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
  const allowed = (node: ts.Identifier): boolean => {
    const parent = node.parent;
    if ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node) {
      const use = parent.parent;
      if (ts.isBinaryExpression(use) && use.left === parent && isAssignmentOperator(use.operatorToken.kind)) return false;
      if (ts.isDeleteExpression(use) || ((ts.isPrefixUnaryExpression(use) || ts.isPostfixUnaryExpression(use)) && (use.operator === ts.SyntaxKind.PlusPlusToken || use.operator === ts.SyntaxKind.MinusMinusToken))) return false;
      return !(ts.isCallExpression(use) && use.expression === parent);
    }
    let outer: ts.Node = node;
    while ((ts.isAsExpression(outer.parent) || ts.isTypeAssertionExpression(outer.parent) || ts.isParenthesizedExpression(outer.parent) || ts.isNonNullExpression(outer.parent) || ts.isSatisfiesExpression(outer.parent)) && outer.parent.expression === outer) outer = outer.parent;
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
export function boundaryViolations(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const { found, source, problems: aliasProblems, bindings } = occurrences(file);
    problems.push(...aliasProblems);
    if (!found.length) continue;
    const at = (node: ts.Node) => `${file.path}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`;
    const calls = found.filter((o): o is Extract<Occurrence, { kind: "call" }> => o.kind === "call");
    const casts = found.filter((o): o is Extract<Occurrence, { kind: "cast" }> => o.kind === "cast");
    const declarations = found.filter(o => o.kind === "declaration");
    for (const o of found.filter(f => f.kind === "reference")) problems.push(`${at(o.node)} aliases or passes ${CONSTRUCTOR} instead of calling it`);
    for (const o of found.filter(f => f.kind === "effective")) if (file.path !== REAL) problems.push(`${at(o.node)} effective tenant identifier outside the principal bridge`);

    if (file.path === REAL) {
      if (calls.length !== 1 || casts.length || declarations.length) problems.push(`${file.path} must contain exactly one constructor call and no casts`);
      for (const c of calls) {
        const argument = c.argument && unwrap(c.argument);
        if (!argument || !ts.isCallExpression(argument) || !ts.isIdentifier(argument.expression) || argument.expression.text !== "asAuthenticatedMembership") problems.push(`${at(c.node)} the bridge may only construct from the verified membership lookup`);
      }
    } else if (file.path === DEFINITION) {
      if (declarations.length !== 1 || calls.length || casts.length !== 1) problems.push(`${file.path} must declare the constructor once and cast once`);
      for (const c of casts) if (c.operand.getText(source).replace(/\s+/gu, "") !== "Object.freeze({tenantId:membership.tenantId})") problems.push(`${at(c.node)} the definition may only freeze { tenantId: membership.tenantId }`);
    } else if (file.path === WORKER) {
      if (calls.length || declarations.length || casts.length !== 1) problems.push(`${file.path} must contain exactly one cast and no constructor call`);
      for (const c of casts) {
        const literal = c.operand;
        const fromPayload = ts.isObjectLiteralExpression(literal) && literal.properties.length === 1 && propertyInitializer(literal, "tenantId") !== undefined && literal.getText(source).replace(/\s+/gu, "") === "{tenantId:parsed.tenantId}";
        if (!fromPayload || !/const parsed=z\.object\(\{[^}]*tenantId:z\.string\(\)\.uuid\(\)[^}]*\}\)\.strict\(\)\.parse\(payload\)/u.test(file.text)) problems.push(`${at(c.node)} worker tenant must come only from a strictly validated queue payload`);
      }
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
      const decisionsGate = file.path === DECISIONS
        && /const membership=\(tenantId:string\)=>tenantId===DEMO_TENANT_ID\?DEMO_MEMBERSHIP_ID:tenantId===DEMO_EMPTY_TENANT_ID\?DEMO_EMPTY_MEMBERSHIP_ID:null;/u.test(file.text)
        && /if\(!membershipId\)throw new DecisionsError\("FORBIDDEN"\)/u.test(file.text)
        && ["DEMO_TENANT_ID", "DEMO_MEMBERSHIP_ID", "DEMO_EMPTY_TENANT_ID", "DEMO_EMPTY_MEMBERSHIP_ID"].every(name => fixtureBound(file, bindings, name));
      for (const c of calls) {
        let argument = c.argument && unwrap(c.argument);
        if (argument && ts.isIdentifier(argument)) argument = resolveFixedObject(source, bindings, argument.text);
        if (!argument || !ts.isObjectLiteralExpression(argument) || !plainLiteral(argument)) { problems.push(`${at(c.node)} synthetic constructor argument must be a fixed, plain literal object (one top-level const, no spread, computed key, accessor or duplicate property)`); continue; }
        const tenant = propertyInitializer(argument, "tenantId"), membership = propertyInitializer(argument, "membershipId");
        const tenantOk = identifierIn(tenant, demoTenant) || (tenant === "shorthand" && decisionsGate);
        const membershipOk = identifierIn(membership, demoMembership) || (membership === "shorthand" && decisionsGate);
        if (!tenantOk || !membershipOk) problems.push(`${at(c.node)} synthetic constructor must use the fixed DEMO tenant and membership`);
      }
      for (const c of casts) {
        if (!ts.isObjectLiteralExpression(c.operand) || !plainLiteral(c.operand) || !identifierIn(propertyInitializer(c.operand, "tenantId"), demoTenant)) problems.push(`${at(c.node)} synthetic cast must wrap the fixed DEMO tenant`);
      }
    }
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
async function walk(directory: string, out: string[] = []): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else if (/\.(ts|tsx|mjs|js)$/u.test(entry.name) && !/\.test\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(path);
  }
  return out;
}
async function applicationSource(): Promise<SourceFile[]> {
  const roots = [join(repository, "apps/api/src"), join(repository, "apps/web/app")];
  for (const name of await readdir(join(repository, "packages"))) for (const folder of ["src", "tools"]) roots.push(join(repository, "packages", name, folder));
  const paths = (await Promise.all(roots.map(root => walk(root)))).flat();
  // Next conventions (middleware.ts, instrumentation.ts) and similar sit directly in the app folder, beside src/ or app/.
  for (const app of ["apps/api", "apps/web"]) {
    for (const entry of await readdir(join(repository, app), { withFileTypes: true })) {
      if (entry.isFile() && /\.(ts|tsx|mjs|js)$/u.test(entry.name) && !/\.test\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) paths.push(join(repository, app, entry.name));
    }
  }
  return Promise.all(paths.map(async path => ({ path: relative(repository, path).split(sep).join("/"), text: await readFile(path, "utf8") })));
}

// An approved retained synthetic file: the shape tests below run at this path so each negative case still fails for ITS OWN
// reason and not merely because a made-up path is not on the approved list (that rule has its own tests further down).
const APPROVED_SYNTHETIC = "apps/api/src/material.application.ts";
const validSynthetic = `import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, verifiedTenantContextFromMembership } from "@jobguard/db";
const context = () => verifiedTenantContextFromMembership({ identityUserId: "d1500000-0000-4000-8000-000000000001", membershipId: DEMO_MEMBERSHIP_ID, tenantId: DEMO_TENANT_ID } as any);`;

describe("M0-6L sole-constructor boundary across all application source", () => {
  it("holds for the real repository: only the bridge, its definition, the worker queue, the retained synthetic sandbox and the rehearsal construct a tenant context", async () => {
    const files = await applicationSource();
    expect(files.length).toBeGreaterThan(200);
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining([REAL, DEFINITION, WORKER, REHEARSAL, "apps/web/app/lib/identity-server.ts"]));
    expect(boundaryViolations(files)).toEqual([]);
    // The real-user path has exactly one constructor in the whole tree: every other call is the fixed synthetic sandbox.
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

  it("allows the bridge exactly one verified-membership constructor, the worker exactly one payload cast, and nothing else", () => {
    const rogue = (path: string, text: string) => boundaryViolations([{ path, text }]);
    const bridge = `import { verifiedTenantContextFromMembership } from "@jobguard/db";
export const make = (membership: unknown) => verifiedTenantContextFromMembership(asAuthenticatedMembership(membership));`;
    expect(rogue(REAL, bridge)).toEqual([]);
    expect(rogue(REAL, `${bridge}\nexport const second = (body: any) => verifiedTenantContextFromMembership({ tenantId: body.tenant });`)).not.toEqual([]);
    expect(rogue(REAL, bridge.replace("asAuthenticatedMembership(membership)", "membership"))).not.toEqual([]);
    expect(rogue(REAL, `${bridge}\nexport const c = { tenantId: "x" } as VerifiedTenantContext;`)).not.toEqual([]);
    const worker = `const parsed=z.object({actionId:z.string().uuid(),tenantId:z.string().uuid()}).strict().parse(payload);
await executor.execute({tenantId:parsed.tenantId} as VerifiedTenantContext,parsed.actionId);`;
    expect(rogue(WORKER, worker)).toEqual([]);
    expect(rogue(WORKER, `${worker}\nawait executor.execute({tenantId:other} as VerifiedTenantContext,id);`)).not.toEqual([]);
    expect(rogue(WORKER, worker.replace(".strict()", ""))).not.toEqual([]);
    expect(rogue(WORKER, worker.replace("parsed.tenantId", "payload.tenantId"))).not.toEqual([]);
    expect(rogue(WORKER, `${worker}\nconst c = verifiedTenantContextFromMembership({ tenantId: DEMO_TENANT_ID });`)).not.toEqual([]);
    expect(rogue(DEFINITION, `export function verifiedTenantContextFromMembership(membership: M): VerifiedTenantContext { return Object.freeze({ tenantId: membership.tenantId }) as VerifiedTenantContext; }`)).toEqual([]);
    expect(rogue(DEFINITION, `export function verifiedTenantContextFromMembership(membership: M): VerifiedTenantContext { return Object.freeze({ tenantId: input }) as VerifiedTenantContext; }`)).not.toEqual([]);
    expect(rogue("apps/api/src/other.ts", `export function verifiedTenantContextFromMembership(m: M) { return m; }`)).not.toEqual([]);
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
    expect(rogueAt("packages/db/src/sandbox-repository.ts", dbText)).toEqual([]);
    expect(rogueAt("packages/db/src/sandbox-repository.ts", dbText.replace("./demo-seed.js", "./not-the-seed.js"))).toEqual(mentions("fixture constant"));
    expect(rogueAt("packages/db/src/sandbox-repository.ts", dbText.replace("./demo-seed.js", "../../elsewhere/demo-seed.js"))).toEqual(mentions("fixture constant"));
    // The relative form is not a way for the api to read some other file of the same name.
    expect(rogueAt(APPROVED_SYNTHETIC, dbText)).toEqual(mentions("fixture constant"));
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
    expect(rogueAt("apps/api/src/recovery-case.application.ts", named(""))).toEqual([]);
    expect(rogueAt("apps/api/src/recovery-case.application.ts", named(`export const other = (membership: Record<string, string>) => membership;`))).not.toEqual([]);
    expect(rogueAt("apps/api/src/recovery-case.application.ts", named(`const later = (input: Record<string, string>) => { const membership = input; return membership; };`))).not.toEqual([]);
    expect(rogueAt("apps/api/src/recovery-case.application.ts", named(`let mutable = 1;`).replace("const membership =", "let membership ="))).not.toEqual([]);
    // Resolution is by NAME only while the object cannot change afterwards: reads of its properties are fine, anything that
    // writes, deletes, hands it on or spreads it is not.
    expect(rogueAt("apps/api/src/recovery-case.application.ts", named(`export const read = () => ({ id: membership.membershipId, who: membership.identityUserId });`))).toEqual([]);
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
    })) expect(rogueAt("apps/api/src/recovery-case.application.ts", named(extra)), name).toEqual(mentions("fixed, plain literal object"));
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
    const constructing = files.filter(f => /verifiedTenantContextFromMembership|as\s+VerifiedTenantContext/u.test(f.text) && occurrences(f).found.some(o => o.kind === "call" || o.kind === "cast")).map(f => f.path);
    expect(APPROVED_SYNTHETIC_FILES.filter(path => !present.has(path))).toEqual([]);
    expect(APPROVED_SYNTHETIC_FILES.filter(path => !constructing.includes(path))).toEqual([]);
    const special = new Set([REAL, DEFINITION, WORKER, REHEARSAL]);
    expect(constructing.filter(path => !special.has(path) && !APPROVED_SYNTHETIC_FILES.includes(path))).toEqual([]);
    // The authoritative fixture module really holds literal UUID constants for every name the scan trusts.
    const seed = files.find(f => f.path === "packages/db/src/demo-seed.ts")!;
    expect(boundaryViolations([seed])).toEqual([]);
    // Next conventions such as middleware.ts live beside the app folder, so top-level application files are scanned too.
    expect(files.map(f => f.path)).toEqual(expect.arrayContaining(["apps/web/playwright.config.ts", "apps/web/vitest.config.ts"]));
    expect(rogueAt("apps/web/middleware.ts", `${IMPORT_FIXTURES}\n${CALL_FIXTURES}`)).toEqual(mentions("outside the synthetic composition roots"));
    expect(fixtureConstantNames(seed.text)).toEqual(expect.arrayContaining(["DEMO_TENANT_ID", "DEMO_EMPTY_TENANT_ID", "DEMO_MEMBERSHIP_ID", "DEMO_EMPTY_MEMBERSHIP_ID", "DEMO_IDENTITY_USER_ID"]));
  });
});
