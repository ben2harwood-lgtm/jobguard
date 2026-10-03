import ts from "typescript";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { jobMutationRegistry, watchdogCommandGuards } from "@jobguard/core";
import { WatchdogError } from "@jobguard/db";
import { WatchdogExceptionFilter } from "./watchdog.filter.js";
const root = new URL("../../../", import.meta.url);
async function routes(url: URL): Promise<string[]> {
  const result: string[] = [];
  for (const e of await readdir(url, { withFileTypes: true })) {
    const child = new URL(`${e.name}${e.isDirectory() ? "/" : ""}`, url);
    if (e.isDirectory()) result.push(...await routes(child));
    else if (e.name === "route.ts" && /export (?:async )?function POST/u.test(await readFile(child, "utf8"))) {
      result.push(`/api/${fileURLToPath(child).split("/app/api/")[1]!.replace(/\/route.ts$/u, "")}`);
    }
  }
  return result;
}
describe("CH-2 command coverage and lock order", () => {
  it("fails when any job mutation route is unclassified", async () => {
    const actual = await routes(new URL("apps/web/app/api/jobs/", root));
    expect(actual.sort()).toEqual(Object.keys(jobMutationRegistry).filter(key => key.startsWith("/api/jobs/") && !key.includes("#")).sort());
    expect(actual.every(route => Object.hasOwn(jobMutationRegistry, route))).toBe(true);
    expect(Object.hasOwn(jobMutationRegistry, "/api/jobs/[id]/unclassified-site-message")).toBe(false);
  });
  it("classifies standalone job mutations and dispatcher command literals too", async () => {
    const found: string[] = [];
    async function walk(url: URL): Promise<void> {
      for(const entry of await readdir(url,{withFileTypes:true})) {
        const child=new URL(`${entry.name}${entry.isDirectory()?"/":""}`,url);
        if(entry.isDirectory()) { await walk(child); continue; }
        if(!entry.name.endsWith(".ts")||entry.name.endsWith(".test.ts")) continue;
        const source=await readFile(child,"utf8");
        for(const match of source.matchAll(/commandType\s*:\s*"([^"]+)"/gu)) expect(jobMutationRegistry[`command:${match[1]}`]).toBeDefined();
        if(!entry.name.endsWith("controller.ts"))continue;
        const prefix=source.match(/@Controller\((?:"([^"]*)")?\)/u)?.[1]??"";
        for(const match of source.matchAll(/@Post\((?:"([^"]*)")?\)/gu)) {
          const route="/"+[prefix,match[1]??""].filter(Boolean).join("/");
          if(route.includes("jobs")||route.startsWith("/decisions")||route.startsWith("/recovery-cases")) found.push(`nest:${route}`);
        }
      }
    }
    await walk(new URL("apps/api/src/",root));await walk(new URL("packages/db/src/",root));
    expect(found.sort()).toEqual(Object.keys(jobMutationRegistry).filter(key=>key.startsWith("nest:")).sort());
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
