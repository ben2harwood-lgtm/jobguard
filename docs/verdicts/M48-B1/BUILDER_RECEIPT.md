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
