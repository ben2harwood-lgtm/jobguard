Built by Codex; dispatched 13 Oct 2026.

# LATER-B16 builder receipt — partial, PARK

Actual builder identity is recorded above. The addendum's requested Claude Sonnet attribution would be inaccurate for this run. This is a builder run receipt and source inspection, **not** an independent model verdict or acceptance. RED Opus and Sol-high verdicts, a dispatcher commit and separate acceptance are outstanding. No commit, push, merge, enablement, release or outward action was performed. Decision 74 requires this branch to stay PARKED pending Ben's button.

## Base, authority and cited lines

HEAD and origin/main both resolve to `31682762c903d716657c573e1b5deae63588aad7` (branch `codex/sandbox/later-b16`), rather than the issued `ca435eeb5791638c787c830d6ba717146f694539` or draft `0bbb5ddb`. Current main wins. Working tree was clean at first inspection; all changes listed below were made in this run.

Read repository AGENTS.md, BUILD_PLAN C5/C6 at 117/119 and UIWIRE-10/11/12 at 413–415, the full standing handoff and its COMMON.md, existing contracts, repositories, migrations, fixture helpers and related tests. No application or data was regenerated.

All cited implementation lines were checked against origin/main:

| Item | Current main evidence | Outcome |
| --- | --- | --- |
| L075 | `apps/web/e2e/customer-invoice.spec.ts:2` still uses the older demonstration journey. Existing `e2e/helpers/customer-invoice-journey.ts` supplies a real persisted setup. | Added a new journey using real API commands, reload and a second authenticated context; existing specs unchanged. |
| L076 | `packages/db/src/customer-billing-repository.ts:38–44` hashes the command envelope without the outer invoice target/reason. | Compare persisted credit target/job/amount/reason before dispatcher replay. Command and semantic locks serialize concurrent checks; original dispatcher hash and historical receipt remain unchanged. |
| L078 | `practice-invoice-repository.ts:20,45,99` already share amount projections and single statement history snapshots. Line 36 still maps an issued/replayed row without persisted credits/receipts. | Preserve the existing list/detail guarantees, use the same projections after issue/replay, add persisted-history coverage. The initial L078 unit case already passed on main. |
| L079 | Same file line 35 unconditionally appends issue audit. | Check existing invoice event under the existing job lock; no second event on replay or reused invoice. |
| L080 | Same file line 17 converts SQL date to UTC. | Format SQL calendar dates as text, keep the calendar representation through mapping. |
| L081 | Same file line 52 assumes complete legacy credit metadata; API contract line 29 requires it. | HELD, exact STOP below. No invented hashes, VAT facts, dates or unknown-state contract. |
| L082 | `0166_customer_billing_integrity.sql:69–77` checks the receipt before its invoice lock; direct concurrent calls can miss an uncommitted receipt. | Additive 0190 takes command lock before receipt lookup, then invoice lock; active-owner checks before history and after waits; replay binds stored operation/status/actor as well as unchanged digest. |

The installed runner discovers newer migrations, so 0190 needs no runner or inventory edit. Main's current highest migration is 0172. The dispatcher owns any later renumbering. SERIOUS-B5's issuer routine and final-account lock/proof behavior are unchanged.

## Tests first and local execution

Before source or migration implementation, wrote the new unit, database, upgrade and browser cases. The database/browser files were NOT RUN because the issued sandbox excludes sockets/PostgreSQL/browser execution. No claimed database first-failure is fabricated.

The first executable unit run against the unchanged implementation produced **5 failed, 2 passed, 7 total**: L079 duplicate audit; L080 Auckland and London date shifts; L076 changed invoice and changed reason. L078 and the Los Angeles date case passed initially. After implementation: **7 passed, 0 failed**. Two initial tooling attempts produced zero executed tests (missing built core; one wrong runner path), recorded below. No existing merged test, expected value, pinned list or fingerprint was edited.

Commands below are the validation/tooling invocation record. All pnpm invocations began with `export PATH="$HOME/Library/pnpm/bin:$PATH"`. For successful pinned runs it was followed by `export PATH="/private/tmp/jg-pnpm-later-b16:$PATH"`; that local wrapper executes the **already cached** `/Users/benharwood/.cache/node/corepack/v1/pnpm/10.28.1/bin/pnpm.cjs` without an install. Node was v24.17.0. No dependency download/install command was issued.

| Command / directory | Exit | Actual result |
| --- | --- | --- |
| `pnpm --filter @jobguard/db exec vitest run src/practice-invoice-later.test.ts --maxWorkers=2` (initial default pnpm) | 130 | Default pnpm was 11.8.0, warned about ignored overrides and did not start tests; interrupted. |
| `npm_config_manage_package_manager_versions=false pnpm --filter @jobguard/db exec vitest run src/practice-invoice-later.test.ts --maxWorkers=2` | 130 | Same startup stall; interrupted, no tests. |
| `pnpm --manage-package-manager-versions=false --filter @jobguard/db exec vitest run src/practice-invoice-later.test.ts --maxWorkers=2` | 1 | Unknown option; no tests. |
| `pnpm --config.manage-package-manager-versions=false --filter @jobguard/db exec vitest run src/practice-invoice-later.test.ts --maxWorkers=2` | 130 | Same startup stall; interrupted, no tests. |
| `node node_modules/vitest/vitest.mjs run src/practice-invoice-later.test.ts --maxWorkers=2` from packages/db, before prerequisite core output | 1 | 1 suite failed to load @jobguard/core, 0 tests executed. |
| `node node_modules/typescript/bin/tsc -p packages/core/tsconfig.json` from root | 0 | Built required local core output for unit imports, before implementation. The following pnpm version probe in that shell stalled and was interrupted (shell exit 130). |
| `pnpm --config.managePackageManagerVersions=false --version` (after core compilation) | 130 | Default pnpm startup stalled; interrupted. |
| `node node_modules/vitest/vitest.mjs run src/practice-invoice-later.test.ts --maxWorkers=2` from packages/db, unchanged source | 1 | First executable red: 5 failed, 2 passed. |
| Same node/vitest command accidentally invoked from repository root after edits | 1 | Runner module absent at root; 0 tests. |
| Same node/vitest command from packages/db after edits | 0 | 7 passed. |
| `/Users/benharwood/Library/pnpm/.tools/pnpm/9.0.0/bin/pnpm --version` | 0 | Read-only version probe: 9.0.0; no checks used this version. |
| `pnpm --version` with cached pinned wrapper | 0 | 10.28.1. |
| `pnpm --filter @jobguard/db exec vitest run src/practice-invoice-later.test.ts --maxWorkers=2` with cached pinned wrapper | 0 | 7 passed; run after date helper extraction. |
| Same pinned unit command after final source/migration/test edits | 0 | Final unit run: 7 passed, 0 failed. |
| `pnpm exec turbo run typecheck --force --concurrency=2` | 0 | 7 tasks successful, 0 cached, 19.698s. |
| `pnpm exec turbo run lint --force --concurrency=2` | 0 | 7 tasks successful, 0 cached, 18.816s. This is package lint, not a lane-lint pass. |
| `pnpm build --force --concurrency=2` | 0 | 7 tasks successful, 0 cached, 56.054s; production Next build generated 41 static pages. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 1 | `Lane boundary FAILED: Missing branch or self-comparison range; refusing a misleading pass.` Uncommitted HEAD equals main; lane registration is also absent. No override/workaround attempted. This is the command behind lint:lanes. |
| `git diff --check` (during and after implementation) | 0 | No tracked diff whitespace errors. |
| `node tools/core-purity-lint.mjs` | 0 | 190 TypeScript files checked. |
| `node tools/money-arithmetic-lint.mjs` | 0 | Passed. |
| `node tools/commercial-boundary-lint.mjs` | 0 | Passed. |
| `node --import tsx src/generate-openapi.ts --check` from apps/api | 0 | OpenAPI unchanged/current; direct loader runs the checker without the tsx CLI IPC listener. |
| Python read-only extraction/comparison of 0166 and 0190 financial/artifact tail | 0 | Identical from invoice SELECT through COMMIT, SHA-256 `d328c52918f60e485f01c0553b3087f0043b84dc6a314958c9e40e7b8de3e021`; 0 new GRANT statements. No permanent source-byte pin test added. |

`--force` was used on all three required root runs; each executed all 7 package checks with **0 cached**. Turbo emitted `WARNING IO error: Operation not permitted (os error 1)` for its shared cache writes while actual package commands continued and succeeded. No cache-write workaround was attempted. Build warnings also included Next's parent-workspace inference, existing CSS `end` compatibility warnings, the Nest/file-type package export warning and load-esm dynamic dependency warning; none stopped the build. UI was left alone.

Memory checks `memory_pressure | tail -1` returned 81% free. Disk checks `df -g /System/Volumes/Data` returned 47 GB, then 46 GB before each forced root run. After completion the displayed free space reached 45 GB, so no more heavy work was launched. No tests overlapped each other or the build. Only the piece's one pure test file was executed; no database/browser/heavy-slot execution was attempted.

## NOT RUN and release evidence

| File / suite | Status and reason |
| --- | --- |
| `packages/db/test/invoice-later.integration.test.ts` (8 cases) | NOT RUN (cannot start PostgreSQL here; socket execution excluded). Includes persisted partial receipt, credit, reversal/overpayment; exact issue replay/audit; date session timezone; generic service payload conflicts; controlled direct concurrent replay; repository credit audit uniqueness; authority before replay and expiry during invoice wait. |
| `packages/db/test/invoice-later-upgrade.integration.test.ts` (1 case) | NOT RUN (cannot start PostgreSQL here). Covers populated pre-0190 install, rollback, apply N alone, row/type/catalog/function comparisons, repeat N, later migrations twice, and required controls. |
| `apps/web/e2e/invoice-later.spec.ts` (1 journey in both `mobile-360` and `desktop`) | NOT RUN (browser/Playwright prohibited locally; CI only, headless). No intercepted successful API; uses the existing real setup helper. |
| `pnpm test` | NOT RUN (whole-suite execution prohibited; dispatcher/CI). |
| `pnpm test:db` | NOT RUN (whole suite and PostgreSQL unavailable here). |
| `pnpm test:migrations` | NOT RUN (whole suite and PostgreSQL unavailable here). |
| `pnpm test:e2e` | NOT RUN (browser/socket execution prohibited; CI only). |
| Existing mandatory DB/browser suites, including 0166 financial expectation suites | NOT RUN (same restrictions; dispatcher/CI must retain them). |
| Independent RED model review and separate acceptance | NOT DONE. No final commit exists yet; builder cannot accept this work. |

No provider fakes or scripted SQL unit responses are presented as PostgreSQL or live integration proof. Acceptance is **partial**: L075/L078/L082 have written but unexecuted real-database coverage, L076/L079/L080 have passing unit coverage plus unexecuted integration coverage, L081 remains HELD. No changed AI behavior or native subsystem; eval/native suites inapplicable. No new configuration/secrets/providers/alerts were introduced. Pending release gates remain unchanged.

## Standard F, migration, compatibility and self inspection

- New GRANT statements in 0190: **NONE** (zero lines to enumerate). No new SELECT/INSERT/UPDATE/DELETE/EXECUTE grant. The installed ACL and jobguard_migration ownership are retained by CREATE OR REPLACE; application login gains no direct protected write permission.
- No business/fingerprinted column or table change, backfill, fee/VAT/cap/subscription change, real money, customer data, actual send, provider invocation, removal or deletion. Existing synthetic/PDF gates remain in place.
- Financial arithmetic and artifacts from 0166 remain byte-for-byte unchanged as recorded above. Historical digest representation remains replay-compatible for the same actor/type/payload. Revoked/expired/non-owner callers no longer replay credits. Waiters see committed command history before invoice balance work; generic service checks semantic identity too.
- Repository projection changes reuse current persisted SQL credit/payment facts. Reads keep single statement snapshots for histories. Issue audit deduplication is under the existing job lock. No new financial write path is introduced.
- Consistent credit lock order: command, service semantic identity where applicable, invoice, receipt/domain mutations, audit. Repository and direct routine share the command namespace. No new business row lock is acquired after audit append.
- Upgrade proof compares canonical `row_to_json(t)::text` for named original columns and full `format_type` names/types; original primary-key identities select surviving rows. Every compared table has rows. Later inserts, nullable columns and replacement functions are permitted; one-microsecond change and retype must fail. These are written assertions, NOT executed verification here.
- No new HTTP route or contractor-track workflow is registered; watchdog registry, guards and replay harness untouched. No shared tests or expectations changed. Overlap with other invoice-repository pieces serializes through the dispatcher.
- Forward-fix after commit; transactional rollback proof is included. Restoring the prior routine would restore the replay race and requires review. Never alter financial history to roll back.
- Self inspection is limited to source and the listed local commands. It is not an independent model verdict, professional sign-off or acceptance.

## STOP / coordinator prerequisites (exact locations, before and after)

**STOP 1 — lane registration, `config/lanes/later-b16.json:1`.** Before: `(file absent)`; no later-b16 entry exists in the legacy registry either. After: unchanged `(file absent)` because the order makes missing shared/pinned registration coordinator-owned. Proposed coordinator replacement is below; it is documentation only and was NOT installed. A committed, non-self comparison range is also required for lane lint.

```json
{
  "version": 2,
  "lanes": {
    "later-b16": {
      "branches": [
        "codex/sandbox/later-b16"
      ],
      "allow": [
        "packages/db/src/practice-invoice-repository.ts",
        "packages/db/src/customer-billing-repository.ts",
        "packages/db/src/practice-invoice-later.test.ts",
        "packages/db/test/invoice-later.integration.test.ts",
        "packages/db/test/invoice-later-upgrade.integration.test.ts",
        "apps/web/e2e/invoice-later.spec.ts",
        "packages/db/migrations/0190_credit_command_replay.sql",
        "packages/db/migration-notes/0190_credit_command_replay.md",
        "docs/verdicts/LATER-B16/BUILDER_RECEIPT.md",
        "docs/ledger/LATER-B16.md"
      ],
      "receipt": "docs/verdicts/LATER-B16/BUILDER_RECEIPT.md",
      "note": "RED; decision 74 PARK; synthetic data only; L081 held for a versioned legacy response contract."
    }
  }
}
```

**STOP 2 — L081 product contract, `apps/api/src/customer-invoice.contracts.ts:29`.** Exact before:

```ts
export const practiceCreditNoteV1=z.object({id:uuid,number:z.string(),netPence:z.number().int().negative(),taxPence:z.number().int().nonpositive(),totalPence:z.number().int().negative(),reason:z.string(),pdfSha256:z.string().length(64),approvedAt:z.string(),sourceInvoiceHash:z.string().length(64)});
```

After: **the exact same line, unchanged**. No approved replacement exists. The required hash strings, signed amounts and approval date cannot represent nullable legacy metadata. A new versioned contract (with explicit unknown provenance/amount/date/hash semantics) must be provided by the coordinator/product owner before this item can proceed. The mapper line `packages/db/src/practice-invoice-repository.ts:58` remains its existing required-value mapping (main line 52; line offset comes from other permitted changes). No nullable fallback or invented legacy facts were inserted. Decision 74 lifts money/access-only holds, not the order's explicit prohibition on inventing this contract.

**Stopped inspection — process listing.** Exact command: `ps -axo pid,etime,command | rg 'pnpm|vitest' | head -20`. Exact refusal: `zsh:1: operation not permitted: ps`. This inspection was not retried or delegated. The surrounding read-only shell batch also looked for optional local pnpm paths; its exit was 1 because those paths were absent. This did not block code or the later checks. No automatic approval-review rejection occurred.

## Read-only inspection and edit record

Read-only commands used `pwd`, `git status --short`, `git rev-parse HEAD origin/main`, `git branch --show-current`, `git show origin/main:<cited file>`, `git diff --numstat`, `git diff --stat`, `git diff --check`, `git ls-files --others --exclude-standard`, `rg --files`, `rg -n`, `head`, `sed -n`, `nl -ba`, `cat`, `ls`, `command -v pnpm`, `node --version`, `memory_pressure | tail -1` and `df -g /System/Volumes/Data`, with paths named in this receipt and the evidence below. Successful inspections returned 0. Negative searches returned 1; shell output explicitly reported absent draft paths `config/lanes/later-b16.json`, `apps/web/e2e/receipts.spec.ts`, `apps/web/e2e/uiwire12-receipts.spec.ts`, `packages/db/migrations/0029_uiwire12_receipts.sql`, optional .npmrc/local pnpm paths, and unmatched draft globs for old billing/0147 tests. Current main's actual files won; no absent prerequisite was created outside the lane. The process inspection refusal is recorded verbatim above.

Python heredoc edits (all exit 0) created the allowed tests before implementation; copied only the current credit routine into 0190 and changed its serialisation/authority prelude; patched the two allowed repositories; extracted the calendar helper; added the owner-expiry database case; wrote migration notes/ledger and the requested commit message. They never changed existing tests, inventory, contracts or lane registration. One combined write-and-test shell exited 1 because the test runner was mistakenly invoked from root; the completed edits were not retried/overwritten from another source. Temporary pnpm wrapper creation/chmod and receipt hash/stat generation returned 0. No Git-writing command was used. No uploaded/downloaded artifact or screenshot was created. `git diff --no-index --stat /dev/null <new-file>` returned its normal difference exit 1 for each new file; the Python inventory command itself returned 0.

Intended commit message is written to `/private/tmp/jg-msg-later-b16.txt` with the subject `fix(billing): preserve invoice facts and credit replay` and a body describing the partial/PARK status. No commit was created.

## File evidence

Only the allowed lane paths appear in final working-tree status. `git diff --stat` excludes untracked files, so the read-only new-file statistics follow separately. Receipt itself is excluded from content hashing to avoid self-reference.

```text
55819d4e0c39164420e575fa186a252eec2bbbdcb3caec82b5f53cbaabcf5ab6  apps/web/e2e/invoice-later.spec.ts
212c0faaadcf526f20052439480acd4392e844fb89daadae5c7fa7b07e661211  docs/ledger/LATER-B16.md
9d49553c3cd6a9fbbc79679e6275affa9c744cc65c70c5284ae0ba2f8c193a4c  packages/db/migration-notes/0190_credit_command_replay.md
b0df28890221496d703501743592c84ac7347feb0bb16fe9cfeb869c40980b63  packages/db/migrations/0190_credit_command_replay.sql
cee4edd736206b5a56d07eb05c8e52a023e20cf9c73df1f837a4240cfe826a1f  packages/db/src/customer-billing-repository.ts
d15d92a971ba1a49180c897fc3ded1d5d350ee309c6edba3591d760123a6ecb0  packages/db/src/practice-invoice-later.test.ts
586f66ee4af01ebce329add248ae008f536dfd9e3703f86b6be9b17655d90359  packages/db/src/practice-invoice-repository.ts
9afc67b2133a4f22a45d32b25cd407444fdd1f51e0c02369e38eeef60dfc5be9  packages/db/test/invoice-later-upgrade.integration.test.ts
43206d7b50daf19d3b9ef10f64cffe478e07c791120911d080aa9c45ad50d8a1  packages/db/test/invoice-later.integration.test.ts
```

Tracked diff:

```text
 packages/db/src/customer-billing-repository.ts | 15 ++++++++++++---
 packages/db/src/practice-invoice-repository.ts | 17 +++++++++++++----
 2 files changed, 25 insertions(+), 7 deletions(-)
```

New file diffs (before receipt):

```text
NEW packages/db/src/customer-billing-repository.ts | 15 ++++++++++++---
 packages/db/src/practice-invoice-repository.ts | 17 +++++++++++++----
 2 files changed, 25 insertions(+), 7 deletions(-)S
```

Unchanged protected/main files (same SHA-256 before/after):

```text
ae66c7ba5465ec9cd34d69af2085ab3f4c2a882f7580c7cae4a1ed68061ffba1  AGENTS.md  unchanged
384fdb07869e780e44e9761a7aaa355ddb4dc0b7fb03b5370d65c47c2891fcdd  BUILD_PLAN.md  unchanged
d9ac38c5bae60a487b2835c1681167ea5bf985f1449469c56eec0403772c8983  packages/db/src/migrate.ts  unchanged
1790932d10a34c8cd0bf2bced5426ebff39717d4c9bafe55f290795ad462356d  packages/db/MIGRATIONS.md  unchanged
8cb2deb27fbeaa0020fc116b3f4591a8adf4949ada09635469445a3932fd94fc  packages/db/migrations/0166_customer_billing_integrity.sql  unchanged
5279e159fe3dadcd7cb0d6401d03a5e640fe9ab0ded44117bc1fd9e5bcacc0fe  apps/api/src/customer-invoice.contracts.ts  unchanged
ec6d3dd219e42707fe0bd6b0550db7f4f260f36c55ff9fee0d36bde831586ef2  apps/api/src/auth/context-boundary.test.ts  unchanged
a07e5784fd37ee475227caf58705b75c587ee344c39f1001e9df82c944e2c5ca  packages/core/src/watchdog.ts  unchanged
3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6  packages/db/test/watchdog-command-harness.ts  unchanged
db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f  packages/db/test/command-replay-contract.integration.test.ts  unchanged
c73d0e1a68fcb7332f44208bb359c5f7b651e09c99f2221c40a446866869613e  packages/db/src/practice-invoice-repository.test.ts  unchanged
92885e42440d143fff75b7e18b7b3b48e4bf6f0b6d4b70a03689b768a33233b0  packages/db/test/practice-invoice-audit.integration.test.ts  unchanged
```

No files outside the issued allow list changed. Final HEAD remains **`31682762c903d716657c573e1b5deae63588aad7`**. This SHA identifies the base; the **uncommitted diff** is what the dispatcher must commit and have independently checked. The dispatcher must not bind a verdict on this base SHA to the uncommitted implementation.
