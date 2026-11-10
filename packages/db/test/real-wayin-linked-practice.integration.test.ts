import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { cluster, seedHomeOwner, digestOf, type Cluster, startBeforeMigration } from "./contractor-practice-session-fixtures.js";
import { jobDoorsActor } from "./lp-job-doors-fixtures.js";
import { enterLinkedPracticeCompany, isBlankPracticeCompany, startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession, authorizePracticeJob, issuePracticeSession } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";
const secret = "fictional-linked-identity-key-over-32-characters";
const enter = { version: "linked-practice-company.v1", action: "enter" };
const reset = { ...enter, action: "reset" };
const home = "11111111-1111-4111-8111-111111111111";
let c: Cluster, identity: Pool;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); await seedHomeOwner(c);
  await c.admin.query("CREATE ROLE linked_identity LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_identity TO linked_identity");
  identity = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "linked_identity" });
}, 300_000);
afterAll(async () => { await identity?.end(); await c?.close(); vi.unstubAllEnvs(); });
async function parent(actor?: Awaited<ReturnType<typeof jobDoorsActor>>) {
  const a = actor ?? await jobDoorsActor(c.admin), token = randomUUID(), id = randomUUID();
  // Match provision_verified_challenge: effective memberships require a verified email.
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [`${a.person}@practice.invalid`, a.person]);
  await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [a.person, a.tenant, a.member]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')", [id, a.person, createHmac("sha256", secret).update(`session:${token}`).digest("hex")]);
  return { ...a, token, id };
}
async function entry(p: Awaited<ReturnType<typeof parent>>) {
  const token = await enterLinkedPracticeCompany(identity, p.token, secret, enter);
  return { token, auth: await authenticatePracticeSession(c.runtime, token) };
}
async function job(auth: Awaited<ReturnType<typeof authenticatePracticeSession>>) {
  const id = randomUUID();
  await withTenant(c.runtime, auth.context, db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [home, id, auth.membershipId, auth.digest]));
  return id;
}

it("a verified sign-up owner can enter linked practice without fixture-only context", async () => {
  const { IdentityRepository } = await import("../src/identity-repository.js");
  const { PersistedAuthProvider } = await import("../../../apps/api/src/auth/persisted-auth-provider.js");
  const { FixtureIdentityEmail } = await import("../../../apps/api/src/auth/identity-email.js");
  const provider = new PersistedAuthProvider(new IdentityRepository(identity), secret,
    new FixtureIdentityEmail(), "synthetic_demo", () => Date.now(), () => "12345678");
  const email = `${randomUUID()}@practice.invalid`;
  await provider.requestCode({ email, purpose: "signup", ip: randomUUID() });
  const session = await provider.verifyCode(email, "signup", "12345678");
  const principal = (await provider.authenticate(session.sessionToken))!;
  const memberships = await provider.memberships(principal);
  expect(memberships).toHaveLength(1);
  expect(memberships[0]!.role).toBe("owner");
  const token = await enterLinkedPracticeCompany(identity, session.sessionToken, secret, enter);
  await expect(authenticatePracticeSession(c.runtime, token)).resolves.toBeDefined();
});

it("requires the verified email as well as the locator and owner membership", async () => {
  const p = await parent();
  await c.admin.query("DELETE FROM identity.user_email WHERE user_id=$1", [p.person]);
  expect((await identity.query("SELECT * FROM identity.sso_session_memberships($1,$2)", [p.person,p.id])).rows).toEqual([]);
  await expect(entry(p)).rejects.toThrow("UNAUTHENTICATED");
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${p.person}@practice.invalid`,p.person]);
  expect((await identity.query("SELECT id FROM identity.sso_session_memberships($1,$2)", [p.person,p.id])).rows).toEqual([{id:p.member}]);
  await expect(entry(p)).resolves.toBeDefined();
});

it("two fictional identity sessions retain one practice owner with independent credentials", async () => {
  const firstParent = await parent(), secondParent = await parent(firstParent);
  const [first, second] = await Promise.all([entry(firstParent), entry(secondParent)]);
  expect(first.token).not.toBe(second.token);
  expect(first.auth.digest).toBe(second.auth.digest);
  expect(first.auth.digest).not.toBe(digestOf(first.token));
  expect(JSON.stringify(first.auth.context)).toBe(JSON.stringify({ tenantId: home }));
  const retry = await entry(firstParent);
  expect(retry.token).not.toBe(first.token); expect(retry.auth.digest).toBe(first.auth.digest);
  const count = await c.admin.query("SELECT count(*)::int n FROM control_plane.identity_practice_namespace WHERE identity_tenant_id=$1", [firstParent.tenant]);
  expect(count.rows[0].n).toBe(1);
  // All inserts (namespace, first credential, second device, lost-reply retry)
  // precede this assertion: none may generate a sample or home job.
  expect((await c.admin.query("SELECT count(*)::int n FROM app.job WHERE practice_session_digest=ANY($1::text[])", [[first.auth.digest, digestOf(first.token), digestOf(second.token), digestOf(retry.token)]])).rows[0].n).toBe(0);
  const id = await job(first.auth);
  await expect(authorizePracticeJob(c.runtime, second.token, id)).resolves.toBeDefined();
  expect(await isBlankPracticeCompany(c.runtime, digestOf(first.token))).toBe(true);
  expect(await isBlankPracticeCompany(c.runtime, first.auth.digest)).toBe(false);
  expect(await isBlankPracticeCompany(c.runtime, first.auth.digest, first.auth.context)).toBe(true);
  await withTenant(c.runtime, first.auth.context, async db => {
    expect((await db.$client.query("SELECT app.is_blank_practice_company($1) blank", [first.auth.digest])).rows[0].blank).toBe(true);
  });
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [firstParent.id]);
  await expect(authenticatePracticeSession(c.runtime, first.token)).rejects.toThrow("UNAUTHENTICATED");
  await expect(withTenant(c.runtime, first.auth.context, db => db.$client.query("SELECT 1"))).rejects.toThrow("REQUEST_BINDING_REFUSED");
  await expect(authorizePracticeJob(c.runtime, second.token, id)).resolves.toBeDefined();
  expect((await c.admin.query("SELECT count(*)::int n FROM app.job WHERE tenant_id=$1", [firstParent.tenant])).rows[0].n).toBe(0);
});

it.each(["expired_parent", "removed_membership", "revoked_membership", "expired_membership", "non_owner", "multiple_memberships", "contractor_revoked"])("refuses %s at entry, authentication and transaction binding", async state => {
  const p = await parent(), linked = await entry(p);
  if (state === "expired_parent") await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [p.id]);
  if (state === "removed_membership") await c.admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2", [p.person, p.tenant]);
  if (state === "revoked_membership") await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [p.tenant,p.member]);
  if (state === "expired_membership") await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [p.tenant,p.member]);
  if (state === "non_owner") await c.admin.query("UPDATE app.membership SET role='worker' WHERE tenant_id=$1 AND id=$2", [p.tenant,p.member]);
  if (state === "multiple_memberships") {
    const other = await jobDoorsActor(c.admin), member = randomUUID();
    await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [other.tenant, member, other.account, p.person]);
    await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)", [p.person,other.tenant,member]);
  }
  if (state === "contractor_revoked") {
    await c.admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email) VALUES($1,$2,'fictional@practice.invalid')", [p.tenant,p.member]);
    await c.admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)", [p.tenant,randomUUID(),p.member]);
  }
  await expect(entry(p)).rejects.toThrow("UNAUTHENTICATED");
  await expect(authenticatePracticeSession(c.runtime, linked.token)).rejects.toThrow("UNAUTHENTICATED");
  await expect(withTenant(c.runtime, linked.auth.context, db => db.$client.query("SELECT 1"))).rejects.toThrow("REQUEST_BINDING_REFUSED");
});

it("reset requires exact current credential and intent; all old devices and writes refuse until explicit re-entry", async () => {
  const a = await parent(), b = await parent(a), first = await entry(a), second = await entry(b);
  const id = await job(first.auth);
  await expect(enterLinkedPracticeCompany(identity, b.token, secret, reset, first.token)).rejects.toThrow("UNAUTHENTICATED");
  const replacement = await enterLinkedPracticeCompany(identity, a.token, secret, reset, first.token);
  const current = await authenticatePracticeSession(c.runtime, replacement);
  expect(current.digest).not.toBe(first.auth.digest);
  for (const old of [first,second]) {
    await expect(authenticatePracticeSession(c.runtime, old.token)).rejects.toThrow("UNAUTHENTICATED");
    await expect(withTenant(c.runtime, old.auth.context, db => db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)", [home,randomUUID(),old.auth.membershipId,old.auth.digest]))).rejects.toThrow("REQUEST_BINDING_REFUSED");
  }
  await expect(enterLinkedPracticeCompany(identity, a.token, secret, reset, first.token)).rejects.toThrow("UNAUTHENTICATED");
  const resumed = await entry(b); expect(resumed.auth.digest).toBe(current.digest);
  await expect(authorizePracticeJob(c.runtime, resumed.token, id)).rejects.toThrow("NOT_FOUND");
  expect((await c.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1", [id])).rows[0].practice_session_digest).toBe(first.auth.digest);
});

it("rejects canonical-digest credentials, forged GUCs, wrong firms, identity tenants and legacy shortcuts", async () => {
  const p = await parent(), a = await entry(p), stranger = await entry(await parent()), id = await job(a.auth);
  await expect(authorizePracticeJob(c.runtime, stranger.token, id)).rejects.toThrow("NOT_FOUND");
  for (const d of [a.auth.digest, digestOf(randomUUID())]) {
    expect((await c.runtime.query("SELECT * FROM app.authenticate_practice_session($1)", [d])).rows).toEqual([]);
    await expect(c.runtime.query("SELECT app.bind_request('practice',$1,$2)", [d,home])).rejects.toThrow("REQUEST_BINDING_REFUSED");
  }
  await expect(authenticatePracticeSession(c.runtime, a.token, p.tenant)).rejects.toThrow("UNAUTHENTICATED");
  await expect(c.runtime.query("SELECT app.bind_request('real',$1,$2)", [digestOf(a.token),p.tenant])).rejects.toThrow("REQUEST_BINDING_REFUSED");
  const client = await c.runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true),set_config('app.practice_material_digest',$2,true),set_config('app.actor_id',$3,true)", [home,a.auth.digest,a.auth.membershipId]);
    expect((await client.query("SELECT * FROM app.authenticate_practice_session($1)", [a.auth.digest])).rows).toEqual([]);
    await client.query("ROLLBACK");
    await client.query("BEGIN"); await client.query("SELECT app.bind_request('practice',$1,$2)", [digestOf(a.token),home]); await client.query("COMMIT");
    expect((await client.query("SELECT * FROM app.authenticate_practice_session($1)", [a.auth.digest])).rows).toEqual([]);
  } finally { await client.query("ROLLBACK"); client.release(); }
  for (const token of [a.token]) await expect(startBlankPracticeCompany(c.runtime, { version: "blank-practice-company.v1", action: "reset" }, token)).rejects.toThrow("UNAUTHENTICATED");
  for (const digest of [a.auth.digest,digestOf(a.token)]) {
    await expect(c.runtime.query("SELECT app.issue_practice_session($1)", [digest])).rejects.toThrow("UNAUTHENTICATED");
    await expect(c.admin.query("SELECT app.start_blank_practice_company($1,$2)", [digestOf(randomUUID()),digest])).rejects.toThrow("UNAUTHENTICATED");
  }
  await expect(c.runtime.query("SELECT identity.enter_linked_practice($1,$2,$3,NULL)", ["a".repeat(64),digestOf(randomUUID()),enter])).rejects.toThrow(/permission denied/u);
  for (const table of ["identity_practice_namespace","identity_practice_company","identity_practice_credential"]) {
    await expect(c.runtime.query(`SELECT * FROM control_plane.${table}`)).rejects.toThrow(/permission denied/u);
    await expect(identity.query(`SELECT * FROM control_plane.${table}`)).rejects.toThrow(/permission denied/u);
  }
  const anonymous = await issuePracticeSession(c.runtime), legacy = await authenticatePracticeSession(c.runtime, anonymous);
  expect(legacy.digest).toBe(digestOf(anonymous));
  const anonymousJob = await job(legacy);
  await expect(authorizePracticeJob(c.runtime, a.token, anonymousJob)).rejects.toThrow("NOT_FOUND");
});

it("proves the named regression absent before migration and preserves anonymous ownership on upgrade", async () => {
  const old = await startBeforeMigration("0942_identity_linked_practice.sql");
  try {
    const token = await issuePracticeSession(old.runtime), owner = digestOf(token);
    const before = (await old.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [owner])).rows;
    await expect(old.admin.query("SELECT identity.enter_linked_practice($1,$2,$3,NULL)", ["a".repeat(64),"b".repeat(64),enter])).rejects.toMatchObject({ code: "42883" });
    await old.admin.query(await readFile(new URL("../migrations/0942_identity_linked_practice.sql", import.meta.url), "utf8"));
    expect((await authenticatePracticeSession(old.runtime, token)).digest).toBe(owner);
    expect((await old.admin.query("SELECT row_to_json(j) value FROM app.job j WHERE practice_session_digest=$1 ORDER BY id", [owner])).rows).toEqual(before);
  } finally { await old.close(); }
}, 300_000);

it("uses linked credentials for quote preview/send and acceptance and retains Final Check and invoice guards", async () => {
  const { QuoteRepository, QuoteDeliveryRepository, UserCommandDispatcher, RecordBuilderAcceptanceMutation } = await import("../src/index.js");
  const first = await entry(await parent()), second = await entry(await parent()), id = await job(first.auth);
  const scope = randomUUID(), revision = randomUUID();
  await withTenant(c.runtime, first.auth.context, async db => {
    await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope,home,id]);
    await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional paint','1','item',10000,10000)", [revision,home,id,scope]);
  });
  await new QuoteRepository(c.runtime).saveDraft(first.auth.context, {
    jobId:id,draftId:randomUUID(),expectedRevision:0,currency:"GBP",taxPolicyVersion:"candidate_m1_standard_v1",
    blockingQuestions:[],effectiveAt:new Date(),lines:[{
      id:randomUUID(),scopeItemId:scope,scopeRevisionId:revision,description:"Fictional paint",origin:"captured",
      included:true,exclusionReason:null,quantity:"1",unit:"item",unitRatePence:10000,discountPercent:"0",
      taxTreatment:"standard_rate_20",rateProvenance:"entered",category:"Decorating",region:"London",
    }],
  });
  const quotes = new QuoteDeliveryRepository(c.runtime), preview = await quotes.preview(first.auth.context,id,"customer@example.invalid");
  const sent = await quotes.issue(first.auth.context,id,{commandId:randomUUID(),documentId:preview.documentId,contentHash:preview.hash,recipient:"customer@example.invalid"});
  expect(sent).toMatchObject({status:"queued",effects:{realExternalActions:0}});
  const document = preview.document;
  await new UserCommandDispatcher(c.runtime).dispatch(first.auth.context,{
    version:"command.v1",commandId:randomUUID(),commandType:"quote.acceptance.attest",semanticKey:`accept:${preview.documentId}`,
    actorMembershipId:first.auth.membershipId,subjectType:"quote_document",subjectRef:preview.documentId,
    action:{actionType:"quote.acceptance.attest",recipient:"Fictional Customer",contentHash:preview.hash,
      aggregateRevision:document.documentVersion,amountPence:document.totalPence,currency:"GBP",policyVersion:"builder-attestation.v1",expiresAt:new Date(Date.now()+60_000)},
  },new RecordBuilderAcceptanceMutation(home,{
    version:"quote-acceptance.v1",acceptanceId:randomUUID(),jobId:id,documentId:preview.documentId,
    documentVersion:document.documentVersion,documentHash:preview.hash,expectedJobRevision:0,
    acceptedTotalPence:document.totalPence,acceptedAt:new Date(),statedCustomerName:"Fictional Customer",statedMethod:"email",evidenceId:null,
  }));
  expect((await c.admin.query("SELECT status,practice_session_digest FROM app.job WHERE id=$1", [id])).rows[0]).toEqual({status:"accepted",practice_session_digest:first.auth.digest});
  await withTenant(c.admin, first.auth.context, async db => {
    await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [first.auth.digest]);
    await db.$client.query("SELECT app.final_check_require_invoice_actor($1,$2,$3)", [home,id,first.auth.membershipId]);
  });
  await expect(withTenant(c.admin, second.auth.context, async db => {
    await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [first.auth.digest]);
    await db.$client.query("SELECT app.final_check_require_invoice_actor($1,$2,$3)", [home,id,second.auth.membershipId]);
  })).rejects.toThrow("FORBIDDEN");
  await expect(withTenant(c.runtime, first.auth.context, async db => {
    await db.$client.query("SELECT set_config('app.practice_material_digest',$1,true)", [first.auth.digest]);
    await db.$client.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7)", [home,id,randomUUID(),first.auth.membershipId,randomUUID(),"customer@example.invalid","2026-11-10"]);
  })).rejects.toThrow("STALE_OR_BLOCKED_FINAL_ACCOUNT");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [home,id])).rows[0].n).toBe(0);
});

it("bounds binding expiry by parent, membership and credential and refuses expired or revoked credentials", async () => {
  const p = await parent();
  await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()+interval '10 minutes' WHERE tenant_id=$1 AND id=$2", [p.tenant,p.member]);
  const linked = await entry(p);
  await withTenant(c.admin, linked.auth.context, async db => {
    const row = (await db.$client.query(`SELECT b.expires_at<=s.expires_at AND b.expires_at<=m.expires_at
      AND b.expires_at<=credential.expires_at bounded
      FROM control_plane.request_binding b
      JOIN identity.session s ON s.id=$1
      JOIN app.membership m ON (m.tenant_id,m.id)=($2,$3)
      JOIN control_plane.practice_session credential ON credential.token_digest=$4
      WHERE b.transaction_id=pg_current_xact_id()`, [p.id,p.tenant,p.member,digestOf(linked.token)])).rows[0];
    // The protected binding uses the synthetic tenant; only the superuser fixture
    // inspects the separate identity membership for this expiry assertion.
    expect(row).toEqual({bounded:true});
  });
  await c.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digestOf(linked.token)]);
  await expect(authenticatePracticeSession(c.runtime,linked.token)).rejects.toThrow("UNAUTHENTICATED");
  const another = await entry(p);
  await c.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digestOf(another.token)]);
  await expect(authenticatePracticeSession(c.runtime,another.token)).rejects.toThrow("UNAUTHENTICATED");
});
