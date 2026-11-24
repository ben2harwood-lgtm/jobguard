import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { Pool } from "../../packages/db/node_modules/pg/esm/index.mjs";
import { createIdentityApplication } from "../../apps/api/dist/auth/index.js";
import { DEMO_TENANT_ID, authenticatePracticeSession, withTenant } from "../../packages/db/dist/index.js";
import { embeddedSystemId, storageData, verifyDatabaseTarget } from "./local-targets.mjs";
import { migrationUrl, validateSettings } from "./settings.mjs";

const { settings } = validateSettings({});
const origin = settings.AUTH_ALLOWED_ORIGIN;
const backend = process.env.JOBGUARD_V2_BACKEND ?? "docker";
const embedded = backend === "embedded";
const systemId = embedded ? embeddedSystemId() : process.env.JOBGUARD_V2_TEST_SYSTEM_ID;
const authSecret = readFileSync(new URL("../../.jobguard/v2-auth-secret", import.meta.url), "utf8");
const admin = new Pool({ connectionString: migrationUrl, max: 1 });
const runtime = new Pool({ connectionString: settings.DATABASE_URL, max: 1 });
const identity = createIdentityApplication({ ...settings, AUTH_CODE_SECRET: authSecret });

async function request(path, { body, cookies, csrf } = {}) {
  return fetch(origin + path, {
    headers: { origin, "content-type": "application/json", ...(cookies && { cookie: cookies }),
      ...(csrf && { "x-csrf-token": csrf }) },
    ...(body && { method: "POST", body: JSON.stringify(body) }),
  });
}

async function json(response, status = 200) {
  const body = await response.json();
  assert.equal(response.status, status, body.code ?? response.statusText);
  return body;
}

async function signIn(localPart) {
  const input = { email: localPart + "@jobguard-v2.invalid", purpose: "signin" };
  const { fixtureCode } = await json(await request("/api/auth/request", {
    body: { version: "identity-request.v1", ...input },
  }));
  const response = await request("/api/auth/verify", {
    body: { version: "identity-verify.v1", ...input, code: fixtureCode },
  });
  const { csrfToken } = await json(response);
  const signedIn = response.headers.getSetCookie()[0].split(";", 1)[0];
  const { memberships } = await json(await request("/api/auth/session", { cookies: signedIn }));
  assert.equal(memberships.length, 1);
  assert.equal(memberships[0].role, "owner");
  const practice = await request("/api/auth/practice", {
    cookies: signedIn, csrf: csrfToken, body: { version: "linked-practice-company.v1", action: "enter" },
  });
  await json(practice);
  const sessionCookie = practice.headers.getSetCookie().find(cookie => cookie.startsWith("jg_session="));
  return {
    cookies: [signedIn, ...practice.headers.getSetCookie().map(cookie => cookie.split(";", 1)[0])].join("; "),
    sessionId: sessionCookie.split(";", 1)[0].slice("jg_session=".length),
    realContext: await identity.context({ sessionToken: signedIn.slice("jobguard_session=".length),
      requestedTenantId: memberships[0].tenantId, csrfToken, origin }),
  };
}

const jobsPath = "/api/jobs?tenantId=" + DEMO_TENANT_ID;
const counts = async () => (await admin.query(`SELECT
  (SELECT count(*)::int FROM identity.user_email) AS identities,
  (SELECT count(*)::int FROM control_plane.identity_practice_company) AS firms,
  (SELECT count(*)::int FROM app.job) AS jobs,
  (SELECT count(*)::int FROM app.customer) AS customers,
  (SELECT count(*)::int FROM app.merchant) AS merchants,
  (SELECT count(*)::int FROM app.job_party_binding) AS bindings,
  (SELECT count(*)::int FROM app.material_requirement) AS materials,
  (SELECT count(*)::int FROM app.quote_revision) AS revisions,
  (SELECT count(*)::int FROM app.quote_document_version) AS documents,
  (SELECT count(*)::int FROM app.quote_acceptance) AS acceptances,
  (SELECT count(*)::int FROM app.action_outbox) AS sends`)).rows[0];

let jobId, owner, other;
before(async () => {
  await verifyDatabaseTarget(admin, systemId, embedded);
  const proposals = await admin.query(`SELECT job_id, model FROM app.job_record_proposal`);
  assert.equal(proposals.rowCount, 1);
  assert.equal(proposals.rows[0].model, "fixture-capture-v1");
  jobId = proposals.rows[0].job_id;
});
after(async () => Promise.all([admin.end(), runtime.end(), identity.provider.repository.pool.end()]));

test("a fresh owner session reloads the fictional job, both work areas and the exact acceptance", async () => {
  owner = await signIn("builder");
  const { cookies } = owner;
  const first = await json(await request(jobsPath, { cookies }));
  const second = await json(await request(jobsPath, { cookies }));
  assert.deepEqual(second, first);
  assert.equal(first.jobs.length, 1);
  assert.equal(first.jobs[0].id, jobId);
  assert.match(first.jobs[0].title, /Occupied-home kitchen splashback and hall decorating/u);

  const path = `/api/jobs/${jobId}`;
  const capture = await json(await request(path + "/proposal", { cookies }));
  assert.deepEqual(capture.review.lines.map(line => line.room).sort(), ["Hall decorating", "Kitchen splashback"]);
  assert.match(capture.source.text, /tiler@jobguard-v2\.invalid/u);
  assert.match(capture.source.text, /decorator@jobguard-v2\.invalid/u);
  const parties = await json(await request(path + "/parties", { cookies }));
  assert.equal(parties.current.customer.email, "customer@jobguard-v2.invalid");
  const material = await json(await request(path + "/materials", { cookies }));
  assert.equal(material.materials[0].merchant, "Fictional Teacup Tile Merchant");
  const delivery = await json(await request(path + "/quotes/delivery", { cookies }));
  assert.equal(delivery.status, "simulated_delivery");
  assert.equal(delivery.effects.realExternalActions, 0);
  const accepted = await json(await request(path + "/quotes/acceptance", { cookies }));
  assert.deepEqual(await json(await request(path + "/quotes/acceptance", { cookies })), accepted);
  assert.equal(accepted.jobStatus, "accepted");
  assert.equal(accepted.activeAcceptance.documentId, accepted.currentDocument.id);
  assert.equal(accepted.activeAcceptance.documentVersion, accepted.currentDocument.version);
  assert.equal(accepted.activeAcceptance.documentHash, accepted.currentDocument.hash);
  assert.equal(accepted.activeAcceptance.totalPence, accepted.currentDocument.totalPence);
  assert.deepEqual(accepted.effects, { platformObligations: 0, settlements: 0, recoveryFees: 0 });
  assert.equal((await request(`/jobs/${jobId}/work`, { cookies })).status, 200);
});

test("the checked bootstrap reruns without duplicating or delivering anything", async () => {
  const before = await counts();
  assert.deepEqual(before, { identities: 2, firms: 2, jobs: 1, customers: 1, merchants: 1,
    bindings: 1, materials: 1, revisions: 1, documents: 1, acceptances: 1, sends: 1 });
  const targets = Object.fromEntries(Object.entries(settings).filter(([key]) =>
    key !== "MIGRATION_DATABASE_URL" && !(embedded && key.startsWith("S3_"))));
  const result = spawnSync(process.execPath, ["tools/v2/bootstrap.mjs", systemId, backend], {
    env: { PATH: process.env.PATH, ...targets, JOBGUARD_LOCAL_V2: "1", JOBGUARD_V2_BACKEND: backend,
      ...(embedded && { JOBGUARD_V2_STORAGE_DIR: storageData }),
      NODE_OPTIONS: "--import=./tools/v2/network.mjs" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`${origin}/jobs/${jobId}/work#quote`));
  assert.doesNotMatch(result.stdout, /v2\.delivery\.captured/u);
  assert.deepEqual(await counts(), before);
});

test("the second firm's fresh session cannot list or open the job, and forced RLS hides its rows", async () => {
  other = await signIn("second-builder");
  const { cookies, realContext, sessionId } = other;
  assert.deepEqual((await json(await request(jobsPath, { cookies }))).jobs, []);
  for (const suffix of ["proposal", "quotes", "quotes/acceptance"]) {
    assert.deepEqual(await json(await request(`/api/jobs/${jobId}/${suffix}`, { cookies }), 404),
      { code: "NOT_FOUND" });
  }
  assert.notEqual(realContext.tenantId, DEMO_TENANT_ID);
  const { context } = await authenticatePracticeSession(runtime, sessionId);
  const { rows: [runtimeRole] } = await runtime.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user",
  );
  assert.deepEqual(runtimeRole, { rolsuper: false, rolbypassrls: false });
  for (const scope of [realContext, context]) {
    await withTenant(runtime, scope, async db => {
      const tables = ["app.job", "app.quote_acceptance", "app.quote_document_version", "app.job_record_proposal", "app.capture_source"];
      const { rows } = await db.$client.query(`SELECT relrowsecurity AND relforcerowsecurity AS forced
        FROM pg_class WHERE oid=ANY($1::regclass[])`, [tables]);
      assert.equal(rows.length, tables.length);
      assert.ok(rows.every(row => row.forced));
      for (const [table, column, value] of [
        ["app.job", "id", jobId],
        ["app.quote_acceptance", "job_id", jobId],
        ["app.quote_document_version", "job_id", jobId],
        ["app.job_record_proposal", "job_id", jobId],
        ["app.capture_source", "id", "e2020000-0000-4000-8000-000000000001"],
      ]) {
        assert.equal((await db.$client.query(`SELECT id FROM ${table} WHERE ${column}=$1`, [value])).rowCount, 0, table);
      }
      const permission = await db.$client.query("SELECT has_column_privilege(current_user,'app.job','title','UPDATE') allowed");
      if (permission.rows[0].allowed) {
        assert.equal((await db.$client.query("UPDATE app.job SET title=title WHERE id=$1", [jobId])).rowCount, 0);
      }
    });
  }
});

// V2-K6A: routing, atomic intake/audit and firm isolation on the real V2 seed.
// Reuse the full suite's owner and second-firm sessions; do not request more codes.
test("K6A forwards fixtures, holds real files, replays once and isolates both firms", async t => {
  const previousV2=process.env.JOBGUARD_LOCAL_V2;
  process.env.JOBGUARD_LOCAL_V2="1";
  t.after(()=>{if(previousV2===undefined)delete process.env.JOBGUARD_LOCAL_V2;else process.env.JOBGUARD_LOCAL_V2=previousV2;});
  const { randomUUID } = await import("node:crypto");
  const { V2InboundMailRepository } = await import("../../packages/db/dist/index.js");
  const { createWorkspaceApplication } = await import("../../apps/api/dist/workspace/index.js");
  assert.ok(owner && other, "reuse the suite's authenticated owner and second-firm sessions");
  const auth = await authenticatePracticeSession(runtime,owner.sessionId);
  const second = await authenticatePracticeSession(runtime,other.sessionId);
  const repo = new V2InboundMailRepository(runtime);
  const workspace = createWorkspaceApplication({pool:runtime,sessionId:owner.sessionId});
  await workspace.quote.activate(jobId,{version:"practice-activation-command.v1",commandId:randomUUID(),scenario:"no_charge"});
  const command = fields => ({version:"v2-inbound-mail.v1",commandId:randomUUID(),expectedVersion:0,...fields});
  const events = async id => (await admin.query(`SELECT * FROM app.audit_event WHERE event_type LIKE 'v2.inbound.%'
    AND payload->'references'->>'commandId'=$1`,[id])).rows;
  async function failsAtomically(input, action, verify) {
    const beforeAudit=(await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[auth.context.tenantId])).rows[0].n;
    // UUID is generated locally above; no message text enters this SQL.
    await admin.query(`CREATE FUNCTION app.k6_fail_one() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.command_id='${input.commandId}'::uuid THEN RAISE EXCEPTION 'K6_FORCED_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER k6_fail_one BEFORE UPDATE ON app.v2_inbound_command FOR EACH ROW EXECUTE FUNCTION app.k6_fail_one()`);
    try {
      await assert.rejects(action(),/K6_FORCED_FAILURE/);
      assert.equal((await events(input.commandId)).length,0);
      assert.equal((await admin.query("SELECT * FROM app.v2_inbound_command WHERE command_id=$1",[input.commandId])).rowCount,0);
      assert.equal((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[auth.context.tenantId])).rows[0].n,beforeAudit);
      await verify();
    } finally { await admin.query("DROP TRIGGER k6_fail_one ON app.v2_inbound_command; DROP FUNCTION app.k6_fail_one()"); }
  }
  const addressCommand = command({});
  await failsAtomically(addressCommand,()=>repo.address(auth,addressCommand),async()=>{
    assert.equal((await repo.view(auth)).address,null);
  });
  const { address } = await repo.address(auth,addressCommand);
  assert.deepEqual(await repo.address(auth,addressCommand),{address});
  assert.equal((await events(addressCommand.commandId)).length,1);
  const { address: otherAddress } = await repo.address(second,command({}));
  assert.notEqual(otherAddress,address);
  const receive = fields => command({recipient:address,messageId:randomUUID(),sender:"merchant@jobguard-v2.invalid",
    subject:`Invoice ${jobId}`,body:"",fixtureId:"materials-B-invoice",...fields});
  const forward = receive({});
  const filed = await repo.receive(auth,forward);
  assert.equal(filed.state,"filed");
  assert.deepEqual(await repo.receive(auth,forward),filed);
  assert.equal((await repo.receive(auth,{...forward,commandId:randomUUID()})).duplicate,true);
  await assert.rejects(repo.receive(auth,{...forward,subject:"changed"}),/IDEMPOTENCY_CONFLICT/);
  await assert.rejects(repo.receive(auth,{...forward,commandId:randomUUID(),body:"changed"}),/IDEMPOTENCY_CONFLICT/);
  assert.equal((await events(forward.commandId)).length,1);
  const event=(await events(forward.commandId))[0];
  assert.equal(event.actor_ref,`membership:${auth.membershipId}`);
  assert.equal(event.event_type,"v2.inbound.received");
  assert.equal(event.payload.references.commandId,forward.commandId);
  assert.equal(Object.hasOwn(event.payload.references,"version"),false);
  const original = (await admin.query(`SELECT i.channel,i.fixture_id,d.id FROM app.supplier_document_intake i
    JOIN app.supplier_document d ON(d.tenant_id,d.job_id,d.id)=(i.tenant_id,i.job_id,i.document_id)
    WHERE i.document_id=$1`,[filed.documentId])).rows;
  assert.equal(original.length,1);assert.equal(original[0].channel,"fixture_mail");
  assert.equal(original[0].fixture_id,"materials-B-invoice");
  const documents=await workspace.supplierDocuments.view(jobId);
  assert.ok(documents.state.facts.some(fact=>fact.document_id===filed.documentId));
  assert.equal((await workspace.supplierMatches.view(jobId)).environment,"synthetic_demo");
  const waiting=await repo.receive(auth,receive({sender:"unknown@jobguard-v2.invalid"}));
  assert.equal(waiting.state,"needs_job");
  // An explicit unrecognised reference must never fall back to the supplier.
  assert.equal((await repo.receive(auth,receive({subject:`Invoice ${randomUUID()}`}))).state,"needs_job");
  assert.equal((await repo.receive(auth,receive({attachments:[{name:"real.pdf"}]}))).state,"needs_k6b");
  const noFixture=receive({});delete noFixture.fixtureId;
  const held=await repo.receive(auth,noFixture);assert.equal(held.state,"needs_k6b");
  await assert.rejects(repo.command(auth,command({action:"file",itemId:held.itemId,jobId})),/NEEDS_K6B/);
  const manual=command({action:"file",itemId:waiting.itemId,jobId});
  await failsAtomically(manual,()=>repo.command(auth,manual),async()=>{
    assert.equal((await repo.view(auth)).items.find(item=>item.id===waiting.itemId).state,"needs_job");
  });
  await repo.command(auth,manual);await repo.command(auth,manual);
  assert.equal((await events(manual.commandId)).length,1);
  const dismiss=command({action:"dismiss",itemId:held.itemId});
  await failsAtomically(dismiss,()=>repo.command(auth,dismiss),async()=>{
    assert.equal((await repo.view(auth)).items.find(item=>item.id===held.itemId).state,"needs_k6b");
  });
  await repo.command(auth,dismiss);await repo.command(auth,dismiss);
  assert.equal((await events(dismiss.commandId)).length,1);
  await assert.rejects(repo.receive(second,receive({})),/NOT_FOUND/);
  await assert.rejects(repo.receive(auth,receive({recipient:otherAddress})),/NOT_FOUND/);
  assert.deepEqual((await repo.view(second)).items,[]);
  await assert.rejects(repo.command(second,command({action:"file",itemId:waiting.itemId,jobId})),/NOT_FOUND/);
  const firm=(await admin.query("SELECT firm_key FROM app.v2_inbound_address WHERE address=$1",[address])).rows[0].firm_key;
  await withTenant(runtime,second.context,async db=>{
    for(const table of ["v2_inbound_address","v2_inbound_item","v2_inbound_command"]){
      assert.equal((await db.$client.query(`SELECT * FROM app.${table} WHERE firm_key=$1`,[firm])).rowCount,0);
      assert.equal((await db.$client.query(`SELECT relrowsecurity AND relforcerowsecurity forced FROM pg_class WHERE oid=$1::regclass`,[`app.${table}`])).rows[0].forced,true);
      assert.equal((await db.$client.query(`SELECT has_table_privilege(current_user,$1,'DELETE') allowed`,[`app.${table}`])).rows[0].allowed,false);
      for(const verb of ["UPDATE","DELETE"]) {
        if(verb==="UPDATE" && table==="v2_inbound_item")continue;
        await db.$client.query("SAVEPOINT k6_boundary");
        const statement=verb==="DELETE"?`DELETE FROM app.${table} WHERE firm_key=$1`:
          table==="v2_inbound_address"?"UPDATE app.v2_inbound_address SET address=address WHERE firm_key=$1":
          "UPDATE app.v2_inbound_command SET result=result WHERE firm_key=$1";
        if(table==="v2_inbound_address"&&verb==="UPDATE" || verb==="DELETE") await assert.rejects(db.$client.query(statement,[firm]),/permission denied/);
        else assert.equal((await db.$client.query(statement,[firm])).rowCount,0);
        await db.$client.query("ROLLBACK TO SAVEPOINT k6_boundary");
      }
    }
    assert.equal((await db.$client.query("UPDATE app.v2_inbound_item SET state='dismissed' WHERE firm_key=$1",[firm])).rowCount,0);
    for(const statement of [
      "INSERT INTO app.v2_inbound_address(tenant_id,firm_key,address,created_by) VALUES($1,$2,'cross-firm@jobguard-v2.invalid',$3)",
      "INSERT INTO app.v2_inbound_command(tenant_id,firm_key,command_id,request_hash,result) VALUES($1,$2,$3,repeat('a',64),'{}'::jsonb)",
    ]) {
      await db.$client.query("SAVEPOINT k6_foreign_insert");
      await assert.rejects(db.$client.query(statement,[auth.context.tenantId,firm,auth.membershipId]),/row-level security/);
      await db.$client.query("ROLLBACK TO SAVEPOINT k6_foreign_insert");
    }
    await db.$client.query("SAVEPOINT k6_insert");
    await assert.rejects(db.$client.query(`INSERT INTO app.v2_inbound_item(tenant_id,firm_key,id,message_id,message_hash,sender,subject,state)
      VALUES($1,$2,$3,'cross-firm',$4,'unknown@jobguard-v2.invalid','cross firm','needs_job')`,[auth.context.tenantId,firm,randomUUID(),"a".repeat(64)]),/row-level security/);
    await db.$client.query("ROLLBACK TO SAVEPOINT k6_insert");
    await db.$client.query("SAVEPOINT k6_delete");
    await assert.rejects(db.$client.query("DELETE FROM app.v2_inbound_item WHERE firm_key=$1",[firm]),/permission denied/);
    await db.$client.query("ROLLBACK TO SAVEPOINT k6_delete");
  });
  // Force a failure after each domain write, using the command receipt insert
  // finalisation (which precedes appendAuditBatch) as the failure boundary. No row or audit survives.
  await admin.query(`CREATE FUNCTION app.k6_fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.result->>'state' IS NOT NULL THEN RAISE EXCEPTION 'K6_FORCED_FAILURE'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER k6_fail_receipt BEFORE UPDATE ON app.v2_inbound_command FOR EACH ROW EXECUTE FUNCTION app.k6_fail_receipt()`);
  try {
    const failing=receive({messageId:"k6-rollback-"+randomUUID()});
    const before=(await admin.query("SELECT count(*)::int n FROM app.supplier_document_intake WHERE job_id=$1",[jobId])).rows[0].n;
    await assert.rejects(repo.receive(auth,failing),/K6_FORCED_FAILURE/);
    assert.equal((await admin.query("SELECT * FROM app.v2_inbound_item WHERE message_id=$1",[failing.messageId])).rowCount,0);
    assert.equal((await events(failing.commandId)).length,0);
    assert.equal((await admin.query("SELECT count(*)::int n FROM app.supplier_document_intake WHERE job_id=$1",[jobId])).rows[0].n,before);
  } finally {
    await admin.query("DROP TRIGGER k6_fail_receipt ON app.v2_inbound_command; DROP FUNCTION app.k6_fail_receipt()");
  }
  await t.test("an ambiguous known supplier waits without documents or stock changes", async () => {
    const secondJob = randomUUID(), bindingId = randomUUID(), scopeId = randomUUID();
    // Owner-connected fictional prerequisites only; the receive below uses the runtime role.
    await withTenant(admin,auth.context,async db=>{
      await db.$client.query(`INSERT INTO app.job(tenant_id,id,title,practice_session_digest,practice_scenario)
        SELECT tenant_id,$2,'ZZ K6A second merchant job',practice_session_digest,'capture'
        FROM app.job WHERE tenant_id=$1 AND id=$3`,[auth.context.tenantId,secondJob,jobId]);
      await db.$client.query(`INSERT INTO app.job_party_binding(tenant_id,id,job_id,revision,customer_id,
        customer_revision_id,paying_party_id,paying_party_revision_id,site_id,site_revision_id,provenance)
        SELECT b.tenant_id,$2,$3,0,b.customer_id,b.customer_revision_id,b.paying_party_id,
          b.paying_party_revision_id,b.site_id,b.site_revision_id,'backfilled_synthetic_fixture'
        FROM app.job_party_current c JOIN app.job_party_binding b ON(b.tenant_id,b.id)=(c.tenant_id,c.binding_id)
        WHERE c.tenant_id=$1 AND c.job_id=$4`,[auth.context.tenantId,bindingId,secondJob,jobId]);
      await db.$client.query("INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)",
        [auth.context.tenantId,secondJob,bindingId]);
      await db.$client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2",[auth.context.tenantId,secondJob]);
      await db.$client.query("INSERT INTO app.scope_identity(tenant_id,id,job_id,state) VALUES($1,$2,$3,'confirmed')",
        [auth.context.tenantId,scopeId,secondJob]);
      await db.$client.query("SELECT set_config('app.practice_material_digest',practice_session_digest,true) FROM app.job WHERE tenant_id=$1 AND id=$2",
        [auth.context.tenantId,jobId]);
      const requirement = await db.$client.query(`INSERT INTO app.material_requirement(tenant_id,id,job_id,scope_item_id,sku_id,quantity_decimal,unit,revision)
        SELECT r.tenant_id,$2,$3,$4,r.sku_id,'1',r.unit,1
        FROM app.material_requirement r JOIN app.merchant_sku s ON(s.tenant_id,s.id)=(r.tenant_id,r.sku_id)
        JOIN app.merchant m ON(m.tenant_id,m.id)=(s.tenant_id,s.merchant_id)
        WHERE r.tenant_id=$1 AND r.job_id=$5 AND m.name='Fictional Teacup Tile Merchant' LIMIT 1`,
        [auth.context.tenantId,randomUUID(),secondJob,scopeId,jobId]);
      assert.equal(requirement.rowCount,1);
    });
    const beforeView = await repo.view(auth);
    assert.ok([jobId,secondJob].every(id=>beforeView.jobs.some(job=>job.id===id)));
    const documentCounts = async () => (await admin.query(`SELECT
      (SELECT count(*)::int FROM app.supplier_document WHERE tenant_id=$1) AS documents,
      (SELECT count(*)::int FROM app.supplier_document_intake WHERE tenant_id=$1) AS intakes,
      (SELECT count(*)::int FROM app.goods_receipt WHERE tenant_id=$1) AS receipts`,[auth.context.tenantId])).rows[0];
    const beforeDocuments = await documentCounts();
    const ambiguous = receive({subject:"Merchant invoice without a job reference",body:"",fixtureId:"materials-B-delivery"});
    const result = await repo.receive(auth,ambiguous);
    assert.equal(result.state,"needs_job");
    assert.equal(result.documentId,null);
    const afterView = await repo.view(auth);
    assert.equal(afterView.items.length,beforeView.items.length+1);
    const stored = (await admin.query("SELECT id,state,job_id,document_id FROM app.v2_inbound_item WHERE firm_key=$1 AND message_id=$2",
      [firm,ambiguous.messageId])).rows;
    assert.deepEqual(stored,[{id:result.itemId,state:"needs_job",job_id:null,document_id:null}]);
    assert.deepEqual(await documentCounts(),beforeDocuments);
  });
  const http = await request("/api/v2/inbound-mail",{cookies:owner.cookies});
  assert.equal(http.status,200);
  assert.equal((await http.json()).address,address);
});
