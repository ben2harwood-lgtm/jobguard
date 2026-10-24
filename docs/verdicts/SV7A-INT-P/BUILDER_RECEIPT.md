# SV7A-INT-P builder receipt — STOP, incomplete

24 October 2026. Codex builder. Issued decision 74, build-ahead only, C250 one
build/at most two repair rounds. No independent verdict or acceptance is claimed.
No commit, push, staging, checkout, Git metadata write, install or download.

Base/HEAD: `41cd9d10c59993c01f3bcf387e750c1127ae9fa1`.
Branch: `codex/sandbox/sv7a-int-p`; worktree `.worktrees/sv7a-int-p`.
Read-only local `origin/main`: `4b1a779008505c86ca85db78fb38eda412394fe4`.
Working tree was clean at entry. Parent provenance supplied by the issuance:
SV7A-INT-C 9195ae4d and MON1-A a9dc9c42 (carrying CH-4-C 14eca750).
Parent acceptance is supplied dispatcher evidence, not a builder verdict.

Read the full repository AGENTS.md, applicable BUILD_PLAN SV-7A/CH-4/meter and
shadow rules, the full SV7A-INT-P draft (3512–3580), planning-pack common
contracts/ownership/resource rules, installed parent contracts and receipts,
and Ben's 17/23 October answer files. The later issued order authorizes this
lane file, reserves 0225, relocates migration notes to packages/db/migration-notes,
and controls build-ahead, local execution and no-commit behavior.

## STOPs and safest choices

1. **STOP-SOURCE-ADMISSION:** git grep across all migrations finds only the 0210
   definition of `app.mon1_admit_place(uuid,uuid,text,uuid)`. It always raises
   `METER_PLACE_SOURCE_HANDOFF_HELD`. The installed MON1-A contract explicitly
   holds the checked pre-mutation source resolver and complete lock order.
   CH-4 `app.ch4_admit_place(uuid,uuid,text)` in 0201 also always raises
   `CAPACITY_ADMISSION_UNAVAILABLE`; no replacement is installed. A parent
   accepted as a bounded foundation does not provide positive diary admission.
2. **STOP-DIARY-EXTENSION:** 0144 `job_site_source_receipt.source_kind` accepts
   only photo/delivery_note/goods_receipt/builder_extra/stage_completion. The
   accepted diary-source extension and coordinator-approved exact delegation,
   constraint changes and full lock order are absent. The draft explicitly says
   persistence construction is held until this handoff is supplied. Do not label
   diary evidence as a photo/delivery or implement a competing lifecycle.
3. **STOP-PUBLIC-EXPORTS:** git grep for `jobSourceIntakeReceiptV1`,
   `JobSourceIntakeError`, `classifyJobSourceIntake` in core index has no matches.
   Definitions exist in core/src/job-source-intake.ts, but shared barrel edits
   belong to the coordinator. This does not justify a new package subpath.
4. New deliverables `sv7a_intake_job_source`, `sv7a_claim_source_identity`,
   `sv7a_admit_diary_source` and JobSourceIntakeRepository are absent at entry,
   expected for this new lane. No new routine is installed or called. Existing
   VerifiedTenantContext/withTenant, authenticate_practice_session,
   require_watchdog_live, read_job_sources, tenant-wide identity/reservation
   logic, original/evidence/source tables and worker decoder were found with
   git grep and source inspection. No absent existing symbol is silently assumed.

Ben's safest synthetic choice is **refuse rather than allow**: retain the installed
admission refusals, no partial off-site/message writer, no newly minted event or
count, and no hidden disclosure. Owner-only fictional customer messages and the
post-lock refusal are already settled by 17 October answers; they need no new
policy. The refusal is a technical missing-source-contract hold, not a request
for Ben to decide commercial policy. An asynchronous request for a newer accepted
handoff artifact was sent; no reply received at receipt preparation.

## Changes and exact coordinator integration requirements

Only the own lane JSON, persistence handoff contract and this receipt are added.
No SQL, roles/grants, runtime code, shared files, routes, tests, provider or data
changes. Migration 0225 remains reserved and unwritten; no backfill or rollback.
Contract: docs/contracts/job-source-intake-persistence-v1.md. Own lane uses the
installed parent shape/current validator and explicit issued allowlist; it does
not grant itself the lane register or inherited parent paths.

After source STOPs clear, coordinator rows required for the complete leaf:

- Core index: export jobSourceIntakeReceiptV1, JobSourceIntakeError,
  classifyJobSourceIntake and types JobSourceIntakeReceipt,
  JobSourceIntakeErrorCode, JobSourceIntakeClassification from
  ./job-source-intake.js (parent C handoff).
- DB index: export JobSourceIntakeRepository from
  ./job-source-intake-repository.js only after that implementation exists.
- DB WatchdogCommandType: additive literals `job_source.diary.intake` and
  `job_source.customer_message.intake`; core command registry: corresponding
  `command:job_source.diary.intake` and
  `command:job_source.customer_message.intake`, both watchdog_live_only.
- Core CH-4 classifier: on-site diary source discriminator must be agreed by its
  owner; do not guess its field spelling or treat this as accepted extension.
- LP0: eventual routine owner rows for the three exact signatures in the contract,
  narrow runtime EXECUTE row for the main writer only; private protection rows
  for both helpers; SECURITY DEFINER + pg_catalog checks on the main writer.
  Retain all old privilege rows. Exact SQL bodies/catalogue fingerprints cannot
  be supplied before construction. No new table catalogue rows in this change.
- No route registration, OpenAPI change or browser spec belongs to P. Those are
  A/D/M/O work. No direct shadow-table access or shadow scheduling is introduced.

None of the future additive rows above is applied or claimed present. No shared
catalogue/test modifications were made. P01–P08 remain HOLD, not PASS. Unit, SQL
integration/race/authority/upgrade suites for the missing writer are not authored:
without the required source seam they would test a fabricated contract. No skipped
or placeholder tests substitute for those requirements.

## Verification

Results appended below. Installed Node v24.17.0; pinned cached pnpm 10.28.1.
No clean install claimed. PostgreSQL and browser suites NOT RUN by dispatcher
instruction: sandbox cannot start PostgreSQL or bind localhost. No live provider
or model run. No AI/parser/model change, so new eval gate is inapplicable.

### Commands actually executed

Checks run sequentially under existing heavy-slot with HEAVY_SLOTS=1; nested
pnpm selects the installed cached 10.28.1 CLI via a temporary PATH wrapper.
The scheduler printed sandbox denials for sysctl/ps, so its load/process-count
telemetry is unavailable; no escalation or scheduler replacement was used.
Observed free memory 55% initially and 46% during build, disk 107 GiB available;
one shared slot only, Turbo concurrency 2, Vitest at most 2 workers.

- Initial `pnpm --filter @jobguard/db typecheck` and `pnpm --filter @jobguard/db lint`:
  exit 2 each; parent meter-lifecycle-source.ts imports missing generated
  ../../core/dist/meter-lifecycle.js, with consequent implicit-any diagnostics.
  Rerun after successful build recorded below; no source edit attempted.
- `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-source-intake.test.ts src/job-sources.test.ts src/meter-place-admission.test.ts`:
  exit 0, **47 tests passed, 3 files**. These are unchanged parent tests, not new
  persistence, PostgreSQL or positive source-admission proof.
- `LANE_BASE_REF=origin/main pnpm lint --concurrency=2`: exit 1. Core purity passes;
  lane guard refuses inherited CH-4/MON1/C changes outside P's allowlist.
- `LANE_BASE_REF=origin/main pnpm lint:lanes`: exit 1, same inherited-path hold.
  No lane grant widened to suppress it. Dispatcher must reconcile the comparison
  range/parent integration before this required gate can pass.
- `pnpm build --concurrency=2`: exit 0, **7 tasks successful, 2 cached**, 43.402s.
  Existing sandbox Turbo IO, Next workspace-root/CSS/optional-dependency warnings.
  No listener, browser or PostgreSQL suite was started by the builder.
- `pnpm openapi:check`: exit 1, tsx launcher fails listen EPERM on its IPC pipe.
- Equivalent check `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check`:
  exit 0, same generator/check flag without the socket-launching CLI. No OpenAPI
  changes. This fallback does not erase the original command failure.
- Read-only working-tree scope diagnostic using loadLanePolicy/lanePathAllowed:
  exit 0; exactly 3 new files, no tracked edits, no path outside the issued lane.
  This proves only scope and JSON validator compatibility, not the origin/main gate.
- `git diff --check`: exit 0. All Git calls were read-only. A corrected rg search
  followed an invalid `rg -E` option; no code or validation claim relied on it.

Logs: /private/tmp/jg-sv7a-int-p-*.log; sequential command scripts:
/private/tmp/jg-sv7a-int-p-checks.sh and /private/tmp/jg-sv7a-int-p-final-checks.sh.
No owned unit suite exists because executable construction is STOP. Full root
pnpm test, eval, test:db, test:migrations, all DB integration/upgrade and browser
checks are NOT RUN. No mock or source review is described as their replacement.

### Existing CI regressions verified by path

From installed parent receipts and git-tracked paths (not executions here):

```sh
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-work-state-commands.integration.test.ts test/job-work-state-commands-boundaries.integration.test.ts test/job-work-state-commands-races.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-work-state-commands-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/meter-place-admission.integration.test.ts test/meter-place-admission-races.integration.test.ts test/meter-place-admission-upgrade.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-sources.integration.test.ts test/job-sources-evidence.integration.test.ts test/job-sources-authority.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-sources-isolation.integration.test.ts test/job-sources-upgrade.integration.test.ts test/job-work-state-sources.integration.test.ts
pnpm --filter @jobguard/db exec vitest run --maxWorkers=1 test/job-work-state-post-lock.integration.test.ts test/job-work-state-races.integration.test.ts test/watchdog-legacy-identities.integration.test.ts
pnpm test:db
pnpm test:migrations
```

No new intake integration files are claimed present. Once the handoff is supplied,
the specified new adapter/authority/race/upgrade suites remain required along
with these regressions, catalogue/grant checks and exact-head independent review.
Shadow isolation/evidence invariants are preserved by making no executable change;
this is not new PostgreSQL evidence of their implementation.

Intended conventional subject/body written to /private/tmp/jg-msg-sv7a-int-p.txt.
Dispatcher owns staging/commit/push; build remains incomplete, technical acceptance
and merge held. No professional, policy, release or independent model approval.

### Final package checks after dependency build

- `pnpm --filter @jobguard/db typecheck`: exit 0.
- `pnpm --filter @jobguard/db lint`: exit 0.

The initial missing-generated-core diagnostics are resolved by building dependencies;
no parent source modifications were needed. The helper delayed this rerun before
acquiring a slot, printing the same sandbox telemetry denials. All final reruns
still used HEAVY_SLOTS=1. This was validation only, not a persistence repair round.

- `pnpm typecheck --concurrency=2`: exit 0, 7 tasks successful, 2 cached,
  19.111s. Existing sandbox Turbo IO warnings only.
- Final scope remains exactly the three new files listed above; final
  `git diff --check` exit 0. No newer handoff artifact was supplied during this run.

**Final verdict from builder: STOP / incomplete.** Positive atomic persistence,
P01–P08, new runtime SQL tests and migration 0225 require the exact upstream
handoff. Required origin/main lint/lane gate remains red on inherited parent
changes. This receipt is evidence of the stopped build, not acceptance of P.
