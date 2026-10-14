# AUDIT-FIX-PKG-SRC-82 — builder receipt

Status: **HOLD**. Blocking findings 1 and 3 are fixed; finding 2 is reproduced
but its fix is stopped at an existing, immutable expected value. The two new
quote regression tests intentionally remain failing. This is builder evidence,
not an independent verdict or technical acceptance. Do not treat this task as
complete or ready to merge.

## Scope and environment

- Issued 13 October 2026 by dispatcher 4. Audit read:
  `/Users/benharwood/.local/share/full-steam/night-audit-2026-10-13/jobguard/pkg-src-82.md`.
- Read repository `AGENTS.md`, BUILD_PLAN §§2.4 (C1–C8), 5.4 and M2-5;
  inspected core quantity/rational primitives and the discrepancy repository.
- Branch: `codex/sandbox/audit-fix-pkg-src-82`.
- Issued base: `c08a53784c05b54b18f7bfff87f4c7597032ca7e`.
  Actual starting HEAD and `origin/main` both:
  `bd959b01e857de0ba7cbd3588bab84add7d0f493` (already includes the API-value merge).
  Starting working tree was clean. No Git-writing command was run.
- Node `v24.17.0`; installed pnpm `10.28.1` invoked from the existing Corepack
  cache through `/private/tmp/jg-pkg-src-82-bin/pnpm`. The default pnpm launcher
  stalled; it was interrupted. No installation or package download was performed.
- Synthetic facts only. No PostgreSQL, browser, live provider, real data, sends,
  spending, decision approval, or migration. No grant: standard F is unaffected.
- Review lane **RED** for money effects. The external lane-floor map classifies
  core discrepancy/test paths AMBER and receipt GREEN; registry is AMBER by its
  named exception. Money effects raise that path floor to RED.
- C1: existing pure-core calculations; no new web workflow, route or persistence.

## Blocking findings — tests before fixes

First command (before any product fix):

`pnpm --filter @jobguard/core exec vitest run src/discrepancy.audit-pkg-src-82.test.ts src/quote.audit-pkg-src-82.test.ts`

Exit **1**, four tests failed for the expected reasons:

1. **FIXED — undelivered discounted goods cannot exceed the billed amount.**
   Expected price/quantity/total `0/1500/1500`; received `0/2000/2000`.
   Quantity exposure now uses the lower of billed and ordered unit prices.
   Existing price/quantity decomposition for more expensive bills is preserved.
2. **HOLD — discounted quote net rounds once.** Expected net/tax/total
   `29291/5858/35149`; received `29290/5858/35148`. The 3p rate / 50% discount
   tie expected net `2p`, received `1p`. No change to `quote.ts` or any existing
   quote expectation was made. See the stop line below.
3. **FIXED — fractional confirmed quantities remain comparable.** Ordered and
   billed `1.5` were refused with Zod `Expected integer, received float`.
   The numeric v1 boundary now accepts nonnegative quantities with up to six
   fractional places, preserving its existing maximum of one million. Decimal
   spellings are parsed to scaled bigint values; subtraction and monetary
   multiplication use those values. Combined exposure rounds half-even once,
   with the quantity component conserving the remainder after rounded price.
   Exact magnitude overflow is refused before conversion back to public pence.

Additional discrepancy tests were also written and executed before the fix:
exit **1**, 8 failed / 3 passed. They cover binary subtraction residue, fractional
penny ties, conserving the combined discrepancy, every quantity field's invalid
precision/range, excess accepted delivery, and fractional money overflow.

After the discrepancy fix:

`pnpm --filter @jobguard/core exec vitest run src/discrepancy.test.ts src/discrepancy.audit-pkg-src-82.test.ts`

Exit **0**, **15 passed**, including every original discrepancy test unchanged.

No finding was DROPPED; all three BLOCKING findings reproduced.

## Required stop — existing expectation

File: `packages/core/src/quote.test.ts`, **line 4**.

Before, the existing expected values include:

```ts
{subtotalPence:30832,discountPence:1542,netPence:29290,taxPence:5858,totalPence:35148}
```

Required after, for the audit's independently calculated net/tax/total:

```ts
netPence:29291,taxPence:5858,totalPence:35149
```

Those values cannot simultaneously satisfy the unchanged call and unchanged
existing assertion. The display discount would also require reconciliation if
subtotal remains 30832p (subtotal minus corrected net is 1541p). No replacement
was applied. The product fix is held because the issued instruction forbids
changing any existing expected value, and AGENTS requires preserving earlier
acceptance tests. The audit's suggestion to replace that fixture is not authority
to override the issued work order. Dispatcher/coordinator resolution is required.

## Later findings — recorded only

- Report 4: dismissed human lines override disposition in `review.ts`; all-dismissed
  human scope can confirm and dismissed unknown quantities can block valid scope.
- Report 5: enterprise allocation refuses explicit extra-line refunds instead of
  reversing the original item-specific allocation.
- Report 6: replacement payment after a full reversal cannot requalify in shadow
  success-fee derivation; an existing test pins the refusal.
- Report 7: inbox resolution timing conflates distinct decisions sharing rule,
  version and finding revision, including reversed event order.

Audit weak-test notes are also deferred: constant-returning financial-effect
helpers in acceptance and quote-document tests; the shadow replacement-payment
refusal; and the self-comparing rate-observation identity assertion. The quote
penny fixture is the stop above, not changed. No LATER finding was implemented.

## Additive catalogue change / protected files

Only a new lane row was added to `config/agent-lane-assignments.json`.
Before: `audit-fix-pkg-src-82` absent. After, one compact line:

```json
"audit-fix-pkg-src-82":{"branches":["codex/sandbox/audit-fix-pkg-src-82"],"receipt":"docs/verdicts/AUDIT-FIX-PKG-SRC-82/BUILDER_RECEIPT.md","note":"AUDIT-FIX-PKG-SRC-82: RED money review; reproduced blocking discrepancy and quote arithmetic findings only. C1: pure-core calculations, no new UI. No migration or grant. Existing expectations and protected auth pins unchanged. Shared lane registry serializes with coordinator.","allow":["config/agent-lane-assignments.json","packages/core/src/discrepancy.ts","packages/core/src/discrepancy.audit-pkg-src-82.test.ts","packages/core/src/quote.audit-pkg-src-82.test.ts","docs/verdicts/AUDIT-FIX-PKG-SRC-82/BUILDER_RECEIPT.md"]}
```

Existing lane rows, test files, expected values, refusals, counts, pinned names
and fingerprints are unchanged. In particular,
`apps/api/src/auth/context-boundary.test.ts` and its pinned lists are untouched.
No premise-establishing setup was added before an existing call. The shared lane
registry overlaps other tasks; dispatcher/coordinator owns serialization.

## Validation

Every `pnpm` command below used `PATH=/private/tmp/jg-pkg-src-82-bin:$PATH`.
Logs are local artifacts in `/private/tmp/jg-pkg-src-82-logs/`; they contain no
customer data. Dependencies were preinstalled; no clean reinstall was attempted.

| Command | Exit / result |
| --- | --- |
| Initial four audit regression tests, before product fixes | 1; 4 failed for the reported reasons |
| Expanded discrepancy regression file, before fix | 1; 8 failed / 3 passed |
| Original + new discrepancy suites after fix | 0; 15 passed |
| `pnpm typecheck` | 0; 7 successful tasks, 2 from existing shared cache |
| `LANE_BASE_REF=origin/main pnpm lint` | 1; official lane check refuses HEAD equal to origin/main |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 1; same fail-closed self-comparison refusal |
| Supplementary working-tree exact-path and additive-lane-row verification | 0; all five paths allowed, all earlier lane entries unchanged; does not replace official lane checking |
| External lane-floor map applied to actual working-tree paths | AMBER by path, raised to RED for money effects |
| `node tools/core-purity-lint.mjs && node tools/money-arithmetic-lint.mjs && node tools/commercial-boundary-lint.mjs` | 0 |
| `pnpm build` | 0; all 7 tasks successful, 2 from existing shared cache |
| `pnpm exec turbo run lint` | Initial exit 2: web `.next/types` files were being regenerated by concurrent build; rerun after build below |
| `pnpm exec turbo run lint` after build completed | 0; all 7 package lint tasks successful, 2 cached; official root lane-check refusal remains outstanding |
| `pnpm --filter @jobguard/core --filter @jobguard/config --filter @jobguard/ai --filter @jobguard/storage --filter @jobguard/web test` | 1; core default discovery included emitted `dist` tests, duplicate failures, and an existing receipt-allocation timeout under load; source-only run below |
| `pnpm --filter @jobguard/core exec vitest run src --maxWorkers=1` | 1; filter also matched emitted filenames containing `pkg-src-82`, so both copies of the held quote tests ran; corrected discovery below |
| `pnpm --filter @jobguard/core exec vitest run --exclude 'dist/**' --maxWorkers=1` | 1; **2456 passed / 2 failed**; only the two new, held quote regressions fail; every existing core source test passed |
| `pnpm --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/web exec vitest run src --maxWorkers=1` | 1; web tests are outside `src`; corrected discovery below |
| `pnpm --filter @jobguard/config --filter @jobguard/storage --filter @jobguard/web exec vitest run --exclude 'dist/**' --maxWorkers=1` | 0; config 1, storage 2, web 784 tests passed |
| `pnpm eval` | 0; 80 fixture tests passed, no live model run |
| `node --test tools/policy-gate-sites.test.mjs tools/dependency-audit.test.mjs tools/decision-check-purity.test.mjs tools/decision-records.test.mjs tools/core-purity.test.mjs tools/shared-money-origin.test.mjs tools/commercial-boundary.test.mjs` | 0; 19 passed; no live registry scan claimed |
| `pnpm --filter @jobguard/db exec vitest run test --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts' --maxWorkers=1` | 1; emitted and source audit-checkpoint graph tests both timed out at their unchanged 5000ms limit |
| `pnpm --filter @jobguard/db exec vitest run --exclude 'dist/**' --exclude '**/*.integration.test.ts' --exclude '**/free-port.test.ts' --maxWorkers=1` | 0; **169 passed**, no database started |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --maxWorkers=1` | Interrupted, 130; HTTP tests need forbidden socket binding; not a pass |
| First API rerun excluding HTTP-named files and health, but not SSO action-paths | Interrupted, 130; action-paths also imports Supertest; corrected selection below |
| `pnpm --filter @jobguard/api exec vitest run src --exclude '**/shadow-isolation.application.test.ts' --exclude '**/*.http.test.ts' --exclude '**/health.test.ts' --exclude '**/action-paths.test.ts' --maxWorkers=1` | 1; **1557 passed / 1 skipped** (existing skip); 64 files passed, one suite failed before tests: `final-account-lock.isolation.test.ts` dynamically imports a PostgreSQL fixture and cannot acquire a port (`no free port in 58400..58650`). No database was started |
| `pnpm openapi:check` | 1; `tsx` CLI cannot bind its Unix IPC socket (`listen EPERM`) |
| `pnpm --filter @jobguard/api exec node --import tsx src/generate-openapi.ts --check` | 0; identical OpenAPI checker without CLI IPC |
| `git diff --check` | 0 |

Turborepo reported sandbox `Operation not permitted` cache-write warnings. The
successful task exit codes above remain distinct from clean-install execution;
cached config/storage checks were not claimed as freshly executed checks.

## Compatibility, operations and remaining gates

No database schema, migration, grants, routes or API/OpenAPI shape changed. The
discrepancy input type stays numeric; integer callers retain their prior shape,
while six-place fractional values now work. Discounted undelivered goods and
fractional calculations intentionally produce corrected monetary findings.
Existing persisted history is not rewritten. Stored command-result replay remains
unchanged; legacy commands lacking stored results recalculate against immutable
sources and may refuse a payload hash made by the erroneous arithmetic rather
than rewriting it. No new operational alert was introduced.

Dispatcher must run the full **`pnpm test`**, **`pnpm test:db`**,
**`pnpm test:migrations`** and **`pnpm test:e2e`** on an unrestricted Mac or in
GitHub CI after pushing. In particular, real-PostgreSQL watchdog, things-replay,
supplier-matching and quote/final-account suites remain required; so do existing
mobile-360 and desktop browser journeys. Local unit tests do not prove persisted
tenant isolation, runtime privileges, migrations or browser behavior. Also run
the excluded DB/server test `apps/api/src/shadow-isolation.application.test.ts`,
`apps/api/src/final-account-lock.isolation.test.ts`, API `*.http.test.ts`,
`apps/api/src/health.test.ts`, `apps/api/src/auth/sso/action-paths.test.ts`,
`packages/db/test/free-port.test.ts`, and tool lane-boundary suites (these create
and mutate temporary Git repositories, prohibited by this work order).

The required official lane checks must be rerun after the dispatcher makes a
commit, with `LANE_BASE_REF=origin/main` and a non-self comparison. Resolve the
quote fixture conflict before claiming a green suite. A real independent RED
verdict bound to the dispatcher's exact commit and separate technical acceptance
are outstanding. No release/commercial/security approval is inferred here.

Intended commit message: `/private/tmp/jg-msg-audit-fix-pkg-src-82.txt`.
