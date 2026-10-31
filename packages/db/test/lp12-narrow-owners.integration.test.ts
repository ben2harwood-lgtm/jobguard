import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { LedgerRepository } from "../src/ledger.js";
import { jobDoorsActor, jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { lp12ColumnGrants, lp12Moved, lp12Owners, lp12TableGrants } from "./lp12-narrow-owners.js";

let db: JobDoorsDatabase;
let worker: Pool;
const bodies = new Map<string, string>();
beforeAll(async () => {
  db = await jobDoorsDatabase(false, "0533_lp12_narrow_owners.sql");
  for (const [signature] of lp12Moved) bodies.set(signature,
    (await db.owner.query("SELECT prosrc FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0].prosrc);
  await db.owner.query(await readFile(new URL("../migrations/0533_lp12_narrow_owners.sql", import.meta.url), "utf8"));
  // Worker does not exist on this built-ahead base. This disposable probe has
  // only that role, never runtime membership; the LP-10 role is used after rebase.
  await db.owner.query("DO $$ BEGIN CREATE ROLE jobguard_worker NOLOGIN NOINHERIT; EXCEPTION WHEN duplicate_object THEN NULL; END $$");
  const password = randomBytes(24).toString("hex");
  await db.owner.query(`CREATE ROLE lp12_worker_probe LOGIN INHERIT PASSWORD '${password}'; GRANT jobguard_worker TO lp12_worker_probe`);
  worker = new Pool({ ...db.runtime.options, user: "lp12_worker_probe", password, max: 1 });
}, 300_000);
afterAll(async () => { await worker?.end(); await db?.close(); });

it("keeps all owners inert, memberless, and outside protected table/schema custody", async () => {
  for (const name of lp12Owners) {
    const role = (await db.owner.query(`SELECT rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname=$1`, [name])).rows[0];
    expect(Object.values(role)).toEqual(Array(7).fill(false));
    const members = (await db.owner.query(`SELECT m.*,g.rolsuper FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.grantor
      WHERE m.member=$1::regrole OR m.roleid=$1::regrole`, [name])).rows;
    for (const m of members) expect(m).toMatchObject({ roleid: (await db.owner.query("SELECT $1::regrole::oid id", [name])).rows[0].id,
      admin_option: true, inherit_option: false, set_option: false, rolsuper: true });
    expect((await db.owner.query(`SELECT n.nspname||'.'||c.relname object FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relowner=$1::regrole AND c.relkind IN ('r','p') AND n.nspname IN ('app','identity','control_plane','audit_control')
      AND c.oid<>'control_plane.request_binding'::regclass
      `, [name])).rows).toEqual([]);
    expect((await db.owner.query("SELECT nspname FROM pg_namespace WHERE nspowner=$1::regrole", [name])).rows).toEqual([]);
    expect((await db.owner.query(`SELECT nspname FROM pg_namespace WHERE nspname IN ('app','identity','control_plane','audit_control')
      AND has_schema_privilege($1,nspname,'CREATE')`, [name])).rows).toEqual([]);
  }
});

it("refuses owner assumption and routine replacement as actual runtime and worker logins", async () => {
  for (const login of [db.runtime, worker]) {
    for (const name of lp12Owners) await expect(login.query(`SET ROLE ${name}`)).rejects.toMatchObject({ code: "42501" });
    for (const [signature] of lp12Moved) {
      const definition = (await db.owner.query("SELECT pg_get_functiondef($1::regprocedure) definition", [signature])).rows[0].definition;
      await expect(login.query(definition)).rejects.toMatchObject({ code: "42501" });
    }
    for (const signature of ["app.lp6_session_authority(text,text,uuid)", lp12Moved[1][0]]) {
      expect((await db.owner.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed", [login.options.user, signature])).rows[0].allowed).toBe(false);
    }
  }
});

it("installs exactly the listed table/column grants, no sequence privileges, and unchanged routine bodies", async () => {
  for (const name of Object.keys(lp12TableGrants) as (keyof typeof lp12TableGrants)[]) {
    const tables = (await db.owner.query(`SELECT n.nspname||'.'||c.relname||':'||a.privilege_type fact
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,
      LATERAL aclexplode(c.relacl) a WHERE a.grantee=$1::regrole ORDER BY 1`, [name])).rows.map(r => r.fact);
    expect(tables).toEqual(lp12TableGrants[name]);
    const columns = (await db.owner.query(`SELECT n.nspname||'.'||c.relname||'.'||col.attname||':'||a.privilege_type fact
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute col ON col.attrelid=c.oid,
      LATERAL aclexplode(col.attacl) a WHERE a.grantee=$1::regrole ORDER BY 1`, [name])).rows.map(r => r.fact);
    expect(columns).toEqual(lp12ColumnGrants[name]);
    expect((await db.owner.query(`SELECT c.oid FROM pg_class c WHERE c.relkind='S' AND
      (has_sequence_privilege($1,c.oid,'USAGE') OR has_sequence_privilege($1,c.oid,'SELECT') OR has_sequence_privilege($1,c.oid,'UPDATE'))`, [name])).rows).toEqual([]);
  }
  for (const [signature, owner] of lp12Moved) {
    const routine = (await db.owner.query("SELECT prosrc,pg_get_userbyid(proowner) owner,proconfig FROM pg_proc WHERE oid=$1::regprocedure", [signature])).rows[0];
    expect(routine).toEqual({ prosrc: bodies.get(signature), owner, proconfig: ["search_path=pg_catalog, pg_temp"] });
  }
});

it("rejects unsafe provisioning atomically before changing any object", async () => {
  const migration = await readFile(new URL("../migrations/0533_lp12_narrow_owners.sql", import.meta.url), "utf8");
  const preflight = migration.slice(0, migration.indexOf("-- A command claim"));
  const admin = await db.owner.connect();
  try {
    for (const name of lp12Owners) for (const defect of [`ALTER ROLE ${name} LOGIN`,
      `GRANT jobguard_migration TO ${name}`, `GRANT ${name} TO jobguard_runtime`,
      `GRANT ${name} TO jobguard_worker`, `GRANT ${name} TO jobguard_migration WITH INHERIT FALSE, SET TRUE`]) {
      await admin.query("BEGIN"); await admin.query(defect);
      await expect(admin.query(preflight)).rejects.toMatchObject({ code: "42501", message: "LP12_OWNER_UNSAFE" });
      await admin.query("ROLLBACK");
    }
  } finally { await admin.query("ROLLBACK"); admin.release(); }
});

it("binds a real credential through the moved private helper", async () => {
  const f = await jobDoorsActor(db.owner), digest = randomBytes(32).toString("hex");
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), f.person, digest]);
  const client = await db.runtime.connect();
  try {
    await client.query("BEGIN"); await client.query("SELECT app.bind_request('real',$1,$2)", [digest, f.tenant]);
    expect((await client.query("SELECT app.current_actor() actor,app.current_tenant() tenant")).rows[0]).toEqual({ actor: f.member, tenant: f.tenant });
  } finally { await client.query("ROLLBACK"); client.release(); }
});

it("posts, settles and reverses through the narrow money and audit owners", async () => {
  const f = await jobDoorsActor(db.owner), book = randomUUID(), receivable = randomUUID(), deferred = randomUUID(), clearing = randomUUID();
  await db.owner.query("INSERT INTO app.ledger_book(id,tenant_id,code,currency,chart_status) VALUES($1,$2,'lp12','GBP','synthetic')", [book, f.tenant]);
  for (const [id, type] of [[receivable, "receivable"], [deferred, "deferred_income"], [clearing, "provider_clearing"]])
    await db.owner.query("INSERT INTO app.ledger_account(id,tenant_id,book_id,currency,code,class,mapping_status) VALUES($1,$2,$3,'GBP',$4,$4,'synthetic')", [id, f.tenant, book, type]);
  const repo = new LedgerRepository(db.runtime), context = testTenantContext(f.tenant), hash = "a".repeat(64);
  async function authorized(purpose: string, amount: number) {
    const id = randomUUID();
    await db.owner.query(`INSERT INTO app.financial_authorization(id,tenant_id,membership_id,purpose,amount_pence,currency,artifact_hash,status)
      VALUES($1,$2,$3,$4,$5,'GBP',$6,'approved')`, [id, f.tenant, f.member, purpose, amount, hash]);
    const proof = { authorizationId: id, actorRef: `membership:${f.member}`, permission: "finance:approve" as const };
    return { proof, input: { schemaVersion: 1, bookId: book, amountPence: amount, currency: "GBP", sourceEventId: `lp12:${id}`,
      provenanceRef: "fictional:lp12", artifactHash: hash, authorizationId: id, actorRef: proof.actorRef } };
  }
  const a = await authorized("plan_obligation", 1000);
  const obligation = await repo.postPlanObligation(context, a.proof, { ...a.input, receivableAccountId: receivable,
    deferredIncomeAccountId: deferred, provenanceKind: "synthetic_authorized_plan" });
  const s = await authorized("plan_settlement", 400);
  const settlement = await repo.postPlanSettlement(context, s.proof, { ...s.input, obligationJournalId: obligation,
    clearingAccountId: clearing, receivableAccountId: receivable });
  const r = await authorized("correction", 400);
  await repo.reverse(context, r.proof, { schemaVersion: 1, bookId: book, originalJournalId: settlement,
    sourceEventId: r.input.sourceEventId, provenanceRef: r.input.provenanceRef, artifactHash: hash,
    authorizationId: r.proof.authorizationId, actorRef: r.proof.actorRef });
  expect((await db.owner.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1", [f.tenant])).rows[0].n).toBe(3);
  expect((await db.owner.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [f.tenant])).rows[0].n).toBe(3);
});

it("completes and replays a checked command after removing claim-table ownership", async () => {
  const { UserCommandDispatcher } = await import("../src/commands.js");
  const f = await jobDoorsActor(db.owner), job = randomUUID(), id = randomUUID();
  await db.owner.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Fictional LP12 job','live')", [f.tenant, job]);
  const command = { version: "command.v1", commandId: id, commandType: "synthetic.lock", semanticKey: `lp12:${id}`,
    actorMembershipId: f.member, subjectType: "job", subjectRef: job,
    action: { actionType: "synthetic.lock", recipient: null, contentHash: "a".repeat(64), aggregateRevision: 1,
      amountPence: null, currency: null, policyVersion: "synthetic_demo_activation.v3", expiresAt: new Date("2099-01-01") } };
  const dispatcher = new UserCommandDispatcher(db.runtime), context = testTenantContext(f.tenant);
  expect(await dispatcher.dispatch(context, command, { mutate: async () => ({ locked: job }) })).toEqual({ locked: job });
  expect(await dispatcher.dispatch(context, command, { mutate: async () => { throw new Error("replay mutated"); } })).toEqual({ locked: job });
  expect((await db.owner.query("SELECT status FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.tenant, id])).rows[0].status).toBe("succeeded");
});

it("copies canonical tenant policies and denies wrong-tenant credential binding", async () => {
  const policies = (await db.owner.query(`SELECT c.relname,
    pg_get_expr(base.polqual,base.polrelid)=pg_get_expr(narrow.polqual,narrow.polrelid) same_read,
    pg_get_expr(base.polwithcheck,base.polrelid)=pg_get_expr(narrow.polwithcheck,narrow.polrelid) same_write
    FROM pg_policy narrow JOIN pg_policy base ON base.polrelid=narrow.polrelid AND base.polname='tenant_isolation'
    JOIN pg_class c ON c.oid=narrow.polrelid WHERE narrow.polname='lp12_money_tenant'`)).rows;
  expect(policies).toHaveLength(5);
  for (const p of policies) expect(p).toMatchObject({ same_read: true, same_write: true });
  const f = await jobDoorsActor(db.owner), other = await jobDoorsActor(db.owner), digest = randomBytes(32).toString("hex");
  await db.owner.query(`INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at)
    VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour')`, [randomUUID(), f.person, digest]);
  await expect(db.runtime.query("SELECT app.bind_request('real',$1,$2)", [digest, other.tenant]))
    .rejects.toMatchObject({ code: "42501", message: "REQUEST_BINDING_REFUSED" });
});

it("accepts only PG16 creator ADMIN-only rows and exact temporary migration membership", async () => {
  const sql = await readFile(new URL("../migrations/0533_lp12_narrow_owners.sql", import.meta.url), "utf8");
  const preflight = sql.slice(0, sql.indexOf("-- A command claim"));
  const admin = await db.owner.connect();
  try {
    await admin.query("BEGIN");
    for (const name of lp12Owners) await admin.query(`GRANT ${name} TO postgres WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`);
    await admin.query(preflight);
    await admin.query("ROLLBACK; BEGIN");
    for (const name of lp12Owners) await admin.query(`GRANT ${name} TO jobguard_migration WITH ADMIN FALSE, INHERIT TRUE, SET TRUE`);
    await admin.query("SET LOCAL ROLE jobguard_migration");
    await admin.query(preflight);
  } finally { await admin.query("ROLLBACK"); admin.release(); }
});

it("lists every helper and schema capability of the new owners, without grant options", async () => {
  for (const name of ["jobguard_binding_lookup_owner", "jobguard_money_owner"]) {
    const helpers = (await db.owner.query(`SELECT n.nspname||'.'||p.proname helper,a.is_grantable
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,LATERAL aclexplode(p.proacl) a
      WHERE a.grantee=$1::regrole AND p.proowner<>a.grantee ORDER BY 1`, [name])).rows;
    expect(helpers).toEqual(name === "jobguard_binding_lookup_owner" ? [
      { helper: "app.authenticate_practice_session", is_grantable: false },
      { helper: "app.contractor_practice_home_deadline", is_grantable: false },
      { helper: "app.contractor_practice_session_digest", is_grantable: false },
      { helper: "identity.sso_session_memberships", is_grantable: false },
    ] : []);
    const schemas = (await db.owner.query(`SELECT n.nspname,a.privilege_type,a.is_grantable FROM pg_namespace n,
      LATERAL aclexplode(n.nspacl) a WHERE a.grantee=$1::regrole ORDER BY 1,2`, [name])).rows;
    expect(schemas).toEqual((name === "jobguard_binding_lookup_owner" ? ["app", "control_plane", "identity"] : ["app"])
      .map(nspname => ({ nspname, privilege_type: "USAGE", is_grantable: false })));
    expect((await db.owner.query(`SELECT c.oid FROM pg_class c,LATERAL aclexplode(c.relacl) a
      WHERE a.grantee=$1::regrole AND a.is_grantable`, [name])).rows).toEqual([]);
  }
});
