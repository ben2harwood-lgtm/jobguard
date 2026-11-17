# M48-B1 builder receipt — 23 October 2026

**INCOMPLETE / HOLD. This is a quarantined persistence/access foundation, not the issued complete allocation slice. Do not accept or merge it as completed M48-B1.** No successful neutral distribution, review approval, replay or reversal is implemented. Both controlled routines refuse; `Promise<never>` in the repository makes that limitation explicit. Green local checks below do not change this status.

## Issuance and source

Read repository AGENTS.md in full, BUILD_PLAN §§10.3.1–10.3.2 and M4-8-S, the planning pack common contract §2 and complete M48-B1 draft at lines 2595–2690, its bridge/source handoff, the existing C0 source contract and receipt, and `~/.local/share/full-steam/jg-orders/next-wave/BEN-ANSWERS-20261023.md`. User's issued decision-74 build-ahead exception supersedes the draft BUILD dependency hold; dependency acceptance still gates MERGE. Ben alone merges. No approval, independent verdict, acceptance or release is inferred.

Initial tree clean. Branch `codex/sandbox/m48-b1`; base and unchanged HEAD `84b1e1fe1d3d89aa935fb4e7b0ed0afa08e20d04` (issued M48-C0 base). Integration target `origin/main`. No git writes, commit, push, branch operation, dependency installation, provider call, database startup or browser startup performed. No subagents/reviewer sessions were launched. Intended commit message is `/private/tmp/jg-msg-m48-b1.txt`.

`git grep` verified the existing named symbols: `RecoveryAllocationApplication`, `RecoveryAllocationRepository`, `RecoveryAllocationActor`, `PracticeAccess.job`, `VerifiedTenantContext`, `TenantTransaction`, `withTenant`, `PracticeFeedRepository.factsView/factsCommand`, `FinalAccountLockRepository.issueInvoice`, `UserCommandDispatcher.dispatch`, `recoveryReceiptFactsV1`, `mapRecoveryReceiptToLines`; existing `app.write_recovery_allocation`, `app.recovery_allocation_invoice_lines`, `app.lock_recovery_message_sources`, legacy `receipt_line_allocation` and composite final-account invoice bindings. C0's command/view/result/source schemas and types exist in `packages/core/src/receipt-line-allocation-source.ts`. `ReceiptLineAllocationQueryV1` is not an exported type alias (the runtime schema exists). The four named legacy PostgreSQL allocation tests and M4-8-S.spec.ts exist and are unchanged. F5 `receipt-12000`/`receipt-14640` sources exist in practice-facts; no fictitious deposit/interim command was added.

The proposed `RecoveryLineAllocationRepository`, `ReceiptLineAllocationApplication`, `RecoveryLineAllocationSourcePort` and `app.write_receipt_allocation_facts` were absent at base. These are proposed B1 deliverables, not evidence of a missing pre-existing implementation. Only the repository boundary and held SQL routines were added; the complete source port/application remain unimplemented.

## STOPs and holds

1. **STOP-SOURCE-AUTHORITY / H-M48-SOURCE-DESIGN:** C0's actual contract, lines 39/45, explicitly leaves the shared lock order, expiry/revocation, actor/source authority and cross-representation deduplication to an accepted handoff. That handoff is absent from the supplied base. The legacy adapter's `artifact`/`lineFacts` are private and case/legacy-eligibility-bound. They are not a public neutral source contract. This build does not fabricate a legacy approval, cash landing, whole-invoice catch case, source timestamp, empty current manifest or a successful watermark. The safest build-ahead behavior is a typed refusal until a checked source implementation is available. Positive persistence, current-source/reassessment serialization, successful replay and reversals remain STOPped. The absence of the proposed port name alone is not the blocker.
2. **STOP-CORE-EXPORT:** C0's schemas are not exported by `packages/core/src/index.ts` or a package subpath. Shared barrels/export maps are coordinator-owned. No duplicate full C0 schema, production deep import, untyped JSON success or barrel edit was introduced. Tests use test-only `vi.importActual` for this leaf's own repository, with a narrow test interface; this does not compose an API.
3. **STOP-PREDECESSOR-0210:** the actual base's latest migration is 0198. No 0210 file exists. Reserved 0211 is additive and sorted after 0210 when supplied, but the requested actual 0210 → 0211 upgrade cannot be certified. The upgrade test requires the real 0210 and does not skip or substitute 0198. It will fail that prerequisite on this base if CI runs it now.
4. **HOLD-SV5 / predecessor acceptance:** no accepted exact-head catch/reveal/disposition/invoice source handoff was supplied in this worktree. Existing composite invoice APIs are present; their presence is not accepted saved F5/F7 evidence. No reserved SV5 branch was opened or edited.
5. **HOLD-HTTP/UI:** the draft requires real Nest/Next/page composition. The application, controller, Next handlers, page and panel have not been built. Shared app/workspace/server exports, routes/navigation and source authority are unavailable for this slice; no new authentication route or cross-lane composition bypass was created. A real browser transport acceptance test was written and NOT RUN. It requires 401 JSON, not a permissive 404; with no composed route it is expected to fail, not count as acceptance. Saved IDs/reload/Jobs/second authorized context/accessibility/unknown-outcome UI coverage remains unwritten and held.
6. **HOLD-CI / review:** PostgreSQL, migration, catalogue, races and browser suites NOT RUN locally per order. No full acceptance coverage, full source-rule mutation proof, live integration, independent Claude A/B exact-head PASS or separate technical acceptance is claimed. D01–D16/G1–G5 and all production gates remain closed.

These are item-level holds; independent storage/access work and local diagnostics continued. This receipt does not claim that a dependency BUILD waiver supplies source authority or that safest-choice permission approves production financial policy.

## Changes and safest choices applied

- `config/lanes/m48-b1.json` was the first change; exact branch and finite allowlist, parent version-2 shape, no shared registry edits.
- `0211_receipt_line_source_bridge.sql` and same-stem `.md`: five empty additive command/review/revision/source/line tables; tenant/job-qualified keys and known-parent FKs, FORCE RLS, migration ownership and immutable mutation triggers. Runtime has no direct SELECT/INSERT/UPDATE/DELETE/TRUNCATE grant. The reviewed read/insert policies and cross-row integrity contract are deliberately not enabled. These are unused quarantined tables, not qualifying financial facts.
- Narrow SQL reader/writer grants: independent transaction-local tenant/session/current-owner/job checks, then `RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED` for **every** command/artifact. No business writes occur, hence no command/domain/audit effect is partially committed and no unaudited positive action exists. A future insert path must add atomic audit enforcement, not simply remove the hold.
- `RecoveryLineAllocationRepository` takes the existing server-selected environment and current actor/digest. Its independent wrapper uses genuine `withTenant`; the in-transaction read uses the caller's transaction, verifies its existing tenant/digest, and never installs a new tenant or practice digest. It returns no positive-use snapshot, including if a misconfigured database returns fabricated JSON. Unknown database exceptions propagate as unknown outcomes.
- Safest-choice decisions from Ben's answer: refuse unverifiable source/approval rather than save; current owner only; no guessed expiry/standing consent; no fractional case rewrite; no dual legacy/neutral counting; no hidden source reads or disclosure; no success/settled/qualifying/fee inference; no production capability. Exact per-item review approval remains required for eventual enablement. These build choices may be changed through reviewed synthetic work before real users.
- Four CI-only PostgreSQL files and one CI-only browser file added. No old test was changed. No shared catalogue, barrel, routine, navigation or old migration was modified.

## Acceptance coverage (all IDs remain incomplete)

| ID | Actual coverage written/run | Missing acceptance evidence |
|---|---|---|
| A1 | Local invalid identity/selector guards; CI forged-artifact refusal and no-effects assertions | Complete positive source set, omitted/swapped lines, ratio/time/hash/evidence binding and atomic save |
| A2 | Local environment/digest/actor guards and transaction authority refusal; CI actual grants/owner/RLS flags, DML/truncate denial, owner/wrong-session/wrong-job/forged-actor/revocation checks | Runtime successful checked write/read, complete tenant/FK adversarial and membership expiry cases |
| A3 | Local caller-transaction use, malformed expected watermark, held-success refusal, preservation of unknown DB errors; CI concurrent held approvals, no dependent write after held read and unchanged command/audit counts | Positive replay/payload/actor conflicts, approval/invalidation races, watermark mismatch and same-transaction source-change serialization proof, abort after successful domain writes |
| A4 | Existing SH-1/recovery arithmetic suites executed unchanged; CI held commands leave original money counts unchanged | New saved exact fractions, gross conservation and split/combined neutral-source proof |
| A5 | CI every reversal action/artifact refused with no original-money effect | Saved item-specific/pro-rata corrections, original lineage, deduplication/excess/foreign source and evidence-invalidation proofs |
| A6 | Local synthetic-only/current-source refusal; CI counts for new facts, customer money, legacy allocations and audit unchanged on held attempts | Successful factual-only save with all downstream financial effect inventories checked |
| A7 | Strict local query boundary; CI browser anonymous GET/POST 401 contract test written | Route/page implementation and complete required DB-backed browser journey; present browser test is an unfulfilled gate |
| A8 | CI explicit real-0210 prerequisite, named pre-existing rows/types/PKs before/after own migration alone, seeded-row guard, mutation/retype negative controls, successors + rerun, composite-FK checks | Actual 0210 source and all execution/catalogue results |

Tests were authored before their implementation. The initial red invocation did not execute tests because the pnpm launcher failed; no red-baseline test result is claimed. Three actual local mutation experiments removed the environment refusal, strict query refusal and current-source fallback hold, respectively. Each made the named unit file fail (exit 1); the original file was restored in `finally`. **The issued requirement that every acceptance rule has a proven rule-removal test is NOT satisfied.** These three guard mutations do not establish omitted positive financial acceptance rules. No fixture/parser/mock result is represented as PostgreSQL proof.

## Commands actually executed

Environment: Node v24.17.0; packageManager pin pnpm@10.28.1; installed TypeScript 5.8.3, Vitest 4.1.11, Next 15.5.27. Dependencies reused. No install or version-switch override was requested. The host pnpm launcher itself attempted its automatic version verification and refused the unavailable pin; subsequent checks used installed binaries directly. This is not a verified clean pinned pnpm install.

Heavy commands used `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot <label> ...`, serial within each batch, max two concurrent jobs, each Vitest invocation at most three files/two workers. Observed disk 202/200 GiB available and memory 70/63% free. Wrapper printed sandbox-denied sysctl/ps warnings; resource measurement therefore has that limitation. No local DB/browser suite was launched.

| Command (cwd where relevant) | Real result |
|---|---|
| `pwd`, `git status --short`, `git rev-parse HEAD`, `git branch --show-current`, `rg`/`git grep` and scoped document/source reads | Completed; clean initial tree and issued SHA/branch verified |
| `pnpm --version` | Exit 1: pinned pnpm registry signature/version could not be fetched/verified |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/receipt-line-allocation.application.test.ts` (red attempt and retry) | Both exit 1 before runner execution, same pnpm verification failure |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/receipt-line-allocation.application.test.ts` (apps/api) | Initial 9 tests passed; expanded 13 tests passed. Final restored-source rerun recorded below |
| `python3 /private/tmp/jg-m48-b1-mutations.py` | Exit 0 harness; environment/query/current-hold mutations each produced test exit 1 and original source restored |
| `./node_modules/.bin/vitest run --maxWorkers=2 src/recovery-allocation.test.ts src/receipt-allocation.test.ts src/receipt-line-allocation-source.test.ts` (packages/core) | Exit 0, 3 files / 93 tests passed |
| `./node_modules/.bin/tsc -p tsconfig.json --noEmit` in core/config/storage/ai/db/api/web | All seven exit 0. This is the exact compiler body used by each package's typecheck AND lint scripts; root Turbo wrappers were not claimed executed |
| `./node_modules/.bin/tsc -p tsconfig.json` in core/config/storage/ai/db; `./node_modules/.bin/nest build` in apps/api | All six exit 0 |
| `node --import tsx src/generate-openapi.ts --check` (apps/api) | Exit 0, existing OpenAPI unchanged; no new endpoint is registered |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | Exit 1 at lane check: inherited C0 paths outside B1. Core purity passed first (230 files; existing computed-import notices) |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 1 for inherited C0 paths: C0 lane, source contract, C0 receipt, C0 schema and tests |
| `LANE_BASE_REF=84b1e1fe1d3d89aa935fb4e7b0ed0afa08e20d04 node tools/agent-lane-boundary-lint.mjs` | Exit 1: tool refuses HEAD self-comparison. Not described as a pass |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0 |
| Direct `loadLanePolicy` / `lanePathAllowed` check over `git ls-files --others --exclude-standard` | Exit 0; all then-present 10 new files allowed. This is an inventory check, NOT replacement full lane lint |
| `git diff --check` | Exit 0 for tracked diff; untracked files separately inspected |

Direct-script validation harness and per-command compiler/build/OpenAPI logs: `/private/tmp/jg-m48-b1-local-checks.py`, `/private/tmp/jg-m48-b1-checks/`. Mutation logs are there too. They are local artifacts, not CI or independent verdict artifacts. Next build and final unit rerun completion are appended below. Root `pnpm typecheck/lint/build/openapi:check` orchestration is not claimed green. PostgreSQL, migrations, full test sweeps, browser, restore and live-model eval NOT RUN; no model/prompt change needs a new eval.

## Coordinator integration / later work

Do not enable financial writes by removing the hold. Supply the actual source/locking/expiry/revocation/deduplication contract and predecessor source, implement full C0 boundary parsing, artifact construction through SH-1 and independent SQL cross-row validation, bind exact Decisions, consume reviews durably and append audit atomically. Complete successful source reader/command outcomes, all adversarial acceptance tests and the real UI.

Coordinator catalogue additions required when storage is integrated: the five `app.receipt_allocation_fact_{command,review,revision,source,line}` business tables in tenancy/FORCE-RLS/role-owner/FK/immutability inventories; two runtime routine signatures in the controlled-routine privilege inventory and private scope-helper revoke inventory. No current SELECT policy should be recorded as a released readable source. Barrel/export integration eventually needs the exact C0 schemas/types and finished B1 port/repository, followed by API application/workspace/server/OpenAPI composition and Jobs navigation. Existing catalogues must be updated additively by their owner; no weakening or blanket exemption is authorized. Existing v1/allocation/race/upgrade and M4-8-S browser suites remain mandatory.

Migration/backward compatibility/operations: only unused additive storage and held routines; no backfill or legacy commercial modification. See same-stem migration note for forward fix/rollback. No new operational alerts or external routes enabled. The explicit handoff error is a refusal, not an unknown transport result; unknown DB failures remain unknown. Discovered later items are recorded here because BUILD_PLAN.md/shared operational files are outside this lane's allowlist.

Final exact commit/CI SHA and CI links are unavailable because the dispatcher commits after exit. Required independent Claude A and Claude B verdicts, a separate acceptance actor and Ben's merge remain outstanding. This builder never accepts its own work.

## Final local completion results

- Restored-source unit rerun: exit 0, **13/13 tests** passed. Three guard mutants failed before restoration as recorded above.
- Core allocator/C0 regression batch: exit 0, **93/93 tests** passed. Total focused local tests: 106 (not full test suite).
- `HEAVY_SLOTS=2 /Users/benharwood/.local/bin/heavy-slot m48-b1-web-build ./node_modules/.bin/next build` (apps/web): exit 0; generated 41 static pages and printed the existing route inventory. Warnings: workspace root inferred from multiple lockfiles, existing CSS `end` compatibility warnings, Nest `file-type` package-export warning and webpack warning serialization. No new receipt-line route exists in the build.
- Final working-tree inventory: **11 new files**, all permitted by this lane; no tracked-source modification, commit or push. This remains an inventory result, not a full lane-lint PASS against origin/main.
- M48-B1 stays **INCOMPLETE / HOLD**. Successful neutral money persistence and complete A1–A8 acceptance are outstanding; do not conflate the green compiler/build/guard checks with completion.

## r1 (catch-up + reviewer carries)

23 October 2026. Dispatcher-issued continuation on `codex/sandbox/m48-b1`, no PR,
commit or push. Initial tree clean. Actual preflight HEAD was
`acaad61e89401bf3f96c6c5e39b8d7c68d2e602c`, one dispatcher lane-assignment commit
above the issued `43412768` merge of accepted C0 `e55f1c69`. Read current AGENTS,
BUILD_PLAN M4-8-S / allocation contracts, the parent session policy, the accepted
C0 source contract, and these shared-workspace records in
`/Users/benharwood/.local/share/full-steam/`:

- `jg-runs/v5-m48-c0-acceptance-e55f1c69-20261023.md`;
- `jg-runs/v5-m48-c0-claude-A-e55f1c69-20261023.md`;
- `jg-runs/v5-m48-c0-claude-B-e55f1c69-20261023.md`;
- `jg-orders/next-wave/BEN-ANSWERS-20261023.md`.

**Dispatcher rulings supersede the historical STOPs above:**
STOP-PREDECESSOR-0210 is retired; 0210 belongs to unrelated MON1-A and is not a
prerequisite. The upgrade test now identifies this migration in actual discovery
order and asserts the actual preceding 0198 migration. Active migration notes
are corrected; earlier receipt references to a required real 0210 describe the
superseded order only. STOP-CORE-EXPORT is resolved by exactly one additive export
line, immediately after receipt-allocation in the core barrel. The dispatcher also
assigned the two C0 source/test files to this lane. No lane policy was changed by
this builder. STOP-SOURCE-AUTHORITY / H-M48-SOURCE-DESIGN and HTTP/UI remain HELD.
Both writer and reader still refuse with RECEIPT_LINE_SOURCE_HANDOFF_REQUIRED;
no actor authority, source lock order or clearance authority was invented.

Changes and rule-to-test inspection (PostgreSQL tests **written, NOT RUN**):

| Rule | Database defense | Named integration coverage |
|---|---|---|
| 1. Duplicate/case-variant allocation IDs | PostgreSQL UUID canonical output and tenant/ID primary key | B1-DB-1 checks lower-case output, exact/case duplicate refusal, named PK; transactional PK-removal control |
| 2. One payment's allocations cannot exceed receipt gross | SERIALIZABLE-only AFTER INSERT trigger, exact fraction sum bounded by customer_payment.amount_pence | B1-DB-2: 60+60 and 60+40.1 against 100 refused; 60+40 accepted; trigger-removal control; SSI race requires one 40001 and one commit |
| 3. Same line cannot be allocated twice at full gross | Positive historical sum bounded by immutable line gross across the same tenant/job/line identity, including different invoices | B1-DB-3: two payments, same/different invoice variants, trigger-removal controls |
| 4. No mixed tenants in a distribution | Tenant/job-qualified FKs; source also binds invoice, revision also binds payment | B1-DB-4: foreign-tenant line insertion refused; actual composite FK catalogue checked |
| 5. Reversal needs its original and cannot exceed it | Tenant/job original FK plus trigger requires matching positive original/payment/invoice/line and cumulative exact reversal capacity | B1-DB-5: missing original, -61 against 60, -40 then -21 refused; -40 then -20 accepted; excessive-reversal trigger-removal control |
| 6. Unsafe receipt cannot appear saved without a hold | Source/review/result CHECKs forbid every saved_distribution projection while source authority is held, including forged settled JSON | B1-DB-6: pending/unmatched/duplicate_held/reversed table inserts fail the named projection CHECK; held projection allowed by predicate; claimed settled remains refused |

I inspected each negative case against its enforcing database rule and checked
that capacity failures assert the specific error, duplicates the named PK, and
unsafe projections the named CHECK. Exact-valid controls avoid a blanket-denial
money test. Guard-removal controls were authored for UUID uniqueness and each
positive/reversal capacity boundary, but **neither PostgreSQL assertions nor
PostgreSQL removal controls were executed here**. FK and trigger original checks
are intentionally redundant. No parser or mocked test is offered as database
proof. Parent identity/commercial/source parents are explicitly synthetic fixture
rows, seeded with predecessor triggers/FKs bypassed only during setup; tested line
inserts use origin triggers and real FKs/checks. Removal controls roll back DDL and
invalid rows in savepoints. The concurrency test uses committed disposable
fixture parents and real PostgreSQL SERIALIZABLE transactions.

The storage isolation precondition is not an accepted shared source lock order.
SSI predicate reads must reject write skew; production/source enablement still
requires its own reviewed handoff, authorization, retry/unknown-outcome handling
and atomic audit. Reversals do not silently reopen historical positive capacity.
Wide fraction overflow rejects rather than rounds. No network or business effect
was enabled. These guards are invoker routines with no runtime grant; RLS/grants,
immutability and the existing held routines are preserved.

**C0 reviewer carry / safest choice:** canonicalize every UUID before comparisons
and eventual hashing; mixed-case self reversal is refused. Receipt rows still
require evidence. Reversal rows may retain an empty evidence list, preserving the
negative fact rather than dropping the reversal and retaining positive cash.
Every reversal forces source_held in the view status, and snapshots require
REVERSED_MOVEMENT. Evidence alone does not clear reversed cash; no clearance
contract exists, so no reversal is automatically released. This applies Ben's
"do not count, rather than count" choice on synthetic data only. A reviewed
clearance contract can replace this choice later. No existing test assertion was
weakened. Cross-row conservation and receipt-state truth remain database/server
obligations, not promises made by the standalone core parser.

Core rule-removal check actually executed in a scratch copy:
`python3 /private/tmp/jg-m48-b1-r1-mutations.py`. Six single mutants each exited 1
with AssertionError: UUID canonicalization removed, self-reversal check removed,
receipt evidence check removed, reversal evidence made mandatory again, reversal
status hold removed, and snapshot reversal hold removed. Original worktree source
was never mutated by this harness. Each new core guard/change therefore has a
checked test failure when removed/reverted. Scratch path:
`/private/tmp/jg-m48-b1-r1-mutants-fkcl757x`; individual logs use
`/private/tmp/jg-m48-b1-r1-mutant-*.log`.

Commands actually run this round, with existing installed dependencies only:
`python3 /private/tmp/jg-m48-b1-r1-checks.py` used the cached exact pnpm 10.28.1
launcher via the existing `/private/tmp/jg-m48-c0-r1-bin/pnpm`,
COREPACK_ENABLE_NETWORK=0 and LANE_BASE_REF=origin/main. This was dependency reuse,
not a clean install. Node v24.17.0, installed Vitest 4.1.11.

| Command | Actual result |
|---|---|
| pnpm --filter @jobguard/core typecheck; pnpm --filter @jobguard/db typecheck | Both PASS |
| pnpm --filter @jobguard/core lint; pnpm --filter @jobguard/db lint | Both PASS (package compiler lint) |
| pnpm typecheck --concurrency=1 | PASS across all 7 packages |
| LANE_BASE_REF=origin/main pnpm lint --concurrency=1 | FAIL at lane boundary after core purity passed: inherited C0 lane JSON, C0 contract doc, C0 builder receipt outside B1 allowlist |
| LANE_BASE_REF=origin/main pnpm lint:lanes | Same three inherited-path failures; not a pass and no scope exemption added |
| pnpm --filter @jobguard/core exec vitest run --maxWorkers=2 src/receipt-line-allocation-source.test.ts src/recovery-allocation.test.ts src/receipt-allocation.test.ts | PASS, 3 files / 105 tests |
| pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/receipt-line-allocation.application.test.ts | PASS, 13 tests |
| pnpm build --concurrency=1 | PASS across all 7 packages, including Next production build |
| pnpm openapi:check | FAIL before generator: tsx IPC pipe listen EPERM in sandbox |
| node --import tsx src/generate-openapi.ts --check (apps/api) | PASS, direct equivalent check without tsx CLI IPC listener |
| tsc -p /private/tmp/jg-m48-b1-r1-tests.tsconfig.json | PASS, explicit compilation of all four B1 integration files and their imports; no database execution |
| node tools/money-arithmetic-lint.mjs; node tools/commercial-boundary-lint.mjs | Both PASS |
| git diff --check | PASS |

Logs: `/private/tmp/jg-m48-b1-r1-*.log`. An early focused run caught an overly broad
parser change that conflicted with C0's existing unmatched-receipt parser test;
the change was removed and the existing assertion preserved. The final 118-test
batch above passed. Database state validation stays in the held database boundary.
PostgreSQL, migrations, browser, full repository test sweeps, restore and live-model
checks NOT RUN. No model/prompt was changed. Standard root lint and standard
OpenAPI orchestration are not claimed green. Exact-head CI must run database,
migration/catalogue/race/browser gates after dispatcher push. No independent
review, acceptance or release evidence is generated by this receipt.

Migration/backwards compatibility: unused additive 0211 storage only, no backfill
or legacy commercial-row rewrite. Forward fix/rollback is in the same-stem
migration note. A future writer must preserve these guards and obtain the held
source/authorization/audit handoff; removing the refusal alone remains unsafe.
No new operational alert, provider destination, external action or UI route.
Coordinator-owned catalogue additions remain outstanding. C0 contract prose about
mandatory evidence on every row is superseded for reversals by this explicit
issued carry; its document path is outside this round's B1 lane.

Session record (same bounded task; no new agent/reviewer session was launched):

```yaml
session_record_version: 1
task_id: M48-B1
project: JobGuard
role: builder
thread_id: unknown
surface: unknown
host: local sandbox
authorised_route_ref: dispatcher user continuation, 23 October 2026
repository: /Users/benharwood/Claude/Projects/my-new-project
integration_target: origin/main
integration_target_revision: dc5721230fd8aedbf2d9d0457789074b66b48765
worktree: /Users/benharwood/Claude/Projects/my-new-project/.worktrees/m48-b1
branch: codex/sandbox/m48-b1
starting_base_revision: acaad61e89401bf3f96c6c5e39b8d7c68d2e602c
source_pin: e55f1c6982b8e90d15101c95593fa5f00c78cca2
candidate_revision: uncommitted working tree
last_validated_revision: uncommitted working tree
allowed_files_ref: config/lanes/m48-b1.json plus dispatcher carry order
governing_contract_ref: AGENTS.md; BUILD_PLAN.md M4-8-S; C0 source contract
model_requested: Codex gpt-6.1-sol
effort_requested: medium
model_runtime_confirmed: unknown
effort_runtime_confirmed: unknown
runtime_confirmation_ref: unknown
last_completed_turn: r1 catch-up and reviewer carries
last_receipt_ref: docs/verdicts/M48-B1/BUILDER_RECEIPT.md
state: builder handoff; parent HOLD
resumed_from_thread_id: unknown
successor_reason: none declared
preflight_ref: r1 section above
result_id: unknown
acknowledgement_ref: unknown
ci_evidence_ref: unknown
reviewer: pending independent reviewers
review_evidence_ref: unknown
accepting_actor: pending separate actor
acceptance_evidence_ref: unknown
outstanding_holds: source authority/design; HTTP/UI; CI; independent review/acceptance
builder_finished_at: 2026-10-23
coordinator_acknowledged_at: unknown
integrated_at: unknown
merged_revision: unknown
```

Token/cache usage fields and their source counters are unavailable in this
surface: unknown, not zero. No quota/cache benefit is claimed. Requested versus
runtime-confirmed model/effort remain separate. The dispatcher commits after exit;
intended message is `/private/tmp/jg-msg-m48-b1.txt`. **M48-B1 remains INCOMPLETE /
HOLD pending positive-source work, PostgreSQL evidence and independent acceptance.**


## r2 — scoped repair (23 October 2026)

Base HEAD `005b8bba`, target `origin/main`. Working-tree changes only; dispatcher owns commit/push. Existing HOLD status and exact-head independent review/acceptance requirements remain. No dependency downloads, git writes, SQL changes, new authority or commercial policy changes.

- Moved the 0211 note unchanged to `packages/db/migration-notes/0211_receipt_line_source_bridge.md`. Lane lists the destination and retains the old path because local lane lint checks deleted paths too. All entries remaining in migrations match the SQL filename contract.
- Kept the original B1-DB-1 primary-key rejection assertion exactly. For both UUID case variants, temporarily remove only the primary key and assert the tenant/job unique key also rejects the duplicate; rollback restores DDL. The self-FK and every production guard remain intact.
- Withheld `apps/web/e2e/M48-SOURCE-BRIDGE.spec.ts` until its route exists. Exact original content is in `/private/tmp/jg-pr-m48-b1.md`, ready for the dispatcher PR description. No browser success is claimed.

0211 SQL SHA-256 remains `f0c93fd5f791b34b0b3dde541c1a183c4d9fb249539b413bcb40cc63284d42c9`; a byte comparison against HEAD passed. No backfill, new alerts or compatibility changes. No new migration number.

Installed dependencies reused with Node 24.17.0 and cached pnpm 10.28.1 via `/private/tmp/jg-m48-c0-r1-bin`; `COREPACK_ENABLE_NETWORK=0`. Logs and runner scripts: `/private/tmp/jg-m48-b1-r2-checks/`. This was not a clean install. Commands actually run:

| Command | Result |
|---|---|
| `pnpm typecheck` | Exit 0, seven packages |
| `LANE_BASE_REF=origin/main pnpm lint` | Exit 1 after core purity passed; inherited C0 lane JSON, C0 contract doc and C0 receipt outside B1 lane |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | Exit 1, same three inherited paths. Final reruns have no repair-path violations; no cross-lane exemption added |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0, seven package compiler lint tasks |
| `node --test tools/*.test.mjs` (shell glob expanded by runner) | Exit 0, 122 tests |
| `pnpm exec turbo run test --filter='!@jobguard/db' --concurrency=1` | Exit 1: core discovered compiled dist tests as well as source; five compiled source-inspection tests fail ENOENT. 5921 core tests passed. Subsequent tasks cancelled by Turbo; not a full pass |
| `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 --testTimeout=30000 --exclude '**/dist/**'` | Source suites exit 0: core 123 files/2963 tests; config 4/41; storage 1/2; AI 15/147; web 40/867. AI uses recorded synthetic fixtures, not a live-model evaluation |
| Same source command for API, with `src` selector | Exit 1: 119 files passed, 10 failed; 2085 tests passed, 130 failed, 23 skipped, 129 errors. Local HTTP listeners fail EPERM; two isolation fixtures fail free-port setup. Also existing `auth/context-boundary.test.ts` flags 13 uses in the unchanged B1 repository. This is an additional recorded failure, not repaired or waived |
| `pnpm --filter @jobguard/api exec vitest run --maxWorkers=2 src/receipt-line-allocation.application.test.ts` | Exit 0, 13 tests |
| `pnpm build --concurrency=1` | Exit 0, all seven packages including production Next build; existing webpack/CSS warnings retained |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener EPERM; repeated with same result |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | Exit 0, equivalent contract generation check without CLI IPC listener |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-m48-b1-r1-tests.tsconfig.json` | Exit 0, all four B1 integration files compile; no database execution |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0 |
| `git diff --check`; SQL/note byte comparison; withheld-spec verbatim comparison | All exit 0 |

Initial overlapping source/package-lint attempts were interrupted after timeout failures under high system load; final completed commands above supersede them. Two supplemental DB unit attempts were also interrupted; no DB unit pass is claimed. An initial DB selector excluded TypeScript integration files but could discover compiled copies; it was stopped and corrected to exclude all integration extensions and dist. No PostgreSQL guarantee was executed or proven here. Root `pnpm test`, database/migration suites and browser suites were not run. API's broad source run did reach existing isolation setup, which failed before a database could start. These remain CI responsibilities after dispatcher push. No live providers or professional sign-off.

Intended conventional commit message: `/private/tmp/jg-msg-m48-b1.txt`. Dispatcher PR text with the withheld file: `/private/tmp/jg-pr-m48-b1.md`. All previous source/HTTP/UI/CI/production holds remain; no self-acceptance or independent verdict is asserted.

## Review-repair round 2 — C236 tenant-context port (24 October order)

Working-tree repair over candidate `e50ce8e1`; no commit, push, technical acceptance or independent verdict is asserted. The verified tenant context now travels whole as its own argument through `readCurrentInTransaction` and the private scope check. Actor and session digest travel separately. Updated the API test port/calls and the one PostgreSQL caller; retained every existing assertion. No context-boundary guard/test changes or exemptions.

Preserved round-1 work: moved migration note, byte-identical 0211 SQL (SHA-256 `f0c93fd5f791b34b0b3dde541c1a183c4d9fb249539b413bcb40cc63284d42c9`), withheld e2e spec and B1-DB-1 control. Protected paths compare unchanged against HEAD; repository SQL/string literals also compare unchanged. No migration, backfill, policy change, external action, new alert or production capability. Internal transaction-port callers must use the new separate arguments; all discovered callers updated.

Checks actually run in this sandbox using installed Node 24.17.0 and cached pnpm 10.28.1 (network disabled); detailed logs: `/private/tmp/jg-m48-b1-final-r2/`:

| Command | Result |
|---|---|
| `pnpm --filter api exec vitest run --maxWorkers=2 src/auth/context-boundary.test.ts src/receipt-line-allocation.application.test.ts` | Exit 0: 2 files, 158 tests. Unchanged real-repository tenant-context guard passes with zero violations |
| `VITEST_MAX_WORKERS=2 pnpm --filter api test` | Exit 1: 120 files passed, 9 failed; 2086 tests passed, 129 failed, 23 skipped; 129 errors. Failures are sandbox listener/free-port EPERM. The first default-concurrency attempt was interrupted after listener failures and a timeout; the completed bounded run supersedes it. OpenAPI script after `&&` was not reached |
| `pnpm typecheck` | Exit 0: all 7 package tasks (2 cached) |
| `LANE_BASE_REF=origin/main pnpm lint`; same environment `pnpm lint:lanes` | Both exit 1 solely on inherited C0 paths: `config/lanes/m48-c0.json`, `docs/contracts/receipt-line-allocation-source-v1.md`, `docs/verdicts/M48-C0/BUILDER_RECEIPT.md`. M48-C0 is not merged. No workaround/exemption added |
| `pnpm exec turbo run lint --concurrency=1` | Exit 0: all 7 package tasks (2 cached) |
| `node tools/money-arithmetic-lint.mjs`; `node tools/commercial-boundary-lint.mjs` | Both exit 0 |
| `node --test tools/*.test.mjs` (glob expanded by runner) | Exit 0: 122 tests |
| `pnpm --filter @jobguard/<package> exec vitest run --maxWorkers=2 --testTimeout=30000 --exclude '**/dist/**'` | Exit 0 for core (123 files/2963 tests), config (4/41), storage (1/2), AI (15/147), web (40/867). AI uses recorded fixtures, not a live model |
| Same source unit command for DB with `--exclude '**/*.integration.*'` | Exit 1: 47 files passed, 1 failed; 422 tests passed, 2 free-port tests failed on listener EPERM. No PostgreSQL started |
| `node node_modules/typescript/bin/tsc -p /private/tmp/jg-m48-b1-r1-tests.tsconfig.json` | Exit 0: all four B1 PostgreSQL integration test files compile; no database execution |
| `pnpm build --concurrency=1` | Exit 0: all 7 packages (4 cached), including production Next build. Existing build warnings retained |
| `pnpm openapi:check` | Exit 1: tsx CLI IPC listener EPERM |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | Exit 0: same generator/check without CLI IPC listener |
| `git diff --check`; preservation comparisons | Exit 0 |

Root `pnpm test` was not run because it includes PostgreSQL integration suites; package source units and tooling were run as recorded above. Database/migration and browser suites remain GitHub CI responsibilities after dispatcher push. Source authority and every prior release/acceptance hold remain in force. The C236 repair is source-inspected and locally test-executed to the limits above, not independently verified or self-accepted. Dispatcher commit message: `/private/tmp/jg-msg-m48-b1.txt`.
