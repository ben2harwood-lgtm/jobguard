import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const { query, context, transaction }=vi.hoisted(()=>({query:vi.fn(),context:vi.fn(),transaction:vi.fn()}));
vi.mock("./contractor-session-context.js",()=>({contractorSessionContext:context}));
vi.mock("./tenant-context.js",()=>({withTenant:transaction}));
import { EnterpriseLivePromptRepository } from "./enterprise-live-prompt-repository.js";
const pool={} as Pool, session=randomUUID(), jobId=randomUUID();
const input={version:"office-signals.v1",jobId};
const item={promptId:randomUUID(),variationId:randomUUID(),recordedAt:"2026-11-04T04:00:00+00:00"};
beforeEach(()=>{
 vi.clearAllMocks();context.mockResolvedValue({tenantId:randomUUID()});
 transaction.mockImplementation(async(_pool,_ctx,fn)=>fn({$client:{query}}));
 query.mockResolvedValue({rows:[{result:{items:[item],nextCursor:null}}]});
});
it("binds the persisted session's tenant and parameterizes the read with capped default pagination",async()=>{
 const result=await new EnterpriseLivePromptRepository(pool).officeSignals(session,input);
 expect(context).toHaveBeenCalledExactlyOnceWith(pool,session);
 expect(transaction).toHaveBeenCalledWith(pool,await context.mock.results[0]!.value,expect.any(Function));
 expect(query).toHaveBeenCalledExactlyOnceWith("SELECT app.lp_office_signals($1,$2,$3,$4) result",[session,jobId,50,null]);
 expect(result).toEqual({items:[item],nextCursor:null});
});
it.each(["price","fee","originHash","shadow"])("rejects an unexpected %s field from the projection",async field=>{
 query.mockResolvedValue({rows:[{result:{items:[{...item,[field]:"forbidden"}],nextCursor:null}}]});
 await expect(new EnterpriseLivePromptRepository(pool).officeSignals(session,input)).rejects.toThrow();
});
it("rejects caller-selected authority and bad pagination before opening a transaction",async()=>{
 for(const raw of [{...input,tenantId:randomUUID()},{...input,role:"owner"},{...input,limit:101},{...input,after:"bad"}]){
  await expect(new EnterpriseLivePromptRepository(pool).officeSignals(session,raw)).rejects.toMatchObject({code:"INVALID_PROMPT_COMMAND"});
 }
 expect(context).not.toHaveBeenCalled();expect(transaction).not.toHaveBeenCalled();
});
it("fails closed when the session or database authority is revoked",async()=>{
 context.mockRejectedValueOnce(Object.assign(new Error("UNAUTHENTICATED"),{code:"UNAUTHENTICATED"}));
 await expect(new EnterpriseLivePromptRepository(pool).officeSignals(session,input)).rejects.toMatchObject({code:"UNAUTHENTICATED"});
 expect(query).not.toHaveBeenCalled();
 query.mockRejectedValueOnce(new Error("EXTRA_FORBIDDEN"));
 await expect(new EnterpriseLivePromptRepository(pool).officeSignals(session,input)).rejects.toMatchObject({code:"EXTRA_FORBIDDEN"});
});
