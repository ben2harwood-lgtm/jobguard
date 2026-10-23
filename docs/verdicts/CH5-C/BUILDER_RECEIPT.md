# CH5-C builder receipt — 23 October 2026

Status: BUILD ONLY; uncommitted working-tree proposal. No independent verdict,
technical acceptance, merge, push, enablement or parent CH-5 completion is claimed.

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
