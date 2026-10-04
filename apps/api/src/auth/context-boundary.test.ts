import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
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
 *   synthetic  retained practice-sandbox composition (apps/api/src and packages/db/src only): every call/cast is fed ONLY the
 *              fixed DEMO_* tenant and membership constants, and the file carries no request-derived tenant selector.
 *              Reachability is separately proven by identity.test.ts (global Nest guard; synthetic cookie refused outside
 *              synthetic_demo) and by the web adapters, which check JOBGUARD_ENV.
 *   rehearsal  packages/db/tools/synthetic-restore.mjs: disposable synthetic restore rehearsal that refuses any other mode.
 *
 * Tests, fixtures and generated output are not application source.
 */
const REAL = "apps/api/src/auth/principal-bridge.ts";
const DEFINITION = "packages/db/src/tenant-context.ts";
const WORKER = "apps/api/src/worker.ts";
const REHEARSAL = "packages/db/tools/synthetic-restore.mjs";
const DECISIONS = "apps/api/src/decisions/decisions.application.ts";
const SYNTHETIC_ROOTS = ["apps/api/src/", "packages/db/src/"];
const REQUEST_DERIVED = /x-tenant-id|tenantHeader|request\.headers|searchParams|\bcookies\s*\(|principal-bridge|resolveVerifiedTenantContext|IdentityApplication/u;
// A synthetic service may read a client-supplied tenant only to REFUSE any value other than the fixed demo tenant.
const CLIENT_TENANT = /requested_tenant_id|requestedTenantId/u;
const CLIENT_TENANT_REFUSED = /requested_tenant_id\s*!==\s*DEMO_TENANT_ID/u;
const CONSTRUCTOR = "verifiedTenantContextFromMembership";
const DEMO_TENANT = new Set(["DEMO_TENANT_ID", "DEMO_EMPTY_TENANT_ID"]);
// Cheap pre-filter so only files that can possibly hold an occurrence are parsed (a file without any of these words cannot
// construct, alias, cast to or assign an effective tenant context). Keeps the whole-tree scan fast on a loaded machine.
const RELEVANT = /verifiedTenantContextFromMembership|VerifiedTenantContext|effective_tenant_id|effectiveTenantId/u;

interface SourceFile { path: string; text: string }
type Occurrence =
  | { kind: "call"; argument: ts.Expression | undefined; node: ts.Node }
  | { kind: "declaration" | "reference" | "effective"; node: ts.Node }
  | { kind: "cast"; operand: ts.Expression; node: ts.Node };

const unwrap = (expression: ts.Expression): ts.Expression => {
  let current = expression;
  while (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression;
  return current;
};
const propertyInitializer = (literal: ts.ObjectLiteralExpression, name: string): ts.Expression | "shorthand" | undefined => {
  for (const property of literal.properties) {
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return "shorthand";
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === name) return unwrap(property.initializer);
  }
  return undefined;
};
const identifierIn = (value: ts.Expression | "shorthand" | undefined, allowed: (name: string) => boolean): boolean =>
  value !== undefined && value !== "shorthand" && ts.isIdentifier(value) && allowed(value.text);

const parsed = new Map<string, { found: Occurrence[]; source: ts.SourceFile }>();
function occurrences(file: SourceFile): { found: Occurrence[]; source: ts.SourceFile } {
  const key = `${file.path}\0${file.text}`;
  const cached = parsed.get(key);
  if (cached) return cached;
  const result = parse(file);
  parsed.set(key, result);
  return result;
}
function parse(file: SourceFile): { found: Occurrence[]; source: ts.SourceFile } {
  if (!RELEVANT.test(file.text)) return { found: [], source: ts.createSourceFile(file.path, "", ts.ScriptTarget.Latest) };
  const kind = /\.(mjs|js)$/u.test(file.path) ? ts.ScriptKind.JS : file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, kind);
  const found: Occurrence[] = [];
  const visit = (node: ts.Node): void => {
    if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && /\bVerifiedTenantContext\b/u.test(node.type.getText(source))) {
      found.push({ kind: "cast", operand: unwrap(node.expression), node });
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
  return { found, source };
}

function constantObject(source: ts.SourceFile, name: string): ts.ObjectLiteralExpression | undefined {
  let result: ts.ObjectLiteralExpression | undefined;
  source.forEachChild(function look(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      const value = unwrap(node.initializer);
      if (ts.isObjectLiteralExpression(value)) result = value;
    }
    ts.forEachChild(node, look);
  });
  return result;
}

/** Every rule violation in the given files; an empty list means the boundary holds. */
export function boundaryViolations(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    const { found, source } = occurrences(file);
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
      // Retained synthetic composition: fixed DEMO_* identity only, API/db source only, no request-derived selector.
      if (declarations.length) problems.push(`${file.path} declares a second ${CONSTRUCTOR}`);
      if (!SYNTHETIC_ROOTS.some(root => file.path.startsWith(root))) problems.push(`${file.path} is outside the synthetic composition roots and may not construct a tenant context`);
      else if (REQUEST_DERIVED.test(file.text)) problems.push(`${file.path} constructs a tenant context but handles a request-derived tenant selector`);
      else if (CLIENT_TENANT.test(file.text) && !CLIENT_TENANT_REFUSED.test(file.text)) problems.push(`${file.path} reads a client tenant without refusing everything but the fixed DEMO tenant`);
      else if (![...DEMO_TENANT].some(name => file.text.includes(name))) problems.push(`${file.path} constructs a tenant context without the fixed DEMO tenant`);
      const decisionsGate = file.path === DECISIONS
        && /const membership=\(tenantId:string\)=>tenantId===DEMO_TENANT_ID\?DEMO_MEMBERSHIP_ID:tenantId===DEMO_EMPTY_TENANT_ID\?DEMO_EMPTY_MEMBERSHIP_ID:null;/u.test(file.text)
        && /if\(!membershipId\)throw new DecisionsError\("FORBIDDEN"\)/u.test(file.text);
      for (const c of calls) {
        let argument = c.argument && unwrap(c.argument);
        if (argument && ts.isIdentifier(argument)) argument = constantObject(source, argument.text);
        if (!argument || !ts.isObjectLiteralExpression(argument)) { problems.push(`${at(c.node)} synthetic constructor argument must be a fixed object`); continue; }
        const tenant = propertyInitializer(argument, "tenantId"), membership = propertyInitializer(argument, "membershipId");
        const tenantOk = identifierIn(tenant, name => DEMO_TENANT.has(name)) || (tenant === "shorthand" && decisionsGate);
        const membershipOk = identifierIn(membership, name => /^DEMO_[A-Z_]*MEMBERSHIP_ID$/u.test(name)) || (membership === "shorthand" && decisionsGate);
        if (!tenantOk || !membershipOk) problems.push(`${at(c.node)} synthetic constructor must use the fixed DEMO tenant and membership`);
      }
      for (const c of casts) {
        if (!ts.isObjectLiteralExpression(c.operand) || !identifierIn(propertyInitializer(c.operand, "tenantId"), name => DEMO_TENANT.has(name))) problems.push(`${at(c.node)} synthetic cast must wrap the fixed DEMO tenant`);
      }
    }
  }
  return problems;
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
  return Promise.all(paths.map(async path => ({ path: relative(repository, path).split(sep).join("/"), text: await readFile(path, "utf8") })));
}

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
    expect(rogue("apps/api/src/new-feature.application.ts", validSynthetic)).toEqual([]);
    // A new application feeding a request-chosen tenant.
    expect(rogue("apps/api/src/new-feature.application.ts", `import { verifiedTenantContextFromMembership } from "@jobguard/db";
export const context = (tenantId: string, membershipId: string) => verifiedTenantContextFromMembership({ identityUserId: "x", membershipId, tenantId } as any);`)).not.toEqual([]);
    // The same fixed-demo shape is not acceptable in web source or any other package.
    expect(rogue("apps/web/app/lib/x.ts", validSynthetic)).toEqual([expect.stringContaining("outside the synthetic composition roots")]);
    expect(rogue("packages/core/src/x.ts", validSynthetic)).not.toEqual([]);
    // Demo-shaped, but the file also reads a request selector.
    expect(rogue("apps/api/src/x.application.ts", `${validSynthetic}\nexport const pick = (headers: Record<string, string>) => headers["x-tenant-id"];`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.application.ts", validSynthetic.replace("DEMO_TENANT_ID }", "otherTenant }"))).not.toEqual([]);
    // A client-supplied tenant may only be refused, never used.
    expect(rogue("apps/api/src/x.application.ts", `${validSynthetic}\nexport const guard = (d: { requested_tenant_id: string }) => { if (d.requested_tenant_id !== DEMO_TENANT_ID) throw new Error("TENANT_FORBIDDEN"); };`)).toEqual([]);
    expect(rogue("apps/api/src/x.application.ts", `${validSynthetic}\nexport const use = (d: { requested_tenant_id: string }) => d.requested_tenant_id;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.application.ts", validSynthetic.replace("membershipId: DEMO_MEMBERSHIP_ID", "membershipId: membershipFromRequest"))).not.toEqual([]);
    // Casts, including a double cast, and aliases.
    expect(rogue("apps/api/src/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = { tenantId: input } as VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/web/app/lib/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = ({ tenantId: input } as unknown) as VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import type { VerifiedTenantContext } from "@jobguard/db";\nexport const c = <VerifiedTenantContext>{ tenantId: input };`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `export const c = { tenantId: input } as import("@jobguard/db").VerifiedTenantContext;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.ts", `import * as db from "@jobguard/db";\nexport const c = { tenantId: input } as Readonly<db.VerifiedTenantContext>;`)).not.toEqual([]);
    expect(rogue("apps/api/src/x.application.ts", `import { DEMO_TENANT_ID } from "@jobguard/db";\nexport const c = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;`)).toEqual([]);
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
