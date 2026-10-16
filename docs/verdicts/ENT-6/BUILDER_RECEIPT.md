Built by Codex; dispatched 13 Oct 2026; source work 15 Oct 2026.

# ENT-6 builder receipt — partial independent foundation, RED

The requested attribution “Built by Claude Sonnet 5.5, Codex unavailable; dispatched 13 Oct 2026” is not factual for this run. Codex built these working-tree changes; no Claude build or independent review occurred.

Task/branch: `ENT-6` / `codex/sandbox/ent-6`. Initial and final HEAD and inspected origin/main: `9865e4b32b71c75b763240bcdf27bd6a75b42f34`. All changes remain uncommitted; the dispatcher must commit before an independent verdict can bind the actual diff. No git add, commit, push, checkout, reset, removal or destructive cleanup was performed. Intended commit message: `/private/tmp/jg-msg-ent-6.txt`.

## Scope and result

C1 **server-only independent preparation**, not the full server/database slice and not full-card completion. Added strict data schemas; CSV/API normalization and semantic/source hashes; deterministic labelled export JSON/CSV and UUIDv8 line IDs; exact SH-1 allocation with ordinary lines and mixed ratios/jobs; a restricted one-invoice recomputation evaluator; process-local fake adapters; three new test files; contract/operations notes. No screen, browser specification, route, writer, repository, migration, grant, outbox integration or fee is added.

Tests were authored before their corresponding implementation (including added cases before later refinements). **First failing test run: NOT RUN** because the pinned package runner refused its signature check; this is not a red/green TDD execution claim. Static inventory: 8 core contract cases, 11 ordering/allocation cases, 9 adapter/parser cases (one three-channel parameterization), **28 authored / 0 executed / 0 passed**.

Only deterministic source attestations and `git diff --check` completed. Neither proves implementation correctness. No acceptance criterion is reported as passed; partial source coverage is identified below. No live integration, professional sign-off, acceptance or release approval is claimed.

## Base/contract reconciliation

The issued base equals main exactly. The draft's older main SHA and assertion that ENT-5 is unmerged are superseded: main HEAD is #215, migration 0157. Existing ENT-3b/c/d migrations 0139–0141 and CH-7/ENT-10e 0142–0143 are present. No prerequisite branch was fetched or stacked. ENT-5b #217 is not treated as a prerequisite.

Compared the current plan card at BUILD_PLAN.md:923–958, export/import contract at :627–634, role transition table at :595–596, current role map at packages/db/migrations/0054_contractor_organisation.sql:104–105 and transitions.ts:80–90. The role conflict remains. Main wins over draft observations where different. Current ENT-5 contract at docs/contracts/extra-approval-v1.md:14–22 supplies source bindings and pure constraints, expressly holding integrated approval-chain execution. Its real repository is a source-binding reader; no approval flag or invented fixture replaces genuine chain execution. The existing origin-ordering adapter at packages/db/src/extra-repository.ts:158 still has an empty candidate list; ENT-6 does not consume it as candidate completeness.

Migration **0160** is the allocated number; the draft placeholders/0074 are superseded. It is **NOT BUILT/NOT REGISTERED** because Q2's separately authorized compatibility prerequisite is absent. No column/backfill/function/privilege changes. Rule-9 migration upgrade proof is not applicable to this source-only diff and remains owed when the migration is released; the required verbatim contract and controls are retained in the new contract document.

## STOP: coordinator-owned catalogue prerequisite Q2

At `packages/db/test/tenancy.integration.test.ts:200`, before:

```ts
      { relname: "cap_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Required after (coordinator only; every existing row retained):

```ts
      { relname: "billing_allocation_run", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_application_event", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_batch", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_delivery", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_export_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_invoice_line", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_line_fact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_line_match", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_quarantine", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "billing_status_import", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "cap_snapshot", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

At line 214, before:

```ts
      { relname: "contractor_resident_contact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

Required after:

```ts
      { relname: "contractor_receipt_line_allocation", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
      { relname: "contractor_resident_contact", relrowsecurity: true, relforcerowsecurity: true, guarded: true },
```

At line 448, before:

```ts
      { relname: "cap_snapshot", owner: "jobguard_migration" },
```

Required after:

```ts
      { relname: "billing_allocation_run", owner: "jobguard_migration" },
      { relname: "billing_application_event", owner: "jobguard_migration" },
      { relname: "billing_export_batch", owner: "jobguard_migration" },
      { relname: "billing_export_delivery", owner: "jobguard_migration" },
      { relname: "billing_export_line", owner: "jobguard_migration" },
      { relname: "billing_fact", owner: "jobguard_migration" },
      { relname: "billing_invoice_line", owner: "jobguard_migration" },
      { relname: "billing_line_fact", owner: "jobguard_migration" },
      { relname: "billing_line_match", owner: "jobguard_migration" },
      { relname: "billing_quarantine", owner: "jobguard_migration" },
      { relname: "billing_status_import", owner: "jobguard_migration" },
      { relname: "cap_snapshot", owner: "jobguard_migration" },
```

At line 462, before:

```ts
      { relname: "contractor_resident_contact", owner: "jobguard_migration" },
```

Required after:

```ts
      { relname: "contractor_receipt_line_allocation", owner: "jobguard_migration" },
      { relname: "contractor_resident_contact", owner: "jobguard_migration" },
```

These are the prerequisite catalogue changes the proposed 12-table schema would need, not edits made by ENT-6. Other reviewed privilege inventories must also be aligned by their owner as applicable. There is no attempt to bypass exact catalogue expectations.

## STOP: pinned package runner and process inspection

Command `export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version` was part of the initial resource/version shell. Its exact refusal line was:

> [ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.

The compound shell ultimately exited 0 because its later read-only git command succeeded; **pnpm did not succeed**. A second version-discovery command, `export PATH="$HOME/Library/pnpm/bin:$PATH"; npm_config_manage_package_manager_versions=false pnpm --version`, had already started before the first refusal was received. It exited 1 with the same signature refusal. No version-switch bypass, alternate runner, download/install, or retry was attempted after that refusal was known. The launcher also reported that its `pnpm.overrides` setting is ignored; no package/configuration change was attempted.

The initial read-only diagnostic `ps -o pid,ppid,command -ax | rg 'pnpm --version|corepack|pnpm.cjs'` returned exact refusal `zsh:1: operation not permitted: ps` (compound exit 1). Process inspection stopped; no alternate process inspection route was attempted.

These are local runner/sandbox refusals, not test failures and not an automatic approval-review rejection. Repair of the verified pinned runner is dispatcher-owned.

## Checks and NOT RUN inventory

Before any proposed heavy run: `memory_pressure | tail -1` reported **53% free**; `df -g /System/Volumes/Data` reported **71 GB available**. Node **v24.17.0**. No heavy build/test was started, so no concurrent heavy jobs or shared-slot invocation occurred. Dependencies were already present; `pnpm install` was deliberately not run per the final dispatch.

- `packages/core/src/contractor-billing.test.ts`: NOT RUN (pinned pnpm signature refusal); 8 authored cases.
- `packages/core/src/contractor-billing-ordering.test.ts`: NOT RUN (same); 11 authored cases, including exhaustive 24 arrival permutations.
- `apps/api/src/contractor/billing.adapters.test.ts`: NOT RUN (same); 9 authored cases after parameterization.
- Typecheck `pnpm exec turbo run typecheck --force`: NOT RUN (same).
- Lint `LANE_BASE_REF=origin/main pnpm exec turbo run lint --force`, root `node tools/lint.mjs` / `pnpm lint` and `pnpm lint:lanes`: NOT RUN (same; no alternate route around the runner refusal).
- Build `pnpm build --concurrency=2 --force`: NOT RUN (same). **No cache-hit or cache-off green claim.** Required `--force` commands were not executed.
- OpenAPI generation/check: NOT RUN (same). No registered controller/route or OpenAPI input was changed; generated JSON untouched.
- `pnpm test`, `pnpm test:db`, `pnpm test:migrations`, `pnpm eval` and all broad regression inventories: NOT RUN. The dispatch limits local tests to own files; repository regression verification is dispatcher/CI work. No broad command or equivalent batch is claimed. No model, prompt, extraction parser or AI gateway behavior changed; fixture regression remains owed.
- Eight new contractor-billing database suites (export, import, allocation, ordering, delivery, replay, catalog, upgrade): **NOT BUILT** because execution is held and Q2 prevents schema construction; **NOT RUN (cannot start PostgreSQL here)**. No skipped-success test or fixture-only approval path substitutes for them.
- New billing application/HTTP/Next route suites: NOT BUILT with H1/H3/H5; NOT RUN. No server success stub or fabricated HTTP persistence.
- All existing PostgreSQL suites: NOT RUN (sandbox cannot start PostgreSQL; no attempt authorized). All earlier merged tests/pins remain unchanged.
- All browser/Playwright suites: NOT RUN (founder 15 October rule: CI only). New screens and browser journeys are NOT BUILT under H6.
- Auth bridge/context-boundary, watchdog/replay, fingerprint, tenancy, origin/fee/allocation regressions: NOT RUN. Source equality evidence below is distinct from their execution.

No executable package checks were attempted after refusal; this records the omission without claiming that nonexistent test runs failed or passed.

## Acceptance coverage and holds

All E6 IDs remain unaccepted. Authored independent unit coverage: E6-01 (data/parser strictness only), E6-02 (configuration/fakes only), E6-06 (renderer only), E6-11/12 (normalization/identity only), E6-13–20 (represented composition, exact arithmetic, mixed-job denominator, deposits, credits, rejection and reversals for established-order fixtures), E6-22 (pure drill-down totals only), E6-24 (process-local adapter contract only). E6-14 has the pure ENT-F2 fractions but no persisted Q invocation. E6-33 has this truthful scope/hold record, not an independent verdict.

E6-03–10 persisted authorization/isolation/export/duplicate/race assertions, E6-11–22 persisted fact/complete-source/match/quarantine/derivation/projection assertions, E6-23–28 durable authorization/delivery/replay/atomicity/privilege assertions, E6-29 migration proofs, E6-30 actual shared HTTP persistence, E6-31 persisted exclusion queries, E6-32 full regressions, and E6-33 recorded independent verdict/separate acceptance remain NOT BUILT or NOT RUN as applicable. No exact named replay property is presented as proved. Pure holds are not durable quarantine or reviewed release authority.

H1/Q1: no governing export/import role list or commercial-manager coverage selected; writer/route composition held. H2/Q3: no false-positive dismissal state/authority; genuine candidate interface still required. H3/Q4: no post-closure financial write rule, exception or writer. H4/Q5: no same-time/conflicting-composition causal policy or release authority. H5/Q6: no decided delivery lifetime, durable claim, execution or reconciliation. H6: screens/browser journeys/full card parked. H7: all downstream fee/invoice/connector/native/production and other exclusions retained.

No production activation: G1/ENT-14 pilot agreement, DPA/D12/D16 and approved provider routes; G4-C/D02/D16/solicitor-reviewed charging contract; G5 per live connector; independent recorded verdict and separate acceptance remain external gates. Nothing is approved by this builder.

## GRANT inventory and invariants

**New GRANT statements: NONE.** Standard F preserved: no direct INSERT/UPDATE/DELETE/TRUNCATE grant to jobguard_runtime; no table or EXECUTE grant, owner/role membership change, definer helper or infrastructure access is introduced. Future new billing tables remain SELECT-only under the order. No audit chain, money, membership, receipt or authorization write occurs here.

Exact money and SH-1 fraction bounds are reused unchanged; core has no network/database/vendor imports. Synthetic observations are not settlement evidence. Approval bindings in renderer input are data, not completed approval checks. Matched-extra allocation is not Q or a fee. Existing origins, snapshots, quote/invoice/fingerprinted tables, money, auth constructor/bridge and worker remain untouched.

No environment, provider/register, migration or alert changes are necessary for process-local tools. Backwards compatibility: additive core export and independent modules only. Reversible choices: fixed CSV headers/escaping and size bounds, UUIDv8 contract/revision identity, canonical text and data-only inspection intents. No price, VAT, fee, authorization, retention or legal policy was decided.

## Source self-review (not independent review)

Source-inspected: normalized economic identity excludes transport; event rows group into one event; original-order lines retain zero matched-extra contribution and stay in the invoice denominator; matching fields remain strict representations pending real DB validation; exact output never rounds per line; reversals use remaining allocations/ratios; same-time and competing compositions return an evaluator-limit error without a policy decision. Fake adapters have no network implementation and are not registered in outbox execution. No business locks/audit order is invented.

Limitations found and retained explicitly: pure totals and source-declared sums cannot establish authoritative composition completeness or a real export match. The evaluator supports one established invoice composition and distinct instants; it is not a general production importer or quarantine/release service. Fake state disappears on restart. No runtime typecheck or test result is available. Reconnection, cross-batch uniqueness, privileged catalogue checks, covering grants, live guards, persisted replay/atomicity and all commercial authority remain unbuilt. A future real writer must validate stored evidence and its own scope, never trust these pure outputs.

Self-review is source inspection only. No builder self-acceptance. A different model must record a real verdict against the dispatcher-created exact commit and a separate actor must record acceptance. This HEAD identifies the starting commit, not an independent verdict for dirty working-tree contents.

## Lane, hashes and changes

Existing lane entries compare unchanged after removing only the new ent-6 entry from the parsed object; core index preserves its original bytes as a prefix plus one export line. Shared registry/index edits must serialize at landing. No BUILD_PLAN.md edit was made; any later work/reservation amendment belongs to the dispatcher.

`git diff --stat` for tracked files at attestation time:

```text
 config/agent-lane-assignments.json | 1 +
 packages/core/src/index.ts         | 1 +
 2 files changed, 2 insertions(+)
```

Git leaves new files untracked by instruction; the following SHA-256/line inventory includes them (receipt excluded from its own hash). This is receipt evidence, not a permanent test pin:

| File | Lines | SHA-256 |
|---|---:|---|
| `apps/api/src/contractor/billing.adapters.test.ts` | 99 | `0ed8ac3e8cf2f346a12d7f328206f347e69442ecf5c07816d6997df90493650d` |
| `apps/api/src/contractor/billing.adapters.ts` | 67 | `49de8376249753c8475163f890e4fa203467284bbf8a3da6c0c309eb87f9c14a` |
| `apps/api/src/contractor/billing.contracts.ts` | 19 | `060ce82c7de882bf15e450b7a0fb0cd778527c5e7f834ed2a9b5be486eea3ac4` |
| `docs/contracts/contractor-billing-v1.md` | 81 | `d8815db58392dd32be7b116cb92ece524bdfef2bcf553a2022d443ac01ac9810` |
| `docs/operations/contractor-billing-synthetic.md` | 23 | `68d186d9547e81db30ea7270a8ee2dd1ab1c856d690e8cb1f9601541bd328bdb` |
| `packages/core/src/contractor-billing-ordering.test.ts` | 137 | `8091f73a0afeef09c16df28ecd0a1dfb5af7dede961d536b991eb3684b5f10af` |
| `packages/core/src/contractor-billing.test.ts` | 123 | `3bc4e32940d59159df54e7d20a46aeaf283dbe2af5174c05e842c718e688d6b8` |
| `packages/core/src/contractor-billing.ts` | 442 | `54244d8b4444deae3a504799d35d3e9dc73265b4a985d26fb8c6d53eededf2ec` |
| `config/agent-lane-assignments.json` | 191 | `f9eb12bf333e441cd9edf03ec0a542ef78817704f4bc58470f7c2d07e5cd88df` |
| `packages/core/src/index.ts` | 73 | `180bf43578b6fe53daa701ca7d3b5aa08af402d611b305377d73e100f5c9a8e5` |

Source checks against exact HEAD, all equal:

| Protected path | SHA-256 |
|---|---|
| `packages/db/test/tenancy.integration.test.ts` | `cdc958e1afaf59c4c3f8545fc8db7c6414afa82c928b41afeade11cd999141ec` |
| `apps/api/src/auth/context-boundary.test.ts` | `a848f5e873ca9cc0811e90adf5a35ae18fe4f1ae1da5f889f00ea29ccd287d35` |
| `packages/core/src/watchdog.ts` | `1628a2c3dc2d24cdb20c11ded7461a9206af9e71f918bff571ba51e66cf9aaf7` |
| `packages/db/test/watchdog-command-harness.ts` | `3bad6abf073b44b84575a7421ddaf7b275d9a75d2d93b20bcf744ed4d3fbbbd6` |
| `packages/db/test/command-replay-contract.integration.test.ts` | `db2315937aad7fe0443f020060a2575aa79f509ec344a35dd8387626ba5de62f` |
| `packages/db/src/migrate.ts` | `302f2cdcc2bfaa4a17ab730225404631634aa5ba02c9d027c20683fc79b03cc5` |
| `packages/db/src/extra-repository.ts` | `ce3db85c3a7d057cca592b73e89ecce468fe79d0b7c5961aa6368ef75125dbde` |
| `packages/db/src/extra-approval-repository.ts` | `61e6c49d3d6511425f7154932babb5fe58542d14dd853c270ae729aa4d64a2af` |

The two tracked modifications plus eight new source/doc files and this receipt are the entire lane diff. No merged test was edited. No permanent test pins another file's bytes.

## Command ledger

Every shell execution did read-only inspection, wrote an authorized lane file/message/evidence file, or encountered the refusals above. Apply-patch editing is not a shell check; its successful file writes are not test evidence. Some exploratory reads ended with missing-file/no-match exit codes, recorded below. No shell test executed.

Initial commands before the structured ledger:

1. `pwd; git status --short; git rev-parse HEAD; git rev-parse origin/main; rg --files -g 'AGENTS.md' -g 'package.json' -g '*contractor*' -g '*receipt-allocation*' -g '*exact*pence*' -g '*ent5*' -g '*approval*' -g 'BUILD_PLAN.md' -g 'agent-lane-assignments.json'`: exit 0; 0 tests.
2. `cat AGENTS.md; cat package.json; cat packages/core/package.json; cat packages/api/package.json 2>/dev/null; cat config/agent-lane-assignments.json`: exit 0 for the compound shell (the exploratory packages/api path does not exist); 0 tests.
3. `rg -n 'ENT-6|9.1.8|Billing export|ENT-5|billing_|businessTables|expectedTables|extra_approval' BUILD_PLAN.md packages/db/test/tenancy.integration.test.ts docs/contracts/extra-approval-v1.md packages/db/src/extra-approval-repository.ts; cat packages/core/src/receipt-allocation.ts; cat packages/core/src/money.ts; cat packages/core/src/exact-pence.ts; cat apps/api/src/contractor/site-extra.adapters.ts; cat packages/db/src/outbox.ts`: exit 0 for compound shell (two exploratory paths missing); 0 tests.
4. Lane-registration Python command: inserted one new compact ent-6 JSON entry with exact independent file paths after asserting the lane was absent; exit 0; 0 tests.
5. `cat /Users/benharwood/Library/pnpm/bin/pnpm; rg -n 'tables|sort\\(|extra_approval|toEqual\\(' packages/db/test/tenancy.integration.test.ts | tail -35; sed -n '605,635p' BUILD_PLAN.md; cat tsconfig.json; sed -n '1,90p' tools/lint.mjs; rg -n 'immutable|frozen|exact|export' packages/core/src/enterprise-domain/boundaries.test.ts`: exit 0; 0 tests.
6. Evidence-read Python command printed /private/tmp/jg-ent6-evidence.json; exit 0; 0 tests.

The structured ledger below includes resource checks, all remaining inspections, the source-attestation script and intended-message write. Async version-command completions are folded into their originating entries, as stated above.

### Command 1

```sh
sed -n '300,400p' AGENTS.md; cat package.json; cat packages/core/package.json; cat apps/api/package.json; head -25 config/agent-lane-assignments.json; rg -n 'ent-6|ENT-6' config/agent-lane-assignments.json
```

Exit: 1; executed test count: 0.

### Command 2

```sh
rg -n '^### ENT-6|^### ENT-5|^### 9.1.[4-9]|^### 9.1.13|^## 2.4|^## 12.3' BUILD_PLAN.md; cat docs/contracts/extra-approval-v1.md; rg -n 'expected|billing_|const .*Tables|businessTables' packages/db/test/tenancy.integration.test.ts
```

Exit: 1; executed test count: 0.

### Command 3

```sh
rg --files packages/core/src | rg 'shared|exact|hash|canonical'; head -70 packages/core/src/receipt-allocation.ts; head -100 packages/core/src/index.ts; cat packages/core/tsconfig.json; cat tools/check-agent-lanes.mjs
```

Exit: 1; executed test count: 0.

### Command 4

```sh
memory_pressure | tail -1; df -g /System/Volumes/Data; node --version; export PATH="$HOME/Library/pnpm/bin:$PATH"; pnpm --version; git branch --show-current
```

Exit: 0 for compound shell; pnpm subcommand refused (see STOP); executed test count: 0.

### Command 5

```sh
sed -n '1,110p' tools/agent-lane-boundary-lint.mjs; sed -n '680,805p' BUILD_PLAN.md; sed -n '890,975p' BUILD_PLAN.md; sed -n '1,85p' packages/db/test/tenancy.integration.test.ts
```

Exit: 0; executed test count: 0.

### Command 6

```sh
cat packages/core/src/cumulative-fee.ts | head -180; rg -n 'canonical|sha256|hash' packages/core/src/extra-approval.ts packages/core/src/sor-pricing.ts packages/core/src/extra-persistence.ts; rg -n 'export.*canonical|function.*canonical|function.*[Hh]ash' packages/core/src; sed -n '1,95p' packages/db/src/extra-approval-repository.ts; sed -n '1,55p' packages/db/migrations/0157_extra_approval.sql
```

Exit: 0; executed test count: 0.

### Command 7

```sh
sed -n '1,75p' packages/db/test/tenancy.integration.test.ts; sed -n '635,677p' BUILD_PLAN.md; sed -n '1,55p' packages/core/src/cumulative-fee.ts; rg -n 'sha256|canonical' packages/core/src/evidence-pack.ts; rg -n 'compareServerInstants' packages/core/src/enterprise-domain/*.ts
```

Exit: 0; executed test count: 0.

### Command 8

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; command -v pnpm; ls -l "$HOME/Library/pnpm/bin/pnpm"; ls node_modules/.bin; ps -o pid,ppid,command -ax | rg 'pnpm --version|corepack|pnpm.cjs' 
```

Exit: 1; executed test count: 0.

### Command 9

```sh
python3 - <<'PY'
from pathlib import Path
p=Path('/Users/benharwood/Library/pnpm')
print('\n'.join(str(x) for x in p.glob('**/pnpm.cjs'))[:3000])
PY
```

Exit: 0; executed test count: 0.

### Command 10

```sh
export PATH="$HOME/Library/pnpm/bin:$PATH"; npm_config_manage_package_manager_versions=false pnpm --version
```

Exit: 1 (pnpm signature refusal); executed test count: 0.

### Command 11

```sh
whence -a pnpm; ls -l /opt/homebrew/bin/pnpm /usr/local/bin/pnpm packages/core/node_modules/.bin/vitest; ls -d /Users/benharwood/Library/Caches/node/corepack/* /Users/benharwood/.cache/node/corepack/* /Users/benharwood/Library/pnpm/.tools/pnpm/*
```

Exit: 1; executed test count: 0.

### Command 12

```sh
rg -n 'MANAGE_PACKAGE|managePackageManager|manage.package.manager' /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0_tmp_19591/node_modules/pnpm/dist/pnpm.cjs | head -8; sed -n '177,197p' packages/db/test/tenancy.integration.test.ts; sed -n '428,443p' packages/db/test/tenancy.integration.test.ts
```

Exit: 0; executed test count: 0.

### Command 13

```sh
rg -n '^export function (exactPence|parseExactPence)|sumExactPence' packages/core/src/cumulative-fee.ts; cat tools/core-purity-lint.mjs; cat tools/money-arithmetic-lint.mjs | head -110; cat apps/api/src/contractor/site-extra.contracts.ts | head -65; cat packages/db/src/index.ts | rg 'outbox'
```

Exit: 0; executed test count: 0.

### Command 14

```sh
git log -1 --format='%H %s'; nl -ba docs/contracts/extra-approval-v1.md | tail -18; nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '189,211p'; nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '438,460p'; rg -n 'data.export|data.import|commercial_manager' packages/db/migrations/0054_contractor_organisation.sql | tail -15; rg -n 'ImportBillingStatus|FinaliseExportBatch|exported onwards' BUILD_PLAN.md packages/core/src/enterprise-domain/transitions.ts; git status --short
```

Exit: 0; executed test count: 0.

### Command 15

```sh
rg -n 'export (class BillingDataError|type BillingStatus|.*billingExportV1|.*BillingAllocation)' packages/core/src; sed -n '135,160p' packages/core/src/enterprise-domain/contracts.ts; sed -n '70,104p' packages/core/src/cumulative-fee.ts; rg -n 'deterministic|candidate|unresolvedCandidateIds' packages/db/src/extra-approval-repository.ts packages/db/src/extra-repository.ts; git diff --check; git diff --stat; git status --short
```

Exit: 0; executed test count: 0.

### Command 16

```sh
nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '208,227p'; nl -ba packages/db/test/tenancy.integration.test.ts | sed -n '456,475p'; git log -6 --format='%h %s'; rg -n 'M4-8|015[4-9]|014[0-3]' packages/db/src/migrate.ts | tail -15; git diff --numstat
```

Exit: 0; executed test count: 0.

### Command 17

```sh
nl -ba BUILD_PLAN.md | sed -n '949,965p'; git diff --check; git diff -- packages/core/src/index.ts; rg -n 'it\(|it.each' packages/core/src/contractor-billing.test.ts packages/core/src/contractor-billing-ordering.test.ts apps/api/src/contractor/billing.adapters.test.ts; git status --short
```

Exit: 0; executed test count: 0.

### Command 18

```sh
python3 - <<'PY'
import hashlib, json, subprocess
from pathlib import Path
base=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
paths=subprocess.check_output(['git','ls-files','--modified','--others','--exclude-standard'],text=True).splitlines()
protected=['packages/db/test/tenancy.integration.test.ts','apps/api/src/auth/context-boundary.test.ts','packages/core/src/watchdog.ts','packages/db/test/watchdog-command-harness.ts','packages/db/test/command-replay-contract.integration.test.ts','packages/db/src/migrate.ts','packages/db/src/extra-repository.ts','packages/db/src/extra-approval-repository.ts']
rows=[]
for path in protected:
    current=Path(path).read_bytes()
    previous=subprocess.check_output(['git','show',base+':'+path])
    rows.append({'path':path,'sha256':hashlib.sha256(current).hexdigest(),'unchanged':current==previous})
original=json.loads(subprocess.check_output(['git','show',base+':config/agent-lane-assignments.json'],text=True))
updated=json.loads(Path('config/agent-lane-assignments.json').read_text())
updated['lanes'].pop('ent-6')
index_before=subprocess.check_output(['git','show',base+':packages/core/src/index.ts'])
evidence={'head':base,'paths':paths,'protected':rows,'existing_lanes_unchanged':updated==original,'index_prefix_unchanged':Path('packages/core/src/index.ts').read_bytes().startswith(index_before),'files':[{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest(),'lines':len(Path(p).read_text().splitlines())} for p in paths]}
Path('/private/tmp/jg-ent6-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n')
print(json.dumps(evidence,indent=2))
PY
```

Exit: 0; executed test count: 0.

### Command 19

```sh
python3 - <<'PY'
from pathlib import Path
Path('/private/tmp/jg-msg-ent-6.txt').write_text('feat(billing): add independent synthetic ENT-6 data foundations\n\nAdd strict billing data schemas, CSV/API normalization, immutable artifact rendering, exact SH-1 allocation and restricted unambiguous fixture recomputation, plus process-local delivery fakes and new tests.\n\nKeep H1-H7 and catalogue compatibility holds explicit. No migration, grants, checked writers, routes, worker registration, UI or fees. Migration 0160 remains unused.\n\nValidation: source attestations and diff whitespace check only. Package checks NOT RUN after pnpm 10.28.1 signature verification refusal; no PostgreSQL/browser runs. See docs/verdicts/ENT-6/BUILDER_RECEIPT.md.\n')
PY
 git diff --check
```

Exit: 0; executed test count: 0.


Final receipt write and final `git diff --check`/status/HEAD check are recorded in the closing note after execution. Intended-message file creation exited 0; its command also ran diff whitespace checking with exit 0.

LATER: Billing/reconciliation screens remain parked. Full ENT-6 card stays open. No fees, production activation or independent acceptance is issued.

## Closing deterministic check

Executed the following final compound command; exit **0**, **0 tests**, no attested source file changed, HEAD still `9865e4b32b71c75b763240bcdf27bd6a75b42f34`:

```sh
git diff --check; git diff --stat; git status --short; git rev-parse HEAD; python3 - <<'PY'
import hashlib,json,subprocess
from pathlib import Path
x=json.loads(Path('/private/tmp/jg-ent6-evidence.json').read_text())
changed=[f['path'] for f in x['files'] if hashlib.sha256(Path(f['path']).read_bytes()).hexdigest()!=f['sha256']]
print('attested source files changed:',changed)
for p in x['paths']:
    if p not in ['config/agent-lane-assignments.json','packages/core/src/index.ts']:
        r=subprocess.run(['git','diff','--no-index','--stat','--','/dev/null',p],text=True,capture_output=True)
        print(r.stdout.strip())
        print('diff exit:',r.returncode,'(1 denotes the new-file difference)')
print('receipt lines:',len(Path('docs/verdicts/ENT-6/BUILDER_RECEIPT.md').read_text().splitlines()))
print('intended message present:',Path('/private/tmp/jg-msg-ent-6.txt').is_file())
PY
```

`git diff --check` passed. `git diff --stat` remained two tracked additions. Eight new source/doc file stats were 99, 67, 19, 81, 23, 137, 123 and 442 added lines (991 total); each no-index diff returned 1 because it reports a new-file difference, not a check failure. The intended message file exists. This receipt is the ninth new file. The final receipt-only append used apply_patch successfully; it does not change any attested source hash or constitute package validation.




## Repair r1

15 October 2026; dispatcher 11; PR #220; inspected HEAD `dfcf3d3e6af64294f70195b744c4e2dffb969ea8`, branch `codex/sandbox/ent-6`. This section supersedes the original receipt's zero-executed-test report for this repair only. Changes remain in the working tree for dispatcher commit. No Git write commands, package downloads, pin changes, PostgreSQL starts, browser or Playwright runs were performed.

### Changes and scope

- Fixed the CSV grouping fallback's `never[]` inference with an explicit `unknown[]` element type; untrusted entries still pass the existing strict schema validation.
- Removed `node:crypto` from the new core test and used the existing pure SHA-256 helper. The CSV/JSON hash comparisons and all original expected money values remain asserted.
- Both CSV writers now prefix cells beginning with `=`, `+`, `-`, `@` or an apostrophe with an apostrophe before CSV quoting. The status reader reverses one escape, including escaped literal apostrophes, preserving source text, identities and semantic hashes. JSON keeps source text. Documented this CSV convention and added a regression covering both writers, descriptions, units, source/invoice/line identities, embedded quotes/newlines and Unicode.
- Receipt allocation now requires complete current outstanding balances at the Zod boundary and has no original-gross fallback. Reversals instead require original movement remaining allocations with null outstanding balances. Updated only the ENT-6 fixtures to supply balances and added adversarial missing/null/incomplete/duplicate/unknown/negative/oversized/exhausted-balance checks. Existing reversal and ENT-F2 assertions remain unchanged.
- Only ENT-6-owned source/tests, its contract and this receipt are changed. Read-only Git inspection confirmed both edited test files are absent from `origin/main`; no merged test was changed. The lane configuration is byte-for-byte unchanged from HEAD (SHA-256 `f9eb12bf333e441cd9edf03ec0a542ef78817704f4bc58470f7c2d07e5cd88df`). No operational alerts, migration, external action or production activation added.

### Executed checks

Commands below ran from the worktree root except where stated. The dependencies were already installed; no clean-install claim is made. Direct installed tools were used after the pnpm launcher stalled.

| Command | Exit | Evidence |
| --- | --- | --- |
| `pnpm exec turbo run typecheck --force --filter=@jobguard/core --filter=@jobguard/db` | 130 | Launcher emitted its ignored-`pnpm.overrides` warning, then stalled before Turbo/check execution; interrupted. |
| `npm_config_manage_package_manager_versions=false pnpm --version` | 130 | Same launcher stall; interrupted. |
| `pnpm --manage-package-manager-versions=false --version` | 130 | Same launcher stall; interrupted. |
| `node_modules/.bin/turbo run typecheck --force --filter=@jobguard/core --filter=@jobguard/db` | 0 on interruption | Started core/storage tasks, which stalled in pnpm; interrupted with **0 successful tasks**. Not counted as a typecheck pass. |
| `node_modules/.bin/tsc -p packages/core --noEmit` | 0 | Core typecheck actually executed and passed. |
| `node_modules/.bin/tsc -p packages/db --noEmit` | 0 | DB typecheck actually executed and passed. |
| `node_modules/.bin/tsc -p apps/api --noEmit` | 0 | API typecheck passed. |
| `node_modules/.bin/tsc -p apps/web --noEmit` | 0 | Web typecheck passed. |
| `~/.local/bin/heavy-slot ent-6-r1-core packages/core/node_modules/.bin/vitest run packages/core/src/contractor-billing.test.ts packages/core/src/contractor-billing-ordering.test.ts --maxWorkers=2 --reporter=verbose` | 0 | **21 tests passed**, 2 files: 9 contracts/export tests and 12 allocation/ordering tests. |
| `~/.local/bin/heavy-slot ent-6-r1-adapters apps/api/node_modules/.bin/vitest run apps/api/src/contractor/billing.adapters.test.ts --maxWorkers=2 --reporter=verbose` | 0 | **9 tests passed**, 1 file, including all three fake channels and independent Node-crypto tampering checks. |
| `LANE_BASE_REF=origin/main node tools/lint.mjs` | 0 | Core purity, lane boundary, money arithmetic and commercial boundary guards passed. |
| `LANE_BASE_REF=origin/main node tools/agent-lane-boundary-lint.mjs` | 0 | `lint:lanes` implementation passed against origin/main. |
| `node_modules/.bin/tsc -p packages/core` | 0 | Core build passed. |
| `node_modules/.bin/tsc -p packages/config` | 0 | Config build passed. |
| `node_modules/.bin/tsc -p packages/storage` | 0 | Storage build passed. |
| `node_modules/.bin/tsc -p packages/ai` | 0 | AI build passed. |
| `node_modules/.bin/tsc -p packages/db` | 0 | DB build passed; no database process or SQL execution. |
| `node_modules/.bin/nest build` (cwd `apps/api`) | 0 | API build passed. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`), first attempt | 1 | Missing unbuilt DB dist import. Built package dependencies, then reran below. |
| `node --import tsx src/generate-openapi.ts --check` (cwd `apps/api`), after package builds | 0 | OpenAPI check passed; committed OpenAPI unchanged. |
| `~/.local/bin/heavy-slot ent-6-r1-web-build ../../node_modules/.bin/next build` (cwd `apps/web`), first attempt | 1 | Started before API build finished; missing API dist contract imports. Rerun after successful API build recorded below. |
| `~/.local/bin/heavy-slot ent-6-r1-web-build ../../node_modules/.bin/next build` (cwd `apps/web`), after API build | 0 | Full web production build passed, including type validation and 32 static pages. Emitted workspace-root, CSS/autoprefixer, Nest file-type and dynamic dependency warnings. No browser launched. |
| `git diff --check` | 0 | No whitespace errors. |
| Read-only Python/Git source-attestation check | 0 | Exact lane bytes, unchanged HEAD, changed tests absent from origin/main, no pins changed. |

**30/30 ENT-6 tests actually executed and passed (original 28 plus two regressions), zero skipped.** The core verbose run includes ENT-F2 extra gross `300000/31` and net `250000/31` pence, the reversal `-250000/31` case, and the loop over all **24 arrival-order permutations** of invoice/payment/credit/reversal. These are unit and process-local adapter tests, not persisted PostgreSQL or live-provider proofs. Each Vitest invocation used heavy-slot and `--maxWorkers=2`, with at most two files per invocation. Heavy-slot printed sandbox-denied `sysctl`/`pgrep` monitoring warnings but acquired its slot and executed both commands successfully.

### Remaining gates

Full-card ENT-6/H1–H7/catalogue holds in the existing receipt remain. No independent review, technical acceptance, founder approval or release is claimed. No schema/migration changes in this repair. Real PostgreSQL suites and browser checks are deferred to GitHub CI after dispatcher push, per the issued environment constraint. The full repository unit/integration/browser matrix was not run locally. The direct checks above do not constitute a successful pnpm/Turbo aggregate run.

Final dispatcher handoff: all seven package/application build scripts completed successfully through the installed tools; the four direct core/DB/API/web typechecks, repository lint guards, lane lint and OpenAPI check exited 0. The final lint rerun also exited 0. Intended conventional commit message overwritten at `/private/tmp/jg-msg-ent-6.txt`; final `git diff --check`, lane check and scope/HEAD/config attestation exited 0. The dispatcher owns commit/push and the independent verdict on the resulting commit.
