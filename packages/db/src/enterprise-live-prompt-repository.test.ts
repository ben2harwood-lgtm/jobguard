import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
const state = vi.hoisted(() => ({ context: Object.freeze({}), bridge: vi.fn(), tenant: vi.fn(), query: vi.fn() }));
vi.mock("./contractor-session-context.js", () => ({ contractorSessionContext: state.bridge }));
vi.mock("./tenant-context.js", () => ({ withTenant: state.tenant }));
import { EnterpriseLivePromptRepository } from "./enterprise-live-prompt-repository.js";
const job = "00000000-0000-4000-8000-000000000001";
it("resolves session context and projects an empty guarded read with parameterised session/job", async () => {
 const result = { version: "observation-evidence.v1", items: [] }, pool = {} as Pool;
 state.bridge.mockResolvedValue(state.context); state.query.mockResolvedValue({ rows: [{ result }] });
 state.tenant.mockImplementation(async (_pool, _context, fn) => fn({ $client: { query: state.query } }));
 const projection=await new EnterpriseLivePromptRepository(pool).observationEvidence(job, job);
 expect(projection).toEqual(result); expect(projection).not.toBe(result);
 expect(state.bridge).toHaveBeenCalledWith(pool, job); expect(state.tenant.mock.calls[0]![1]).toBe(state.context);
 expect(state.query).toHaveBeenCalledWith("SELECT app.contractor_job_evidence_read($1,$2) result", [job, job]);
});
it("reads original bytes on the runtime transaction and passes the exact preimage to the session-checked parser without exposing internal metadata", async () => {
 const item={evidenceId:job,sha256:"a".repeat(64),objectVersion:"fictional-v1",mediaKind:"completion_photo",capturedAt:null},bytes=Buffer.from("fictional PNG preimage");
 state.bridge.mockResolvedValue(state.context);state.query.mockReset();
 state.tenant.mockImplementation(async (_pool,_context,fn)=>fn({$client:{query:state.query}}));
 state.query.mockImplementation(async (sql:string)=>{
  if(sql.includes("contractor_job_evidence_read"))return {rows:[{result:{version:"observation-evidence.v1",items:[{...item,contentType:"image/png"}]}}]};
  if(sql.includes("app.lp_sources"))return {rows:[]};
  if(sql.includes("SELECT o.bytes"))return {rows:[{bytes}]};
  if(sql.includes("contractor_completion_photo_tags"))return {rows:[{tags:["Fictional vent"]}]};
  throw new Error("Unexpected query");
 });
 expect(await new EnterpriseLivePromptRepository({} as Pool).observationEvidence(job,job)).toEqual({version:"observation-evidence.v1",items:[{...item,photoTags:["Fictional vent"]}]});
 expect(state.query.mock.calls.map(([sql])=>String(sql).includes("SELECT o.bytes")?"runtime bytes":String(sql))).toEqual([
  "SELECT app.contractor_job_evidence_read($1,$2) result","SELECT app.lp_sources($1,$2)","runtime bytes","SELECT app.contractor_completion_photo_tags($1,$2,$3,$4,$5,$6::bytea) tags",
 ]);
 expect(state.query.mock.calls[3]![1]).toEqual([job,job,item.evidenceId,item.sha256,item.objectVersion,bytes]);
});
it("preserves the guarded authority refusal", async () => {
 state.bridge.mockRejectedValue(new Error("EXTRA_FORBIDDEN"));
 await expect(new EnterpriseLivePromptRepository({} as Pool).observationEvidence(job, job)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
});
it("rejects invalid job identifiers before session resolution", async () => {
 state.bridge.mockClear();
 await expect(new EnterpriseLivePromptRepository({} as Pool).observationEvidence(job, "invalid")).rejects.toMatchObject({ code: "INVALID_PROMPT_COMMAND" });
 expect(state.bridge).not.toHaveBeenCalled();
});

it.each(["FORBIDDEN", "UNAUTHENTICATED"])("types lp_authority refusal %s without turning an outage into a refusal", async message => {
 state.bridge.mockResolvedValue(state.context);
 state.tenant.mockRejectedValueOnce(Object.assign(new Error(message), { code: "42501" }));
 await expect(new EnterpriseLivePromptRepository({} as Pool).detail(job, {version:"live-prompt-detail.v1",jobId:job,promptId:job}))
  .rejects.toMatchObject({ name: "EnterpriseLivePromptPersistenceError", code: "EXTRA_FORBIDDEN" });
 state.tenant.mockRejectedValueOnce(new Error("connection lost"));
 await expect(new EnterpriseLivePromptRepository({} as Pool).detail(job, {version:"live-prompt-detail.v1",jobId:job,promptId:job})).rejects.toThrow("connection lost");
});
