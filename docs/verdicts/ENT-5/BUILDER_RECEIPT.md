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
