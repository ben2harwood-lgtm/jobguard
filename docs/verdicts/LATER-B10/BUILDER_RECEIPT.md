Built by Codex; dispatched 13 Oct 2026; queue-filled 16 Oct 2026.

# LATER-B10 — Builder receipt

Implementation prepared; validation incomplete; PARK under decision 74. No acceptance or independent verdict is claimed. The requested template's Claude attribution is inaccurate for this run; the first line records the actual builder.

## Scope and base verification

- Branch/worktree: `codex/sandbox/later-b10`, `/Users/benharwood/Claude/Projects/my-new-project/.worktrees/later-b10`.
- Initial and final builder HEAD: `31682762c903d716657c573e1b5deae63588aad7`. No commit, index change, push, merge, fetch, checkout, reset or deletion was performed.
- Initially `origin/main` equalled HEAD. It advanced externally to `4c407a6c81bd714a6875b7adf995812381d0fe57` during work (MON-1B merge). The named source files, AGENTS.md, BUILD_PLAN.md and contractor session test have no differences between those two heads. No rebase or integration was attempted. Dispatcher owns catch-up and commit.
- Both order bases (`ca435eeb5791638c787c830d6ba717146f694539`, `0bbb5ddb`) are stale. Current main wins. C5 remains at BUILD_PLAN.md:117; ENT-3 remains at :795 with retries at :814–817. The draft's `contractor-session test:205` no longer locates the cited concurrency coverage: `contractor-session-context.integration.test.ts` has 51 lines, and the same-session concurrent start example is `contractor.integration.test.ts:43`. L037 adds coverage in a new file; neither merged test changes.
- L034 maps to `readReplay` at the original `site-extra-pricing-queries.ts:42–47`. L035 maps to the original authority/lifecycle check at `site-extra-repository.ts:47–65` and its call at :157. L036 maps to the original live-job check at `site-visit-repository.ts:106–111` before the receipt claim at :115.
- Added this task's own `config/lanes/later-b10.json`, as named by the order and permitted by the self-service rule at `tools/agent-lane-boundary-lint.mjs:22–37`. No shared registration or pinned list changed. Initial inspection found this file absent; that was not a coordinator prerequisite.
- No UI, route, external adapter, prompt, money formula, role policy, shared command harness, merged test, fingerprint or security pin changed. No real data or external action was used.

## Changes and acceptance coverage

Tests were written first, in one patch adding the two files, before the implementation patch. Both files are PostgreSQL suites and were NOT RUN under the explicit sandbox instruction. There is no executed first failing run to report.

| ID | New test title and implementation | Evidence status |
| --- | --- | --- |
| L034 | `[L034] pricing projection cannot mix receipt and revision snapshots with an intervening writer`: real reader SQL, then a real priced command commits before any next reader statement. Asserts the before snapshot has neither receipt nor revision and the after snapshot has both. `readReplay` now uses one SQL statement. | Source inspected; PostgreSQL NOT RUN. |
| L035 | `[L035] exact prior command replays after visit closes (%s); changed and fresh commands refuse`: plain and photo/confirmation variants; original result after visit closure and job leaving live; note/description/visit/photo/confirmation changes conflict; fresh closed commands refuse; counts, visit rows and audit count remain unchanged on replay. | Source inspected; PostgreSQL NOT RUN. |
| L035 | `[L035] current authority precedes receipt disclosure for closed, live, foreign and unknown jobs`: revoked caller cannot obtain the receipt; status/body/code checked for live/foreign/unknown targets and typed refusal after closure. | Source inspected; PostgreSQL NOT RUN. |
| L036 | `[L036] exact visit command replays after job ceases to be live; changed and fresh commands refuse without effects`: original start/completion results and times, changed answer/type conflict, no fresh closed command, no extra visit/receipt/audit. | Source inspected; PostgreSQL NOT RUN. |
| L036 | `[L036] revoked caller still refuses identical start and completion replays without receipt disclosure`: authority precedes receipt and lifecycle reads for both command types. | Source inspected; PostgreSQL NOT RUN. |
| L037 | `[L037] concurrent start checks every returned session and tenant, new identities, isolation and revocation`: three new sessions started twice each; all six results inspected; every new identity revoked and all six results checked again. | Added coverage only; this test may pass on main. No production change was required for L037. PostgreSQL NOT RUN. |

The site replay file declares six cases after expanding the two-row parameterization; the contractor start file declares one case (seven total). These are declared counts, not executed counts. No test freezes shared source bytes or hashes.

## Authorization, integrity and compatibility notes

- Extra replay takes the existing shared tenant administration lock, authenticates current membership and calls the existing extra authority routine before reading a receipt. It checks command type, actor, job, success, exact request hash and result identity. The stored original grant binds the request; it does not grant current authority. Replays bypass lifecycle guards only after exact identity/content matching. Fresh commands retain both prechecks and existing transactional seams.
- Visit replay retains the shared authority lock and current authority/visit ownership checks. It validates type, semantic key, hash, actor, success and result schema before returning stored data. Fresh commands still check live status before claiming a receipt or invoking a writer; the concurrent claim path and its authority recheck remain.
- Pricing reads receipt existence and revision identity/hash in one READ COMMITTED statement snapshot. Existing projection fields and error schemas remain unchanged; no money column is added to the projection.
- Invariants affected: AGENTS §§5.1, 5.3, 5.4, 5.7, 5.8; C5 replay/conflict and current authority; ENT-3 durable origin identity. Same payload retains original result/timestamps; changed payload retains typed conflict behavior. Production behavior has not been verified.
- New GRANTs: **none**. Standard F: no new direct INSERT/UPDATE/DELETE grant to `jobguard_runtime`, no new table or controlled routine. Existing checked writers remain unchanged; replay additions are SELECTs and the existing shared advisory lock only.
- Migrations/backfill/rollback: none. Reverting this code would restore the prior lifecycle-before-replay behavior; no data transformation is needed. No new alert, credential, provider destination or operational service is introduced.

## Checks and STOP

| Check | Result |
| --- | --- |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | Exit 0; task lane selected, changed tracked and untracked paths checked. Repeated after docs to include the complete handoff. |
| `git diff --check` | Exit 0; no whitespace errors in tracked changes. New text files also inspected for trailing whitespace. |
| TypeScript parser, five changed/new `.ts` files | Exit 0; five parsed, zero syntax diagnostics. This is neither typecheck nor test execution. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | NOT RUN: disk STOP below. |
| `pnpm exec turbo run lint --force --concurrency=2` | NOT RUN: disk STOP below. |
| `pnpm build --force --concurrency=2` | NOT RUN: disk STOP below. No cache-hit green claimed. |
| `pnpm openapi:check` | NOT RUN: resource STOP; tsx's IPC socket also conflicts with the sandbox's no-socket constraint. No API/OpenAPI change. |
| `pnpm lint:lanes` wrapper | The underlying script was run directly with the required base, as shown above; wrapper not separately run. |
| `packages/db/test/later-site-replay.integration.test.ts` | NOT RUN (cannot start PostgreSQL here, per dispatcher). |
| `packages/db/test/later-contractor-start.integration.test.ts` | NOT RUN (cannot start PostgreSQL here, per dispatcher). |
| Full `pnpm test`, `pnpm test:db`, `pnpm test:migrations` | NOT RUN: full suites excluded in this sandbox; PostgreSQL/socket and memory limits. Dispatcher/CI own them. |
| `pnpm test:e2e`, browser/Playwright | NOT RUN: expressly prohibited; CI only. No web workflow changed. |
| `pnpm eval`, native suites | NOT RUN: no AI/native change; inapplicable to this piece. |

**STOP — resource floor.** `memory_pressure | tail -1` returned `System-wide memory free percentage: 81%`. `df -g /System/Volumes/Data` returned 44 available 1G-blocks, below the binding greater-than-45-GB floor. No heavy command was launched after that observation. No cleanup/deletion was attempted. The forced checks and executed acceptance remain pending. No permission/safety approval rejection occurred; this is the order's resource stop.

No coordinator-owned assertion, list, pin or fingerprint needs changing for the implementation. No BLOCKING policy question was encountered. There is therefore no stopped source line with a proposed weaker before/after assertion. Remaining release gates are CI evidence, the two independent RED verdicts on the dispatcher-created exact commit, separate acceptance and Ben's button; this branch remains PARKED.

## Builder self-check (not an independent review)

- Inspected the diff for authority-before-receipt ordering, exact actor/payload/result binding, immutable stored responses, lifecycle guards on fresh writes, and the unchanged final audit ordering.
- Checked both new files use only fictional generated data and merged fixture/command helpers. The pricing interleaving wraps real SQL; it does not fake a database result. No existing expectation was removed or relaxed.
- Test execution and semantic typechecking are missing evidence, not a pass. L037 is stronger added regression coverage, not evidence of a newly fixed implementation defect.
- No independent reviewer was impersonated or acceptance recorded. Builder self-check does not satisfy RED review.

## Shell-command record

Read-only inspection commands below were executed in order. `&&` stops on the first nonzero command; a failed search is not a permission rejection. File edits used `apply_patch`; those calls succeeded and did not execute shell commands.

1. `pwd && git status --short && git branch --show-current && git rev-parse HEAD origin/main && cat AGENTS.md && cat config/lanes/later-b10.json` — exit 1 (named lane initially absent); clean initial tree.
2. `sed -n '80,135p' BUILD_PLAN.md && sed -n '770,840p' BUILD_PLAN.md && cat packages/db/src/site-extra-pricing-queries.ts && cat packages/db/src/site-extra-repository.ts && cat packages/db/src/site-visit-repository.ts` — exit 0.
3. `cat ~/.local/share/full-steam/handoffs/jobguard-task.md && cat package.json && cat packages/db/package.json && rg --files packages/db/test | rg '(site-extra|site-visit|contractor-session|contractor-start|later-site|later-contractor)' && cat tools/agent-lane-boundary-lint.mjs` — exit 0.
4. `cat packages/db/src/site-extra-pricing-queries.ts && cat packages/db/src/site-extra-repository.ts && cat packages/db/src/site-visit-repository.ts` — exit 0.
5. `cat package.json && cat packages/db/package.json && rg --files packages/db/test | rg '(site-extra|site-visit|contractor-session|contractor-start|later-site|later-contractor)' && cat ~/.local/share/full-steam/handoffs/jobguard-task.md` — exit 0.
6. `nl -ba packages/db/src/site-extra-repository.ts | sed -n '175,330p'` — exit 0.
7. `nl -ba packages/db/src/site-visit-repository.ts | sed -n '1,165p'` — exit 0.
8. `cat packages/db/test/site-extra-pricing-fixtures.ts && cat packages/db/test/site-visit-fixtures.ts && cat packages/db/test/site-extra-visit.integration.test.ts` — exit 0.
9. `sed -n '1,285p' packages/db/test/contractor-session-context.integration.test.ts && rg -n 'later-b10|self-review|receipt' config/agent-lane-assignments.json config/lanes tools/lint.mjs && cat packages/db/tsconfig.json` — exit 0.
10. `sed -n '63,161p' packages/db/src/site-visit-repository.ts && sed -n '145,181p' packages/db/src/site-extra-repository.ts && cat packages/db/test/site-extra-visit.integration.test.ts` — exit 0.
11. `cat packages/db/test/site-extra-pricing-fixtures.ts && cat packages/db/test/site-visit-fixtures.ts` — exit 0.
12. `sed -n '1,95p' packages/db/test/contractor-session-context.integration.test.ts && sed -n '170,275p' packages/db/test/contractor-session-context.integration.test.ts && rg -n 'site-extra|site-visit' apps/api/src/auth/context-boundary.test.ts packages/db/test/*test.ts | head -45 && sed -n '1,115p' packages/db/src/extra-repository.ts && rg -n 'replay|claim|raiseExtra|advisory' packages/db/src/extra-repository.ts` — exit 0.
13. `rg -n 'raiseExtraV1|uuid|grantId' packages/core/src/extra-persistence.ts && cat packages/db/src/contractor-session-context.ts && rg -n 'startPractice|revoke|practiceSession' packages/db/src/contractor-repository.ts packages/db/test/contractor*.test.ts && sed -n '1,160p' packages/db/test/site-extra-fixtures.ts && sed -n '1,70p' tools/lint.mjs && rg -n 'session|concurrent' packages/db/test/contractor.integration.test.ts` — exit 0.
14. `sed -n '1,85p' packages/db/src/contractor-repository.ts && sed -n '1,58p' packages/db/test/contractor.integration.test.ts && sed -n '1,55p' packages/db/test/extra-fixtures.ts && sed -n '1,80p' packages/db/test/site-extra-evidence-fixtures.ts && rg -n 'site-extra-repository|site-visit-repository|site-extra-pricing-queries' apps/api/src/auth/context-boundary.test.ts && node --version` — exit 1 (no match for these three filenames in the pin test; the last version command was not reached).
15. `git diff --stat && git diff --check && rg -n 'site-extra-repository|site-visit-repository|site-extra-pricing-queries|contractor-session-context' apps/api/src/auth/context-boundary.test.ts && memory_pressure | tail -1 && df -g /System/Volumes/Data` — exit 0; resource STOP above.
16. `cat apps/api/package.json && sed -n '1,75p' tools/agent-lane-boundary-lint.mjs && sed -n '1,50p' packages/db/test/extra-fixtures.ts && git status --short && git diff -- packages/db/src/site-extra-repository.ts packages/db/src/site-visit-repository.ts packages/db/src/site-extra-pricing-queries.ts` — exit 0.
17. `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — exit 0; six changed paths then present.
18. `git diff --check && node --version && git rev-parse HEAD origin/main && git status --short && rg -n 'self-comparison|checks the job is live|precheck\(|readReplay|Retries:|Replay the same command ID|### ENT-3' tools/agent-lane-boundary-lint.mjs BUILD_PLAN.md packages/db/src/site-extra-pricing-queries.ts packages/db/src/site-extra-repository.ts packages/db/src/site-visit-repository.ts` — exit 0; Node v24.17.0.
19. `git log -4 --oneline origin/main && git diff --name-status HEAD..origin/main -- packages/db/src/site-extra-pricing-queries.ts packages/db/src/site-extra-repository.ts packages/db/src/site-visit-repository.ts packages/db/test/contractor-session-context.integration.test.ts BUILD_PLAN.md AGENTS.md && git diff --name-only HEAD..origin/main && sed -n '1,85p' apps/api/src/generate-openapi.ts && cat config/lanes/serious-b9.json` — exit 0; no changed cited source/contract files.
20. `node --input-type=module` with stdin importing TypeScript, parsing the five `.ts` paths via `ts.createSourceFile`, printing parse diagnostics and setting the exit code if nonzero — exit 0; five files, zero syntax diagnostics, zero tests executed.

Final path/hash and diff evidence is appended below after handoff creation. Intended commit subject/body is in `/private/tmp/jg-msg-later-b10.txt`.

21. `wc -l packages/db/test/contractor-session-context.integration.test.ts && rg -n '^  it|^it\(' packages/db/test/later-site-replay.integration.test.ts packages/db/test/later-contractor-start.integration.test.ts && git diff --stat && git diff --check && git status --short && git rev-parse HEAD origin/main && git diff --name-status HEAD..origin/main -- packages/db/src/site-extra-pricing-queries.ts packages/db/src/site-extra-repository.ts packages/db/src/site-visit-repository.ts BUILD_PLAN.md AGENTS.md` — exit 0; six test declarations, seven expanded cases, zero executed tests.
22. `node --input-type=module` with stdin reading the eight paths listed below, checking every line for trailing spaces/tabs, hashing with SHA-256 and counting lines — exit 0; eight files, zero whitespace errors.
23. Final `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` — exit 0; eight task paths checked.
24. Final `git diff --check && git diff --stat && git status --short && git rev-parse HEAD origin/main` — exit 0; no whitespace errors; final refs as above.

## Final path evidence

`git diff --stat` (tracked files):

```text
 packages/db/src/site-extra-pricing-queries.ts | 10 +++++---
 packages/db/src/site-extra-repository.ts      | 35 ++++++++++++++++++++++++---
 packages/db/src/site-visit-repository.ts      | 19 +++++++++++----
 3 files changed, 53 insertions(+), 11 deletions(-)
```

Untracked task files: lane (19 lines), ledger (13), receipt (this file), new site suite (117), new contractor suite (50). `git diff --stat` does not include untracked files; lane lint and `git status --short` include them. Exactly eight repository files changed, all in the task's lane. No source outside the three named implementation files changes, and no existing test changes.

SHA-256 of the final code, fixtures, registration and handoff files (receipt excluded from its own hashes):

```text
8b7a64e6b3e300b5794d9b1f47457ae6712d19f6078d8a996031f9014c115672  config/lanes/later-b10.json
2e386e969eb7ba80c837ff8af428ac649e9e440909aa6183055983eb805e10f6  packages/db/src/site-extra-pricing-queries.ts
7b81f9eedd0e7821128de54839d654d6fb431acacf6cc32054a8a88c06c5fedb  packages/db/src/site-extra-repository.ts
66c4ca8165b378d9c662cf639a5c7e842536cdec21db4ae46fa6a804e4cffea1  packages/db/src/site-visit-repository.ts
d7e772d886e74fedfc664cc5a61f5531cbbf5d2fbf959a568517a312f1f26527  packages/db/test/later-site-replay.integration.test.ts
5525e4bbad8ea8ebcb8ff1dd6cb7a80e1c94bd881be4ee62371ada32d439469d  packages/db/test/later-contractor-start.integration.test.ts
01c11c004c4bd051a5720986c1c5aa40f47e3f666f6f4c24c581909eb617019e  docs/ledger/LATER-B10.md
9417825158c04922d67405b8eab7f169e790a7d0d62547e6d4e473e6cc03fa03  /private/tmp/jg-msg-later-b10.txt
```

Final builder HEAD: `31682762c903d716657c573e1b5deae63588aad7`. There is no commit SHA for this uncommitted diff yet. The dispatcher must commit it before either independent verdict can bind to it.
