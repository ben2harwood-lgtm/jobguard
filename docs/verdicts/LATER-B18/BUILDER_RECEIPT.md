Built by Codex; dispatched 13 Oct 2026; implemented 16 Oct 2026.

# LATER-B18 builder receipt — PARK / partial evidence

Actual builder is Codex. The addendum's legacy Sonnet/unavailable banner would misstate authorship, so it is not used as an authorship assertion. This is a builder run receipt, not acceptance or an independent model verdict.

Branch: `codex/sandbox/later-b18`. Initial and final HEAD: `31682762c903d716657c573e1b5deae63588aad7`. Actual local `origin/main` is the same SHA, rather than issued `ca435eeb5791638c787c830d6ba717146f694539` or draft `0bbb5ddb`. Current main wins. Its BUILD_PLAN C5 remains line 117; UIWIRE-14 remains line 410. Main's repository line 3 still invokes the unconditional 0024 routine; controller line 3 previously passed validation failures through. 0192 is unused on the inspected base and is the issued migration number. No Git write, package install, real data, spending, outward action, deletion, enablement or deployment was performed.

Decision 74: built with made-up data and PARKED. RED Opus and Sol-high verdicts, separate acceptance, dispatcher CI, lane registration and Ben's merge/enable button are outstanding. No acceptance is claimed.

## Implementation and acceptance evidence

- L101: 0192 replaces only the existing source-creation routine. Membership share lock, tenant/command advisory lock and job update lock serialize both uniqueness dimensions. Same command/job/fixed source version returns without recreating IDs/timestamp; another job with the command or another command for the occupied job raises `23505 / FEE_ILLUSTRATION_CONFLICT`. Existing immutable rows, table constraints, RLS, owner and ACL remain unchanged. Repository source is unchanged because its existing routine call and immutable read suffice.
- Only the fixed v1 fixture is valid content. Changed fixture/version/extra fields are invalid requests (400); the only alternate valid persisted binding is a different job (409). No mutable financial policy or arbitrary content is introduced.
- L112: controller authorizes the job before strict versioned input validation. Malformed/fractional/out-of-range/non-number money returns `400 / VALIDATION_ERROR`, without reflecting input. The specific database replay conflict becomes `409 / IDEMPOTENCY_CONFLICT`. Unknown errors, including internal schema failures, remain errors for Nest's default 500 boundary. A real BaseExceptionFilter test verifies the 500 response for an unknown database failure.
- Locally executed: 32 API boundary tests, including unchanged historical calculation (cap 28200, credit 7900, additional fee 20300), authorization ordering and no persistence calls from what-if.
- Written, NOT RUN: four real-PostgreSQL integration cases cover concurrent identical creation, stable source IDs, changed job/command conflict, exact financial snapshots, role/tenant refusal, no direct write privilege, and concurrent changed commands. The upgrade case populates the old routine, compares its own migration step and permission catalogue, then runs later migrations twice. It uses the shared canonical named-column text/full-type/primary-key comparator, checks nonempty pre-existing rows and has rolled-back microsecond, retype, later nullable column/function and later inserted-row controls.
- Financial-effect and concurrency acceptance is PARTIAL pending real PostgreSQL execution. No claim about database guarantees follows from the API tests.

## Authority and operational limits

Standard F: the checked SECURITY DEFINER routine has its OWN current owner-role check against the retained fixed DEMO identity before any job lookup. The existing HTTP practice-session/job ownership checks remain authoritative at the request boundary. No persisted-session constructor, credential, capability, direct business write grant or production route is added. As before, this fixed synthetic database bridge is not protection from someone holding application database credentials. It is not a production authorization design.

Only synthetic small-builder jobs pass the routine's track/environment predicate. Contractor and pilot jobs are refused. Consequently this piece introduces no contractor write route requiring a watchdog registration change; watchdog registries/harness/replay tests are untouched. The route's existing `post_live_billing` classification is unchanged.

Migration: `packages/db/migrations/0192_fee_illustration_replay.sql`; no runner/inventory changes. Forward fix is a later replacement routine preserving all history and replay behavior; no destructive rollback. See its migration note. No new alert or external-provider action is introduced. No AI prompt/model/parser change; eval is inapplicable. No UI change.

Every new GRANT, one line each: **NONE**. No new direct INSERT, UPDATE or DELETE grant to `jobguard_runtime`; its existing illustration-source privileges remain SELECT plus execution of the checked routine.

## STOP report

1. `config/lanes/later-b18.json:1` is absent. Before: `<file absent>`. Proposed after: a version-2 `later-b18` lane registering branch `codex/sandbox/later-b18`, receipt `docs/verdicts/LATER-B18/BUILDER_RECEIPT.md`, and exactly the nine allowed paths in the issued order (including the unchanged repository). This is coordinator-owned registration and is outside the issued allow list. No lane file or shared registration/list was edited. Dispatcher must supply it; no workaround was used.
2. `tools/agent-lane-boundary-lint.mjs:303` currently reads `if (!branch || (base && base === target)) throw new Error("Missing branch or self-comparison range; refusing a misleading pass.");`. Before = after: unchanged. Here `HEAD == origin/main` because the builder cannot commit. Proposed operational after: dispatcher commits on the registered lane and reruns the same command on a non-self comparison. No weaker assertion is proposed. Both direct lane lint and `pnpm lint:lanes` refuse with that exact message; these checks have NOT passed.
3. Diagnostic only: `ps -o pid,ppid,etime,%cpu,rss,command -ax | rg 'vitest|pnpm|34927' | head -16` was refused: `zsh:1: operation not permitted: ps`. Stopped that diagnostic; no alternate process inspection was attempted.

No existing merged test, expected value, pin, hash, fingerprint or setup line was changed. No further implementation STOP is asserted.

## Executed checks and first failures

Every pnpm command first exported `PATH="$HOME/Library/pnpm/bin:$PATH"`. The global binary was pnpm 11 and stalled before executing Vitest; both that first test attempt and its version probe were interrupted (exit 130). A read-only search found already cached pnpm 10.28.1. `/private/tmp/jg-b18-tools/pnpm` invokes that exact cached CLI using node, with that temporary directory prepended after the required PATH export. `pnpm --version` then printed 10.28.1 (exit 0). No download/install was run. Node is v24.17.0; Vitest 4.1.11; Turbo 2.10.12; Next 15.5.27.

The initial direct API test could not resolve absent `@jobguard/db` build output (exit 1, zero tests). A temporary source-alias config at `/private/tmp/jg-b18-vitest.config.mjs` initially pointed under the API cwd (exit 1, zero tests); correcting that temporary path enabled tests before building dependencies. This changes no shared repository harness. After the required build, the final standard test command passed with no temporary config.

| Command | Exit / result |
| --- | --- |
| `pnpm --filter @jobguard/api exec vitest run src/workspace/fee-illustration-later.test.ts --maxWorkers=2` (initial global pnpm) | 130; interrupted before tests |
| `pnpm --manage-package-manager-versions=false --version` (global pnpm) | 130; interrupted |
| `node node_modules/vitest/vitest.mjs run src/workspace/fee-illustration-later.test.ts --maxWorkers=2` (API cwd, before build) | 1; unresolved db package, zero tests |
| Same direct Vitest command plus `--config=/private/tmp/jg-b18-vitest.config.mjs`, first temporary config | 1; incorrect temporary alias path, zero tests |
| Same direct Vitest command with corrected temporary config, BEFORE implementation | 1; **28 failed / 3 passed, 31 total**; typed validation/conflict assertions fail |
| Same direct Vitest command after first controller implementation | 0; 31 passed |
| Same direct Vitest command after stronger tests, BEFORE narrowing validation mapping | 1; **2 failed / 30 passed, 32 total**; invalid create reaches application and internal schema failure is incorrectly relabelled |
| Same direct Vitest command after narrowed input-only mapping | 0; 32 passed |
| `pnpm --version` using cached CLI wrapper | 0; 10.28.1 |
| `pnpm --filter @jobguard/api exec vitest run src/workspace/fee-illustration-later.test.ts --maxWorkers=2 --config=/private/tmp/jg-b18-vitest.config.mjs` | 0; 32 passed |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0; 7/7 tasks successful, 0 cached |
| `pnpm exec turbo run lint --force --concurrency=2` | 0; 7/7 tasks successful, 0 cached |
| `pnpm build --force --concurrency=2` | 0; 7/7 tasks successful, 0 cached; 41 static pages generated |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1; self-comparison refusal; repeated standalone with same result |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same refusal |
| `git diff --check` | 0 throughout; final handoff check recorded below |
| `node apps/api/dist/generate-openapi.js --check` | 1; compiled metadata adds parameters throughout the document; not equivalent to the repository's source/tsx check |
| Node module script creating Nest app without listen, comparing generated compiled OpenAPI and writing only `/private/tmp/jg-b18-openapi.json` | 0; inspected metadata differences, no repository output edited |
| `node --import tsx src/generate-openapi.ts --check` (API cwd) | **0**; actual source OpenAPI check; Node import avoids CLI IPC listener |
| `pnpm --filter @jobguard/api exec vitest run src/workspace/fee-illustration-later.test.ts --maxWorkers=2` (cached pinned pnpm, final, after build) | **0; 32 passed**, no temporary config |

Turbo's three forced runs printed `WARNING IO error: Operation not permitted (os error 1)` while using the shared worktree cache, but all actual tasks executed and returned 0. No cache hit was treated as a run, and no permission escalation/cache-write workaround was attempted. Build also reported multiple-lockfile/root inference, existing CSS support and Nest/file-type/load-esm warnings; these files were not edited.

Before each heavy invocation, `memory_pressure | tail -1` showed 81–82% free, and `df -g /System/Volumes/Data` showed 47, 46, then 45 GB available. Final `df -k` showed 47,899,948 KiB available (about 45.68 GiB, above the 45 GiB floor). No further heavy work was started after the final API run. No build/test overlap, no whole suite, no more than one own test file per local test invocation, and two Vitest workers maximum.

## NOT RUN

- `packages/db/test/fee-illustration-later.integration.test.ts`: NOT RUN (cannot start PostgreSQL / bind sockets here; explicitly prohibited by issued sandbox order). First database failing run is NOT RUN, not a pass.
- `packages/db/test/fee-illustration-later-upgrade.integration.test.ts`: NOT RUN for the same reason. No fresh/upgrade/migration-owner proof is claimed as executed.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`: NOT RUN (dispatcher-only whole suites; PostgreSQL unavailable/prohibited).
- `pnpm test:e2e`, every browser/Playwright/device run: NOT RUN (CI only; prohibited here; no UI/native change).
- `pnpm openapi:check` CLI wrapper: not invoked because it uses the tsx CLI; equivalent source generator/check ran via Node's tsx import and passed without a CLI IPC listener.
- Independent RED model checks: NOT RUN; dispatcher owns the Opus/Sol-high review handoff. No review or acceptance file fabricated.

## Source inspection command log

These were read-only inspection batches. Paths below are relative to the worktree unless absolute; semicolon-separated commands were individual reads in the same tool invocation. Final batch exit codes are listed; missing-path diagnostics are explicitly retained. Source reads/tests/proofs are distinct claims.

1. `pwd && git status --short && git rev-parse HEAD && git rev-parse origin/main && cat AGENTS.md` — 0; initial clean tree.
2. `cat config/lanes/later-b18.json; cat packages/db/src/fee-illustration-repository.ts; cat apps/api/src/workspace/fee-illustration.controller.ts; rg -n 'UIWIRE-14|C5|illustration|L101|L112' BUILD_PLAN.md; cat package.json` — 0; lane absent diagnostic.
3. `cat apps/api/src/workspace/fee-illustration.application.ts; cat packages/db/migrations/0024_fee_illustration.sql; rg -n 'create_fee_illustration_source|fee_illustration_source' packages/db/migrations` — 0.
4. Reads of `apps/api/src/practice-access.ts`, controller validation-pattern search, core fee-illustration path probe, and `rg --files` filtered for illustration/upgrade/lane/Vitest — 0; core fee-illustration path absent.
5. `cat ~/.local/share/full-steam/handoffs/jobguard-task.md`, upgrade proof, lane tool and API/DB package manifests; memory/disk probes — 0.
6. Reads of fee-illustration contracts/application tests, practice-access source path probe and recovery-follow-up upgrade proof — 0; practice-access.ts absent in db (actual file is practice-session.ts).
7. Reads of recovery tests/helpers/config, OpenAPI generator, validation and fee-source searches — 0; helpers.ts probe absent.
8. Reads of migrate.ts, practice-activation path probe, watchdog route and file searches — 0; actual activation source is activation-repository.ts; obsolete config path probe absent.
9. Reads of upgrade-proof-utils.ts and job-sources upgrade test — 0.
10. Practice-session/activation searches and 0138/0094 SQL reads — 0.
11. Practice-session/scope test, OpenAPI generator, DB Vitest config reads — 0; old core fee-what-if.ts path absent.
12. Practice-session/activation/work-state fixture reads, context-boundary reference search, core fee function search and obsolete app-exception filter probe — 1; actual filter is practice-errors.filter.ts.
13. Context-boundary lines 720–780, reviewed-source searches, core fee-statement lines 1–65, filter search and 0111 search — 1 (last search had no match).
14. Context-boundary lines 65–100, practice-errors.filter.ts, session SQL searches, insurer role-check lines 130–162, contractor session fixture, lane search and `git branch --show-current` — 0.
15. Track/schema searches, demo-seed first 22 lines, watchdog filter, turbo config, lint tool and config file listing — 0.
16. Journal schema/tenancy illustration search, refused ps diagnostic, Vitest bin listing and `node --version` — final 0; ps refusal separately reported above.
17. Shared-money lines 45–100, context-boundary lines 640–690 and disk probe — 0.
18. `command -v pnpm`, global pnpm shim first 25 lines, Vitest shim first 16 lines and workspace YAML — 0.
19. Local `.npmrc` probe, pnpm shim last 12 lines and installed-package listing — 0; local .npmrc absent.
20. Cached pnpm directory and alternate binary/config probes — 1; alternate /opt/homebrew/bin/pnpm absent.
21. Root workspace package-link/bin and alternate corepack probes; workspace package manifest list — 0.
22. Temporary source-alias configuration creation with Python (first used API cwd), correction using Python, and test invocations — exit codes/counts in test table.
23. 0053 schema lines 1–45, extra fixture/serious-b4 proof reads, tsconfig/include probes — 0.
24. Cached pnpm package/file discovery, standalone binary `file`, lane example read, status/diff check — 0.
25. Cached pnpm cjs source/path probes — 0 overall; 11.7.0/dist/pnpm.cjs absent, pinned 10.28.1 discovered locally.
26. Python creation of temporary pinned pnpm launcher and chmod, pinned version and test — 0.
27. Migration directory tail, tsconfig reads, initial migration grant search, diff stat and head — 0.
28. Session issuance/track/illustration searches and SQL lines 45–85 — 0.
29. Diff check, lane refusal source lines, base/current repository SHA-256 and protected-file SHA-256, disk — 0.
30. Python SHA-256 comparison of protected files against `git show origin/main:<path>` — 0; all seven unchanged.
31. Repeated `df -g`, `memory_pressure | tail -1`, `git status --short`, final `df -k`, head/origin reads and diff checks — 0.
32. File edits used apply_patch, each successful, limited to controller/new tests/migration/note/ledger; receipt and intended message were written with Python, successful. No pre-existing uncommitted file was overwritten.

## Builder source inspection (not independent review)

Checked both command/job race dimensions, immutable replay IDs, invalid content before writes, specific conflict mapping, authorization before input parsing, internal schema failure preservation, role check before job lookup, unchanged fixed fixture amounts, no new grants and upgrade comparator controls. No test or shared assertion was weakened. Remaining practical limits are real PostgreSQL execution, uncommitted lane-check refusal and independent review. Receipt hashes are evidence of file scope, not proof of runtime behavior.

## Unchanged protected-file SHA-256

- `packages/db/src/fee-illustration-repository.ts`: `6a7785c9f5240ea3c1916df7d129febe8ee74b346c89789989a02893dd124ec2` (identical to origin/main).
- `apps/api/src/auth/context-boundary.test.ts`: `ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2` (identical to origin/main).
- `packages/db/src/migrate.ts`: `d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983` (identical to origin/main).
- `packages/db/MIGRATIONS.md`: `1790932d10a34c8cd0bf2bced5426ebff39717d4c9bafe55f290795ad462356d` (identical to origin/main).
- `packages/core/src/watchdog.ts`: `a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca` (identical to origin/main).
- `packages/db/test/watchdog-command-harness.ts`: `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` (identical to origin/main).
- `packages/db/test/command-replay-contract.integration.test.ts`: `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` (identical to origin/main).

## Changed artifact hashes (receipt excluded to avoid self-reference)

- `apps/api/src/workspace/fee-illustration.controller.ts`: `85269eabc1cd9a1a2a052d72e7e7ae44958fdaf0fa1a7c2f7bdc796f3b5121d0`; 47 lines.
- `apps/api/src/workspace/fee-illustration-later.test.ts`: `c6edc48fbdaa49ef1f3a4690212cdd334fc0df08e18a335fd9a88152fad0c05f`; 89 lines.
- `packages/db/test/fee-illustration-later.integration.test.ts`: `57c1a9d8f4bbdb7015876dd406a541af7019c273491b880216c9913c62843811`; 78 lines.
- `packages/db/test/fee-illustration-later-upgrade.integration.test.ts`: `48ac0e95ef57777785a2652be5739e38d2eadfde96443fbc55fca3f4dda74887`; 64 lines.
- `packages/db/migrations/0192_fee_illustration_replay.sql`: `f4fd852500726e64463882f37057265119903d422dcf8946aeae247f9c034c62`; 44 lines.
- `packages/db/migration-notes/0192_fee_illustration_replay.md`: `cccfd0c114bead6e2f22ab9a76f863620ddcaf2dd3aca5485e6d69f0abfbbaf0`; 15 lines.
- `docs/ledger/LATER-B18.md`: `8ed23d1753dacbee5a7c6bf0bdf3df892a75f2450f4b0b92f4d5ce41935fdeb9`; 9 lines.

Tracked `git diff --stat` (untracked new files are listed with hashes above):

```text
 .../src/workspace/fee-illustration.controller.ts   | 50 ++++++++++++++++++++--
 1 file changed, 47 insertions(+), 3 deletions(-)
```

Final head: `31682762c903d716657c573e1b5deae63588aad7`. No commit/push performed. Intended message: `/private/tmp/jg-msg-later-b18.txt`.
