// ENT-3d routines: parity, totality, the writer's own refusals, the guard, the catalogue and the upgrade proof (rule 9).
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { siteExtraContentSha256V1, residentConfirmationDocumentV1 } from "@jobguard/core";
import { SiteExtraRepository, ExtraRepository, MIGRATION_URLS, migrate } from "../src/index.js";
import {
 cluster, siteFixture, command, ownerTx, cancel, smallJob, direct, photo, pngBytes, shownFor, evidenceCounts, evidenceRowsText, v3, note, description, sha,
 type Cluster, type SiteFixture,
} from "./site-extra-evidence-fixtures.js";
let c: Cluster, f: SiteFixture;
beforeAll(async () => { c = await cluster(); f = await siteFixture(c); }, 90_000);
afterAll(async () => { await c?.close(); });
const where = (x: SiteFixture) => ({ ctx: x.ctx, jobId: x.jobId });
/** Call a routine as the runtime login inside one tenant transaction (the tenant setting is a parameter so it can be absent, empty or malformed). */
const UNSET = Symbol("unset");
async function call(sql: string, args: unknown[], setting: string | null | typeof UNSET = f.p.tenantId, readOnly = false) {
 const client = await c.runtime.connect();
 try {
  await client.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
  if (setting !== UNSET) await client.query("SELECT set_config('app.tenant_id',$1,true)", [setting]);
  const rows = (await client.query(sql, args)).rows; await client.query("COMMIT"); return rows;
 } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
const record = (x: SiteFixture, over: Partial<Record<"actor" | "job" | "command" | "confirmation" | "description" | "note" | "photo" | "shown", unknown>> = {}, setting: string | null | typeof UNSET = x.p.tenantId) => {
 const a = { actor: x.members.supervisor.member.membershipId, job: x.jobId, command: randomUUID(), confirmation: randomUUID(), description, note, photo: null, shown: shownFor(x, null), ...over };
 return call("SELECT outcome,reason_code,content_sha256,document_sha256 FROM app.ent3d_record_resident_confirmation($1,$2,$3,$4,$5,$6,$7,$8)", [a.actor, a.job, a.command, a.confirmation, a.description, a.note, a.photo, a.shown], setting);
};
const refusedWith = (reason: string) => [{ outcome: "refused", reason_code: reason, content_sha256: null, document_sha256: null }];

describe("ENT-3d routines", () => {
 it("[E20] routines 1 and 2 return exactly what the two core functions return", async () => {
  const job = randomUUID(), tenant = randomUUID(), confirmation = randomUUID(), photoHash = sha("a photo");
  const inputs = [
   { description: "Fictional door", note: "Fictional note", photoSha256: null }, { description: "Fictional door", note: "Fictional note", photoSha256: photoHash },
   { description: "Café \u{1F6AA}", note: "工事 é\u{1F600}", photoSha256: null }, { description: " padded ", note: "\tnote\n", photoSha256: photoHash },
   { description: "ab", note: "c", photoSha256: null }, { description: "a", note: "bc", photoSha256: null }, { description: "x".repeat(500), note: "y".repeat(5000), photoSha256: null },
  ];
  for (const input of inputs) {
   const content = siteExtraContentSha256V1({ jobId: job, ...input });
   expect((await call("SELECT app.ent3d_content_sha256($1,$2,$3,$4) v", [job, input.description, input.note, input.photoSha256], UNSET))[0]!.v).toBe(content);
   expect((await call("SELECT app.ent3d_confirmation_document($1,$2,$3,$4) v", [tenant, job, confirmation, content], UNSET))[0]!.v).toBe(residentConfirmationDocumentV1({ tenantId: tenant, jobId: job, confirmationId: confirmation, contentSha256: content }));
  }
  const nulls = (await call("SELECT app.ent3d_content_sha256(NULL,$1,$2,NULL) a,app.ent3d_content_sha256($3,NULL,$2,NULL) b,app.ent3d_content_sha256($3,$1,NULL,NULL) c,app.ent3d_content_sha256($3,$1,$2,$4) d,app.ent3d_content_sha256($3,$1,$2,$5) e,app.ent3d_confirmation_document($3,$3,$3,$4) f,app.ent3d_confirmation_document(NULL,$3,$3,$5) g", ["d", "n", job, "A".repeat(64), "a".repeat(64)], UNSET))[0]!;
  expect(nulls).toEqual({ a: null, b: null, c: null, d: null, e: expect.any(String), f: null, g: null });
 });
 it("[E21] routine 3 is total and read-only: one row for NULLs and for an absent, empty, malformed and foreign tenant setting", async () => {
  const p = await photo(c, where(f)), other = await siteFixture(c), before = await evidenceCounts(c, f);
  const sql = "SELECT * FROM app.ent3d_site_extra_evidence($1,$2,$3,$4,$5,$6)";
  expect(await call(sql, [null, null, null, null, null, null], f.p.tenantId, true)).toEqual([{ decision: "photo_refused", reason_code: "photo_not_accepted", photo_sha256: null, content_sha256: null }]);
  for (const setting of [null, "", "not-a-uuid", UNSET]) for (const photoId of [p.id, null]) expect(await call(sql, [f.jobId, description, note, photoId, null, null], setting, true), String(setting)).toEqual([{ decision: "photo_refused", reason_code: "photo_not_accepted", photo_sha256: null, content_sha256: null }]);
  expect(await call(sql, [f.jobId, description, note, p.id, null, null], other.p.tenantId, true)).toEqual([{ decision: "photo_refused", reason_code: "photo_not_accepted", photo_sha256: null, content_sha256: null }]);
  expect(await call(sql, [f.jobId, description, note, p.id, null, null], f.p.tenantId.toUpperCase(), true)).toEqual([{ decision: "accepted", reason_code: "accepted", photo_sha256: p.sha256, content_sha256: shownFor(f, p.sha256) }]);
  for (const nullArg of [0, 1, 2]) { const args = [f.jobId, description, note, null, null, null]; args[nullArg] = null; expect((await call(sql, args, f.p.tenantId, true))[0]!.decision).toBe("photo_refused"); }
  // An unknown confirmation is refused; the photo cannot be the confirmation.
  expect(await call(sql, [f.jobId, description, note, null, randomUUID(), null], f.p.tenantId, true)).toEqual([{ decision: "confirmation_refused", reason_code: "confirmation_not_bound", photo_sha256: null, content_sha256: null }]);
  expect((await call(sql, [f.jobId, description, note, p.id, p.id, null], f.p.tenantId, true))[0]!.decision).toBe("confirmation_refused");
  expect(await evidenceCounts(c, f)).toEqual(before);
 });
 it("[E22] routine 4 refuses by its own authority check, each writing nothing; the same content again is existing, a different one conflicts", async () => {
  const x = await siteFixture(c), before = await evidenceCounts(c, x), rows = await evidenceRowsText(c, x), unchanged = async () => { expect(await evidenceCounts(c, x)).toEqual(before); expect(await evidenceRowsText(c, x)).toEqual(rows); };
  for (const role of ["owner", "admin", "commercial_manager", "finance", "read_only", "client_approver"] as const) expect(await record(x, { actor: x.members[role].member.membershipId }), role).toEqual(refusedWith("not_permitted"));
  for (const member of [x.unassigned.member, x.otherSupervisor.member, x.otherSurveyor.member]) expect(await record(x, { actor: member.membershipId })).toEqual(refusedWith("not_permitted"));
  expect(await record(x, { job: x.otherJob })).toEqual(refusedWith("not_permitted"));
  expect(await record(x, { job: randomUUID() })).toEqual(refusedWith("not_permitted"));
  expect(await record(x, { job: await smallJob(c, x) })).toEqual(refusedWith("not_permitted"));
  const foreign = await siteFixture(c); expect(await record(x, { job: foreign.jobId })).toEqual(refusedWith("not_permitted"));
  expect(await record(x, {}, foreign.p.tenantId)).toEqual(refusedWith("not_permitted"));
  for (const setting of [null, "", "not-a-uuid", UNSET]) expect(await record(x, {}, setting), String(setting)).toEqual(refusedWith("not_permitted"));
  for (const key of ["actor", "job", "command", "confirmation", "description", "note", "shown"] as const) expect(await record(x, { [key]: null }), key).toEqual(refusedWith("not_permitted"));
  expect(await record(x, { photo: randomUUID(), shown: shownFor(x, sha("x")) })).toEqual(refusedWith("photo_not_accepted"));
  expect(await record(x, { shown: shownFor(x, null, { note: "Fictional other note" }) })).toEqual(refusedWith("confirmation_mismatch"));
  expect(await record(x, { shown: "A".repeat(64) })).toEqual(refusedWith("confirmation_mismatch"));
  await unchanged();
  // revoked grant, revoked membership, cancelled order: each on its own company
  const revoked = await siteFixture(c); await command(c, revoked, { kind: "grant.revoke", grantId: revoked.members.supervisor.grant });
  expect(await record(revoked)).toEqual(refusedWith("not_permitted"));
  const gone = await siteFixture(c); await command(c, gone, { kind: "membership.revoke", membershipId: gone.members.supervisor.member.membershipId });
  expect(await record(gone)).toEqual(refusedWith("not_permitted"));
  const cancelled = await siteFixture(c); await cancel(c, cancelled);
  expect(await record(cancelled)).toEqual(refusedWith("not_permitted"));
  for (const y of [revoked, gone, cancelled]) expect((await c.admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1 AND evidence_type='resident_confirmation'", [y.p.tenantId])).rows[0]!.n).toBe(0);
  // recorded, then the same content is existing (adds no row), a different content under the same id conflicts
  const confirmation = randomUUID(), first = await record(x, { confirmation });
  expect(first).toEqual([{ outcome: "recorded", reason_code: "recorded", content_sha256: shownFor(x, null), document_sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }]);
  const afterFirst = await evidenceCounts(c, x);
  expect(await record(x, { confirmation })).toEqual([{ outcome: "existing", reason_code: "existing", content_sha256: first[0]!.content_sha256, document_sha256: first[0]!.document_sha256 }]);
  expect(await evidenceCounts(c, x)).toEqual(afterFirst);
  expect(await record(x, { confirmation, note: "Fictional other note", shown: shownFor(x, null, { note: "Fictional other note" }) })).toEqual([{ outcome: "conflict", reason_code: "conflict", content_sha256: null, document_sha256: null }]);
  expect(await evidenceCounts(c, x)).toEqual(afterFirst);
  // a command id that already has a receipt and no document conflicts
  const used = randomUUID(); await new SiteExtraRepository(c.runtime).logSiteExtra(x.ctx, x.members.supervisor.member, { commandId: used, jobId: x.jobId, note, description });
  const afterUsed = await evidenceCounts(c, x);
  expect(await record(x, { command: used })).toEqual([{ outcome: "conflict", reason_code: "conflict", content_sha256: null, document_sha256: null }]);
  expect(await evidenceCounts(c, x)).toEqual(afterUsed);
  // a half-present confirmation object is a conflict, never existing
  const half = randomUUID();
  await ownerTx(c, x.p.tenantId, db => db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,expires_at) VALUES($1,$2,$3,$4,$5,'text/plain; charset=utf-8',10,'standard_evidence','pending',now())", [half, x.p.tenantId, x.jobId, `tenants/${x.p.tenantId}/resident-confirmations/${half}/document`, sha("half")]));
  expect(await record(x, { confirmation: half })).toEqual([{ outcome: "conflict", reason_code: "conflict", content_sha256: null, document_sha256: null }]);
 });
 it("[E23] routine 5 fails closed for an absent, empty or malformed tenant setting, a missing origin and a missing variation, and passes for a note-only extra", async () => {
  const x = await siteFixture(c), made = await new SiteExtraRepository(c.runtime).logSiteExtra(x.ctx, x.members.supervisor.member, v3(x));
  const sql = "SELECT app.ent3d_require_site_extra_evidence($1,$2)";
  for (const setting of [null, "", "not-a-uuid", UNSET]) await expect(call(sql, [x.jobId, made.variationId], setting), String(setting)).rejects.toMatchObject({ code: "23514", message: "INVALID_ORIGIN" });
  await expect(call(sql, [x.jobId, randomUUID()])).rejects.toMatchObject({ code: "23514", message: "INVALID_ORIGIN" });
  await expect(call(sql, [randomUUID(), made.variationId], x.p.tenantId)).rejects.toMatchObject({ code: "23514", message: "INVALID_ORIGIN" });
  await expect(call(sql, [x.jobId, made.variationId], f.p.tenantId)).rejects.toMatchObject({ code: "23514", message: "INVALID_ORIGIN" });
  await expect(call(sql, [x.jobId, made.variationId], x.p.tenantId)).resolves.toEqual([{ ent3d_require_site_extra_evidence: "" }]);
 });
 it("[E24] the catalogue shows exactly the five routines with the stated signatures, volatility, ownership and grants", async () => {
  const rows = (await c.admin.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) args,pg_get_function_result(p.oid) result,p.provolatile,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public,
   (SELECT array_agg(pg_get_userbyid(a.grantee)::text ORDER BY pg_get_userbyid(a.grantee)::text) FROM aclexplode(p.proacl) a WHERE a.privilege_type='EXECUTE') grantees
   FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname LIKE 'ent3d\\_%' ORDER BY p.proname`)).rows;
  expect(rows.map(r => [r.proname, r.args, r.result, r.provolatile])).toEqual([
   ["ent3d_confirmation_document", "p_tenant uuid, p_job uuid, p_confirmation uuid, p_content_sha256 text", "text", "i"],
   ["ent3d_content_sha256", "p_job uuid, p_description text, p_note text, p_photo_sha256 text", "text", "i"],
   ["ent3d_record_resident_confirmation", "p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text", "TABLE(outcome text, reason_code text, content_sha256 text, document_sha256 text)", "v"],
   ["ent3d_require_site_extra_evidence", "p_job uuid, p_variation uuid", "void", "v"],
   ["ent3d_site_extra_evidence", "p_job uuid, p_description text, p_note text, p_photo uuid, p_confirmation uuid, p_variation uuid", "TABLE(decision text, reason_code text, photo_sha256 text, content_sha256 text)", "s"],
  ]);
  for (const r of rows) expect(r).toMatchObject({ prosecdef: false, proconfig: ["search_path=pg_catalog"], owner: "jobguard_migration", runtime: true, infrastructure: false, public: false, grantees: ["jobguard_migration", "jobguard_runtime"] });
  expect((await c.admin.query("SELECT count(*)::int n FROM pg_proc p WHERE p.proname ILIKE '%ent4b%' AND p.proname LIKE 'ent3d%'")).rows[0]!.n).toBe(0);
  // Exactly these five hold the prefix: nothing else in any schema carries the ENT-3d name.
  expect((await c.admin.query("SELECT count(*)::int n FROM pg_proc p WHERE p.proname LIKE 'ent3d\\_%'")).rows[0]!.n).toBe(5);
  // No table grant was added: the runtime login's evidence privileges are the ones from 0002 and 0096.
  const acl = (await c.admin.query("SELECT relname,has_table_privilege('jobguard_runtime',c.oid,'INSERT') i,has_table_privilege('jobguard_runtime',c.oid,'UPDATE') u,has_table_privilege('jobguard_runtime',c.oid,'DELETE') d FROM pg_class c WHERE c.oid IN('app.evidence_upload'::regclass,'app.evidence_object'::regclass) ORDER BY relname")).rows;
  expect(acl).toEqual([{ relname: "evidence_object", i: true, u: false, d: false }, { relname: "evidence_upload", i: true, u: false, d: false }]);
 });
});

const keys = { evidence_upload: "tenant_id::text||':'||id::text", evidence_object: "tenant_id::text||':'||id::text", extra_origin: "tenant_id::text||':'||variation_id::text", variation: "tenant_id::text||':'||id::text" } as const;
type Table = keyof typeof keys;
const tables = Object.keys(keys) as Table[];
type Run = (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }>;
const nameOf = (u: URL) => u.pathname.split("/").at(-1)!;

describe("ENT-3d upgrade proof (rule 9)", () => {
 it("[E25] installs everything before 0141, snapshots, applies 0141 alone, compares, then applies everything after twice", async () => {
  const up = await cluster(true), own = "0141_site_extra_evidence.sql";
  try {
   const apply = async (url: URL) => { await up.admin.query(await readFile(url, "utf8")); await up.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [nameOf(url)]); };
   for (const url of MIGRATION_URLS.filter(u => nameOf(u) >= "0122_extra_origin_persistence.sql" && nameOf(u) < own)) await apply(url);
   // Historical state is seeded; pipeline execution is tested elsewhere (E20–E24 and the evidence suites) and is not claimed here.
   // Before N: an already-verified synthetic photo, a note-only extra, and an extra linking the photo; the merged raise runs without N's seam.
   expect((await up.admin.query("SELECT to_regclass('app.job_work_state_event') work_state, to_regclass('app.job_link') job_link")).rows).toEqual([{ work_state: null, job_link: null }]);
   const x = await siteFixture(up), extras = new ExtraRepository(up.runtime);
   const p = await ownerTx(up, x.p.tenantId, async db => {
    // Use the normal INSERT role: 0025's FORCE-RLS policy for synthetic originals names jobguard_runtime, not the table owner.
    await db.$client.query("SET LOCAL ROLE jobguard_runtime");
    const scopes = await db.$client.query("SELECT id FROM app.scope_identity WHERE tenant_id=$1 AND job_id=$2 AND state='confirmed' ORDER BY id LIMIT 1", [x.p.tenantId, x.jobId]);
    expect(scopes.rowCount, "the predecessor job has a real confirmed scope for the synthetic original's non-null FK").toBe(1);
    const scopeId = scopes.rows[0]!.id as string, uploadId = randomUUID(), id = randomUUID();
    const bytes = Buffer.from(pngBytes(25)), sha256 = createHash("sha256").update(bytes).digest("hex");
    const objectKey = `tenants/${x.p.tenantId}/uploads/${uploadId}/original`, version = "e25-pre0141-v1";
    await db.$client.query(`INSERT INTO app.evidence_upload
     (id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_received_at,server_verified_at,expires_at)
     VALUES($1,$2,$3,$4,$5,$6,'image/png',$7,'standard_evidence','verified',$8,transaction_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour')`,
    [uploadId, x.p.tenantId, x.jobId, scopeId, objectKey, sha256, bytes.length, version]);
    await db.$client.query(`INSERT INTO app.synthetic_evidence_original
     (tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
     VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7)`, [x.p.tenantId, uploadId, x.jobId, scopeId, objectKey, version, bytes]);
    await db.$client.query(`INSERT INTO app.evidence_object
     (id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
     SELECT $1,tenant_id,id,job_id,scope_item_id,'original','site_photo',object_key,object_version_id,expected_sha256,$4,expected_content_type,retention_class,server_received_at,server_verified_at
     FROM app.evidence_upload WHERE tenant_id=$2 AND id=$3`, [id, x.p.tenantId, uploadId, bytes.length]);
    const stored = await db.$client.query(`SELECT u.state,e.upload_id,e.kind,e.evidence_type,e.object_version_id,e.sha256,e.byte_length,o.bytes,
     (u.job_id=$4::uuid AND u.scope_item_id=$5::uuid AND u.object_key=$6::text AND u.expected_sha256=e.sha256
      AND u.expected_content_type='image/png' AND e.content_type=u.expected_content_type AND o.content_type=e.content_type
      AND u.maximum_bytes=octet_length(o.bytes) AND u.retention_class='standard_evidence' AND e.retention_class=u.retention_class
      AND o.environment='synthetic_demo' AND u.rejection_code IS NULL
      AND u.server_verified_at IS NOT NULL AND e.server_received_at=u.server_received_at AND e.server_verified_at=u.server_verified_at
      AND u.expires_at>u.server_verified_at) metadata_matches
     FROM app.evidence_upload u
     JOIN app.evidence_object e ON (e.tenant_id,e.job_id,e.scope_item_id,e.upload_id,e.object_key,e.object_version_id)=(u.tenant_id,u.job_id,u.scope_item_id,u.id,u.object_key,u.object_version_id)
     JOIN app.synthetic_evidence_original o ON (o.tenant_id,o.job_id,o.scope_item_id,o.upload_id,o.object_key,o.object_version_id)=(u.tenant_id,u.job_id,u.scope_item_id,u.id,u.object_key,u.object_version_id)
     WHERE u.tenant_id=$1 AND u.id=$2 AND e.id=$3`, [x.p.tenantId, uploadId, id, x.jobId, scopeId, objectKey]);
    expect(stored.rowCount, "one consistent verified historical upload/original pair and its synthetic bytes").toBe(1);
    const saved = stored.rows[0]!;
    expect(saved).toMatchObject({ state: "verified", upload_id: uploadId, kind: "original", evidence_type: "site_photo", object_version_id: version, sha256, metadata_matches: true });
    expect(saved.bytes).toEqual(bytes);
    expect(createHash("sha256").update(saved.bytes as Buffer).digest("hex")).toBe(saved.sha256);
    expect(Number(saved.byte_length)).toBe(bytes.length);
    return { id, sha256, objectKey };
   });
   await extras.raiseExtra(x.ctx, direct(x, x.members.supervisor)); await extras.raiseExtra(x.ctx, direct(x, x.members.supervisor, { evidenceId: p.id }));
   const run: Run = (sql, values) => up.admin.query(sql, values);
   const preColumns: Record<string, string[]> = {}, preKeys: Record<string, string[]> = {};
   for (const t of tables) {
    preColumns[t] = (await run("SELECT a.attname::text AS name FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`])).rows.map(r => r.name as string);
    preKeys[t] = (await run(`SELECT k FROM (SELECT ${keys[t]} AS k FROM app.${t}) s ORDER BY k COLLATE "C"`)).rows.map(r => r.k as string);
    expect(preKeys[t]!.length, `${t} holds at least one pre-existing row`).toBeGreaterThan(0);
   }
   // Compare existing rows by NAMED pre-existing columns, as canonical text (row_to_json), matched by identity; and each column's name and FULL type.
   const proof = async (r: Run) => {
    const types: Record<string, string[]> = {}, rows: Record<string, string[]> = {};
    for (const t of tables) {
     types[t] = (await r("SELECT a.attname::text||' '||format_type(a.atttypid,a.atttypmod) AS column_type FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped AND a.attname::text=ANY($2::text[]) ORDER BY a.attname::text COLLATE \"C\"", [`app.${t}`, preColumns[t]])).rows.map(x => x.column_type as string);
     rows[t] = (await r(`SELECT row_to_json(snap)::text AS bytes FROM (SELECT ${preColumns[t]!.map(n => `"${n}"`).join(",")} FROM app.${t} WHERE ${keys[t]}=ANY($1::text[])) snap ORDER BY row_to_json(snap)::text COLLATE "C"`, [preKeys[t]])).rows.map(x => x.bytes as string);
     expect(rows[t]!.length, `${t}: every pre-existing row is still present`).toBe(preKeys[t]!.length);
    }
    return { types, rows };
   };
   const baseline = await proof(run), holds = async (r: Run) => { expect(await proof(r)).toEqual(baseline); };
   const catalog = async () => ({
    functions: new Map((await run("SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' AS id,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') AND p.prokind IN('f','p')")).rows.map(r => [r.id as string, r.definition as string])),
    others: await Promise.all([
     "SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('app','identity','control_plane','audit_control') ORDER BY 1,2",
     "SELECT table_schema,table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema IN('app','identity','control_plane','audit_control') ORDER BY 1,2,ordinal_position",
     "SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND a.attacl IS NOT NULL ORDER BY 1,2",
     "SELECT n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace ORDER BY 1,2,3",
     "SELECT tgrelid::regclass::text relation,tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1,2",
     "SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname IN('app','identity','control_plane','audit_control') ORDER BY 1,2,3",
     "SELECT * FROM pg_policies ORDER BY schemaname,tablename,policyname",
     "SELECT has_table_privilege('jobguard_runtime',c.oid,'SELECT') s,has_table_privilege('jobguard_runtime',c.oid,'INSERT') i,has_table_privilege('jobguard_runtime',c.oid,'UPDATE') u,has_table_privilege('jobguard_runtime',c.oid,'DELETE') d,c.relname FROM pg_class c WHERE c.relnamespace='app'::regnamespace AND c.relkind='r' ORDER BY c.relname",
    ].map(async sql => (await run(sql)).rows)),
   });
   const before = await catalog();
   await apply(MIGRATION_URLS.find(u => nameOf(u) === own)!);
   const after = await catalog();
   // Exactly the five routines are new; every function that existed before N has the same text.
   const added = [...after.functions.keys()].filter(k => !before.functions.has(k)).sort();
   expect(added).toEqual(["app.ent3d_confirmation_document(p_tenant uuid, p_job uuid, p_confirmation uuid, p_content_sha256 text)", "app.ent3d_content_sha256(p_job uuid, p_description text, p_note text, p_photo_sha256 text)", "app.ent3d_record_resident_confirmation(p_actor uuid, p_job uuid, p_command uuid, p_confirmation uuid, p_description text, p_note text, p_photo uuid, p_shown_content_sha256 text)", "app.ent3d_require_site_extra_evidence(p_job uuid, p_variation uuid)", "app.ent3d_site_extra_evidence(p_job uuid, p_description text, p_note text, p_photo uuid, p_confirmation uuid, p_variation uuid)"]);
   for (const [key, definition] of before.functions) expect(after.functions.get(key), key).toBe(definition);
   // No table, column, trigger, constraint, index or policy was added, and the table privileges of the runtime login are unchanged.
   expect(after.others).toEqual(before.others);
   await holds(run);
   // Everything after N, twice.
   await migrate(up.admin); await migrate(up.admin);
   await holds(run);
   // Controls: each runs in a rolled-back transaction with the very same comparison.
   const rolledBack = async (change: (r: Run) => Promise<void>, then: (r: Run) => Promise<void>) => { const client = await up.admin.connect(); const r: Run = (sql, values) => client.query(sql, values); try { await client.query("BEGIN"); await change(r); await then(r); } finally { await client.query("ROLLBACK"); client.release(); } };
   const fails = (r: Run) => expect(holds(r)).rejects.toMatchObject({ name: "AssertionError" });
   const microsecond: Record<Table, string> = { evidence_upload: "server_received_at=server_received_at+interval '1 microsecond'", evidence_object: "server_verified_at=server_verified_at+interval '1 microsecond'", extra_origin: "server_recorded_at=server_recorded_at+interval '1 microsecond'", variation: "created_at=created_at+interval '1 microsecond'" };
   for (const t of tables) await rolledBack(async r => { await r("SET LOCAL session_replication_role=replica"); expect((await r(`UPDATE app.${t} SET ${microsecond[t]} WHERE ctid=(SELECT ctid FROM app.${t} LIMIT 1)`)).rowCount).toBe(1); }, async r => { const now = await proof(r); expect(now.types).toEqual(baseline.types); expect(now.rows[t]).not.toEqual(baseline.rows[t]); await fails(r); });
   await rolledBack(async r => { await r("ALTER TABLE app.variation ALTER COLUMN description TYPE varchar(501)"); }, async r => { const now = await proof(r); expect(now.rows).toEqual(baseline.rows); expect(now.types.variation).not.toEqual(baseline.types.variation); await fails(r); });
   const body = "SELECT p.prosrc AS body FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1";
   await rolledBack(async r => {
    for (const t of tables) await r(`ALTER TABLE app.${t} ADD COLUMN ent3d_added_later text`);
    const original = (await r("SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p WHERE p.pronamespace='app'::regnamespace AND p.proname='contractor_member_active' ORDER BY p.oid LIMIT 1")).rows[0]!.definition as string;
    const previous = (await r(body)).rows[0]!.body as string, replaced = original.replace(/\$function\$\s*$/, () => "-- replaced after 0141 by the control\n$function$");
    expect(replaced).not.toBe(original); await r(replaced); expect((await r(body)).rows[0]!.body).not.toBe(previous);
   }, holds);
   // A row added later (here an upload row) is ignored: rows are matched by identity.
   await rolledBack(async r => { await r("SET LOCAL session_replication_role=replica"); await r("INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,expires_at) SELECT gen_random_uuid(),tenant_id,job_id,'tenants/added/later',expected_sha256,expected_content_type,maximum_bytes,retention_class,'pending',expires_at FROM app.evidence_upload LIMIT 1"); }, holds);
   expect((await run("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rowCount).toBe(1);
  } finally { await up.close(); }
 });
});
