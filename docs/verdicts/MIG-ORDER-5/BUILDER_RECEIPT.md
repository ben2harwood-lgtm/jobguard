# MIG-ORDER-5 builder receipt

Issued 12 October 2026; check lane RED. Route A, STACKED, as the issue header requires: dispatched HEAD `07f6a69f44a0ed8a18926d755c7add15a3201cda` (PR #145 branch), with the required shared helper present. Imported as `import * as upgradeProof from "./upgrade-proof-utils.js";`; never edited. Dispatcher owns the main catch-up, commit, push and integration. This receipt records source inspection and the commands actually observed; database execution remains pending.

Standing rule 9, quoted verbatim:

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

## Is anything that used to fail for a real reason now passing? [MO5-0]

Source-inspected answer: no intended real failure is removed. This is not yet a database-proven answer. The same four SQL strings and complete catalogue equality remain at 0121's own step. The deliberate differences are rows 8 and 9 below, as authorized in the issue. The older proof placed later migrations inside both snapshots and therefore never compared their effects. The new after-all comparison adds that coverage, including column grants, memberships, `rolcanlogin` and `rolreplication`.

All line references below refer to `packages/db/test/audit-export.integration.test.ts` in this working tree.

| # | What the merged test stopped on | Enforcing line now | At least as strict? |
|---|---|---|---|
| 1 | 0121 changes grants, owner or row-security flags of any table other than its two | :245 [MO5-c], unchanged table SQL at :28; S1, S3, S5, S6 at :147, :149, :151–152 | Yes: same complete comparison at 0121 alone. |
| 2 | 0121 adds a third table, or removes a table, in the five schemas | :245 [MO5-c], tables :28 | Yes: same complete table set; no added-table exemption at 0121's step. |
| 3 | 0121 adds, changes or drops a policy on any other table | :245 [MO5-c], policies :29; S7–S10 at :153–156 | Yes: same complete policy rows/set at 0121 alone. |
| 4 | 0121 adds/drops a routine or changes its grants, owner, `prosecdef` or settings | :245 [MO5-c], routines :30; S11–S12 :157–158, P5 :167, P10 :172 | Yes: same complete catalogue rows/set. Routine bodies were never in the merged four queries. |
| 5 | 0121 changes one of the five role attributes or adds/removes a `jobguard_` role | :245 [MO5-c], roles :31; S13 :159, P6 :168 | Yes: all five unchanged fields and complete role set; named facts additionally see two attributes and memberships. |
| 6 | 0121 is not recorded exactly once | :242 (original :64, byte-identical) | Yes: unchanged assertion, plus exact own/all registry assertions :243, :263. |
| 7 | A migration fails or runner replay is not repeatable | :205 (original :40, byte-identical) | Yes: later migrations run twice in production order, with complete registry :263. |
| 8 | 0121 changes a catalogue row that a later migration created before the old snapshot | No longer compared; the before-N install is :130–134 and isolated 0121 is :137–138 | Deliberately different, not a real failure lost: those objects do not exist at 0121 in production order. A statement naming them fails at 0121's own step. |
| 9 | Runner's second pass changes the catalogue | :268 [MO5-e] detects widening/loosening, not an equal-or-narrower change | Deliberately different, not a real failure lost: `migrate.ts:79–80` skips a recorded file without executing its SQL. Both passes must succeed. |

New enforcement: :268 compares only named permission facts of older objects against the empty list, through :117–118 and :93–116. Matching is kind plus object id first, name second. Appearing facts stop it; disappearing facts do not. Existing-column grants are compared separately. Older policy text changes always stop it; new permissive policies on older row-secured tables and removed restrictive policies stop it; new restrictive policies and removed permissive policies pass. New objects and later columns are ignored. No accepted-widening list exists.

## Controls [MO5-d] — expected outcomes, all database execution NOT RUN

Definitions :146–173; one sequential loop :175–195. Every control, including N1, uses `upgradeProof.rolledBack(admin, client => ...)` on the existing admin pool. Every statement and read stays on that client. No new pool, login, database, fixture or replication-mode setting. Refused statements become `{ error: <message> }`; :250 then fails with the control id and exact recorded message. No weaker replacement or fallback. The shared helper guarantees rollback and release even on refusal. The full merged comparison's changed parts are recorded using `isDeepStrictEqual` at :190, then asserted separately from the named differences.

`<half>` below is the name read from the before-N subject matched by the text OID of `app.half_even_ratio(bigint,bigint,bigint)` (:143–145). It is not a hand-written expected name. S15 replaces only `half_even_ratio` in that recorded name.

| Stop control | Expected `after` | Expected `merged` |
|---|---|---|
| S1 widened TRUNCATE grant | `table app.job: + grant jobguard_runtime TRUNCATE` | tables |
| S2 grant to new NOLOGIN role | `table app.job: + grant mo5_scratch_role SELECT` | tables |
| S3 grant option | `table app.job: + grant jobguard_runtime SELECT WITH GRANT OPTION` | tables |
| S4 older-column grant | `table app.job: + column title grant jobguard_runtime UPDATE` | none |
| S5 owner moved | Contains `table app.job: + owner jobguard_runtime`; every line starts `table app.job: + ` | tables |
| S6 row security switched off/unforced | `table app.job: + row security not forced`; `table app.job: + row security off` (sorted) | tables |
| S7 widened predicate | `policy app.job.tenant_isolation: changed` | policies |
| S8 policy opened to PUBLIC | `policy app.job.tenant_isolation: changed` | policies |
| S9 added permissive policy | `policy app.job.mo5_scratch: permissive policy added` | policies |
| S10 removed restrictive policy | `policy app.merchant.practice_material_isolation: restrictive policy gone` | policies |
| S11 routine grant | `routine <half>: + grant mo5_scratch_role EXECUTE` | routines |
| S12 routine runs as owner | `routine <half>: + runs as owner` | routines |
| S13 role attribute | `role jobguard_runtime: + rolcreatedb` | roles |
| S14 role membership | `role jobguard_runtime: + member of jobguard_migration` | none |
| S15 renamed routine, widened grant | `routine <half with half_even_ratio replaced by mo5_half_renamed>: + grant mo5_scratch_role EXECUTE` | routines |
| N1 list-form identity/name matching | `table app.job: + grant jobguard_runtime SELECT` | not read |

S1 and S4 read and record their privilege preconditions before the scratch statement and assert each is false at :257. N1 deep-copies the snapshot, changes only app.job's OID to `"0"` and removes only its runtime SELECT fact; it calls the same pure `compare` against client-read live facts. S5's expectation intentionally allows other owner-related grants, exactly as issued.

| Pass control | Scratch work | Expected `after` | Expected `merged` |
|---|---|---|---|
| P1 | Revoke runtime INSERT on app.job | `[]` | tables |
| P2 | New table, grants, row security and own policy | `[]` | tables, policies |
| P3 | Shared `scratchReplaceFunction(client, half)`; assert returned true | `[]` | none |
| P4 | Add nullable mo5_scratch column only to app.job; confirm it exists through client | `[]` | none |
| P5 | New routine with default PUBLIC EXECUTE | `[]` | routines |
| P6 | New jobguard_mo5_scratch NOLOGIN CREATEDB role | `[]` | roles |
| P7 | Grant on a newly added app.job column | `[]` | none |
| P8 | New restrictive policy on app.job | `[]` | policies |
| P9 | Remove old permissive tenant policy | `[]` | policies |
| P10 | Change routine search_path setting | `[]` | routines |

Controls use the same `privilegeDifferences` as [MO5-c] and [MO5-e]; N1 uses its one underlying pure `compare`. All 26 expectations are asserted at :248–259. No fingerprinted table gains a column, even temporarily. The scratch columns only target app.job; app.merchant only has its restrictive policy dropped in a rolled-back transaction. After controls :196–204 record the full catalogue, named differences and a text count across tables, routines, policies and roles containing mo5. [MO5-f] :260–262 requires exact catalogue restoration, `[]` and `"0"` respectively.

## Scope, representations and stated limits

The four merged SQL strings are byte-identical; only their query receiver changed to a parameter for client-read controls. At 0121 alone, the complete catalogue equality is captured before the controls and asserted at :245. After the runner pair nothing calls `securityCatalog`, reads routine bodies or settings, or compares whole catalogue rows. :263 asserts the full registry; :268 reads the live named facts. No time budget, title, later test, line 13 or line 29 from the dispatched file changes.

The new query assembles SQL text facts and text OIDs, then returns each selected Subject as `row_to_json(s)::text`. Application-side JSON decoding reconstructs those SQL-built text facts and policy booleans; no driver timestamp/array/JSON parser participates in the comparison. Both table and routine NULL ACLs use `acldefault` before `aclexplode`; column ACLs use `aclexplode(a.attacl)`. Policy text is `row_to_json(x)::text` over exactly permissive, roles, cmd, qual and with_check. Mixed SQL predicates are bracketed.

Not compared at any step: grants on schemas, sequences, views and types, or default privileges. After later migrations only: routine bodies and routine settings; whether a policy got tighter (any older policy text change stops it). An older object dropped with no same-id/name replacement is no longer compared. Renamed older objects still match by id; re-created objects with the same name still match by name. Names/full column types and the one-microsecond/retype controls are **not applicable**: this proof compares no stored data row or column type, and 0121 creates two tables without altering an older one. Their catalogue equivalents are S1–S15 and N1; P3/P4 retain the literal function-replacement/nullable-column pass controls.

Only the issued three paths are working-tree changes. The lane entry was the first edit, one compact line after mig-order-4 and before mon-7a. Shared registration overlap: the lane registry, integration serialized by the dispatcher. Shared helper read/imported, never edited. No migration, product code, BUILD_PLAN, MIGRATIONS, scanner or pinned file is edited. No standing test checks another file's bytes or hashes.

Local origin/main at initial inspection was `17c82ee2822cba9be364297d64e8754b43a57013`, ahead/different from this stacked base. `git diff origin/main` includes inherited MIG-ORDER-4 files and main-only plan/receipt differences; those are not working-tree edits. Exact own changes are separately checked against immutable dispatched HEAD. The dispatcher must merge current main as the issued stacked route requires, retain main-only files, and re-run lane checks on the final candidate. No fetch, Git write, package install or download was requested.

## Commands and results

The prescribed four commands ran once each, sequentially in their issued order. Results below are actual observed exits; cache replay is identified separately from executed tasks. Runtime Node v24.17.0; pinned cached pnpm 10.28.1. The default pnpm launcher reported a different-version warning and did not complete its version probe before interruption (exit 130); no install was requested. Checks use a temporary PATH shim for the existing cached 10.28.1 runner and `COREPACK_ENABLE_NETWORK=0`, with no package download.

| Command | Exit | Observed result/counts |
|---|---:|---|
| `pnpm typecheck` | 0 | 7 successful / 7 total, 4 cached; 1m52.464s |
| `LANE_BASE_REF=origin/main pnpm lint` | 1 | Core purity passed: 129 TypeScript files. Lane boundary then failed on the 5 inherited MIG-ORDER-4 paths below; later lint stages did not execute. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | Same 5 inherited MIG-ORDER-4 paths; no boundary relaxation or substitute comparison run. |
| `pnpm build` | 0 | 7 successful / 7 total, 4 cached; 27/27 static pages; 2m12.102s |
| `pnpm openapi:check` | 1 | tsx stopped before comparing: `listen EPERM` opening its local IPC socket. |
| `node apps/api/dist/generate-openapi.js --check` | 1 | The compiled generator from the successful build ran the same comparison and reported `openapi.json is stale`. |
| Supplemental TypeScript `createProgram`/`getPreEmitDiagnostics` on the changed test and its import graph (Node, no emit) | 0 | 0 changed-file diagnostics, 0 total diagnostics. Unlike the package's src-only checks, this explicitly included the integration file. |
| Temporary read-only Python scope/SQL/line/hash checks and lane JSON/new-text scan | 0 | 4 SQL strings identical; 26 control ids; 9 unchanged test declarations (11 expanded cases by source count); only the named original lines replaced; one lane line; no credential-shaped additions. Source inspection only. |
| `git diff --check` | 0 | No whitespace errors. |

Exact lane failure paths (both lint commands):

```text
docs/verdicts/MIG-ORDER-4/BUILDER_RECEIPT.md
packages/db/test/job-activation-terms.integration.test.ts
packages/db/test/prevention-checks.integration.test.ts
packages/db/test/recovery-eligibility-v3.integration.test.ts
packages/db/test/upgrade-proof-utils.ts
```

These paths pre-existed at dispatch and are byte-identical to dispatched HEAD. The local merge-base comparison still includes #145's changes because this is the expressly authorized stacked route; all five are outside MIG-ORDER-5's allowlist. No additional allow path was added. Final candidate lint/lane checks remain pending after #145 merges and the dispatcher merges main.

Logs: `/private/tmp/jg-mig-order-5-{typecheck,lint,lanes,build,openapi,openapi-compiled}.log`; intended commit subject/body: `/private/tmp/jg-msg-mig-order-5.txt`. No Git write or commit performed. Build/typecheck emitted nonfatal Turbo cache IO `Operation not permitted` warnings. Next also reported its existing multiple-lockfile workspace-root warning and autoprefixer `end` compatibility warnings; build still exited 0. Cache replay is counted separately above. No unit/Vitest tests ran because the sole changed test file requires PostgreSQL; other test files and whole-suite runs are outside the issued memory/scope rules.

## NOT RUN and remaining gates [MO5-4]

All database tests and controls: **NOT RUN (sandbox cannot start PostgreSQL / a browser)**. No observed database test count or hook duration is claimed. No whole-package/repository Vitest run; only the changed database file is authorized. Its declarations/cases stay unchanged (11 expanded cases by source count); the Mac must establish the actual executed count.

The Mac helper must run each through `~/.local/bin/heavy-slot`, sequentially, vitest `--maxWorkers=2`, preserving all current budgets:

| Run | Exact Vitest command / scratch statement directly after the runner pair | Required result | Observed here |
|---|---|---|---|
| A | `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/audit-export.integration.test.ts` | Whole file passes, same test count, all 26 controls and real later migrations pass | NOT RUN (sandbox cannot start PostgreSQL / a browser) |
| X1 | Same command with `-t "leaves every existing table"`; scratch `GRANT TRUNCATE ON app.job TO jobguard_runtime` | Stops only at [MO5-e] with exactly S1's line | NOT RUN (sandbox cannot start PostgreSQL / a browser) |
| X2 | Same filtered command; scratch `ALTER POLICY tenant_isolation ON app.job USING (true)` | Stops only at [MO5-e] with exactly S7's line | NOT RUN (sandbox cannot start PostgreSQL / a browser) |
| X3 | Same filtered command; scratch `ALTER ROLE jobguard_runtime CREATEDB` | Stops only at [MO5-e] with exactly S13's line | NOT RUN (sandbox cannot start PostgreSQL / a browser) |
| X4 | Same filtered command; scratch `REVOKE INSERT ON app.job FROM jobguard_runtime` | Passes | NOT RUN (sandbox cannot start PostgreSQL / a browser) |

For each experiment remove the one uncommitted scratch line by hand, show `git diff --stat` empty against the committed candidate, record exact output and measured setup-hook time. If today's final comparison produces a line, STOP and report the exact line; never change the expectation to hide it. A refused statement, wrong `after` or time budget failure is also a stop/report item. If only a `merged` cell differs, report the observed value for the dispatcher's decision. No statements, expectations or budgets are adjusted in anticipation of those runs.

OpenAPI remains unresolved: the standard command could not open tsx IPC, and the compiled checker reported a stale committed document. Neither the generator nor apps/api/openapi.json is in this lane; no regeneration or adjacent repair was attempted. It needs its separate owner before a full-green claim.

Browser suites: NOT RUN (sandbox cannot start PostgreSQL / a browser); no affected screen or workflow. UI is parked. Model evaluations, live routes, release and deployment are inapplicable to this test-only change. Fresh Claude Opus review and a separate Codex Sol check must each answer the first question above and bind their RED verdict to the exact final commit; both remain pending, as do separate acceptance and dispatcher integration. At most two repair rounds, back to the same Opus reviewer. No independent review or acceptance was performed by this builder.

Dispatcher FIX-LATER follow-up only: schema-level grants remain outside upgrade proofs; SV-2's proof still lacks the later-migrations-twice step. No tracker edit is authorized here. On verification and merge this closes only the audit-export half of the all-but-N FIX-LATER line, with the prevention half belonging to MIG-ORDER-4.

## Self-review

Re-read the entire own diff and the direct origin/main diff against the issued order. The nine-row table above answers failure preservation row by row; these remain source-inspection claims. A read-only deterministic diff check found original removed/replaced ranges only :8, :18, :20–23, :36 and :65; all other original lines are byte-identical. The four SQL strings, import/freePort lines, complete suffix beginning with the second test, every test title/declaration and budgets were checked unchanged. The install is slice(0, own) with own found by name; one file and one registry row applies 0121; exact own registry and both tables are captured before later migrations. Complete equality stays at 0121 alone; after all migrations the assertion is the shared named-fact comparison against [] only.

Checked the subset rule, NULL ACL defaults, grant-option facts, old-column grant filtering, same-kind id/name matching, role attributes/memberships and every policy rule. Controls run before the runner pair, on one existing pool/client each, sequentially and always rolled back. Errors are recorded and asserted as failures; nothing is skipped, retry-wrapped or given more time. All 26 control ids are present, and both preconditions and P3/P4 confirmations are asserted. The post-control catalogue, differences and mo5 count must be restored. New text follows the issued scratch/stop/pass wording and adds no credential-shaped literal. No file outside the lane was edited, no helper changed, no standing bytes/hashes pin was added.

Builder receipt only — not independently verified, not accepted.

## Read-only scope evidence and literal changed-line record [MO5-3, MO5-5]

Compared to immutable dispatched HEAD: only original test lines :8, :18, :20–23, :36 and :65 are replaced; inserts are at the issued locations. The direct `git diff origin/main` was also read; its inherited/absent-main paths are explained above. Working-tree status shows only the lane registry, audit-export test and this new receipt. Tracked own diff: 2 files changed, 212 insertions, 8 deletions; the receipt is untracked until the dispatcher commits it.

Read-only SHA256 equality against dispatched HEAD (not a standing test):

| Untouched file | SHA256 before = after |
|---|---|
| packages/db/test/upgrade-proof-utils.ts | `9c0db8b49cd23bc3bae5dc19bdc9749486bd1869b7d642b37a137d7175b56e49` |
| packages/db/test/pool-test-utils.ts | `8411ccba37f0cadb0a5e0c56782235af059e5be28fb8a662d00e4d9dff45c22a` |
| packages/db/src/migrate.ts | `8d9d2364329aff0b206de30aab44e221be0e7ae988483c6bb97ec8d0044f355b` |
| apps/api/src/auth/context-boundary.test.ts | `7f1914846f763c3534ffafc79701fc6f768e8e1546be2fe98e27bc32a99e0e8d` |

Audit-export SHA256 before `5a07143c61395a9f87e151cc63aee3975990785f4dd3fd3e9d623e9c2cb9781c`, after `4cf133397ccf28ebc6c103c7d630627a51f72483c8d5d31362c2affcb4734d24`. The four SQL strings were individually verified unchanged in a temporary read-only script. No persistent bytes/hash assertion was added.

The receipt's before state was absent; its after state is this whole document. For the other two files, the exact zero-context diff against dispatched HEAD follows, covering every literal removed, replaced and inserted line; omitted original lines remain byte-identical. No existing connection/login lines are reproduced.

```diff
diff --git a/config/agent-lane-assignments.json b/config/agent-lane-assignments.json
index 1f7c30a..1f8b80e 100644
--- a/config/agent-lane-assignments.json
+++ b/config/agent-lane-assignments.json
@@ -82,0 +83 @@
+"mig-order-5":{"branches":["codex/sandbox/mig-order-5"],"receipt":"docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md","note":"Routine, check lane RED: the audit-export upgrade proof (0121) installs everything before its own migration by name, applies it alone and makes the merged four-query catalogue comparison there at full strength, then runs everything later twice and compares only named permission facts of objects older than 0121 (a widened grant, moved owner, row security switched off, changed older policy, added permissive policy, removed restrictive policy, or new role attribute or membership stops it; a narrowing or an addition does not); in-test rolled-back controls; no migration, no product code, no helper edited, no other test.","allow":["packages/db/test/audit-export.integration.test.ts","config/agent-lane-assignments.json","docs/verdicts/MIG-ORDER-5/**"]},
diff --git a/packages/db/test/audit-export.integration.test.ts b/packages/db/test/audit-export.integration.test.ts
index 48dba6c..d73fd4c 100644
--- a/packages/db/test/audit-export.integration.test.ts
+++ b/packages/db/test/audit-export.integration.test.ts
@@ -6,0 +7 @@ import { fileURLToPath } from "node:url";
+import { isDeepStrictEqual } from "node:util";
@@ -8 +9 @@ import EmbeddedPostgres from "embedded-postgres";
-import { Pool } from "pg";
+import { Pool, type PoolClient } from "pg";
@@ -13,0 +15 @@ import { closeTestPools, freePort } from "./pool-test-utils.js";
+import * as upgradeProof from "./upgrade-proof-utils.js";
@@ -18 +20,7 @@ let priorSecurityCatalog: unknown;
-async function securityCatalog() {
+let upgrade: {
+  before: Subject[]; names: string[]; own: number; halfOid: string; ownRegistry: string[]; ownTables: boolean[];
+  ownStepSecurityCatalog: SecurityCatalog; ownStepDifferences: string[]; controls: ControlResult[];
+  afterControlsCatalog: SecurityCatalog; afterControlsDifferences: string[]; scratchCount: string;
+};
+type Queryable = Pick<Pool | PoolClient, "query">;
+async function securityCatalog(db: Queryable = admin) {
@@ -20,4 +28,4 @@ async function securityCatalog() {
-    tables: (await admin.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') AND c.relkind='r' AND c.relname NOT IN ('audit_export','audit_export_checkpoint') ORDER BY n.nspname,c.relname`)).rows,
-    policies: (await admin.query(`SELECT * FROM pg_policies WHERE schemaname IN ('app','audit_control','identity','control_plane','infrastructure') AND tablename NOT IN ('audit_export','audit_export_checkpoint') ORDER BY schemaname,tablename,policyname`)).rows,
-    routines: (await admin.query(`SELECT n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') ORDER BY n.nspname,p.proname,p.proargtypes`)).rows,
-    roles: (await admin.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname`)).rows,
+    tables: (await db.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relowner,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') AND c.relkind='r' AND c.relname NOT IN ('audit_export','audit_export_checkpoint') ORDER BY n.nspname,c.relname`)).rows,
+    policies: (await db.query(`SELECT * FROM pg_policies WHERE schemaname IN ('app','audit_control','identity','control_plane','infrastructure') AND tablename NOT IN ('audit_export','audit_export_checkpoint') ORDER BY schemaname,tablename,policyname`)).rows,
+    routines: (await db.query(`SELECT n.nspname,p.proname,p.proargtypes::text,p.proacl::text,p.proowner,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure') ORDER BY n.nspname,p.proname,p.proargtypes`)).rows,
+    roles: (await db.query(`SELECT rolname,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname LIKE 'jobguard_%' ORDER BY rolname`)).rows,
@@ -25,0 +34,86 @@ async function securityCatalog() {
+type Subject = {
+  kind: "table" | "routine" | "role"; oid: string; name: string; facts: string[];
+  columns: string[]; columnGrants: { column: string; fact: string }[];
+  policies: Record<string, { permissive: boolean; text: string }>;
+};
+type SecurityCatalog = Awaited<ReturnType<typeof securityCatalog>>;
+type Control = { id: string; statements: string[]; expected: string[] | "owner moved"; merged: (keyof SecurityCatalog)[] | null; inspect?: "replace" | "column" | "name"; precondition?: string };
+type ControlReading = { after: string[]; merged?: (keyof SecurityCatalog)[]; confirmed?: boolean; precondition?: boolean } | { error: string };
+type ControlResult = Control & { result: ControlReading };
+
+// Not compared at any step: grants on schemas, sequences, views and types, or default privileges.
+// After later migrations: routine bodies/settings are not compared; any older policy text change stops the proof,
+// without deciding whether it got tighter. An older object dropped without a same-id/name counterpart is no longer compared.
+async function privilegeFacts(db: Queryable): Promise<Subject[]> {
+  const rows = (await db.query(`
+    SELECT row_to_json(s)::text AS bytes FROM (
+      SELECT 'table'::text AS kind,c.oid::text AS oid,(n.nspname||'.'||c.relname)::text AS name,
+        ARRAY['owner '||pg_get_userbyid(c.relowner)] || ARRAY(
+          SELECT 'grant '||(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)||' '||a.privilege_type||g.suffix
+          FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
+          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE a.is_grantable) g
+        ) || (CASE WHEN c.relrowsecurity THEN ARRAY[]::text[] ELSE ARRAY['row security off'] END)
+          || (CASE WHEN c.relforcerowsecurity THEN ARRAY[]::text[] ELSE ARRAY['row security not forced'] END) AS facts,
+        ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE (a.attrelid=c.oid) AND (a.attnum>0) AND (NOT a.attisdropped) ORDER BY a.attnum) AS columns,
+        coalesce((SELECT json_agg(json_build_object('column',a.attname::text,'fact',
+          'grant '||(CASE WHEN acl.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)||' '||acl.privilege_type||g.suffix))
+          FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) acl
+          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE acl.is_grantable) g
+          WHERE (a.attrelid=c.oid) AND (a.attnum>0) AND (NOT a.attisdropped)), '[]'::json) AS "columnGrants",
+        coalesce((SELECT json_object_agg(p.policyname,json_build_object('permissive',p.permissive='PERMISSIVE','text',
+          (SELECT row_to_json(x)::text FROM (SELECT p.permissive,p.roles,p.cmd,p.qual,p.with_check) x)))
+          FROM pg_policies p WHERE (p.schemaname=n.nspname) AND (p.tablename=c.relname)), '{}'::json) AS policies
+      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
+      WHERE (n.nspname IN ('app','audit_control','identity','control_plane','infrastructure')) AND (c.relkind='r')
+    ) s
+    UNION ALL
+    SELECT row_to_json(s)::text AS bytes FROM (
+      SELECT 'routine'::text AS kind,p.oid::text AS oid,(n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')')::text AS name,
+        ARRAY['owner '||pg_get_userbyid(p.proowner)] || ARRAY(
+          SELECT 'grant '||(CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END)||' '||a.privilege_type||g.suffix
+          FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
+          CROSS JOIN LATERAL (SELECT ''::text AS suffix UNION ALL SELECT ' WITH GRANT OPTION' WHERE a.is_grantable) g
+        ) || (CASE WHEN p.prosecdef THEN ARRAY['runs as owner'] ELSE ARRAY[]::text[] END) AS facts,
+        ARRAY[]::text[] AS columns,'[]'::json AS "columnGrants",'{}'::json AS policies
+      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
+      WHERE n.nspname IN ('app','audit_control','identity','control_plane','infrastructure')
+    ) s
+    UNION ALL
+    SELECT row_to_json(s)::text AS bytes FROM (
+      SELECT 'role'::text AS kind,r.oid::text AS oid,r.rolname::text AS name,
+        ARRAY(SELECT a.name FROM (VALUES ('rolsuper',r.rolsuper),('rolbypassrls',r.rolbypassrls),('rolcreaterole',r.rolcreaterole),
+          ('rolcreatedb',r.rolcreatedb),('rolinherit',r.rolinherit),('rolcanlogin',r.rolcanlogin),('rolreplication',r.rolreplication)) a(name,enabled) WHERE a.enabled)
+          || ARRAY(SELECT DISTINCT 'member of '||pg_get_userbyid(m.roleid) FROM pg_auth_members m WHERE m.member=r.oid) AS facts,
+        ARRAY[]::text[] AS columns,'[]'::json AS "columnGrants",'{}'::json AS policies
+      FROM pg_roles r WHERE r.rolname LIKE 'jobguard_%'
+    ) s
+  `)).rows as { bytes: string }[];
+  return rows.map(row => JSON.parse(row.bytes) as Subject);
+}
+function compare(before: Subject[], live: Subject[]): string[] {
+  const differences: string[] = [];
+  for (const now of live) {
+    const was = before.find(subject => subject.kind === now.kind && subject.oid === now.oid)
+      ?? before.find(subject => subject.kind === now.kind && subject.name === now.name);
+    if (!was) continue;
+    for (const fact of now.facts) if (!was.facts.includes(fact)) differences.push(`${now.kind} ${now.name}: + ${fact}`);
+    if (now.kind !== "table") continue;
+    for (const grant of now.columnGrants) if (was.columns.includes(grant.column)
+      && !was.columnGrants.some(old => old.column === grant.column && old.fact === grant.fact)) {
+      differences.push(`table ${now.name}: + column ${grant.column} ${grant.fact}`);
+    }
+    for (const [name, policy] of Object.entries(was.policies)) {
+      const current = now.policies[name];
+      if (current && current.text !== policy.text) differences.push(`policy ${now.name}.${name}: changed`);
+      else if (!current && !policy.permissive) differences.push(`policy ${now.name}.${name}: restrictive policy gone`);
+    }
+    for (const [name, policy] of Object.entries(now.policies)) if (!Object.hasOwn(was.policies, name)
+      && policy.permissive && !was.facts.includes("row security off")) {
+      differences.push(`policy ${now.name}.${name}: permissive policy added`);
+    }
+  }
+  return differences.sort();
+}
+async function privilegeDifferences(db: Queryable, before: Subject[]): Promise<string[]> {
+  return compare(before, await privilegeFacts(db));
+}
@@ -36 +130,3 @@ beforeAll(async () => {
-  for (const url of MIGRATION_URLS.filter(u => !u.pathname.endsWith("/0121_audit_export.sql"))) {
+  const names = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!), own = names.indexOf("0121_audit_export.sql");
+  expect(own).toBeGreaterThan(0);
+  for (const url of MIGRATION_URLS.slice(0, own)) {
@@ -39,0 +136,69 @@ beforeAll(async () => {
+  const before = await privilegeFacts(admin);
+  await admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
+  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [names[own]]);
+  const ownRegistry = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name as string);
+  const ownTables = (await admin.query("SELECT (to_regclass('app.audit_export') IS NOT NULL) AS exports,(to_regclass('app.audit_export_checkpoint') IS NOT NULL) AS checkpoints")).rows[0]!;
+  const ownStepSecurityCatalog = await securityCatalog();
+  const ownStepDifferences = await privilegeDifferences(admin, before);
+  const half = "app.half_even_ratio(bigint,bigint,bigint)";
+  const halfOid = (await admin.query("SELECT $1::regprocedure::oid::text AS oid", [half])).rows[0]!.oid as string;
+  const halfName = before.find(subject => subject.kind === "routine" && subject.oid === halfOid)?.name;
+  const definitions: Control[] = [
+    { id: "S1", statements: ["GRANT TRUNCATE ON app.job TO jobguard_runtime"], expected: ["table app.job: + grant jobguard_runtime TRUNCATE"], merged: ["tables"], precondition: "SELECT has_table_privilege('jobguard_runtime','app.job','TRUNCATE') AS allowed" },
+    { id: "S2", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", "GRANT SELECT ON app.job TO mo5_scratch_role"], expected: ["table app.job: + grant mo5_scratch_role SELECT"], merged: ["tables"] },
+    { id: "S3", statements: ["GRANT SELECT ON app.job TO jobguard_runtime WITH GRANT OPTION"], expected: ["table app.job: + grant jobguard_runtime SELECT WITH GRANT OPTION"], merged: ["tables"] },
+    { id: "S4", statements: ["GRANT UPDATE(title) ON app.job TO jobguard_runtime"], expected: ["table app.job: + column title grant jobguard_runtime UPDATE"], merged: [], precondition: "SELECT has_column_privilege('jobguard_runtime','app.job','title','UPDATE') AS allowed" },
+    { id: "S5", statements: ["ALTER TABLE app.job OWNER TO jobguard_runtime"], expected: "owner moved", merged: ["tables"] },
+    { id: "S6", statements: ["ALTER TABLE app.job DISABLE ROW LEVEL SECURITY", "ALTER TABLE app.job NO FORCE ROW LEVEL SECURITY"], expected: ["table app.job: + row security not forced", "table app.job: + row security off"], merged: ["tables"] },
+    { id: "S7", statements: ["ALTER POLICY tenant_isolation ON app.job USING (true)"], expected: ["policy app.job.tenant_isolation: changed"], merged: ["policies"] },
+    { id: "S8", statements: ["ALTER POLICY tenant_isolation ON app.job TO PUBLIC"], expected: ["policy app.job.tenant_isolation: changed"], merged: ["policies"] },
+    { id: "S9", statements: ["CREATE POLICY mo5_scratch ON app.job FOR SELECT TO jobguard_runtime USING (true)"], expected: ["policy app.job.mo5_scratch: permissive policy added"], merged: ["policies"] },
+    { id: "S10", statements: ["DROP POLICY practice_material_isolation ON app.merchant"], expected: ["policy app.merchant.practice_material_isolation: restrictive policy gone"], merged: ["policies"] },
+    { id: "S11", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", `GRANT EXECUTE ON FUNCTION ${half} TO mo5_scratch_role`], expected: [`routine ${halfName}: + grant mo5_scratch_role EXECUTE`], merged: ["routines"] },
+    { id: "S12", statements: [`ALTER FUNCTION ${half} SECURITY DEFINER`], expected: [`routine ${halfName}: + runs as owner`], merged: ["routines"] },
+    { id: "S13", statements: ["ALTER ROLE jobguard_runtime CREATEDB"], expected: ["role jobguard_runtime: + rolcreatedb"], merged: ["roles"] },
+    { id: "S14", statements: ["GRANT jobguard_migration TO jobguard_runtime"], expected: ["role jobguard_runtime: + member of jobguard_migration"], merged: [] },
+    { id: "S15", statements: ["CREATE ROLE mo5_scratch_role NOLOGIN", `ALTER FUNCTION ${half} RENAME TO mo5_half_renamed`, "GRANT EXECUTE ON FUNCTION app.mo5_half_renamed(bigint,bigint,bigint) TO mo5_scratch_role"], expected: [`routine ${halfName?.replace("half_even_ratio", "mo5_half_renamed")}: + grant mo5_scratch_role EXECUTE`], merged: ["routines"] },
+    { id: "N1", statements: [], expected: ["table app.job: + grant jobguard_runtime SELECT"], merged: null, inspect: "name" },
+    { id: "P1", statements: ["REVOKE INSERT ON app.job FROM jobguard_runtime"], expected: [], merged: ["tables"] },
+    { id: "P2", statements: ["CREATE TABLE app.mo5_scratch(tenant_id uuid NOT NULL, id uuid PRIMARY KEY)", "ALTER TABLE app.mo5_scratch ENABLE ROW LEVEL SECURITY", "CREATE POLICY mo5_scratch ON app.mo5_scratch FOR ALL TO jobguard_runtime USING (true)", "GRANT SELECT,INSERT,UPDATE,DELETE ON app.mo5_scratch TO jobguard_runtime, PUBLIC"], expected: [], merged: ["tables", "policies"] },
+    { id: "P3", statements: [], expected: [], merged: [], inspect: "replace" },
+    { id: "P4", statements: ["ALTER TABLE app.job ADD COLUMN mo5_scratch text"], expected: [], merged: [], inspect: "column" },
+    { id: "P5", statements: ["CREATE FUNCTION app.mo5_scratch() RETURNS integer LANGUAGE sql AS 'SELECT 1'"], expected: [], merged: ["routines"] },
+    { id: "P6", statements: ["CREATE ROLE jobguard_mo5_scratch NOLOGIN CREATEDB"], expected: [], merged: ["roles"] },
+    { id: "P7", statements: ["ALTER TABLE app.job ADD COLUMN mo5_scratch text", "GRANT UPDATE(mo5_scratch) ON app.job TO jobguard_runtime"], expected: [], merged: [] },
+    { id: "P8", statements: ["CREATE POLICY mo5_scratch ON app.job AS RESTRICTIVE FOR ALL TO jobguard_runtime USING (false)"], expected: [], merged: ["policies"] },
+    { id: "P9", statements: ["DROP POLICY tenant_isolation ON app.job"], expected: [], merged: ["policies"] },
+    { id: "P10", statements: [`ALTER FUNCTION ${half} SET search_path=pg_catalog`], expected: [], merged: ["routines"] },
+  ];
+  const controls: ControlResult[] = [];
+  for (const control of definitions) {
+    let result: ControlReading;
+    try {
+      result = await upgradeProof.rolledBack(admin, async client => {
+        const precondition = control.precondition ? (await client.query(control.precondition)).rows[0]!.allowed as boolean : undefined;
+        for (const statement of control.statements) await client.query(statement);
+        let confirmed: boolean | undefined;
+        if (control.inspect === "replace") confirmed = await upgradeProof.scratchReplaceFunction(client, half);
+        if (control.inspect === "column") confirmed = (await client.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE (attrelid='app.job'::regclass) AND (attname='mo5_scratch') AND (NOT attisdropped)) AS present")).rows[0]!.present as boolean;
+        if (control.inspect === "name") {
+          const copy = structuredClone(before), job = copy.find(subject => subject.kind === "table" && subject.name === "app.job")!;
+          job.oid = "0"; job.facts = job.facts.filter(fact => fact !== "grant jobguard_runtime SELECT");
+          return { after: compare(copy, await privilegeFacts(client)) };
+        }
+        const after = await privilegeDifferences(client, before), catalog = await securityCatalog(client);
+        const merged = (Object.keys(catalog) as (keyof SecurityCatalog)[]).filter(key => !isDeepStrictEqual(catalog[key], (priorSecurityCatalog as SecurityCatalog)[key]));
+        return { after, merged, ...(confirmed === undefined ? {} : { confirmed }), ...(precondition === undefined ? {} : { precondition }) };
+      });
+    } catch (error) { result = { error: error instanceof Error ? error.message : String(error) }; }
+    controls.push({ ...control, result });
+  }
+  const afterControlsCatalog = await securityCatalog();
+  const afterControlsDifferences = await privilegeDifferences(admin, before);
+  const scratchCount = (await admin.query(`SELECT (count(*))::text AS count FROM (
+    SELECT relname::text AS name FROM pg_class WHERE relkind='r'
+    UNION ALL SELECT proname::text FROM pg_proc
+    UNION ALL SELECT policyname::text FROM pg_policies
+    UNION ALL SELECT rolname::text FROM pg_roles
+  ) s WHERE name LIKE '%mo5%'`)).rows[0]!.count as string;
+  upgrade = { before, names, own, halfOid, ownRegistry, ownTables: [ownTables.exports, ownTables.checkpoints], ownStepSecurityCatalog, ownStepDifferences, controls, afterControlsCatalog, afterControlsDifferences, scratchCount };
@@ -63,0 +229,13 @@ describe("ENT-10b PostgreSQL audit exports", () => {
+    // [MO5-a] Older subjects and the exact subjects used by the controls exist before 0121.
+    for (const kind of ["table", "routine", "role"] as const) expect(upgrade.before.some(subject => subject.kind === kind), `[MO5-a] ${kind}`).toBe(true);
+    expect(upgrade.before.some(subject => Object.keys(subject.policies).length > 0), "[MO5-a] policy").toBe(true);
+    const job = upgrade.before.find(subject => subject.kind === "table" && subject.name === "app.job")!;
+    expect(job, "[MO5-a] app.job").toBeDefined();
+    expect(job.facts, "[MO5-a] app.job grants").toEqual(expect.arrayContaining(["grant jobguard_runtime SELECT", "grant jobguard_runtime INSERT"]));
+    expect(job.facts, "[MO5-a] row security on").not.toContain("row security off");
+    expect(job.facts, "[MO5-a] row security forced").not.toContain("row security not forced");
+    expect(job.policies.tenant_isolation?.permissive, "[MO5-a] permissive tenant policy").toBe(true);
+    expect(upgrade.before.find(subject => subject.kind === "table" && subject.name === "app.merchant")?.policies.practice_material_isolation?.permissive, "[MO5-a] restrictive merchant policy").toBe(false);
+    expect(upgrade.before.find(subject => subject.kind === "routine" && subject.oid === upgrade.halfOid), "[MO5-a] half_even_ratio identity").toBeDefined();
+    expect(upgrade.before.some(subject => subject.kind === "role" && subject.name === "jobguard_runtime"), "[MO5-a] runtime role").toBe(true);
+    for (const name of ["app.audit_export", "app.audit_export_checkpoint"]) expect(upgrade.before.some(subject => subject.name === name), `[MO5-a] not yet present: ${name}`).toBe(false);
@@ -65 +243,26 @@ describe("ENT-10b PostgreSQL audit exports", () => {
-    expect(await securityCatalog()).toEqual(priorSecurityCatalog);
+    expect(upgrade.ownRegistry, "[MO5-b] 0121 alone registry").toEqual(upgrade.names.slice(0, upgrade.own + 1));
+    expect(upgrade.ownTables, "[MO5-b] 0121 tables exist at its own step").toEqual([true, true]);
+    expect(upgrade.ownStepSecurityCatalog).toEqual(priorSecurityCatalog); // [MO5-c] Same four merged queries and full equality at 0121 alone.
+    expect(upgrade.ownStepDifferences, "[MO5-c] named permission facts").toEqual([]);
+    // [MO5-d] Every scratch statement was rolled back; a refused statement is a recorded failure here.
+    for (const control of upgrade.controls) {
+      const message = `[MO5-d] ${control.id}: ${JSON.stringify(control.result)}`;
+      expect(control.result, message).not.toHaveProperty("error");
+      if ("error" in control.result) continue;
+      if (control.expected === "owner moved") {
+        expect(control.result.after, message).toContain("table app.job: + owner jobguard_runtime");
+        expect(control.result.after.every(line => line.startsWith("table app.job: + ")), message).toBe(true);
+      } else expect(control.result.after, message).toEqual(control.expected);
+      if (control.merged !== null) expect(control.result.merged, message).toEqual(control.merged);
+      if (control.precondition) expect(control.result.precondition, message).toBe(false);
+      if (control.inspect === "replace" || control.inspect === "column") expect(control.result.confirmed, message).toBe(true);
+    }
+    expect(upgrade.afterControlsCatalog, "[MO5-f] catalogue restored").toEqual(upgrade.ownStepSecurityCatalog);
+    expect(upgrade.afterControlsDifferences, "[MO5-f] permission facts restored").toEqual([]);
+    expect(upgrade.scratchCount, "[MO5-f] no scratch objects or roles").toBe("0");
+    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO5-e] all migrations recorded").toEqual(upgrade.names);
+    // Nothing reads whole catalogue rows, routine text or routine settings after the later migrations.
+    // They may add tables, columns, policies on their own tables, routines and roles, replace routines and take privileges away.
+    // They may not widen a grant, move an owner, switch row security off, change an older policy, add a permissive policy to an
+    // older row-secured table, remove an older restrictive policy, or give an older jobguard_ role an attribute or membership.
+    expect(await privilegeDifferences(admin, upgrade.before), "[MO5-e] later migrations did not widen older permission facts").toEqual([]);
```

## Mac verification (12 Oct)

Run by the Mac helper (Claude Sonnet, for the JobGuard dispatcher) on 12 Oct 2026, 17:55-18:12 local, against the committed candidate `382ec299c4d77a28095b5234abd05ede105a7348` (branch `codex/sandbox/mig-order-5`, stacked on #145 head `07f6a69`). Working directory for every command: `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/mig-order-5` (database commands run vitest from `packages/db`). Node v24.17.0, pnpm 10.28.1, embedded PostgreSQL 16.10. Every heavy command went through `~/.local/bin/heavy-slot`, one at a time, vitest `--maxWorkers=2`, memory free 67-72% before each. Logs: `~/.local/share/full-steam/jg-runs/mig-order-5-mac/`. This is a verification record by a helper, not an independent review and not acceptance.

Candidate checks first: `git status` clean; HEAD as above; `git diff --stat 07f6a69..HEAD` lists exactly `config/agent-lane-assignments.json`, `docs/verdicts/MIG-ORDER-5/BUILDER_RECEIPT.md` and `packages/db/test/audit-export.integration.test.ts` (3 files, 612 insertions, 8 deletions); `packages/db/test/upgrade-proof-utils.ts` is not in the diff.

### Commands as run

| # | Command | Exit | Result |
|---|---|---:|---|
| 1 | `pnpm --filter @jobguard/{core,storage,db,config,ai} build` (five separate runs, each alone, in that order) | 0 each | `tsc -p tsconfig.json` clean for all five |
| 2 | first try of the Run A command (row 4), before row 3 was done | 1 | `Postgres init script exited with code null`: the suite failed to start (11 skipped) because the dylib short names were missing |
| 3 | `node scripts/hydrate-symlinks.js`, working directory `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64` (node_modules only) | 0 | 17 symlinks present; nothing tracked changed |
| 4 | **Run A** `heavy-slot mo5-audit-export pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 --reporter=verbose test/audit-export.integration.test.ts` | 0 | 1 file passed; **11 passed (11)**, same 11 as on main; first test "leaves every existing table..." passed in 23 ms; duration 17.73 s |
| 5 | X1-X4, same command plus `-t "leaves every existing table"`, one scratch statement after the `migrate()` pair each | see below | |
| 6 | neighbours: `... vitest run --maxWorkers=2 --reporter=verbose test/audit.integration.test.ts test/verify-audit-export-cli.test.ts test/tenancy.integration.test.ts` | 0 | 3 files passed, **28 passed (28)**, 3.38 s |
| 7 | `pnpm typecheck` (repo root) | 0 | 7 successful / 7 total, 4 cached. It does not cover `packages/db/test` |
| 8 | `node ~/.local/share/full-steam/jg-runs/mig-order-4-scratch/round1-tsc-one-file.cjs <worktree> packages/db/test/audit-export.integration.test.ts` | 0 | 0 diagnostics in the changed file, 0 in other files |
| 9 | `LANE_BASE_REF=origin/main pnpm lint` | 1 | core purity passed (129 files); then **lane boundary FAILED** on the five inherited MIG-ORDER-4 paths below; later stages did not run in this command |
| 10 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | same five paths; nothing of MIG-ORDER-5's own |
| 11 | supplementary, not a substitute: `LANE_BASE_REF=07f6a69 pnpm lint:lanes` | 0 | "Lane boundary passed" for lane mig-order-5, base `07f6a69`, head `382ec29`: the own diff is inside the allow list |
| 12 | supplementary, the stages row 9 skipped: `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs`; `pnpm exec turbo run lint` | 0, 0, 0 | passed; turbo 7 successful / 7 total, 4 cached |

The five lane failures (rows 9 and 10) are exactly the inherited ones the builder listed: `docs/verdicts/MIG-ORDER-4/BUILDER_RECEIPT.md`, `packages/db/test/job-activation-terms.integration.test.ts`, `packages/db/test/prevention-checks.integration.test.ts`, `packages/db/test/recovery-eligibility-v3.integration.test.ts`, `packages/db/test/upgrade-proof-utils.ts`. They come from the stacked route (they leave the list when #145 merges into main); they are not MIG-ORDER-5 edits.

### The prediction: after-all result is the empty list

Run A passed, including [MO5-e]: there are 64 migrations, 0121 is index 60 and the three after it are 0122, 0127 and 0128; after those real later migrations `privilegeDifferences(admin, upgrade.before)` returned `[]`, twice-run migrator included. [MO5-c] also held: the four merged queries at 0121's own step equal the snapshot, and `ownStepDifferences` was `[]`. The snapshot held 198 tables, 152 routines, 4 `jobguard_` roles and 197 policies. No line appeared; nothing was adjusted.

### Controls, observed (from a scratch dump of the 26 results; every one equals the order's expectation, so the assertions passed)

| ID | observed `after` | observed `merged` | red under broken comparator |
|---|---|---|---|
| S1 | `table app.job: + grant jobguard_runtime TRUNCATE` (precondition false) | tables | V1, V2 |
| S2 | `table app.job: + grant mo5_scratch_role SELECT` | tables | V1, V2 |
| S3 | `table app.job: + grant jobguard_runtime SELECT WITH GRANT OPTION` | tables | V1, V2 |
| S4 | `table app.job: + column title grant jobguard_runtime UPDATE` (precondition false) | none | V1, V2, V5 |
| S5 | five `+ grant jobguard_runtime ...` lines (DELETE, REFERENCES, TRIGGER, TRUNCATE, UPDATE) and `+ owner jobguard_runtime`, all starting `table app.job: + ` | tables | V1, V16 |
| S6 | `+ row security not forced`, `+ row security off` | tables | V1, V8 |
| S7 / S8 | `policy app.job.tenant_isolation: changed` | policies | V1, V3 |
| S9 | `policy app.job.mo5_scratch: permissive policy added` | policies | V1, V3 |
| S10 | `policy app.merchant.practice_material_isolation: restrictive policy gone` | policies | V1, V3 |
| S11 | `routine app.half_even_ratio(bigint, bigint, bigint): + grant mo5_scratch_role EXECUTE` | routines | V1, V2 |
| S12 | `routine app.half_even_ratio(bigint, bigint, bigint): + runs as owner` | routines | V1, V17 |
| S13 | `role jobguard_runtime: + rolcreatedb` | roles | V1, V4 |
| S14 | `role jobguard_runtime: + member of jobguard_migration` | none | V1, V4 |
| S15 | `routine app.mo5_half_renamed(bigint, bigint, bigint): + grant mo5_scratch_role EXECUTE` | routines | V1, V2, V6 |
| N1 | `table app.job: + grant jobguard_runtime SELECT` | not read | V1, V2, V7 |
| P1 | `[]` | tables | V9 |
| P2 | `[]` | tables, policies | V11b |
| P3 | `[]` (replacement confirmed true) | none | V13 |
| P4 | `[]` (column confirmed present) | none | V12 |
| P5 | `[]` | routines | V11b |
| P6 | `[]` | roles | V11b |
| P7 | `[]` | none | V12 |
| P8 | `[]` | policies | V14 |
| P9 | `[]` | policies | V10 |
| P10 | `[]` | routines | V13 |

No `merged` cell and no `after` cell differed from the order's table; no statement was refused. Routine names are printed by PostgreSQL with spaces after the commas (`bigint, bigint, bigint`); the test builds expected names from the recorded snapshot, as the order requires.

### Scratch experiments (all uncommitted, each restored with `git checkout -- packages/db/test/audit-export.integration.test.ts`; `git status --short` and `git diff --stat` empty after every one)

The order's four, one statement on a new line directly after the `migrate()` pair, `-t "leaves every existing table"`:

| Exp | Scratch statement | Exit | Result |
|---|---|---:|---|
| X1 | `GRANT TRUNCATE ON app.job TO jobguard_runtime` | 1 | 1 failed / 10 skipped; only at [MO5-e]; received exactly `["table app.job: + grant jobguard_runtime TRUNCATE"]` |
| X2 | `ALTER POLICY tenant_isolation ON app.job USING (true)` | 1 | only at [MO5-e]; exactly `["policy app.job.tenant_isolation: changed"]` |
| X3 | `ALTER ROLE jobguard_runtime CREATEDB` | 1 | only at [MO5-e]; exactly `["role jobguard_runtime: + rolcreatedb"]` |
| X4 | `REVOKE INSERT ON app.job FROM jobguard_runtime` | 0 | 1 passed / 10 skipped |

Set-up hook time, measured with a scratch `Date.now()` around `beforeAll` (the budget is 120000 ms): candidate 1720 ms and 1689 ms (of which the pre-pair part, install plus 26 controls, 1673 and 1647 ms; the `migrate()` pair about 35 ms); the base `07f6a69` version of the file measured the same way 1703 ms and 1193 ms. Budget not at risk.

Broken-comparator runs (an edit to `compare`/`privilegeFacts`, with the [MO5-d] loop's `expect(` temporarily `expect.soft(` so every red control is listed in one run; same filtered command; every run exit 1, which is the intended red):

| Exp | Broken comparator | Controls that went red | Also |
|---|---|---|---|
| V1 | no-op (`compare` returns `[]`) | S1-S15 and N1 (all 16 stop controls); no pass control | |
| V2 | grants-blind (no `grant ...` fact, no column grants) | S1, S2, S3, S4, S11, S15, N1 | |
| V3 | policy-blind | S7, S8, S9, S10 | |
| V4 | role-blind | S13, S14 | |
| V5 | column-grant-blind | S4 | |
| V6 | name-only matching | S15 | |
| V7 | id-only matching | N1 | |
| V8 | row-security-flag-blind | S6 | |
| V16 | owner-blind | S5 | |
| V17 | runs-as-owner-blind | S12 | |
| V9 | over-strict: a fact that disappears gives a line | P1, S5 | [MO5-e] red with 4 lines: `- grant PUBLIC EXECUTE` on `app.advance_final_account_draft`, `app.invalidate_stale_final_account_authorizations`, `app.issue_practice_customer_invoice`, `app.reserve_customer_invoice_number` (migration 0128 takes those away, a narrowing the subset rule rightly lets through) |
| V10 | over-strict: a removed permissive policy gives a line | P9 | [MO5-e] stayed green |
| V11b | over-strict: objects added later are compared (0121's own tables excluded to keep it clean) | P2, P5, P6 | [MO5-e] red with 145 lines (the later migrations' new objects); the unrestricted variant V11 turned every control red because 0121's own two tables are "added later" at its own step |
| V12 | over-strict: a new column is a line | P4, P7 | [MO5-e] red with 15 lines (e.g. `table app.extra_origin: + column client_capture_id`) |
| V13 | over-strict: routine body and settings compared | P3, P10 | [MO5-e] red with 1 line: `routine app.validate_extra_origin(): + body d69fba1c... {"search_path=pg_catalog, app"}` (0128 replaces that routine and adds a settings clause) |
| V14 | over-strict: any new policy is a line (restrictive too) | P8 | |
| V15 | old whole-catalogue shape after the pair (compare `securityCatalog()` with the 0121-step catalogue) | none of the controls | red at the [OLD-SHAPE] line: `tables`, `policies`, `routines`, `roles` all differ after 0122, 0127 and 0128, which is why a whole-row after-all comparison cannot be used |

So each of the 16 stop controls goes red under a comparator that is blind to the thing it guards, and each of the 10 pass controls goes red under a comparator that is stricter than the rule; and the after-all line catches a widening (X1), a loosening (X2) and a new role attribute (X3) while letting a narrowing through (X4).

### NOT RUN

- Independent reviews (fresh Claude Opus, separate Codex Sol), acceptance and dispatcher integration: not part of this helper's task.
- Whole-package or whole-repository vitest suite; the other 10 tests of the audit-export file ran once (Run A), unfiltered; X and V runs used the filter, so tests 2-11 were skipped there by design.
- `pnpm build` of the whole repo (only the five package builds above); `pnpm openapi:check` and the compiled OpenAPI comparison (builder-reported stale document, not in this lane); browser suites (no screen touched; UI parked).
- `LANE_BASE_REF=origin/main pnpm lint` as one passing command: it cannot pass until #145 merges; its later stages ran separately (row 12) and the own diff passed the lane check against `07f6a69` (row 11).
- A run on the merged main (the stack is not merged); a run after #145 merges and the dispatcher merges main into this branch.
- Anything on GitHub other than the push of this record to the branch; no pull request was opened.

Mac helper record only; independent verification and acceptance remain pending.
