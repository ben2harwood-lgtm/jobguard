# CH-1 builder receipt — attempt 2, implementation delivered / acceptance HOLD

Re-dispatch: Ben, 8 October 2026, including card `jobguard-ch-1-three-more-old-tests-2026-10-08` ("Yes, same fix" / "Yes, go ahead"). This receipt supersedes the attempt-1 preparation status; its original receipt and logs remain as historical evidence. Builder: Codex. Dispatcher owns commits and supplies the eventual implementation head. No builder acceptance, independent model verdict, commit, push, PR, merge, policy approval, deployment or release was performed.

Branch `codex/sandbox/ch-1`; resumed HEAD `92c4a406b1765f077cc12c977101d4b065c914cd`. Original main base `df1f9c1776522390be6bccff7a2324e3bbdb09c6`. Read-only `origin/main` at final inspection: `b552bdc8ec0091fd4bc0f4d1911f496a7418b790`; no fetch, branch change or rebase was performed. The reviewable implementation is the working-tree diff over 92c4a40, retaining the earlier core module/export/lane. **No new exact commit exists yet.** The dispatcher must bind an independent Claude verdict and separate acceptance to its resulting commit. Intended commit message: `/private/tmp/jg-msg-ch-1.txt`.

## Scope and implementation

- **B1:** new migration `0104_job_activation_terms.sql`, registered last after 0097, adds immutable terms binding baseline quote identity/version/hash, accepted net, highest sent net, frozen small-job flag, SV-1 v3 policy, SH-1 small-builder track, activation time and explicit closed context `none_recorded_pre_mon2a`. This context follows **INDEX.md “Coordinator rulings, round 3”, coordinator ruling of 8 October**, supplied in the issued header. MON-2A/MON-3 own its replacement; it is not an entitlement.
- **B2:** the existing PracticeAccess-protected activation endpoint selects the v3 mutation for a new job; it creates one activation and one terms row, no cap snapshot, synthetic obligation, settlement or platform journal. Strict input refuses client-supplied commercial facts. The existing classified `job.switch_live` command type is reused with `switch-live.v3` input, `practice-start-v3` semantic identity and v3 exact authorization. No new route or watchdog-registry entry is needed. Job lock precedes receipt allocation; the dispatcher rechecks active owner membership even before receipt replay, and appends audit events atomically after mutation. The routine derives persisted commercial facts and preserves the SH-1 track and CH-3a party triggers and live transition.
- **B3:** the demo checkpoint recipe no longer supplies a £79 fee-illustration payment. New-job quote editor has no optional old-pricing selector or £79 wording. Customer payment fixture principal is unchanged. V3 live UI displays server-recorded policy/classification and no-charge state; the zero-credit projection remains zero and does not offset a fee.
- **B4/Q5:** legacy quote activation, recovery illustration and integrity rows appear under “Earlier proposed pricing (v1)” disclosures. The live variations panel hides its cap row for v3. Fee statements return no legacy UI for jobs without v1 activation, and the application rejects legacy source creation for such jobs. Historical quote/fee/settlement implementations remain available for legacy activations and the saved v1 fixture. Historical disclosure state is tied to the current job identity to avoid showing a preceding job's pricing while loading.
- **Q3:** `seedActivationFixturesV3` in the allowed demo-seed file creates generated `core-1000` (£1,000.00), `recovery-18800` (£18,800.00), and `shadow-30000` (£30,000.00) recipes. Source/party setup uses the owner pool; quote/send/acceptance/activation use real commands through the supplied runtime pool. These minimal recipes are exercised by the authored PostgreSQL test; they are not automatically added to every session or claimed to exist in a running database here. DEMO-S retains the full shadow journey.
- **Q6:** copy scans use `/£79|\bcap\b|plan credit/iu`; cap is whole-word and case-insensitive, so capture is allowed.
- **Q7:** dispatcher commits, per the confirmed 7 October substitution; Git use was read-only.

The API activation response has additive `terms`, `savedV1Sample`, `effects.termsRows`, v3 policy and nullable legacy cap. The existing response version remains 1; defaults preserve parsing of historical response fixtures. The OpenAPI generator produced no JSON diff: these Zod changes do not change its current decorator-derived document. The same generator's check passes using Node directly. Existing thin route, PracticeAccess and practiceMaterialPool are untouched. The React best-practices skill was read and applied to the four edited TSX components; this is builder inspection, not independent review.

## Five authorized fixture-path changes — exact lines

A single new helper `apps/web/e2e/helpers/v1-sample-job.ts` opens the saved, generated v1 proposal created when a practice session is issued. It runs the same review/confirmation/pricing steps, with no success API interception. Migration 0104 adds an immutable server-only marker and `v1_sample` scenario; the sample belongs to the issuing session. Its draft creates no financial rows; activation happens only when the test requests it. The original three `home` scenarios stay three, and session ownership is preserved. New captures cannot select the marker or old pricing. Existing `helpers/capture-journey.ts` is byte-identical.

Only the original ch-1 registry line changed, adding the exact three authorized spec paths and the one helper path, and the required note: “UIWIRE-5, UIWIRE-14, switch-live, fee-statement, UIWIRE-13: fixture-path change only (Ben, 8 Oct).” Every other registry line is byte-identical. For each spec, the complete working file is equal to its 92c4a40 file with only `./helpers/capture-journey` replaced by `./helpers/v1-sample-job`. Every assertion, check, wording and timeout remains byte-for-byte unchanged. Machine-readable exact lines: `attempt2-fixture-lines.json`.

**apps/web/e2e/UIWIRE-5.spec.ts:1**

Before:
```ts
import{expect,test,type Page}from"@playwright/test";import{openReview}from"./helpers/capture-journey";
```
After:
```ts
import{expect,test,type Page}from"@playwright/test";import{openReview}from"./helpers/v1-sample-job";
```

**apps/web/e2e/UIWIRE-14.spec.ts:1**

Before:
```ts
import{expect,test,type Page}from"@playwright/test";import{openQuote}from"./helpers/capture-journey";
```
After:
```ts
import{expect,test,type Page}from"@playwright/test";import{openQuote}from"./helpers/v1-sample-job";
```

**apps/web/e2e/switch-live.spec.ts:3**

Before:
```ts
import{openQuote}from"./helpers/capture-journey";
```
After:
```ts
import{openQuote}from"./helpers/v1-sample-job";
```

**apps/web/e2e/fee-statement.spec.ts:1**

Before:
```ts
import{expect,test}from"@playwright/test";import{openQuote}from"./helpers/capture-journey";
```
After:
```ts
import{expect,test}from"@playwright/test";import{openQuote}from"./helpers/v1-sample-job";
```

**apps/web/e2e/UIWIRE-13.spec.ts:1**

Before:
```ts
import{expect,test,type Page}from"@playwright/test";import{openQuote}from"./helpers/capture-journey";
```
After:
```ts
import{expect,test,type Page}from"@playwright/test";import{openQuote}from"./helpers/v1-sample-job";
```

## Done-when mapping and unresolved DW2 conflict

| Assertion | Authored evidence / observed status |
|---|---|
| DW1 | Real-PG test counts exactly one terms/activation and zero cap/obligation/journals; two clients, replay and same-ID changed scenario. Parties failure rolls back activation/audit. Browser checks response counts and strict forged fields. **Authored and listed, not executed here.** |
| DW2 | All five authorized specs retain every check; saved-v1 browser case verifies historical label and variations cap. Existing v1 DB/core/application tests remain byte-identical. **HOLD** for the four additional source conflicts below, plus CI browser/DB execution. |
| DW3 | New-job browser body scan on live quote/variations, persisted state, Jobs/reload/second context, completed invoice path and money-protection page; API projection scans, real quote/invoice PDF bytes; real-PG quote/terms/final-account/invoice snapshot scan. No screenshot or browser result was generated here. **Authored/listed, execution pending.** |
| DW4 | SQL grants/immutable trigger; PG test denies runtime UPDATE/DELETE/TRUNCATE and owner UPDATE, then adds a later quote revision and variation without changing terms. Separate later £4,000 job revision cannot mutate terms. This is not a claimed MON-1 trip implementation. **Execution pending.** |
| DW5 | Core thresholds and three named fixture classifications: £1,000 small, £18,800/£30,000 not small. Highest sent £2,000 overrides accepted £1,000. **Core passed; persisted recipes pending PG execution.** |

Four more unchanged browser journeys still start fresh captures and require historic pricing:

- `apps/web/e2e/UIWIRE-8.spec.ts:5`: fresh activation, then `variation-cap` must be £15.00.
- `apps/web/e2e/UIWIRE-15.spec.ts:6`: fresh activation, then legacy fee illustration `additional-fee` must be £203.00.
- `apps/web/e2e/VALUE-1.spec.ts:6`: same fresh-job £203.00 illustration requirement.
- `apps/web/e2e/m1-15-complete-journey.spec.ts:66–67`: after a fresh-job journey, returns home and opens “See the fee example”, requiring “Exact fee illustration”. The home shortcut binds the home job, which has no v1 activation, and is outside this lane.

These are **source-inspected incompatibilities, not observed browser failures**. Keeping the fresh-job default v1 or hiding/removing assertions would violate the order. Two asynchronous clarification requests reported the required further fixture/shortcut lane amendment; no response was received as of this receipt. All four files and the shortcut remain untouched. The authorized implementation continued while those edits were held. DW2 therefore cannot be marked complete and the leaf is **not technically accepted**. The dispatcher must resolve this product/test fixture conflict before accepting the leaf; do not skip these tests in CI.

## Migration, compatibility and operational boundaries

0104 is expand-compatible: old commercial rows are not backfilled or rewritten. It expands shared job baseline and activation-term constraints to permit v3 without a cap, adds a tenant/job/document-version/hash unique key, immutable terms and controlled v3 routine, and the scoped saved-sample hook/marker. The terms table is owned by jobguard_migration, ENABLE/FORCE RLS, SELECT/INSERT only for runtime, with runtime insert guarded to the controlled routine. Qualified FKs bind activation, baseline quote/document, and commercial track. Authorization rechecks exact approved current action, null amount/currency/recipient, actor and document identity. Membership and receipt replay are tested adversarially. RLS assumes an authenticated correct tenant context; it does not protect against a privileged connection or a falsely selected tenant.

No merged migration or historical cap/obligation/settlement/fee/journal table/routine was edited. `activation.ts`, `fee.ts`, their tests, v1 activation integration, fee-what-if and fee-illustration application tests stay byte-identical. Matching base/worktree SHA-256s are in `attempt2-protected-hashes.json`. The older `unchanged-v1-hashes.json` remains attempt-1 evidence; the five now-authorized spec imports intentionally differ from that old snapshot.

Catalog edits are **only** two added expected rows for `job_activation_terms` in `tenancy.integration.test.ts` (RLS and owner arrays). `UIWIRE-12.integration.test.ts` and `demo-bootstrap.integration.test.ts` are unchanged. A fresh-schema test, real catalog/grant/FK checks, and upgrade-from-0097 preserving actual v1 activation/cap rows are authored. Re-running migrations is covered. No SQL was executed here. Operational strategy is documented in MIGRATIONS.md: disable new v3 entry and forward-fix; drop the additive objects only if there are no v3 terms, restore previous constraints only after a verified compatibility check, never delete accepted history. No new external provider or operational alert is introduced; failures use existing command/error paths. Migration and runtime are deployed together only after acceptance.

Changed source files are recorded with SHA-256 in `attempt2-source-hashes.json`: core schema/test; API quote contracts and illustration application; four shared UI files; five import-only specs; new helper and CH-1 browser spec; registry; migration/runner/migration notes; activation repository/demo recipe; new PG suite; two tenancy catalog rows; contract docs. Core index export from attempt 1 remains. Receipt/log additions are confined to CH-1. Shared quote-editor, fee-statement, commercial-integrity and job-variations overlap MON-7, CH-3a and CH-6; dispatcher/coordinator must serialize those integrations. No other lane is edited.

## Tests first and commands actually observed

Dependencies were already installed. Commands used `PATH=/private/tmp/ch-1-bin:$PATH` for the installed pinned pnpm 10.28.1; Node v24.17.0. No install/download was attempted, per dispatch. The attempt-1 missing-module red and 13-test green evidence is retained. In attempt 2 the real-PG/browser tests were authored before their implementation but could not be executed under the explicit sandbox restriction. A DB source typecheck at that stage exited 0; it does not compile the integration tests and is not a DB failed-first claim. The added baseline document-version/hash core test was executed red (1 failed/25 passed), then green after the strict output schema was extended (26 passed). No assertion was loosened.

The first full API run caught a real builder integration defect: unregistered `job.switch_live.v3` command literal. This was fixed within lane by using the existing `job.switch_live` classification and a v3 payload/semantic key. The unchanged registry suite then passed. Final typecheck/lint also caught a new browser dynamic import without a NodeNext extension; it was corrected to an ordinary static import. Failed logs are retained; final verification follows those corrections.

| Exact command (PATH prefix as above) | Exit / observed result; log |
|---|---|
| `pnpm --filter @jobguard/db typecheck` (tests-first preparation) | 0; source only, `attempt2-tests-first.log`. |
| `pnpm --filter @jobguard/core exec vitest run src/activation-v3.test.ts src/activation.test.ts src/fee.test.ts` (initial) | 0; 25 tests, `attempt2-core-targeted.log`. |
| Same targeted command after the new baseline binding test, before schema change | 1; 1 failed/25 passed, `attempt2-core-red.log`. |
| Same targeted command after implementation | 0; 26 passed (14 v3 + 12 unchanged v1), `attempt2-core-green.log`. |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 1; 54 files passed/1 failed, 1606 tests passed/1 failed. Unchanged receipt-allocation working-size test hit unchanged 5000ms timeout. `attempt2-core-unit.log`. |
| `pnpm --filter @jobguard/core exec vitest run src/activation-v3.test.ts src/activation.test.ts src/fee.test.ts src/receipt-allocation.test.ts --maxWorkers=1` | 1; 58 passed/2 failed, two unchanged receipt-allocation tests timed out (5000ms). `attempt2-core-targeted-and-receipts.log`. No timeout change or skip. |
| `pnpm --filter @jobguard/api test` | 1; initial 580 passed/2 failed: health socket EPERM and new unregistered command. `attempt2-api-unit.log`. |
| `pnpm --filter @jobguard/api exec vitest run src/quote src/workspace src/watchdog-registry.test.ts --maxWorkers=1` | 0; 3 files/128 tests; `attempt2-api-targeted.log`, including unchanged registry and fee-illustration tests. |
| `pnpm --filter @jobguard/api exec vitest run src --maxWorkers=1` (after registry correction) | 1; 21 files/581 tests passed; only health failed, plus its unhandled `listen EPERM`, address 0.0.0.0. `attempt2-api-final.log`. No health skip. |
| `pnpm --filter @jobguard/db exec vitest run src/demo-seed.test.ts` | 0; 3 unchanged tests; `attempt2-seed-unit.log`. |
| `pnpm --filter @jobguard/web test` | 0; 19 files/350 tests; `attempt2-web-unit.log` and final `attempt2-web-unit-verified.log`. |
| `pnpm typecheck` | Initial 0 all 7 packages (`attempt2-typecheck-initial.log`); later 2 for new dynamic-import TS2835 (`attempt2-typecheck-final.log`); corrected final 0 all 7 (`attempt2-typecheck-verified.log`). |
| `LANE_BASE_REF=origin/main pnpm lint` | Initial 0 (`attempt2-lint.log`); later 1 for same TS2835 (`attempt2-lint-final.log`); corrected final 0 all 7 and real lint guards (`attempt2-lint-verified.log`). |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0, `attempt2-lanes.log`; final receipt-inclusive run also 0 (`attempt2-lanes-final.log`). |
| `pnpm build` | Earlier passes 0 all 7 (`attempt2-build.log`, `attempt2-build-final.log`); final current-source run also 0, all 7 packages (`attempt2-build-verified.log`). Next workspace-root/autoprefixer and restricted cache-write warnings are not hidden. No server was started. |
| `pnpm openapi:check` | 1; tsx CLI IPC `listen EPERM`, `/var/folders/nh/lx6ycbfd1l937f5qhj0cdvhh0000gn/T/tsx-501/96017.pipe`; `attempt2-openapi-wrapper.log`. |
| `node --import tsx src/generate-openapi.ts` (cwd apps/api) | 0; generator ran, no OpenAPI JSON diff. |
| `node --import tsx src/generate-openapi.ts --check` (cwd apps/api) | 0; same check without CLI IPC listener; `attempt2-openapi-node-check.log`. Official wrapper remains failed. |
| `pnpm --filter @jobguard/web exec playwright test --list CH-1.spec.ts UIWIRE-5.spec.ts switch-live.spec.ts UIWIRE-14.spec.ts fee-statement.spec.ts UIWIRE-13.spec.ts` | 0; 22 tests/6 files in mobile-360 and desktop; `attempt2-browser-list.log`. Listing only. |
| `pnpm --filter @jobguard/db exec vitest list test/job-activation-terms.integration.test.ts test/activation.integration.test.ts` | 0; 11 new PG tests + 3 unchanged legacy tests; `attempt2-db-list.log`. Listing only; hooks not executed. |
| `git diff --check` | 0; final check repeated with lane inspection. |

Supplemental Python deterministic inspection verifies five exact import substitutions, protected hashes, every merged migration, untouched count-agnostic tests, one changed lane line and all changed paths within its allowlist (`attempt2-boundary-inspection.log`). This is not an independent model verdict.

Not run: `pnpm install --frozen-lockfile` (explicit preinstalled/no-download instruction); root `pnpm test` (would start prohibited PostgreSQL suites); actual focused DB run, `pnpm test:db`, `pnpm test:migrations`, actual Playwright execution (sandbox cannot bind localhost or start PostgreSQL, as the dispatcher explicitly instructed). Required **real PostgreSQL 16 fresh/upgrade/catalog tests and both browser projects run in GitHub CI after dispatcher push**, along with the full unchanged regression suites. No provider/model/prompt changed, so no live-model evaluation is claimed or required for this leaf. No database mock/list result proves PostgreSQL behavior.

## Remaining gates

DW2's four fixture/shortcut conflicts require an explicit lane/order amendment; all affected files remain untouched. Full core must pass its unchanged timeout-sensitive tests in CI. Official OpenAPI wrapper and health need the permitted CI socket environment. PG/migration/browser assertions are pending execution. D01 v3, D09 and G4-S remain pending and production fee issuance/collection remain disabled. An independent Claude verdict bound to the exact dispatcher commit and a separate actor's technical acceptance are required. This receipt records builder implementation and observed checks, **not an acceptance or independent verification**.
