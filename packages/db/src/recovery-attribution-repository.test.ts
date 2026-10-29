// Scripted SQL boundary tests; PostgreSQL permissions/concurrency are tested separately.
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { expect,it,vi } from "vitest";
import { RecoveryAttributionRepository } from "./recovery-attribution-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
function fixture(locked:boolean|undefined){
 const query=vi.fn(async(sql:string)=>({rows:sql.includes("SELECT EXISTS")?(locked===undefined?[]:[{locked}]):[]}));
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 return {query,repo:new RecoveryAttributionRepository(pool),context:verifiedTenantContextForQueuedJob(randomUUID())};
}
it("SV6-22 pre lock query path never touches attribution or held shadow tables",async()=>{
 const f=fixture(false);
 expect(await f.repo.history(f.context,randomUUID(),"a".repeat(64))).toEqual([]);
 const sql=f.query.mock.calls.map(([s])=>s).join("\n");
 expect(sql).not.toMatch(/app\.(?:recovery_attribution|shadow)/u);
 expect(sql).toContain("app.authenticate_practice_session");expect(sql).toContain("current_database()='jobguard_synthetic_demo'");
 for(const clause of ["m.revoked_at IS NULL","m.expires_at>clock_timestamp()","j.tenant_id=$2 AND j.id=$3","j.practice_session_digest=$1","m.role='owner'","(m.tenant_id,m.id)=(p.tenant_id,p.membership_id)","l.tenant_id=j.tenant_id AND l.job_id=j.id"])expect(sql).toContain(clause);
});
it("SV6-19 transaction reauthentication refuses missing authority before history",async()=>{
 const f=fixture(undefined);await expect(f.repo.history(f.context,randomUUID(),"a".repeat(64))).rejects.toThrow("NOT_FOUND");
 expect(f.query.mock.calls.map(([s])=>s).join("\n")).not.toContain("FROM app.recovery_attribution_revision");
 expect(f.query).toHaveBeenCalledWith("ROLLBACK");
});
it("SV6-20 missing malformed and copied contexts fail before acquiring a connection",async()=>{
 const f=fixture(true);
 for(const context of [undefined,{}, {tenantId:"bad"},{...f.context}])await expect(f.repo.history(context as typeof f.context,randomUUID(),"a".repeat(64))).rejects.toThrow("verified tenant context");
 expect(f.query).not.toHaveBeenCalled();
});
it("locked history is tenant/job scoped and leaves session settings transaction-local",async()=>{
 const f=fixture(true),id=randomUUID();expect(await f.repo.history(f.context,id,"a".repeat(64))).toEqual([]);
 expect(f.query).toHaveBeenCalledWith("SELECT set_config('app.practice_material_digest',$1,true)",["a".repeat(64)]);
 expect(f.query).toHaveBeenCalledWith(expect.stringContaining("WHERE tenant_id=$1 AND job_id=$2"),[f.context.tenantId,id]);
 expect(f.query).toHaveBeenLastCalledWith("COMMIT");
});

it("SV6-30 historical output refuses a document crossing the requested job identity",async()=>{
 const {attributionDocumentFixture}=await import(new URL("../test/recovery-attribution-fixture.ts",import.meta.url).href);
 const document=attributionDocumentFixture(),context=verifiedTenantContextForQueuedJob(document.tenantId);
 const query=vi.fn(async(sql:string)=>({rows:sql.includes("SELECT EXISTS")?[{locked:true}]:sql.includes("SELECT document")?[{document}]:[]}));
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 await expect(new RecoveryAttributionRepository(pool).history(context,randomUUID(),"a".repeat(64))).rejects.toThrow("NOT_FOUND");
});
