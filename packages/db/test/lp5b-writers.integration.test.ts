import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { VariationRepository } from "../src/variation-repository.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { beginRepositoryCommand, completeRepositoryCommand } from "../src/repository-command.js";
import { withTenant } from "../src/tenant-context.js";

// Actual PostgreSQL caller contracts. This suite is executed by CI; the build
// sandbox cannot start PostgreSQL. Existing replay and lock suites remain intact.
const h = createWatchdogHarness("lp5b-writers", 62800);
beforeAll(() => h.boot(), 300_000);
afterAll(() => h.stop());
const capture = (jobId: string, actorMembershipId: string, review: boolean) => ({
  version: review ? "final-review-extra.v1" : "log-builder-extra.v1", actorMembershipId,
  proposal: { version: "variation-proposal.v1", id: randomUUID(), jobId, scopeItemId: randomUUID(),
    existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: "Fictional additional shelf",
    description: "Fictional additional shelf", suggestion: null },
  price: null, deviceId: null, deviceCapturedAt: null,
});
const receipt = async (id: string) => (await h.admin.query(
  "SELECT status,result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [h.tenant, id])).rows;
const lifecycleCount = async (id: string) => Number((await h.admin.query(
  "SELECT count(*) n FROM app.command_lifecycle_claim WHERE tenant_id=$1 AND command_id=$2", [h.tenant, id])).rows[0].n);

type Caller = { type: string; prepare(): Promise<{ jobId: string; commandId: string; legacy: object;
  run(changed?: boolean): Promise<unknown>; expected: object; actor: string }> };
const captureCaller = (review: boolean): Caller => ({
  type: review ? "AddFinalReviewExtra" : "LogBuilderExtra",
  async prepare() {
    const jobId = await h.live(), input = capture(jobId, h.member, review), repo = new VariationRepository(h.runtime);
    const run = (changed = false) => repo[review ? "addFinalReviewExtra" : "logBuilderExtra"](h.ctx,
      changed ? { ...input, proposal: { ...input.proposal, captureText: "Changed fictional request" } } : input);
    return { jobId, commandId: input.proposal.id, legacy: input, run, actor: h.member, expected: { variationId: input.proposal.id } };
  },
});
const callers: Caller[] = [captureCaller(false), captureCaller(true), {
  type: "job.parties",
  async prepare() {
    const jobId = randomUUID(), commandId = randomUUID(), repo = new JobPartiesRepository(h.runtime);
    await h.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional party workspace','quoting')", [h.tenant, jobId]);
    const input = { version: "job-parties-command.v1", commandId, action: "create_customer",
      customer: { version: "customer.v1", type: "person", name: "Fictional customer", email: "person@example.invalid", phone: "00000000000" } };
    return { jobId, commandId, actor: h.member, legacy: { jobId, input },
      expected: { version: "job-parties-command-result.v1", environment: "synthetic_demo", commandId, revision: 1, realExternalActions: 0 },
      run: (changed = false) => repo.command(h.ctx, h.member, jobId,
        changed ? { ...input, customer: { ...input.customer, name: "Changed fictional customer" } } : input) };
  },
}, {
  type: "proof.complete",
  async prepare() {
    const jobId = await h.live(), commandId = randomUUID();
    await h.pre.evidence(jobId);
    // Proof has always permitted an active member; converting it must not make
    // it owner-only. A different actor is reserved for this path in the harness.
    await h.admin.query("UPDATE app.membership SET role='member' WHERE tenant_id=$1 AND id=$2", [h.tenant, h.otherMember]);
    const input = { version: "proof.complete.v1", commandId, actorMembershipId: h.otherMember, jobId,
      scopeItemId: h.st(jobId).scope, stage: "electrical-stage", evidenceId: h.st(jobId).upload.id,
      requiredEvidenceType: "electrical_certificate", decisionId: null };
    return { jobId, commandId, actor: h.otherMember, legacy: input,
      expected: { evidenceId: input.evidenceId, state: "complete", decisionId: null },
      run: (changed = false) => h.repos.proof.complete(h.ctx, changed ? { ...input, stage: "changed-stage" } : input) };
  },
}];

describe.each(callers)("LP-5b $type complete caller", caller => {
  it("commits its result, returns that exact first result on replay, conflicts on reuse, and refuses revoked replay", async () => {
    const c = await caller.prepare(), first = await c.run();
    expect(first).toMatchObject(c.expected);
    expect(await receipt(c.commandId)).toEqual([{ status: "succeeded", result: first }]);
    expect(await lifecycleCount(c.commandId)).toBe(1);
    expect(await c.run()).toEqual(first);
    await expect(c.run(true)).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    const before = await receipt(c.commandId);
    await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [h.tenant, c.actor]);
    try {
      await expect(c.run()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await receipt(c.commandId)).toEqual(before);
    } finally {
      await h.admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [h.tenant, c.actor]);
    }
  });
  it("refuses an unknown type and refuses completion without the writer's business effect", async () => {
    const c = await caller.prepare(), commandId = randomUUID();
    const legacy=JSON.parse(JSON.stringify(c.legacy)) as Record<string,any>;
    if("commandId" in legacy)legacy.commandId=commandId;
    if(legacy.input?.commandId)legacy.input.commandId=commandId;
    if("actorMembershipId" in legacy)legacy.actorMembershipId=h.member;
    const begin = (type: string) => withTenant(h.runtime, h.ctx, async db => {
      const claim=await beginRepositoryCommand(db, { tenantId: h.tenant, actorMembershipId: h.member, commandId,
        commandType: type, semanticKey: ["LogBuilderExtra","AddFinalReviewExtra"].includes(caller.type)?`extra-origin:${c.jobId}:${commandId}`:commandId, jobId: c.jobId, legacyJson: JSON.stringify(legacy) });
      expect(claim.kind).toBe("claim");
      return completeRepositoryCommand(db, commandId, { id: randomUUID(), revisionId: randomUUID() });
    });
    await expect(begin(`unknown.${caller.type}`)).rejects.toMatchObject({ message: "AUTHORIZATION_INVALID" });
    await expect(begin(caller.type)).rejects.toMatchObject({ message: "AUTHORIZATION_INVALID" });
    expect(await receipt(commandId)).toEqual([]);
    expect(await lifecycleCount(commandId)).toBe(0);
  });
});

describe("LP-5b job parties result variants", () => {
  it("keeps customer revisions, new/reused sites, binding and correction result contracts through the caller", async () => {
    const jobId = randomUUID(), repo = new JobPartiesRepository(h.runtime);
    await h.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional party variants','quoting')", [h.tenant, jobId]);
    const run = async (action: string, data: Record<string, unknown>) => {
      const input = { version: "job-parties-command.v1", commandId: randomUUID(), action, ...data };
      const first = await repo.command(h.ctx, h.member, jobId, input);
      expect(await repo.command(h.ctx, h.member, jobId, input)).toEqual(first);
      expect(await receipt(input.commandId)).toEqual([{ status: "succeeded", result: first }]);
      return first;
    };
    const customer = { version: "customer.v1", type: "person", name: "Fictional customer", email: "person@example.invalid", phone: "00000000000" };
    const created = await run("create_customer", { customer });
    expect(created).toMatchObject({ revision: 1 });
    expect(created.id).toMatch(/^[a-f0-9-]{36}$/u);
    expect(created.revisionId).toMatch(/^[a-f0-9-]{36}$/u);
    const revised = await run("revise_customer", { customerId: created.id, expectedRevision: 1, customer: { ...customer, name: "Revised fictional customer" } });
    expect(revised).toMatchObject({ id: created.id, revision: 2 });
    expect(revised.revisionId).not.toBe(created.revisionId);
    const site = { version: "site.v1", addressLines: ["14 Fictional Street"], town: "London", postcode: "SW1A 1AA", unit: "Flat 1" };
    const newSite = await run("create_site", { site });
    expect(newSite).toMatchObject({ reused: false });
    const reusedSite = await run("create_site", { site, reuseSiteId: newSite.id, confirmSamePlace: true });
    expect(reusedSite).toMatchObject({ id: newSite.id, revisionId: newSite.revisionId, reused: true });
    const parties = { version: "job-parties.v1", customerRevisionId: revised.revisionId, siteRevisionId: newSite.revisionId };
    const bound = await run("bind", { expectedJobRevision: 0, parties });
    expect(bound).toMatchObject({ revision: 1 });
    const corrected = await run("correct", { expectedJobRevision: 1, parties, reason: "Fictional correction" });
    expect(corrected).toMatchObject({ revision: 2 });
    expect(corrected.id).not.toBe(bound.id);
  });
});

describe.each([false,true])("LP-5b priced capture review=%s",review=>{
  it("keeps the priced caller result and binds its exact commercial revision",async()=>{
    const jobId=await h.live(),input={...capture(jobId,h.member,review),price:{quantity:"1",unit:"item",unitRatePence:12500,
      direction:"addition",confirmedByMembershipId:h.member,rateProvenance:{kind:"human_entered",sourceRef:"fictional-lp5b",
        sourceHash:"a".repeat(64),rateVersion:"synthetic.v1"}}};
    const repo=new VariationRepository(h.runtime),run=(value:unknown)=>repo[review?"addFinalReviewExtra":"logBuilderExtra"](h.ctx,value);
    expect(await run(input)).toEqual({variationId:input.proposal.id});
    expect(await run(input)).toEqual({variationId:input.proposal.id});
    expect((await h.admin.query("SELECT unit_rate_pence,quantity_decimal FROM app.variation_revision WHERE tenant_id=$1 AND variation_id=$2",
      [h.tenant,input.proposal.id])).rows).toEqual([{unit_rate_pence:"12500",quantity_decimal:"1"}]);
    await expect(run({...input,price:{...input.price,unitRatePence:12501}})).rejects.toMatchObject({code:"COMMAND_CONFLICT"});
  });
});

it("LP-5b cannot certify an unrelated reused site through direct lifecycle calls",async()=>{
  const jobId=randomUUID(),repo=new JobPartiesRepository(h.runtime);
  await h.admin.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional site reuse','quoting')",[h.tenant,jobId]);
  const site={version:"site.v1",addressLines:["14 Fictional Street"],town:"London",postcode:"SW1A 1AA",unit:"Flat 1"};
  const created=await repo.command(h.ctx,h.member,jobId,{version:"job-parties-command.v1",commandId:randomUUID(),action:"create_site",site});
  const input={version:"job-parties-command.v1",commandId:randomUUID(),action:"create_site",site:{...site,postcode:"YO1 7EP"},
    reuseSiteId:created.id,confirmSamePlace:true};
  await expect(repo.command(h.ctx,h.member,jobId,input)).rejects.toMatchObject({code:"PARTY_NOT_FOUND"});
  await expect(withTenant(h.runtime,h.ctx,async db=>{
    await beginRepositoryCommand(db,{tenantId:h.tenant,actorMembershipId:h.member,commandId:input.commandId,commandType:"job.parties",
      semanticKey:input.commandId,jobId,legacyJson:JSON.stringify({jobId,input})});
    return completeRepositoryCommand(db,input.commandId,{revisionId:created.revisionId});
  })).rejects.toMatchObject({message:"AUTHORIZATION_INVALID"});
  expect(await receipt(input.commandId)).toEqual([]);
});
