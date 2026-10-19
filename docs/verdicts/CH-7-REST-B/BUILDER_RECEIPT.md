# CH-7-REST-B — builder receipt, issuance STOP

18 October 2026. RED qualifying-money lane. **DW3 NOT IMPLEMENTED; no technical acceptance claimed.**

Inspected/tested inherited HEAD: `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c` (A #292 build-ahead base). B changes are uncommitted documentation and lane configuration only. The dispatcher must bind any eventual implementation and independent different-model verdict to its exact commit; the builder does not self-accept.

## Work and STOPs

Read repository AGENTS, BUILD_PLAN §§10.3.3/CH-7, recovery eligibility and terms contracts, Ben's 17 October answers, the referenced 18 October remainder draft, A's ledger/receipt, core evaluator and repository, and latest routine locations. No external provider/research needed.

The issuance requests “sub-order A”, but its pasted B draft has no such section. The referenced draft's A is F21, already present. Asked for scope clarification asynchronously; no reply received at receipt preparation.

STOP-2 blocks the actual atomic DW3 change: missing/pre-terms result wording, saved exclusion versus refusal, and header/line precedence are expressly undecided. No allowed existing reason describes a post-opening/pre-terms receipt. No null/held encoding, refusal contract or new wording was invented. STOP-1 also remains for equality and reversed transaction-start/commit ordering. These are explicit order restrictions, not newly imposed approval requirements. No permissive application-only slice or incomplete SQL guard was installed.

Completed unaffected work: exact B lane (never lists itself), refreshed dependency/routine anchors, itemized STOP ledger, baseline verification, intended commit message. A's F21 changes are untouched. Local maximum migration is 0195, so lane substitutes 0196 in both future paths; **no migration installed**. No backfill, new objects, grants, RLS changes or inventory exceptions. Ruling 113 was not exercised. No new alerts, providers, financial effects or compatibility changes.

## Execution evidence

Preinstalled dependencies used; no install/download requested. Node 24.17.0 differs from pinned .nvmrc 24.15.0, so this is not exact pinned clean-install evidence. Initial ambient `pnpm --version` stalled and was interrupted (130); subsequent commands used cached pnpm 10.28.1 through `PATH=/private/tmp/jg-ch7-cont-bin:$PATH`, as A's receipt documents. No git write commands run.

| Command | Actual result | Local log |
| --- | --- | --- |
| `pnpm typecheck` | PASS, 7 tasks, 2 cached | `/private/tmp/jg-ch7-b-typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL at lane boundary: inherited A paths outside B | `/private/tmp/jg-ch7-b-lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL for the same eight inherited A paths | `/private/tmp/jg-ch7-b-lanes.log` |
| `LANE_BASE_REF=302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c pnpm lint:lanes` | Refuses self-comparison (base equals current HEAD), not a pass | `/private/tmp/jg-ch7-b-own-lanes.log` |
| `pnpm exec turbo run lint` | PASS, 7 package tasks, 2 cached; does not replace root lane check | `/private/tmp/jg-ch7-b-package-lint.log` |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-eligibility-v3.test.ts --maxWorkers=2` | PASS, 45/45 inherited tests | `/private/tmp/jg-ch7-b-core.log` |
| `pnpm --filter @jobguard/api exec vitest run src/recovery-eligibility-v3.application.test.ts --maxWorkers=2` | Initial import failure before db build output existed; repeated after output became available: PASS, 15/15 mocked tests | `/private/tmp/jg-ch7-b-api.log`, `/private/tmp/jg-ch7-b-api-after-build.log` |
| `pnpm openapi:check` | BLOCKED by tsx IPC listen EPERM | `/private/tmp/jg-ch7-b-openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` (apps/api cwd) | PASS, exit 0; same checker without tsx IPC wrapper | `/private/tmp/jg-ch7-b-openapi-direct.log` |
| `git diff --check` | PASS | terminal |

The eight inherited lane failures are A's web assertion, lane file, ledger, receipt, 0195 SQL/note and two F21 test files. No B-owned edit to these files. STOP for widening B to cover A; dispatcher must resolve the dependency comparison after A merges. Local origin/main was `42990862881cd048c7167869246551d5360beb17` (no fetch).

## Not run / still owed

All six new DW3 tests are NOT IMPLEMENTED / NOT RUN because their load-bearing result contract and issued sub-order remain unresolved. No failing-first failures claimed. PostgreSQL, test:db, test:migrations and browser/e2e are NOT RUN by instruction. Full `pnpm test` is NOT RUN because it invokes database suites; selected tests above are not full-suite evidence. AI evaluation is inapplicable to this documentation-only change. No real integration, independent verification, security/commercial approval or task closure claimed.

DW3 and C's non-v3 pursuit remain open, as do CI, independent RED verdict, separate acceptance and all release gates. No commit, push, merge or release. Commit-message handoff: `/private/tmp/jg-msg-ch-7-rest-b.txt`.

`pnpm build`: PASS, 7/7 tasks, 2 cached, exit 0 (`/private/tmp/jg-ch7-b-build.log`). Existing workspace-root/CSS/dependency warnings remain; no browser runtime proof inferred. Only B lane, ledger and receipt were added in this working tree.

## continuation (decision 123)

19 October 2026. This section supersedes the earlier statement that no DW3 implementation exists. Starting HEAD `00d4f3453863616f4e844be1a17eeaa43719c5a5`; parent A `302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c`. Uncommitted working-tree patch, no exact final commit exists. No self-acceptance, independent verdict, merge or release claimed.

Built the decided withheld-payment terms-timing slice in core, repository and provisional 0196 forward migration. Preserved A's two guard bodies with additive timing/audit predicates, existing grants/RLS and F21 text. No historical writes, new tables, provider calls, fees or authority. Core facts require explicit server-derived timing for withheld fixtures; strict command schema rejects client authority claims. Terms are matched under the shared case lock; original principal and interest timestamps are compared in PostgreSQL at full precision, with the approval ID recorded in audit. Original command replay returns its saved result before new evaluation.

Decision 123 note is copied exactly, including ASCII apostrophes. Existing applicable explanations and component exclusions retain their reasons. Supplier-credit terms, missing-approval presentation, equality/reversed transaction ordering and fixture-policy compatibility remain item-specific STOPs detailed in `docs/ledger/CH-7-REST-B.md`. No permissive SQL bypass was left for a positive withheld-payment review. Missing/equal cases use an internal typed capability hold, not an approved outward refusal contract. **B remains incomplete / not merge-ready.**

Failing-first evidence: wrote and ran the five-test core DW3 suite before changing implementation. Actual exit 1: 3 failed / 2 passed (`/private/tmp/jg-ch7-b-123-red.log`); failures were ReceiptBeforeTermsNeverRescued, SeparateInterestUsesOwnSettlementTime and reason preservation. A second pre-change run also failed because `python` was unavailable; changed the edit invocation to installed `python3`. After implementation, targeted new and inherited core suites passed 50/50 (`/private/tmp/jg-ch7-b-123-core.log`). The missing-approval test's undefined case was corrected to avoid its own helper default. Later strict-boundary assertion was strengthened to reject actual extra authority fields without an unrelated extra key.

PostgreSQL suites were written after the initial unit failing-first run and are NOT RUN by instruction. No DB failing-first or runtime result is claimed. They cover the named tests subject to explicit TODO STOP cases; source is not execution evidence. New test fixtures declare v3 from creation and use the existing authorized terms command; they do not fabricate approvals. Only the microsecond comparator test changes timestamps as an explicit test-only superuser control after real approval. Historical upgrade source uses a local A-schema writer for historical outcome facts, never a production fallback.

Dependencies preinstalled; no download/install. Node remains 24.17.0 versus pinned 24.15.0; cached pnpm 10.28.1 used via `/private/tmp/jg-ch7-cont-bin`. This is not clean pinned-install evidence. No PostgreSQL server, localhost listener or browser was started. Full `pnpm test`, `test:db`, `test:migrations`, `test:e2e`: NOT RUN because those invoke prohibited local subsystems. No AI/model/parser change; eval inapplicable.

Final check results are appended below. Full task acceptance additionally requires fixture-scope amendments, CI PostgreSQL/browser results and independent RED review on the dispatcher-created commit. Commit message handoff remains `/private/tmp/jg-msg-ch-7-rest-b.txt`.

Additional source coverage: real foreign-tenant authorized approval rejected on audit binding; forged flags/timestamps; owner/session/revision/duplicate holds; all-table effect-count assertion. Historical insurer pre-0142 seed now explicitly uses its existing PreviousRecoveryEligibilityV3Repository rather than the changed current repository. This is test-only historical setup, preserving historical money/reason assertions; current null-policy fixtures remain stopped.

### Continuation execution results

All log paths below use `/private/tmp/jg-ch7-b-123-` as prefix. These are actual local results, not CI/independent acceptance.

| Command | Result | Log suffix |
| --- | --- | --- |
| `pnpm typecheck` | PASS, exit 0, 7 tasks (2 cached) | `typecheck.log` |
| `LANE_BASE_REF=origin/main pnpm lint` | FAIL, exit 1: eight inherited A files outside B lane | `lint.log` |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | FAIL, same inherited A files | `lanes.log` |
| `LANE_BASE_REF=302e6f01aac7fc2bb4a05ea5f50c6b7b5944263c pnpm lint:lanes` | PASS, exit 0; exact B paths including uncommitted files | `own-lanes.log` |
| `pnpm exec turbo run lint` | PASS, exit 0, all 7 package tasks (2 cached); separate from root lane check | `package-lint.log` |
| `pnpm build` | PASS, exit 0, all 7 tasks (2 cached) | `build.log` |
| New DW3 + inherited eligibility core targeted run | PASS 50/50 after initial failing-first run | `core.log` |
| `pnpm --filter @jobguard/core test` | Interrupted (130) after starting default unrestricted worker run; no completion claimed | `core-all.log` |
| `pnpm --filter @jobguard/core exec vitest run --maxWorkers=2` | Interrupted (130) after observing generated `dist` test failures and allocation timeouts; not a pass | `core-all-limited.log` |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=2` | FAIL, exit 1: 2,895 passed / 1 timed out, 114 files passed / 1 failed. Failure is unchanged receipt-allocation denominator-limit test, default 5-second timeout | `core-src.log` |
| `pnpm --filter @jobguard/core exec vitest run src/receipt-allocation.test.ts --maxWorkers=1` | PASS 34/34, unchanged timeout/assertions; isolated retry does not erase broad-run failure | `allocation-retry.log` |
| API eligibility + supplier-credit application suites, `--maxWorkers=2` | PASS 20/20 mocked application tests; not provider/DB proof | `api.log` |
| `node --test tools/*.test.mjs` | PASS 100/100 | `tools.log` |
| `pnpm openapi:check` | BLOCKED, exit 1: tsx IPC listen EPERM | `openapi.log` |
| `node --import tsx src/generate-openapi.ts --check` in apps/api | PASS, exit 0; same checker without IPC wrapper | `openapi-direct.log` |
| TypeScript transpile diagnostics on both new DB suites | No syntax diagnostics; does not typecheck or execute PostgreSQL | terminal |
| `git diff --check` | PASS | terminal |

Build/typecheck/lint emitted sandbox cache-write `Operation not permitted` warnings but exited successfully. Build also retains the inherited Next workspace-root warning. No cache warning is reported as a test failure or concealed as pinned-install evidence. Final application source was covered by passing typecheck/build/package-lint; later edits were test-source and documentation refinements.

No PostgreSQL/browser runs, no approved live routes, no security/commercial sign-off and no independent recorded verdict. Named DB test sources and their TODO decision cases await dispatcher CI and review. Commit message is written to `/private/tmp/jg-msg-ch-7-rest-b.txt`; no git writes were performed.
