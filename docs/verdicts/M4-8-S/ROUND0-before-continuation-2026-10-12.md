# M4-8-S builder receipt — addendum 2

12 October 2026. Builder: Codex GPT-6.1 Sol (dispatch attribution). Branch `codex/sandbox/m4-8-s-r2`.

**HOLD — core mapping and J-REQ corrections built; allocation persistence and the vertical slice remain incomplete pending the coordinator's literal lock-order clarification.** This is a builder receipt, not technical acceptance.

## Base and previous HOLD

- Supplied main: `8472ae0` (PR #155 M4-8-S-PRE). Supplied worktree base/HEAD: `7387c8220a33197fd90ce8a74e20ac7bbeb55512` (`7387c82`), merging that main into this branch.
- SV-2 is merged as `a0963f4`; its actual tables and line identity key were inspected and reused by the core contract design.
- Read the previous HOLD before changing code; preserved it verbatim in `HOLD-before-PRE-2026-10-12.md` in this directory. **Lifted:** absence of a public transaction-participating case write; inability to atomically compose through a supported public entrypoint; the old lane exclusion of the three explicitly widened join files; the former unmerged SV-2 premise. No recovery command body was copied or reimplemented.
- Read `packages/db/src/recovery-case-repository.ts` and `docs/verdicts/M4-8-S-PRE/BUILDER_RECEIPT.md` first, then the applicable plan/contracts and merged kernels/schema.
- Local `origin/main` moved ahead to `96c0cb8a5b5562c65b79f5f601ba9d60f8fcf05a` (PR #138). No fetch or git write was run. Differences against that ref include later-main changes absent from the supplied base; these are not this leaf's edits.
- The existing lane line retains the issued branch; changed migration path from 0131 to **0136** and added exactly `packages/db/src/recovery-case-repository.ts`, `packages/db/test/recovery-case-join.integration.test.ts`, `packages/db/test/recovery-case-join.test.ts`. No other lane line was edited or allow path added.

## Current HOLD: exact dispatch conflict

The final dispatcher review line says:

> nothing the caller locks BEFORE the joined call may be something that function takes AFTER the case advisory key: the job and case rows

The merged public entry header also says to call it **AFTER every other lock and write**, and after return only append audit and commit. Meanwhile this order requires new allocation tables with tenant/job/case composite foreign keys and their inserts in the same transaction before the joined `record_landing` / `reverse_landing`.

A referencing allocation INSERT takes PostgreSQL foreign-key KEY SHARE locks on the referenced job/case rows. The existing routine at `0097_recovery_case_current.sql:47` takes the case advisory key, then job/case FOR UPDATE at lines 48–49. The merged repository's own lock-order comment explicitly identifies foreign-key share locks. Thus ordinary required allocation INSERTs before the joined call cannot meet the new literal prohibition. Deferring foreign keys would instead acquire business locks after audit, contrary to AGENTS §5.4 and the call-last contract. Removing the foreign keys, changing the v1 routine, writing after the joined call or reimplementing the case command would breach the order.

A concrete safe interpretation is available: acquire the SAME canonical case advisory key before any allocation/Decision INSERT, then perform all business writes, call the joined command last (its advisory acquisition is reentrant), append the caller audit, commit. This preserves advisory-key → job/case locks against the v1 routine. **That interpretation is not assumed to override the literal dispatcher line.** A focused asynchronous clarification was sent; no answer had arrived at handoff. No dependent persistence caller or migration was added. This is a source-inspected contract conflict, not an executed PostgreSQL deadlock finding.

## Changes retained

- `packages/core/src/recovery-allocation.ts`: strict versioned review/allocate/review_reverse/reverse commands, typed errors, server-facts boundary, integer case-split validation, receipt/reversal mapping to SH-1 and exact read summation. Human selection of a finalized `evidenceId` is required; caller-supplied hashes, splits, rules, rationals, settlement and reviewer are refused. An optional remittance evidence/credit ID selects a source, not its arithmetic.
- `packages/core/src/recovery-allocation.test.ts`: 48 pure tests, including all five exact reference scenarios, fixed priority, deposit cutoff at microsecond precision, explicit later-line refusal, reversal hierarchy, split equivalence, money limits, strict commands and an architecture guard on this leaf's own source only.
- `packages/core/src/index.ts`: one appended export.
- The three widened join files: J-REQ1–J-REQ3, below.
- `docs/contracts/recovery-allocation-v1.md`: implemented core boundary, intended authority requirements and explicit persistence HOLD.
- The one lane line and this receipt/history file.

Preparatory API/UI drafts are archived under `/private/tmp/jg-m4-8-s-api-draft/` (including `shared.patch`); allocation/race fixture-only drafts under `/private/tmp/jg-m4-8-s-db-draft/`. They are **not retained implementation, not acceptance coverage, not tested and not ready to ship**. The unimplemented API/UI files were removed and their shared additions restored byte-identically to HEAD. No dangling repository import or workbench mount remains. No browser spec was created. Same-model helpers prepared independent file groups as AGENTS §1/§2.2 permits; these are implementation assistance, not an independent verdict.

## Required join corrections

| Requirement | Implemented evidence | Execution limits |
| --- | --- | --- |
| J-REQ1 | Joined tenant proof uses CASE + `pg_input_is_valid` before UUID cast; equality for valid values unchanged. Four new real-PG cases cover unset, empty, foreign and malformed settings; every case has a same-client valid-setting control and caller-visible event/audit/state assertions. Malformed setting also proves its transaction remains usable before rollback. | Unit SQL-contract assertions pass. PostgreSQL cases NOT RUN. |
| J-REQ2 | J2/J3/J11 now read current case, exact command event, recovery audit and caller row using the caller's own client before rollback/throw. J2 checks `{caseId, replayed:false}`. Earlier isolation/rollback assertions remain. | Written source coverage; NOT RUN on PostgreSQL. |
| J-REQ3 | Header distinguishes newly recorded commands from replay and retains call-last. The corrective L4 below records the same distinction in this receipt. | Source-inspected; replay unit coverage passes. |

**Corrected L4:** after a newly recorded joined command returns, the caller holds the tenant's audit head until the transaction ends. A replay returns before the repository's audit append and does not acquire that head; the caller's own later audit batch acquires it if needed. The call-last restriction still applies.

The historic PRE receipt's L4 is corrected by the above explicit amendment; its file was not edited because addendum 2 widens this lane for exactly three code/test paths, not the other task's receipt. All existing assertions are preserved semantically. The one unavoidable assertion-literal change is J-T2's exact expected SQL string, updated from the unsafe cast to the required guarded query; its statement count, parameters and refusal assertions are unchanged. No assertion was removed or weakened.

## Build and Done-when disposition

All persisted acceptance remains HELD; a pure test is not a saved-row or browser proof.

| Item | Status and evidence |
| --- | --- |
| B1 gross/net/tax case approval | HELD persistence/Decision; core integer split and strict commands BUILT (`validates DW1 integer case splits`, overflow/tampering cases). |
| B2 reversal workbench | HELD: no mounted UI or persisted reversal command. |
| B3 receipt_line_allocation rows | HELD: mapping BUILT, table not created. |
| B4 rule/source/rationals/bound line | HELD saved links; core mapping preserves source/rule and exact string fractions. |
| B5 deposit-before-line | Core BUILT (`a deposit gives later lines zero`, explicit refusal, microsecond cutoff); persisted behavior HELD. |
| B6 refund/credit reversal | Core BUILT (`item-specific refund/credit`, `unallocated refunds reverse pro-rata`); merged-fact persistence HELD. |
| DW1 384/3000 figures and drill-down | HELD: integer split tests pass, no saved rows/browser journey. |
| DW2 F4/F4b/F5/F6/F7 exact | Core BUILT: five named fixture tests and test-only fee-kernel cross-checks; persisted F4/F4b/F6 HELD current conflict; saved F5/F7 additionally HELD Q2. |
| DW3 over-allocation/job links/reuse/races | HELD database/UI; strict boundary and claim/evidenced limit unit tests pass, not PostgreSQL conservation. |
| DW4 reverse 3000/reopen/paused/originals | HELD full saved/browser path; no original facts changed. |
| DW5 invalidate claim2 only | HELD saved projection. Q3 display figures not asserted or made policy. |
| DW6 priority | Core BUILT (`F6 explicit ... even when another rule would give a catch more`, F7, F4); saved proof HELD. |
| DW7 deposit exclusion | Core BUILT under all three rules; saved proof HELD. |
| DW8 real PostgreSQL exact/races/refunds/split | HELD: no execution or allocator integration acceptance suite. Pure split/reversal checks pass. |
| DW9 unrounded deemed net | Pure-source/fraction test BUILT (`DW9 own allocator delegates exact math...`); API/persistence portion HELD. |

## Exact reference results (pure tests only)

| Scenario | Integer pence / exact fraction | Test-only fee check |
| --- | --- | --- |
| receipt 384 split | 38400 = 32000 + 6400 | none |
| receipt 3000 split | 300000 = 250000 + 50000 | none |
| DW1 combined (requirement, not saved result) | gross 338400; net 282000; tax 56400 | none |
| DW4 (requirement, not result) | net 32000; tax 6400; invoice balance 2217600; case2 outstanding 250000 | paused projection required |
| DW5 (requirement, not result) | gross 338400; invoice balance 1917600; only case2 held | Q3 unspecified figures held |
| F4 | catch net 2000000/43; rule pro_rata | 4651 |
| F4b | cumulative catch net 80000/1 | cumulative 8000; delta 3349 |
| F5 | deposit 0/1; later catch net 40000/1 | 4000 |
| F6 | catch net 0/1; explicit source | 0 |
| F7 | catch net 80000/1; separate_invoice; main gross 4032000 untouched | 8000 |

Pure fixtures use Test M/Test N composition and stored-facts-shaped inputs, not a database. `recovery-18800` saved fixture remains unexercised. No fee, qualifying principal, posting delta, journal, statement, entitlement or collection is implemented or stored. Fee calls exist in tests only.

## Migration, grants and upgrade proof

**0136 is assigned but not created or registered.** Added database objects/grants/routines/policies/triggers: none. No existing table/view/column/role/policy/grant/routine is altered. The v1 0018 objects and all earlier financial/evidence facts remain untouched. No PostgreSQL process or database was opened. An executed old-row preservation test is still owed.

The planned catalogue remains owed: new case allocation, reversal and receipt-line tables; migration ownership; nonnull tenant; qualified job/case/receipt/movement/evidence/invoice/line keys; ENABLE/FORCE RLS; runtime SELECT/INSERT only; append-only guards; exact routine EXECUTE grantees; atomic approved Decision/case/caller audit.

> An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'.

That proof remains owed, including `row_to_json(t)::text` over exactly named pre-existing columns, captured primary keys, name/full-format_type snapshots, nonempty guards, failing one-microsecond/retype controls and passing later nullable-column/function/insert controls. No substitute whole-row or all-functions test was added.

## Commands actually run

Installed pinned pnpm 10.28.1 was invoked from `/Users/benharwood/Library/pnpm/store/v11/links/@pnpm/exe/10.28.1/fb01edf4af110b9a4ace971426a9e1b8e5948ece46be4a99cffa555e3c429dcc/bin`; root checks prepend that directory to PATH. No package download or clean reinstall. Only added/changed test files ran, one Vitest run at a time, maxWorkers=2.

| Command | Exit / counts |
| --- | --- |
| `pnpm --filter @jobguard/core exec vitest run src/recovery-allocation.test.ts --maxWorkers=2` initial | 0; 1 file, 43 tests passed before evidence-selection amendment. |
| Same core command, final | 0; 1 file, **48 tests passed**, 3.01s. Includes amended evidence-ID schema and corrected test-only source reader. |
| `pnpm --filter @jobguard/db exec vitest run test/recovery-case-join.test.ts --maxWorkers=2` initial | 1; zero tests, missing built @jobguard/core entry. No DB started. |
| Same join unit command, after emitted core dependency | 0; 1 file, **13 tests passed**, 28.45s. Mock-client unit contracts, not live PostgreSQL. |
| `pnpm build` (one root run) | 2; stopped at core TS2307 for test-only static `node:fs` import; 2 successful of 3 tasks, 2 cache hits. Fixed by typed test-only runtime import, preserving core's no-Node-types boundary; root build not repeated under once-only dispatch limit. Build is **not green**. |
| `pnpm typecheck` | 0; 7/7 successful tasks, 2 cache hits; 6m13.527s. Corrected core test import typechecks. IO permission warnings occurred. |
| `LANE_BASE_REF=origin/main pnpm lint` | 0; root lint and lane check passed; 7/7 package tasks, 2 cache hits; 1m34.319s. IO permission warnings occurred. |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0; lane m4-8-s, merge-base comparison, all 10 leaf paths authorized. |
| `pnpm openapi:check` | 1; tsx failed creating its IPC pipe with listen EPERM. Generator did not execute; OpenAPI remains unchanged. |
| `git diff --check` | 0; no whitespace errors. |

Root logs are `/private/tmp/jg-m4-8-s-r2-{build,typecheck,lint,lanes,openapi}.log`. Cache-replayed paths belonging to other worktrees are not fresh execution claims. Generated dist/.turbo/.next/.pnpm-store/build-info/test-results artifacts were removed before handoff; installed node_modules retained. No whole package/repository test suite was run. Separate API build/test omitted: no retained API change, and root build allowed once. Earlier unchanged kernel/watchdog files omitted per the binding changed-files-only test restriction. No AI/eval change.

NOT RUN (sandbox cannot start PostgreSQL / a browser): `pnpm test:db`, `pnpm test:migrations`, `recovery-case-join.integration.test.ts`, all planned allocation/line/races/upgrade integration acceptance, and the issued mobile-360/desktop browser command for M4-8-S/M4-7-S/M4-1-S/M4-2-S/UIWIRE-12/UIWIRE-14. No allocated-row/browser suite is claimed written or passed. No socket, PostgreSQL or browser process started.

## Self-review and preservation

Re-read the retained whole diff against supplied base and against local origin/main, the full new mapper/tests/contract and the widened join changes. Checked: every pure reference figure is exact; F4 remains denominator 43; implementation contains no proportional/rounding/net-conversion/fee implementation; hierarchy chooses by source presence rather than benefit; microsecond cutoff and explicit deposit refusal use the kernel; schemas reject client authority; J2/J3/J11 now cannot pass a no-op joined writer; guarded SQL cannot cast malformed settings; header and corrected L4 distinguish replay. No SQL or case command implementation was copied.

Checked every retained path is in the lane and the lane gained exactly the three authorized paths. Checked no fingerprinted table, v1 fee/landing/journal path, practice-feed catalogue, approved policy, dependency/lockfile, BUILD_PLAN or pinned auth source changed. The sole existing assertion literal changed is the guarded SQL expectation required by J-REQ1; other assertions remain intact. Architecture tests inspect only this leaf's own file, not merged/shared hashes. One-off hashes below are receipt evidence only.

Checked persisted B/DW criteria remain HELD instead of treating pure/mocked tests as implementation acceptance. Database conservation, actual grants/RLS/catalogues, original-row preservation, concurrent races, upgrade migration, real audit rollback and browser behavior **could not be verified**. Full build completion was not verified after the corrected import. Core/J helpers used the same builder model; no different-model verdict or separate acceptance occurred.

| Unchanged file at supplied HEAD | SHA-256 |
| --- | --- |
| 0018_recovery_outcomes.sql | 42d13efe6aa491149300f167f2b3f7e4c66070f72357a4c75a0ca57a6840f3ba |
| 0097_recovery_case_current.sql | 84aef359c62455818e4eb66d26ca9d21c13c49ddd06af202fd107be3950d9375 |
| 0106_practice_feed.sql | 47c469b941a0f8f2f342222ae967e42b8f363cd34f5a99383273c145bf9d44b7 |
| 0128_shadow_persistence.sql | d8f7370560595a47f1395dad198abacda1e1351ade096697656c76805e957afe |
| auth/context-boundary.test.ts | d082694df3dc005461d92ac79f275f31525d35c3e022948b47efa0ed7f9a772f |
| practice-session.ts | 9b765f410777c28334f9f7d8388e0a3c6e30f52bb6d4b4070c9b69e4ecbf1b14 |

All five preparatory shared mounts/registrations were also checked byte-identical to HEAD after parking the draft. No persistent source-hash test was added for them.

## Overlap, follow-ups and gates

Actual shared overlaps: the single lane line and appended core export, root-owned/serialized; widened PRE repository/test changes authorized by addendum2, coordinated by root. Other migration/export/catalogue/OpenAPI/watchdog/mount files remain unchanged. No UI polish survives. No new data migration, backwards-incompatible transport, provider destination, secret/configuration or operational alert is introduced. New core schemas are unused exports until the future authorized application exists.

Owed: coordinator interpretation of the final lock-order line; then the public joined caller, all persisted tables/guards/Decision and line-source bindings, allocator/reversal workbench, API/OpenAPI/routes, upgrade/catalogue/race tests and both browser projects. Saved F5 remains Q2-held until a separate order adds two generated movements; saved F7 remains Q2-held until SV-4 provides supplementary invoices. Q3 held display figures, Q6 fractional case splits and Q9 role widening remain held. SV-6 and M4-9-S are consumers only, not implemented. D01/D02/D03v3 remain proposed; G4-S unmet. Independent Claude review and separate Sol check/acceptance are still required on a dispatcher commit.

Intended commit message is `/private/tmp/jg-msg-m4-8-s-r2.txt`; dispatcher owns the commit, push and review process. No git write, remote/GitHub action, deployment, real data, provider call or spending occurred.

Builder receipt only — not independently verified, not accepted.
