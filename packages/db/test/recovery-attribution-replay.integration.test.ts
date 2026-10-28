// Private synthetic storage serialization only; not an authorized runtime replay.
import { randomUUID } from "node:crypto";
import { afterAll,beforeAll,expect,it } from "vitest";
import { createLockFixture,closeLockFixture,asFixtureTenant,storedAttributionFixture,LOCK_OWNER,type LockFixture } from "./recovery-attribution-fixture.js";
let f:LockFixture;
beforeAll(async()=>{f=await createLockFixture();},90000);
afterAll(async()=>{if(f)await closeLockFixture(f);});
it("SV6-23 replay preserves first result and rejects identity reuse (private storage)",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const append=(d:unknown,c:unknown,actor:string=LOCK_OWNER,cause:string|null=null)=>asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,$4,$5) result",[d,actor,c,cause,cause?"synthetic:source":null]));
 const first=(await append(document,command)).rows[0].result;
 const assessmentId=randomUUID(),next={...document,assessmentId,revision:2,previousAssessmentId:document.assessmentId,facts:{...document.facts,revisionId:assessmentId}};
 await append(next,null,LOCK_OWNER,"source_changed");expect((await append(document,command)).rows[0].result).toEqual(first);
 await expect(append(document,command,randomUUID())).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 await expect(append(document,{...command,expectedAttributionRevision:1})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
it("SV6-24 concurrent assessment and rollback preserve one storage effect (audit adapter held)",async()=>{
 const {p,document,command}=await storedAttributionFixture(f);
 const append=()=>asFixtureTenant(f.owner,p.tenantId,db=>db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null) result",[document,LOCK_OWNER,command]));
 const results=await Promise.all([append(),append()]);expect(results[0].rows).toEqual(results[1].rows);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.recovery_attribution_revision WHERE tenant_id=$1 AND case_id=$2",[p.tenantId,p.caseId])).rows[0].n).toBe(1);
 const other=await storedAttributionFixture(f);
 await expect(asFixtureTenant(f.owner,other.p.tenantId,async db=>{await db.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[other.document,LOCK_OWNER,other.command]);throw new Error("injected failure");})).rejects.toThrow("injected failure");
 for(const table of ["recovery_attribution_revision","recovery_attribution_command","recovery_attribution_reassessment"])expect((await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[other.p.tenantId,other.p.caseId])).rows[0].n).toBe(0);
});
