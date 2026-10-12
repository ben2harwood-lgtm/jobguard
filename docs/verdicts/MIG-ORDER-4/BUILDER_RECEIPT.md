# MIG-ORDER-4 builder receipt

Issued 12 October 2026. Base: `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6`, also local `origin/main` at inspection. Working-tree changes only; dispatcher owns commit and integration. Check lane RED: these edits reshape merged upgrade proofs for money-record tables. Fresh Claude Opus and a separate Codex Sol check, exact-commit verdicts and separate acceptance remain pending. This document reports source inspection unless a command result explicitly states execution.

The issued header strikes draft items 2 and 5. `packages/db/test/audit-export.integration.test.ts` is untouched, excluded from the lane and from the failure-preservation table. Its security catalogue proof remains as merged; its port belongs to FIXLATER-4 (F1). MO4-2 and MO4-5 are withdrawn, and MO4-6 applies to the three authorized proof files only. No security test, product code, migration, shared fixture, dependency or time budget changes.

Standing rule 9, quoted verbatim:

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

## Table A — authorized old-shape proofs

| Item | File | Migration | Old fault | Result in this tree |
|---|---|---|---|---|
| 1 DW4 | `recovery-eligibility-v3.integration.test.ts` | 0119 | Whole-row and complete-set comparison after later migrations; no N-alone step | Whole-row text at N alone; old rows by identity and named columns/types afterwards |
| 3 prevention | `prevention-checks.integration.test.ts` | 0103 | All-but-N install; driver-parsed whole-row comparison | Before-N install; N alone; canonical text comparison; later migrations twice |
| 4 activation terms | `job-activation-terms.integration.test.ts` | 0109 | Runner wrapper installed all but N; parsed whole-row join | Before-N install with 0095's runner mode; N alone; text join; old rows/types afterwards; Mac stop rule applies |

Audit-export is struck from this table. The search documented in the issued order was read; no claim that its repository-wide search was executed again. S8, SV-2, AC9 and other proofs remain outside this lane. MO4-6 uses one shared comparison implementation in `upgrade-proof-utils.ts`, imported by these three files. There is no test in that helper and no assertion about another file's bytes.

## Is anything that used to fail for a real reason now passing? [MO4-0]

Source-inspected answer: no intended real failure is removed. Database execution is still required before either checker can confirm that answer. Only DW4 deliberately allows a later added column or row; its complete-row/set check still runs at 0119 alone. Prevention and activation previously installed later migrations before taking their snapshots, so moving the full comparison to N alone removes no later-migration comparison they actually made. Both now also detect later changes/removal of old rows and changes/removal of old column types.

Line numbers below are in the final working tree; DW4, prevention and activation abbreviate the three filenames in Table A.

| Proof | What the merged test stopped on | Enforcing line now | At least as strict? |
|---|---|---|---|
| 1 DW4 | 0119 changes an old value or its column set | DW4:119 [MO4-1c], captured by the unchanged whole-row text query at :40 immediately after 0119 | Yes: same complete text rows; no later migration is included |
| 1 | 0119 adds or removes a row | DW4:119 [MO4-1c] | Yes: complete row set equality at N alone |
| 1 | Later changes an old value, removes an old row, drops/renames/retypes an old column | DW4:140 [MO4-1e]; shared helper :36–49 | Yes: exact named text by primary-key identity, plus full types; ignores only newly added rows/columns |
| 1 | Migration failure or runner not repeatable | DW4:84, unchanged double runner call | Yes: both calls and complete registry at :139 must succeed |
| 3 prevention | 0103 changes the old quoting job | Prevention:203 [MO4-3c], and :204 | Yes, stronger: whole-row text preserves microseconds; also checks old types |
| 3 | 0103 not recorded once, runner failure or not repeatable | Prevention:269 unchanged registry row-count assertion; :265 unchanged double runner call; :202 and :268 exact registries | Yes: original checks remain, with isolated and full registry checks |
| 4 activation | 0109 changes/adds/removes a row observed by the joined snapshot; terms row for historic activation; names out of order; incomplete registry; 0109 not one transaction | Activation:129 [MO4-4c]; :130 unchanged zero-terms assertion; :198 unchanged ordering/registry assertions after moving the declaration; :199 unchanged transaction-text assertion | Yes: same join as text at N alone, retains all existing assertions, and rejects an empty join at :123 and empty compared tables at :125 |
| 4 | Runner failure or not repeatable | Activation:195 unchanged double runner call | Yes: both calls and complete registry at :198 must succeed |

The shared comparison reports missing/different old-row text and old column name/type differences. A removed or renamed column reports `(gone)` and avoids selecting that missing column. New rows are ignored by iterating only pre-existing identities. Keys and row bytes are generated with separate `row_to_json(...)::text` sub-selects; no compared field passes through pg's timestamp parser. Control identity JSON is read only to bind the recorded primary key in SQL. Each old row has a corresponding guard before assertions, and every table's controls must be present (counts 1, 1, 2).

## Controls [MO4-1d, MO4-3d, MO4-4d]

All controls run after N alone and before the unchanged runner pair. Every scratch statement uses `rolledBack` on one client from the existing pool, with `ROLLBACK` and release in nested finalizers. All comparisons call the shared `proofDifferences`. DW4 setup captures results and its named DW4 test asserts them; the other proofs assert inside their existing upgrade tests. Every scratch work block sets transaction-local replication mode. No added column goes on a fingerprinted table.

| Control, for each of four compared tables | Code: DW4 / prevention / activation | Expected result (NOT RUN) |
|---|---|---|
| (a) Stored time + one microsecond, targeting the recorded tenant/id | :48 / :212 / :139 | Exactly one row changed; exactly that identity reported `changed`; empty types |
| (a2) Delete the same old row | :53 / :217 / :144 | Exactly one row removed; exactly that identity reported `missing`; empty types |
| (b) Real column retype | :58 / :222 / :149 | Empty rows; one full-type difference, varchar(200) to varchar(201) for reason/title, varchar(80) to varchar(81) for each fee-policy column |
| (b2) List-form retype | :63 / :227 / :154 | Copy of one recorded type gets ` mo4 scratch`; exactly that old-type-to-live-type line appears; empty rows |
| (c) Added nullable text column, verified through client | :67 / :231 / :158 | Column exists; no row/type difference. Activation's scratch column is always on `app.job_activation`, including the cap-table control |
| (d) Replace `app.half_even_ratio(bigint,bigint,bigint)` | :72 / :236 / :163 | Re-read definition contains `mo4 scratch`; no row/type difference |
| (e) Later insert | :76 / :240 / :167 | Exactly one inserted row; no difference for any old identity |
| (f) Nothing left behind | :81, :83 / :245, :264 / :174, :193–194 | Empty differences and live ordered names/types equal the before-N snapshot |

Assertions of these exact result objects are DW4:123, prevention:250 and activation:179. Function replacement requires `$function$` and changes its first occurrence only. The routine's definition is never compared after the runner pair. Inserts use fresh identities: DW4 reuses its merged insert with revision 2 and new row/command IDs; prevention reuses its quoting-job insert with a fresh ID; activation/cap copy only the 0012 columns, with fresh id/job_id and fresh cap activation_id under replication mode. No new database, login or pool is introduced.

If PostgreSQL refuses a real retype, the Mac helper must report the exact message and which control relied on (b2). The tree contains no catch, skip, replacement control or retry. A refused statement is a pending result, not a pass; any authorized response must be recorded separately.

## Item 4 hazard and integration boundaries

Read the invoked path: `demo-seed.ts:79–99`, `synthetic-party-fixture.ts`, `quote-repository.ts`, `quote-delivery-repository.ts`, `quote-document-repository.ts`, `acceptance-repository.ts`, `commands.ts`, `outbox.ts`, `activation-repository.ts` and `tenant-context.ts`. The historic setup calls `prepareActivationFixtureV3`, which saves/prices a draft, previews/issues/executes fake delivery and attests acceptance; then it dispatches `SwitchJobLiveMutation` v1 directly. It does not call `PracticeActivationRepository.view/start`, `SwitchJobLiveV3Mutation` or identity-session services.

No directly invoked SQL was found requiring an object created in 0110 or later. Relevant objects are in 0001–0012/0009 (scope, drafts, lines, rate observations, quote documents, acceptance and v1 activation), 0005/0006 (membership expiry/revocation, commands and outbox), 0001 audit support, and 0095 (parties, snapshot guard and revised v1 activation). The 0095 installation exactly uses the runner's `BEGIN;` replacement with `synthetic_demo`. This is source inspection, not a proof that today's code runs on the older schema.

The issued stop rule remains mandatory: if the Mac run cannot fill the before-0109 state through these unchanged calls, restore the entire activation test file to its merged bytes, proceed with items 1 and 3, and give the coordinator one FIX-LATER line for this proof. Do not write replacement inserts or install later migrations first. This withdrawal is not a repair round.

#138 shares the DW4 file, but this task removes/replaces only original line 63 and inserts after original lines 12, 20 and 33. Original lines 13–20 and 26–33 are unchanged; the stated #138 import after 15 and body around 298–339 are not edited. The base is the latest local main at dispatch; no fetch or Git write was attempted. A main refresh must recheck those hunks and stop item 1 if overlap appears. The lane registry is the shared registration file: serialize integration with its other editing owners.

Coordinator follow-up (no tracker or BUILD_PLAN edit in this lane): SV-2's proof needs a rule-9 extension line for later migrations twice and canonical text. S8's existing line stays. Audit-export remains open for its own authorized security-proof decision and FIXLATER-4's port. Item 4 gets a line only if the Mac stop rule fires. This task closes only the DW4 and prevention portions of the old-shape lines once verified and merged; it does not close the audit-export portion or port.

## Literal changed-line record [MO4-7, MO4-9]

The zero-context diff below gives the literal removed lines and their replacement/inserted lines, including the one lane entry. These are the only modified existing files. The new helper follows in full. The receipt itself is new; its original state is absent. Original DW4 lines removed/replaced: 63 only. Prevention: 191, 194, 196. Activation: 108–110, 115, 116, 118. All remaining original lines, including assertion names and time budgets, are byte-identical. These statements were checked with a temporary read-only SequenceMatcher script, not a standing test.

### config/agent-lane-assignments.json

```diff
diff --git a/config/agent-lane-assignments.json b/config/agent-lane-assignments.json
index c9a1740..e3d4eb2 100644
--- a/config/agent-lane-assignments.json
+++ b/config/agent-lane-assignments.json
@@ -80,0 +81 @@
+"mig-order-4":{"branches":["codex/sandbox/mig-order-4"],"receipt":"docs/verdicts/MIG-ORDER-4/BUILDER_RECEIPT.md","note":"Routine, check lane RED: three old-shape upgrade proofs on main (0103, 0109, 0119) install everything before their own migration by name, apply it alone and make the merged comparison there, then run everything later twice and compare only pre-existing rows by identity on their named pre-existing columns as text, with names and types; in-test rolled-back controls; one shared comparison helper; no migration, no product code, no other test. Audit-export excluded by issued order.","allow":["packages/db/test/recovery-eligibility-v3.integration.test.ts","packages/db/test/prevention-checks.integration.test.ts","packages/db/test/job-activation-terms.integration.test.ts","packages/db/test/upgrade-proof-utils.ts","config/agent-lane-assignments.json","docs/verdicts/MIG-ORDER-4/**"]},
```

### packages/db/test/recovery-eligibility-v3.integration.test.ts

```diff
diff --git a/packages/db/test/recovery-eligibility-v3.integration.test.ts b/packages/db/test/recovery-eligibility-v3.integration.test.ts
index a310e89..8971cc5 100644
--- a/packages/db/test/recovery-eligibility-v3.integration.test.ts
+++ b/packages/db/test/recovery-eligibility-v3.integration.test.ts
@@ -13,0 +14 @@ import { closeTestPools, freePort } from "./pool-test-utils.js";
+import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
@@ -20,0 +22 @@ const oldJob=randomUUID(),oldCase=randomUUID();
+let upgradeProof: { proof: Awaited<ReturnType<typeof proofBefore>>; ownRegistry: string[]; ownRows: unknown[]; controls: Array<{ table: string; microsecond: unknown; missing: unknown; retype: unknown; listRetype: unknown; nullable: unknown; replaced: unknown; inserted: unknown; after: unknown; columns: unknown }>; afterControls: Awaited<ReturnType<typeof proofDifferences>> };
@@ -33,0 +36,48 @@ beforeAll(async()=>{
+ const proof = await proofBefore(admin, ["app.recovery_eligibility_revision"]);
+ await admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
+ await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [names[index]]);
+ const ownRegistry = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name as string);
+ const ownRows = (await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows;
+ const controls = [];
+ for (const [table, was] of Object.entries(proof)) {
+   const identity = Object.keys(was.rows)[0];
+   if (!identity) continue; // The pre-existing-row guard reports this in the proof test.
+   const key = JSON.parse(identity) as { tenant_id: string; id: string };
+   const values = [key.tenant_id, key.id];
+   const time = "created_at", column = "reason", newType = "character varying(201)", scratchTable = table;
+   const microsecond = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     const changed = await client.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond' WHERE (tenant_id=$1) AND (id=$2)`, values);
+     return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+   });
+   const missing = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     const changed = await client.query(`DELETE FROM ${table} WHERE (tenant_id=$1) AND (id=$2)`, values);
+     return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+   });
+   const retype = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${newType}`);
+     return await proofDifferences(client, proof);
+   });
+   const listRetype = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     return await proofDifferences(client, { ...proof, [table]: { ...was, typed: { ...was.typed, [column]: `${was.typed[column]} mo4 scratch` } } });
+   });
+   const nullable = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     await client.query(`ALTER TABLE ${scratchTable} ADD COLUMN mo4_scratch text`);
+     return { exists: (await proofColumns(client, scratchTable)).some(c => c.name === "mo4_scratch" && c.type === "text"), differences: await proofDifferences(client, proof) };
+   });
+   const replaced = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     return { replaced: await scratchReplaceFunction(client, "app.half_even_ratio(bigint,bigint,bigint)"), differences: await proofDifferences(client, proof) };
+   });
+   const inserted = await rolledBack(admin, async client => {
+     await client.query("SET LOCAL session_replication_role=replica");
+     const changed = await client.query(`INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,2,1,1,'reference-d03.v1',1,'pending_money','excluded',NULL,'GBP','Pending money cannot qualify','[]','reviewed','reviewer:previous',$5,$6)`,[randomUUID(),T,oldJob,oldCase,randomUUID(),"a".repeat(64)]);
+     return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+   });
+   controls.push({ table, microsecond, missing, retype, listRetype, nullable, replaced, inserted, after: await proofDifferences(admin, proof), columns: await proofColumns(admin, table) });
+ }
+ upgradeProof = { proof, ownRegistry, ownRows, controls, afterControls: await proofDifferences(admin, proof) };
@@ -63 +113,29 @@ it.each([["F15","merchant_overcharge",0,"Credit note below the £250 minimum"],[
-it("DW4 migration preserves previous reviews byte-for-byte and version",async()=>{expect((await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows).toEqual(legacy);});
+it("DW4 migration preserves previous reviews byte-for-byte and version",async()=>{
+ const { proof } = upgradeProof;
+ expect(Object.keys(proof["app.recovery_eligibility_revision"]!.rows).length, "[MO4-1a] pre-existing review row").toBeGreaterThan(0);
+ const names = MIGRATION_URLS.map(u => basename(fileURLToPath(u))), index = names.indexOf("0119_recovery_eligibility_v3.sql");
+ expect(index, "[MO4-1b] migration by name").toBeGreaterThan(0);
+ expect(upgradeProof.ownRegistry, "[MO4-1b] N alone registry").toEqual(names.slice(0, index + 1));
+ expect(upgradeProof.ownRows, "[MO4-1c] complete rows at N alone").toEqual(legacy);
+ for (const result of upgradeProof.controls) {
+   const { table } = result, was = proof[table]!, identity = Object.keys(was.rows)[0]!;
+   const column = "reason", newType = "character varying(201)";
+   expect(result, "[MO4-1d] rolled-back controls (a)-(f)").toEqual({
+     table,
+     microsecond: { count: 1, differences: { rows: [`${table} ${identity}: changed`], types: [] } },
+     missing: { count: 1, differences: { rows: [`${table} ${identity}: missing`], types: [] } },
+     retype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} -> ${newType}`] },
+     listRetype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} mo4 scratch -> ${was.typed[column]}`] },
+     nullable: { exists: true, differences: { rows: [], types: [] } },
+     replaced: { replaced: true, differences: { rows: [], types: [] } },
+     inserted: { count: 1, differences: { rows: [], types: [] } },
+     after: { rows: [], types: [] },
+     columns: was.names.map(name => ({ name, type: was.typed[name] })),
+   });
+ }
+ expect(upgradeProof.controls, "[MO4-1d] one table's controls").toHaveLength(1);
+ expect(upgradeProof.afterControls, "[MO4-1d] nothing left behind").toEqual({ rows: [], types: [] });
+ // fingerprinted-row-shape.integration.test.ts owns "may never gain a column"; recovery_eligibility_revision, job, job_activation and cap_snapshot are absent from its list.
+ expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO4-1e] all migrations registry").toEqual(names);
+ expect(await proofDifferences(admin, proof), "[MO4-1e] identified old rows and types after all migrations").toEqual({ rows: [], types: [] });
+});
```

### packages/db/test/prevention-checks.integration.test.ts

```diff
diff --git a/packages/db/test/prevention-checks.integration.test.ts b/packages/db/test/prevention-checks.integration.test.ts
index 753b1cc..8fe5f57 100644
--- a/packages/db/test/prevention-checks.integration.test.ts
+++ b/packages/db/test/prevention-checks.integration.test.ts
@@ -10,0 +11 @@ import { closeTestPools, freePort } from "./pool-test-utils.js";
+import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
@@ -191 +192,2 @@ describe("MON-7a real PostgreSQL guarantees", () => {
-      for(const url of MIGRATION_URLS.filter(url=>!url.pathname.endsWith("0103_prevention_checks.sql"))){await upgrade.query(await readFile(url,"utf8"));await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
+      const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("/0103_prevention_checks.sql"));expect(own, "[MO4-3b] migration by name").toBeGreaterThan(0);
+      for(const url of MIGRATION_URLS.slice(0,own)){await upgrade.query(await readFile(url,"utf8"));await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
@@ -194 +196,69 @@ describe("MON-7a real PostgreSQL guarantees", () => {
-      const before=(await upgrade.query("SELECT * FROM app.job WHERE id=$1",[id])).rows;
+      const before=(await upgrade.query("SELECT row_to_json(j)::text AS bytes FROM app.job j WHERE id=$1",[id])).rows;
+      const proof = await proofBefore(upgrade, ["app.job"]);
+      expect(Object.keys(proof["app.job"]!.rows).length, "[MO4-3a] pre-existing job row").toBeGreaterThan(0);
+      await upgrade.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
+      await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [MIGRATION_URLS[own]!.pathname.split("/").at(-1)]);
+      const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
+      expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO4-3b] N alone registry").toEqual(names.slice(0, own + 1));
+      expect((await upgrade.query("SELECT row_to_json(j)::text AS bytes FROM app.job j WHERE id=$1",[id])).rows, "[MO4-3c] whole job row at N alone").toEqual(before);
+      expect(await proofDifferences(upgrade, proof), "[MO4-3c] old rows and types at N alone").toEqual({ rows: [], types: [] });
+      const controls = [];
+      for (const [table, was] of Object.entries(proof)) {
+        const identity = Object.keys(was.rows)[0];
+        if (!identity) continue; // The pre-existing-row guard reports this in the proof test.
+        const key = JSON.parse(identity) as { tenant_id: string; id: string };
+        const values = [key.tenant_id, key.id];
+        const time = "created_at", column = "title", newType = "character varying(201)", scratchTable = table;
+        const microsecond = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          const changed = await client.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond' WHERE (tenant_id=$1) AND (id=$2)`, values);
+          return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+        });
+        const missing = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          const changed = await client.query(`DELETE FROM ${table} WHERE (tenant_id=$1) AND (id=$2)`, values);
+          return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+        });
+        const retype = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${newType}`);
+          return await proofDifferences(client, proof);
+        });
+        const listRetype = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          return await proofDifferences(client, { ...proof, [table]: { ...was, typed: { ...was.typed, [column]: `${was.typed[column]} mo4 scratch` } } });
+        });
+        const nullable = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          await client.query(`ALTER TABLE ${scratchTable} ADD COLUMN mo4_scratch text`);
+          return { exists: (await proofColumns(client, scratchTable)).some(c => c.name === "mo4_scratch" && c.type === "text"), differences: await proofDifferences(client, proof) };
+        });
+        const replaced = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          return { replaced: await scratchReplaceFunction(client, "app.half_even_ratio(bigint,bigint,bigint)"), differences: await proofDifferences(client, proof) };
+        });
+        const inserted = await rolledBack(upgrade, async client => {
+          await client.query("SET LOCAL session_replication_role=replica");
+          const changed = await client.query("INSERT INTO app.job(tenant_id,id,title,status) VALUES($1,$2,'Earlier fictional job','quoting')", [tenant,randomUUID()]);
+          return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+        });
+        controls.push({ table, microsecond, missing, retype, listRetype, nullable, replaced, inserted, after: await proofDifferences(upgrade, proof), columns: await proofColumns(upgrade, table) });
+      }
+      for (const result of controls) {
+        const { table } = result, was = proof[table]!, identity = Object.keys(was.rows)[0]!;
+        const column = "title", newType = "character varying(201)";
+        expect(result, "[MO4-3d] rolled-back controls (a)-(f)").toEqual({
+          table,
+          microsecond: { count: 1, differences: { rows: [`${table} ${identity}: changed`], types: [] } },
+          missing: { count: 1, differences: { rows: [`${table} ${identity}: missing`], types: [] } },
+          retype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} -> ${newType}`] },
+          listRetype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} mo4 scratch -> ${was.typed[column]}`] },
+          nullable: { exists: true, differences: { rows: [], types: [] } },
+          replaced: { replaced: true, differences: { rows: [], types: [] } },
+          inserted: { count: 1, differences: { rows: [], types: [] } },
+          after: { rows: [], types: [] },
+          columns: was.names.map(name => ({ name, type: was.typed[name] })),
+        });
+      }
+      expect(controls, "[MO4-3d] one table's controls").toHaveLength(1);
+      expect(await proofDifferences(upgrade, proof), "[MO4-3d] nothing left behind").toEqual({ rows: [], types: [] });
@@ -196 +266,3 @@ describe("MON-7a real PostgreSQL guarantees", () => {
-      expect((await upgrade.query("SELECT * FROM app.job WHERE id=$1",[id])).rows).toEqual(before);
+      // fingerprinted-row-shape.integration.test.ts owns "may never gain a column"; recovery_eligibility_revision, job, job_activation and cap_snapshot are absent from its list.
+      expect(await proofDifferences(upgrade, proof), "[MO4-3e] identified old rows and types after all migrations").toEqual({ rows: [], types: [] });
+      expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO4-3e] all migrations registry").toEqual(names);
```

### packages/db/test/job-activation-terms.integration.test.ts

```diff
diff --git a/packages/db/test/job-activation-terms.integration.test.ts b/packages/db/test/job-activation-terms.integration.test.ts
index ceb14d0..4dd09dd 100644
--- a/packages/db/test/job-activation-terms.integration.test.ts
+++ b/packages/db/test/job-activation-terms.integration.test.ts
@@ -10,0 +11 @@ import { freePort, closeTestPools } from "./pool-test-utils.js";
+import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
@@ -108,3 +109,8 @@ describe("CH-1 v3 activation",()=>{
-   // The existing migration runner, on real PG, is told the last migration is
-   // already applied only during this setup pass. Its earlier SQL is unchanged.
-   await migrate({query:async(sql:string,values?:unknown[])=>values?.[0]==="0109_job_activation_terms.sql"&&sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")?{rows:[{}],rowCount:1}:upgrade.query(sql,values)} as Pick<Pool,"query">);
+   const names=MIGRATION_URLS.map(url=>fileURLToPath(url).split("/").at(-1)!),own=names.indexOf("0109_job_activation_terms.sql"),feed=names.indexOf("0106_practice_feed.sql");
+   expect(own, "[MO4-4b] migration by name").toBeGreaterThan(0);
+   await upgrade.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz DEFAULT clock_timestamp())");
+   for (const url of MIGRATION_URLS.slice(0,own)) {
+    const name=fileURLToPath(url).split("/").at(-1)!,sql=await readFile(url,"utf8");
+    await upgrade.query(name === "0095_job_parties.sql" ? sql.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : sql);
+    await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[name]);
+   }
@@ -115,2 +121,9 @@ describe("CH-1 v3 activation",()=>{
-   const snapshot=async()=>(await upgrade.query(`SELECT row_to_json(a) activation,row_to_json(c) snapshot FROM app.job_activation a JOIN app.cap_snapshot c ON(c.tenant_id,c.activation_id)=(a.tenant_id,a.id)`)).rows;
-   const before=await snapshot();await migrate(upgrade);await migrate(upgrade);expect(await snapshot()).toEqual(before);
+   const snapshot=async()=>(await upgrade.query(`SELECT row_to_json(a)::text activation,row_to_json(c)::text snapshot FROM app.job_activation a JOIN app.cap_snapshot c ON(c.tenant_id,c.activation_id)=(a.tenant_id,a.id)`)).rows;
+   const before=await snapshot();
+   expect(before.length, "[MO4-4a] pre-existing joined rows").toBeGreaterThan(0);
+   const proof=await proofBefore(upgrade, ["app.job_activation","app.cap_snapshot"]);
+   for (const [table, was] of Object.entries(proof)) expect(Object.keys(was.rows).length, `[MO4-4a] ${table} pre-existing row`).toBeGreaterThan(0);
+   await upgrade.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
+   await upgrade.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[names[own]]);
+   expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name), "[MO4-4b] N alone registry").toEqual(names.slice(0,own+1));
+   expect(await snapshot(), "[MO4-4c] complete joined rows at N alone").toEqual(before);
@@ -118 +131,68 @@ describe("CH-1 v3 activation",()=>{
-   const names=MIGRATION_URLS.map(url=>fileURLToPath(url).split("/").at(-1)!),own=names.indexOf("0109_job_activation_terms.sql"),feed=names.indexOf("0106_practice_feed.sql");expect(feed).toBeGreaterThanOrEqual(0);expect(own).toBeGreaterThan(feed);expect(names.every((name,index)=>index===0||names[index-1]<name)).toBe(true);expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(names);
+   const controls = [];
+   for (const [table, was] of Object.entries(proof)) {
+     const identity = Object.keys(was.rows)[0];
+     if (!identity) continue; // The pre-existing-row guard reports this in the proof test.
+     const key = JSON.parse(identity) as { tenant_id: string; id: string };
+     const values = [key.tenant_id, key.id];
+     const time = table === "app.job_activation" ? "activated_at" : "created_at";
+     const column = "fee_policy_version", newType = "character varying(81)", scratchTable = "app.job_activation";
+     const microsecond = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       const changed = await client.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond' WHERE (tenant_id=$1) AND (id=$2)`, values);
+       return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+     });
+     const missing = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       const changed = await client.query(`DELETE FROM ${table} WHERE (tenant_id=$1) AND (id=$2)`, values);
+       return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+     });
+     const retype = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${newType}`);
+       return await proofDifferences(client, proof);
+     });
+     const listRetype = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       return await proofDifferences(client, { ...proof, [table]: { ...was, typed: { ...was.typed, [column]: `${was.typed[column]} mo4 scratch` } } });
+     });
+     const nullable = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       await client.query(`ALTER TABLE ${scratchTable} ADD COLUMN mo4_scratch text`);
+       return { exists: (await proofColumns(client, scratchTable)).some(c => c.name === "mo4_scratch" && c.type === "text"), differences: await proofDifferences(client, proof) };
+     });
+     const replaced = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       return { replaced: await scratchReplaceFunction(client, "app.half_even_ratio(bigint,bigint,bigint)"), differences: await proofDifferences(client, proof) };
+     });
+     const inserted = await rolledBack(upgrade, async client => {
+       await client.query("SET LOCAL session_replication_role=replica");
+       const changed = await client.query(table === "app.job_activation"
+         ? `INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at,recorded_at) SELECT gen_random_uuid(),tenant_id,gen_random_uuid(),accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at,recorded_at FROM app.job_activation WHERE (tenant_id=$1) AND (id=$2)`
+         : `INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative,created_at) SELECT gen_random_uuid(),tenant_id,gen_random_uuid(),gen_random_uuid(),baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative,created_at FROM app.cap_snapshot WHERE (tenant_id=$1) AND (id=$2)`, values);
+       return { count: changed.rowCount, differences: await proofDifferences(client, proof) };
+     });
+     controls.push({ table, microsecond, missing, retype, listRetype, nullable, replaced, inserted, after: await proofDifferences(upgrade, proof), columns: await proofColumns(upgrade, table) });
+   }
+   for (const result of controls) {
+     const { table } = result, was = proof[table]!, identity = Object.keys(was.rows)[0]!;
+     const column = "fee_policy_version", newType = "character varying(81)";
+     expect(result, "[MO4-4d] rolled-back controls (a)-(f)").toEqual({
+       table,
+       microsecond: { count: 1, differences: { rows: [`${table} ${identity}: changed`], types: [] } },
+       missing: { count: 1, differences: { rows: [`${table} ${identity}: missing`], types: [] } },
+       retype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} -> ${newType}`] },
+       listRetype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} mo4 scratch -> ${was.typed[column]}`] },
+       nullable: { exists: true, differences: { rows: [], types: [] } },
+       replaced: { replaced: true, differences: { rows: [], types: [] } },
+       inserted: { count: 1, differences: { rows: [], types: [] } },
+       after: { rows: [], types: [] },
+       columns: was.names.map(name => ({ name, type: was.typed[name] })),
+     });
+   }
+   expect(controls, "[MO4-4d] both tables' controls").toHaveLength(2);
+   expect(await proofDifferences(upgrade, proof), "[MO4-4d] nothing left behind").toEqual({ rows: [], types: [] });
+   for (const [table, was] of Object.entries(proof)) expect(await proofColumns(upgrade, table), `[MO4-4d] ${table} columns after all controls`).toEqual(was.names.map(name => ({ name, type: was.typed[name] })));
+   await migrate(upgrade);await migrate(upgrade);
+   // fingerprinted-row-shape.integration.test.ts owns "may never gain a column"; recovery_eligibility_revision, job, job_activation and cap_snapshot are absent from its list.
+   expect(await proofDifferences(upgrade, proof), "[MO4-4e] identified old rows and types after all migrations").toEqual({ rows: [], types: [] });
+   expect(feed).toBeGreaterThanOrEqual(0);expect(own).toBeGreaterThan(feed);expect(names.every((name,index)=>index===0||names[index-1]<name)).toBe(true);expect((await upgrade.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(names);
```

### New file: packages/db/test/upgrade-proof-utils.ts

Before: absent. After:

```ts
import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool | PoolClient, "query">;
type ProofTable = { names: string[]; typed: Record<string, string>; key: string[]; rows: Record<string, string> };
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const tableIdent = (table: string) => {
  const parts = table.split(".");
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error(`Schema-qualified table required: ${table}`);
  return parts.map(ident).join(".");
};

export async function proofRows(db: Queryable, table: string, names: string[], key: string[]) {
  const found = (await db.query(`SELECT identity,bytes FROM (SELECT (SELECT row_to_json(k)::text FROM (SELECT ${key.map(name => `t.${ident(name)}`).join(",")}) k) AS identity,
    (SELECT row_to_json(s)::text FROM (SELECT ${names.map(name => `t.${ident(name)}`).join(",")}) s) AS bytes FROM ${tableIdent(table)} t) x ORDER BY identity COLLATE "C"`)).rows;
  return Object.fromEntries(found.map(row => [row.identity as string, row.bytes as string]));
}

export async function proofColumns(db: Queryable, table: string) {
  return (await db.query(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
    WHERE (a.attrelid=$1::regclass) AND (a.attnum>0) AND (NOT a.attisdropped) ORDER BY a.attnum`, [tableIdent(table)])).rows as { name: string; type: string }[];
}

export async function proofBefore(db: Queryable, tables: string[]) {
  const proof: Record<string, ProofTable> = {};
  for (const table of tables) {
    const columns = await proofColumns(db, table);
    const key = (await db.query(`SELECT a.attname::text AS name FROM pg_index i JOIN pg_attribute a ON (a.attrelid=i.indrelid) AND (a.attnum=ANY(i.indkey))
      WHERE (i.indrelid=$1::regclass) AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`, [tableIdent(table)])).rows.map(row => row.name as string);
    if (!key.length) throw new Error(`${table}: no primary key`);
    const names = columns.map(column => column.name);
    proof[table] = { names, typed: Object.fromEntries(columns.map(column => [column.name, column.type])), key, rows: await proofRows(db, table, names, key) };
  }
  return proof;
}

export async function proofDifferences(db: Queryable, proof: Record<string, ProofTable>) {
  const rows: string[] = [], types: string[] = [];
  for (const [table, was] of Object.entries(proof)) {
    const now = new Map((await proofColumns(db, table)).map(column => [column.name, column.type]));
    for (const name of was.names) if (now.get(name) !== was.typed[name]) types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name) ?? "(gone)"}`);
    if (was.names.some(name => !now.has(name))) continue;
    const live = await proofRows(db, table, was.names, was.key);
    for (const [identity, bytes] of Object.entries(was.rows)) {
      if (!(identity in live)) rows.push(`${table} ${identity}: missing`);
      else if (live[identity] !== bytes) rows.push(`${table} ${identity}: changed`);
    }
  }
  return { rows, types };
}

export async function rolledBack<T>(pool: Pool, work: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try { await client.query("BEGIN"); return await work(client); }
  finally { try { await client.query("ROLLBACK"); } finally { client.release(); } }
}

export async function scratchReplaceFunction(db: Queryable, signature: string) {
  const read = async () => (await db.query("SELECT pg_get_functiondef($1::regprocedure) AS definition", [signature])).rows[0]!.definition as string;
  const definition = await read();
  if (!definition.includes("$function$")) throw new Error(`${signature}: expected $function$ delimiter`);
  await db.query(definition.replace("$function$", "$function$/* mo4 scratch */"));
  return (await read()).includes("mo4 scratch");
}
```

## Scope evidence (read-only)

`git diff origin/main --stat` before the new files are included by the dispatcher:

```text
 config/agent-lane-assignments.json                 |  1 +
 .../test/job-activation-terms.integration.test.ts  | 92 ++++++++++++++++++++--
 .../db/test/prevention-checks.integration.test.ts  | 78 +++++++++++++++++-
 .../recovery-eligibility-v3.integration.test.ts    | 80 ++++++++++++++++++-
 4 files changed, 241 insertions(+), 10 deletions(-)
```

New/untracked: this receipt and `packages/db/test/upgrade-proof-utils.ts`. Exactly six authorized paths; no other working-tree edits. No standing hash or byte assertions were created. Selected unowned files were read and hashed only for this receipt:

| File | Before/after SHA-256 (equal) |
|---|---|
| `packages/db/test/audit-export.integration.test.ts` | `99d1b31a941ada69c31b0d9184b00ce8cbebf0efa0c14b6dbec749529ce70c45` |
| `packages/db/test/recovery-timing-pin.integration.test.ts` | `ce3c1fcb46dcc977783d0620e5b8fa9d5b92d04ab4847cde30adf1df7047b429` |
| `packages/db/test/fingerprinted-row-shape.integration.test.ts` | `be34095677e52d4e63c771799c99a11e0e52a73fdf2d85808550b17a583ab3a8` |
| `packages/db/test/pool-test-utils.ts` | `8411ccba37f0cadb0a5e0c56782235af059e5be28fb8a662d00e4d9dff45c22a` |
| `packages/db/test/small-builder-origin.integration.test.ts` | `757e0d9e12685f9a459f74ff1be68b643d0986db1df1026b4b489221ddf28697` |
| `apps/api/src/auth/context-boundary.test.ts` | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |
| `BUILD_PLAN.md` | `ca460330b23037317139c7ae94017c274b5ae2cf18c0db09f422f689da30572c` |
| `packages/db/src/migrate.ts` | `8d9d2364329aff0b206de30aab44e221be0e7ae988483c6bb97ec8d0044f355b` |


## Commands and results

The prescribed four commands ran once each, sequentially in the issued order. Node `v24.17.0`, cached pinned pnpm `10.28.1`; commands used `PATH="/private/tmp/jg-mo4-bin:$PATH" COREPACK_ENABLE_NETWORK=0` to select that cached runner. The install was already present and was not repeated. Typecheck/build cache replay is recorded as such. No installation or package-download command was issued. A preliminary `pnpm --version` through the default wrapper printed a configuration warning and stalled; it was interrupted with exit 130. The cached-runner version check then returned `10.28.1`, exit 0.

| Command | Exit | Observed result/count |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful / 7 tasks, 4 cached, 19.022s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity checked 129 TypeScript files; lane guard stopped at equal base/head; package lint tasks never started |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | `Missing branch or self-comparison range; refusing a misleading pass.` |
| `pnpm build` | 0 | 7 successful / 7 tasks, 4 cached, 51.592s; 27/27 static pages generated |
| `pnpm openapi:check` | 1 | tsx failed before comparison on `listen EPERM` for local IPC |
| `node apps/api/dist/generate-openapi.js --check` | 1 | Compiled checker ran after successful build and reported `openapi.json is stale` |
| `node --input-type=module` (scoped TypeScript compiler API script, log below) | 1 | 32 diagnostics in owned integration files; no source compilation or test execution |
| `node /private/tmp/jg-mo4-type-compare.mjs` (initial and after final restoration assertion) | 0 both runs | Original-source compiler-host comparison: baseline 32 / working tree 32; identical diagnostic codes, messages and source spans; 31 prevention, 1 activation; DW4 and shared helper 0 |
| `git diff --check` | 0 | No whitespace errors |
| Temporary read-only Python scope/original-line/selected-byte inspection, final scope pass | 0 | Exactly six authorized paths, original titles/budgets preserved, allowed original-line replacements only, exact helper export list, no credential-shaped addresses; selected excluded files byte-identical |

The db package's normal typecheck/lint/build cover `src` only. The additional compiler API inspection includes the three modified integration files and their imported helper, reporting diagnostics only in those four owned files. Its 32 diagnostics were compared with `origin/main` content supplied through an in-memory compiler host: each code, message, source span and per-file count is identical. The activation diagnostic is the existing `names[index-1]` assertion; prevention's existing unknown binding types supply the remaining 31. No added helper/control line has a reported diagnostic. The compiler-host comparison was repeated only after self-review added the final activation column-restoration assertion; its final result remains exactly 32 baseline / 32 working-tree diagnostics, identical. Root commands ran once each; their package scopes exclude these test files. This is deterministic source checking, not an integration-test pass, and existing diagnostics were not edited outside the authorized statements.

HEAD and `origin/main` both remain `a0963f405fee263cf2bfe8effe68bbeaa9ae1ff6`. The actual lane guard rejects equal commits before inspecting working-tree paths; both mandated lane commands therefore fail on this uncommitted branch. This tree does not change the guard, choose a different comparison or write Git metadata. After the dispatcher commits, rerun both exact lint commands to obtain real lane/package-lint evidence. The independent read-only scope check does not replace that gate.

OpenAPI remains unresolved. The compiled checker demonstrates a stale document; repairing its generator or `apps/api/openapi.json` is outside this lane. Build emitted nonfatal Turbo cache IO permission warnings, Next workspace-root/lockfile warnings and existing autoprefixer `end` compatibility/webpack cache warnings. Build still exited 0 as recorded.

Logs: `/private/tmp/jg-mig-order-4-typecheck.log`, `-lint.log`, `-lanes.log`, `-build.log`, `-openapi.log`, `-openapi-compiled.log`, `-test-types.log`, `-test-types-baseline.log`, `-test-types-baseline-final.log` with the same prefix. The diagnostic comparison script is `/private/tmp/jg-mo4-type-compare.mjs`. Intended commit message: `/private/tmp/jg-msg-mig-order-4.txt`. No commit, add, checkout, push or merge ran.

## NOT RUN — Mac handoff [MO4-8]

Every database test and control: **NOT RUN (sandbox cannot start PostgreSQL)**. Executed test count: zero. No attempt to start a socket, PostgreSQL cluster or browser for these tests was made. There are no changed standalone unit-test files; no unrelated unit tests or whole-repository/package suite ran under the issued memory limit. `pnpm test:db`, `pnpm test:migrations`, browser suites and root `pnpm test` did not run. No product/web workflow, prompt/model/provider route or migration changed, so browser, live-provider and evaluation evidence are inapplicable to this test-only leaf.

The issued header's only-changed-files restriction supersedes the draft's inclusion of audit-export, AC9 and fingerprinted-row-shape in A/B. Revised Mac runs, sequentially through `~/.local/bin/heavy-slot`, each still using `--maxWorkers=2` and no more than three files:

- Run A: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/recovery-eligibility-v3.integration.test.ts test/prevention-checks.integration.test.ts` — **NOT RUN (sandbox cannot start PostgreSQL)**.
- Run B: `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/job-activation-terms.integration.test.ts` — **NOT RUN (sandbox cannot start PostgreSQL)**. Apply item 4's stop rule before any repair if its before-state setup fails.
- DW4 one-off uncommitted scratch run: add a scratch UPDATE of an old value between the unchanged runner pair at :84 and the after-all check at :140, on the recorded tenant/id; require DW4 to stop at [MO4-1e]; remove the statement and record exact output — **NOT RUN (sandbox cannot start PostgreSQL)**.
- Prevention one-off uncommitted scratch run: insert the scratch UPDATE after the runner pair at :265 and before :267; require [MO4-3e] to stop; remove it and record output — **NOT RUN (sandbox cannot start PostgreSQL)**.
- Activation one-off uncommitted scratch run: insert the scratch UPDATE after the runner pair at :195 and before :197, with transaction-local replication mode for an immutable old row; require [MO4-4e] to stop; remove it and record output — **NOT RUN (sandbox cannot start PostgreSQL)**. Only if item 4 remains in the piece.

Each scratch run uses the existing pool and primary-key identity; no new cluster/login/pool. Exact refused SQL and errors must be recorded, with no automatic control replacement. The coordinator may separately own other unchanged-regression runs, but they are not added to this builder's authorized run list.

Remaining gates: actual PostgreSQL A/B and scratch outcomes; lint and lane guard after commit; stale OpenAPI ownership; fresh Claude Opus review and independent Codex Sol check with the first question above answered on evidence; exact-commit verdicts; separate technical acceptance; dispatcher integration. At most two repair rounds, back to the same Opus reviewer. No migration/data rollback or operational alert is introduced; dropping these working-tree test changes is the reversal. No release, commercial, residency or tax approval is asserted.

## Self-review [MO4-0, MO4-7, MO4-9]

Re-read the complete diff against the issued header and draft. The table above answers every retained section-4 row, names its enforcing line and compares its strength. The only deliberately newly allowed case is a later added DW4 row/column. All original whole-row comparisons remain at N alone; prevention and activation now compare text, and their after-all old-row/type checks strengthen the original coverage. The activation whole-row comparison still uses its merged join; no claim that the old comparison detected unjoined extra rows is made.

Install order is by the own migration's name and `slice(0, own/index)`. DW4's original setup lines 19–33 remain unchanged; prevention's filter and activation's runner wrapper are gone. N alone is one file and one registry insertion, followed by an exact registry assertion/capture. The unchanged runner pairs sit after all controls. After them, the upgrade proofs only read registry names and shared named-column/type differences. The activation migration transaction-text assertion is unchanged. No whole row, security catalogue or routine-definition comparison is introduced after those pairs; existing unrelated tests remain untouched.

All four compared tables have nonempty-row guards; every table's control results and ordered column list are asserted. Self-review added an explicit activation-table column-list assertion after the entire two-table control loop, so the second table's scratch column on the first table is also covered by the final restoration check. Controls use the shared comparison, rollback on their dedicated clients and run before later migrations. The shared helper quotes both schema and table and every column/key identifier, reads full `format_type` modifiers, and errors by table on a missing primary key. The nullable scratch column is only on recovery eligibility, job or job activation. Real statements refusing on the Mac remain a hold; no skip, retry wrapper or budget extension was added.

Scope checked: one lane line in name order, three existing proof files, one support file and this receipt only. No original line beyond those listed in the literal-change record was removed/replaced, no title/budget changed, and #138's stated hunks do not overlap. Audit-export, the untouchable API auth test, other shared helpers/proofs, migration sources/list and BUILD_PLAN remain byte-identical. Mixed SQL predicates added here are bracketed. Added text uses the issued scratch/negative-control/later-migration terminology and introduces no credential-shaped literal. Receipt hashes are read-only evidence; no standing test pins unowned files. No UI work or adjacent repair was attempted.

Builder receipt only — not independently verified, not accepted.
