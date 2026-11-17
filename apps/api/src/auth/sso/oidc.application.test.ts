import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { IdentityRepository, type OidcRepository } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { IdentityApplication } from "../identity.application.js";
import { createWorkspaceApplication } from "../../workspace/application.js";
import { OidcApplication } from "./oidc.application.js";
import { TestOidcIssuer, fixtureConfig } from "./test-oidc-issuer.js";
function harness() {
 const issuer=new TestOidcIssuer(),trace:string[]=[];
 let stored:unknown,claimed=false,held=false;
 const config={version:"oidc-connection.v1",protocol:"oidc",revision:1,sessionLimitSeconds:900,config:fixtureConfig};
 const transport=issuer.transport;
 Object.defineProperty(issuer,"transport",{value:async(...args:Parameters<typeof transport>)=>{expect(held).toBe(false);trace.push(args[0].endsWith('/token')?'exchange':'discovery');return transport(...args);}});
 const repository={load:vi.fn(async():Promise<unknown>=>config),refusal:vi.fn(async()=>{}),save:vi.fn(async(_id:string,request:unknown)=>{stored=request;}),
  claim:vi.fn(async()=>{if(claimed)throw new Error('consumed');claimed=true;trace.push('claim-committed');return {connection:config,request:stored,linkSessionId:null};}),
  fail:vi.fn(async()=>{}),transaction:vi.fn(async(work:(c:unknown)=>Promise<unknown>)=>{held=true;try{return await work({});}finally{held=false;}}),
  finish:vi.fn(async():Promise<{tenantId:string;membershipId:string}|{code:string}>=>({tenantId:fixtureConfig.tenantId,membershipId:'member'})),audit:vi.fn(async()=>{})};
 const app=new OidcApplication({digest:(s:string)=>s} as PersistedAuthProvider,repository as unknown as OidcRepository,'https://jobguard.invalid','synthetic_demo',issuer);
 return {app,repository,issuer,trace};
}
const input={version:'oidc-start.v1',action:'signin'};
async function started(h:ReturnType<typeof harness>) {return h.app.start(fixtureConfig.connectionId,input,{origin:h.app.allowedOrigin});}
async function callback(h:ReturnType<typeof harness>,s:Awaited<ReturnType<typeof started>>) {return h.app.callback(fixtureConfig.connectionId,{version:'oidc-callback.v1',callback:s.callback},s.browser,h.app.allowedOrigin);}
describe('OIDC orchestration (repository double, not PostgreSQL evidence)',()=>{
 it('claims before actual adapter exchange without a held transaction; refuses replay',async()=>{
  const h=harness(),s=await started(h);expect(await callback(h,s)).toHaveProperty('sessionToken');
  expect(h.trace.indexOf('claim-committed')).toBeLessThan(h.trace.indexOf('exchange'));
  await expect(callback(h,s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.trace.filter(x=>x==='exchange')).toHaveLength(1);
 });
 it('records unknown outcome and never retries exchange',async()=>{
  const h=harness(),s=await started(h);h.issuer.altered=true;
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});
  expect(h.repository.fail).toHaveBeenCalledOnce();expect(h.repository.finish).not.toHaveBeenCalled();
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});
  expect(h.trace.filter(x=>x==='exchange')).toHaveLength(1);
 });
 it('refuses a connection loaded for another company before saving or contacting the issuer',async()=>{
  const h=harness();
  h.repository.load.mockResolvedValueOnce({...connection,config:{...fixtureConfig,tenantId:'10000000-0000-4000-8000-000000000001',connectionId:'20000000-0000-4000-8000-000000000002'}});
  await expect(started(h)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.save).not.toHaveBeenCalled();expect(h.trace).toEqual([]);
 });
 it('refuses callback-supplied finance and commercial-manager permissions before claiming state',async()=>{
  const h=harness(),s=await started(h);
  await expect(h.app.callback(fixtureConfig.connectionId,{version:'oidc-callback.v1',callback:s.callback,groups:['finance','commercial_manager']},s.browser,h.app.allowedOrigin)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.claim).not.toHaveBeenCalled();expect(h.repository.finish).not.toHaveBeenCalled();
  // Rejecting the untrusted extra fields must leave the original request usable once.
  expect(await callback(h,s)).toHaveProperty('sessionToken');
  await expect(callback(h,s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.finish).toHaveBeenCalledOnce();
 });
 it('redacts commit-time authority failure',async()=>{
  const h=harness(),s=await started(h);h.repository.finish.mockRejectedValueOnce(new Error('private authority detail'));
  await expect(callback(h,s)).rejects.toMatchObject({message:'OIDC_REFUSED'});expect(h.repository.fail).toHaveBeenCalledOnce();
 });
 it('commits the no-group refusal audit before refusing sign-in',async()=>{
  const h=harness(),s=await started(h);h.repository.finish.mockResolvedValueOnce({code:'NO_MAPPED_GRANTS'});
  await expect(callback(h,s)).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.audit).toHaveBeenCalledWith({},fixtureConfig.connectionId,'sso.oidc.signin.refused','identity:oidc','OIDC_REFUSED');
 });
 it('refuses wrong origin and missing link authority before exchange',async()=>{
  const h=harness();await expect(h.app.start(fixtureConfig.connectionId,input,{origin:'https://other.invalid'})).rejects.toMatchObject({code:'OIDC_REFUSED'});
  await expect(h.app.start(fixtureConfig.connectionId,{...input,linkExisting:true},{origin:h.app.allowedOrigin})).rejects.toMatchObject({code:'OIDC_REFUSED'});
  expect(h.repository.claim).not.toHaveBeenCalled();expect(h.trace).toEqual([]);
 });
});

/**
 * Access-control repair (ENT-10-OIDC-B r1, B1). The in-process fictional issuer approves anyone, so it may only ever be injected by a
 * test. Without a configured issuer every sign-in step must be refused before it can save, claim or complete anything.
 * Repository doubles and a recording pool double: not PostgreSQL evidence.
 */
const origin = "https://jobguard.invalid";
const connectionId = fixtureConfig.connectionId;
const start = { version: "oidc-start.v1", action: "signin" };
const connection = { version: "oidc-connection.v1", protocol: "oidc", revision: 1, sessionLimitSeconds: 900, config: fixtureConfig };

function repositoryDouble() {
  let stored: unknown;
  const repository = {
    load: vi.fn(async () => connection),
    refusal: vi.fn(async () => {}),
    save: vi.fn(async (_id: string, request: unknown) => { stored = request; }),
    claim: vi.fn(async () => ({ connection, request: stored, linkSessionId: null })),
    fail: vi.fn(async () => {}),
    transaction: vi.fn(async (work: (client: unknown) => Promise<unknown>) => work({})),
    finish: vi.fn(async () => ({ tenantId: fixtureConfig.tenantId, membershipId: "member" })),
    audit: vi.fn(async () => {}),
  };
  return repository;
}
function application(repository: ReturnType<typeof repositoryDouble>, issuer?: TestOidcIssuer) {
  // Same constructor shape as production composition (`workspace/application.ts`): the optional issuer is the only difference.
  return new OidcApplication({ digest: (value: string) => value } as never, repository as unknown as OidcRepository, origin, "synthetic_demo", issuer);
}
const anonymous = { origin };

describe("OIDC sign-in without a configured issuer (B1)", () => {
  it("refuses an unauthenticated start: nothing is loaded, saved or claimed and no callback is produced", async () => {
    const repository = repositoryDouble();
    await expect(application(repository).start(connectionId, start, anonymous)).rejects.toMatchObject({ code: "OIDC_REFUSED" });
    expect(repository.load).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.claim).not.toHaveBeenCalled();
    expect(repository.finish).not.toHaveBeenCalled();
    // The refusal is the redacted bootstrap record, keyed only by the route.
    expect(repository.refusal).toHaveBeenCalledExactlyOnceWith(connectionId, "OIDC_REFUSED");
  });

  it("is the missing issuer, and only that, that refuses: the same unauthenticated start succeeds when a test injects one", async () => {
    const repository = repositoryDouble();
    const injected = await application(repository, new TestOidcIssuer()).start(connectionId, start, anonymous);
    expect(injected).toHaveProperty("callback");
    expect(repository.save).toHaveBeenCalledOnce();
  });

  it("refuses an unauthenticated callback that another instance legitimately started, without claiming it or issuing a session", async () => {
    const repository = repositoryDouble();
    const started = await application(repository, new TestOidcIssuer()).start(connectionId, start, anonymous);
    await expect(application(repository).callback(connectionId, { version: "oidc-callback.v1", callback: started.callback }, started.browser, origin))
      .rejects.toMatchObject({ code: "OIDC_REFUSED" });
    expect(repository.claim).not.toHaveBeenCalled();
    expect(repository.transaction).not.toHaveBeenCalled();
    expect(repository.finish).not.toHaveBeenCalled();
  });

  it("production composition configures no issuer, so an anonymous visitor who knows a connection id is refused at both steps", async () => {
    const saved = process.env.JOBGUARD_ENV;
    process.env.JOBGUARD_ENV = "synthetic_demo";
    try {
      // Only the redacted bootstrap refusal record may touch the database; anything else (save, claim, complete, session) throws.
      const queries: string[] = [];
      const allowed = /^(?:BEGIN|COMMIT|ROLLBACK)$|sso_refusal_event|sso_load_connection/u;
      const run = async (sql: string) => {
        queries.push(sql);
        if (!allowed.test(sql)) throw new Error(`unexpected database access: ${sql}`);
        if (sql.includes("sso_load_connection")) throw new Error("SSO_NOT_FOUND");
        return { rows: [] };
      };
      const pool = { query: vi.fn(run), connect: vi.fn(async () => ({ query: vi.fn(run), release: vi.fn() })) } as unknown as Pool;
      const identity = new IdentityApplication(new PersistedAuthProvider(new IdentityRepository(pool), "fixture-secret-longer-than-thirty-two"), origin);
      const oidc = createWorkspaceApplication({ pool, identity }).oidc!;
      expect(oidc.issuer).toBeUndefined();
      await expect(oidc.start(connectionId, start, anonymous)).rejects.toMatchObject({ code: "OIDC_REFUSED" });
      const state = "s".repeat(43), binding = "b".repeat(43);
      await expect(oidc.callback(connectionId, { version: "oidc-callback.v1", callback: `${fixtureConfig.redirectUri}?code=fixture&state=${state}&iss=${encodeURIComponent(fixtureConfig.issuer)}` }, binding, origin))
        .rejects.toMatchObject({ code: "OIDC_REFUSED" });
      expect(queries.some(sql => sql.includes("sso_refusal_event"))).toBe(true);
      expect(queries.every(sql => allowed.test(sql))).toBe(true);
    } finally { if (saved === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = saved; }
  });
});

describe("the fictional issuer is test-only (B1)", () => {
  const root = fileURLToPath(new URL("../../../../..", import.meta.url));
  const skipped = new Set(["node_modules", ".next", "dist", "test", "e2e", ".turbo", ".worktrees"]);
  const isTest = (name: string) => /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name) || /(?:^|\/)test-[^/]+\.ts$/u.test(name);
  function sources(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return skipped.has(entry.name) ? [] : sources(path);
      return /\.[cm]?[jt]sx?$/u.test(entry.name) && !isTest(entry.name) ? [path] : [];
    });
  }
  const production = ["apps/api/src", "apps/web", ...readdirSync(join(root, "packages")).map(name => `packages/${name}/src`)]
    .flatMap(directory => { try { return sources(join(root, directory)); } catch { return []; } })
    .map(path => relative(root, path).split(sep).join("/"));

  it("is reachable from no route, module or default configuration source", () => {
    expect(production).toContain("apps/api/src/auth/sso/oidc.application.ts");
    expect(production).toContain("apps/api/src/app.module.ts");
    for (const file of production) {
      expect(readFileSync(join(root, file), "utf8"), file).not.toMatch(/test-oidc-issuer|TestOidcIssuer/u);
    }
  });

  it("is never passed to a production OidcApplication constructor", () => {
    const constructions: string[] = [];
    for (const file of production) {
      const text = readFileSync(join(root, file), "utf8");
      if (!text.includes("OidcApplication")) continue;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isNewExpression(node) && node.expression.getText(source) === "OidcApplication") {
          constructions.push(file);
          expect(node.arguments?.length, `${file} must not supply an issuer`).toBe(4);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(constructions).toEqual(["apps/api/src/workspace/application.ts"]);
  });
});
