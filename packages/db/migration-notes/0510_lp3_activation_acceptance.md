# LP-3: activation and acceptance cutover (RED, dark)

0404 adds checked overloads for the four legacy routes, closes runtime EXECUTE on
all four old signatures in the same transaction, and leaves owner-connected
historical fixture calls available. New overloads refuse outside the trusted
`jobguard_synthetic_demo` database, regardless of caller-set deployment flags.
No provider, fee posting, real-data enablement or release is introduced.

A private helper checks current owner membership after aggregate lock waits,
same-actor/same-type processing receipt, the independently reconstructed UTF-8
input digest, exact approved Decision/resolution/authorization and wall-clock
expiry/revocation. Immutable use rows make authorization and command consumption
unique and bind job, actor and expected revision. Runtime has only tenant-scoped
SELECT on that new table; no new runtime table writes. The privilege inventory
lists the exact replacement overloads and read-only side table; scanner logic and
source fingerprints are unchanged.

The dispatcher binds LP-3 mutation inputs into its existing request fingerprint
via a full SHA-256 semantic-key suffix. Generated output IDs are excluded; all
requested facts, including expected revision and occurrence timestamps, remain
bound. Acceptance/disposition repositories recover the original revision from
the use row on retry. Replays recheck active membership. Earlier receipts without
use rows have no invented consumption history; incompatible historical fingerprints
fail closed rather than authorizing a new operation.

Existing business routines remain authoritative for party binding, source-state
checks, v1 cap calculation, quote supersession, immutable reacceptance history and
customer billing exclusions. Simulated settlement additionally refuses a second
event for an already settled obligation. Approval timestamps remain transaction
start, expiry remains wall clock after waits, and audit retains its existing
ordered wall-clock implementation; CH-7-TERMS is unchanged.

No backfill rewrites historical business rows. Migration discovery is automatic.
Forward-fix is the recovery strategy: leave old runtime signatures revoked and
repair the checked overload/caller together. Never restore the unchecked grants.
An older application using the withdrawn signatures must be quiesced at cutover;
no runtime compatibility fallback is introduced. Historical upgrade fixtures use
explicit owner connections and retained overloads.

Local source checks and deterministic unit tests do not prove PostgreSQL behavior.
CI must run the real database/migration suites, the LP-0 catalogue guard and
browser journeys. The LP-3 database suite includes independent SQL/TypeScript
codec comparison, wrong actor/tenant/job/command/terms/payload, changed price/cap,
expiry after waits and long transactions, replay/consumption, reversal after live,
rollback and v1/v3 compatibility. RED Claude review and the whole-LP G1 gate remain.

## LP-3 stale-parent repair — 29 October 2026

Reconciled the router's pending merge of current LP-2 `a78c141f`: migrations
0356/0357 and LP-2's SERIOUS-B5 jobDoorAdditions match that parent exactly. The
stale 0195_unchecked_job_doors migration is absent; 0195_subscription_persistence
is preserved. Migration 0357 restores the fixed principal/current owner check,
command replay handling, small-builder/environment checks and job lock instead
of leaving the old fee-illustration body as the final definition. No routine was
rebuilt and no SQL was edited in this repair; 0411 remains byte-identical to
364ec19f (SHA-256 8d01db992b67342344eddca985a35a4889ba964469854128188a0306f7e3702e).

LP-0 now retains exactly LP-2's job-door classifications, withdrawn transition
and legacy-adoption grants, private imported-job guard, and practice/job-insert
groups, with only LP-3's four signature replacements and side-table entries
added. Removed duplicate sandbox/start-quote entries. SERIOUS-B5 applies LP-2's
catalogue changes once, then only LP-3's additions and reductions; it no longer
expects a second permit table or a SECURITY DEFINER imported-job guard. The three
fixture conflicts retain LP-3's trusted database helper and LP-2's imported-job
permit setup.

Local validation: installed Vitest 4.1.12 ran src/lp3-operation.test.ts,
src/lp3-mutations.test.ts and test/lp-0-catalog.test.ts with --maxWorkers=2:
3 files, 84 tests passed. Installed TypeScript: tsc -p tsconfig.json --noEmit
from packages/db passed. Read-only comparisons verified the exact LP-2
migrations/groups/four job-door entries, the full LP-0 union, unchanged 0411,
and byte-identical migrations on the starting main baad7d56. git diff --check
passed. Core purity, money arithmetic and commercial boundary checks passed.

node tools/lint.mjs did not pass: lane checking still includes the stale HEAD
and pending merge-index paths. Do not widen lanes to hide this. The global pnpm
launcher stalled and was stopped; tests used the installed package-local binary.
During validation main advanced to 7eef37d6, containing LP-2 via PR #283 and
0358_value_source_read. The router must stage resolved files, finish the pending
merge, catch up with current main, and rerun lane/migration checks against the
committed result. 0411 is the sole LP-3 migration and sorts above that main.
PostgreSQL, migrations and browser execution remain NOT RUN locally (sandbox
restriction); GitHub CI and a fresh exact-head RED review remain required.

## PR #414 reserved-number catch-up — 30 October 2026

Current main 042f7d39 (through migration 0386) is already merged at 48844c38.
Renumbered this branch's sole migration 0382 to the router-reserved 0397 using
tools/migration-renumber.mjs's exported planRenumber, reserving the intervening
range in the planner input. Applied filesystem moves/reference rewrites only:
the helper's CLI write mode stages files and is unavailable with read-only Git.
SQL remains byte-identical to the reviewed ccf79c57 version, SHA-256
8d01db992b67342344eddca985a35a4889ba964469854128188a0306f7e3702e.
The migration note, lane paths, LP-0 source references and upgrade test use 0397.
Earlier dated repair paragraphs above retain their historical migration numbers.

Read-only comparisons confirmed all 160 main migration files, every main lane
file and docs/contracts/lp-downstream-effects-v1.md are byte-identical to main.
LP-0 main inventory entries remain intact except LP-3's explicit legacy-route
replacements; no duplicate inventory identities exist. Shared SERIOUS-B5,
entitlement and tenancy diffs retain main's expectations plus LP-3 additions.
No routine body was recreated and no product behavior changed in this catch-up.

Local validation: installed Vitest ran src/lp3-operation.test.ts,
src/lp3-mutations.test.ts and test/lp-0-catalog.test.ts with --maxWorkers=2:
3 files, 86 tests passed. Database TypeScript --noEmit passed. Core purity,
money arithmetic, commercial boundary and PL/pgSQL CASE-in-IF checks passed;
git diff --check passed. Combined tools/lint.mjs stopped at the lane checker
because the sandbox starts at detached HEAD; no lane rules were changed.
PostgreSQL/migration/browser execution is deferred to GitHub CI under the issued
sandbox constraint. Router must commit on the registered branch and rerun lane
checking and CI; exact-head RED review remains a separate gate.

## PR #414 current-main catch-up — 30 October 2026, 20:42 UTC

The router pre-merged current origin/main b6a0941d (PR #433, through migration
0398) at 188b66d0. Verified that merge retains main's migrations, lane files,
LP-0 inventory and SERIOUS-B5, entitlement and tenancy expectations, with only
LP-3's already-reviewed additions/replacements. No routine body was recreated;
existing overloads still call main's authoritative legacy bodies. The downstream
effects contract is unchanged.

Renumbered 0397 to the reserved 0404 with the exported planRenumber from
tools/migration-renumber.mjs, reserving through 0403 in the planner input. Used
filesystem moves and reference edits because CLI write mode stages Git files.
SQL remains byte-identical to reviewed c2fe17c5, SHA-256
8d01db992b67342344eddca985a35a4889ba964469854128188a0306f7e3702e.
Earlier dated paragraphs retain their historical migration numbers.

Local checks: package-local Vitest 4.1.12, --maxWorkers=2, ran
src/lp3-operation.test.ts, src/lp3-mutations.test.ts and
test/lp-0-catalog.test.ts: 3 files, 86 tests passed. Package-local
tsc -p tsconfig.json --noEmit passed. Core purity, money arithmetic, commercial
boundary and PL/pgSQL CASE-in-IF lints passed; git diff --check passed.
The lane CLI refused detached HEAD; direct exported lane-path and migration-order
checks passed against origin/main and the final filesystem. Router must rerun
the actual lane CLI on the registered branch after committing. PostgreSQL,
migration and browser suites are deferred to GitHub CI by the issued sandbox
constraint. The known main-wide meter-track-review-upgrade table-count failure
was left untouched as instructed. No new behavior; RED exact-head review and
green current-main CI remain separate merge gates.

## PR #414 current-main catch-up — 31 October 2026

Resolved the launcher's pending origin/main merge as the union of current main
and LP-3. LP-0 has 1,453 unique privilege entries, 70 groups, 45 authority paths
and 548 unique recorded routines, retaining main's latest unchanged records and
LP-3's explicit legacy-route replacements. SERIOUS-B5 retains all 38 main
helpers byte-for-byte, plus the separate top-level LP-3 helper; both LP-3 and
timeline helper calls remain. Tenancy and entitlement expectations retain main
plus LP-3's table entries. No routine bodies were recreated; no new behavior.

Renamed only the migration stem from 0404 to reserved 0510, and updated its
current lane, LP-0 and upgrade-test references. SQL SHA-256 remains
8d01db992b67342344eddca985a35a4889ba964469854128188a0306f7e3702e.
All main migrations and lane files are byte-identical to origin/main; the
downstream-effects contract is unchanged. Earlier dated notes remain history.

Local checks: installed package-local Vitest, --maxWorkers=2, ran
src/lp3-operation.test.ts, src/lp3-mutations.test.ts and
test/lp-0-catalog.test.ts: 3 files, 86 tests passed. Database source
TypeScript --noEmit passed. TypeScript parser checks passed for B5, tenancy,
entitlement upgrade and LP-3 upgrade tests. Core purity, money arithmetic,
commercial boundary and PL/pgSQL CASE-in-IF checks passed. Read-only exported
lane-path/migration-order checks passed against origin/main and final files.
The lane CLI refuses detached HEAD; the router must rerun it on the registered
branch after staging and committing the merge. git diff --check passed.

The first local test invocation preceded conflict resolution because the repair
helper was invoked from the package directory; two catalogue tests failed on
conflict-marker JSON. Re-running the helper from the repository root and the
same three test files produced the passing result above.

PostgreSQL, migration execution and browser suites were not run under the
issued sandbox restriction; GitHub CI must run them. RED exact-head independent
review and green current-main CI remain merge gates. Git's pending merge index
was not written: the router must stage the resolved working files and renamed
migration/note before committing.
