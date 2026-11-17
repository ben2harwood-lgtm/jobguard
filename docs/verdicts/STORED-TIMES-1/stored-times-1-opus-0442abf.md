VERDICT: PASS
0442abfa124c83f4851871bad04c3e0fdc6e4609

# STORED-TIMES-1 (PR #142) — independent RED-lane review, Claude Opus 5.5, 12 Oct 2026

Reviewed: worktree `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/stored-times-1`, branch `codex/sandbox/stored-times-1`, head `0442abfa124c83f4851871bad04c3e0fdc6e4609` (confirmed with `git rev-parse HEAD`; working tree clean; contains main `8e91b2d2e28564b8a19aa5293041bfae1e551485`; equals `origin/codex/sandbox/stored-times-1`). The piece's change is `git diff 8e91b2d HEAD`: 8 files, 688 lines added, 0 lines removed or altered.

Method: reading and `git` only. I ran no test, build, install, server or database. Paths below are relative to the worktree; migrations are `packages/db/migrations/…`; "the test" is `packages/db/test/recovery-timing-pin.integration.test.ts`.

Blocking findings: 0. Later findings: 8.

---

## 1. Can the runtime role, or any role other than the owner, change either stored time AFTER insert?

**No.** I re-derived this from all 63 registered migrations (the registered list equals the files on disk and is sorted).

What exists on each table after every migration:

| | `app.recovery_case` | `app.practice_feed_event` |
| --- | --- | --- |
| Owner | `jobguard_migration` (0018:85) | `jobguard_migration` (0106:102) |
| Row security | enabled and forced; one policy, tenant only, for runtime and owner (0018:85) | same (0106:103-105) |
| `jobguard_runtime` table rights | SELECT (0018:85) + INSERT (0034:3). UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER revoked twice (0018:85, 0034:4) and never granted | `REVOKE ALL` then SELECT + INSERT only (0106:106-107) |
| Column-level rights | none (the tree holds thirteen column-level grants; all are on other tables) | none |
| PUBLIC | no schema access (0000:22), tables revoked (0000:80) | same, plus 0106:106 |
| `jobguard_infrastructure`, `jobguard_identity` | no access to schema `app` (0000:88-89; 0111:181) | same |
| Guard on UPDATE / DELETE | trigger `recovery_immutable`, raises 55000 "recovery history is append-only" for every role, owner included (0018:76, :85); never dropped, disabled or replaced | **none**: privilege only |

No later migration touches these rights. I searched every migration for: any GRANT/REVOKE/policy/trigger/ALTER naming either table (only 0018, 0034, 0106, 0107, 0119, 0127); `ALTER DEFAULT PRIVILEGES`, `GRANT … ON ALL TABLES`, `WITH GRANT OPTION`, role-membership grants, `ALTER ROLE`, `BYPASSRLS`, `GRANT SET ON PARAMETER`, `session_replication_role`, `DISABLE TRIGGER`, `CREATE RULE`, `INHERITS`, partitions, event triggers (none of any); dynamic loops over table names (only the three known lists: 0018:85, 0106:101, 0107:254-259); and every function definition (my scan parsed 168, of which 72 are definer routines).

Other ways in, each checked:

- **Delete and insert again:** runtime has no DELETE or TRUNCATE on either table. No foreign key on either table cascades, so deleting a parent cannot remove a row.
- **`INSERT … ON CONFLICT DO UPDATE` / `MERGE`:** both need the UPDATE right the runtime role does not hold (table or column), so they are refused with 42501 before any row is looked at; on `recovery_case` the append-only trigger would also fire.
- **A definer routine the runtime role may call:** only two definer routines touch either table. `app.configure_recovery_demo` (0023:17-36) inserts a case and omits the time (now pinned as well). `app.approve_synthetic_landing` (0097:38) only locks and reads the case. No routine of any kind updates or deletes either table, and no definer routine runs caller-supplied SQL. Nothing writes `practice_feed_event` except the product's own insert.
- **A view or rule:** the only view over these tables is `app.recovery_case_current` (0097:8-36). It is a multi-join view (not writable), runtime holds SELECT only (0097:34-35), and there are no rules or INSTEAD OF triggers. Creating one needs ownership.
- **Adding its own trigger or object:** runtime has no TRIGGER right on either table and only USAGE (not CREATE) on schema `app` (0000:81).
- **A second row with a better time:** `practice_feed_event` allows one row per event name per account (0106:69, :71) and one account per job (0106:26), so there is exactly one settled row per payment per job. A raw writer may add more case rows, but each is pinned.

**Is privilege alone enough on `practice_feed_event`? Yes, for every role that is not the owner.** The same permission system that refuses the UPDATE is what stops the runtime role removing a trigger, so a trigger would add nothing against the runtime role. The runtime role cannot give itself the right: it is not the owner, not a member of the owner role, cannot create roles and does not inherit (0000:5). Two tests would fail if a grant appeared: the merged `packages/db/test/practice-feed.integration.test.ts:637-641` (table grants exactly INSERT and SELECT) and the new test :226-233, which also covers column-level UPDATE and the TRIGGER right. The difference from `recovery_case` is real but only against the owner: the owner can rewrite a feed time (others observed this on the Mac; the test asserts it at :236-239). Not blocking under the order's rule; see L3 and L5.

## 2. Does the pin hold at insert?

**Yes, for every role, on both tables, whatever the statement supplies.**

- Function (0127:2-9): PL/pgSQL, SECURITY INVOKER (no DEFINER written), `SET search_path=pg_catalog`, owner `jobguard_migration`, EXECUTE revoked from PUBLIC and runtime. Whole body: `NEW.created_at:=transaction_timestamp(); RETURN NEW;`. No role test, no table read, no lock, no raise. It cannot be shadowed: the name resolves in `pg_catalog`, and a temporary schema is never searched for functions.
- Triggers (0127:10-11): `a_recovery_timing_pin BEFORE INSERT … FOR EACH ROW` on each table, ordinary (not ALWAYS). The firing role needs no EXECUTE on a trigger function; the merged guards are revoked the same way (0106:266).
- **Supplied past, future, NULL, omitted, DEFAULT:** the assignment is unconditional and runs before the NOT NULL check, so all five store the transaction's time. One small behaviour change: an explicit NULL used to fail and is now accepted and pinned. Harmless; not tested (L4).
- **Roles:** runtime, owner and a superuser in ordinary mode are pinned (triggers do not exempt owners). Infrastructure and identity cannot insert at all.
- **Firing order:** PostgreSQL fires same-event row triggers in byte order of name. `a_…` sorts before `recovery_message_source_write` and `practice_feed_event_guard`, so the pin is first on both tables. Order is not load-bearing anyway: `app.guard_recovery_message_source_write()` only takes a lock and returns the row unchanged (0107:247-252), and `app.guard_practice_feed()` never reads or assigns `created_at` in any branch (0106:115-221). Its integrity hash is thirteen named fields without `created_at` (0106:200-201; same thirteen at `packages/db/src/practice-feed-repository.ts:248`). I confirm the claim.
- **Ways round an insert trigger:** COPY fires row triggers (and is refused on a row-secured table for these roles anyway). There are no partitions or child tables, and attaching one needs ownership. `ALTER TABLE … DISABLE TRIGGER` needs ownership. `session_replication_role` can be set only by a superuser and no migration grants it. None is open to a role that is not the owner or a superuser.
- **Product writes and merged tests:** every product and merged-test insert omits the column (I re-ran the search over the whole repository: `packages/db/src/recovery-case-repository.ts:110`, `packages/db/src/practice-feed-repository.ts:250`, 0023:24 and eighteen test statements; none lists `created_at`). The pin writes the same value the default already wrote, so rows written in one transaction still share one time and every `ORDER BY created_at` is unchanged. Merged tests that seed times do it by superuser UPDATE in replica mode (`recovery-eligibility-v3.integration.test.ts:193-201`): an insert trigger does not fire on UPDATE, and ordinary triggers are skipped in that mode. No merged test enumerates all functions or all triggers on these tables in a way one more would break.

## 3. The money answers

**After the pin, a supplied time can no longer flip either answer for the merged examples.** The rule is `paid_before := e.state='settled' AND e.created_at <= c.created_at` (0119:102, applied at :103 and :107; the same comparison at `packages/db/src/recovery-eligibility-v3-repository.ts:41`). `c.created_at` is `app.recovery_case.created_at` passed straight through the view (0097:13). Both inputs are now written by the database on insert and cannot be changed afterwards by any non-owner role (question 1). So "£0, paid before you opened this case" and the full figures (F18 262,000p, F19 250,000p) can no longer be reached by writing 2000-01-01 or 2099-01-01 into either row.

**The residual, precisely.** The stored time is when the inserting transaction STARTED, not when the row was inserted or committed. A raw writer holding a transaction that began before the other row's transaction can insert inside it later and the row carries the old start time:
- a case inserted inside a transaction that began before a payment settled is stored as opened before the payment, so the payment counts at the full figure instead of £0 (the direction that raises a fee base);
- the mirror image: a settled row inserted inside an older open transaction looks earlier than a case opened in between, giving £0 instead of the full figure.

Neither needs a supplied value. Both need raw access as the runtime role and a transaction opened before the fact to be pre-dated, so the reach is "as far back as its oldest open transaction". Rows written in the same transaction tie, and a tie means "paid before" (£0).

**Do the records say this plainly and claim no more?** The contract (`docs/contracts/recovery-timing-pin-v1.md:49`), the receipt (`docs/verdicts/STORED-TIMES-1/BUILDER_RECEIPT.md:7`) and `packages/db/MIGRATIONS.md:792` carry the order's sentence word for word and are accurate about the owner, superuser and stored history. The ledger paragraph (`BUILD_PLAN.md:3365`) states the residual plainly but one clause over-claims: "nobody with raw database access can choose the two stored times". The owner role and a superuser still can. Wording only: L1.

**Any OTHER stored time or value the rule relies on that is equally unpinned? None that is a time.** The rule reads no reversal time, no claim-revision time and no command time; the view picks the latest claim and event by revision and sequence number, not by time (0097:17-18). The review row's own time is self-enforcing (its lines must be written in the same transaction, 0119:73, and it cannot commit without them, 0119:139). The other values it reads (settled state, movement, identity) are fixed at insert by the feed guard and table checks and have the same after-insert protection as the time. The one writer-chosen value is which feed row a raw review points at (0119:95-98): it may name the pending row when a settled one exists and store "Pending money cannot qualify", £0. That only lowers a figure and is already recorded in the investigation; it is not new. No new finding of this kind.

## 4. The upgrade proof against the standing rule

**It complies, and the reshape dropped nothing real about 0127.**

Shape now (the test :284-321): install every registered migration sorting before 0127 (:290-293); populate through the product and add one raw case with a chosen time, which the pre-pin database keeps (:297-298: `pinned false, kept_chosen true`, an observed "fails without 0127" for the case table); snapshot (:299-302); apply 0127 ALONE exactly as the runner does (:304-305; the runner's own two statements are `packages/db/src/migrate.ts:83-84`); compare (:306-309); then `migrate()` twice (:310); then compare rows by pre-existing column names (:311) and run behaviour checks (:312-316).

- **Could a later unrelated migration fail any assertion?** No, in the upgrade proof. Everything exact — whole-row text of eight tables, every earlier function's definition, the two tables' owner, access list, policies, constraints, column lists and triggers, the "+1 function, +2 triggers" counts and "exactly two triggers call the function" — is asserted on the 0127-alone state (:306-309). After all migrations the test asserts only: rows equal by named pre-0127 columns (:311), the old chosen-time row is kept (:312), the registry holds 0127 once (:313), new raw inserts are pinned on both tables (:314-315), the saved review reads back (:316). No migration count, no exact trigger list, no function definition, no whole row after later migrations. AC2 asserts only "first" and "present" (:145-146); AC10 only sorted, unique and after its two dependencies (:324-328). Two assertions on the fully migrated main database are deliberately strict and are outside the upgrade proof (L3).
- **Did the reshape weaken anything?** I compared `a8c8ad1` with head line by line. Every original assertion survives, moved to the 0127-alone state where it is at least as strong. Three things changed: (a) AC1's trigger query is narrowed to this piece's trigger name and tables (:131-133), with "exactly two callers" now at :309; (b) the column lists of the twelve fingerprinted tables left the snapshot. That direct check is no longer in this file, but 0127 contains no `ALTER TABLE`, the merged `fingerprinted-row-shape.integration.test.ts` pins those twelve lists after all migrations (others ran it at this head), and whole-row text of the two fingerprinted tables this fixture fills is still compared at :306; (c) 0127 reaches the populated database through the test's own two statements instead of `migrate()`, which is the same two statements. Nothing real about 0127 was lost.
- **Canonical text?** Yes. The after-all-migrations comparison is `SELECT row_to_json(s)::text … ORDER BY row_to_json(s)::text COLLATE "C"` over a sub-select of the named columns (:276-283); the 0127-alone comparison is `row_to_json(t)::text` (:254). Both keep microseconds. The chosen-time check (:312) compares inside PostgreSQL.

---

## Criteria

| Criterion | Result | Where |
| --- | --- | --- |
| AC1 shape | MET | 0127:2-11; test :130-142; "exactly two callers" at :309 |
| AC2 firing order | MET | test :143-147 |
| AC3 supplied time not stored (4 cases, runtime) | MET | test :148-153; helpers :78-115. The feed insert sits inside a complete valid advance (command, correct hash, audit entry, both settings) |
| AC4 owner and superuser pinned | MET | test :154-157 |
| AC5 product paths keep the database clock | MET | test :158-171 |
| AC6 money answers (F18/F19 a, b; F18 c; controls; saved = returned; replay) | MET | test :172-187; `assertReview` :116-128; amounts from the catalogue and fixture definitions, not literals |
| AC7 the door after insert | MET | test :189-240; contract :33-43 |
| AC8 merged tests unedited | MET | the diff holds exactly one test file, and it is new; control at test :241-249 |
| AC9 upgrade proof | MET as reshaped to the standing rule (question 4) | test :251-321 |
| AC10 registration and position | MET | `packages/db/src/migrate.ts:68`; test :322-329 |
| AC11 records | MET | contract :1-49; `packages/db/MIGRATIONS.md:786-794`; test :330-339 |
| No column added to any table | MET | 0127 has no `ALTER TABLE`; column lists compared at test :306 |
| No grant, policy, constraint or existing routine changed | MET | 0127 is one CREATE FUNCTION, one ALTER FUNCTION OWNER, one REVOKE on the new function, two CREATE TRIGGER; no CREATE OR REPLACE, GRANT, POLICY |
| No existing row touched | MET | 0127 has no UPDATE/DELETE/INSERT; whole-row text equal at test :306 |
| No fingerprinted table touched | MET | neither table is on the list; no DDL on any other table |
| Every merged test file unedited | MET | changed lines in existing test files: none |
| Merged superuser time-seeding tests untouched and still valid | MET | `recovery-eligibility-v3.integration.test.ts:193-201` unchanged |
| `apps/api/src/auth/context-boundary.test.ts` and its pinned files untouched | MET | no file under `apps/` in the diff; none of the 8 changed files is named in it |
| Lane registry gained exactly one line | MET | `config/agent-lane-assignments.json:90` (the allow list includes `BUILD_PLAN.md`, added for the ledger paragraph; see L7) |
| `BUILD_PLAN.md` gained only the §12.2 paragraph | MET | `BUILD_PLAN.md:3365` plus one blank line |
| 0127 registered in increasing order | MET | `migrate.ts:68`, after 0122 |
| Real assertions for each behaviour | MET | none vacuous. Refusal tests first prove the row is visible and re-read the stored time afterwards (:191-192, :201, :208, :211, :222) |

**No observed "fails without 0127" for the feed table: is it needed?** Not strictly. The probe is computed by PostgreSQL on the stored row (`RETURNING created_at=transaction_timestamp() pinned, created_at=$10::timestamptz kept_chosen`, :109) and cannot be true by accident. The identical probe was observed reading the opposite on the pre-pin case table (:298). AC6 (b) and (c) can only pass if the feed row's stored time is not the supplied one, because both the repository and the 0119 guard read it. The catalogue pins the trigger's presence on the feed table (:133, :309). An observed pre-pin feed run would be stronger and is cheap (L4).

## BLOCKING findings

None.

## LATER findings

- **L1. The ledger sentence claims slightly too much.** `BUILD_PLAN.md:3365` says "nobody with raw database access can choose the two stored times". True for the runtime role and every other non-owner role. Not true for the owner role (it can rewrite a feed row's time after insert; the test asserts this at :236-239), for a superuser in replica mode, or for times stored before 0127. Suggested: "no ordinary runtime role with raw database access can choose…; the table owner and a superuser still can".
- **L2. The new test runs on default time limits.** Its start-up hook (:37-48: start a cluster, apply 63 migrations) and AC9 (:284: second database, the whole migration list) have no explicit budget, so they get 10 s and 5 s. 67 of the 69 database test files that start a cluster give that hook an explicit budget, and FIXLATER-3 (in this head) added thirteen for exactly this shape. AC9 took 540 ms on the Mac. The order forbade new timeouts, so this is not a builder fault; it is a flake risk on a slow CI runner. If CI shows a timeout in this file, this is the cause. Suggested budgets: 120 s for the hook, 60 s for AC9.
- **L3. Two assertions make a weakness or an unrelated fact into required behaviour.** (a) Test :236-239 requires that the owner CAN change a feed time; a later piece that closes that door must edit this merged test. (b) Test :233 requires that infrastructure and identity have no USAGE on schema `app`; a later unrelated grant of schema usage, with no table right, would fail it. Neither is in the upgrade proof. (b) backs a sentence in the contract; (a) is better as a note than an assertion.
- **L4. Cheap coverage to add:** a raw advance with a chosen time on the pre-0127 database in AC9 (an observed pre-pin run for the feed table); an explicit NULL; `INSERT … ON CONFLICT DO UPDATE` as runtime on both tables; an owner or superuser insert on the feed table (AC4 covers the case table only, as the order asked).
- **L5. The feed table still has no append-only trigger.** After insert it is protected by privilege only, so the owner can rewrite a time, state or amount. An ordinary BEFORE UPDATE OR DELETE trigger like `recovery_immutable` would close that and would not disturb the merged time-seeding tests (they run in replica mode). Correctly left out under the coordinator's ruling; worth doing with the residual.
- **L6. The residual has no number on it.** PostgreSQL does not limit how long a transaction may stay open unless the deployment sets a timeout, so "bounded" means "bounded by the oldest transaction the raw writer still holds". The follow-up (wall-clock time plus the per-job lock) should also cover the mirror direction in question 3.
- **L7. Small record slips.** The receipt's builder section (:13, :21) still says the lane line holds exactly the issued allow list and that `BUILD_PLAN.md` is unchanged; commit `4634cde` added `BUILD_PLAN.md` to the allow list and added the ledger paragraph, as the order's header provides. `packages/db/MIGRATIONS.md:794` still says the database tests are NOT RUN. The contract (:41) cites `0000:24` for the PUBLIC schema revoke; it is `0000:22`.
- **L8. Neighbouring times the rule does not read are still writer-suppliable** on raw insert: `recovery_claim_revision.created_at`, `recovery_case_event.created_at` (both inside evidence-pack fingerprints) and `practice_feed_command.created_at`. A raw-written case can now carry an "opened" event dated differently from the pinned case time. No money answer here depends on them. Separately, the writer-chosen `source_event_id` (0119:95-98) is already recorded by the investigation and only lowers a figure.

## What I did not verify

- I ran nothing. Every "passes" above is other people's evidence: the Mac logs `~/.local/share/full-steam/jg-runs/stored-times-1-mac-*` do show 27/27, 63, 154, 17, 73, 11 and "Lane boundary passed" (at `4634cde`; later commits change only the receipt). The logs are timed 23:45-23:48, before commit `4634cde` (23:49), and carry no tree hash, so I cannot prove the test content run is byte-identical to the committed file.
- GitHub run 38182080763: not checked (no GitHub calls). CI must be green before merge. The repository-wide lint, build, `openapi:check`, the full database suite and the api/web suites were not run on the Mac.
- PostgreSQL behaviours taken from knowledge, not executed by me: byte-order trigger firing; no EXECUTE check when a trigger fires; `ON CONFLICT DO UPDATE` and `MERGE` needing UPDATE; `session_replication_role` being superuser-only; a temporary schema never being searched for functions. The Mac run is consistent with the first two.
- Grants or role memberships in a deployed database that are not in the migrations. `packages/db/src/demo-bootstrap.ts:39-41` gives its own admin login membership of the owner role by design; that login is an administrator, not the runtime role.
- Migrations 0123-0126 are not in this tree. I took the integrator's answer Q2 (none adds a trigger, replaces a trigger function or grants UPDATE on these tables) as stated.
- The other RED-lane check (Codex); I did not open its files.
- The four filtered words the order mentions (I do not know them).
