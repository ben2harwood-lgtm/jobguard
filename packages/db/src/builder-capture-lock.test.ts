import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { VariationRepository } from "./variation-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";

// SQL protocol checks only; the real capture/final-lock race runs in PostgreSQL CI.
function fixture(roles: Array<string | undefined> = ["owner", "owner"], conflict = false) {
 const tenantId=randomUUID(), actor=randomUUID(), commandId=randomUUID(), jobId=randomUUID();
 const context=verifiedTenantContextForQueuedJob(tenantId), result={variationId:commandId};
 const input={version:"log-builder-extra.v1",actorMembershipId:actor,price:null,deviceId:null,deviceCapturedAt:null,
  proposal:{version:"variation-proposal.v1",id:commandId,jobId,scopeItemId:randomUUID(),existingScopeItemId:null,
   lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional extra",description:"Fictional extra",suggestion:null}};
 const query=vi.fn(async(sql:string,values?:unknown[])=>{
  if(sql.includes("SELECT role FROM app.membership")) {
   const role=roles.shift();return {rows:role?[{role}]:[],rowCount:role?1:0};
  }
  if(sql.includes("app.begin_command(")) {
   if(conflict)throw new Error("COMMAND_CONFLICT");
   const bound=JSON.parse(values?.[5] as string);
   expect(bound.input).toMatchObject({actorMembershipId:actor,proposal:{id:commandId,jobId}});
   expect(JSON.parse(bound.legacyJson)).toEqual(bound.input);
   return {rows:[{result:{kind:"replay",result}}],rowCount:1};
  }
  if(["BEGIN","COMMIT","ROLLBACK"].includes(sql)||sql.includes("set_config")||sql.includes("pg_advisory_xact_lock"))return {rows:[],rowCount:0};
  throw new Error(`Unexpected SQL: ${sql}`);
 });
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 return {repo:new VariationRepository(pool),query,context,input,result,tenantId,commandId};
}

it("capture gates the shared command before its receipt, rechecks authority, and replays without holding capacity",async()=>{
 const f=fixture();expect(await f.repo.logBuilderExtra(f.context,f.input)).toEqual(f.result);
 const calls=f.query.mock.calls,sql=calls.map(([q])=>q), gate=sql.findIndex(q=>q.includes("pg_advisory_xact_lock"));
 expect(calls[gate]).toEqual(["SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`final-review-command:${f.tenantId}:${f.commandId}`]]);
 expect(sql[gate-1]).toContain("SELECT role FROM app.membership");
 expect(sql[gate+1]).toContain("SELECT role FROM app.membership");
 expect(sql[gate+2]).toContain("app.begin_command(");
 expect(sql.some(q=>q.includes("INSERT INTO app.command_receipt")||q.includes("UPDATE app.command_receipt"))).toBe(false);
 expect(sql.some(q=>q.includes(",184)")||q.includes("app.job")||q.includes("app.audit"))).toBe(false);
 expect(sql.at(-1)).toBe("COMMIT");
});

it("a revoked owner after the command-gate wait cannot claim or replay a receipt",async()=>{
 const f=fixture(["owner",undefined]);
 await expect(f.repo.logBuilderExtra(f.context,f.input)).rejects.toThrow("FORBIDDEN");
 expect(f.query.mock.calls.some(([q])=>q.includes("app.command_receipt")||q.includes("app.begin_command("))).toBe(false);
 expect(f.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
});

it("a refused actor takes no command lock",async()=>{
 const f=fixture(["member"]);
 await expect(f.repo.logBuilderExtra(f.context,f.input)).rejects.toThrow("FORBIDDEN");
 expect(f.query.mock.calls.some(([q])=>q.includes("pg_advisory")||q.includes("app.command_receipt")||q.includes("app.begin_command("))).toBe(false);
});

it("a different receipt payload still conflicts after the gate",async()=>{
 const f=fixture(undefined,true);
 await expect(f.repo.logBuilderExtra(f.context,f.input)).rejects.toThrow("COMMAND_CONFLICT");
 expect(f.query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
});
