import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { jobMutationRegistry, watchdogCommandGuards } from "@jobguard/core";
import { WatchdogError } from "@jobguard/db";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";
const root = new URL("../../../", import.meta.url);
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
    const path = argument.properties.find((p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && p.name.getText() === "path");
    return literalPaths(path?.initializer, where);
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
      expect(responses["409"].content["application/json"].schema.properties.code.enum).toEqual(["JOB_NOT_LIVE"]);
    }
  });
  it("maps the typed guard failure in the standalone API", () => {
    let status = 0, body: unknown;
    const host = { switchToHttp: () => ({ getResponse: () => ({ status(code: number) { status = code; return { json(value: unknown) { body = value; } }; } }) }) };
    new WatchdogExceptionFilter().catch(new WatchdogError("JOB_NOT_LIVE"), host as never);
    expect(status).toBe(409); expect(body).toEqual({ code: "JOB_NOT_LIVE" });
  });
});
