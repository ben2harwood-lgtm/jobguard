# CH-3a round 12 builder receipt

7 October 2026 · branch `codex/sandbox/ch-3a` · existing PR #98.
Starting HEAD: `0ad202c242f1554902a11b5d9bf8fdc9041e039d`.
Changes are uncommitted in this worktree; the dispatcher owns the new commit and push.
Builder status: both requested P2 repairs implemented; technical acceptance remains
held for exact-head CI, an independent recorded verdict and separate acceptance.

Read the entire GPT-6.1 Sol pre-check at
`/Users/benharwood/.local/share/full-steam/jg-runs/ch-3a-solcheck-20261007T200825.md`
(bound to `52006fa2a806e417a8de39049e6599ca0809d8c3`), repository AGENTS.md,
BUILD_PLAN §2/C1–C8 and CH-3a §8, the party contract and prior round's receipt.
All earlier work, including round 11 SBOX-SESSION-1, remains in place. No lane
registry line changed; all edited paths belong to the existing `ch-3a` lane.

## Repairs and evidence

The panel now hydrates customer and payer from `current`, the job's immutable
bound snapshot. Unchanged saves retain its exact customer and payer revision IDs,
even when another job has revised the shared identity. The registry still returns
latest choices for explicit selection and stale-edit observation. A saved payer
revision missing from those choices remains a labelled option. Choosing a registry
entry deliberately uses its revision. Editing an older bound customer over a newer
registry revision refuses before any write, explains the conflict, and prepares the
latest registry draft for a deliberate retry. Changes detected while the panel is
open retain this same explained conflict path; payer detection also covers a bound
revision absent from latest registry suggestions. No automatic conflict retry.

Tests were added before the implementation. The initial component run reproduced
three failures (customer hydration, payer hydration, stale snapshot edit) with
five passing controls. Final component tests: 10 passed. Added two-job customer
and payer regressions in the real-PostgreSQL suite and CH-3a browser spec; the
browser cases cover reopening, exact unchanged-save revisions, a second context
and explicit selection of the newer revision in both existing projects. Existing
stale-edit, refresh, lifecycle, document and session assertions remain unchanged.

Migration stays **0095_job_parties.sql**. Its diff is exactly the two requested
reason checks: both reuse `valid_party_revision_text(to_jsonb(reason),1,500)`;
the post-live routine explicitly rejects null. The nullable constraint still
permits bindings that legitimately have no correction reason. The validator's
ASCII-only dollar-quoted regex patterns are byte-identical to HEAD, preserving
round 10's SQL_ASCII-safe installation approach.

Added runtime-role cases for tab, LF, CR, NBSP and BOM, plus empty/spaces and
UTF-16 length boundaries. Each attempts both the routine and direct INSERT
constraint using the full receipt/result/correction-audit protocol if accepted,
so a deferred missing-record error cannot mask these whitespace defects.
Refusal asserts unchanged bindings, job revision, current pointer, receipts,
audit count and audit head. Null refusal and a valid trimmed 500-character reason
have controls. These PostgreSQL cases are collected, not locally executed.

## Commands actually run

Node `v24.17.0`; cached pinned pnpm `10.28.1` selected through
`PATH=/private/tmp/jg-ch3a-round12-bin:$PATH`. Dependencies already installed;
no install or clean reinstall was performed. An initial global `pnpm --version`
probe triggered the launcher's automatic version resolution, which failed on
registry fetch; all checks then used the already-cached pinned executable.
No package download completed. Logs: `/private/tmp/ch3a-round12-*.log`.

| Command | Exit | Result |
| --- | ---: | --- |
| Web component tests via `node node_modules/vitest/vitest.mjs run app/ui/job-parties.test.tsx` (red) | 1 | 3 failures, 5 passes, before implementation. An earlier root-path probe failed because root has no Vitest binary. |
| `pnpm --filter @jobguard/web exec vitest run app/ui/job-parties.test.tsx` (green / final) | 0 / 0 | 8 then 10 passed after adding stale customer/payer controls. |
| `pnpm typecheck` (initial / final) | 0 / 0 | Seven tasks passed each time; two cached. |
| `LANE_BASE_REF=origin/main pnpm lint` (initial / final) | 0 / 0 | All boundaries and seven package checks passed; no self-comparison refusal. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` (initial / receipt-inclusive final) | 0 / 0 | Existing lane passed against main, including working-tree paths and this receipt. |
| `pnpm --filter @jobguard/web test` | 0 | 13 files, 115 tests passed. |
| `pnpm --filter @jobguard/db exec vitest run src test/verify-evidence-pack-cli.test.ts` | 0 | Three files, 12 unit tests passed. |
| `pnpm --filter @jobguard/api exec vitest run src/job-parties.application.test.ts` | 0 | 35 tests passed, including round 11 session integration. |
| `node --test tools/*.test.mjs` | 0 | 42 passed; none skipped. |
| `pnpm build` | 0 | Seven tasks passed; two cached. Next production compilation, type validation and page generation completed. |
| `pnpm openapi:check` | 1 | Sandbox refuses tsx CLI IPC socket: `listen EPERM`. |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0 | Same generator/comparison passed without the CLI IPC socket. |
| `pnpm --filter @jobguard/web exec playwright test --list e2e/CH-3a.spec.ts` | 0 | 42 cases collected: 21 each in mobile-360 and desktop, including both new two-job cases. |
| `pnpm --filter @jobguard/db exec vitest list test/job-parties.integration.test.ts` | 0 | 82 PostgreSQL cases collected; no database started. |
| Read-only Python comparison of migration and lane registry against HEAD | 0 | Exactly two SQL check changes; ASCII validator patterns and lane registry unchanged. |
| `git diff --check` | 0 | Clean. |

Final typecheck/lint repeats and the receipt-inclusive lane check all passed.
Turborepo emitted nonfatal cache I/O permission warnings; Next emitted the
existing multiple-lockfile/root inference warning. Neither check was bypassed.

## Migration, invariants and remaining gates

The unapplied migration is amended in place under this dispatch. No new migration
number, data backfill change, privilege, schema version or history rewrite.
If any separate environment already applied 0095, a reviewed forward-fix migration
is required there; preserve immutable revisions and artifact bytes/hashes.

Affected guarantees: saved party revisions/immutable history, stale-edit refusal,
versioned correction-reason validation, receipt/audit atomicity and rollback.
Tenant/RLS, session ownership, authorization and existing synthetic-only boundaries
are preserved. No new external action, operational alert, financial posting,
provider configuration, AI prompt/model change or decision approval.

Not run: PostgreSQL execution, migration fresh/upgrade/replay execution, restore,
browser execution or a clean pinned reinstall. This sandbox cannot bind localhost
or start PostgreSQL; the dispatcher must obtain GitHub CI evidence after pushing,
including both browser projects and all earlier mandatory database suites.
Collection/unit mocks are not PostgreSQL or browser execution evidence. No new or
longer timeout, skip, removed assertion or weakened check was introduced.

Intended conventional commit subject and body are in
`/private/tmp/jg-msg-ch-3a.txt`. No git write, commit, push, merge or new PR was
performed. No live provider, real data, real send, spending, production execution,
release or approval. Independent exact-commit verdict and separate acceptance
remain outstanding; this builder receipt is not either.
