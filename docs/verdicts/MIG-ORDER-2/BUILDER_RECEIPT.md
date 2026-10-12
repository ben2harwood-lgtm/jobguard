# MIG-ORDER-2 — builder receipt

Builder: Claude Sonnet 5.5 on the Mac. Branch `codex/sandbox/mig-order-2`, cut from `origin/main` bbca5ca. Tests commit eaf69af.
Order: `MIG-ORDER-2` as changed by the coordinator ("change of shape"): the upgrade test keeps running every later migration but compares
existing columns by name; plus a new guard test for fingerprinted tables. Lane: RED check (Opus + Sol). No migration, no product code, `migrate.ts` untouched.

## Why
`recovery-follow-up-upgrade.integration.test.ts` (M4-6-S-R1, #130) ends by calling `migrate(admin)` to the head of the registry and comparing
`row_to_json` of every pre-existing row with a snapshot taken before. Any later migration that adds a nullable column adds a key to that JSON, so
the test goes red although no value changed (CI run 38166671162 on PR #134 / ENT-4b / 0122; SV-2 would do the same). Same fault as MIG-ORDER-1.
Reproduced here: the ORIGINAL file run inside `.worktrees/ent-4b` fails with a row diff (exit 1).

## Change 1 — `packages/db/test/recovery-follow-up-upgrade.integration.test.ts`
Before (end of the 3rd `it`):
`const history = await rowsOf(await tableNames()); await migrate(admin); expect(await rowsOf(Object.keys(history))).toEqual(history);`
After:
`expect(await liveColumns()).toEqual(columnsAt0115); const history = await namedColumnRowsOf(columnsAt0115); await migrate(admin);`
`expect(<installed migration names, sorted>).toEqual(MIGRATION_URLS.map(nameOf)); expect(await namedColumnRowsOf(columnsAt0115)).toEqual(history);`
- `columnsAt0115` (end of file) is a hand-visible literal: every table of the five schemas (186 tables, 1904 columns) with its columns in ordinal
  order, derived ONCE from the live catalogue after 0115 and written out. It is not computed at run time.
- The first new `expect` pins that literal to the real 0115 catalogue (before `migrate`), so the list cannot drift or be quietly widened.
- `namedColumnRowsOf` snapshots `row_to_json` of a sub-select of exactly those columns (sorted, `COLLATE "C"`), so each pre-existing row is
  compared by the values of the 0115 columns: same count, same rows, nothing missing or added. A column dropped/renamed by a later migration makes the query fail.
- The head really is reached: the installed names must equal the whole registry.
- The 2nd `it` (0112 and 0115 applied by hand, whole-row JSON + xmin + ctid compared after each, privileges, audit chains) and the 3rd `it`'s workflow
  checks are byte-for-byte unchanged. `rowsOf`/`tableNames` are still used there.

## Is anything that used to fail for a real reason now passing? (direct answer)
Only two things, both deliberate:
1. A later migration that rewrites a pre-existing row to the same values (for example backfilling a new column with UPDATE). It used to fail through xmin/ctid in the
   head step; it now passes there. xmin/ctid are still checked, unchanged, in the 0112/0115 step, which is where this proof's two migrations are applied.
2. A later migration that adds a column to a table whose whole rows are fingerprinted (e.g. `app.variation_revision`) used to fail here (incidentally); it now passes
   HERE and is caught by the new guard instead, with a message that says why (proved below). For tables that are not fingerprinted a new column is by design no longer a failure.
Still failing, as before: any later change to an existing column's value; a dropped or renamed column; a pre-existing row added or removed; any 0112/0115 change to a row, a privilege, a policy or an audit chain.

## Change 2 — new `packages/db/test/fingerprinted-row-shape.integration.test.ts`
Applies the whole registry to a fresh embedded PostgreSQL and pins the exact ordered column list of each of the 11 tables whose WHOLE rows are fingerprinted. The failure
message names the table and both code places and says to widen the list only as a deliberate, reviewed change. A 12th test counts the whole-row serialisations
(`to_jsonb(`/`row_to_json(`) in `evidence-pack-sources.ts` and in the LIVE body of `app.recovery_message_sources_current`: it must stay 11 each and read the same 11 tables, so a
newly fingerprinted table cannot appear unseen. Column names and order are pinned; column types and row values are not.

Whole-row fingerprints found on origin/main (all in two parallel places that must agree):

| table | `packages/db/src/evidence-pack-sources.ts` | `0107_recovery_messages.sql` (`app.recovery_message_sources_current`) |
|---|---|---|
| app.quote_document_version | :39 `to_jsonb(d)` | :267 |
| app.quote_acceptance | :39 `to_jsonb(a)` | :267 |
| app.evidence_object | :52 `to_jsonb(e)` | :272 |
| app.variation_revision | :69 `to_jsonb(r)` | :278 |
| app.variation_approval | :69 `to_jsonb(a)` | :278 |
| app.recovery_claim_revision | :79 `to_jsonb(r)` | :290 |
| app.recovery_case_event | :82 `to_jsonb(e)` | :291 |
| app.material_rate_revision | :88 `to_jsonb(r)` | :292 |
| app.supplier_document_version | :94 `to_jsonb(v)` | :294 |
| app.supplier_document | :94 `to_jsonb(d)` | :294 |
| app.customer_invoice | :108 `to_jsonb(i)-'pdf_bytes'` | :297 (bytes travel separately) |

The 0107 routine is not redefined by any later migration (0112:282 only calls it). `app.extra_origin` and `app.variation` are NOT fingerprinted whole anywhere
(extra_origin: only 0053 named-column INSERTs at :56, :128 and triggers; variation: named columns at 0053:60, :158 and explicit lists in `variation-repository.ts`).
**Consequence for ENT-4b:** `0122_extra_origin_persistence.sql:33` does `ALTER TABLE app.variation_revision ADD COLUMN pricing_basis text`, and variation_revision IS fingerprinted,
so 0122 changes already-approved pack and message-source content and will trip this guard until that is decided deliberately.

Checked, not whole-row (nothing pinned):
- `practice-feed-repository.ts:113` `to_jsonb(e)` (practice_feed_event): mapped to fixed fields at :137-141 (`practiceFeedAdapterEventV1.parse` plus `source_hash`).
- ~~`discrepancy-repository.ts:23` `row_to_json(o)`: view output~~ **Corrected in Round 1 (below): this IS a whole-row durable receipt and is now guarded.** (The hashes at :5, :10, :11 are over command-input objects, not row JSON.)
- `final-account-repository.ts:6` `SELECT l.*` (quote_line) and `SELECT * FROM app.final_account_draft`: read into named fields before the draft is evaluated and hashed.
- `0027_uiwire10_customer_invoice.sql:23` and `0095_job_parties.sql:358` `SELECT r.* INTO final_row`: row type, only named fields used.
- `0107_recovery_messages.sql:265` `rc` CTE `SELECT * FROM app.recovery_case`: only `case_type` and `source_refs` are used; `0107:32-37` `to_json(p_...)` are scalar parameters.
- `audit.ts:38,63,84` `canonicalAuditHash`: fixed field set.
- `0096_watchdog_live.sql:79-81,202` and `0102_contractor_parties.sql:187,194` `to_jsonb(NEW)->>'key'`: named keys read, nothing hashed.
- `packages/db/tools/synthetic-restore.mjs:194` `row_to_json(t)` over every table: compares one schema before and after a restore, no pinned shape.
- `0097_recovery_case_current.sql:17-18` view with `SELECT *` inside LATERAL: read model; the view itself applies no hash (not examined further).

## Proofs (single test file per run, `pnpm exec vitest run --maxWorkers=2`, inside `heavy-slot mig-order-2`, memory 82% free each time)
1. Branch run, upgrade test: exit 0, `Tests 3 passed (3)`. (Embedded PostgreSQL needed the package's `scripts/hydrate-symlinks.js` run once for this worktree first.)
2. Inside `.worktrees/ent-4b` (HEAD be7c87b, has 0122): my file copied over the working-tree copy, same single file: exit 0, `3 passed (3)`. Then `git checkout -- <file>`; the ORIGINAL
   run there: exit 1 (row diff, as in CI). Final `git status --porcelain` in ent-4b: empty. Nothing committed or pushed there.
3. Still a real check (uncommitted scratch, removed): after `migrate(admin)`, one UPDATE of a pre-existing `app.recovery_case.claim_pence` (+1, triggers bypassed with
   `session_replication_role=replica`): exit 1, `1 failed | 2 passed`, diff shows `claim_pence` 32000 -> 32001 (first attempt without the bypass stopped on the append-only trigger; that was not counted).
4. Guard test: exit 0, `12 passed (12)`. Scratch (removed): `ALTER TABLE app.variation_revision ADD COLUMN pricing_basis text` plus `ALTER TABLE app.extra_origin ADD COLUMN scratch_col text`
   after `migrate`: exit 1, `1 failed | 11 passed`; only the `app.variation_revision` pin failed, with the "Whole rows of app.variation_revision are fingerprinted ..." message; extra_origin did not trip it.
5. `LANE_BASE_REF=origin/main pnpm lint:lanes` exit 0; `pnpm typecheck` exit 0 (7 tasks; the db package's typecheck covers `src` only, so both test files were also checked ad hoc with strict tsc: no errors in them);
   `LANE_BASE_REF=origin/main pnpm lint` exit 0.

Known limits: column types and values of the fingerprinted tables are not pinned; xmin/ctid are not compared after later migrations (see above).


## Round 1 (repair after the Sol check, verdict REPAIR at aa3541f)
Two real gaps, both fixed in the two test files only (no migration, no product code).

### Fix 1 — a retyped column could pass (`recovery-follow-up-upgrade.integration.test.ts`)
Before: `columnsAt0115` listed column names; only the JSON text of the values was compared after the head step, so integer to bigint, or a retyped all-NULL column, passed.
After: every listed column is `"name type"` (type as `format_type(atttypid, atttypmod)` prints it, so the type is compared by name plus modifier, readable and stable across databases).
- The existing pin now also checks every type against the real 0115 catalogue (before `migrate`): `expect(await liveColumns()).toEqual(columnsAt0115)`.
- After the head step, `retypedColumns(columnsAt0115, await liveColumns())` must be empty; its message names `table.column: old -> new` ("(gone)" for a dropped column).
- Rows are still compared by the values of the listed columns (names taken from the same list). Nothing else in the file changed.
Proofs (single file, `--maxWorkers=2`, heavy-slot, memory 71-74% free; each scratch change removed afterwards by restoring the saved good copy, then `grep -c SCRATCH` = 0):
- Good file: exit 0, `3 passed (3)`.
- Scratch, after `migrate`: `app.account.name` varchar(200) to text (populated, values identical) and `app.evidence_upload.rejection_code` varchar(50) to text (the table has a row, every value NULL): exit 1, `1 failed | 2 passed`; the message lists exactly `app.account.name: character varying(200) -> text` and `app.evidence_upload.rejection_code: character varying(50) -> text`. (My first choices, integer columns on the recovery tables, were refused by PostgreSQL because a view depends on them, so the run picked the first retypable populated and all-NULL columns itself.)
- Scratch: three added nullable columns (text, integer, jsonb on app.account, app.evidence_upload, app.recovery_case): exit 0, `3 passed (3)`. An added column still passes.

### Fix 2 — a whole-row receipt table was missing (`fingerprinted-row-shape.integration.test.ts`)
`app.discrepancy_review_outcome`: `discrepancy-repository.ts:23` selects `row_to_json(o)` as `outcome`, returned unchanged as `finding.outcome` (:23, return object), and `finish` (:16) stores the whole view with `storeCommandResult` (`packages/db/src/watchdog.ts:114-115`, into `app.watchdog_command_result.result`), which is replayed byte for byte. (`f.*` at :23 is `discrepancy_finding_revision`; it is mapped to named fields and is not whole-row.)
- Added with its exact 13 ordered columns (id, tenant_id, job_id, finding_id, command_id, revision, outcome, reason, actor_ref, subject_ref, payload_hash, audit_event_id, created_at), checked against the merged schema by the test itself (it applies the full registry), `kind: "receipt"` and a receipt-specific failure message.
- Each serialisation SITE now has its own expected table set, separate from the global list: the two pack/message sites expect the same 11 pack tables; `discrepancy-repository.ts` expects exactly the one outcome table (whole-row call count 1).
- Proofs: guard exit 0, `13 passed (13)`; scratch `ALTER TABLE app.discrepancy_review_outcome ADD COLUMN` after `migrate`: exit 1, `1 failed | 12 passed`, only the outcome-table pin failed with the receipt message ("... stored unchanged in a durable command receipt (discrepancy-repository.ts:23 -> :16 finish -> watchdog.ts:114-115 storeCommandResult) ..."); restored.

### Search re-done: any `SELECT <alias>.*` / `SELECT *` / `RETURNING *` / `row_to_json` / `to_jsonb` whose result is stored, hashed, signed or returned as a durable record
Method: every site from a grep of `packages/db/src`, `packages/core/src`, `apps/api/src` and `packages/db/migrations`, then every writer of a durable result (`storeCommandResult`, `runStoredCommand`, `app.command_receipt` inserts and updates, audit payloads, outbox, packs) read for what it stores. `packages/core/src` and `apps/api/src` contain no such SQL; `apps/api/src/commercial-integrity.application.ts:9` compares in-memory feedback objects only.

| site | verdict | reason |
|---|---|---|
| evidence-pack-sources.ts:39,52,69,79,82,88,94,108; 0107:267-297 | GUARDED (11 pack tables) | whole rows into pack content and the message re-check |
| discrepancy-repository.ts:23 `row_to_json(o)` -> :16 -> watchdog.ts:114-115 | GUARDED (new, receipt) | whole outcome row stored in `watchdog_command_result` |
| discrepancy-repository.ts:23 `f.*` | not durable whole-row | mapped to named fields in the returned view |
| readiness-repository.ts:19,21 `SELECT *` | not durable whole-row | `shape()` (:23) picks named fields before `storeCommandResult` (:17) |
| inbox-relevance-repository.ts:17,19 `SELECT *`, `d.*` | not durable whole-row | result is `viewRow()` (:20) plus mapped events: named fields, then stored |
| supplier-match-repository.ts:279,285-300 `p.*`, `SELECT *` | not durable whole-row | `viewIn` returns named `proposal`/`history` fields; that is what is stored |
| supplier-document-repository.ts:7,12 `SELECT *` | not durable whole-row | read for the next revision; stored results are `{revision}`, `{documentId,result}`, `{revision,replayed}` |
| supplier-document-repository.ts:8 `...d` spread | not durable | display view over an explicit column list; never stored |
| purchase-order-repository.ts:3,8 `SELECT *` | not durable whole-row | named fields feed a fixed content array and `{id,draftId,revision,...}` / `{placementId,...}` results |
| evidence.ts:95,114,118,135,143 `RETURNING *`/`SELECT *` | not durable whole-row | stored results are `{evidenceId...}` (:97,:121); rows are returned live, not stored |
| outbox.ts:13 `o.*` | not durable | worker reads the row to run the action; nothing stores or hashes it whole |
| recovery-eligibility-v3-repository.ts:29 `SELECT *` | not durable whole-row | replay lookup reads named fields |
| material-repository.ts:3 `x.*`; quote-repository.ts:9 `qr.*`; contractor-repository.ts:83 `g.*`; practice-invoice-repository.ts:20 `i.*`; recovery-demo-repository.ts:13,14 `s.*`; customer-billing-repository.ts:8 `r.*`; recovery-case-repository.ts:76,116; job-repository.ts:18-22; acceptance-repository.ts:16,22,28 | not durable whole-row | live views or named-field checks/maps; none is stored, hashed or signed whole |
| review-repository.ts:41 `l.*`, `SELECT *` question | not durable whole-row | read through the `proposalReviewV1` schema parse |
| final-account-repository.ts:6 `l.*`, `SELECT *` draft | not durable whole-row | quote_line mapped to named line fields before `canonicalSource` is hashed |
| practice-feed-repository.ts:113 `to_jsonb(e)`; :86; practice-session.ts:21 | not durable whole-row | events mapped to fixed fields (:137-141); the others are session functions |
| enterprise-identity-repository.ts:83 `sso_admin_events()` | not durable | function rows for an admin list |
| audit.ts:38,63,84 | not whole-row | fixed field set |
| `command_receipt` writers in TS: commands.ts:67-100, prevention-check-repository.ts:81,129, job-parties-repository.ts:84,124, proof-repository.ts:22,25, demo-bootstrap.ts:86, recovery-message-repository.ts:396, recovery-follow-up-repository.ts:355 | not whole-row | results are fixed objects or schema-parsed (`preventionCommandResultV1`, `jobPartiesCommandResultV1`); dispatcher mutations return fixed objects (activation-repository.ts:28,44; acceptance-repository.ts:22) |
| `command_receipt` writers in SQL: 0027:47, 0028:84, 0029:40,69, 0030:67,127, 0054:277-278, 0095:384, 0102:88-89,148-149 | not whole-row | all `jsonb_build_object` with named keys |
| 0107:265 `rc` `SELECT *` recovery_case; 0107:32-37 `to_json(p_...)` | not whole-row | only `case_type`/`source_refs` used; scalar parameters |
| 0027:23, 0095:358 `r.* INTO final_row`; 0102:81,138,143,144; 0110:381; 0111:136; 0115:86 `du.*`; 0120:191; 0095:240 | not whole-row | row variables read by field name inside functions; no `to_jsonb`/`row_to_json` of them |
| 0096:79-81,202; 0102:187,194 `to_jsonb(NEW)->>'key'` | not whole-row | named keys read from the new row, nothing stored |
| 0097:17-18 view `SELECT *` in LATERAL | not durable | read model; the view applies no hash (not examined further) |
| 0103:21, 0119:123-124 `to_jsonb(scalar)`; 0109:113 | not whole-row | scalars or `jsonb_build_object` with named keys |
| packages/db/tools/synthetic-restore.mjs:194 `row_to_json(t)` | not whole-row guard | compares one schema before and after a restore; no pinned shape |

No other whole-row durable record turned up beyond the 11 pack tables and the discrepancy outcome row.

### Is anything that used to fail for a real reason now passing?
No. Round 1 only adds checks: types are now compared (a retype used to pass, now fails) and one more table is guarded. Compared with aa3541f nothing is relaxed. Compared with the original file on main, the two relaxations in the section above are unchanged (xmin/ctid in the head step only; a column added to a guarded table is now caught by the guard instead of the upgrade test).

Checks after Round 1 (at 3d5b8bf): `LANE_BASE_REF=origin/main pnpm lint:lanes` exit 0; `pnpm typecheck` exit 0 (7 tasks); `LANE_BASE_REF=origin/main pnpm lint` exit 0; strict ad hoc `tsc` of both test files: no errors in them.

Builder receipt only — not independently verified, not accepted.
