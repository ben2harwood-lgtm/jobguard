Built by Codex; dispatched 13 Oct 2026.

ENT-5 — issued foundation and settled constraints only; RED lane. This is a builder run receipt, not a verdict or acceptance. The addendum's requested Claude attribution would be inaccurate; the actual builder is recorded above.

## Base, authority and allocation

- `origin/main`: `6659fb58791ec22588948f005b2bd4f6b299fa48`, verified without fetching or changing refs.
- Build-ahead/final HEAD: `82f05c2af245255a84921108e554ecab4e065054` (ENT-3d #170 stack). No builder commit, push, PR or checkout. Intended commit message: `/private/tmp/jg-msg-ent-5.txt`.
- Migration: `0147_extra_approval.sql`; one additive runner registration. No renumbering of predecessors.
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

1. `GRANT SELECT ON app.extra_approval_revision_binding TO jobguard_runtime;` (0147:52).
2. `GRANT SELECT ON app.extra_evidence_pack TO jobguard_runtime;` (0147:53).

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

These files are unchanged. No prerequisite was silently repaired in another lane.

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

PostgreSQL test inventory (13 tests), each **NOT RUN (cannot start PostgreSQL here)**:

- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial catalog RLS and absent business writer boundary`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-09 partial source binding preserves the origin-bound SoR row and basis`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial wrong-job revision hash and predecessor specimens refuse`.
- `packages/db/test/extra-approval-authority.integration.test.ts`: `E5-24 partial migration-owner mutation of immutable foundation rows refuses`.
- `packages/db/test/extra-approval-upgrade.integration.test.ts`: `/`.
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

## Lane evidence and hashes

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

Protected-file SHA-256, unchanged against issued HEAD:

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

Delta SHA-256 (receipt excluded to avoid hashing its own text):

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
| `packages/db/migrations/0147_extra_approval.sql` | new | 0e10ed73dd26a83b661ef6e14e218ab1f0676e647c45096794f5de47092a534f |
| `packages/db/src/extra-approval-repository.ts` | new | 61e6c49d3d6511425f7154932babb5fe58542d14dd853c270ae729aa4d64a2af |
| `packages/db/src/extra-evidence-pack-repository.ts` | new | 04e866c5f085740396fc8bcc81f4fa6691df28a3c855345cb08190f67dc67af4 |
| `packages/db/src/extra-evidence-pack-sources.ts` | new | 683e079d541a0e5c3d00218cb45f2834bb3b2efbd6ac494c169c6382cb4b5ae9 |
| `packages/db/src/index.ts` | ed4269813c652a4bb0073ec0cdd586667125b1063d824d228ee858a65ebd897d | f18d313aef22316f36831f2b19d427c495f517dddcfc55a043aae8da034a3e56 |
| `packages/db/src/migrate.ts` | 95bb5640ec12ac7dff1e25b303e0224bea6ebbbdd843efe370c284ab2abe9fa2 | 334dd4e65b90463178ee0502e697c60b6a2465c923d70ea6938bab5d18bd9639 |
| `packages/db/test/extra-approval-authority.integration.test.ts` | new | 88a90be4c7fda85a754fc7f0ab63399898bc33f9d558e95b5682f3e80c028eee |
| `packages/db/test/extra-approval-fixtures.ts` | new | e99b6343e7f6f8aed48c29ee5c415768eb6b14da79350d97c5300673500e12f9 |
| `packages/db/test/extra-approval-upgrade.integration.test.ts` | new | db93fdf87f717aa370c28247936bc68cac100440c17d25504390521a2005b884 |
| `packages/db/test/extra-evidence-packs.integration.test.ts` | new | 6c1dc7188efc4a045e97060714479ef63eb6df7413eaec57d8ce67e29ff1a1b6 |

Final HEAD: `82f05c2af245255a84921108e554ecab4e065054`. No builder commit exists; intended message is in `/private/tmp/jg-msg-ent-5.txt`. Exact patch/source hashes, not this unchanged HEAD alone, identify the uncommitted builder work. Independent verdict, separate acceptance and founder merge remain outstanding.
