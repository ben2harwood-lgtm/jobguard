import { beforeAll,afterAll,it,expect } from "vitest";
import { randomUUID } from "node:crypto";
import { actor,createIntegrityFixture,seedIntegrityJob,protectedFacts,type IntegrityFixture } from "./commercial-integrity-v3-fixtures.js";
let f:IntegrityFixture;beforeAll(async()=>{f=await createIntegrityFixture();},120000);afterAll(async()=>{await f?.close();});
it("CI-P01 current persisted actor and exact practice ownership precede source/review details",async()=>{
 const {job}=await seedIntegrityJob(f);
 expect((await f.repo.readFamily(f.auth.context,actor,f.auth.digest,job.toUpperCase())).family).toBe("v3");
 expect((await f.repo.read(f.auth.context,actor,f.auth.digest,job)).result.findings).toHaveLength(1);
 for(const [who,digest,id] of [[actor,f.other.digest,job],[{...actor,membershipId:randomUUID()},f.auth.digest,job],[{...actor,identityUserId:randomUUID()},f.auth.digest,job],[actor,"a".repeat(64),job],[actor,f.auth.digest,randomUUID()]] as const){
  await expect(f.repo.read(f.auth.context,who,digest,id)).rejects.toThrow("NOT_FOUND");
  await expect(f.repo.review(f.auth.context,who,digest,id,{forged:true})).rejects.toThrow("NOT_FOUND");
 }
});
it("CI-P05 reads do not alter money, meter, work state or immutable artifacts",async()=>{
 const {job}=await seedIntegrityJob(f),before=await protectedFacts(f);
 await f.repo.read(f.auth.context,actor,f.auth.digest,job);expect(await protectedFacts(f)).toEqual(before);
});
it("CI-P11 immutable saved-v1 routing remains minimal and separate",async()=>{
 const job=(await f.admin.query("SELECT id FROM app.job WHERE practice_session_digest=$1 AND saved_v1_sample",[f.auth.digest])).rows[0].id;
 const view=await f.repo.readFamily(f.auth.context,actor,f.auth.digest,job);
 expect(Object.keys(view).sort()).toEqual(["environment","family","jobId","realExternalActions","version"]);
 expect(view.family).toBe("v1");await expect(f.repo.read(f.auth.context,actor,f.auth.digest,job)).rejects.toThrow("INTEGRITY_FAMILY_UNAVAILABLE");
});
it("CI-P01 revoked persisted session denies even malformed review",async()=>{
 const {job}=await seedIntegrityJob(f);await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[f.auth.digest]);
 try{await expect(f.repo.review(f.auth.context,actor,f.auth.digest,job,null)).rejects.toThrow("NOT_FOUND");}
 finally{await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=NULL WHERE token_digest=$1",[f.auth.digest]);}
});
it("CI-P03 locked jobs return a held public port without private outcome inspection",async()=>{
 const {addIntegrityLock}=await import("./commercial-integrity-v3-fixtures.js"),x=await seedIntegrityJob(f),lockId=await addIntegrityLock(f,x);
 const view=await f.repo.read(f.auth.context,actor,f.auth.digest,x.job);
 expect(view.published).toMatchObject({available:false,code:"INTEGRITY_PUBLISHED_OUTCOMES_UNAVAILABLE",hold:"CI-H1",lock:{id:lockId,status:null}});
 expect(view.result.findings).toEqual([]);
});
