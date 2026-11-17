// The owning enterprise agreement/completion interfaces are absent. These refusals are NOT positive completion evidence.
// NOT RUN locally: PostgreSQL execution belongs to CI.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EnterpriseLivePromptRepository } from "../src/enterprise-live-prompt-repository.js";
import { SiteVisitRepository } from "../src/site-visit-repository.js";
import { cluster, promptFixture } from "./enterprise-live-prompt-fixtures.js";
import { startInput, completeInput } from "./site-visit-fixtures.js";
vi.setConfig({testTimeout:90000,hookTimeout:120000});
let c:Awaited<ReturnType<typeof cluster>>, repo:EnterpriseLivePromptRepository;
beforeAll(async()=>{vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");c=await cluster();repo=new EnterpriseLivePromptRepository(c.runtime);});
afterAll(async()=>{await c?.close();vi.unstubAllEnvs();});
describe('authoritative job completion dependency fence',()=>{
 it.each(['missing','disabled','wrong-version'] as const)('%s agreement cannot authorize an end check',async scenario=>{
  const f=await promptFixture(c);
  const before=(await c.admin.query('SELECT count(*)::int n FROM app.extra_prompt WHERE tenant_id=$1',[f.p.tenantId])).rows[0]!.n;
  await expect(repo.endCheck(f.sessions.owner!,{version:'end-check.v1',commandId:randomUUID(),jobId:f.jobId,...(scenario==='missing'?{}:{agreementVersionId:randomUUID()}),completionEventId:randomUUID()})).rejects.toMatchObject({code:'PROMPT_END_CHECK_HELD'});
  expect((await c.admin.query('SELECT count(*)::int n FROM app.extra_prompt WHERE tenant_id=$1',[f.p.tenantId])).rows[0]!.n).toBe(before);
 });
 it('a completed visit cannot substitute for authoritative job completion',async()=>{
  const f=await promptFixture(c),visits=new SiteVisitRepository(c.runtime),actor=f.members.operative.member;
  const start=await visits.startVisit(f.ctx,actor,startInput(f));
  await visits.completeVisit(f.ctx,actor,completeInput(f,start.visitId,'no'));
  await expect(repo.endCheck(f.sessions.owner!,{version:'end-check.v1',commandId:randomUUID(),jobId:f.jobId,agreementVersionId:randomUUID(),completionEventId:start.visitId})).rejects.toMatchObject({code:'PROMPT_END_CHECK_HELD'});
  expect((await c.admin.query("SELECT status FROM app.job WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.jobId])).rows[0]!.status).toBe('live');
 });
 // Required positive command-backed completion test cannot be written against a fabricated completion seam.
 // The builder receipt holds this acceptance item until the owning agreement and owner-completion commands merge.
});
