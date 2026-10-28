import { afterAll,beforeAll,describe,expect,it } from "vitest";
import { createWorkFixture,closeWorkFixture,seedWorkJob,workTenant,type WorkFixture } from "./job-work-state-fixtures.js";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { MIGRATION_URLS } from "../src/index.js";
import { readCatalogue, readProtectionRecord, routineIdentity } from "./lp-0-catalog.js";

// Private recording format only. No historical protection comparison or LP0-13/22 implementation.
const captureFormat = "ch4-ci-catalogue-capture.v1";
const captureScope = "ch4-0201-routines-and-trigger-relation-closure.v1";
const captureSignatures = [
 "app.ch4_require_command_owner(uuid,uuid,text)",
 "app.ch4_command_work_facts(uuid,uuid,text)",
 "app.ch4_require_open(uuid,uuid)",
 "app.ch4_admit_place(uuid,uuid,text)",
 "app.ch4_legacy_command_owned(uuid,uuid)",
 "app.ch4_work_state_command(uuid,uuid,text,jsonb)",
 "app.ch4_record_work_state(uuid,uuid,text,jsonb)",
 "app.ch4_link_post_lock_job(uuid,uuid,text,jsonb)",
 "app.guard_watchdog_input()",
 "app.ch4_storage_integrity()",
 "app.ch4_guard_final_check_admission()",
 "app.job_source_insert_guard()",
 "app.reveal_shadow_signals(uuid,uuid)",
 "app.issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)",
 "app.ch4_guard_new_site_work()",
];
const captureTriggerSignatures = [
 "app.guard_watchdog_input()", "app.ch4_storage_integrity()", "app.ch4_guard_final_check_admission()",
 "app.job_source_insert_guard()", "app.ch4_guard_new_site_work()",
];
const captureSeeds = [
 "app.action_authorization", "app.action_outbox", "app.command_receipt", "app.customer_invoice",
 "app.customer_invoice_evidence", "app.customer_invoice_sequence", "app.customer_message_source",
 "app.decision", "app.decision_resolution", "app.final_account_invoice_binding", "app.final_account_invoiced_line",
 "app.job_diary_entry", "app.job_link", "app.job_photo_purpose", "app.job_site_source_receipt",
 "app.job_source_original", "app.job_work_state_event", "app.watchdog_command_identity",
];
const captureCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const captureHash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
function captureRequire(condition: unknown, message: string): asserts condition {
 if (!condition) throw new Error(`CH4 capture incomplete: ${message}`);
}
// Arrays retain their order here. Set-like record collections are explicitly sorted below;
// source, configuration, events and all raw nested arrays remain lossless.
function captureCanonical(value: unknown): string {
 if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
 if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
 if (Array.isArray(value)) return `[${value.map(captureCanonical).join(",")}]`;
 captureRequire(typeof value === "object", "non-JSON value in payload");
 const record = value as Record<string, unknown>;
 return `{${Object.keys(record).sort(captureCompare).map(key => `${JSON.stringify(key)}:${captureCanonical(record[key])}`).join(",")}}`;
}
function captureSorted<T>(rows: readonly T[], key: (row: T) => string): T[] {
 return [...rows].sort((a,b) => captureCompare(key(a),key(b)) || captureCompare(captureCanonical(a),captureCanonical(b)));
}
function captureUnique<T>(rows: readonly T[], key: (row: T) => string, label: string) {
 const keys = rows.map(key);
 captureRequire(new Set(keys).size === keys.length, `duplicate ${label}`);
}
function captureCorrespondence<A,B>(a: readonly A[], ak: (row: A) => string, b: readonly B[], bk: (row: B) => string, label: string) {
 captureUnique(a,ak,label); captureUnique(b,bk,label);
 captureRequire(captureCanonical(a.map(ak).sort(captureCompare)) === captureCanonical(b.map(bk).sort(captureCompare)), `${label} row/preimage coverage`);
}
const captureRelationKey = (r: {schema: string; name: string}) => `${r.schema}.${r.name}`;
const captureAttachmentKey = (r: {relation: string; name: string}) => captureCanonical([r.relation,r.name]);
function captureAcl<T extends {acl: {grantee: string; privilege: string; grantable: boolean}[]}>(row: T): T {
 return {...row,acl:captureSorted(row.acl,a=>captureCanonical([a.grantee,a.privilege,a.grantable]))};
}

async function captureSource(path: string) {
 const bytes = await readFile(new URL(`../../../${path}`,import.meta.url));
 return { path, bytes: bytes.length, sha256: captureHash(bytes) };
}
async function captureProvenance() {
 const paths = [
  "packages/db/test/job-work-state-catalog.integration.test.ts", "packages/db/test/job-work-state-fixtures.ts",
  "packages/db/test/lp-0-catalog.ts", "packages/db/test/lp-0-authority-paths.integration.test.ts",
  "packages/db/migrations/0201_job_work_state_commands.sql", "docs/contracts/lp-0-effective-privileges-v1.json",
  "packages/db/src/index.ts", "packages/db/src/migrate.ts", "packages/db/test/pool-test-utils.ts",
  "package.json", "packages/db/package.json", "pnpm-lock.yaml",
 ];
 const sources = await Promise.all(paths.map(captureSource));
 const registered = await Promise.all(MIGRATION_URLS.map(async (url,ordinal) => {
  const bytes = await readFile(url);
  return { ordinal, name: basename(fileURLToPath(url)), bytes: bytes.length, sha256: captureHash(bytes) };
 }));
 captureRequire(registered.length > 0,"empty registered migration sequence");
 captureUnique(registered,r=>r.name,"registered migration");
 const packages = await Promise.all(["typescript","vitest","pg","embedded-postgres"].map(async name => {
  const bytes = await readFile(new URL(`../node_modules/${name}/package.json`,import.meta.url));
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  captureRequire(parsed !== null && typeof parsed === "object" && "version" in parsed && typeof parsed.version === "string",`installed ${name} version`);
  return {name,version:parsed.version,packageJsonSha256:captureHash(bytes)};
 }));
 // CI normally checks out a detached HEAD. Other layouts stay explicitly unavailable;
 // no subprocess, arbitrary environment enumeration or guessed branch-derived SHA.
 let checkout: {sha: string | null; evidence: string};
 try {
  const head = (await readFile(new URL("../../../.git/HEAD",import.meta.url),"utf8")).trim();
  checkout = /^[0-9a-f]{40}$/u.test(head) ? {sha:head,evidence:"detached .git/HEAD bytes"} : {sha:null,evidence:"unavailable at emission: HEAD is not a detached SHA"};
 } catch { checkout = {sha:null,evidence:"unavailable at emission: .git/HEAD not readable"}; }
 const ci = Object.fromEntries([
  "GITHUB_SHA","GITHUB_REF","GITHUB_HEAD_REF","GITHUB_BASE_REF","GITHUB_RUN_ID","GITHUB_RUN_ATTEMPT",
  "GITHUB_WORKFLOW","GITHUB_JOB","GITHUB_EVENT_NAME","GITHUB_REPOSITORY",
 ].map(key => [key,process.env[key] ?? null]));
 return {sources:captureSorted(sources,r=>r.path),registered,packages:captureSorted(packages,r=>r.name),checkout,ci,node:process.version};
}

type CaptureDefinition = {requested: string; identity: string; definition: string; digest: string};
type CaptureTrigger = {relation: string; name: string; identity: string; definition: string; digest: string};
type CapturePolicy = {relation: string; name: string; qual: string | null; with_check: string | null};

async function captureCatalogue(f: WorkFixture) {
 const provenance = await captureProvenance();
 const client = await f.admin.connect();
 let open = false;
 try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"); open = true;
  const metadata = (await client.query(`SELECT current_database() AS database,current_user AS query_user,session_user AS session_user,
   current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation,
   version() AS postgres_version,current_setting('server_version_num') AS server_version_num,
   current_setting('server_encoding') AS encoding,current_setting('TimeZone') AS timezone,
   d.datcollate AS collation,d.datctype AS ctype,transaction_timestamp()::text AS snapshot_time
   FROM pg_database d WHERE d.datname=current_database()`)).rows;
  captureRequire(metadata.length === 1 && metadata[0].read_only === "on" && metadata[0].isolation === "repeatable read","snapshot metadata");
  const full = await readCatalogue(client,"jobguard_runtime");
  const protection = readProtectionRecord(full); // Before projection: retain full known source-scan context.
  const requested = captureSignatures.map(s=>`function:${s}`).sort(captureCompare);
  const routines = captureSorted(full.routines.filter(r=>requested.includes(routineIdentity(r))).map(captureAcl),routineIdentity);
  captureCorrespondence(routines,routineIdentity,requested,s=>s,"requested routine");
  const definitions = (await client.query<CaptureDefinition>(`SELECT u.signature AS requested,
   'function:'||n.nspname||'.'||p.proname||'('||array_to_string(ARRAY(SELECT format_type(t,NULL)
    FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(t,o) ORDER BY o),',')||')' AS identity,
   pg_get_functiondef(p.oid) AS definition,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS digest
   FROM unnest($1::text[]) u(signature) JOIN pg_proc p ON p.oid=to_regprocedure(u.signature)
   JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.prokind='f'`,[captureSignatures])).rows;
  captureCorrespondence(definitions,r=>r.identity,routines,routineIdentity,"routine definition");
  for (const r of routines) {
   const d = definitions.find(d=>d.identity===routineIdentity(r))!;
   captureRequire(d.requested === `${r.schema}.${r.name}(${r.args})` && typeof d.definition === "string" && d.definition.length > 0,"exact routine resolution/preimage");
   captureRequire(typeof r.definitionDigest === "string" && /^[0-9a-f]{64}$/u.test(r.definitionDigest),"routine definition digest");
   captureRequire(captureHash(d.definition) === d.digest && d.digest === r.definitionDigest,"current routine preimage byte integrity");
  }
  // Exact OID resolution is used only for joining; no transient OID is emitted.
  const attachments = (await client.query<CaptureTrigger>(`SELECT n.nspname||'.'||c.relname AS relation,t.tgname AS name,
   'function:'||pn.nspname||'.'||p.proname||'('||array_to_string(ARRAY(SELECT format_type(x,NULL)
    FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(x,o) ORDER BY o),',')||')' AS identity,
   pg_get_triggerdef(t.oid,false) AS definition,encode(sha256(convert_to(pg_get_triggerdef(t.oid,false),'UTF8')),'hex') AS digest
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
   WHERE NOT t.tgisinternal AND n.nspname !~ '^(pg_|information_schema$)'
   AND t.tgfoid=ANY(ARRAY(SELECT to_regprocedure(s)::oid FROM unnest($1::text[]) s))`,[captureTriggerSignatures])).rows;
  captureUnique(attachments,captureAttachmentKey,"discovered attachment");
  for (const a of attachments) captureRequire(captureTriggerSignatures.includes(a.identity.slice("function:".length)),"attachment exact routine identity");
  // Union only identities; actual raw rows and preimages are never deduplicated.
  const closure = [...new Set([...captureSeeds,...attachments.map(a=>a.relation)])].sort(captureCompare);
  const relations = captureSorted(full.relations.filter(r=>closure.includes(captureRelationKey(r))).map(r=>({
   ...captureAcl(r),columns:captureSorted(r.columns.map(captureAcl),c=>c.column),
   options:[...r.options].sort(captureCompare),dependsOn:[...r.dependsOn].sort(captureCompare),
  })),captureRelationKey);
  captureCorrespondence(relations,captureRelationKey,closure,s=>s,"relation closure");
  const policies = captureSorted(full.policies.filter(p=>closure.includes(p.relation)).map(p=>({...p,roles:[...p.roles].sort(captureCompare)})),captureAttachmentKey);
  const triggers = captureSorted(full.triggers.filter(t=>closure.includes(t.relation)),captureAttachmentKey);
  const policyExpressions = (await client.query<CapturePolicy>(`SELECT schemaname||'.'||tablename AS relation,policyname AS name,qual,with_check
   FROM pg_policies WHERE schemaname||'.'||tablename=ANY($1::text[])`,[closure])).rows;
  const triggerDefinitions = (await client.query<CaptureTrigger>(`SELECT n.nspname||'.'||c.relname AS relation,t.tgname AS name,
   'function:'||pn.nspname||'.'||p.proname||'('||array_to_string(ARRAY(SELECT format_type(x,NULL)
    FROM unnest(p.proargtypes::oid[]) WITH ORDINALITY a(x,o) ORDER BY o),',')||')' AS identity,
   pg_get_triggerdef(t.oid,false) AS definition,encode(sha256(convert_to(pg_get_triggerdef(t.oid,false),'UTF8')),'hex') AS digest
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   JOIN pg_proc p ON p.oid=t.tgfoid JOIN pg_namespace pn ON pn.oid=p.pronamespace
   WHERE NOT t.tgisinternal AND n.nspname||'.'||c.relname=ANY($1::text[])`,[closure])).rows;
  captureCorrespondence(policies,captureAttachmentKey,policyExpressions,captureAttachmentKey,"policy");
  captureCorrespondence(triggers,captureAttachmentKey,triggerDefinitions,captureAttachmentKey,"trigger");
  for (const p of policies) {
   const e = policyExpressions.find(e=>captureAttachmentKey(e)===captureAttachmentKey(p))!;
   captureRequire((e.qual === null || typeof e.qual === "string") && (e.with_check === null || typeof e.with_check === "string"),"policy nullable preimages");
   captureRequire(/^[0-9a-f]{64}$/u.test(p.digest) && captureHash(`${e.qual ?? ""}\n${e.with_check ?? ""}`) === p.digest,"current policy preimage byte integrity");
  }
  for (const t of triggerDefinitions) {
   captureRequire(typeof t.definition === "string" && t.definition.length > 0 && /^[0-9a-f]{64}$/u.test(t.digest) && captureHash(t.definition) === t.digest,"current trigger preimage byte integrity");
   captureRequire(full.routines.some(r=>routineIdentity(r)===t.identity),"resolved trigger function");
  }
  for (const a of attachments) {
   const t = triggerDefinitions.find(t=>captureAttachmentKey(t)===captureAttachmentKey(a));
   captureRequire(t && captureCanonical(a)===captureCanonical(t),"attachment/closure preimage correspondence");
  }
  const schemas = [...new Set([...routines.map(r=>r.schema),...relations.map(r=>r.schema)])].sort(captureCompare);
  const schemaRows = captureSorted(full.schemas.filter(s=>schemas.includes(s.name)).map(captureAcl),s=>s.name);
  captureCorrespondence(schemaRows,s=>s.name,schemas,s=>s,"schema");
  const projected = {
   routines:captureSorted(protection.routines.filter(r=>requested.includes(r.identity)),r=>r.identity),
   rls:protection.rls.filter(s=>closure.includes(s.split("|")[0]!)).sort(captureCompare),
   policies:protection.policies.filter(s=>closure.includes(s.split("|")[0]!)).sort(captureCompare),
   triggers:protection.triggers.filter(s=>closure.includes(s.split("|")[0]!)).sort(captureCompare),
  };
  captureCorrespondence(projected.routines,r=>r.identity,routines,routineIdentity,"protection routine projection");
  captureRequire(projected.policies.length===policies.length && projected.triggers.length===triggers.length,"protection projection coverage");
  const effective = captureSorted(full.effective.filter(e=>
   e.cls === "routine" ? requested.includes(e.object) : e.cls === "rel" ? closure.includes(e.object) :
   e.cls === "col" ? closure.some(r=>e.object.startsWith(`${r}.`)) : e.cls === "schema" ? schemas.includes(e.object) : e.cls === "database"
  ),e=>captureCanonical([e.subject,e.cls,e.object,e.privilege]));
  const applied = (await client.query<{migration_name: string; applied_at: string}>(
   "SELECT migration_name,applied_at::text AS applied_at FROM public.jobguard_schema_migration ORDER BY migration_name"
  )).rows;
  captureUnique(applied,r=>r.migration_name,"applied migration ledger");
  const counts = {
   routines:routines.length,routineDefinitions:definitions.length,seedRelations:captureSeeds.length,
   discoveredAttachments:attachments.length,relations:relations.length,policies:policies.length,policyExpressions:policyExpressions.length,
   triggers:triggers.length,triggerDefinitions:triggerDefinitions.length,schemas:schemaRows.length,
   roles:full.roles.length,memberships:full.memberships.length,reach:full.reach.length,effective:effective.length,databases:full.databases.length,
   protectionRoutines:projected.routines.length,protectionRls:projected.rls.length,protectionPolicies:projected.policies.length,protectionTriggers:projected.triggers.length,
   sourceFiles:provenance.sources.length,installedPackages:provenance.packages.length,registeredMigrations:provenance.registered.length,appliedMigrations:applied.length,
  };
  captureUnique(full.roles,r=>r.name,"role context");
  captureUnique(full.memberships,r=>captureCanonical([r.role,r.member]),"membership context");
  captureUnique(full.reach,r=>captureCanonical([r.from,r.to]),"reach context");
  captureUnique(effective,r=>captureCanonical([r.subject,r.cls,r.object,r.privilege]),"effective context");
  captureRequire(full.databases.length===1 && full.databases[0]!.name===full.database,"current database context");
  const payload = {
   format:captureFormat,scope:captureScope,
   observation:{capturedAt:new Date().toISOString(),predecessor:"72521431722f3e6e06b2df388e4e49b67c07df9a",comparisonBase:"dc5721230fd8aedbf2d9d0457789074b66b48765",metadata,
    fixture:{profile:"CH4 createWorkFixture(): postgres database; migrate then installLegacySyntheticPartyFixtures",installationOutcome:"existing beforeAll returned successfully",
     runtimeLogin:f.runtime.options.user ?? null,readerSubject:full.subject,queryActor:metadata[0].query_user,
     legacyFixtureRoutineObserved:full.routines.some(r=>routineIdentity(r)==="function:app.test_fixture_job_parties()"),
     legacyInvoiceTriggerObserved:full.triggers.some(t=>t.relation==="app.customer_invoice" && t.name==="aaa_explicit_invoice_fixture")},
    server:full.server,database:full.database,provenance,
    appliedLedger:{source:"packages/db/src/migrate.ts",relation:"public.jobguard_schema_migration",ordering:"migration_name",rows:captureSorted(applied,r=>r.migration_name)}},
   coverage:{requestedRoutines:requested,observedRoutines:routines.map(routineIdentity),seedRelations:[...captureSeeds].sort(captureCompare),
    triggerFunctionTargets:captureTriggerSignatures.map(s=>`function:${s}`).sort(captureCompare),
    closureAlgorithm:"18 seeds UNION non-system relations with any non-internal trigger tgfoid resolved from the five exact signatures; disabled triggers retained; no recursive expansion",
    discoveredAttachments:captureSorted(attachments,captureAttachmentKey),relationIdentities:closure,
    attachmentsByTarget:captureTriggerSignatures.map(s=>({identity:`function:${s}`,attachments:captureSorted(attachments.filter(a=>a.identity===`function:${s}`),captureAttachmentKey)})).sort((a,b)=>captureCompare(a.identity,b.identity)),
    byRelation:closure.map(relation=>({relation,policies:policies.filter(p=>p.relation===relation).map(p=>p.name),triggers:triggers.filter(t=>t.relation===relation).map(t=>t.name)})),counts},
   raw:{scope:"15 exact routines; relation closure and every policy/non-internal trigger; selected schemas; complete roles/memberships/reach; scoped effective privileges and current database",
    routines,relations,policies,triggers,schemas:schemaRows,roles:captureSorted(full.roles.map(r=>({...r,settings:[...r.settings].sort(captureCompare)})),r=>r.name),
    memberships:captureSorted(full.memberships,r=>captureCanonical([r.role,r.member,r.admin,r.inherit,r.set])),
    reach:captureSorted(full.reach,r=>captureCanonical([r.from,r.to,r.inherit,r.set])),effective,databases:captureSorted(full.databases.map(captureAcl),r=>r.name)},
   preimages:{routineDefinitions:captureSorted(definitions,r=>r.identity),policyExpressions:captureSorted(policyExpressions,captureAttachmentKey),triggerDefinitions:captureSorted(triggerDefinitions,captureAttachmentKey)},
   protection:{scope:"Derived from full catalogue before projection; complete selected routine records and closure summaries",...projected},
   interpretation:{digests:{routine:"reader/PostgreSQL SHA-256 UTF-8 pg_get_functiondef",policy:"reader/PostgreSQL SHA-256 UTF-8 coalesce(qual,'') + newline + coalesce(with_check,'')",
     trigger:"diagnostic PostgreSQL SHA-256 UTF-8 pg_get_triggerdef(oid,false)",payload:"Node SHA-256 exact canonical UTF-8 bytes",source:"Node SHA-256 actual source bytes"},
    selfChecks:"current preimage/reader byte consistency, completeness and transport only; no historical expected protections",
    encoding:"sorted object keys and identity/composite-key record collections; ACLs, column ACL records, policy roles, role settings, relation options/dependencies are sorted as sets with duplicates preserved; migration registry order, routine config, trigger events and all source strings retain observed order",
    limits:["LP0-13 and LP0-22 held; no protection equivalence or security clearance","runtimeExecute is direct ACL observation; effective authority and role reach are separate",
     "staticWrites/staticCalls are regex hypotheses, not complete behavioral dependencies","fully installed synthetic fixture includes legacy setup and successors; not isolated 0201 proof or SQL-to-catalogue equivalence",
     "random runtime role, timestamps and run metadata are volatile; same observed records encode deterministically, fresh databases need not match",
     "registered source hashes and observed applied ledger are distinct evidence; neither isolates final routine origin","root must bind actual tested checkout/run and retain verified raw log plus original payload; final job outcome unavailable at emission"]},
  };
  const encoded = captureCanonical(payload);
  captureRequire(captureCanonical(JSON.parse(encoded))===encoded,"canonical JSON round-trip");
  captureRequire(captureCanonical(captureSorted([...routines].reverse(),routineIdentity))===captureCanonical(routines),"current record-order encoding consistency");
  const bytes = Buffer.from(encoded,"utf8");
  const base64 = bytes.toString("base64");
  const chunks = base64.match(/.{1,3000}/gu) ?? [];
  captureRequire(chunks.length > 0,"empty transport");
  const frames = chunks.map((data,index)=>({index:index+1,total:chunks.length,data}));
  captureRequire(frames.every((f,i)=>f.index===i+1 && f.total===frames.length && f.data.length<=3000),"chunk sequence");
  const reconstructed = Buffer.from(frames.map(f=>f.data).join(""),"base64");
  captureRequire(reconstructed.equals(bytes) && reconstructed.toString("base64")===base64 && captureHash(reconstructed)===captureHash(bytes),"current-byte transport round-trip");
  await client.query("COMMIT"); open = false;
  // Each marker is one bounded plain string; ordinary runner prefixes do not hide frame boundaries.
  console.log(`CH4_CAPTURE_BEGIN ${captureCanonical({format:captureFormat,scope:captureScope})}`);
  for (const frame of frames) console.log(`CH4_CAPTURE_CHUNK ${captureCanonical(frame)}`);
  console.log(`CH4_CAPTURE_END ${captureCanonical({format:captureFormat,scope:captureScope,counts,chunks:chunks.length,bytes:bytes.length,sha256:captureHash(bytes)})}`);
  console.log("CH4_CAPTURE_COMPLETE observation emitted; delivery, CI outcome, reviews and acceptance pending");
 } catch (error) {
  if (open) {
   try { await client.query("ROLLBACK"); }
   catch (rollbackError) { throw new AggregateError([error,rollbackError],"CH4 capture failed and rollback failed"); }
  }
  throw error;
 } finally { client.release(); }
}

const tables=["job_link","job_photo_purpose","job_site_source_receipt","job_work_state_event"];
describe("CH-4 actual catalog and privilege boundary",()=>{
 let f:WorkFixture;beforeAll(async()=>{f=await createWorkFixture()},60000);afterAll(async()=>closeWorkFixture(f));
 it("CH4-A21 exact owners FORCE RLS and SELECT-only runtime rights",async()=>{
  const rows=(await f.admin.query(`SELECT c.relname,pg_get_userbyid(c.relowner) owner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1) ORDER BY c.relname`,[tables])).rows;
  expect(rows).toEqual(tables.map(relname=>({relname,owner:"jobguard_migration",relrowsecurity:true,relforcerowsecurity:true})));
  for(const table of tables){
   const rights=(await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') read,has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') write",[`app.${table}`])).rows[0];expect(rights).toEqual({read:true,write:false});
   for(const role of ["jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') allowed",[role,`app.${table}`])).rows[0].allowed).toBe(false);
  }
  const publicAcl=(await f.admin.query("SELECT p.proname,p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ch4_%'")).rows;
  expect(publicAcl.length).toBeGreaterThan(0);for(const row of publicAcl){expect(row.owner).toBe("jobguard_migration");expect(row.proconfig).toContain("search_path=pg_catalog");}
  const held=(await f.admin.query("SELECT proname FROM pg_proc WHERE proname IN('ch4_admit_snagging_photo')")).rows;expect(held).toEqual([]);
  for(const name of ["ch4_record_work_state","ch4_link_post_lock_job"]){
   const signatures=(await f.admin.query("SELECT p.oid::regprocedure::text signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=$1",[name])).rows;
   expect(signatures).toEqual([{signature:`app.${name}(uuid,uuid,text,jsonb)`}]);
   expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[signatures[0].signature])).rows[0].allowed).toBe(true);
   for(const role of ["jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_function_privilege($1,$2,'EXECUTE') allowed",[role,signatures[0].signature])).rows[0].allowed).toBe(false);
  }
 });
 it("private legacy ownership helper is read-only with no execute grants; live guard retains invoker security",async()=>{
  const helper=(await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig FROM pg_proc WHERE oid='app.ch4_legacy_command_owned(uuid,uuid)'::regprocedure")).rows[0];
  expect(helper).toEqual({owner:"jobguard_migration",prosecdef:false,provolatile:"s",proconfig:["search_path=pg_catalog"]});
  for(const role of ["jobguard_runtime","jobguard_infrastructure","jobguard_shadow","jobguard_shadow_emergency_access"])expect((await f.admin.query("SELECT has_function_privilege($1,'app.ch4_legacy_command_owned(uuid,uuid)','EXECUTE') allowed",[role])).rows[0].allowed).toBe(false);
  const guard=(await f.admin.query("SELECT pg_get_userbyid(proowner) owner,prosecdef,proconfig FROM pg_proc WHERE oid='app.guard_watchdog_input()'::regprocedure")).rows[0];
  expect(guard).toEqual({owner:"jobguard_migration",prosecdef:false,proconfig:["search_path=pg_catalog, app"]});
 });
 it("CH4-A20 missing malformed context and cross-tenant reads fail closed; private helpers are not callable",async()=>{
  const a=await seedWorkJob(f);
  expect((await f.runtime.query("SELECT * FROM app.job_work_state_event")).rows).toEqual([]);
  await expect(workTenant(f.runtime,"invalid",db=>db.query("SELECT * FROM app.job_work_state_event"))).rejects.toThrow();
  for(const table of tables)await expect(workTenant(f.runtime,a.tenantId,db=>db.query(`TRUNCATE app.${table}`))).rejects.toThrow();
  const functions=(await f.admin.query("SELECT p.oid::regprocedure::text signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname LIKE 'ch4_%' AND p.proname NOT IN('ch4_read_work_facts','ch4_record_work_state','ch4_link_post_lock_job')")).rows;
  for(const fn of functions)expect((await f.admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[fn.signature])).rows[0].allowed).toBe(false);
 });
 it("records the unconditional CH4 synthetic catalogue observation for CI collection",async()=>{
  await captureCatalogue(f);
 },60000);
});
