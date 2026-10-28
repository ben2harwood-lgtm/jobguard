# CH-8 part 2 — RED, preparation with runtime refusal

Plan piece: finish-list row 11, BUILD_PLAN.md §10.4 CH-8, evidence packs with lock and reveal.
Base: codex/sandbox/ch8-v-catchup (PR #381); branch: codex/sandbox/ch8-rest.

This piece adds synthetic worker requests, eight-section database material, checked immutable storage,
worker-only must-surface completion receipts, exact-hash attachment approval, an additive UI and offline
verifier dispatch. Migration 0306 is expand-only; it does not change existing shadow-table grants.
The infrastructure request table is a reviewed-design infrastructure exception carrying identifiers,
request time and completion time only; tenant payloads/digests remain private tenant business rows.

The queue is necessary to keep the runtime login unable to read hidden material or invoke the checked
writer. SQL pins the order-time pre-lock state, reauthenticates after waits, and compares the current
server inventory before storing content or an approval. Content stays exact PostgreSQL row JSON text,
including original base64 bytes where stored, microsecond strings and rational strings. Record version
and object version labels are record-content hashes, not assertions about an S3 object version. Source
record contents retain the original immutable object version identifiers. Sections absent upstream
remain explicitly absent. Stored approval records do not claim continued source freshness or permit
legacy message attachment sinks to consume v3 IDs.

## Router scope decision, 28 October 2026

Part 2 is ready as preparatory implementation. The fresh shadow-30000 source-to-settlement/UI/verifier
journey is explicitly CH-8 part 3, after codex/sandbox/sv6-hookup supplies runtime attribution.
It is not built or claimed here. The public SV-6 assessment command still refuses on this base.

Consequently v3 generation and approval now refuse with EVIDENCE_PACK_V3_DEPENDENCY_HELD at the
authenticated application boundary, before queue dispatch. The SQL request routine also refuses, and
the checked writer independently refuses even owner-seeded stale queued work after reauthentication.
No pack with absent or invented attribution/settlement can be created through these runtime paths.
Pure assembly specimens and source preparation remain available for construction; they are not
persisted runtime packs. v1 behaviour remains supported. Database refusal regressions are for CI.

Independent RED review and GitHub database/browser validation remain required. These changes overlap
part 1; preserve its dependency/merge order and both sides of shared expectation lists.

## Checks actually executed

- Node 24.17.0, installed Vitest 4.1.12, explicit maxWorkers=2, at most three named files per run.
- Core evidence-pack-v3, evidence-pack-v3-assembly, evidence-pack: 99 tests passed.
- API evidence-pack-v3.application, evidence-pack-v3.worker, evidence-pack.application: 34 tests passed.
- Installed TypeScript checks for core, db, api and web passed.
- Money arithmetic and commercial-boundary checks passed.
- CLI syntax check passed with node --check. CLI subprocess tests: 5 passed, including v3 dispatch.
- Controller/errors focused run: 18 passed after updating the stale producer double.
- git diff --check passed.
- Root lint did not pass: the lane comparison against main includes inherited PR #381 paths,
  including its separate lane registration. This lane lists only this piece's actual changed paths.
  The router must preserve the stacked dependency/merge order; no check or predecessor lane was weakened.
- Controller/errors focused run initially found a stale held-producer test; its producer double was
  updated to exercise an actual queued dependency failure instead of relying on removed application refusal.
- PostgreSQL/migration/browser suites were not run: this sandbox cannot start PostgreSQL or bind localhost.
- The first API test attempt failed because storage dist had not been built. Building installed local
  storage/config/AI dependencies fixed it; the same three named API files then passed.
- The pnpm shim stalled while attempting its pinned-manager handoff, so checks use the existing
  node_modules/.bin/tsc and per-package node_modules/.bin/vitest. No packages were installed/downloaded.

## Initial review simplification

LATER / SIMPLICITY — packages/db/src/evidence-pack-v3-sources.ts and evidence-pack-v3-ports.ts:
after the queued source path is accepted and all consumers migrate, retire the separate held preparation
path. One source/authority path would reduce duplicate contracts and maintenance. This does not block.

## Follow-up fail-closed verification

The router-scoped follow-up adds application and independent SQL refusal fences. The targeted API
application/controller tests verify HTTP 409, no queue or writer calls, authentication first and v1
compatibility. Pre-lock and post-lock PostgreSQL regressions now assert no v3 artifact or approval
can be persisted while the runtime hookup is unavailable; those suites remain for CI.

Follow-up results: 32 tests passed across evidence-pack-v3.application.test.ts,
evidence-pack-v3.controller.test.ts and evidence-pack.application.test.ts with maxWorkers=2.
Core/db TypeScript builds and API TypeScript no-emit check passed. git diff --check passed.
No unresolved merge paths or conflict markers were found. No DB/browser suite was run locally.

## PR #389 catch-up after #381 merged — 28 October 2026

RED — CH-8 part 2, BUILD_PLAN.md §10.4. This is only a merge catch-up;
no new behaviour or aggregate CH-8 completion is claimed. The issued brief
reports the prior RED pass; this entry is builder validation of the catch-up.

Resolved the two remaining export-barrel conflicts by retaining both branches'
exports. All shared expectation/privilege files already match origin/main
8e80dabda2de93ccd094ec65acda2568a0b9ff91 exactly, including LP-0,
SERIOUS-B5, contractor entitlement, tenancy and the effective-privileges contract.
All migration SQL and notes from main are byte-identical to main; the only
additional migration and note are 0306_evidence_pack_v3. Migration 0306 SQL
is byte-identical to the branch HEAD, SHA-256
5d0a300b27bf74601c37296009414da15a96c6f10e14eea6f0c0bd6a0b82dea8.
The existing ch8-rest lane lists exactly the payload paths differing from main;
its own lane file is implicitly permitted. Updated only its catch-up note.

Local validation, installed Node v24.17.0 and Vitest 4.1.12, maxWorkers=2,
three named files per Vitest invocation:

- packages/core: node_modules/.bin/vitest run --maxWorkers=2
  src/evidence-pack-v3.test.ts src/evidence-pack-v3-assembly.test.ts
  src/evidence-pack.test.ts — PASS, 99 tests.
- apps/api: node_modules/.bin/vitest run --maxWorkers=2
  src/evidence-pack-v3.application.test.ts src/evidence-pack-v3.controller.test.ts
  src/evidence-pack-v3.worker.test.ts — PASS, 25 tests.
- Installed tsc -p tsconfig.json builds in packages/core and packages/db — PASS.
- Installed tsc -p tsconfig.json --noEmit in packages/db and apps/api — PASS.
- Existing lane validator exports applied to working-tree diff against main:
  exact payload path coverage and migration order — PASS, 27 paths including
  the implicitly permitted lane file. This is not the committed-range CI check;
  the pending merge index still contains main's changes until router staging.
- git diff --check and final working-tree conflict-marker scan — PASS.

No Git write, download/install, PostgreSQL start, browser suite, localhost
listener, real data, money, provider or release action occurred. Database,
migration and browser suites remain for GitHub CI after router push. The
read-only index still reports two unmerged paths; the router must stage the
resolved working files and complete the pending merge. Ready commit message:
/tmp/ch8-rest-20261028T211109Z-commit-msg.txt.

## PR #389 repair round 1 — 28 October 2026

RED — CH-8 part 2, BUILD_PLAN.md §10.4. No merge conflicts were present.
The actual worker composition already installed CH-8 discovery/build tasks in
normal and practice modes; the SV-3 composition test still expected the older
final-check-only list and cron. Updated its exact lists and cron, preserving
startup gating, accepted-terms checks and the exclusion of outbox from practice.

Migration 0306 already installed four app tables, six indexes and nine routines.
Entitlement-upgrade now expects those four empty tables. SERIOUS-B5 adds only
those exact tables/indexes/routine signatures and tenant policies, verifies the
nine routines' exact owner/executor ACLs (including owner-only helpers), and
continues comparing all predecessor rows and catalogue metadata on repeat
migration. No predecessor expectations are filtered out or weakened.

LP-0 was missing 0306's capabilities. Added exactly six non-owner ACL facts:
two runtime EXECUTEs, three shadow EXECUTEs and infrastructure SELECT on its
identifier-only queue table; plus their six corresponding ownership facts.
No runtime table grants, PUBLIC EXECUTE or extra helper grants were added.
The new authority group/path documents dependency refusal and worker separation.
All prior LP-0 entries remain. No migration, production code or grant changed;
0306 SQL SHA-256 remains
5d0a300b27bf74601c37296009414da15a96c6f10e14eea6f0c0bd6a0b82dea8.
The lane now includes the four additional actual repair payload paths, with no
lane-directory/register grants. Its own file stays implicitly permitted.

Local checks with installed tools, maxWorkers=2 and at most three named files:

- API Vitest shadow-detection.worker + evidence-pack-v3.worker: PASS, 11 tests.
- DB Vitest lp-0-catalog: PASS, 26 tests.
- Actual LP-0 inventory parse and authority-path completeness: PASS.
- DB TypeScript no-emit: PASS. Both edited upgrade tests transpile without
  syntax diagnostics (not database execution or full test-file typechecking).
- Root node tools/lint.mjs: PASS (purity, lane/migration order, money arithmetic,
  commercial boundaries). Existing computed-import notices remain nonblocking.
- Vitest list collects entitlement-upgrade, SERIOUS-B5 and LP-0 grant-freeze:
  PASS, 20 tests collected, not executed.
- git diff --check: PASS; unmerged index entries: none; 0306 matches HEAD bytes.

A helper invocation initially used the API directory for repository-relative
paths and exited before editing; reran the edits from the repository root.
No package installation, Git write, PostgreSQL start, localhost, browser,
provider, real data, money or release action occurred. PostgreSQL grant-freeze,
authority-path and upgrade suites remain for GitHub CI after router push.
Ready commit message: /tmp/ch8-rest-20261028T214749Z-commit-msg.txt.


## PR #389 catch-up after #380 (M4-9-S) — 28 October 2026

RED — CH-8 part 2; merge catch-up only, no new behaviour. Retained main's
successFees workspace binding and CH-8's listV3 binding. LP-0 entries, groups
and authority paths are the exact keyed union of main and the reviewed branch.
SERIOUS-B5 retains main's two 0302 success-fee routine expectations plus CH-8's
0306 additions; entitlement upgrade retains main plus the four CH-8 tables.
The lane's exact payload paths still match the diff against origin/main; its
own path is implicitly allowed. All SQL bytes are unchanged: 0306 matches HEAD
(SHA-256 5d0a300b27bf74601c37296009414da15a96c6f10e14eea6f0c0bd6a0b82dea8);
all other SQL matches origin/main.

Local validation with installed tools:

- API Vitest evidence-pack-v3.application, evidence-pack-v3.worker and
  success-fee.application: PASS, 34 tests, maxWorkers=2.
- DB Vitest lp-0-catalog: PASS, 26 tests, maxWorkers=1.
- Core TypeScript build, DB and API TypeScript no-emit: PASS.
- Actual LP-0 inventory parse/path completeness and exact main/HEAD union: PASS.
- Core purity, money arithmetic and commercial boundary checks: PASS.
- git diff --check, payload conflict-marker scan and exact lane-path check: PASS.

The initial API run passed 23 CH-8 tests but failed 11 success-fee tests because
installed core dist predated main's new exports; rebuilding core and rerunning
passed all 34. The root lint wrapper stops at the lane check while the merge is
uncommitted: main's staged incoming paths are counted as local CH-8 edits.
No lane grants were widened; the actual payload against main matches exactly.
The tsx CLI inventory helper could not open its IPC pipe; node with the existing
tsx loader ran that same validation successfully without binding a socket.

PostgreSQL, browser, full CI and the post-commit lane gate remain for GitHub CI
after router push. No Git writes were performed. The two unmerged index entries
must be staged by the router with the resolved working-tree files before the
merge commit. This records builder checks, not a new independent RED review.
Commit message: /tmp/ch8-rest-20261028T220936Z-commit-msg.txt.
