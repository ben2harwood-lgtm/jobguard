// Real PostgreSQL tests, NOT RUN in the restricted builder sandbox.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { ExtraRepository, ExtraApprovalRepository, withTenant } from "../src/index.js";
import { cluster, promptFixture, materialsInput, evaluateInput, listInput, moveOffLive, secondJob, type PromptFixture } from "./enterprise-live-prompt-fixtures.js";
let c: Awaited<ReturnType<typeof cluster>>, repo: EnterpriseLivePromptRepository;
beforeAll(async () => { process.env.JOBGUARD_ENV="synthetic_demo"; c=await cluster(); repo=new EnterpriseLivePromptRepository(c.runtime); },120000);
afterAll(async()=>{await c?.close();});
async function surfaced(f: PromptFixture) {
 await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each"}));
 const page=await repo.list(f.sessions.supervisor!,listInput(f));
 expect(page.items.length).toBeGreaterThan(0); return page.items[0]!;
}
const confirmation=(f:PromptFixture,p:{id:string;promptHash:string})=>({version:"confirm-prompt.v1",commandId:randomUUID(),jobId:f.jobId,promptId:p.id,promptHash:p.promptHash});
async function counts(f:PromptFixture){return (await c.admin.query(`SELECT (SELECT count(*) FROM app.extra_origin WHERE tenant_id=$1)::int origins,(SELECT count(*) FROM app.prompt_resolution WHERE tenant_id=$1)::int resolutions,(SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1)::int receipts,(SELECT count(*) FROM app.audit_event WHERE tenant_id=$1)::int audits`,[f.p.tenantId])).rows[0];}
describe("ENT-8A-P atomic commands",()=>{
 it("exactly one new origin, capture note and scope identity; no automatic price or approval",async()=>{
  const f=await promptFixture(c),p=await surfaced(f),cmd=confirmation(f,p);
  const first=await repo.confirm(f.sessions.supervisor!,cmd); expect(await repo.confirm(f.sessions.supervisor!,cmd)).toEqual(first);
  const origins=(await c.admin.query("SELECT o.kind,v.capture_text,v.scope_item_id FROM app.extra_origin o JOIN app.variation v ON(v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id) WHERE o.tenant_id=$1",[f.p.tenantId])).rows;
  expect(origins).toHaveLength(1); expect(origins[0]).toMatchObject({kind:"jobguard_surfaced_confirmed",capture_text:expect.any(String),scope_item_id:expect.any(String)});
  expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{kind:"logged"}]);
 });
 it("confirmed extras continue through ENT-5 pricing without rewriting origin",async()=>{
  const f=await promptFixture(c),p=await surfaced(f); await repo.confirm(f.sessions.supervisor!,confirmation(f,p));
  const before=(await c.admin.query("SELECT variation_id,origin_hash FROM app.extra_origin WHERE tenant_id=$1",[f.p.tenantId])).rows[0]!;
  const approvals=new ExtraApprovalRepository(c.runtime);
  await approvals.priceExtra(f.ctx,f.members.surveyor.member,{version:"price-extra.v1",commandId:randomUUID(),jobId:f.jobId,extraId:before.variation_id,netPence:1000});
  const submitted=await approvals.submitExtra(f.ctx,f.members.surveyor.member,{version:"submit-extra.v1",commandId:randomUUID(),jobId:f.jobId,extraId:before.variation_id});
  expect(submitted.state).toBe("awaiting_approval");
  await approvals.approveExtraStep(f.ctx,f.named.member,{version:"approve-extra-step.v1",commandId:randomUUID(),jobId:f.jobId,requestId:submitted.requestId,stepIndex:0,revisionHash:submitted.revisionHash,netPence:1000});
  expect((await c.admin.query("SELECT kind FROM app.extra_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1",[f.p.tenantId])).rows).toEqual([{kind:"approved"}]);
  expect((await c.admin.query("SELECT origin_hash FROM app.extra_origin WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{origin_hash:before.origin_hash}]);
 });
 it("work-order prompt receipts still refuse runtime result and identity rewrites",async()=>{
  const f=await promptFixture(c),p=await surfaced(f),cmd=confirmation(f,p);
  const result=await repo.confirm(f.sessions.supervisor!,cmd);
  for(const assignment of ["result='{}'::jsonb", "semantic_key='extra-origin:legacy:forged'"]) {
   await expect(withTenant(c.runtime,f.ctx,db=>db.$client.query(`UPDATE app.command_receipt SET ${assignment} WHERE tenant_id=$1 AND command_id=$2`,[f.p.tenantId,cmd.commandId]))).rejects.toThrow();
  }
  expect(await repo.confirm(f.sessions.supervisor!,cmd)).toEqual(result);
 });
 it("raw confirmation still raises PROMPT_ORIGIN_HELD",async()=>{
  const f=await promptFixture(c);
  await expect(new ExtraRepository(c.runtime).raiseExtra(f.ctx,{version:"raise-extra.v1",commandId:randomUUID(),commandType:"ConfirmPrompt",jobId:f.jobId,actorMembershipId:f.members.supervisor.member.membershipId,grantId:f.members.supervisor.grant,note:"Fictional unbound prompt",description:"Fictional extra"})).rejects.toMatchObject({code:"PROMPT_ORIGIN_HELD"});
 });
 it("dismissal is immutable and exact prompt hash is required",async()=>{
  const f=await promptFixture(c),p=await surfaced(f),before=await counts(f);
  await expect(repo.dismiss(f.sessions.supervisor!,{...confirmation(f,p),version:"dismiss-prompt.v1",reason:"Already covered",promptHash:"0".repeat(64)})).rejects.toMatchObject({code:"PROMPT_CONFLICT"});
  expect(await counts(f)).toEqual(before);
  const cmd={...confirmation(f,p),version:"dismiss-prompt.v1",reason:"Already covered"}; const result=await repo.dismiss(f.sessions.supervisor!,cmd);
  expect(await repo.dismiss(f.sessions.supervisor!,cmd)).toEqual(result);
  await expect(repo.confirm(f.sessions.supervisor!,confirmation(f,p))).rejects.toMatchObject({code:"PROMPT_CONFLICT"});
  await expect(c.admin.query("UPDATE app.prompt_resolution SET reason='changed' WHERE tenant_id=$1",[f.p.tenantId])).rejects.toBeDefined();
 });
 it("unsupported returns quarantine the comparison and prevent an earlier prompt confirmation",async()=>{
  const f=await promptFixture(c),p=await surfaced(f);
  const result=await repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each",kind:"return",quantity:"1",occurredAtMicros:"1792310400000001"}));
  expect(result.quarantinedComparisons).toBeGreaterThan(0);
  await expect(repo.confirm(f.sessions.supervisor!,confirmation(f,p))).rejects.toMatchObject({code:"PROMPT_SOURCE_INVALID"});
 });
 it("failed audit rolls source, origin, resolution and receipt back together",async()=>{
  const f=await promptFixture(c),p=await surfaced(f),before=await counts(f);
  await c.admin.query(`CREATE FUNCTION app.ent8ap_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id='${f.p.tenantId}'::uuid AND NEW.event_type='contractor.prompt.command' THEN RAISE EXCEPTION 'synthetic audit rejection'; END IF; RETURN NEW; END $$; CREATE TRIGGER ent8ap_test_reject_audit BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.ent8ap_test_reject_audit()`);
  try {
   await expect(repo.confirm(f.sessions.supervisor!,confirmation(f,p))).rejects.toBeDefined();
   expect(await counts(f)).toEqual(before);
   const sources=(await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows;
   await expect(repo.importMaterials(f.sessions.finance!,materialsInput(f,{unit:"each",occurredAtMicros:"1792310400000001"}))).rejects.toBeDefined();
   expect((await c.admin.query("SELECT count(*)::int n FROM app.materials_issue_fact WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual(sources);
   expect(await counts(f)).toEqual(before);
  } finally {await c.admin.query("DROP TRIGGER ent8ap_test_reject_audit ON app.audit_event; DROP FUNCTION app.ent8ap_test_reject_audit()");}
 });
 for(const mutation of ["importMaterials","evaluate","confirm","dismiss"] as const) describe(mutation,()=>{
  async function prepare(){const f=await promptFixture(c),p=await surfaced(f);const raw=mutation==="importMaterials"?materialsInput(f,{unit:"each",occurredAtMicros:"1792310400000001"}):mutation==="evaluate"?evaluateInput(f):mutation==="confirm"?confirmation(f,p):{...confirmation(f,p),version:"dismiss-prompt.v1",reason:"Fictional reason"}; return {f,raw,session:mutation==="importMaterials"?f.sessions.finance!:f.sessions.supervisor!};}
  it("replaying a command id returns the first result, never the job's current state",async()=>{const {f,raw,session}=await prepare();const first=await repo[mutation](session,raw);await repo.evaluate(f.sessions.supervisor!,evaluateInput(f));expect(await repo[mutation](session,raw)).toEqual(first);});
  it("the same command id with a changed payload conflicts",async()=>{const {raw,session}=await prepare();await repo[mutation](session,raw);const changed=mutation==="importMaterials"?{...raw,quantity:"101"}:mutation==="evaluate"?{...raw,jobId:randomUUID()}:{...raw,promptHash:"0".repeat(64)};await expect(repo[mutation](session,changed)).rejects.toBeDefined();});
  it("the same command id on another job conflicts",async()=>{const {f,raw,session}=await prepare();await repo[mutation](session,raw);const job=await secondJob(c,f);await expect(repo[mutation](session,{...raw,jobId:job.jobId})).rejects.toMatchObject({code:"PROMPT_CONFLICT"});});
  it("a successful no-op keeps its identity",async()=>{const {f,raw,session}=await prepare();const first=await repo[mutation](session,raw),before=await counts(f);expect(await repo[mutation](session,raw)).toEqual(first);expect(await counts(f)).toEqual(before);});
  it("a not-live contractor job is refused with JOB_NOT_LIVE and nothing is written",async()=>{const {f,raw,session}=await prepare();await moveOffLive(c,f);const before=await counts(f);await expect(repo[mutation](session,raw)).rejects.toMatchObject({code:"JOB_NOT_LIVE"});expect(await counts(f)).toEqual(before);});
  it("an unauthorised caller gets the identical EXTRA_FORBIDDEN for an unknown job, a foreign job, a not-live job and a live job",async()=>{const {f,raw}=await prepare(),foreign=await promptFixture(c),closed=await secondJob(c,f);await moveOffLive(c,f,"invoiced",closed.jobId);const before=await counts(f);for(const jobId of [randomUUID(),foreign.jobId,closed.jobId,f.jobId]) await expect(repo[mutation](f.sessions.admin!,{...raw,jobId})).rejects.toMatchObject({code:"EXTRA_FORBIDDEN",message:"EXTRA_FORBIDDEN"});expect(await counts(f)).toEqual(before);});
 });
});
