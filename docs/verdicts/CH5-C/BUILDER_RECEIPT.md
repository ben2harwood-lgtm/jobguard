# CH5-C builder receipt — 23 October 2026

Status: LATER-items follow-up in the working tree at accepted head
`ab1f6b30cb9db8dac7693b57b9e5a7cfcc10a15a`. Prior Claude A/B PASSes and
separate technical acceptance bind only that head. No acceptance of this new
diff, commit, push, merge, enablement or parent CH-5 completion is claimed.
The original build receipt below is historical; the appended LATER-items receipt
supersedes its pre-commit identity/check status for this follow-up.

## Authority and source

Issued by the Track A+B dispatcher under decision 74, with Ben's build-ahead
permission. Exact worktree: `.worktrees/ch5-c`; exact branch:
`codex/sandbox/ch5-c`. HEAD and `origin/main` were both
`dc5721230fd8aedbf2d9d0457789074b66b48765`; integration target is main.
No git write command was run. The dispatcher must commit and bind final checks,
Claude A/B verdicts and separate acceptance to the resulting exact head.

Read repository AGENTS.md (rev 3.0), BUILD_PLAN CH-5 and applicable invariants,
the intake-import-integrity planning pack's source/common contracts/hold register,
CH-5 common boundaries and full CH5-C card at line 3742 of
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-planning-wave-20261020T214337Z/JobGuard-BUILD-AHEAD-ALL-SIX-CORRECTED-DRAFT-20261020T230116Z.md`.
This issued order overrides the draft-only and coordinator-only own-lane wording
for this build and this one exact registration file; it does not clear consumer,
production, review or acceptance gates.

## Files and implemented choices

Only these seven permitted new files are delivered:

- `packages/core/src/job-import-v3.ts`
- `packages/core/src/job-import-v3.test.ts`
- `packages/core/src/imported-evidence-provenance.ts`
- `packages/core/src/imported-evidence-provenance.test.ts`
- `docs/contracts/job-import-v3.md`
- `config/lanes/ch5-c.json`
- `docs/verdicts/CH5-C/BUILDER_RECEIPT.md`

Simple proposed forms selected within the acceptance IDs:

1. Strict public intent selects an opaque fictional fixture, exact binding,
   lifecycle and full-snapshot hash; no arbitrary real-file ingestion.
2. Separate approved snapshot has exact source baseline/line references, explicit
   payer revision, fixed synthetic v3 terms, exact attestation wording and a
   mandatory complete history manifest. Baseline totals use bigint. No cap,
   actor/server clock or generated result identity can enter approved content.
3. Preview and action hashes use one sorted-key canonical JSON representation of
   the entire parsed snapshot and the existing pure SHA-256 helper. Arrays and
   original string values retain their order/content. Reference terms remain
   proposed, not commercially approved.
4. Deeply frozen receipt has stable scope identities, builder-baseline origin and
   weaker lineage; a result-binding helper verifies the exact approved hash,
   lifecycle and original line amounts/identities. MON-1 result is an opaque UUID,
   with no writable count, charge or fee. It is not a fabricated accepted quote.
5. Provenance requires precise explicit-offset instants with 6–9 fractional
   digits, using bigint nanoseconds and Gregorian date arithmetic. Equal,
   insufficient/unknown precision, invalid or contradictory metadata stays held.
   Original strings are preserved; no clock is read. An authentic prior permanent
   exclusion remains permanent for the exact evidence/adoption binding. This
   conservative precision choice remains subject to source-owner acknowledgement.
6. Small-job classification delegates to `isSmallJobV3`, with highest sent zero
   for the separately imported job's absence of sent quote revisions. Existing
   shadow `qualifiesAttribution` is exercised for permanent exclusion; no copied
   fee/pricing/meter formula or commercial effect exists.
7. Schemas remain private relative-path imports pending coordinator exports.
   C1: pure core contract/fixtures, no web workflow in this leaf.

All fixture UUIDs are generated synthetic literals of the form
`10000000-0000-4000-8000-<12-digit integer>`; fictional fixture identity is
`fictional-live.v1` (and deliberately changed hash-test identities). No customer
PII, provider calls, database changes, operational alerts or new credentials.
Withdrawal: remove these additive files; no data migration or v1 compatibility
change. No application/routing/barrel/catalogue/migration edits.

## Symbol inspection and STOPs

`git grep`/source reads confirmed existing `adoptJobV1`, `assertAdoptJob`,
`IMPORT_LINEAGE_LABEL`, `AdoptInFlightJobMutation`, `jobPartiesImportV1`,
`jobPartiesImportResultV1`, `JobPartiesApplication`, `isSmallJobV3`,
`createShadowSignal`, `qualifiesAttribution`, `FinalAccountSourceLine` and
`assembleDraftFinalAccount`. Both named three-file regression batches exist.
New CH5-C schemas/classifier were absent as expected and are delivered here.
No named existing symbol required for the pure leaf was missing: no item STOP
for those symbols.

STOP-INTEGRATION: no runtime import-live admission or acknowledged imported
activation/observation/Final Account bridge is supplied by this leaf. The parent
pack explicitly describes these as proposed, unavailable interfaces. No guessed
MON-1 routine, fake quote ID, standalone eligibility rule or persistence substitute
was introduced. Runtime/consumer work remains with its assigned owners.

STOP-LANE-COMPARISON: the real lane check refuses `HEAD == origin/main` with
"Missing branch or self-comparison range; refusing a misleading pass." This is
expected before the dispatcher's first commit; the checker was not weakened,
the comparison was not changed and git was not written. Rerun root lint and
lane lint against origin/main after the dispatcher commits.

## Commands and actual results

Node was `v24.17.0`; the cached pinned package manager reports `10.28.1`.
Dependencies were already installed; no install or package change was performed.
The normal PATH pnpm launcher is an installed pnpm 11 executable: it stalled and
failed trying to verify/switch to 10.28.1 through the unavailable registry. Initial
`pnpm --version` and first import Vitest invocation exited 1 before tests ran;
a second version probe with package-manager-management environment flags also
exited 1. These failures are not test failures or evidence of tampering.
Subsequent commands use a temporary executable wrapper at
`/private/tmp/jg-ch5-c-tools/pnpm` which invokes the already-cached
`/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` with Node.
For all successful pnpm invocations below, PATH was prefixed with
`/private/tmp/jg-ch5-c-tools`; no dependencies were downloaded or replaced.

Tests were authored before implementations. The stalled launcher prevented a
completed missing-module red run. The first executed import batch instead found
one real failure: Zod's dirty numeric refinements reached `BigInt(0.1)` and threw
inside `safeParse`. The guard was fixed without weakening the test.

The heavy-slot wrapper was inspected and invoked for the first executed import
batch with `HEAVY_SLOTS=2`. It emitted sandbox-denied `sysctl`/`ps` diagnostics,
so its process/load readings cannot be claimed as verified resource evidence.
Disk readings were 217/216 GiB free and observed free memory was 64%. Subsequent
unit runs were serial, at most two Vitest workers and three named files per run;
Turbo build uses `--concurrency=2`. No database/browser process was started.

Final command results are recorded below; source inspection is distinct from
execution and same-model assistance is distinct from independent verification.

| Command | Actual result |
| --- | --- |
| `./node_modules/.bin/tsc -p packages/core/tsconfig.json --noEmit` | PASS, exit 0 |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0, including final recheck after added assertions |
| First executed import/activation batch below | FAIL, exit 1: 21 passed, 1 failed, numeric refinement fixed |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/job-import.test.ts src/activation-v3.test.ts` | PASS, exit 0: final 23 tests across 3 files (17:04:16 local) |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/imported-evidence-provenance.test.ts src/shadow-domain/signal.test.ts src/shadow-domain/attribution.test.ts` | PASS, exit 0: initial 30 tests, final 31 tests across 3 files (17:04:20 local) |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | FAIL, exit 1: core purity passes (232 TS files), lane self-comparison refusal before package lints |
| `pnpm lint:lanes` | FAIL, exit 1: same lane self-comparison refusal |
| `pnpm build --concurrency=2` | PASS, exit 0: 7/7 tasks, 2 cached; core/AI/DB/API/web executed. Existing CSS, Nest/file-type and workspace-root warnings; sandbox cache IO warnings. No browser journey claimed |
| `pnpm openapi:check` | BLOCKED/exit 1: tsx IPC pipe listen EPERM in sandbox before check |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator without tsx CLI IPC |
| `node tools/money-arithmetic-lint.mjs` | PASS, exit 0 |
| `node tools/commercial-boundary-lint.mjs` | PASS, exit 0 |
| Inline Node check using `loadLanePolicy`, `selectLane`, `lanePathAllowed` and `git ls-files --others --exclude-standard -z` | PASS, exit 0: selects only ch5-c, all 7 new paths permitted; static registration/path evidence only, not the full lane comparison |
| `git diff --check` | PASS, exit 0; untracked files additionally inspected |

## Acceptance mapping and remaining holds

CH5-C01: v1/v3 distinct and v1 source/tests unchanged; existing import/activation
regressions run. CH5-C02: unknown overrides, invalid IDs/hash/lifecycle/amounts,
unsafe pence and history references fail. CH5-C03: canonical snapshot hashing
covers source bindings, revisions, lifecycle, exact values/lines/wording/history.
CH5-C04: exact sums, unique source/scope identities, approved-result matching,
deep freeze and builder-attested baseline lineage. CH5-C05/06: microsecond and
nanosecond ordering, offset equivalence/calendar boundaries, equal/unknown holds,
no ambient clock and permanent exclusion through late upload/rediscovery.
CH5-C07: core purity checker and source inspection; no IO, DB, SDK, hidden-signal
or commercial-action module in the new implementations. CH5-C08: existing
small-job and shadow exclusion predicates reused. These are pure fixture/source
claims only, not a persisted imported-catch journey or positive fee entitlement.

Same-model read-only helper inspected the new contracts and suggested additional
calendar-boundary and history-only hash-binding assertions; those were added.
This is builder assistance, not either required independent Claude verdict.

| Hold | Disposition |
| --- | --- |
| H-ISSUE | Cleared for this CH5-C build by the issued user order; no downstream issue or merge authority |
| H-PURE-SPLIT | Cleared for build only; parent/source-design/contract-freeze acknowledgement remains held |
| H-REGISTRATION | Own exact lane file expressly permitted and follows existing shape; shared exports/CI registration remain coordinator-owned; full lane check held until commit |
| CH-1/CH-3a/SV-2/MON-1 formal prerequisite acceptance/integration | Retained for consumers/runtime; no dependency acceptance inferred from symbols |
| CH-1/MON-1 import-representation acknowledgement | Required before freezing this proposal for consumers; NOT GIVEN |
| H-MON1 | Actual transactional admission/grouping/grace/start/maximum and session interface held |
| H-IMPORT-BASELINE, H-SV5, H-SV6 | Imported source/Final Account/lock/attribution journey handoffs held |
| H-CH4, H-17OCT | Parent diary/source/timing authority holds retained; no intake change here |
| H-IDENTITY, H-D11 | Parent account-source/advisory policy holds retained; no integrity implementation here |
| H-REVIEW | Actual exact-head Claude A/B PASSes, required CI and separate actor's acceptance NOT PROVIDED |
| H-LIVE | Production import, enablement, real data/customers/providers/spending and release NOT AUTHORIZED |
| D01/D03/D09/D11/D12/D13 | Still pending approvals; reference terms/fixtures are not approval |
| Applicable G1/G2/G4-S/G5, D04/D06/D07 and route-specific residency/security approvals | Retained; no live provider capability introduced |

NOT RUN: clean install (installed dependencies reused by instruction), root
`pnpm test`, `pnpm test:db`, `pnpm test:migrations`, PostgreSQL suites/catalogue/
RLS/races/upgrade/restore, Playwright browser suites, native/device checks,
`pnpm eval`/approved-region live-model evaluation, provider integrations, CI and
independent reviews. No database, web, native or model/prompt behavior is changed
by this leaf. CI remains required on the dispatcher's eventual integrated head;
no CI URL, migration proof, browser trace, independent verdict or acceptance
artifact exists from this build. Whole CH-5 and DEMO-S remain incomplete.


## LATER items

Authority: issued CH5-C-v5-later order, 23 October 2026. Read every item in
`/Users/benharwood/.local/share/full-steam/jg-runs/v5-ch5-c-claude-A-ab1f6b30-20261023.md`
and `v5-ch5-c-claude-B-ab1f6b30-20261023.md`, their separate acceptance record
`v5-ch5-c-acceptance-ab1f6b30-20261023.md`, and
`jg-orders/next-wave/BEN-ANSWERS-20261023.md` under the same full-steam root.
Ben's safest-choice rule applies only to synthetic practice; all release gates
and source-owner/consumer acknowledgement holds remain. Six files in the current
allowlist changed; the coordinator-owned lane file and all v1 files are untouched.

One disposition per reviewer item (A/B numbers are the original review numbers):

- A1: safest-choice — compare half-open timestamp precision intervals; disjoint coarse-before intervals permanently exclude; overlap holds (`[LATER A1/B1/B11] orders disjoint coarse timestamp intervals without padding requirements`).
- A2: fixed — prior source/receive/contradiction drift gives a sticky hold, including restoration of original metadata (`[LATER A2/B2] metadata drift is a sticky hold, including clearing contradictions`).
- A3: safest-choice — intersecting mixed-precision ranges hold, including 500 ns after microsecond adoption (`[LATER A3] holds overlapping mixed precision intervals`).
- A4: fixed — mandatory nullable `holdReason` distinguishes all held outcomes (`[LATER A4/B3/B4] supplies deterministic hold reasons, including absent receive time`).
- A5: fixed — clock test now traps Date construction, Date.now and performance.now (`[CH5-C05] keeps one microsecond before, equivalent offsets and strictly after distinct without reading a clock`); scratch Date-constructor and performance-clock mutations both fail it.
- A6: safest-choice — sourceId denotes a source document/bundle, which may have distinct attachment/version originals; evidence IDs stay unique (`[LATER A6/B8] allows multiple originals per source but refuses duplicate originals`).
- A7: fixed — snapshot history is null or a validated instant; invalid text stays in original evidence, never a fabricated date (`[LATER A7/B9] rejects invalid historical time at the snapshot boundary`).
- A8: fixed — lowercase UUIDs before hashes/comparisons/uniqueness; safest-choice refuses nil identity (`[LATER A8] canonicalizes UUID case before hashing and duplicate detection`); authenticated CH5-A adoption remains its owner's work.
- A9: fixed — all public helper parse failures map to `ImportContractError/INVALID_IMPORT_CONTRACT` (`[LATER A9/B10] helpers throw typed import errors for malformed inputs`); direct schema parse remains Zod by contract.
- A10: safest-choice — preserve the specified internal GBP integer-pence shape and harmless -0 JSON normalization; no currency/policy expansion or money-formula change is warranted (existing `[CH5-C02] rejects public authority, money, cap, status and policy overrides` and `[CH5-C04] reconciles exact baseline and stable distinct line identities, deeply freezing parsed data`).
- A11: carried — CH5-E must verify byte length and source identity against the stored original; persistence/ingestion files are outside this pure leaf's allowlist. Documented caller obligation; not claimed implemented.
- A12: fixed — receipt now names accepted ab1f6b30, separates historical checks from this uncommitted diff, and records current read-only HEAD/lane evidence below; fresh exact-head review still required (metadata/source-inspected, no artificial receipt-content unit test).
- B1: safest-choice — interval ordering as A1, with coarse-before permanent exclusion (`[LATER A1/B1/B11] orders disjoint coarse timestamp intervals without padding requirements`).
- B2: fixed — sticky metadata-drift hold as A2 (`[LATER A2/B2] metadata drift is a sticky hold, including clearing contradictions`).
- B3: fixed — explicitly document missing/invalid receivedAt holds even known-before source; distinct missing/invalid reasons tested (`[LATER A4/B3/B4] supplies deterministic hold reasons, including absent receive time`).
- B4: fixed — typed hold reasons as A4 (`[LATER A4/B3/B4] supplies deterministic hold reasons, including absent receive time`).
- B5: fixed — local neutral JSON freezers and a literal existing policy identity remove shadow imports, with equality against the existing activation policy schema tested; no fee formula duplicated (`[LATER B5] CH5-C07 production import graph has no shadow, IO or command dependency`).
- B6: fixed — add `assertImportIntentV3`, binding fixture/lifecycle/party binding/full preview hash before approval (`[LATER B6] binds public intent to fixture, lifecycle, party binding and preview`); CH5-A must call it and authenticate path/session itself.
- B7: fixed — specify UTF-16 code-unit object-key order, UTF-8 canonical JSON digest input, exact strings and ordered arrays; SQL/jsonb/locale sorting cannot substitute (`[LATER B7] canonical hash preserves ordered arrays and exact strings across nested key reordering`; sorted-array mutation fails it). CH5-P/E SQL recomputation remains consumer-owned, not implemented here.
- B8: safest-choice — refuse repeated (objectVersionId, sha256) under any source/evidence IDs; CH5-E owns complete stored-object identity (`[LATER B8] refuses duplicate originals under distinct source and evidence identities`).
- B9: fixed — invalid/empty history strings rejected as A7 (`[LATER A7/B9] rejects invalid historical time at the snapshot boundary`).
- B10: fixed — typed helper parse errors as A9 (`[LATER A9/B10] helpers throw typed import errors for malformed inputs`).
- B11: fixed — no minimum fractional digit count; preserve supplied precision rather than demand/pad a fixed .US format (`[LATER A1/B1/B11] orders disjoint coarse timestamp intervals without padding requirements`).
- B12: carried — RED tag in `config/lanes/ch5-c.json` requires coordinator-owned registration edit, outside this follow-up allowlist. Acceptance already classifies CH5-C as RED; no tag change claimed.
- B13: fixed — accepted SHA and truthful session_record appended below; no runtime model/effort confirmation, new-head acceptance or CI invented (metadata/source-inspected, not a model review).

### Follow-up compatibility and test evidence

The two old held expectations for clearly-before second/millisecond source times
were replaced by explicit permanent-exclusion assertions in the A1/B1/B11 test,
exactly the behavior called wrong by both reviews. All equality, invalid-date,
unknown-offset, contradiction, nanosecond, prior-exclusion and v1 checks remain.
The other behavior changes are restricted to the listed LATER items. Hold reasons
are now required on result/prior v1 shapes; pre-consumer synthetic fixtures need
regeneration from authentic original history. Uppercase UUID snapshot hashes
normalize; previously accepted nil UUIDs/invalid history/duplicate originals fail.
No runtime data migration, provider call, operational alert or external action.

Final tests against accepted production sources in a private scratch copy:
11 failed / 13 passed (24 tests), proving the new defect regressions fail without
the fixes. Log: `/private/tmp/jg-ch5-c-later-final-red.log`. Earlier initial red run:
10 failed / 12 passed (22 tests). Date-constructor, performance.now and canonical
sorted-array mutations each fail their dedicated test (scratch only). A same-model
builder test run is not independent verification.

The first broad `vitest run --maxWorkers=2` discovered both source and build-output
tests: 6 failed / 5,922 passed, all six failures in compiled `dist` tests looking
for .ts sources. Five are existing out-of-lane compiled architecture checks; the
new architecture test now resolves back to src. No existing test was altered or
weakened. The explicit source-only run below tests all source suites, excluding
duplicate generated dist tests; the bare discovery failure is not claimed fixed.

Commands use the cached pnpm 10.28.1 wrapper described above; Node v24.17.0,
already-installed dependencies, no download/clean-install claim. Logs are under
`/private/tmp/jg-ch5-c-later-*.log`.

| Follow-up command | Actual result |
| --- | --- |
| `pnpm --filter @jobguard/core typecheck` | PASS, exit 0 (final source) |
| `pnpm --filter @jobguard/core lint` | PASS, exit 0; final root lint also includes package lint |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/job-import-v3.test.ts src/imported-evidence-provenance.test.ts` | PASS, 24/24 across 2 files |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 --exclude 'dist/**'` | PASS, 2,965 tests across 124 source files |
| `pnpm typecheck --concurrency=2` | PASS, exit 0 across all 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint --concurrency=2` | PASS, exit 0; root policy checks and all 7 package lints |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | PASS, exit 0; ch5-c merge-base comparison dc572123…ab1f6b30 plus working tree |
| `pnpm build --concurrency=2` | PASS, exit 0; 7 tasks, 2 cached; existing CSS/Nest/workspace-root/cache-IO warnings |
| `pnpm openapi:check` | BLOCKED, exit 1; tsx CLI IPC pipe listen EPERM before generation |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | PASS, exit 0; same generator without the CLI's IPC server |
| `git diff --check` | PASS, exit 0 |

No git write command was run. HEAD remains the accepted
`ab1f6b30cb9db8dac7693b57b9e5a7cfcc10a15a`; origin/main is still
`dc5721230fd8aedbf2d9d0457789074b66b48765`. The intended conventional commit
subject/body is in `/private/tmp/jg-msg-ch5-c.txt` for the dispatcher.

Database/browser/migrations suites remain CI-only per dispatcher: sandbox cannot
bind localhost or start PostgreSQL. No database, browser, native or provider proof
is claimed. No prompt/model change; no eval release claim. Prior PASS/acceptance
does not transfer to this working-tree candidate; dispatcher must commit, obtain
fresh exact-head verdict/acceptance and run integrated CI before consumers/merge.

### Session record (CODEX_SESSION_POLICY, adopted 21 October)

Read from the saved policy at
`/Users/benharwood/.local/share/full-steam/jg-runs/approved-saved-resumes-20261021T173036Z/CODEX_SESSION_POLICY.md`.
This block records the actual bounded follow-up; it does not claim verified
continuity with the original build session, runtime model metadata or cache savings.

```yaml
session_record_version: 1
task_id: CH5-C-LATER
project: JobGuard
role: builder
thread_id: 01a169bf-b5a0-7be2-b6d1-42152f6175c0
surface: unknown # current Codex conversation; hosting surface not independently exposed
host: local macOS sandbox
authorised_route_ref: user-issued CH5-C-v5-later order, 2026-10-23
repository: /Users/benharwood/Claude/Projects/my-new-project
integration_target: origin/main
integration_target_revision: dc5721230fd8aedbf2d9d0457789074b66b48765
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/ch5-c
branch: codex/sandbox/ch5-c
starting_base_revision: ab1f6b30cb9db8dac7693b57b9e5a7cfcc10a15a
source_pin: ab1f6b30cb9db8dac7693b57b9e5a7cfcc10a15a
candidate_revision: uncommitted working tree on ab1f6b30
last_validated_revision: uncommitted working tree on ab1f6b30
allowed_files_ref: config/lanes/ch5-c.json (six allowed follow-up files)
governing_contract_ref: AGENTS.md; BUILD_PLAN.md CH-5; docs/contracts/job-import-v3.md
model_requested: gpt-6.1-sol
effort_requested: medium
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
last_completed_turn: CH5-C LATER follow-up, 2026-10-23
last_receipt_ref: docs/verdicts/CH5-C/BUILDER_RECEIPT.md#later-items
state: working-tree handoff; awaiting dispatcher commit and fresh review
resumed_from_thread_id: unknown
successor_reason: original builder session mapping not supplied; explicit bounded follow-up issued in current thread
preflight_ref: clean read-only git status at ab1f6b30; CH5-C-v5-later; current allowlist
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: prior-head Claude A and B only
review_evidence_ref: v5-ch5-c-claude-A-ab1f6b30-20261023.md; v5-ch5-c-claude-B-ab1f6b30-20261023.md
accepting_actor: prior-head separate Claude checker only
acceptance_evidence_ref: v5-ch5-c-acceptance-ab1f6b30-20261023.md
outstanding_holds: fresh review/acceptance/CI; CH-1/MON-1 acknowledgement; CH5-E original binding; lane RED tag; all existing release gates
builder_finished_at: 2026-10-23T17:21:52.063132+00:00
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```
