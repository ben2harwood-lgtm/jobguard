import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { closeWorkFixture, createWorkFixture, type WorkFixture } from "./job-work-state-fixtures.js";

const token = "fictional-connector-database-token-0001";
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const work = { version: "connector-input.v1", eventId: "fixture:event", kind: "work_order", subject: "fixture:order", revision: 1, document: "fixture:document" };
const billing = { version: "connector-input.v1", eventId: "fixture:billing", kind: "billing_status", subject: "fixture:invoice", revision: 1, status: "paid" };
const own = "0415_connector_intake.sql";
let f: WorkFixture;
async function asConnector<T>(run: (db: PoolClient) => Promise<T>) {
  const db = await f.runtime.connect();
  try { await db.query("BEGIN"); await db.query("SET LOCAL ROLE jobguard_connector"); const r = await run(db); await db.query("COMMIT"); return r; }
  catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
async function binding(tenant = randomUUID(), namespace = "fixture:source", secret = token) {
  const id = randomUUID();
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
  await f.admin.query(`INSERT INTO connector.binding(tenant_id,id,namespace,environment,endpoint_kind,token_sha256,expires_at)
    VALUES($1,$2,$3,'synthetic_demo','fake',$4,clock_timestamp()+interval '1 hour')`, [tenant,id,namespace,tokenHash(secret)]);
  return { id, tenant };
}
const intake = async (id: string, input: unknown, secret = token) => asConnector(async db =>
  (await db.query("SELECT connector.intake($1,$2,$3::jsonb) receipt", [id,secret,JSON.stringify(input)])).rows[0]!.receipt);

async function existingCatalog() {
  return (await f.admin.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity,
    (SELECT jsonb_agg(row(a.attname,format_type(a.atttypid,a.atttypmod)) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN('app','identity','control_plane','audit_control') AND c.relkind='r' ORDER BY n.nspname,c.relname`)).rows;
}

describe("ENT-13a RED dark connector PostgreSQL authority and durability", () => {
  beforeAll(async () => {
    f = await createWorkFixture(false);
    const index = MIGRATION_URLS.findIndex(u => u.pathname.endsWith(own)); expect(index).toBeGreaterThan(0);
    // Populated immediate predecessor, then the reserved migration ALONE. No earlier SQL changes.
    for (const url of MIGRATION_URLS.slice(0,index)) await f.admin.query(await readFile(url,"utf8"));
    const tenant = randomUUID(), account = randomUUID();
    await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenant]);
    await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional predecessor')", [account,tenant]);
    const before = await existingCatalog();
    const beforeRow = (await f.admin.query("SELECT row_to_json(a) bytes FROM app.account a WHERE id=$1",[account])).rows;
    await f.admin.query(await readFile(MIGRATION_URLS[index]!,"utf8"));
    expect(await existingCatalog()).toEqual(before);
    expect((await f.admin.query("SELECT row_to_json(a) bytes FROM app.account a WHERE id=$1",[account])).rows).toEqual(beforeRow);
    await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for (const url of MIGRATION_URLS.slice(0,index+1)) await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);
    await migrate(f.admin); await migrate(f.admin);
    const login = `connector_test_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
    await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_connector TO ${login}`);
    await f.runtime.end();
    f.runtime = new Pool({ ...f.admin.options, user: login, password });
  }, 120_000);
  afterAll(async () => closeWorkFixture(f));

  it("has no login, bypass, owner or inherited business privileges; grants only intake", async () => {
    expect((await f.admin.query("SELECT rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,rolbypassrls FROM pg_roles WHERE rolname='jobguard_connector'")).rows[0])
      .toEqual({ rolcanlogin:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolinherit:false,rolbypassrls:false });
    expect((await f.admin.query("SELECT 1 FROM pg_auth_members WHERE member='jobguard_connector'::regrole")).rowCount).toBe(0);
    expect((await f.admin.query(`SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN('connector','app','identity','control_plane','audit_control') AND c.relkind='r'
      AND (has_table_privilege('jobguard_connector',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))`)).rows).toEqual([]);
    expect((await f.admin.query("SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class WHERE relnamespace='connector'::regnamespace AND relkind='r' ORDER BY relname")).rows)
      .toEqual([{relname:'binding',relrowsecurity:true,relforcerowsecurity:true},{relname:'input_event',relrowsecurity:true,relforcerowsecurity:true}]);
    const functionRow = (await f.admin.query(`SELECT prosecdef,pg_get_userbyid(proowner) owner,proconfig FROM pg_proc WHERE oid='connector.intake(uuid,text,jsonb)'::regprocedure`)).rows[0];
    expect(functionRow).toEqual({prosecdef:true,owner:'jobguard_migration',proconfig:['search_path=pg_catalog']});
    for (const role of ['jobguard_runtime','jobguard_infrastructure']) expect((await f.admin.query("SELECT has_function_privilege($1,'connector.intake(uuid,text,jsonb)','EXECUTE') yes",[role])).rows[0].yes).toBe(false);
  });
  it("deduplicates concurrent/cross-channel deliveries durably, with one audit and no changed-payload reuse", async () => {
    const b = await binding();
    const results = await Promise.all(Array.from({length:4}, () => intake(b.id,work)));
    expect(results.every(r => JSON.stringify(r)===JSON.stringify(results[0]))).toBe(true);
    expect(results[0]).toEqual({version:'connector-receipt.v1',eventId:work.eventId,state:'staged',domainEffects:0});
    await expect(intake(b.id,{...work,document:'fixture:changed'})).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    expect((await f.admin.query("SELECT count(*)::int n FROM connector.input_event WHERE tenant_id=$1",[b.tenant])).rows[0].n).toBe(1);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type='connector.input_staged'",[b.tenant])).rows[0].n).toBe(1);
    // A different binding in the same source namespace (rotation/reconnection) shares identity.
    const rotated = await binding(b.tenant);
    expect(await intake(rotated.id,work)).toEqual(results[0]);
  });
  it("preserves reordered facts and reversals; rejects a competing same-revision claim", async () => {
    const b = await binding();
    for (const input of [{...billing,revision:3,eventId:'fixture:reversed',status:'reversed'},billing]) await intake(b.id,input);
    await expect(intake(b.id,{...billing,eventId:'fixture:conflict',status:'billed'})).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    expect((await f.admin.query("SELECT revision,payload->>'status' status FROM connector.input_event WHERE tenant_id=$1 ORDER BY revision",[b.tenant])).rows)
      .toEqual([{revision:1,status:'paid'},{revision:3,status:'reversed'}]);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[b.tenant])).rows[0].n).toBe(0);
  });
  it("derives tenant from authenticated binding, ignores spoofed context, refuses wrong secrets before disclosure", async () => {
    const otherToken = "fictional-other-tenant-database-token-0003";
    const a = await binding(), b = await binding(randomUUID(), "fixture:source", otherToken);
    await intake(a.id,work);
    await expect(intake(a.id,work,'wrong-secret-that-is-at-least-32-bytes')).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    await expect(intake(b.id,work)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    await expect(intake(randomUUID(),work)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    await asConnector(async db => {
      await db.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenant]);
      await db.query("SELECT connector.intake($1,$2,$3)",[b.id,otherToken,work]);
    });
    expect((await f.admin.query("SELECT DISTINCT tenant_id FROM connector.input_event WHERE binding_id=$1",[b.id])).rows).toEqual([{tenant_id:b.tenant}]);
    // Migration owner RLS is also scoped; runtime/connector have no direct table access at all.
    const rows = await f.admin.connect();
    try { await rows.query('BEGIN'); await rows.query('SET LOCAL ROLE jobguard_migration'); await rows.query("SELECT set_config('app.tenant_id',$1,true)",[a.tenant]);
      expect((await rows.query('SELECT * FROM connector.input_event WHERE tenant_id=$1',[b.tenant])).rows).toEqual([]);
      await rows.query('ROLLBACK'); } finally { rows.release(); }
  });
  it("rolls back staged identity, receipt and audit together on failure, leaving the event retryable", async () => {
    const b = await binding();
    await f.admin.query(`CREATE FUNCTION connector.test_abort_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF current_setting('app.test_abort_connector_audit',true)='yes' THEN RAISE EXCEPTION 'fixture audit failure'; END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER test_connector_atomicity BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION connector.test_abort_audit()`);
    await expect(asConnector(async db => {
      await db.query("SELECT set_config('app.test_abort_connector_audit','yes',true)");
      return db.query('SELECT connector.intake($1,$2,$3)',[b.id,token,work]);
    })).rejects.toThrow('fixture audit failure');
    expect((await f.admin.query('SELECT * FROM connector.input_event WHERE tenant_id=$1',[b.tenant])).rows).toEqual([]);
    expect((await f.admin.query('SELECT * FROM app.audit_event WHERE tenant_id=$1',[b.tenant])).rows).toEqual([]);
    await expect(intake(b.id,work)).resolves.toMatchObject({state:'staged'});
  });
  it("keeps source namespace and tenant immutable during credential rotation", async () => {
    const b = await binding();
    for (const sql of ["UPDATE connector.binding SET namespace='fixture:other' WHERE id=$1", 'UPDATE connector.binding SET tenant_id=gen_random_uuid() WHERE id=$1']) {
      await expect(f.admin.query(sql,[b.id])).rejects.toThrow('CONNECTOR_BINDING_IDENTITY_IMMUTABLE');
    }
  });
  it("revocation, expiry and token rotation also refuse replay; no authority provisioning is granted", async () => {
    const b = await binding(); await intake(b.id,work);
    const next = 'fictional-rotated-database-token-0002';
    await f.admin.query('UPDATE connector.binding SET token_sha256=$1 WHERE id=$2',[tokenHash(next),b.id]);
    await expect(intake(b.id,work)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    await expect(intake(b.id,work,next)).resolves.toMatchObject({state:'staged'});
    await f.admin.query('UPDATE connector.binding SET revoked_at=clock_timestamp() WHERE id=$1',[b.id]);
    await expect(intake(b.id,work,next)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    const expired = await binding();
    await f.admin.query("UPDATE connector.binding SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.id]);
    await expect(intake(expired.id,work)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    await expect(asConnector(db=>db.query('UPDATE connector.binding SET revoked_at=NULL'))).rejects.toMatchObject({code:'42501'});
  });
  it.each(['approve','price','write_origin','read_statement','export_statement','shadow_read','allocate','settle'])("database refuses command type %s", async kind => {
    const b = await binding(); await expect(intake(b.id,{...work,kind})).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
    expect((await f.admin.query('SELECT * FROM connector.input_event WHERE tenant_id=$1',[b.tenant])).rows).toEqual([]);
  });
  it.each([null, [], {}, {...work,revision:0}, {...work,revision:1.5}, {...work,revision:2147483648}, {...work,revision:'1'},
    {...work,document:null}, {...work,document:'https://example.invalid'}, {...billing,status:null}, {...billing,status:'unknown'},
    {...billing,amountPence:1000000000001}, {...billing,allocations:[{pence:1}]}, {...billing,lockedBillId:randomUUID()},
    {...billing,tenantId:randomUUID()}, {...work,origin:'site'}, {...work,pricePence:1}, {...work,document:'x'.repeat(17000)},
  ])("database boundary refuses malformed/money/bill/authority fields %#", async input => {
    const b = await binding(); await expect(intake(b.id,input)).rejects.toThrow('CONNECTOR_INPUT_REFUSED');
  });
  it.each(['app.extra_origin','app.enterprise_fee_statement','app.final_account_lock','app.shadow_commercial_signal','app.membership','connector.input_event','connector.binding'])("cannot read %s, even with spoofed tenant", async table => {
    await expect(asConnector(db => db.query(`SELECT * FROM ${table}`))).rejects.toMatchObject({code:'42501'});
  });
  it("cannot switch to business roles, invoke human import/origin paths or mutate receipts", async () => {
    for (const sql of ['SET LOCAL ROLE jobguard_runtime', 'SET LOCAL ROLE jobguard_migration',
      "SELECT app.work_order_commit(NULL,'{}'::jsonb)", "UPDATE app.extra_origin SET kind='site'", 'TRUNCATE connector.input_event']) {
      await expect(asConnector(db => db.query(sql))).rejects.toMatchObject({code:'42501'});
    }
    const b = await binding(); await intake(b.id,work);
    await expect(f.admin.query("UPDATE connector.input_event SET payload='{}' WHERE tenant_id=$1",[b.tenant])).rejects.toThrow('immutable');
  });
  it("does not query shadow, statements, locks or billing state; receipts disclose only staged source identity", async () => {
    const definition = (await f.admin.query("SELECT pg_get_functiondef('connector.intake(uuid,text,jsonb)'::regprocedure) definition")).rows[0].definition as string;
    expect(definition).not.toMatch(/FROM app\.(?:shadow|final_account|enterprise_fee|customer_invoice|job)/u);
    const b = await binding();
    expect(Object.keys(await intake(b.id,billing)).sort()).toEqual(['domainEffects','eventId','state','version']);
    const audit = (await f.admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE tenant_id=$1",[b.tenant])).rows[0];
    expect(audit.actor_ref).toBe(`connector:${b.id}`);
    expect(JSON.stringify(audit)).not.toContain(token);
    expect(JSON.stringify(audit)).not.toContain('paid');
  });
});
