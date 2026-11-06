Built by Codex gpt-6.1-sol; dispatched by the Claude dispatcher, 13 Oct 2026.

ENT-5 — issued foundation and settled constraints only; RED lane. This is a builder run receipt, not a verdict or acceptance. Candidate head supplied for repair r2: `b1e87ecacc61e4014c9c8422c7112db169b07897`; the dispatcher will commit the r2 working-tree repair and bind the next review to that resulting commit.

## Base, authority and allocation

- `origin/main`: `6659fb58791ec22588948f005b2bd4f6b299fa48`, verified without fetching or changing refs.
- Original build-ahead dependency HEAD: `82f05c2af245255a84921108e554ecab4e065054` (ENT-3d #170 stack). Dispatcher-committed incoming/pre-commit HEAD for repair r1: `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`. No builder Git write, push, PR or checkout. Intended repair commit message: `/private/tmp/jg-msg-ent-5.txt`.
- Migration: `0157_extra_approval.sql`; one additive runner registration. No renumbering of predecessors.
- Main already contains 0139 ENT-3b and 0140 ENT-3c; it ends at 0140, not the draft's old 0138. The issued ENT-3d dependency supplies 0141 and is still a landing prerequisite. Main wins over the draft's older readiness/head descriptions. Catch-up and exact-commit review are required after #170 merges.
- BUILD_PLAN §9.1.2–§9.1.7 (lines 551–627), ENT-5 (890–921), §§2.4, 9.1.12/13, ledger ENT-4a-ALIGN (3376), FEE-BOTH-1 (3382), and graph (3436) were inspected. Against main, the only plan delta in this dependency stack is the two-line ENT-3d ledger amendment at 3396; all cited existing contracts are unchanged. AGENTS.md is unchanged. No plan amendment was written by this builder.
- Founder evidence actually read: `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261013.md`, card `jobguard-twenty-product-decisions-2026-10-13`. The three contracts quote every adopted ENT-5 answer verbatim and state its limited mapping.

Q02 uses immutable revision/source side bindings; no pricing-basis extension or authoritative cache writer. Q07 distinguishes a non-human rule fact and allows a following supplied customer step; no change to ENT-4a's merged validator. Q09 uses a new extra container and an explicit extra subject envelope around the merged integrity verifier. The legacy manifest's caseId is an internal `extra:<id>` integrity key only; no recovery case is inserted. Q17 is superseded by the header's already-prepared ENT-3d stack. Q18 remains a partial foundation split, with UI and integrated paths held.

## Change and source inspection

Pure modules validate the existing rule document schema, compare X/T/Y and value bands exactly, preserve frozen proposal inputs, and implement the newly issued constraints. No caller can promote a proposal to approved through these functions. Rule hashes in this proposal format use SHA-256 over the schema-normalized JSON document; this is a fixture/proposal encoding, not applicable-contract selection. Y < T remains admissible; the comparisons remain separate. A repeated person at the same supplied step slot returns `held_repeat_semantics`, rather than choosing Q04's unanswered repeat policy.

The migration creates only `app.extra_approval_revision_binding` and `app.extra_evidence_pack`. Both have tenant-qualified keys/FKs, migration ownership, FORCE RLS, SELECT-only runtime access, immutable-row triggers and source/subject insert guards. Polymorphic revision sources use explicit nullable qualified FKs plus same-extra/hash/positive-price checks. Predecessors must match tenant/job/extra and adjacent logical revision. Guards are invoker trigger functions, not callable business writers. Owner-created specimens do not prove approval or pricing authority. No backfill, submission, current approval state, client link, queue, schedule, Decision, outbox, fee or ledger write path is added.

Existing sources are loaded from named PostgreSQL columns as canonical JSON text, including full stored timestamps. Origin and SoR hashes are verified against the unchanged predecessor encodings. Capture text is checked against the immutable origin hash; it is not a new mutable revision. Confirmation reproduces ENT-3d's registered document and must match its exact object version, SHA-256 and byte length; it remains capture-only and identity unverified. Exact photo storage versions and original bytes are loaded in a second phase **after the database transaction commits**. All artifacts explicitly omit held requirement, steps and work-timing sources and remain incomplete approval packs. No client read path is issued.

The upgrade proof installs predecessors, populates accepted predecessor command sources and existing synthetic recovery fixtures, snapshots named columns/types and original row identities, applies 0147 alone, compares its own step, then runs later migrations/runner twice. Rolled-back microsecond and full-type controls must fail; nullable-column/function-replacement/later-row controls must pass. Every row-compared table has a non-empty predecessor guard. Empty tables still have their pre-existing column names/full types recorded; no empty row set substitutes for a row-preservation assertion. Existing recovery fixtures include synthetic invoice and authority rows solely for predecessor artifact compatibility; no new invoice/approval command is issued. SQL/real-database claims are **source-inspected only**, because the database suites were not run here.

Affected invariants: tenant isolation (§5.1); immutable source/commercial identity (§5.2); exact authorization remains absent for held execution (§5.3); no new outbox/retry route (§5.4); no new fee or financial arithmetic (§5.5–6/10); predecessor audit chain retained (§5.7); exact evidence lifecycle/version/hash (§5.8); no AI or prompt work (§5.9); no real-data/release permission (§5.11); no new context maker or offline work (§5.12); independent verdict/acceptance still owed (§5.13). No new service, operational alert, provider destination or deployment is introduced.

Lock order: this foundation's runtime code only reads; it takes no business lock or audit head and has no deferred writer. Existing job advisory seed 417 and tenant administration seed 54 are unchanged. Future command/duplicate/escalation paths owe complete business locks before audit head, with no later business lock acquisition. No race/audit execution result is claimed here.

## New GRANT inventory — Standard F

1. `GRANT SELECT ON app.extra_approval_revision_binding TO jobguard_runtime;` (0157:52).
2. `GRANT SELECT ON app.extra_evidence_pack TO jobguard_runtime;` (0157:53).

Standard F statement: zero new direct INSERT/UPDATE/DELETE grants to the application login; no new business EXECUTE grant. PUBLIC/runtime/infrastructure execution of both new trigger functions is revoked. Runtime DDL/TRUNCATE/trigger denial and actual role/RLS/catalog behavior are written as PostgreSQL tests, **NOT RUN**, not asserted from SQL inspection as verified database behavior.

## Executed checks, actual commands and counts

All pnpm commands below used `export PATH="$HOME/Library/pnpm/bin:$PATH"` followed by the already-installed pinned binary directory `/private/tmp/ent-5-tools`. That directory contains only a symlink to `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs`. `pnpm --version` returned 10.28.1 (exit 0). No package install/download was run. Dependencies were already installed per the environment instruction. Runtime is installed Node v24.17.0; .nvmrc is 24.15.0, unchanged. This was not a clean reinstall or an exact .nvmrc-runtime rehearsal.

| Command | Exit / result | Counts / evidence |
|---|---|---|
| Initial global-shim `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts` | cancelled, 130 | Written before implementation; Vitest did not start. `/private/tmp/ent-5-core-first.log`. This is NOT an assertion failure or a passed red run. |
| Same core command, installed pnpm 10.28.1 | 0 | 3 files, 15 tests passed; `/private/tmp/ent-5-core.log`. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-client-approval.test.ts` | 1 | Tests-first sub-millisecond expiry control: 1 failed, 2 passed; `/private/tmp/ent-5-expiry-red.log`. Fixed using the merged exact timestamp comparator. |
| Final three-file core command above | 0 | 3 files, 15 tests passed; `/private/tmp/ent-5-core-final.log`. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/extra-approval-authority.integration.test.ts test/extra-evidence-packs.integration.test.ts test/extra-approval-upgrade.integration.test.ts` | pnpm 1 / compiler 2, three invocations | First: 4 diagnostics, two in own tests then corrected. Subsequent/final static check: 2 diagnostics, both in untouched ENT-3d fixture at 7 and 81. Logs `ent-5-db-test-types.log`, `ent-5-db-test-types-final.log`, `ent-5-db-test-types-handoff.log`. This does not execute a database test. Later documentary/title/fixture-table-list refinements do not constitute a database run. |
| `pnpm exec turbo run typecheck --force` | 0 | 7 successful packages, **0 cached**; 3m37.181s; `/private/tmp/ent-5-typecheck.log`. |
| `pnpm exec turbo run lint --force` | 0 | 7 successful packages, **0 cached**; 1m16.601s; `/private/tmp/ent-5-lint-force.log`. Package lint only; root lane gate is blocked below. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1 | 19 inherited ENT-3d paths refused; `/private/tmp/ent-5-lanes.log`. No alternate base or widened lane was used to obtain a pass. Root `pnpm lint` is held at the same refused lane prerequisite, not reported green. |
| `node tools/core-purity-lint.mjs` | 0 | 162 TypeScript files. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Money arithmetic boundary check passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Commercial-boundary check completed without errors. |
| `pnpm build --concurrency=2 --force` | 0 | 7 successful packages, **0 cached**; 57.783s; `/private/tmp/ent-5-build.log`. Existing autoprefixer flex-end warning. |
| `pnpm openapi:check` | 1, STOP | Schema comparison NOT RUN: tsx IPC listen EPERM; `/private/tmp/ent-5-openapi.log`. No alternative launch or generator run. |
| Repeated `git diff --check` | 0 | No whitespace errors. |

Forced Turbo runs printed `WARNING IO error: Operation not permitted (os error 1)` but executed all seven task scripts and reported zero cached tasks; they were not cache-hit results. Before every heavy check, `memory_pressure | tail -1` and `df -g /System/Volumes/Data` returned 0. Observed free memory 72–74%, free disk 54–52 GB, above the required limits. Tests ran one invocation at a time, at most three own files, `--maxWorkers=2`; build and tests did not overlap. Database/browser heavy-slot invocation is NOT RUN because neither suite can start in this sandbox.

Inspection command log (read-only calls, grouped; exit codes are whole-shell results): `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; rg --files ...` (0); `cat AGENTS.md` plus plan/task searches and package/lane reads (0); approval/evidence/source/upgrade helper reads (0, including a guessed missing `enterprise-domain/approval.ts`, later located in existing origin/contracts); predecessor SQL/runner/fixture reads (0); `memory_pressure`, `df`, `node --version`, handoff-directory list and broad home `rg --files` (2 at completion); focused source/pack/role/upgrade/fixture `rg`, `sed`, `cat`, `head`/`tail` batches (0 except a locator batch with a nonexistent project `jg-orders` directory, 2); own-lane JSON lookup and before/main plan comparison (1 for the plan difference); pinned catalogue/schema/type and actual founder-answer reads (0); `ls`/shim/log inspection batches (one missing root Vitest path, 1; one process-inspection batch, 1, see refusal below); installed pnpm-tool/corepack directory reads (one missing guessed pnpm directory, 1; actual cached binary directory, 0); local symlink creation and version check (0); `git diff origin/main -- BUILD_PLAN.md`/dependency history and tree reads (0); boundary-linter source reads (0); source/PK/trigger/storage/encoder reads (0); repeated redirected-check `tail`/`wc`/`rg` and resource reads (0); SHA-256 baseline probes (0); final `rg` test-title inventory (0). Shell source writes used `python3` only for the new lane/additive exports/registration/docs, own-test refinements, hashes, intended message and this receipt (each 0). Other edits used `apply_patch`, with no tool error. No shell deletion or Git write command was issued.

## STOP items — exact coordinator lines and before/after

Original handoff STOP items follow. Item 1 is resolved by the explicit coordinator-approved additive catalogue repair in r1 below; other source files remain unchanged.

1. `packages/db/test/tenancy.integration.test.ts:236` currently:

```ts
      { relname: "extra_duplicate_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Coordinator needs the following row **before** that unchanged line:

```ts
      { relname: "extra_approval_revision_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

At `:237`, currently the `extra_event` row, coordinator needs the following row before it:

```ts
      { relname: "extra_evidence_pack", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

The second catalogue at `:476` currently has `{ relname: "extra_duplicate_link", owner: "jobguard_migration" },`; coordinator needs `{ relname: "extra_approval_revision_binding", owner: "jobguard_migration" },` immediately before it. At `:477` the existing `extra_event` row needs `{ relname: "extra_evidence_pack", owner: "jobguard_migration" },` immediately before it. Existing rows stay unchanged. This fixed-list prerequisite prevents claiming a green mandatory migration/tenancy suite.

2. `packages/db/test/site-extra-evidence-fixtures.ts:7` currently:

```ts
import { ownerTx, note, description, counts, type Cluster } from "./site-extra-fixtures.js";
import type { Fixture } from "./extra-fixtures.js";
```

Coordinator-owned proposed after (lines 7–8):

```ts
import { ownerTx, note, description, counts } from "./site-extra-fixtures.js";
import type { Cluster, Fixture } from "./extra-fixtures.js";
```

`site-extra-fixtures.ts` does not export Cluster. Its missing import also causes the diagnostic at `site-extra-evidence-fixtures.ts:81:292` (`.rows.map(r => r.reason as string)`). That line is unchanged; correctly typing Cluster should restore the query-row inference. No annotation was added to hide the prerequisite error.

3. Main-based lane prerequisite: the lane checker refuses inherited ENT-3d files including `BUILD_PLAN.md`, `0141_site_extra_evidence.sql` and its API/core/db/test/receipt changes. ENT-5's delta from the issued HEAD contains only allowed paths. No merge, rebase, ref update or lane broadening was performed. Coordinator must merge #170 and catch up; there is no builder-owned before/after code edit for this dependency gate.

4. Sandbox refusal: `ps -Ao pid,ppid,etime,command | rg '(pnpm|vitest|ent-5)'` returned `zsh:1: operation not permitted: ps` (1). Process inspection stopped; no alternate process tool was used.

5. Sandbox refusal: exact command `pnpm openapi:check` returned `Error: listen EPERM: operation not permitted /var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/25271.pipe` (1), `code: 'EPERM'`, `syscall: 'listen'`. OpenAPI comparison stopped; dispatcher/CI must run the unchanged check. No escalation or automatic approval-review rejection occurred.

## Acceptance accounting

No aggregate ENT-5 acceptance is claimed. E5-20 and E5-26 have full proving tests written but NOT RUN; E5-29 has this documentary handoff and awaits independent review/acceptance. E5-01–19, E5-21–25 and E5-27–28 remain partial or wholly held.

- E5-01: independent exact comparisons and unpriced proposal behavior executed; operational proceed and combined T/Y policy held.
- E5-02: frozen supplied proposal executed; persisted applicable-contract requirement snapshots held.
- E5-03/04: no authoritative completeness/stale approval command issued; held.
- E5-05: supplied-person self/separation constraints executed, including cross-version history; persisted identity and repeat semantics held.
- E5-06/07/08: actual grant matrix and command races held.
- E5-09: immutable source-binding/source-preservation tests written, NOT RUN; revision commands/current-authority supersession held.
- E5-10: surveyor pricing constraint executed; actual commercial representation/writer held; no SoR reprice.
- E5-11/12/13: client access/consumption/sign-in held. Per-send expiry/replacement and named fictional/actual tester distinction executed as pure constraints only.
- E5-14: start/finish/uncertainty/established-breach preservation executed; actual work facts, timing/proceed and breach derivation held.
- E5-15/16: persisted mandatory queue and runnable escalation held.
- E5-17: supplied original/backup/wait constraints executed; timer/backup/notification execution held.
- E5-18/19: pure verifier adapter tests executed; actual-source/lifecycle/byte/version checks written in PostgreSQL tests, NOT RUN. Complete approval pack and exposure held.
- E5-20: recovery artifact/digest/verifier and predecessor named-column/full-type preservation proof written, NOT RUN.
- E5-21/22: pure individual-send approval/expiry/replacement and unused-authority cancellation executed; Decision/outbox/reconcile integration held.
- E5-23: duplicate/origin code unchanged; integrated command remains held.
- E5-24: new-table RLS/catalog/immutable/read scope and wrong-source proofs written, NOT RUN; business writers are absent and held.
- E5-25: no new command/audit path to prove; held races and transactional audit owed.
- E5-26: fresh/populated/own-step/later-twice and comparator controls written, NOT RUN.
- E5-27: transports/application/registry changes held; none introduced.
- E5-28: no authoritative approval/financial effects path issued; production/pilot command proof held.
- E5-29: this receipt names identity/UI/release/full-card debt; independent exact-commit verdict and separate acceptance missing.

Executed own test inventory (15 tests):

- `packages/core/src/extra-approval.test.ts`: `E5-01 exact thresholds and unpriced requirements`.
- `packages/core/src/extra-approval.test.ts`: `E5-02 partial immutable proposal retains supplied identities evidence and timer terms`.
- `packages/core/src/extra-approval.test.ts`: `E5-01 malformed documents hash mismatch and invalid money fail with typed errors`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q06 required customer approval follows required company approvals`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q01 surveyor pricing authority remains separate from pricing representation`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q11 supervisor withdrawal does not infer wider role authority`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q04 revision cannot bypass separation or self-approval`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q05 start and finish representations retain uncertainty and established breaches`.
- `packages/core/src/extra-approval.test.ts`: `BEN-Q08 original approvers remain eligible and backups require agreed waits`.
- `packages/core/src/extra-client-approval.test.ts`: `BEN-Q10 each send requires approval, links expire and replaced requests are cancelled`.
- `packages/core/src/extra-client-approval.test.ts`: `BEN-Q13 fictional client role records the actual tester`.
- `packages/core/src/extra-client-approval.test.ts`: `BEN-Q14 history survives while future actions and unused authority stop`.
- `packages/core/src/extra-evidence-pack.test.ts`: `E5-18 partial extra sources and shared verifier`.
- `packages/core/src/extra-evidence-pack.test.ts`: `E5-20 existing verifier uses an integrity key without creating a recovery subject`.
- `packages/core/src/extra-evidence-pack.test.ts`: `E5-19 optional absence and confirmation limits are explicit in source artifacts`.

PostgreSQL test inventory (13 actual tests: 4 authority, 5 upgrade, 4 evidence; the stray `/` entry was not a test), each **NOT RUN (cannot start PostgreSQL here)**:

- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial catalog RLS and absent business writer boundary`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-09 partial source binding preserves the origin-bound SoR row and basis`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial wrong-job revision hash and predecessor specimens refuse`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial migration-owner mutation of immutable foundation rows refuses`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `E5-26 rule-9 upgrade proof`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `E5-20 existing pack and fingerprint compatibility`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `E5-26 one-microsecond and full-type changes FAIL using the same comparator`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `E5-26 later nullable column replaced function and added row PASS using the same comparator`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `E5-26 fresh installation succeeds twice`.
- `packages/db/test/extra-evidence-packs.integration.test.ts`: `E5-18 extra sources and shared verifier — issued sources only`.
- `packages/db/test/extra-evidence-packs.integration.test.ts`: `E5-19 pending rejected foreign and wrong-version source controls refuse`.
- `packages/db/test/extra-evidence-packs.integration.test.ts`: `E5-19 evidence lifecycle and confirmation limits — issued sources only`.
- `packages/db/test/extra-evidence-packs.integration.test.ts`: `E5-18 tampered stored sources are detected through persisted hashes`.

The helper `packages/db/test/extra-approval-fixtures.ts` is not a proving test. Database fixtures use existing contractor/work-order/pricing/evidence commands, two contractor tenants, a third tenant assigned small-builder, separate branches/teams/clients/contracts/role grants and actual immutable source records. Owner specimens and legacy synthetic recovery fixtures are labelled; they are not sign-in or commercial authorization evidence. No new tenant-context constructor or cast was introduced. Success source reads/logs use the merged persisted contractor session bridge unchanged.

Full-suite `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, existing core/db/API regression batches, fingerprinted-row-shape suite and existing browser regressions are NOT RUN locally under the addendum's own-files-only limit and sandbox boundary; dispatcher/CI must run them. No new browser journey exists because UI is parked. No mocked PostgreSQL proof, mocked provider send or local fixture is presented as an integration run. AI evaluation and native suites are inapplicable: no prompt/model/extractor/matching policy or native code changes.

Unbuilt held test files remain obligations, without empty/skipped files: extra-approval.integration/replay/races/escalation, extra-client-approval.integration, extra-approval-outbox.integration; the API application/HTTP/worker suites and the four Next transport suites in the order. All six named replay/refusal properties, different-actor/kind reuse, authority-first live guards, queue counts, races, once-only workers, unknown-outcome sends and actual client actor binding remain owed.

## Remaining questions and release gates

Q01 commercial pricing representation/adjustments/rounding/revision components; Q03 applicable contract/rule; Q04 persisted person key/repeat semantics; Q05 operational facts/reporting matrix/backdates/uncertainty/timing/evidence/proceed/breach derivation; Q06 actual thresholds and T/Y composition; Q08 timer origin/waits/backup list/notification authority; Q10 send/cancel roles/lifetimes/resend/unattended rules; Q11 rejection/wider withdrawal; Q12 consumed-link retry/history access; Q13 provisioning/session/authentication identity bridge and exact lane; Q14 export eligibility/refusal audit; Q15 scheduler discovery/tenant resolution/outbox checks; Q16 within-order query/automatic SoR submission remain HELD. Q07's downstream ENT-4a compatibility amendment also remains owed: origin.ts:60 currently permits contract_rule only as the sole step, and the merged actor schema requires a human UUID; neither file/test was changed or a compatible full chain enabled.

The client identity prerequisite is not supplied by a practice owner, role label, email or fixture session. Client invitation/sign-in/page/navigation/browser journey and all UI are parked. No full ENT-5 card completion is reported. Real customer information remains OFF pending approved privacy/safety/provider/retention promises; D02/D06/D12/D16 remain unapproved here, no spending, no deployment, and ENT-10e stays held. Existing M1/M4 and enterprise real-data/fee/AI gates remain unresolved. A later feature cannot treat these frozen proposals or specimens as approved production policy.

## Builder source inspection (not an independent verdict)

Inspected every new GRANT, source FK/subject check, immutability trigger and module export. Removed storage I/O from transaction assembly. Strengthened expiry comparison after its failing microsecond test. Kept conflicting threshold composition, repeat identity rules and complete pack claims held. Corrected only own test imports/types; recorded predecessor errors instead of editing merged setup. Protected sources and shared harnesses match the issued dependency HEAD hashes below. SQL authority and upgrade behavior remain unexecuted and need PostgreSQL checks; no professional, security or commercial approval is inferred. Different-model verdict and separate actor acceptance must bind the dispatcher's eventual exact commit, after dependency catch-up.

LATER: client screens and complete journey remain parked for the separately issued UI part. Coordinator-owned plan recording of side-cache/pack representation and catalogue/fixture prerequisite fixes is still needed.

## Original handoff lane evidence and hashes

`git diff --stat HEAD` (tracked additive files only; new files are untracked because no git add is allowed):

```text
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 4 ++++
 packages/db/MIGRATIONS.md          | 8 ++++++++
 packages/db/src/index.ts           | 4 ++++
 packages/db/src/migrate.ts         | 1 +
 5 files changed, 18 insertions(+)

```

17 new untracked implementation/contract/test files accompany those five tracked additions; this receipt is the eighteenth new file. Every current delta path is in this lane's explicit allow list. No existing merged test, pinned source, shared replay harness, fingerprinted table, predecessor SQL or unrelated file was edited by ENT-5. The main-to-HEAD dependency diff is separate from the HEAD-to-working-tree delta.

Original handoff protected-file SHA-256, unchanged against the dependency HEAD at that time (r1 catalogue exception and repair hashes below):

```text
21d7c5ba11b66d000c3689b8c65d9defa9c8840889cde4ff1241105f558682b3  BUILD_PLAN.md
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1  AGENTS.md
29605ffb78bc6193da5d1483834c15456b0a23561cd2bb95f26bc564dd1ff852  packages/db/migrations/0140_site_extra_pricing.sql
253a65ba1297767cd30ed839cbbef0c570d0ffde99767f8b2de4b6a4ec85f93f  packages/db/migrations/0141_site_extra_evidence.sql
9f6fea7584be0961ac4250fce9213bb7c65308c6c5c329f3b3bcebb97b9aa21c  packages/core/src/enterprise-domain/origin.ts
f36990414ad19bd5a716f0a33ff1971591385510ff2f138d1e6afc1e5d161285  packages/core/src/enterprise-domain/transitions.ts
a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35  apps/api/src/auth/context-boundary.test.ts
7c2f648e17ce97885b7a387713496a3bbe487b6150627e393b5822a8946f6169  packages/db/test/tenancy.integration.test.ts
09787a6496a1597abae55915e1d25883922b89f96b7e6cbbbac6b88bcc9fbf74  packages/db/test/site-extra-evidence-fixtures.ts
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts

```

Original handoff delta SHA-256 (receipt excluded to avoid hashing its own text; r1 repair hashes below supersede changed files):

| File | Issued HEAD SHA-256 | Working SHA-256 |
|---|---|---|
| `config/agent-lane-assignments.json` | 04164a0ca67e08ce117e539015416ad0f7016e1a88d40a6d112584c642c3e44b | 7e6c8d79523191588bc21e0edb7d8fda119e5a76b5a46fb01bb1d8458e8a0627 |
| `docs/contracts/extra-approval-v1.md` | new | 25eab575555e764412af8a086d1e2df49925d38d83ea71e4b3ef1971ea4cc805 |
| `docs/contracts/extra-client-approval-v1.md` | new | 3c0164103680a1c7773f42f68de3e34d61c7fc03d184daa01343af05036e1627 |
| `docs/contracts/extra-evidence-pack-v1.md` | new | a89d616c1989022afc1743db14d2809a14ae3ce5b506382aa4ccbea0f07b9f93 |
| `packages/core/src/extra-approval.test.ts` | new | dce4663bc6342873c49d660e988da1a0a17b034777ad2cf4449fedc493a9723c |
| `packages/core/src/extra-approval.ts` | new | 9f51f13923d7e08beb7103cf5c8cc97057be313ed824a68fb5262360b01b99da |
| `packages/core/src/extra-client-approval.test.ts` | new | 0e5b856028e75bf408e9be404c8857978627bf9cd5058cc02bf2e951207d34ab |
| `packages/core/src/extra-client-approval.ts` | new | 8b66d6324731ac48f07f4c415fc643a75e18ba838f3a0c627e370381c5a35206 |
| `packages/core/src/extra-evidence-pack.test.ts` | new | 1813137c1fb42152f17d169d4074ea0552abd4335f023c810cde90c06875bd78 |
| `packages/core/src/extra-evidence-pack.ts` | new | 3f35a99b953751a884df52976cfd0689ec0c8380e5245291e9ce5a7cfbd32faa |
| `packages/core/src/index.ts` | 626429cce51c620e254db160138fbab68ba7a0c7ce176b86bd7a526be079a95e | 8f6d6462d44bb67f3a016ae8e73d2b2c5abde05396a1a56f9620c0d58dc6253b |
| `packages/db/MIGRATIONS.md` | 84541cfdbbaa0971f3736357eb17dc18eb5689624974a5214248e46e4de40ea9 | 5a7eb478316d7e88c4251b43282f5342b7cdcfc6914d2a429bb8769b0679ffab |
| `packages/db/migrations/0157_extra_approval.sql` | new | 0e10ed73dd26a83b661ef6e14e218ab1f0676e647c45096794f5de47092a534f |
| `packages/db/src/extra-approval-repository.ts` | new | 61e6c49d3d6511425f7154932babb5fe58542d14dd853c270ae729aa4d64a2af |
| `packages/db/src/extra-evidence-pack-repository.ts` | new | 04e866c5f085740396fc8bcc81f4fa6691df28a3c855345cb08190f67dc67af4 |
| `packages/db/src/extra-evidence-pack-sources.ts` | new | 683e079d541a0e5c3d00218cb45f2834bb3b2efbd6ac494c169c6382cb4b5ae9 |
| `packages/db/src/index.ts` | ed4269813c652a4bb0073ec0cdd586667125b1063d824d228ee858a65ebd897d | f18d313aef22316f36831f2b19d427c495f517dddcfc55a043aae8da034a3e56 |
| `packages/db/src/migrate.ts` | 95bb5640ec12ac7dff1e25b303e0224bea6ebbbdd843efe370c284ab2abe9fa2 | 334dd4e65b90463178ee0502e697c60b6a2465c923d70ea6938bab5d18bd9639 |
| `packages/db/test/extra-approval-authority.integration.test.ts` | new | 88a90be4c7fda85a754fc7f0ab63399898bc33f9d558e95b5682f3e80c028eee |
| `packages/db/test/extra-approval-fixtures.ts` | new | e99b6343e7f6f8aed48c29ee5c415768eb6b14da79350d97c5300673500e12f9 |
| `packages/db/test/extra-approval-upgrade.integration.test.ts` | new | db93fdf87f717aa370c28247936bc68cac100440c17d25504390521a2005b884 |
| `packages/db/test/extra-evidence-packs.integration.test.ts` | new | 6c1dc7188efc4a045e97060714479ef63eb6df7413eaec57d8ce67e29ff1a1b6 |

Repair r1 incoming/pre-commit HEAD: `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`; original dependency HEAD was `82f05c2af245255a84921108e554ecab4e065054`. The dispatcher committed the original build; the builder has made no Git write. Intended repair message is in `/private/tmp/jg-msg-ent-5.txt`. The r1 patch/hashes below identify the uncommitted repair. Independent verdict for the eventual repaired commit, separate acceptance and founder merge remain outstanding.


## Repair r1 — dispatcher 4, 13 October 2026

Incoming/pre-commit HEAD: `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`, branch `codex/sandbox/ent-5`. Read the independent Opus REPAIR verdict at `/Users/benharwood/.local/share/full-steam/jg-runs/ent-5-opus-dfcc97c.md`, bound to this exact incoming head. That verdict is source inspection only and is not a verdict on the repaired commit.

B1 before/after: `packages/core/src/extra-approval.ts:51` changes only the non-site-staff report result from `"refused"` to `"held"`; the own `BEN-Q05` test at `packages/core/src/extra-approval.test.ts:71` changes the corresponding expectation to `"held"`. The reporting matrix remains HELD, matching the withdrawal constraint. No caller or commercial writer is introduced.

Coordinator-approved catalogue exception: dispatcher 4 explicitly authorized four additive entries for the two new tables created by migration 0147. `config/agent-lane-assignments.json` adds the exact `packages/db/test/tenancy.integration.test.ts` allow path to ENT-5 and records the exception in that lane's note. No other lane is changed. This resolves original STOP item 1; no existing catalogue row is changed or removed. The following are the exact before/after blocks (line numbers refer to incoming HEAD):

RLS/guard catalogue, before lines 236–237:

```ts
      { relname: "extra_duplicate_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

After:

```ts
      { relname: "extra_approval_revision_binding", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_duplicate_link", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_evidence_pack", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "extra_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Ownership catalogue, before lines 476–477:

```ts
      { relname: "extra_duplicate_link", owner: "jobguard_migration" },
      { relname: "extra_event", owner: "jobguard_migration" },
```

After:

```ts
      { relname: "extra_approval_revision_binding", owner: "jobguard_migration" },
      { relname: "extra_duplicate_link", owner: "jobguard_migration" },
      { relname: "extra_evidence_pack", owner: "jobguard_migration" },
      { relname: "extra_event", owner: "jobguard_migration" },
```

Receipt correction: there are 13 actual PostgreSQL tests (4 + 5 + 4); the fourteen-item list included a stray `/` entry, now removed. The original dependency head is distinguished from the actual repair pre-commit head. Earlier command receipts and hashes are historical, not r1 execution evidence.

Scope: five changed files only (constraint, own test, tenancy catalogue, ENT-5 lane entry, receipt). No migration/schema/grant change, no new operational alert or release permission. Database/migration/browser suites are NOT RUN because the dispatcher's environment note confirms localhost binding and PostgreSQL startup are unavailable here; GitHub CI after dispatcher push owes those proofs. All previously held product questions and independent repaired-commit review/separate acceptance gates remain held. The builder runs no Git write commands; dispatcher owns the commit.


Repair r1 commands use the already-installed pnpm 10.28.1 at `/private/tmp/ent-5-tools/pnpm` (no install/download); Node is v24.17.0. Every pnpm shell sets `PATH="$HOME/Library/pnpm/bin:$PATH"` and then prepends `/private/tmp/ent-5-tools`. Before each heavy invocation, `memory_pressure | tail -1` and `df -g /System/Volumes/Data` passed (73–74% free memory; 51 GB available). Heavy runs were serial; unit run used three own files with `--maxWorkers=2`.

| Repair r1 command | Exit / evidence |
|---|---|
| `pnpm typecheck` | 0; 7 successful packages, 2 cached; 1m4.637s; `/private/tmp/jg-ent-5-r1-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed (162 files), then lane prerequisite failed on 19 inherited ENT-3d paths; package lint was not reached by this command; `/private/tmp/jg-ent-5-r1-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same 19 inherited paths, no base override or dependency lane expansion; `/private/tmp/jg-ent-5-r1-lanes.log`. |
| `pnpm exec turbo run lint` | 0; 7 successful packages, 2 cached; 45.607s; `/private/tmp/jg-ent-5-r1-package-lint.log`. Supplemental package checks do not replace the failed root lane prerequisite. |
| `node tools/money-arithmetic-lint.mjs` | 0; boundary check passed. |
| `node tools/commercial-boundary-lint.mjs` | 0; no errors. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts` | 0; 3 files, 15 tests passed; 1.05s; `/private/tmp/jg-ent-5-r1-unit.log`. |
| `pnpm build --concurrency=2` | 0; 7 successful packages, 2 cached; 1m46.945s; `/private/tmp/jg-ent-5-r1-build.log`. Existing workspace-root/autoprefixer warnings. |
| `pnpm openapi:check` | 1; tsx IPC startup denied (`listen EPERM`, `node:net:1987`, tsx `cli.mjs:53`, socket `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/64946.pipe`); schema comparison NOT RUN; `/private/tmp/jg-ent-5-r1-openapi.log`. No retry or alternate launcher. |
| `git diff --check` | 0; no whitespace errors. |
| Source-only Python comparison of HEAD catalogue and lane JSON | 0; exactly four added rows, every old line byte-for-byte preserved; all five repair paths allowed. This is not a PostgreSQL or lane-gate pass. |

Turbo reported sandbox IO warnings; counts above disclose the two cache hits and are not forced fresh runs. No new source/test changes followed these checks. Read-only inspection included AGENTS, relevant BUILD_PLAN contracts/task, the real Opus verdict and existing receipts/scripts. The initially supplied relative `jg-runs` path and guessed run directories were absent; the verdict was subsequently located/read at the full path above. Broad file search and the global pnpm-shim version probe were cancelled (130); the installed pinned pnpm version probe passed (10.28.1). No package download or Git write was attempted. Original source fixture STOP item 2 (`packages/db/test/site-extra-evidence-fixtures.ts:7`, consequent diagnostic at `:81`) remains outside this repair and unchanged; no r1 standalone integration-test compiler pass is claimed.

Repair code hashes (receipt excluded; HEAD means actual incoming/pre-commit `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`):

| File | HEAD SHA-256 | Repair SHA-256 |
|---|---|---|
| `config/agent-lane-assignments.json` | 7e6c8d79523191588bc21e0edb7d8fda119e5a76b5a46fb01bb1d8458e8a0627 | 9f48a32e11752737a13da981334aef92b8187bd99772bc2e6cf2c5bde5673e1e |
| `packages/core/src/extra-approval.ts` | 9f51f13923d7e08beb7103cf5c8cc97057be313ed824a68fb5262360b01b99da | f5eb3dcb263374f2655df432d063e2fa8b818505e20c95c4b74f7653361221c9 |
| `packages/core/src/extra-approval.test.ts` | dce4663bc6342873c49d660e988da1a0a17b034777ad2cf4449fedc493a9723c | 7baf0786fda8cdd9cbeffe8d58be439168c129db99ad79a99651a8434c8b5aa8 |
| `packages/db/test/tenancy.integration.test.ts` | 7c2f648e17ce97885b7a387713496a3bbe487b6150627e393b5822a8946f6169 | 405a7562221844aae433d15996532c6944c3ee6599d17fb028249a1e8dbf0af5 |

Repair code patch SHA-256 (`git diff HEAD --` the four files above): `fa8ac5f251fd1809d439545785f8fb1e829c8be27ce55e47d6020c8a59821611`.

Actual code-only diff stat (receipt changes excluded):

```text
 config/agent-lane-assignments.json           | 2 +-
 packages/core/src/extra-approval.test.ts     | 2 +-
 packages/core/src/extra-approval.ts          | 2 +-
 packages/db/test/tenancy.integration.test.ts | 4 ++++
 4 files changed, 7 insertions(+), 3 deletions(-)
```

Final available/pre-commit HEAD remains `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`. Dispatcher commit message: `/private/tmp/jg-msg-ent-5.txt`. Root lint/lane failure, OpenAPI startup refusal, unexecuted PostgreSQL/browser suites and exact-repaired-commit review/separate acceptance remain outstanding; this is a repair receipt, not acceptance. No automatic approval review rejection occurred.


## Repair r2 — dispatcher 4, 13 October 2026

Built by Codex gpt-6.1-sol; dispatched by the Claude dispatcher. Candidate/incoming HEAD: `b1e87ecacc61e4014c9c8422c7112db169b07897`, unchanged by this builder. This section describes the uncommitted r2 working-tree repair; the dispatcher must bind the subsequent independent review to its resulting commit. No verdict, acceptance, merge, push or release is claimed.

Read AGENTS.md, BUILD_PLAN §9.1.2–§9.1.7 and ENT-5, the extra-approval contract and the supplied Sol first-check at `/Users/benharwood/.local/share/full-steam/jg-runs/ent-5-solcheck-20261013T213352.md`. That stored check declares HEAD `dfcc97ca76fe5a45f7ea594686334f7fad019e6b`; it is prior review evidence, not an independent verdict on this repair or the incoming r2 candidate.

The separation input parser now lowercases only supplied raiser, candidate and historical person UUIDs before comparison. Other identifiers and the held persisted-person/repeat-policy decisions are unchanged. Six permanent regressions cover mixed-case self-approval, cross-step reuse across revisions and held same-step repeats, in both case directions. Tests-first execution reproduced all six failures (9 existing tests passed); after normalization the three ENT-5 core files passed all 21 tests.

Inherited ENT-3d #170 repair: `packages/db/test/site-extra-evidence-fixtures.ts:7` retains every value import and imports `Cluster` from `extra-fixtures.js`. The identical one-line change was also made at `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/ent-3d/packages/db/test/site-extra-evidence-fixtures.ts`, using the explicitly requested cross-worktree edit; the two fixture files were compared byte-for-byte and match. Strict compilation of the three ENT-5 database suites now exits 0 with no diagnostics. That is static compilation, not PostgreSQL execution.

Affected invariant: §5.3 approval separation under the supplied-person constraint. No database schema, migration, persisted identity policy, authoritative approval, provider, prompt, financial record, alert or release behavior changes. Only the three repair code/test files and this receipt change in ENT-5; the ENT-3d worktree receives only the identical fixture line.

All pnpm checks use the existing `/private/tmp/ent-5-tools/pnpm` binary (10.28.1) via `PATH="/private/tmp/ent-5-tools:$PATH"`; no installation or download. Node is v24.17.0, rather than the unchanged .nvmrc's v24.15.0. This is not a clean-install rehearsal. The initial global pnpm-shim probe and broad `/private/tmp` locator search were cancelled (130); the pinned version probe passed. No Git write command was run.

| Repair r2 command | Exit / result / evidence |
|---|---|
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-approval.test.ts` before the fix | 1; 6 new regressions failed, 9 existing tests passed; `/private/tmp/jg-ent-5-r2-red.log`. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/extra-approval.test.ts src/extra-client-approval.test.ts src/extra-evidence-pack.test.ts` after the fix | 0; 3 files, 21 tests passed; `/private/tmp/jg-ent-5-r2-unit.log`. |
| `pnpm --filter @jobguard/db exec vitest run --maxWorkers=2 test/contractor-session-context.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-case-join.test.ts` | 0; 3 files, 37 tests passed; `/private/tmp/jg-ent-5-r2-db-unit.log`. Repository adapter doubles are not live database proof. |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/extra-approval-authority.integration.test.ts test/extra-evidence-packs.integration.test.ts test/extra-approval-upgrade.integration.test.ts` | 0; no diagnostics; `/private/tmp/jg-ent-5-r2-db-test-types.log`. |
| `pnpm typecheck` | 0; 7 successful packages, 2 cached; 4m7.099s; `/private/tmp/jg-ent-5-r2-typecheck.log`. |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passed, lane prerequisite refused the requested inherited `packages/db/test/site-extra-evidence-fixtures.ts` repair; package lint was not reached; `/private/tmp/jg-ent-5-r2-lint.log`. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same single fixture path refused; `/private/tmp/jg-ent-5-r2-lanes.log`. No lane/base changes. |
| `node tools/money-arithmetic-lint.mjs` | 0; `/private/tmp/jg-ent-5-r2-money-lint.log`. |
| `node tools/commercial-boundary-lint.mjs` | 0; `/private/tmp/jg-ent-5-r2-commercial-lint.log`. |
| `pnpm openapi:check` | 1; tsx CLI IPC listen EPERM before schema comparison; `/private/tmp/jg-ent-5-r2-openapi.log`. |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0; the unchanged generator's actual schema comparison passed using the installed loader without the CLI IPC server; `/private/tmp/jg-ent-5-r2-openapi-loader.log`. This supplements the failed package-script invocation above. |
| `pnpm exec turbo run lint` | 0; 7 successful packages, 2 cached; 4m24.926s; `/private/tmp/jg-ent-5-r2-package-lint.log`. Does not replace root lane failure. |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | 1; 162 files passed, 4 failed; 4,864 tests passed, 8 failed; 178.80s; `/private/tmp/jg-ent-5-r2-core-all.log`. |
| `pnpm build --concurrency=2` | 0; 7 successful packages, 2 cached; 5m1.38s; `/private/tmp/jg-ent-5-r2-build.log`. |

The broader core run discovered both `src` and generated `dist` tests. Six failures are the three existing receipt-allocation stress tests in each location exceeding the unchanged 5,000ms timeout. Two failures are generated `dist` copies of source-inspection tests opening missing `dist/recovery-allocation.ts` and `dist/site-extra-pricing.ts` files (ENOENT). No failing test, timeout, discovery configuration or unrelated source was changed. The broad run was concurrent with compilation; no pre-repair broad baseline or CI pass is claimed. These failures remain reported rather than waived.

Turbo reported sandbox IO warnings and reused the disclosed cache hits; cached logs include the dependency worktree's original paths. The passing checks are not forced-fresh or clean-install results. Existing Next.js workspace-root and autoprefixer warnings are retained. No code changed after the passing focused checks.

`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, PostgreSQL suites and browser suites are NOT RUN locally: the dispatcher's environment cannot bind localhost or start PostgreSQL. Database/browser and required regression CI remain owed after the dispatcher pushes. Root lane resolution, a standard OpenAPI package-script run outside the IPC restriction, independent review bound to the resulting repair commit and separate acceptance also remain outstanding. AI golden-set and native gates are inapplicable to this repair.

R2 code-only patch SHA-256 (`git diff HEAD --` the three files below): `3bce19a477560ae20b5164f628341e6a78a1cb04e32321bf42abb969793787a5`.

| Repair code/test file | Working-tree SHA-256 |
|---|---|
| `packages/core/src/extra-approval.ts` | `c79bb656c9a655f639faf37538052dced33e3078e6b9d69b0a6270e8d4a5acce` |
| `packages/core/src/extra-approval.test.ts` | `58b545d7f713255d9f6417cbdd994c6354f74108d8517135bce78f3bedd1e8f6` |
| `packages/db/test/site-extra-evidence-fixtures.ts` | `611276c5b0e863111cada2369259be7e14ce7ed610e9954a803c0ab5819de5de` |

Candidate/incoming HEAD remains `b1e87ecacc61e4014c9c8422c7112db169b07897`; there is no builder-created r2 commit. Intended conventional commit subject/body was overwritten at `/private/tmp/jg-msg-ent-5.txt`. The fixture edit is also present identically in ENT-3d #170. `git diff --check` passed. This receipt does not satisfy technical acceptance or authorize merge/release.


## Catch-up r4 — dispatcher 4, 13 October 2026

Incoming/local HEAD remains `1098357d33327e8ef647d4b9fe0775e3d698b618`. `origin/main` and `MERGE_HEAD` are both `e4cb8437d044746300c377647f6061d06cd960cc`. ENT-3d #170 is merged as `41d2761`; this supersedes the earlier dependency hold. This section is a builder run receipt for the working tree, not an independent verdict or acceptance. The dispatcher must finish the merge and bind review to the resulting commit.

Read AGENTS.md, BUILD_PLAN §§9.1.2–9.1.7, §§9.1.12–13 and ENT-5, the three ENT-5 contracts, the existing receipt, lane checker and package/check configuration. The only code/config edit in this round is the conflict resolution in `config/agent-lane-assignments.json`: main's FIXLATER-8 conflict entry comes first, followed by the existing ENT-5 entry. Removing only ENT-5's line reproduces origin/main's entire registry byte-for-byte. JSON parses; no allow list, existing lane entry, merged test or pinned value was edited. This receipt is the only other repository edit.

The read-only two-endpoint working-tree comparison `git diff --no-renames --name-only -z origin/main --` has **25 files**, every one covered by ENT-5's unchanged allow list. The earlier ENT-3d feature files have dropped out. One inherited r2 type-import repair still differs from main: `packages/db/test/site-extra-evidence-fixtures.ts` imports `Cluster` from `extra-fixtures.js` rather than `site-extra-fixtures.js`. It is already allowed, unchanged from incoming HEAD and passes strict compilation. The four already-authorized tenancy catalogue additions are likewise unchanged from incoming HEAD.

Migration `0157_extra_approval.sql` and its runner registration remain unchanged; there is no renumbering, backfill, provider, schema, prompt, alert or production capability change in r4. 0142–0146 remain allocated to other pieces per the dispatcher. All ENT-5 product-question holds and real-data/fee gates remain in force.

The standard lane checker computes the committed merge-base diff and then unions staged changes against old HEAD. During this unfinished merge it therefore refuses exactly these **main-owned**, byte-identical-to-main files:

- `docs/verdicts/FIXLATER-8/BUILDER_RECEIPT.md`
- `docs/verdicts/FIXLATER-8/CATALOG_SCOPE.md`
- `packages/db/test/catalog-fixlater-8.integration.test.ts`

They are absent from the actual working-tree diff against origin/main. No lane widening, alternate base, Git index edit or checker change was used. The dispatcher must stage the resolved file, finish the merge and rerun lane/root lint checks. `git status` still shows `UU` for the registry because the builder is expressly forbidden to stage/commit; working-tree contents have no markers.

All pnpm checks use the already-installed 10.28.1 binary through `PATH="/private/tmp/ent-5-tools:$PATH"`. Node is v24.17.0; the unchanged .nvmrc pins v24.15.0. Dependencies were not reinstalled, so this is not a clean-install or exact .nvmrc-runtime rehearsal. An initial global-shim version probe was cancelled (130); the existing pinned binary probe passed. No package installation, Git write, push, external message or automatic-approval escalation was performed.

| Actual r4 command | Exit / result | Evidence |
|---|---|---|
| `pnpm exec turbo run typecheck --force` | 0; 7 successful, 0 cached; 31.331s | `/private/tmp/jg-ent-5-r4-typecheck.log` |
| `pnpm exec turbo run lint --force` | 0; 7 successful, 0 cached; 47.212s | `/private/tmp/jg-ent-5-r4-package-lint.log` |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; exactly the three main-owned staged files above | `/private/tmp/jg-ent-5-r4-boundary.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same three paths | `/private/tmp/jg-ent-5-r4-lanes.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; core purity passes, lane prerequisite refuses those three paths; package lint not reached here | `/private/tmp/jg-ent-5-r4-root-lint.log` |
| `node tools/core-purity-lint.mjs`, `node tools/money-arithmetic-lint.mjs`, `node tools/commercial-boundary-lint.mjs` | 0 each; core purity covers 162 TypeScript files | Actual terminal output; separate supplemental checks, not a root-lint pass |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | 0; 83 files, 2,436 tests; 22.00s | `/private/tmp/jg-ent-5-r4-core-unit.log` |
| `pnpm --filter @jobguard/config exec vitest run src --maxWorkers=2` | 0; 1 file, 1 test | `/private/tmp/jg-ent-5-r4-config-unit.log` |
| `pnpm --filter @jobguard/storage exec vitest run src --maxWorkers=2` | 0; 1 file, 2 tests | `/private/tmp/jg-ent-5-r4-storage-unit.log` |
| `pnpm --filter @jobguard/ai exec vitest run --maxWorkers=2` | 0; 5 files, 80 tests; fixtures, no live model | `/private/tmp/jg-ent-5-r4-ai-unit.log` |
| DB unit command below | 0; 11 files, 153 tests; doubles/offline verifier tests, no PostgreSQL proof | `/private/tmp/jg-ent-5-r4-db-unit.log` |
| `pnpm --filter @jobguard/web exec vitest run --maxWorkers=2` | 0; 33 files, 784 tests | `/private/tmp/jg-ent-5-r4-web-unit.log` |
| `pnpm --filter @jobguard/db exec tsc --noEmit --strict --skipLibCheck --target ES2023 --module NodeNext --moduleResolution NodeNext test/extra-approval-authority.integration.test.ts test/extra-evidence-packs.integration.test.ts test/extra-approval-upgrade.integration.test.ts` | 0; no diagnostics; compilation only | `/private/tmp/jg-ent-5-r4-db-test-types.log` |
| `pnpm build --concurrency=2 --force` | 0; 7 successful, 0 cached; 4m23.603s | `/private/tmp/jg-ent-5-r4-build.log` |
| API command below | 1; 62 files passed, 1 suite blocked; 1,542 tests passed, 1 skipped; 55.41s | `/private/tmp/jg-ent-5-r4-api-unit.log` |
| `pnpm openapi:check` | 1; tsx CLI IPC listen EPERM before schema comparison | `/private/tmp/jg-ent-5-r4-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` from `apps/api` | 0; same unchanged generator's actual schema comparison passes without CLI IPC server | `/private/tmp/jg-ent-5-r4-openapi-loader.log` |
| Read-only JSON/main-byte/allow-list/migration/marker assertions | 0; 25 covered files, zero violations, refused files identical to main, 0147 identical to HEAD | `/private/tmp/jg-ent-5-r4-scope.log` |
| `git grep -n '<<<<<<<\|>>>>>>>' -- . ':!docs/verdicts'` | 1; no matches (expected grep result) | Direct invocation and scope assertion |
| `git diff --check` | 0; no whitespace errors | Actual terminal output |

DB unit command: `pnpm --filter @jobguard/db exec vitest run src test/contractor-session-context.test.ts test/recovery-case-join.test.ts test/site-extra-evidence-compatibility.test.ts test/recovery-message-repository.test.ts test/recovery-case-outcome.test.ts test/verify-audit-export-cli.test.ts test/verify-evidence-pack-cli.test.ts --maxWorkers=2`.

API command: `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=2 --exclude src/health.test.ts --exclude src/shadow-isolation.application.test.ts --exclude "src/contractor/*.http.test.ts" --exclude src/auth/sso/action-paths.test.ts`. Seven socket/database-dependent files were excluded at invocation, without changing configuration or tests. The initial source scan missed an eighth indirect dependency: `final-account-lock.isolation.test.ts` dynamically imports the PostgreSQL fixture. Its DW8 database suite was refused at `freePort` with `no free port in 58400..58650`, before PostgreSQL startup. The broader API run is **not passed**. The test remains unchanged and is owed in CI; no retry using weaker assertions or changed timeout was attempted.

The six completed local unit invocations passed 3,456 tests in 134 files. Source filters avoid generated dist duplicates; they do not constitute the full mandatory `pnpm test` run. Heavy unit runs and build were sequential; the extra strict integration-test compilation overlapped build, not database/test execution. Observed memory free was 70% and available disk 49 GB. Turbo retained sandbox I/O warnings; Next retained its existing workspace-root and autoprefixer warnings. They did not prevent the forced typecheck/package-lint/build passes.

`pnpm test`, `pnpm test:db`, `pnpm test:migrations` and browser suites were not invoked; required PostgreSQL/browser execution and the blocked API database suite remain for GitHub CI after the dispatcher pushes. This is no claim of verified RLS, migrations, approval races or browser behavior. Root/lane lint and the standard OpenAPI package script remain owed outside the unfinished merge/IPC restriction. An independent verdict on the resulting exact commit and separate acceptance remain required. Intended conventional commit message is overwritten at `/private/tmp/jg-msg-ent-5.txt`; no builder commit was made.

## Catch-up r3 (14 Oct 2026, Sonnet builder): merge of origin/main ad6109ff, renumber to 0157

Builder receipt only; not independently reviewed or accepted.

- Merged `origin/main` ad6109ff (migrations through 0155). Conflicts in `config/agent-lane-assignments.json`, `packages/core/src/index.ts`, `packages/db/src/index.ts`, `packages/db/src/migrate.ts` and `packages/db/MIGRATIONS.md` resolved keeping both sides. Lane file: main's version taken whole, then the ent-5 entry re-added with the Edit tool (migration path now 0157, plus `docs/contracts/lp-0-effective-privileges-v1.json` in its allow list); the entries for fixlater-6/8 now come from main unchanged.
- Migration renumbered `0147_extra_approval.sql` -> `0157_extra_approval.sql` (0147 is taken by open PR #189 sv5pre, 0145 by #181, 0152 by #206, 0156 by #213). File, `migrate.ts`, `MIGRATIONS.md`, the upgrade test, the contract and this receipt updated consistently; SQL body unchanged.
- LP-0 inventory (`docs/contracts/lp-0-effective-privileges-v1.json`): NEW entries only for ENT-5's own objects: runtime SELECT on `extra_approval_revision_binding` and `extra_evidence_pack`, their owners, RLS, tenant_isolation policies, the `immutable`, `source_binding` and `subject_binding` triggers, and the two `ent5_*_guard` routine protection records (digests read from the migrated database). No existing entry changed.
- First real database run (the sandbox could not start PostgreSQL before; embedded-postgres dylib symlinks hydrated locally): ENT-5's own tests needed three fixes, all in ENT-5's own new test files: fixtures read a retired `session_id` column (now use the fixture's tenant context like neighbouring tests); two specimen UPDATEs violated `evidence_upload_state_ck` (pending now clears `server_verified_at`, rejected sets a `rejection_code`); fresh pool copied runtime options without a password. No merged test or expectation changed.
- Card vs main: ENT-5 remains the foundation only (two tables, pure evaluators, source loaders). It adds no command, queue, escalation job, client link/page or outbox send, so Ben decision 18 (outbox owner-only sends), the 0153/0155 quote re-acceptance and variation/final-account changes, and the 0144 work-state guards are not touched. The card's commands, queues, client approval and the outbox request remain unbuilt (held under Q01-Q16); the client approval request through the outbox must be built later against main's outbox rules.
- Checks (all through heavy-slot, maxWorkers=2): core `extra-approval|extra-client-approval|extra-evidence-pack` tests 21 passed; db `extra-approval-authority|extra-evidence-packs|extra-approval-upgrade` 13 passed; db `lp-0-authority-paths|lp-0-grant-freeze` 19 passed; db `tenancy|site-extra-evidence|evidence-packs` 44 passed; `typecheck` and `lint` for core and db exit 0; core-purity, money-arithmetic lints pass; `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` passed.

## 4 November 2026 — ENT-5 client approval journey on batch-15

RED: customer sign-in/session authority, commercial approval and tenant isolation. Synthetic NOPR branch `codex/sandbox/ent-5-client-approval`, based on `codex/sandbox/batch-15` (`0fac585a92c88dd39d212726b913e557eb75d257`). This section supersedes the older foundation-only delivery status above for this branch; it is builder evidence, not independent acceptance or permission to land.

Q10/Q12/Q13 are implemented as recorded in `docs/contracts/extra-client-approval-v1.md` and the ENT-5 plan note. A surveyor or commercial manager with a job-covering grant approves each exact `.invalid` fake-email invitation; the route creates a seven-day link and resend cancels its predecessor. The existing customer sign-in route, HMAC credentials and cookie establish a named client session. Reads, queue, exact revision/hash/net decisions and own-job history recheck that client's current membership/grant. The old Northside role-switch transport no longer authorizes client decisions. Approval and withdrawal share the existing tenant/job lock order. An exact command retry returns the stored effect; a fresh decision against a used link fails. Client session provenance is private and prevents the customer's new command from being attributed to the practice owner/switch.

Migrations 0920–0924 each have a migration proof. Three companion tables preserve predecessor row shapes: sign-in binding, customer session, and command/session provenance. They have tenant-qualified foreign keys, migration ownership, FORCE RLS and no direct application/identity table grants. No fingerprinted table gains a column, no function has a `SET app.*` clause, no old rows are backfilled, and no scheduler is started. The existing command lifecycle owns receipts, exact send authorization and completion; runtime code does not regain protected write grants. Timing reads now share one SQL projection and the existing pure timing derivation, including uncertain bounds and historical preapproval breaches. That shared projection and private provenance are the necessary additional complexity.

### Local evidence actually executed

- Installed `tsc`: core, storage, config, AI and DB dependencies built without downloading packages. Relevant core, DB, API and web TypeScript checks passed. The `pnpm`/Turbo wrapper stalled under load and was cancelled; direct installed TypeScript runners supplied the checks.
- API Vitest, `--maxWorkers=2`: `extra-customer.test.ts` and `customer-signin.test.ts`: **52 passed**. The new tests bind actor/tenant to the existing customer cookie, refuse absent/builder/foreign credentials and forged fields, preserve exact hash/net validation, and return typed stale conflicts. A test assertion was corrected to compare parsed JSON rather than object-key serialization order; behavior assertions remain intact.
- API Vitest, `--maxWorkers=2`: `context-boundary.test.ts` and `identity.test.ts`: **152 passed**. `watchdog-registry.test.ts`: **126 passed** after building its installed AI dependency. The initial registry attempt could not resolve an unbuilt workspace dependency; it was rerun after that dependency build.
- DB Vitest, `--maxWorkers=2`: `migration-proof-loader.test.ts` and `extra-approval-timing.test.ts`: **92 passed**, including the final proof set. The initial proof-loader attempt could not resolve the unbuilt core workspace dependency; it was rerun after building it.
- Core-purity, money-arithmetic, commercial-boundary, AI-provider-boundary and PL/pgSQL CASE-in-IF lints completed without a failure. Core purity reports its existing computed-import observations; these are not new findings. `git diff --check` passed.
- The lane CLI was run. Before its manifest existed it refused the unregistered branch. With the manifest and `LANE_BASE_REF=codex/sandbox/batch-15`, it refused a self-comparison because HEAD is still the batch-15 commit and this sandbox cannot commit. The lane lists precisely all changed paths against batch-15, excluding `config/lanes/` and itself. The router must rerun the CLI after committing this work, with batch-15 as its base. A final run using the default base also refused inherited batch-15 paths, as expected for a manifest intentionally scoped only to changes from batch-15; no inherited lane grants were added.

No PostgreSQL, browser server, provider, live send or release was run here. No Git write, commit, push or PR was attempted. No independent reviewer has checked this working tree.

### CI must prove

Run the real required typecheck/lint/test/build gates against the resulting exact head. Run real-PostgreSQL fresh-install/upgrade, catalog/privilege/RLS/fingerprint checks and migration replay with 0920–0924 and their proofs. In particular, `extra-client-session.integration.test.ts` covers named current grants, no customer session, foreign actor/job/tenant/request, wrong hash/net, consumed/replaced/expired links and sessions, grant revocation, exact decision replay, one client fact, and approval racing withdrawal producing exactly one outcome. It also checks fake-only outbox state and zero delivery attempts. These cases are authored, **not locally executed**.

Run the retained approval-chain, timing, evidence-pack, Northside and full-demo database tests after the changed sender fixtures. Run Playwright with at most two workers: `ENT-5-client-session.spec.ts` at `mobile-360` and `desktop`, the updated `ENT-11a.spec.ts` customer journey at both project widths, and `ENT-11b.spec.ts` at both explicit widths. Customers use a separate browser context and the real sign-in route. New alerts are scoped to main. Database/browser assertions are not replaced with mocks or local PASS claims. The router must arrange the independent RED review against the actual committed head before landing.

### Named holds for landing

1. **Protected command-registry pin:** `packages/db/test/lp5-command-catalog.ts` / `currentCommandRegistryRows` still records `IssueClientApproval` as owner-only. Migration 0921 deliberately applies Q10's contractor/grant rule; its migration proof records the exact registry-row delta. The protected pin is **not edited** in this branch, as instructed. The router must route that exact pin update before the affected upgrade/catalog suites can go green.
2. **Protected routine/scanner acceptance:** 0921 changes only `app.xa_issue_link(uuid,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,uuid)` and `app.lp5b_contractor_permission(text,uuid,uuid,jsonb)`; 0923 changes only `app.northside_capture_action()`. Their body deltas and the five new helpers are declared in migration proofs. Any additional exact named source/catalog pin required by PostgreSQL CI must be routed at landing; no scanner or protected baseline is weakened here. There is no local database result establishing those pins pass.
3. **Q14 and Q15 remain held:** no export/refusal-audit policy is chosen, no live executor/scheduler is activated, no real provider/customer/money is used. These holds affect those capabilities only.
4. **Migration reservation:** 0920–0924 are the issued NOPR reservations, not a claim that the mainline migration sequence has reached them. Preserve group order and reconcile numbers/proofs at landing.

LATER / SIMPLICITY (initial source inspection): `packages/db/src/extra-approval-chain-repository.ts` and `packages/db/src/commands.ts` retain separate exact-send assembly and dispatcher plumbing. A later review can consider a single typed send mutation after the customer journey is proved in CI; it would reduce duplicate action-shape maintenance. This does not block this piece and no unrelated refactor is included.

READY for router NOPR handoff, subject to the named landing holds, actual PostgreSQL/browser CI and independent RED review. Not merged, released or production-enabled.


## Batch-42 NOPR preparation — 5 November 2026

READY. RED. Builder handoff only; no independent review, commit, push, PR, merge or release.
This entry supersedes the earlier landing-pin and numbering notes for this batch. Base is local `origin/main` at `567604fdc`; local `main` is stale. No fetch was run.

- Resolved `later-empty-tables.ts` as the union of both merge sides, retaining interim drafts, scheduled-readiness tables and all three client-session companion tables. The index remains unmerged because Git is read-only; the working file has no conflict markers.
- Renamed filename stems and their references only: `0920_extra_client_session` → `0641_extra_client_session`, `0921_extra_client_send_authority` → `0642_extra_client_send_authority`, `0922_extra_customer_use` → `0643_extra_customer_use`, `0923_extra_customer_approval` → `0644_extra_customer_approval`, `0924_extra_client_timing` → `0645_extra_client_timing`. Each has its matching proof. No mainline migration was changed.
- Updated only the current `IssueClientApproval` catalog expectation to contractor authority, retaining the original LP-5 baseline. Added exact signature-bound upgrade expectations for the three changed predecessor routines, checking the exact SQL replacements instead of omitting routine comparisons. The two migrations patch the installed latest bodies; the current audit helper seals through `app.lp4_seal_audit`.
- Removed the three LP-0 owner entries for private companion tables: they have no non-owner grants and share the schema owner, so LP-0 does not inventory their ownership. Their RLS/policy and upgrade proof facts remain. No fingerprint guard was widened.
- Replaced the new test's direct grant-revocation insert with the existing audited contractor command fixture. No production behavior was added or changed during batch preparation.
- Removed both individual piece lane files; `batch-42.json` covers exactly the 45 final changed non-lane paths relative to `origin/main`, without listing itself.

Executed locally, using installed binaries only, with at most two workers per run:

- `node_modules/.bin/tsc -p packages/<name>/tsconfig.json` passed for core, config, storage, AI and DB; `node_modules/.bin/tsc -p apps/<name>/tsconfig.json --noEmit` passed for API and web. The global pnpm shim stalled before starting and was cancelled; no packages were downloaded. Initial API guard loading failed on unbuilt workspace packages; after compiling those dependencies, all requested suites passed.
- API Vitest: `src/watchdog-registry.test.ts`, `src/auth/context-boundary.test.ts`, `src/auth/identity.test.ts` — 278 passed. Separate runs: `src/auth/extra-customer.test.ts` — 11 passed; `src/auth/customer-signin.test.ts` — 41 passed.
- DB Vitest: `test/migration-proof-loader.test.ts` — 76 passed; `test/extra-approval-timing.test.ts` — 16 passed. Each invocation used `--maxWorkers=2` and no more than three named files. Total: 422 passing unit tests; no database started.
- The exact routine-replacement parser used by the upgrade expectation found the expected three authority replacements and one attribution replacement. `git diff --check` passed.
- `node tools/agent-lane-boundary-lint.mjs` ran and refused the old staged individual lane/migration paths, which are absent from the resolved working files but still present in the read-only index. A separate deterministic check using the linter's own policy/path and migration-order functions passed exact final working-tree coverage and migration ordering. This is not a CLI PASS: the router must stage the resolved union and renames, complete the merge, and rerun the official CLI on the resulting head.

CI must prove the full required checks, real PostgreSQL fresh/upgrade/replay, privileges/RLS, LP-0 inventory, fingerprint preservation, the exact named routine upgrades, command registry and audited revocation, and the retained approval/session/timing/evidence-pack/Northside suites. CI must run ENT-5-client-session, ENT-11a and ENT-11b browser journeys at the required widths with at most two workers, plus both complete demos. No database/browser/provider/live-data results are claimed here. Independent RED review remains required against the final committed head. The DEMO-S companion remains a design document; company Final Check implementation is not claimed. Q14/Q15 and real-user activation remain outside this handoff.

## Batch-42 pre-check repair — 5 November 2026

READY for router handoff. RED: ENT-5 client approval/session authority. This entry supersedes the previous batch preparation base and local check status. The launcher merge targets local `origin/main` at `199124c0885ca27558fbaf62a9a74dee7ad2818f`; no fetch or Git write was performed.

- `0644_extra_customer_approval.sql` stores `complete_command`'s result and fires only `SET CONSTRAINTS app.decision_check_complete IMMEDIATE` inside the definer before returning it. No `ALL`, new identity privilege, or change to the trigger's security mode.
- The session integration fixture enables LOGIN with a synthetic password on the existing identity role, connects as that role and asserts both session/current user and absence of app-schema USAGE. All client-function calls, including refusal/replay/race paths, use that login. Two added approve/reject transactions insert an unresolved deferred FK before the call and another afterwards, repair both references, and commit. An ALL flush would fail this test inside the approval call. The committed outcome is checked separately by the admin fixture.
- Resolved both working-file conflicts as exact unions: main's table/catalog additions plus this branch's three companion tables and the current contractor permission mapping. Main now also contains `rate.suggestion_accept`; 0642's registry proof chains from 0609's exact after-record, changing only IssueClientApproval's permission. The historical 0606 source test maps that permission back to owner and omits only its already-excluded later rate command. No existing assertion was removed.
- Re-serialized/rechecked 0644's proof. Its catalog/ACL/static-call/static-write facts are unchanged by the named constraint flush, so its JSON is byte-identical; definition digests remain the existing null values. This is source-only proof maintenance, not PostgreSQL capture or verification. CI must corroborate the proof against real PostgreSQL.
- Updated stale Northside route tests to use a surveyor send, the customer sign-in path, and the actual ExtraCustomerApplication with an identity-pool double. The actor-binding case refuses spoofed tester text before queries and checks the named cookie actor/tenant and exact input. The practice owner dispatcher is not used.
- The lane manifest lists exactly all 47 changed non-lane paths against main and never lists itself. No owned migration stem already exists on main; no mainline migration was removed or edited. No unrelated refactor or additional reporting mechanism.

Executed locally with installed dependencies only, no more than two workers and three named Vitest files per invocation:

- DB Vitest: `test/migration-proof-loader.test.ts test/m2-1-migration-proof.test.ts test/dsar-migration-proofs.test.ts --maxWorkers=2`: **85 passed**.
- API Vitest: `src/auth/extra-customer.test.ts --maxWorkers=2`: **11 passed**.
- Web Vitest: `app/api/northside/routes.test.ts --maxWorkers=2`: **23 passed**. Initial loading required building the installed API workspace dependency; the first authored refusal assertion expected 403, corrected to the existing CUSTOMER_REFUSED/401 contract. Final run passed all assertions.
- `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit`, `... -p apps/api/tsconfig.json` (dependency build), and `... -p apps/web/tsconfig.json --noEmit`: **passed**.
- DB `vitest list test/extra-client-session.integration.test.ts --maxWorkers=2`: discovers **five cases**, including both new deferred-constraint cases; no database started and no integration PASS claimed.
- `git diff --check origin/main`: passed. Working files have no conflict markers. Deterministic working-tree lane coverage and the official linter's policy/path/migration-order functions passed.
- Official lane CLI was run with `LANE_BASE_REF=origin/main`; it refused inherited main files still staged in the unfinished merge. The read-only Git index still has two unmerged entries. Router must stage the resolved working files, complete the existing merge and rerun the official CLI; this is not a lane CLI PASS.

CI must prove real-PostgreSQL fresh/upgrade/replay and catalog/privilege/RLS/fingerprint gates with 0641–0645; especially all five real-login session cases, both decisions committing without 42501, exact retry, authorization refusals and the unrelated deferred checks. Retain approval-chain/timing/evidence-pack, Northside/full-demo and lifecycle-upgrade suites. Run ENT-5-client-session, ENT-11a and ENT-11b at their required phone/desktop widths (at most two workers), both complete demos, and all required typecheck/lint/test/build gates against the final head. Independent RED review must bind that head before merge. No database/browser/provider/customer/live-money/deployment result or activation is claimed. Existing Q14/Q15 holds and proposed-only Final Check design status remain.


## Batch-42 final re-check repair — 5 November 2026

READY for router NOPR handoff. RED: ENT-5 client approval/session authority; second and last repair round. This entry supersedes the previous repair's readiness and local-check notes. No Git writes, commit, push, PR, merge, deployment or activation were performed.

- Migration 0644 now executes `SET CONSTRAINTS app.decision_check_complete, app.extra_event_raised_audit IMMEDIATE` inside the security-definer approval routine. Both deferred invoker checks run before returning to the real identity login. No ALL, new grants, role changes or broader constraint flushing were added to production SQL. The existing five real-login tests, including both decisions committing with unrelated deferred foreign keys, are unchanged.
- Revalidated 0644's proof: the named-constraint change alters neither static calls/writes nor catalog owner, ACL, search path or signature. Its existing `definitionSha256: null` and all other expected catalog facts therefore remain unchanged; no artificial proof delta or relaxed expectation was introduced. The proof-loader suite passes locally; PostgreSQL inventory/upgrade proof execution remains a CI hold.
- Added an executable `/api/customer-portal/extra-approvals` replay-contract case through `identity.extra_customer_approval`, reached with a redeemed invitation and the real `jobguard_identity` login without app schema USAGE. It asserts the original approved result on exact retries, conflicts for changed decision/net/hash, another authorized job, and another real command kind in both directions. It checks one client fact on the original request and none on the conflicting job. The route remains `watchdog_live_only`; no existing contract case or refusal assertion was weakened.
- The separate case uses the existing complete contractor fixtures because the watchdog harness is a legacy-schema fixture. Registry coverage includes this executable case; the existing generic replay/race/duplicate cases are unchanged. No new production abstraction or configuration was added.
- `config/lanes/batch-42.json` lists exactly all 48 changed non-lane paths relative to local `origin/main` (merge-base comparison plus working changes), excludes itself and every path under `config/lanes/`.

Executed local checks (installed tools only, at most two Vitest workers and at most two named files per invocation):

- From repository root: `node_modules/.bin/tsc -p packages/db/tsconfig.json --noEmit` — PASS.
- From packages/db: `./node_modules/.bin/vitest run --maxWorkers=2 test/migration-proof-loader.test.ts test/extra-approval-timing.test.ts` — 92 tests PASS (76 proof-loader, 16 timing).
- From packages/db: `./node_modules/.bin/vitest list --maxWorkers=2 test/command-replay-contract.integration.test.ts test/extra-client-session.integration.test.ts` — PASS, 76 tests discovered including the new client replay case and five retained real-login cases. Collection is not database execution. The first collection invocation used an incorrectly root-prefixed config path; it failed config loading, then passed when rerun from packages/db with the existing config.
- `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — PASS, including migration ordering.
- `git diff --check` and exact lane-set comparison — PASS.

### Named holds for landing

1. CI must execute the real PostgreSQL `extra-client-session.integration.test.ts` (all five retained cases), `command-replay-contract.integration.test.ts` (including the new client case), approval-chain and migration fresh/upgrade/catalog/privilege/RLS/fingerprint checks. Neither PostgreSQL nor localhost was started here, as required by the sandbox brief; no database PASS is claimed.
2. Required browser journeys (ENT-5-client-session, ENT-11a, ENT-11b at phone/desktop widths), both complete demos and the remaining required CI gates must pass on the router's final pushed head. This repair did not run browser or full suites.
3. Independent RED review must bind the final committed head before landing. Q14/Q15, real customer data, providers, money, deployment and launch remain held in their own scopes. DEMO-S company Final Check remains a design document.

READY. The router commits and pushes the NOPR branch after this session; this receipt is builder evidence, not independent acceptance.
## ENT-5 duplicate dismissal — 4 November 2026, NOPR on batch-15

READY. RED: approval authority, tenant isolation, and billing-export eligibility.
Base: codex/sandbox/batch-15 at 0fac585a92c88dd39d212726b913e557eb75d257;
branch codex/sandbox/ent-5-dismiss. No unfinished merge was present. No Git writes,
push, PR, real customer data, provider action or release was performed.

Implemented the issued supervisor/surveyor/commercial_manager ruling, requiring a
covering grant and refusing reporters/pricers of any member. The checked writer
resolves the persisted session inside SQL. The strict route rejects actor, tenant,
job and role injection and requires trusted origin. The candidates screen offers
a reason-required Not duplicates button, using the exact returned fingerprint.

Migration 0910 adds one private append-only forced-RLS disposition table, one
checked writer, and shared raw/unresolved group readers. Existing list and export
refusal use the same unresolved reader. Snapshots bind all members, canonical
identities and immutable revision IDs/hashes/bindings. A new member or revision
raises the group again; a new reopen fact reverses dismissal. No existing table
gets columns and no function uses a SET app.* clause. Prices, approvals, origins,
links and export facts are untouched by dismissal. Existing job lock 417 orders
new captures/revisions, dismissals and exports; tenant fence 54 orders revocation.
The receipt and audit are atomic with the fact; the audit head is the final
contending lock. Replay writes nothing. The command and route are classified.

The proof includes exact catalogue/ACL/RLS/registry changes and the named
cb_unresolved predecessor-body exception. Its full registry row snapshot is
required by the existing upgrade-proof format; it is not a new registry or
reporting mechanism. Forward fix through a successor migration; preserve all
immutable facts. An application rollback may leave this unused additive feature
installed; do not restore broad runtime receipt writes or remove recorded facts.

Local validation (installed tools only, at most two workers, at most three named
Vitest files per run):

- TypeScript: packages/core, packages/db, apps/api and apps/web --noEmit pass.
- DB Vitest: src/extra-duplicate-candidates.test.ts and
  test/migration-proof-loader.test.ts: 80 tests pass.
- Web Vitest: duplicate-candidates/route.test.ts and transport.test.ts:
  6 tests pass (including the new dismissal route).
- API Vitest: watchdog-registry.test.ts, auth/context-boundary.test.ts and
  auth/identity.test.ts: 278 tests pass.
- git diff --check passes. The exported lane path and migration-order validators
  pass: the manifest exactly equals all 19 non-lane paths changed from batch-15.
  The official lane command with LANE_BASE_REF=codex/sandbox/batch-15 refuses a
  self-comparison because this uncommitted HEAD is still the batch-15 base.

The pnpm wrapper stalled before running checks; those invocations were stopped.
The existing installed .bin/tsc and .bin/vitest runners were used directly after
compiling workspace dependencies. No package install command was used. PostgreSQL and
browser suites were not run: this sandbox cannot start PostgreSQL or bind localhost.

### Named holds for landing

- Router must commit/push this NOPR branch and integrate in batch order against
  current main, preserving/reserving migration 0910 (renumber only if landing
  allocation requires it, with the proof references updated together).
- The router must rerun the official lane command after committing (before any
  landing claim); the local manifest check is not an official lane PASS.
- Exact-head CI must prove fresh/upgrade/catalogue/RLS/privilege and migration
  suites, including plan-entitlement-lifecycle-upgrade and serious-b5-upgrade.
- PostgreSQL must execute extra-duplicate-candidates.integration.test.ts:
  self-dismissal, forged/missing/foreign sessions and bodies, wrong tenant and
  grants/roles, inert replay/conflict, concurrent replay, revision invalidation,
  new-extra race, exact-group exclusion, reversal, immutable facts and unchanged
  commercial records, approved export lines, and all other groups still blocking.
- Browser CI must execute ENT-5-duplicate-candidates.spec.ts at mobile-360 and
  desktop, including reason-required dismissal, stale/self refusal and refresh.
- Independent RED review must PASS on the exact landing head, and required CI
  must be green. This builder receipt is not that review or an acceptance.

No open product-policy decision remains for this issued synthetic leaf.

### batch-37 union readiness — 5 November 2026

READY for router staging, RED, NOPR. This section supersedes the earlier
batch-37 migration reservations and check results. Comparison base is the
incoming main, origin/main = MERGE_HEAD =
62081c68933d0b953e7dd75a8cbd7b3a2fb4f304. Local main (694e9e17) is older;
no fetch, index update, commit or other Git write was performed.

Resolved both working-file conflicts by keeping both sides: the command
catalogue includes purchase_order.send.dark and ResolveDuplicateCandidates;
the later-empty-table map retains every incoming main table plus
extra_duplicate_disposition. The existing branch retains both the dismissal
and relink regression groups, the exact routine-body upgrade assertions and
contract extensions. No test was weakened. Neither ENT-5 dismissal nor
ENT-3-RELINK-FIX is wholly present on incoming main; both remain in this delta.
Main's other landed work is retained without replaying its migrations.

Migration inventory against incoming main:

| Former branch stem | Provisional stem retained | Main duplication / disposition |
| --- | --- | --- |
| 1005_extra_duplicate_relink | 0622_extra_duplicate_relink | Not a duplicate; fixes the shared effective-state projection. Keep SQL, proof and note. |
| 1006_extra_duplicate_disposition | 0623_extra_duplicate_disposition | Not a duplicate; adds exact-snapshot dismissal/reopen and shared grouping. Keep SQL and proof (no prior separate note). |

Compared both SQL files with all incoming-main migration bytes and searched
all definitions of their replaced routines. No duplicate or older-copy whole
migration requires removal. Renumbering changed filenames and full-stem
references only; both SQL files retain their previous bytes. The exact command
registry upgrade proof is rebased from main's 0606 after-state (62 rows) to
that state plus ResolveDuplicateCandidates (63 rows). The first focused run
caught its stale 61-row predecessor; the repaired proof passes the unchanged
strict proof loader. No protected baseline or loader rule changed.

Routine diffs against the latest definitions on incoming main:

- xa_latest_kind: latest 0158; retains tenant/job/variation selection and
  descending event order, adding only exclusion of the duplicate event whose
  exact link has been explicitly reversed in the same job/tenant.
- xa_mark_duplicate: latest 0522; body byte-identical except the explanatory
  effective-state comment. All authority, approval outcomes and LP-5 effect
  binding are retained (also checked by extra-relink-migration.test.ts).
- cb_unresolved: latest 0243; delegates the original membership/pair predicate
  to shared unresolved groups, excluding only exact-snapshot dismissal facts.
  The source-agreement test retains the original predicate assertion.
- extra_duplicate_candidates: latest 0590; all preceding database/membership/
  role/job/grant guards and following active-link/history projection remain
  unchanged. Its grouping moves into the shared helper, adding immutable
  snapshot fingerprints and filtering exact dismissed groups.
- extra_duplicate_groups, extra_duplicate_unresolved and extra_duplicate_resolve
  are new. The session-bound checked writer retains its synthetic-only guard,
  entitlement, self-dismissal refusal, idempotency and audit append.

The four exact routine-body diffs were inspected and saved during the run at
/tmp/batch-37-routine-diffs.txt. This branch does not re-create lp5_command_result;
main's 0606 purchase_order.send.dark dispatcher remains untouched.

Local checks (installed Node 24.17.0; cached pnpm 10.28.1, no downloads):

- DB Vitest --maxWorkers=2 test/migration-proof-loader.test.ts
  test/extra-relink-migration.test.ts src/extra-duplicate-candidates.test.ts:
  PASS, 82 tests after rebasing the registry proof.

- pnpm typecheck --concurrency=2: PASS, all seven workspace packages.
  Turbo reported sandbox cache IO warnings; all checks completed successfully.
- pnpm --filter @jobguard/core build: PASS, refreshed the installed package's
  compiled entry point. The initial watchdog registry run had 125 passes and
  one failure because that entry point predated incoming main's new routes;
  their classifications were already present in source. No assertion or
  product source was changed to resolve the stale-output failure.
- DB Vitest list --maxWorkers=2 test/extra-duplicate-candidates.integration.test.ts
  test/extra-relink-upgrade.integration.test.ts
  test/plan-entitlement-lifecycle-upgrade.integration.test.ts: PASS, 17 cases
  collected. Collection is not PostgreSQL execution.
- Web Vitest --maxWorkers=1 app/api/contractor/jobs/[id]/duplicate-candidates/route.test.ts
  app/api/contractor/jobs/[id]/duplicate-candidates/transport.test.ts:
  PASS, 6 tests.
- Working-tree lane manifest equality, exported lanePathAllowed and
  migrationOrderViolations validators: PASS, 25 exact non-lane paths and
  2 ordered migrations. This is not an official lane lint PASS.
- node tools/lint.mjs (LANE_BASE_REF=origin/main): core purity PASS; stops at
  official lane lint because unfinished index/HEAD contains the former 1005/
  1006 paths and staged incoming-main changes. These are absent from the final
  25-path delta. No guard or manifest was broadened to grant them.
- Remaining root linters run separately: money arithmetic, commercial boundary,
  AI provider boundary and PL/pgSQL CASE-in-IF all PASS (275 migrations).
- Source comparison asserts identical SQL bytes before/after renumbering and
  byte-identical latest candidate authority guards and active-link projection:
  PASS. Routine diffs were inspected, not database-executed.

- Final API Vitest --maxWorkers=2 src/watchdog-registry.test.ts:
  PASS, 126 tests after the core prerequisite build.
- git diff --check origin/main: PASS. Total executed focused Vitest cases:
  214 passed (82 DB source/proof, 6 web, 126 API); the 17 collected database
  integration cases are separate and not included as executed passes.

### Named holds for landing

- Router must stage the resolved files and renames and complete the merge:
  .git is read-only here, so the index still reports the original conflicts.
  Renumber 1200/1201 to contiguous landing numbers and update matching stems.
  Rerun official lane/root lint after completing the merge; its local result
  above is a named hold, not a green check.
- Required CI against the resulting head: real PostgreSQL fresh/upgrade,
  proof/catalogue/RLS/privilege/fingerprint and tenancy checks; both duplicate
  regression groups (extra-duplicate-candidates.integration.test.ts and
  extra-relink-upgrade.integration.test.ts), older snapshot upgrades including
  plan-entitlement-lifecycle-upgrade.integration.test.ts, approval/unlink, billing/export,
  authorization, entitlement and replay/race suites. These were not executed
  in this sandbox and source checks do not establish their guarantees.
- Browser CI: ENT-5-duplicate-candidates.spec.ts on mobile-360 and desktop,
  plus required affected journeys. No localhost/browser suite ran here.
- Exact-head independent RED review and all required green CI remain necessary.
  Synthetic fixtures only; no live provider, money, customer data or release.


## Batch-37 merge refresh — 5 November 2026, incoming main d16ef1978

READY for the router to stage the resolved merge; this is not an independent
RED verdict or a database/browser PASS. Plan pieces: ENT-5 candidate dismissal
and ENT-3-RELINK-FIX. No new behaviour or test weakening.

Resolved later-empty-tables.ts by taking incoming main's exact list and adding
only app.extra_duplicate_disposition. Main's CIS, emergency-access and SCIM
rows stay intact. The lane matches all 28 non-lane paths differing from incoming
main and excludes config/lanes/. Both 1200/1201 migrations remain unique to this
group; neither is present on incoming main, and all main migrations are retained.

Rechecked all four replacement routines against the latest definitions across
incoming main's migration history: xa_latest_kind (0158), xa_mark_duplicate
(0522), cb_unresolved (0243), extra_duplicate_candidates (0590). No newer body
requires reconstruction. The mark writer differs only by its explanatory
comment; its authority and LP-5 handoff are unchanged. Candidate role/session/
job guards and active-link projection are preserved. The state projection and
shared dismissal grouping contain only this group's existing behaviour.
Diffs inspected at /tmp/batch-37-merge-routine-diffs.txt; no SQL change was needed.

Local checks use installed Node 24.17.0 and cached pnpm 10.28.1 via
node /Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs,
with at most two Vitest workers and no downloads:

- DB vitest run --maxWorkers=2 test/migration-proof-loader.test.ts
  test/extra-relink-migration.test.ts src/extra-duplicate-candidates.test.ts:
  PASS, 83 tests.
- DB vitest run --maxWorkers=2 test/late-source-import-migration.test.ts
  test/m2-1-migration-proof.test.ts: PASS, 7 tests.
- Web vitest run --maxWorkers=2
  app/api/contractor/jobs/[id]/duplicate-candidates/route.test.ts
  app/api/contractor/jobs/[id]/duplicate-candidates/transport.test.ts:
  PASS, 6 tests.
- Exact working-tree lane equality, lanePathAllowed and
  migrationOrderViolations: PASS, 28 paths and two ordered new migrations.
- Core purity, money arithmetic, commercial boundary, AI provider boundary and
  PL/pgSQL CASE-in-IF linters: PASS; 280 migrations checked by the SQL linter.

The router must stage the resolved file and complete the merge because .git is
read-only here; the index still records its original conflict. Official lane
lint against the completed head, required real PostgreSQL fresh/upgrade and
catalogue suites, browser journeys and exact-head independent RED review remain
for router/CI. No PostgreSQL server or localhost/browser was started locally.

- pnpm typecheck --concurrency=2: PASS, all seven workspace packages,
  4m6.637s. PATH used /tmp/batch-37-pnpm-bin to select the cached pnpm;
  Turbo emitted sandbox cache IO warnings but every check completed with exit 0.
- git diff --check MERGE_HEAD and final conflict-marker scan: PASS.

## Batch-37 PR handoff — 5 November 2026, incoming main 68b104767

READY for the router to stage and complete the merge, commit, push and open the
PR. Plan pieces: ENT-5 exact-group dismissal and ENT-3-RELINK-FIX. RED. This is
builder evidence, not an independent verdict, a database PASS or merge approval.

The only conflict, plan-entitlement-lifecycle-upgrade.integration.test.ts, is
resolved as the union of main's exact 0615 success-fee and 0616 payment-fee body
assertions and the existing branch's relink/disposition body assertions. No
assertion was dropped or weakened. Incoming main changes remain intact.

Migration inventory against origin/main 68b104767:
- 0622_extra_duplicate_relink.sql (formerly numbered 1200).
- 0623_extra_duplicate_disposition.sql (formerly numbered 1201).
Neither stem repeats a migration on main. SQL bytes equal the prechecked HEAD's
original files; only filenames and full-stem references in notes, proofs, tests,
receipts and lane changed. Historical bare numbers/test titles are preserved.
No main migration or proof was changed, and no duplicate copy was retained.

All re-created routines were diffed against main's latest definitions:
xa_latest_kind (0158), xa_mark_duplicate (0522), cb_unresolved (0243), and
extra_duplicate_candidates (0590). No newer main body is overwritten. The mark
writer differs only by the existing explanatory comment. Existing authority,
LP-5 effect binding, candidate guards and active-link projection remain intact;
only the already-prechecked effective-state and shared dismissal logic differ.
Diff evidence: /tmp/batch-37-routine-diffs-20261105.txt.

Applied the issued catch-up requirements without product behavior changes:
- Named the ResolveDuplicateCandidates LP-5 lifecycle hold in extra-unlink-v1:
  this is its own checked receipt/replay writer, not lifecycle dispatch.
- Added a real repository replay/concurrent-retry/changed-intent case to
  command-replay-contract.integration.test.ts. Its database execution is owed.
- Added extra_duplicate_disposition to watchdog's snapshot and RLS/owner
  catalogue list. Existing live-trigger tables retain their exact insert and
  trigger assertions; the new private table has no runtime grants.
- The lane lists all 30 changed non-lane files and does not list itself.
- Source-inspected affected web routes: no direct apps/api source import.
  Cloudflare build was not run in this restricted sandbox.

Local checks, installed Node 24.17.0 and cached pnpm 10.28.1, no downloads:
- DB Vitest run: migration-proof-loader, extra-relink-migration,
  src/extra-duplicate-candidates: 83 passed.
- DB Vitest run: late-source-import-migration, m2-1-migration-proof,
  lp5-command-catalog: 14 passed.
- Web Vitest run: duplicate-candidates route and transport: 6 passed.
  Each run used --maxWorkers=2 and at most three named files.
- Vitest list collected command-replay-contract, watchdog and
  plan-entitlement-lifecycle-upgrade, including the new replay case. Collection
  is syntax/import evidence only; no integration hook or database test ran.
- pnpm typecheck --concurrency=2: all seven tasks passed, 43.047s. Turbo emitted
  sandbox cache IO warnings; the checks exited zero.
- Core purity, money arithmetic, commercial integrity boundary, AI provider
  boundary and PL/pgSQL CASE-in-IF linters: passed (285 migrations checked).
- Exact working-tree lane equality, lanePathAllowed and migration ordering:
  passed. git diff --check origin/main: passed.
- Official node tools/agent-lane-boundary-lint.mjs was run and failed because
  HEAD/index still expose incoming main changes and the old renamed paths in
  the unfinished merge. No lane widening or git write was used to bypass it.
  Router must rerun it after staging the renames and completing the merge.

CI must prove the final head's real PostgreSQL fresh/upgrade/proof/catalogue,
RLS/privileges, older snapshot upgrades (including restore-reconciliation and
plan-entitlement-lifecycle), replay contract including the new dismissal case,
watchdog, relink/unlink, approval/export and race suites. Browser CI must run
ENT-5-duplicate-candidates on phone and desktop and affected mandatory journeys.
Required full CI and exact-head independent RED review remain outstanding.
Only made-up fixtures; no providers, real money/customer data or release.


## batch-37 catch-up to #579 and #581 — 6 November 2026

RED; catch-up only for PR #582, branch `codex/sandbox/batch-37`.
Compared against incoming main `f5415ddb4c3a40796dd812e8b5946ba5094daa2b`.
Resolved all six working-file conflicts as a union: EndCheck and
ResolveDuplicateCandidates both survive in the current registry, historical
filters, restore snapshots and later-empty-table catalogue. The exact 0620
live-prompt assertions and 0622/0623 duplicate assertions both remain.
Updated 0623's registry proof to start from 0620's exact 64-row snapshot and
retain both commands in its sorted 65-row successor. No other expectation
change or new product behaviour.

Every migration already on main is byte-identical. Only this group's 0622 and
0623 are added. Scanned main's migrations in order for each replaced routine;
compared full definitions against latest main: xa_latest_kind (0158),
xa_mark_duplicate (0522), cb_unresolved (0243), extra_duplicate_candidates
(0590). The existing replacements already preserve main's latest behaviour
apart from this group's intended relink/disposition changes, so no SQL-body
rewrite was needed. In particular the mark writer retains its LP-5 effect
binding and the candidate reader retains every mainline permission/mode check,
active-link field and candidate predicate.

Local checks with installed Node 24.17.0 and cached pnpm 10.28.1:
- Vitest, maxWorkers=2, late-source-import-migration,
  m2-1-migration-proof and extra-relink-migration: 10 passed.
- Vitest, maxWorkers=2, migration-proof-loader,
  src/extra-duplicate-candidates and lp5-command-catalog: 81 passed in two
  test files; lp5-command-catalog is an imported catalogue, not a test suite.
- Web Vitest, maxWorkers=2, duplicate-candidates route and transport: 6 passed.
- `pnpm typecheck --concurrency=2`: all seven package tasks passed in 25.045s.
  Turbo reported restricted shared-cache IO warnings; no task failed.
- Core purity, money arithmetic, commercial boundary, AI provider boundary and
  PL/pgSQL CASE-in-IF linters passed (288 migrations checked).
- Read-only checks: all main migrations byte-identical; only 0622/0623 added;
  0623 exact registry predecessor and PostgreSQL jsonb-text ordering verified;
  lanePathAllowed and exact lane equality passed for 30 non-lane paths.
- Vitest list collected 17 cases across plan-entitlement-lifecycle-upgrade,
  restore-reconciliation-upgrade and extra-duplicate-candidates integration.
  Collection is syntax/import evidence only; no database hooks ran.
- `git diff --check origin/main` passed; no conflict markers remain in the
  working files. The read-only index still records the six original conflicts;
  the router must stage these resolutions and finish its existing merge.

The global pnpm shim stalled before running tests and was interrupted; the
first typecheck attempt through that shim was also interrupted (zero completed
checks). Used a /tmp wrapper around the already-cached pinned pnpm thereafter;
no packages downloaded. An escaped-bracket web filter collected no files;
corrected literal paths ran the six tests above. No checks were weakened.

READY for router commit/push to the same branch. Full exact-head CI, PostgreSQL
fresh/upgrade/catalogue/RLS/race suites, browser journeys and independent RED
review remain required. No Git write, database startup, socket bind, provider,
real customer data, release or deployment was performed.


## Batch-42 merge refresh — 6 November 2026, incoming main 46f0be7ea

READY for router staging and merge completion. Plan pieces: ENT-5 client
approval and DEMO-S company Final Check authority design. RED: sign-in,
commercial approval, tenant isolation and hidden-data design. Builder evidence
only; no independent verdict, database/browser PASS or release authority.

Resolved all six working-file conflicts as a union. Main's EndCheck and
ResolveDuplicateCandidates registry rows, replay case, routine-body assertions,
CIS/emergency/SCIM/private fixture tables and receipt sections remain. This
group's client-session rows, sender authority and exact client replay assertions
remain. Aliased the client fixture's cluster import to preserve both fixtures.
The 0606 historical proof keeps its original owner authority and excludes all
three later command types. The 0642 proof now chains from main's 0623 registry
snapshot, adding main's two new rows to both sides and changing only this group's
IssueClientApproval permission. No test or protected check was weakened.

All five 0641–0645 migration stems are unique against incoming main; none
needed removal. No main migration/proof was changed. Diffed all three dynamically
re-created routines against their latest main definitions: xa_issue_link (0158),
lp5b_contractor_permission (0522), northside_capture_action (0167). The migrations
read the installed latest bodies; the diff contains only the existing four
replacement fragments. Main has no later replacement or patch to these routines.
Source-only comparison: /tmp/batch-42-merge-routine-diffs.txt.
Lane batch-42 covers exactly all 48 changed non-lane files against MERGE_HEAD
and excludes config/lanes/ and itself.

Executed with installed Node 24.17.0 and cached pnpm 10.28.1; no downloads,
PostgreSQL server, localhost binding, Git writes or providers:

- DB Vitest --maxWorkers=2: migration-proof-loader.test.ts,
  m2-1-migration-proof.test.ts, extra-approval-timing.test.ts: 97 PASS.
  The initial proof run failed on the stale registry predecessor; corrected
  the group's proof snapshot as described above and reran all three files.
- API Vitest --maxWorkers=2: extra-customer.test.ts and customer-signin.test.ts:
  52 PASS. watchdog-registry.test.ts: 127 PASS after rebuilding core locally.
  Its initial run read stale core dist and failed three classification checks;
  the unchanged source registry passed after compilation.
- Web Vitest --maxWorkers=2: app/api/northside/routes.test.ts: 23 PASS.
  Total successful focused cases: 299.
- Vitest list --maxWorkers=2 collected 78 cases across
  command-replay-contract.integration.test.ts,
  plan-entitlement-lifecycle-upgrade.integration.test.ts and
  extra-client-session.integration.test.ts. Collection only, not execution.
- Core tsc build and DB/API/web tsc --noEmit: PASS.
- Core purity, money arithmetic, commercial boundary, AI provider boundary and
  PL/pgSQL CASE-in-IF linters: PASS (293 migrations). Core purity reports its
  existing computed-import observations.
- Exact working-tree lane equality, lanePathAllowed, migrationOrderViolations,
  latest-main routine patch/diff inspection and git diff --check MERGE_HEAD: PASS.

Official lane CLI was attempted and refused incoming-main staged paths because
HEAD/index still describe the unfinished merge. This is not a CLI PASS. The
router must stage the resolved working files, complete the merge and rerun the
official lane check. Required exact-head CI, real PostgreSQL fresh/upgrade,
proof/catalogue/RLS/privilege and replay/race suites, browser journeys and the
independent RED review remain. No new behavior was introduced by this refresh.


## Batch-42 merge refresh — 6 November 2026, incoming main 919b7f3e6

READY for router staging and merge completion. ENT-5 client approval and
DEMO-S company Final Check authority design; RED. This is builder evidence.

Resolved the sole working-file conflict in later-empty-tables.ts as the union:
main's privacy_review_fact and both supplier-line tables remain beside this
group's three client-session tables. Existing exact registry and routine-body
assertions retain both groups' behavior. No test was weakened or behavior added.

All main migrations are byte-identical. The five unique group migrations
0641–0645 remain; none duplicates a main migration. Scanned main's full ordered
migration inventory for the three dynamically recreated routines. Latest bodies:
xa_issue_link (0158), lp5b_contractor_permission (0522), northside_capture_action
(0167). Each replacement fragment matched exactly once; source diffs contain
only the group's existing four substitutions. The installed-body recreation
therefore retains every main addition. Source-only evidence:
/tmp/batch-42-merge-routine-diffs.txt.

Local checks using installed Node 24.17.0 and cached pnpm 10.28.1, no downloads:
- DB Vitest --maxWorkers=2, migration-proof-loader, m2-1-migration-proof,
  extra-approval-timing: 97 passed.
- DB Vitest --maxWorkers=2, late-source-import-migration and
  supplier-line-migration-proofs: 5 passed.
- API Vitest --maxWorkers=2, extra-customer and customer-signin: 52 passed.
- Web Vitest --maxWorkers=2, northside/routes: 23 passed.
- pnpm typecheck --concurrency=2: all seven packages passed, 25.494s.
  Turbo emitted restricted cache IO warnings; no typecheck failed.
- Core purity, money arithmetic, commercial boundary, AI provider boundary,
  PL/pgSQL CASE-in-IF lint passed (300 migrations). Core purity reported its
  existing computed-import observations.
- Exact lane equality and lanePathAllowed: 51 changed non-lane paths;
  config/lanes/ and the lane itself excluded. Migration ordering passed.

The read-only index still records the original conflict. Router must stage the
working-file resolution and complete its existing merge, then run official lane
validation on the resulting head. Required exact-head CI, real PostgreSQL
fresh/upgrade/catalogue/RLS/replay/race suites, affected browser journeys and
independent RED review remain outstanding. No Git writes, PostgreSQL startup,
localhost binding, provider, real customer data, money, deployment or launch.

- Vitest list collected 78 cases across command-replay-contract,
  plan-entitlement-lifecycle-upgrade and extra-client-session integration.
  Collection only; no database hooks executed. Final working-file conflict
  scan, exact lane equality and git diff --check MERGE_HEAD passed.

## Batch-42 PR-opening preparation — 6 November 2026, base 7d192e5a8

READY for router staging, commit, push and PR opening; ENT-5 client approval and
DEMO-S company Final Check authority design, RED, fictional data only. The
incoming merge was already committed (b5d4dd816); no Git writes were performed.
This is builder evidence, not an independent review or a release approval.

Migration inventory against origin/main (top 0633):
- 0641_extra_client_session.sql (formerly 1040): three private session tables and xc_bind_link.
- 0642_extra_client_send_authority.sql (formerly 1041): xc_send_authority, exact registry permission change and two existing-routine patches.
- 0643_extra_customer_use.sql (formerly 1042): identity.extra_customer_use.
- 0644_extra_customer_approval.sql (formerly 1043): identity.extra_customer_approval and the existing practice-attribution patch.
- 0645_extra_client_timing.sql (formerly 1044): xc_timing.

All five migrations are unique against main; no repeated table or routine
creation was found. SQL bytes are identical to their pre-renumber branch files.
Only filename stems, proof migration names and references were renumbered;
0634–0638 remain reserved for #591 and 0639–0640 for #593. The source-only audit
at /tmp/batch-42-migration-audit.txt compares every recreated routine against its
latest main definition: xa_issue_link (0158), lp5b_contractor_permission (0522),
and northside_capture_action (0167). Each of the four existing substitutions
matches once; no mainline body addition is removed. No new product behavior,
worker, provider route, CI image, permission or function setting was introduced.

MIGFIX-6 and MIGFIX-7 now expect the explicit empty successor tables and current
registry rows when replaying through this group. MIGFIX-7 retains raw predecessor
catalogue/policy identities and compares all relation, policy and routine metadata
through the existing reviewed proof loader. It pins the full bodies of every new
routine, including MON-6's existing read, and applies only the exact three named
routine patches. The enterprise-access allowance remains conditional on the
plan-entitlement test's exact body assertions. The three new private tables also
join watchdog's mutation-count and RLS/owner catalogue checks; existing direct
watchdog insert cases remain unchanged.

Both commercial-integrity baselines needed the same one-site fingerprint refresh
at extra-approval-chain-repository.ts:94. Only that fingerprint changed in each
file; the existing reason and nine-site baseline count remain intact. Both
scanners now report 94 roots and zero diagnostics. The lane lists every resulting
changed non-lane file, excludes itself, and uses only 0641–0645 paths.

Local verification with installed Node 24.17.0 and cached pnpm 10.28.1:
- DB Vitest run --maxWorkers=2: migration-proof-loader, m2-1-migration-proof,
  extra-approval-timing: 97 passed.
- DB Vitest run --maxWorkers=2: late-source-import-migration,
  supplier-line-migration-proofs: 5 passed.
- API Vitest run --maxWorkers=2: extra-customer, customer-signin: 52 passed.
- Web Vitest run --maxWorkers=2: app/api/northside/routes: 23 passed.
- Total executed focused cases: 177; no database hooks were executed.
- DB tsc --noEmit, plus direct installed TypeScript checks for API and web: PASS.
- Vitest list --maxWorkers=2 collected MIGFIX-6, MIGFIX-7 and client-session
  integration tests; separately collected command-replay-contract,
  plan-entitlement-lifecycle-upgrade and watchdog. Collection is not execution.
- Core purity, money arithmetic, commercial adapter boundary, AI provider
  boundary, PL/pgSQL CASE-in-IF lint (303 migrations), both commercial-integrity
  guards and provider-register check passed. No provider data-flow source changed.
- Changed web routes were source-inspected: workspace API exports are used,
  with no imports of apps/api source. Cloudflare build was not run here.
- Working-tree exact lane equality, lanePathAllowed and migration ordering:
  PASS, 56 changed non-lane paths. git diff --check: PASS.

The official lane CLI was run and refused only the ten old migration/proof paths
still present in the read-only pre-renumber index/HEAD. Its result is not a PASS;
the router must stage the renames, commit, and rerun it on the resulting head.
The top-level pnpm typecheck --concurrency=2 failed in its child pnpm launcher
before compilation: registry signature/version-switch fetch was unavailable.
No package was downloaded and no package-manager policy was changed. Direct
compiler checks are recorded separately rather than claiming that command passed.

CI must prove the clean pinned install and required typecheck/lint/test/build,
real PostgreSQL fresh/upgrade/proof/catalogue/ACL/RLS/replay/race suites, specifically
MIGFIX-6/7, plan-entitlement and enterprise-access upgrades, restore reconciliation,
watchdog, command replay and client-session approval/rejection commits. Preserve
all existing approval-chain/timing/evidence-pack and Northside/full-demo gates.
Run affected browser journeys, both complete demos and required phone/desktop
widths with at most two workers. Independent RED review must bind the final head
before merge. Q14/Q15 and proposed-only company Final Check authority holds remain;
no database/browser/provider/customer/live-money/deployment or launch proof is claimed.

Direct installed TypeScript checks for config, storage, core and AI also passed.
Together with DB, API and web, all seven package compiler checks passed; this
does not change the recorded failure of the top-level pnpm launcher command.

## Batch-42 CI repair try 1 — 6 November 2026, PR #594 at 1c515e3e

READY for router commit and push. ENT-5 client approval and DEMO-S company
Final Check authority design; RED. Builder evidence, synthetic data only.

Read every failed job in CI run 42175030809 through the GitHub connector after
`gh` could not reach api.github.com. Inspected shard 5's Playwright artifact
13483279074, including the customer page network trace. Root causes:

- All four core-db shards: the common outbox claim query referenced
  extra_client_link and xc_send_authority even for unrelated sends. Historical
  upgrade fixtures intentionally precede one or both objects; PostgreSQL resolves
  unused OR branches too. Moved the same scoped sender check to a separate query
  only for the locked client-send action, before claims, attempts or delivery.
  Current membership, revocation, exact authorization and entitlement checks stay.
  False, missing or failed sender authority never calls the adapter.
- Money-trail, financial-reconciliation-queue and recovery-billability successor
  proofs expected IssueClientApproval's old owner permission after 0642. Their
  own-step preservation checks remain byte-exact. A cloned successor expectation
  asserts the old permission is owner, then requires contractor for exactly that
  row; every other original column, row and type remains compared unchanged.
- Web shards 2 and 5: ENT-11a and ENT-11b reached the new client page but the API
  returned 401 UNAUTHENTICATED from proxy.ts. The customer-cookie allowlist omitted
  extra-approvals. Added only that exact endpoint; route session/origin/grant
  checks remain. Tests also refuse trailing slash, child and uppercase variants.
- core, web and checks failed because their prerequisite shards failed. Their
  logs show no separate root cause. core-checks and Cloudflare bundle passed on
  the original exact head; these are historical CI results, not repaired-head proof.

Local verification using installed Node 24.17.0 and cached pnpm 10.28.1:
- DB Vitest run --maxWorkers=2 src/outbox.test.ts src/later-outbox.test.ts:
  27 passed; includes sender refusal/error and unrelated-send regressions.
- Web Vitest run --maxWorkers=2 proxy.test.ts app/api/northside/routes.test.ts:
  67 passed, including the exact customer route boundary.
- API Vitest run --maxWorkers=2 src/auth/extra-customer.test.ts
  src/auth/customer-signin.test.ts: 52 passed. Total: 146 executed focused tests.
- Direct installed TypeScript compiler --noEmit for DB and web: passed.
- Vitest list --maxWorkers=2 collected all three changed upgrade cases; collection
  only, no PostgreSQL execution or hooks.
- Official lane boundary and commercial boundary lint passed. Both commercial
  integrity guards passed: 94 protected roots, zero diagnostics, existing nine
  unresolved baselines unchanged. git diff --check passed.

No migrations were edited or renumbered; all main migrations remain unchanged.
The lane includes the six additional repair paths. No tests were skipped or
weakened, and no product policy or behavior was added. No Git writes, package
downloads, PostgreSQL startup, localhost bind, provider, real data or deployment.
CI must rerun all database and browser shards after the router pushes. Required
independent RED review must bind the resulting exact head before merge. Existing
commercial/release holds remain unchanged.
