import ts from "typescript";
import { ExceptionsHandler } from "@nestjs/core/exceptions/exceptions-handler.js";
import { FILTER_CATCH_EXCEPTIONS } from "@nestjs/common/constants.js";
import { claimCommandIdentity, MIGRATION_URLS, type TenantTransaction } from "@jobguard/db";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { PurchaseOrderApplication } from "./purchase-order.application.js";
import { ReadinessApplication } from "./readiness.application.js";
import { jobMutationRegistry, watchdogCommandGuards } from "@jobguard/core";
import { EvidenceError, ProofCommandError, WatchdogError } from "@jobguard/db";
import { ProofApplication, ProofApplicationError, finalizeFailure } from "./proof/proof.application.js";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";
const root = new URL("../../../", import.meta.url);
const watchdogMigration = MIGRATION_URLS.find(url => url.pathname.endsWith("_watchdog_live.sql"))!;
const MUTATION_VERBS = ["POST", "PUT", "PATCH", "DELETE"] as const;
type Reader = (file: string) => string | undefined;
const bindingNames = (name: ts.BindingName): string[] => ts.isIdentifier(name) ? [name.text]
  : name.elements.flatMap(element => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
function resolveModule(from: string, specifier: string, read: Reader): string {
  if (!specifier.startsWith(".")) throw new Error(`${from}: cannot statically resolve re-export of "${specifier}"`);
  const base = join(dirname(from), specifier.replace(/\.(?:js|ts)$/u, ""));
  const found = [`${base}.ts`, join(base, "index.ts")].find(candidate => read(candidate) !== undefined);
  if (!found) throw new Error(`${from}: cannot read re-exported module "${specifier}"`);
  return found;
}
/** Mutation verbs a Next route module exports, by TypeScript AST: function, const/let (including destructured),
 * `export { x as VERB }`, `export { VERB } from`, and `export * from` (followed). Comments and strings never count. */
function routeVerbs(file: string, read: Reader, seen = new Set<string>()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const text = read(file);
  if (text === undefined) throw new Error(`cannot read ${file}`);
  const verbs = new Set<string>();
  const add = (name: string) => { if ((MUTATION_VERBS as readonly string[]).includes(name)) verbs.add(name); };
  for (const statement of ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true).statements) {
    const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isFunctionDeclaration(statement) && statement.name) add(statement.name.text);
    if (exported && ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bindingNames(declaration.name).forEach(add);
    if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
      if (!statement.exportClause) {
        if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) throw new Error(`${file}: unresolvable export *`);
        for (const verb of routeVerbs(resolveModule(file, statement.moduleSpecifier.text, read), read, seen)) verbs.add(verb);
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) if (!element.isTypeOnly) add(element.name.text);
      }
    }
  }
  return [...verbs];
}
/** `POST /api/x` is keyed by its path alone (the existing registry convention); other verbs as `VERB /api/x`. */
const routeKey = (verb: string, route: string) => verb === "POST" ? route : `${verb} ${route}`;
function routeKeys(files: ReadonlyMap<string, string>): string[] {
  const read: Reader = file => files.get(file);
  const keys: string[] = [];
  for (const file of files.keys()) {
    if (!/(?:^|\/)app\/api\/.*\/route\.ts$/u.test(file)) continue;
    const route = "/api/" + file.split("/app/api/")[1]!.replace(/\/route\.ts$/u, "");
    if (!/^\/api\/(?:jobs|decisions|recovery-cases)(?:\/|$)/u.test(route)) continue;
    for (const verb of routeVerbs(file, read)) keys.push(routeKey(verb, route));
  }
  return keys.sort();
}
const isClassified = (key: string, registry: Readonly<Record<string, string>>) =>
  Object.hasOwn(registry, key) || Object.keys(registry).some(entry => entry.startsWith(`${key}#`));
function assertClassified(keys: readonly string[], registry: Readonly<Record<string, string>>) {
  const missing = keys.filter(key => !isClassified(key, registry));
  if (missing.length) throw new Error(`Unclassified job mutation: ${missing.join(", ")}`);
}
const NEST_VERBS: Readonly<Record<string, string>> = { Post: "POST", Put: "PUT", Patch: "PATCH", Delete: "DELETE", All: "ALL" };
function literalPaths(argument: ts.Expression | undefined, where: string): string[] {
  if (argument === undefined) return [""];
  if (ts.isStringLiteralLike(argument)) return [argument.text];
  if (ts.isArrayLiteralExpression(argument)) return argument.elements.flatMap(element => literalPaths(element, where));
  if (ts.isObjectLiteralExpression(argument)) {
    // Nest reads `path` from the options object. Anything that could hide or override it is refused, never treated as "no path".
    let path: ts.Expression | undefined, seen = 0;
    for (const property of argument.properties) {
      if (ts.isSpreadAssignment(property)) throw new Error(`${where}: a spread in the options cannot be read, so the route prefix cannot be classified`);
      if (ts.isShorthandPropertyAssignment(property)) { if (property.name.text === "path") throw new Error(`${where}: a shorthand path cannot be read, so the route prefix cannot be classified`); continue; }
      const name = property.name;
      if (ts.isComputedPropertyName(name)) throw new Error(`${where}: a computed option key cannot be read, so the route prefix cannot be classified`);
      const text = ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : name.getText();
      if (text !== "path") continue;
      if (++seen > 1) throw new Error(`${where}: path is set more than once and cannot be read, so the route prefix cannot be classified`);
      if (!ts.isPropertyAssignment(property)) throw new Error(`${where}: path is not a plain property and cannot be read`);
      path = property.initializer;
    }
    return literalPaths(path, where);
  }
  throw new Error(`${where}: route path is not a literal, so it cannot be classified`);
}
/** Where a decorator name really comes from: a named, renamed, namespace or one-hop-rebound import. */
type Ref = { module: string | null; name: string };
function importedRefs(tree: ts.SourceFile): { imports: Map<string, Ref>; consts: Map<string, ts.Expression> } {
  const imports = new Map<string, Ref>(), consts = new Map<string, ts.Expression>();
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.importClause) {
      const module = statement.moduleSpecifier.text, clause = statement.importClause;
      if (clause.name) imports.set(clause.name.text, { module, name: "default" });
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) imports.set(clause.namedBindings.name.text, { module, name: "*" });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) for (const element of clause.namedBindings.elements) imports.set(element.name.text, { module, name: (element.propertyName ?? element.name).text });
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name) && declaration.initializer) consts.set(declaration.name.text, declaration.initializer);
  }
  return { imports, consts };
}
function resolveRef(node: ts.Expression, tables: ReturnType<typeof importedRefs>, depth = 0): Ref | null {
  if (depth > 8) return null;
  if (ts.isIdentifier(node)) {
    const imported = tables.imports.get(node.text);
    if (imported) return imported;
    const bound = tables.consts.get(node.text);
    if (bound && (ts.isIdentifier(bound) || ts.isPropertyAccessExpression(bound))) return resolveRef(bound, tables, depth + 1);
    return { module: null, name: node.text };
  }
  if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
    const namespace = resolveRef(node.expression, tables, depth + 1);
    return namespace?.name === "*" ? { module: namespace.module, name: node.name.text } : { module: null, name: node.getText() };
  }
  return null;
}
type Resolved = { kind: "controller" | "verb" | "other"; verb?: string | undefined; argument?: ts.Expression | undefined };
/** Resolve a class or method decorator by its import. Only @nestjs packages are trusted; anything else (a local or
 * imported wrapper, a computed decorator) could hide a route, so it fails closed instead of being skipped. */
function resolveDecorator(file: string, decorator: ts.Decorator, tables: ReturnType<typeof importedRefs>): Resolved {
  const call = ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
  const callee = call ? call.expression : decorator.expression;
  const ref = resolveRef(callee, tables);
  if (!ref || ref.module === null || !ref.module.startsWith("@nestjs/")) throw new Error(`${file}: cannot tell whether @${callee.getText()} declares a route; use the @nestjs/common decorators directly`);
  if (ref.module !== "@nestjs/common") return { kind: "other" };
  if (ref.name === "Controller") return { kind: "controller", argument: call?.arguments[0] };
  if (NEST_VERBS[ref.name]) return { kind: "verb", verb: NEST_VERBS[ref.name]!, argument: call?.arguments[0] };
  return { kind: "other" };
}
const decoratorsOf = (node: ts.Node) => ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
/** Nest mutation routes in any class whose decorators resolve to @nestjs/common's Controller, whatever the file is called. */
function nestKeys(file: string, text: string): string[] {
  const keys: string[] = [];
  const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), tables = importedRefs(tree);
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const controller = decoratorsOf(node).map(decorator => resolveDecorator(file, decorator, tables)).find(resolved => resolved.kind === "controller");
      if (controller) {
        const prefixes = literalPaths(controller.argument, `${file} @Controller`);
        for (const member of node.members) {
          if (!ts.isMethodDeclaration(member)) continue;
          for (const decorator of decoratorsOf(member)) {
            const resolved = resolveDecorator(file, decorator, tables);
            if (resolved.kind !== "verb") continue;
            for (const prefix of prefixes) for (const sub of literalPaths(resolved.argument, `${file} @${resolved.verb}`)) {
              const route = "/" + [prefix, sub].filter(Boolean).join("/").replace(/^\/+/u, "");
              keys.push(`nest:${resolved.verb === "POST" ? "" : `${resolved.verb} `}${route}`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return keys;
}
const inJobScope = (key: string) => { const route = key.replace(/^nest:(?:[A-Z]+ )?/u, ""); return route.includes("jobs") || route.startsWith("/decisions") || route.startsWith("/recovery-cases"); };
async function readTree(url: URL, accept: (name: string) => boolean): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
    if (entry.isDirectory()) for (const [name, text] of await readTree(child, accept)) files.set(name, text);
    else if (accept(entry.name)) files.set(fileURLToPath(child), await readFile(child, "utf8"));
  }
  return files;
}
describe("CH-2 command coverage and lock order", () => {
  it("fails when any job mutation route is unclassified", async () => {
    const found = routeKeys(await readTree(new URL("apps/web/app/api/", root), name => name === "route.ts"));
    expect(found.length).toBeGreaterThan(30);
    assertClassified(found, jobMutationRegistry);
    // Every classified route is a real one: no stale entry may hide behind the registry.
    const classified = Object.keys(jobMutationRegistry).filter(key => key.startsWith("/api/") && !key.includes("#") || /^(?:PUT|PATCH|DELETE) \/api\//u.test(key));
    expect(found.filter(key => classified.includes(key))).toEqual(classified.sort());
    expect(Object.hasOwn(jobMutationRegistry, "/api/jobs/[id]/unclassified-site-message")).toBe(false);
  });
  it("discovers every mutation verb and export form, so an unclassified PATCH, PUT or DELETE fails", () => {
    const run = (source: string, extra: Record<string, string> = {}) => routeVerbs("/x/app/api/jobs/[id]/route.ts", file => file === "/x/app/api/jobs/[id]/route.ts" ? source : extra[file]).sort();
    expect(run("export async function PATCH() {}")).toEqual(["PATCH"]);
    expect(run("export function PUT() {}\nexport async function DELETE() {}\nexport function GET() {}")).toEqual(["DELETE", "PUT"]);
    expect(run("export const PATCH = async () => {};\nexport let POST = handler;")).toEqual(["PATCH", "POST"]);
    expect(run("const handler = () => {};\nexport { handler as DELETE, handler as GET };")).toEqual(["DELETE"]);
    expect(run("export const { PATCH, POST: renamed } = handlers;")).toEqual(["PATCH"]);
    expect(run("export const { POST, PUT } = handlers;")).toEqual(["POST", "PUT"]);
    expect(run('export { PATCH } from "./impl";')).toEqual(["PATCH"]);
    expect(run('export * from "./impl";', { "/x/app/api/jobs/[id]/impl.ts": "export function DELETE() {}" })).toEqual(["DELETE"]);
    expect(run("// export function PATCH() {}\nconst text = 'export function PUT() {}';\nexport function GET() {}")).toEqual([]);
    expect(() => run('export * from "some-package";')).toThrow(/cannot statically resolve/u);
    const registry: Readonly<Record<string, string>> = { "/api/jobs/[id]/site-message": "watchdog_live_only" };
    const files = new Map([["/x/app/api/jobs/[id]/site-message/route.ts", "export async function POST() {}"], ["/x/app/api/jobs/[id]/site-note/route.ts", "export async function PATCH() {}"]]);
    expect(routeKeys(files)).toEqual(["/api/jobs/[id]/site-message", "PATCH /api/jobs/[id]/site-note"]);
    expect(() => assertClassified(routeKeys(files), registry)).toThrow("PATCH /api/jobs/[id]/site-note");
    expect(() => assertClassified(routeKeys(files), { ...registry, "PATCH /api/jobs/[id]/site-note": "watchdog_live_only" })).not.toThrow();
  });
  it("discovers every Nest mutation decorator in any controller file, so an unclassified one fails", () => {
    const NEST = 'import { Controller, Get, Post, Put, Patch, Delete, All } from "@nestjs/common"; ';
    const keys = (source: string) => nestKeys("x.ts", NEST + source).sort();
    expect(keys('@Controller("jobs/:id/a") class A { @Patch("b") p() {} @Put() u() {} @Delete(":x") d() {} @Get("g") g() {} @Post("c") c() {} @All("z") z() {} }'))
      .toEqual(["nest:/jobs/:id/a/c", "nest:ALL /jobs/:id/a/z", "nest:DELETE /jobs/:id/a/:x", "nest:PATCH /jobs/:id/a/b", "nest:PUT /jobs/:id/a"]);
    expect(keys('@Controller({ path: "jobs" }) export class B { @Put(["m", "n"]) u() {} }')).toEqual(["nest:PUT /jobs/m", "nest:PUT /jobs/n"]);
    expect(keys('@Controller() class C { @Patch("jobs/:id/q") p() {} }')).toEqual(["nest:PATCH /jobs/:id/q"]);
    expect(keys('class NotAController { @Patch("jobs/:id/q") p() {} }')).toEqual([]);
    expect(() => nestKeys("x.ts", NEST + "const P = 'jobs'; @Controller(P) class D { @Post() p() {} }")).toThrow(/not a literal/u);
    expect(() => nestKeys("x.ts", NEST + '@Controller("jobs") class E { @Patch(`${id}`) p() {} }')).toThrow(/not a literal/u);
    const registry: Readonly<Record<string, string>> = { "nest:/jobs/:id/a": "watchdog_live_only" };
    expect(() => assertClassified(keys('@Controller("jobs/:id") class F { @Patch("a") p() {} }'), registry)).toThrow("nest:PATCH /jobs/:id/a");
  });
  it("resolves aliased, namespaced and re-bound Nest decorators, and refuses ones it cannot resolve", () => {
    const keys = (source: string) => nestKeys("x.ts", source).sort();
    const registry: Readonly<Record<string, string>> = { "nest:/jobs/:id/a": "watchdog_live_only" };
    // Renamed imports.
    expect(keys('import { Controller as Route, Patch as EditSiteFact, Post as Create } from "@nestjs/common"; @Route("jobs/:id/site") class A { @EditSiteFact("fact") e() {} @Create("note") c() {} }'))
      .toEqual(["nest:/jobs/:id/site/note", "nest:PATCH /jobs/:id/site/fact"]);
    expect(() => assertClassified(keys('import { Controller, Patch as EditSiteFact } from "@nestjs/common"; @Controller("jobs/:id") class B { @EditSiteFact("a") e() {} }'), registry)).toThrow("nest:PATCH /jobs/:id/a");
    // Namespace import, aliased namespace, and a local const alias (one or more hops).
    expect(keys('import * as Nest from "@nestjs/common"; @Nest.Controller("jobs/:id/n") class C { @Nest.Delete(":x") d() {} @Nest.Get("g") g() {} }')).toEqual(["nest:DELETE /jobs/:id/n/:x"]);
    expect(keys('import { Controller, Put } from "@nestjs/common"; const Replace = Put; const Swap = Replace; @Controller("jobs/:id/r") class D { @Swap("z") s() {} }')).toEqual(["nest:PUT /jobs/:id/r/z"]);
    // Non-HTTP decorators from Nest packages are ignored; a Get alias is not a mutation.
    expect(keys('import { Controller, Get as Read } from "@nestjs/common"; import { ApiOperation as Doc } from "@nestjs/swagger"; @Controller("jobs/:id/g") class E { @Read("r") @Doc({ summary: "x" }) r() {} }')).toEqual([]);
    // @Controller({...}): a quoted "path" key is the same key; spreads, computed keys, shorthand and duplicate paths cannot be read, so they fail closed.
    const NESTED = 'import { Controller, Post } from "@nestjs/common"; ';
    expect(keys(NESTED + '@Controller({ "path": "jobs/:id/new-fact" }) class L { @Post() p() {} }')).toEqual(["nest:/jobs/:id/new-fact"]);
    expect(keys(NESTED + "@Controller({ 'path': ['jobs/a', 'jobs/b'], version: '1' }) class M { @Post('x') p() {} }")).toEqual(["nest:/jobs/a/x", "nest:/jobs/b/x"]);
    expect(keys(NESTED + '@Controller({ version: "1" }) class N { @Post("jobs/:id/y") p() {} }')).toEqual(["nest:/jobs/:id/y"]);
    expect(() => assertClassified(keys(NESTED + '@Controller({ "path": "jobs/:id/new-fact" }) class O { @Post() p() {} }'), registry)).toThrow("nest:/jobs/:id/new-fact");
    for (const [label, controller] of [
      ["spread", '{ ...options }'], ["spread after path", '{ path: "jobs/:id/a", ...options }'], ["computed key", '{ ["path"]: "jobs/:id/a" }'],
      ["computed identifier key", '{ [key]: "jobs/:id/a" }'], ["shorthand path", '{ path }'], ["duplicate path", '{ path: "jobs/:id/a", "path": "jobs/:id/b" }'],
      ["template path with substitution", '{ path: `jobs/${id}` }'], ["non-literal path", '{ path: base }'],
    ] as const) expect(() => nestKeys("x.ts", NESTED + `@Controller(${controller}) class P { @Post() p() {} }`), label).toThrow(/cannot be read|not a literal/u);
    // A name that merely looks like a verb but comes from elsewhere is not trusted either way: it fails closed.
    expect(() => nestKeys("x.ts", 'import { Controller } from "@nestjs/common"; import { Patch } from "./my-routing"; @Controller("jobs/:id") class F { @Patch("a") p() {} }')).toThrow(/cannot tell whether/u);
    // Custom wrapper decorators, locally declared or imported, and computed decorators, fail closed on a controller.
    expect(() => nestKeys("x.ts", 'import { Controller } from "@nestjs/common"; import { SiteWrite } from "./wrappers"; @Controller("jobs/:id") class G { @SiteWrite("a") w() {} }')).toThrow(/cannot tell whether/u);
    expect(() => nestKeys("x.ts", 'import { Controller, Patch } from "@nestjs/common"; const Local = () => Patch("a"); @Controller("jobs/:id") class H { @Local() w() {} }')).toThrow(/cannot tell whether/u);
    expect(() => nestKeys("x.ts", 'import { Controller, Patch, Post } from "@nestjs/common"; @Controller("jobs/:id") class I { @(flag ? Patch : Post)("a") w() {} }')).toThrow(/cannot tell whether/u);
    expect(() => nestKeys("x.ts", 'import { Controller } from "@nestjs/common"; import { Route } from "./wrappers"; @Route("jobs/:id") class J { @Patch("a") p() {} }')).toThrow(/cannot tell whether/u);
    // A decorator imported from a Nest package we do not know cannot be an HTTP verb unless it is one we resolve.
    expect(keys('import { Controller } from "@nestjs/common"; import { Cron } from "@nestjs/schedule"; @Controller("jobs/:id/c") class K { @Cron("* * * * *") tick() {} }')).toEqual([]);
  });
  it("classifies standalone job mutations and dispatcher command literals too", async () => {
    const files = new Map([...await readTree(new URL("apps/api/src/", root), name => name.endsWith(".ts") && !name.endsWith(".test.ts")), ...await readTree(new URL("packages/db/src/", root), name => name.endsWith(".ts") && !name.endsWith(".test.ts"))]);
    const found: string[] = [];
    for (const [file, source] of files) {
      for (const match of source.matchAll(/commandType\s*:\s*"([^"]+)"/gu)) expect(jobMutationRegistry[`command:${match[1]}`]).toBeDefined();
      found.push(...nestKeys(file, source).filter(inJobScope));
    }
    expect(found.length).toBeGreaterThan(25);
    assertClassified(found, jobMutationRegistry);
    expect(found.sort()).toEqual(Object.keys(jobMutationRegistry).filter(key => key.startsWith("nest:")).sort());
  });
  it("new public mutations in watchdog modules cannot omit classification and the guard", async () => {
    for(const file of new Set(watchdogCommandGuards.map(entry=>entry.file))) {
      const source=await readFile(new URL(`packages/db/src/${file}`,root),"utf8");
      const tree=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
      const visit=(node:ts.Node) => {
        if(ts.isMethodDeclaration(node)&&node.body&&!node.modifiers?.some(m=>m.kind===ts.SyntaxKind.PrivateKeyword)) {
          const body=node.body.getText(tree),name=node.name.getText(tree);
          if(/\b(?:INSERT INTO|UPDATE app\.)/u.test(body)) {
            const exception=jobMutationRegistry[`method:${file}#${name}`];
            if(!exception) {
              expect(body,`${file} ${name} must guard its write`).toContain("await requireLiveJob(");
              if(!["linkAndAssertProof","registerPreview"].includes(name)) expect(watchdogCommandGuards.some(entry=>entry.file===file&&entry.method===name)).toBe(true);
            }
          }
        }
        ts.forEachChild(node,visit);
      };
      visit(tree);
    }
  });
  it.each(watchdogCommandGuards)("$file $method guards every write transaction before all business locks and audit", async entry => {
    const text = await readFile(new URL(`packages/db/src/${entry.file}`, root), "utf8");
    const start = text.indexOf(`async ${entry.method}(`);
    expect(start).toBeGreaterThan(-1);
    const end = text.slice(start + 6).search(/\b(?:private )?async \w+\(/u);
    const body = end < 0 ? text.slice(start) : text.slice(start, start + 6 + end);
    expect(body.match(/await requireLiveJob\(/gu)).toHaveLength(entry.calls);
    const guard = body.indexOf("await requireLiveJob(");
    for (const lock of ["FOR UPDATE", "pg_advisory_xact_lock", "appendAuditBatch("]) {
      const position = body.indexOf(lock);
      if (position >= 0) expect(guard).toBeLessThan(position);
    }
    const afterAudit = body.split("appendAuditBatch(").slice(1).join("");
    expect(afterAudit).not.toMatch(/FOR (?:UPDATE|SHARE)|pg_advisory_xact_lock/u);
  });
  it("documents 409 without removing earlier successful responses", async () => {
    const spec=JSON.parse(await readFile(new URL("apps/api/openapi.json",root),"utf8"));
    for(const [key,phase] of Object.entries(jobMutationRegistry)) {
      if(!key.startsWith("nest:")||phase!=="watchdog_live_only")continue;
      const path=key.slice(5).replace(/:([A-Za-z0-9]+)/gu,"{$1}");
      const responses=spec.paths[path]?.post?.responses;
      expect(responses,path).toBeDefined();
      expect(responses["201"],path).toBeDefined();
      expect(responses["409"].content["application/json"].schema.properties.code.enum).toEqual(["JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT"]);
    }
  });
  it("maps the typed guard failure in the standalone API", () => {
    let status = 0, body: unknown;
    const host = { switchToHttp: () => ({ getResponse: () => ({ status(code: number) { status = code; return { json(value: unknown) { body = value; } }; } }) }) };
    new WatchdogExceptionFilter().catch(new WatchdogError("JOB_NOT_LIVE"), host as never);
    expect(status).toBe(409); expect(body).toEqual({ code: "JOB_NOT_LIVE" });
  });
});

describe("round 10 deployed Next conflict adapters", () => {
  const routes = [
    { path: "purchase-orders/revisions", service: "purchaseOrders", method: "revise", kind: "purchase_order.revise" },
    { path: "supplier-documents/intake", service: "supplierDocuments", method: "intake", kind: "supplier_document.intake" },
    { path: "supplier-documents/receipts", service: "supplierDocuments", method: "receipt", kind: "supplier_document.receipt" },
    { path: "relevance-inbox/decisions/[decisionId]", service: "inboxRelevance", method: "dismiss", kind: "inbox.dismiss" },
    { path: "proof", service: "proof", method: "command", kind: "evidence.begin_upload" },
  ] as const;
  it.each(routes.flatMap(route => ["payload", "kind", "job"].map(change => ({ ...route, change }))))(
    "$path returns Nest's stable 409 for changed $change from the real identity claim", async route => {
      const spec = { tenantId: "11111111-1111-4111-8111-111111111111", commandId: replayCommand,
        jobId: replayJob, kind: route.kind, requestHash: "a".repeat(64) };
      const original = { job_id: route.change === "job" ? otherJob : spec.jobId,
        command_type: route.change === "kind" ? "readiness.record" : spec.kind,
        request_hash: route.change === "payload" ? "b".repeat(64) : spec.requestHash };
      const database = { $client: { query: async (sql: string) => ({
        rows: sql.startsWith("SELECT job_id,command_type,request_hash") ? [original] : [], rowCount: 0,
      }) } } as unknown as TenantTransaction;
      const error = await claimCommandIdentity(database, spec).catch(e => e);
      expect(error).toBeInstanceOf(WatchdogError);
      const nest = dispatchConflict(error);
      expect(nest).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
      const refuse = vi.fn().mockRejectedValue(error);
      routeApplication.current = { [route.service]: { [route.method]: refuse } };
      const handler = await import(fileURLToPath(new URL(`apps/web/app/api/jobs/[id]/${route.path}/route.ts`, root)));
      const body = { commandId: replayCommand, version: "synthetic-conflict-probe.v1" };
      const response = await handler.POST(new Request("https://synthetic.invalid/conflict", { method: "POST", body: JSON.stringify(body) }),
        { params: Promise.resolve({ id: replayJob, decisionId: scopeId }) });
      expect(refuse).toHaveBeenCalledWith(...(route.method === "dismiss" ? [replayJob, scopeId, body] : [replayJob, body]));
      expect({ status: response.status, body: await response.json() }).toEqual(nest);
    },
  );
});

describe("round 10 browser setup and migration portability source checks", () => {
  it("opens the second page by job deep link in its existing session, preserving the changed-job assertion", async () => {
    const source = await readFile(new URL("apps/web/e2e/CH-2.spec.ts", root), "utf8");
    const setup = source.split("const otherPage = await page.context().newPage();")[1]!.split("await otherPage.close();")[0]!;
    expect(setup).not.toContain("openLiveWatchdogJob(otherPage)");
    expect(setup).toContain("await otherPage.goto(`/jobs/${");
    expect(setup).toContain('expect(otherJobId).not.toBe(jobId)');
    expect(setup).toContain('expect(changedJob.status()).toBe(409)');
    expect(setup).toContain('expect(await changedJob.json()).toEqual({ code: "IDEMPOTENCY_CONFLICT" })');
  });
  it.each(["watchdog-migration-owner", "UIWIRE-12", "demo-bootstrap"])("%s selects migration names and uses the registered total", async name => {
    const source = await readFile(new URL(`packages/db/test/${name}.integration.test.ts`, root), "utf8");
    expect(source).not.toMatch(/(?:toHaveLength|toBe)\(45\)|migrations: 45/u);
    expect(source).not.toMatch(/previous\.at\(-1\).*0053/u);
    expect(source).not.toContain('const TARGET = "0096_watchdog_live.sql"');
    expect(source).not.toContain("BETWEEN '0000_tenancy.sql' AND '0096_watchdog_live.sql'");
  });
});

describe("round 11 migration merge-ahead regressions", () => {
  it("registry ordering does not require CH-2 to be the last migration", async () => {
    const source = await readFile(new URL("apps/api/src/watchdog-registry.test.ts", root), "utf8");
    expect(source).not.toMatch(/expect\(names\.at\(-1\)\)\.toBe\(watchdogMigration/u);
    expect(source).not.toMatch(/expect\(sharedIndex\)\.toBeLessThan\(names\.length - 1\)/u);
  });
  it("owner setup applies only the registered prefix before CH-2", async () => {
    const source = await readFile(new URL("packages/db/test/watchdog-migration-owner.integration.test.ts", root), "utf8");
    expect(source).toContain("const previous = MIGRATION_URLS.slice(0, MIGRATION_URLS.indexOf(target))");
    expect(source).not.toMatch(/expect\(\[\.\.\.previous, target\]\)\.toEqual\(MIGRATION_URLS\)/u);
    expect(source).not.toMatch(/expect\(previous\.length \+ 1\)\.toBe\(MIGRATION_URLS\.length\)/u);
    expect(source).not.toMatch(/expect\(name\(MIGRATION_URLS\.at\(-1\)!\)\)\.toBe\(TARGET\)/u);
  });
});

describe("proof finalisation failures", () => {
  it("answers a command id reused with another request as a conflict (409), not an invalid proof (Codex P2 4197412772)", () => {
    const answer = finalizeFailure(new EvidenceError("COMMAND_CONFLICT"));
    expect(answer).toBeInstanceOf(WatchdogError); expect((answer as WatchdogError).code).toBe("IDEMPOTENCY_CONFLICT");
  });
  it("normalizes proof-command replay conflicts to the same stable code", () => {
    const answer = finalizeFailure(new ProofCommandError("COMMAND_CONFLICT"));
    expect(answer).toBeInstanceOf(WatchdogError);
    expect(dispatchConflict(answer)).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
  });
  it("keeps watchdog and proof-command refusals, and treats any other failure as an invalid proof", () => {
    const watchdog = new WatchdogError("JOB_NOT_LIVE"), proof = new ProofCommandError("FORBIDDEN");
    expect(finalizeFailure(watchdog)).toBe(watchdog); expect(finalizeFailure(proof)).toBe(proof);
    for (const error of [new EvidenceError("OBJECT_INVALID", "wrong_hash"), new EvidenceError("UPLOAD_EXPIRED"), new Error("anything else")])
      expect((finalizeFailure(error) as ProofApplicationError).code).toBe("PROOF_INVALID");
  });
});

// Boundary regression: exercise the real claim function and Nest exception dispatch without a socket.
// The query double selects a committed conflicting identity; PostgreSQL races have separate integration coverage.
describe("watchdog identity conflicts at the Nest boundary", () => {
  const spec = { tenantId: "11111111-1111-4111-8111-111111111111", commandId: "22222222-2222-4222-8222-222222222222", jobId: "33333333-3333-4333-8333-333333333333", kind: "readiness.record" as const, requestHash: "a".repeat(64) };
  it.each([
    ["payload", { request_hash: "b".repeat(64) }],
    ["kind", { command_type: "inbox.seed" }],
    ["job", { job_id: "44444444-4444-4444-8444-444444444444" }],
  ])("returns stable HTTP 409 for changed %s", async (_label, changed) => {
    const database = { $client: { query: async (sql: string) => {
      if (sql.startsWith("SELECT job_id,command_type,request_hash")) return { rows: [{ job_id: spec.jobId, command_type: spec.kind, request_hash: spec.requestHash, ...changed }] };
      return { rows: [], rowCount: 0 };
    } } } as unknown as TenantTransaction;
    const error = await claimCommandIdentity(database, spec).catch(e => e as Error);
    if (!(error instanceof Error)) throw new Error(`Expected a conflict, got ${error}`);
    const response = { status: 0, body: undefined as unknown };
    const host = { getArgByIndex: () => response, switchToHttp: () => ({ getResponse: () => ({ status(code: number) { response.status = code; return { json(body: unknown) { response.body = body; } }; } }) }) };
    const handler = new ExceptionsHandler({ isHeadersSent: () => false, reply: (_r: unknown, body: unknown, status: number) => { response.status = status; response.body = body; } } as never);
    const filter = new WatchdogExceptionFilter();
    handler.setCustomFilters([{ func: filter.catch.bind(filter), exceptionMetatypes: Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, WatchdogExceptionFilter) }]);
    handler.next(error, host as never);
    expect(response).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(error).toBeInstanceOf(WatchdogError);
  });
  it("refuses a legacy owner conflict with the same typed error", async () => {
    const db = { $client: { query: async (sql: string) => ({ rows: sql.includes("UNION ALL") ? [{ kind: "inbox.seed", job_id: spec.jobId }] : [] }) } } as unknown as TenantTransaction;
    const error = await claimCommandIdentity(db, spec).catch(e => e);
    expect(error).toBeInstanceOf(WatchdogError);
    expect(error).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("keeps the previous-writer id reservation non-blocking after audit", async () => {
    const migration = await readFile(watchdogMigration, "utf8");
    const body = migration.split("CREATE FUNCTION app.reserve_watchdog_command_id()")[1]!.split("END $$;")[0]!;
    expect(body).toMatch(/IF NOT pg_try_advisory_xact_lock\([\s\S]+?RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'/u);
    expect(body).not.toMatch(/PERFORM pg_advisory_xact_lock/u);
  });
});

it("registers every migration once, with CH-2 after the merged SH-1 schema", async () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  const files = (await readdir(new URL("packages/db/migrations/", root))).filter(name => name.endsWith(".sql")).sort();
  expect(names).toEqual(files);
  expect(files).toHaveLength(MIGRATION_URLS.length);
  expect(new Set(names).size).toBe(MIGRATION_URLS.length);
  expect(names.filter(name => name.endsWith("_watchdog_live.sql"))).toHaveLength(1);
  const sharedIndex = names.findIndex(name => name.endsWith("_shared_money_origin.sql"));
  expect(sharedIndex).toBeGreaterThan(-1);
  expect(sharedIndex).toBeLessThan(names.indexOf(watchdogMigration.pathname.split("/").at(-1)!));
  expect(names).toEqual([...names].sort());
});


// Actual applications/repositories and exception dispatch; only PostgreSQL transport and
// synthetic session/bootstrap are doubled. No socket, provider, or database guarantee is implied.
const routeApplication = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "synthetic-test-session" }) }) }));
vi.mock("../../web/app/lib/synthetic-server", () => ({ hasSyntheticSession: () => true }));
vi.mock("../../web/app/lib/workspace-server", () => ({ workspaceApplication: () => routeApplication.current }));

function dispatchConflict(error: unknown) {
  if (!(error instanceof Error)) throw new Error("Expected an application refusal");
  const response = { status: 0, body: undefined as unknown };
  const host = { getArgByIndex: () => response, switchToHttp: () => ({ getResponse: () => ({
    status(code: number) { response.status = code; return { json(body: unknown) { response.body = body; } }; }
  }) }) };
  const handler = new ExceptionsHandler({ isHeadersSent: () => false,
    reply: (_r: unknown, body: unknown, status: number) => { response.status = status; response.body = body; }
  } as never);
  const filter = new WatchdogExceptionFilter();
  handler.setCustomFilters([{ func: filter.catch.bind(filter), exceptionMetatypes: Reflect.getMetadata(FILTER_CATCH_EXCEPTIONS, WatchdogExceptionFilter) }]);
  handler.next(error, host as never);
  return response;
}
const replayJob = "33333333-3333-4333-8333-333333333333";
const replayCommand = "22222222-2222-4222-8222-222222222222";
const otherJob = "44444444-4444-4444-8444-444444444444";
const scopeId = "55555555-5555-4555-8555-555555555555";
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function replayPool(select: (sql: string) => object[] | undefined) {
  const statements: string[] = [];
  const client = { release: vi.fn(), query: async (sql: string) => {
    statements.push(sql);
    const rows = select(sql);
    if (rows) return { rows, rowCount: rows.length };
    if (/^(?:BEGIN|COMMIT|ROLLBACK|SELECT set_config|SELECT pg_advisory_xact_lock|SELECT app.require_watchdog_live)/u.test(sql)) return { rows: [], rowCount: 0 };
    if (sql.includes("UNION ALL")) return { rows: [], rowCount: 0 };
    if (sql.startsWith("INSERT INTO app.watchdog_command_identity")) return { rows: [{ command_id: replayCommand }], rowCount: 1 };
    throw new Error(`Unexpected replay query: ${sql}`);
  } };
  return { pool: { connect: async () => client } as unknown as Pool, statements, client };
}
function expectRefused(statements: string[]) {
  expect(statements).toContain("ROLLBACK");
  expect(statements).not.toContain("COMMIT");
  expect(statements.filter(sql => /^(?:INSERT|UPDATE|DELETE)/u.test(sql) && !sql.startsWith("INSERT INTO app.watchdog_command_identity"))).toEqual([]);
}

describe("round 9 saved proof response and legacy readiness adapter conflicts", () => {
  it("still returns the exact saved proof response for an identical request", async () => {
    const command = { version: "practice-proof-command.v1", action: "select_generated", commandId: replayCommand, scopeItemId: scopeId, fixture: "completion-photo" };
    const request = { jobId: replayJob, ...command };
    const requestHash = createHash("sha256").update(JSON.stringify(request, Object.keys(request).sort())).digest("hex");
    const saved = { version: "practice-proof-view.v1", jobId: replayJob, decisionId: "original-decision" };
    const { pool, statements } = replayPool(sql => {
      if (sql.startsWith("SELECT 1 FROM app.membership")) return [{}];
      if (sql.startsWith("SELECT job_id,action,request_hash,response")) return [{ job_id: replayJob, action: command.action, request_hash: requestHash, response: saved }];
      return undefined;
    });
    expect(await new ProofApplication(pool).command(replayJob, command)).toEqual(saved);
    expect(statements).toContain("COMMIT");
    expect(statements.some(sql => /^(?:INSERT|UPDATE|DELETE)/u.test(sql))).toBe(false);
  });

  it.each(["payload", "job", "action"].flatMap(change => ["Nest", "Next"].map(adapter => ({ change, adapter }))))("saved proof response: changed $change returns 409 through $adapter", async ({ change, adapter }) => {
    const command = { version: "practice-proof-command.v1", action: "select_generated", commandId: replayCommand, scopeItemId: scopeId, fixture: "completion-photo" };
    const original = { jobId: replayJob, ...command };
    const requestHash = createHash("sha256").update(JSON.stringify(original, Object.keys(original).sort())).digest("hex");
    const savedResponse = { version: "practice-proof-view.v1", marker: "first answer must not leak" };
    const { pool, statements } = replayPool(sql => {
      if (sql.startsWith("SELECT 1 FROM app.membership")) return [{}];
      if (sql.startsWith("SELECT job_id,action,request_hash,response")) return [{ job_id: replayJob, action: command.action, request_hash: requestHash, response: savedResponse }];
      return undefined;
    });
    const app = new ProofApplication(pool), job = change === "job" ? otherJob : replayJob;
    const request = change === "payload" ? { ...command, scopeItemId: otherJob }
      : change === "action" ? { version: command.version, action: "finalize", commandId: replayCommand, uploadId: scopeId, objectVersionId: "synthetic-version" } : command;
    const error = await app.command(job, request).catch(e => e);
    if (adapter === "Nest") {
      expect(dispatchConflict(error)).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
    } else {
      routeApplication.current = { proof: app };
      const routePath = fileURLToPath(new URL("apps/web/app/api/jobs/[id]/proof/route.ts", root));
      const route = await import(routePath);
      const response = await route.POST(new Request("https://synthetic.invalid/proof", { method: "POST", body: JSON.stringify(request) }), { params: Promise.resolve({ id: job }) });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
    }
    expect(error).toBeInstanceOf(WatchdogError);
    expectRefused(statements);
  });
  it.each((["record", "advance"] as const).flatMap(action => ["Nest", "Next"].map(adapter => ({ action, adapter }))))("legacy readiness $action payload mismatch returns 409 through $adapter", async ({ action, adapter }) => {
    const original = { version: action === "record" ? "readiness-plan.v1" : "readiness-clock.v1", commandId: replayCommand, scenarioNow: "2026-04-08T10:00:00.000Z" };
    const { pool, statements } = replayPool(sql => {
      if (action === "record" && sql.startsWith("SELECT id,payload_hash,revision,job_id FROM app.planned_work_revision")) return [{ id: scopeId, payload_hash: sha({ jobId: replayJob, ...original }), revision: 1, job_id: replayJob }];
      if (action === "advance" && sql.startsWith("SELECT payload_hash,job_id,snapshot_id FROM app.readiness_decision")) return [{ snapshot_id: scopeId, payload_hash: sha({ jobId: replayJob, ...original }), job_id: replayJob }];
      return undefined;
    });
    const app = new ReadinessApplication(pool), request = { ...original, scenarioNow: "2026-04-09T10:00:00.000Z" };
    const error = await app[action](replayJob, request).catch(e => e);
    if (adapter === "Nest") {
      expect(dispatchConflict(error)).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
    } else {
      routeApplication.current = { readiness: app };
      const routePath = fileURLToPath(new URL("apps/web/app/api/jobs/[id]/readiness/[action]/route.ts", root));
      const route = await import(routePath);
      const response = await route.POST(new Request("https://synthetic.invalid/readiness", { method: "POST", body: JSON.stringify(request) }), { params: Promise.resolve({ id: replayJob, action: action === "record" ? "plan" : "advance" }) });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ code: "IDEMPOTENCY_CONFLICT" });
    }
    expect(error).toBeInstanceOf(WatchdogError);
    expectRefused(statements);
  });
  it.each(["foreign job", "dispatcher receipt"])("purchase-order %s replay conflict is typed at the Nest boundary", async conflict => {
    const { pool, statements } = replayPool(sql => {
      if (sql.startsWith("SELECT role FROM app.membership")) return [{ role: "owner" }];
      if (sql.startsWith("SELECT 1 FROM app.command_receipt c")) return conflict === "foreign job" ? [{}] : [];
      if (sql.startsWith("INSERT INTO app.command_receipt")) return [];
      if (sql.startsWith("SELECT request_hash,status,result FROM app.command_receipt")) return [{ request_hash: "different", status: "succeeded", result: { privateOriginal: true } }];
      return undefined;
    });
    const command = { version: "command.v1", commandId: replayCommand, commandType: "purchase_order.place", semanticKey: "synthetic-order",
      actorMembershipId: scopeId, subjectType: "purchase_order", subjectRef: scopeId,
      action: { actionType: "purchase_order.simulate", recipient: "merchant@synthetic.invalid", contentHash: "a".repeat(64), aggregateRevision: 1,
        amountPence: 100, currency: "GBP", policyVersion: "synthetic-po.v1", expiresAt: "2099-01-01T00:00:00.000Z" } };
    const error = await new PurchaseOrderApplication(pool).place(replayJob, { version: "purchase-order-placement.v1", command }).catch(e => e);
    expect(dispatchConflict(error)).toEqual({ status: 409, body: { code: "IDEMPOTENCY_CONFLICT" } });
    expect(error).toBeInstanceOf(WatchdogError);
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
    expect(statements.some(sql => /^(?:INSERT INTO app\.(?:decision|action_outbox|audit_event)|UPDATE|DELETE)/u.test(sql))).toBe(false);
  });
  it.each(["readiness-repository", "discrepancy-repository", "supplier-match-repository", "supplier-document-repository", "purchase-order-repository", "inbox-relevance-repository"])("%s keeps replay identity conflicts typed", async name => {
    const source = await readFile(new URL(`packages/db/src/${name}.ts`, root), "utf8");
    expect(source).not.toMatch(/new Error\("(?:IDEMPOTENCY_CONFLICT|COMMAND_CONFLICT)"\)/u);
  });
});
