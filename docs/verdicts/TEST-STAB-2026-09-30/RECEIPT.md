# TEST-STAB-2026-09-30 — run receipt

Date: 30 September 2026. Branch: `codex/sandbox/test-stab-2026-09-30`.

Implemented locally; full verification is held by the Mac PostgreSQL environment. This is a builder run receipt, not an independent model verdict or technical acceptance. The changes are uncommitted. HEAD remains `10f1fae9bdcba62157ccd8b1cac5947ce7992e42`; the dependency fix `72fef6a`, its PASS verdict `169e4f5`, and acceptance `10f1fae` remain in ancestry. No push, merge, PR, live provider call, spending, or real decision approval occurred.

Read AGENTS.md (including §§2, 5.3, 5.5) and BUILD_PLAN.md C1–C8. In this checkout those clauses are under §13.2, rather than §2.4. The requested September 30 flaky-mobile-test row is absent from the local build plan; the explicit user work order supplies this task's scope. The React best-practices skill was used to review derived state, subscriptions, effects, and cleanup.

Root causes and changes:

1. PurchaseOrder accepted the prior `order` while edited form values or a pending revision represented different intent. A zero price difference could already exist on the old 11 × £20 revision, so waiting for that label did not prove that the new 10 × £20 revision had arrived. Approval now requires an idle flow and exact agreement between the form and authoritative preview: rational quantity, integer unit-price pence, recipient and required date. Both the button and handler use this guard. Approval captures the displayed order and binds its revision ID, aggregate revision, authority hash, recipient and net pence. Preview revision, quantity and recipient are displayed, and unsaved edits are labelled; the recipient wraps within a narrow viewport.
2. SupplierDocuments, SupplierFactEditor and SupplierMatch had independent local busy flags; ThingsToCheck had none. Confirm → match → check could overlap, as could import, receipt correction, finding review, re-evaluation or bill supersession. A job-scoped, synchronous command owner now locks Materials, PurchaseOrder, SupplierDocuments, SupplierFactEditor, SupplierMatch and ThingsToCheck together, before the first await. Controls remain disabled through the command and authoritative refresh of every mounted projection. Failure paths release the lock and surface errors. Refresh failure clears unavailable state and disables state-dependent actions. Initial/background reads use command generations and per-projection request tickets so earlier or out-of-order responses cannot replace newer state. Polls skip a pending command; refresh buttons share the lock. Read registrations unsubscribe on unmount. This is client concurrency control; existing server membership/authorization/revision checks remain authoritative, including across browser clients.
3. No reusable public decimal-price parser existed in core. Added `parsePoundsToPence` to the already-exported money module. It constructs integer pence from decimal digits through bigint, enforces the existing 1,000,000,000,000-pence limit, and returns validated branded pence. It rejects negative/noncanonical input, whitespace, exponents, currency/grouping characters and more than two fractional digits; it never rounds input. PurchaseOrder, Materials and SupplierFactEditor now use it with visible errors. SupplierFactEditor quantity × price validation also uses exact rational/bigint equality instead of nested float rounding; money inputs and confirmed quantities retain exact decimal digits.
4. M2-1B-S now checks each new preview revision, quantity, recipient and net before continuing, asserts dirty approval is disabled, and waits for revision 5 / quantity 10 / £200.00 before approval. M2-5-S waits for the order preview, delivery/accepted quantities, ready invoice, confirmed fact revision, matched source quantities, dispute outcome and revised invoice confirmation before the next command. Existing assertions, timeouts, retry policy and project coverage remain intact; no skips or success-API interception were added.
5. Focused tests cover rendered approval enabled/disabled states (initial state is seeded for a component unit render), each dirty field, invalid form values, a pending preview and refresh, synchronous same-turn exclusion, job isolation, stale/out-of-order reads, unavailable projections, obsolete read failures and command/refresh error cleanup. Money tests cover exact 0/1/2 fractional digits, float-sensitive examples, the maximum value, oversized values and invalid forms.
6. The first repository mutation registered `test-stab-2026-09-30` with the exact branch and specific changed UI/helper/test/spec paths, conditional core scope, config and verdict paths. Compact JSON style is preserved.

Validation environment: macOS arm64, Node `v24.17.0`, pinned pnpm `10.28.1`, Next `15.5.25`, Vitest `4.1.11`, embedded PostgreSQL `16.10.0-beta.15`. Installed from the previously absent node_modules using `pnpm install --frozen-lockfile`; no package/lockfile changes. The outer pnpm launcher created an untracked `.pnpm-store`; it was moved to `/tmp`, and final commands used the installed pnpm 10.28.1 executable via `PATH="/tmp/test-stab-bin:$PATH"`. The code tree has no generated pnpm store. Unchanged Turbo tasks may use the shared cache; changed web checks executed.

Commands actually run (final attempts unless noted):

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm install --frozen-lockfile` | 0 | Clean pinned dependency install; Darwin PostgreSQL postinstall was initially skipped by the existing build-script allowlist. |
| `PATH="/tmp/test-stab-bin:$PATH" pnpm typecheck` | 0 | 7/7 tasks successful. |
| `PATH="/tmp/test-stab-bin:$PATH" LANE_BASE_REF=72fef6a pnpm lint` | 0 | Purity, lane, money/commercial boundaries and 7/7 package lint tasks passed. Base is the inherited security-fix implementation; its later verdict/acceptance files are within verdict scope. |
| `PATH="/tmp/test-stab-bin:$PATH" pnpm test` | 1 | Root tool tests 39/39; core 380/380; API 75/75; AI 72/72; web 54/54; storage 4/4; config 2/2 passed. DB: 32 files failed setup, 2 files passed; 15 tests passed, 134 skipped by failed setup, 1 failed (restore setup). Full suite is not green. |
| `PATH="/tmp/test-stab-bin:$PATH" pnpm build` | 0 | 7/7 tasks successful, including the production Next build. |
| `PATH="/tmp/test-stab-bin:$PATH" pnpm --filter @jobguard/web test` | 0 | Final web rerun: 54/54 tests passed, including all 18 focused tests. |
| `PATH="/tmp/test-stab-bin:$PATH" pnpm --filter @jobguard/web exec vitest run app/ui/purchase-order-state.test.ts app/ui/materials-command.test.ts` | 0 | 18/18 focused tests passed in 2 files. |
| `PATH="/tmp/test-stab-bin:$PATH" CI=1 DEBUG=jobguard:e2e-db pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M2-1B-S.spec.ts M2-5-S.spec.ts` | 1 | Attempted both specs/projects against the production build; PostgreSQL global setup failed before browser assertions. No screenshots/traces proving the journeys were produced. |
| `git merge-base --is-ancestor codex/sandbox/sec-deps-2026-09-30 HEAD` | 0 | Parent security branch preserved. |
| `git diff --check` | 0 | No whitespace errors. |
| `command -v docker` | 1 | Docker unavailable. |

Earlier attempts: typecheck exited 1 before install (`turbo: command not found`); lint exited 1 while generated `.pnpm-store` files violated the lane (relocated, final lint passes); the new component-render tests initially exited 1 because Vitest's classic JSX transform needed React in the test runtime (corrected in the test; final focused/root web tests pass). Initial DB/e2e attempts reported `Postgres init script exited with code null`.

The native loader diagnostic `node_modules/.pnpm/@embedded-postgres+darwin-arm64@16.10.0-beta.15/node_modules/@embedded-postgres/darwin-arm64/native/bin/initdb --version` initially exited 134: `libicudata.68.dylib` was missing. Inspected the package's local postinstall and ran `node scripts/hydrate-symlinks.js` in that installed package directory (exit 0), restoring generated local dylib symlinks without changing tracked build policy. A mistaken first spelling `node scripts/hydrateSymlinks.mjs` exited 1 (file absent); corrected to the package's declared script. `initdb --version` subsequently exited 0, reporting PostgreSQL 16.10. A disposable initdb diagnostic run through Python exited 1 internally (diagnostic wrapper exit 0) and captured:

```text
FATAL: could not create shared memory segment: No space left on device
DETAIL: Failed system call was shmget(key=159190374, size=56, 03600).
```

This is a shared-memory ID/limit failure, not proof of insufficient disk space. The final DB and e2e attempts report initdb exit 1. No kernel settings or shared-memory segments were altered, and no alternative/mock DB was substituted. Full database/browser regressions need rerunning in a working PostgreSQL environment. `pnpm test:db` and `pnpm test:migrations` were not separately run; the full root test already attempted the real DB suites, and there is no schema/migration change. No prompt/model/parser-extraction/matching-policy change requiring a new evaluation gate was made.

UI sweep findings (source inspection, not independently reproduced defects):

| Component(s) | Finding / disposition |
| --- | --- |
| PurchaseOrder, Materials, SupplierDocuments, SupplierFactEditor, SupplierMatch, ThingsToCheck | Fixed within this flow: independent/missing command locks, stale refresh risks, dirty approval and float money input/validation. |
| `recovery-cases.tsx` | `Math.round(Number(amount)*100)` still converts a decimal monetary input through float arithmetic. Outside this work order; unchanged. |
| `quote-editor.tsx` | Save/preview have guards and signature checks, but send/worker execution/acceptance/disposition/switch-live do not have a shared command-in-flight guard. Follow-up actions can overlap those commands. Unchanged. |
| `decision-inbox.tsx`, `readiness.tsx`, `relevance-inbox.tsx`, `commercial-integrity.tsx`, `job-final-account.tsx`, `fee-statement.tsx` | Mutation/review/build/calculation handlers lack a command busy exclusion. Generation guards in some prevent old render updates but do not serialize commands. Unchanged. |
| `customer-credit-notes.tsx` | Approval is busy-disabled and edits clear a preview, but amount/reason remain editable during preview creation; a late response can restore a preview for earlier inputs. Unchanged. |
| `customer-invoices.tsx` / `customer-credit-notes.tsx` / `customer-receipts.tsx`; `recovery-cases.tsx` / `evidence-packs.tsx` | Each has local busy controls, but sibling/parent commands do not share a lock. Candidates for follow-up concurrency review, not a claim of a reproduced server defect. Unchanged. |
| `fee-statement.tsx`, `customer-credit-notes.tsx` | Regex sweep also matches `Number(wholeDigits)*100 + Number(fractionDigits)`. These split bounded integer digits and are exact here, unlike multiplying a decimal Number by 100; not counted as float-money defects. |
| `jobguard-app.tsx` (WalkIt) | Capture submission has no busy exclusion and leaves its source editable while the draft request is pending. A candidate for follow-up; unchanged. |
| JobVariations, LocalDictation, JobGuardApp sign-in | Apparent AST hits have UI gating: JobVariations has a disabled ancestor fieldset; LocalDictation hides install during downloading; sign-in is replaced by the checking view. These were not counted as the reported dependent-command defect. |

Per the explicit work order, out-of-flow findings are recorded here; BUILD_PLAN.md remains untouched. No external API/authorization contract, persisted schema, migration, commercial/tax policy, provider register or environment variable contract changed. Input compatibility is intentionally stricter: overprecision/invalid pounds input now fails visibly rather than rounding. Existing server command schemas and exact-authority validation are preserved. No new operational alert was introduced. G1/G4, live-provider/commercial gates, and cross-model review/separate acceptance remain open; no release readiness is inferred from local checks.

Files changed (15 source/config/test files plus this receipt):

- `apps/web/app/ui/materials-command.test.ts`
- `apps/web/app/ui/materials-command.ts`
- `apps/web/app/ui/materials.tsx`
- `apps/web/app/ui/purchase-order-state.test.ts`
- `apps/web/app/ui/purchase-order-state.ts`
- `apps/web/app/ui/purchase-order.tsx`
- `apps/web/app/ui/supplier-documents.tsx`
- `apps/web/app/ui/supplier-fact-editor.tsx`
- `apps/web/app/ui/supplier-match.tsx`
- `apps/web/app/ui/things-to-check.tsx`
- `apps/web/e2e/M2-1B-S.spec.ts`
- `apps/web/e2e/M2-5-S.spec.ts`
- `config/agent-lane-assignments.json`
- `packages/core/src/money.test.ts`
- `packages/core/src/money.ts`
- `docs/verdicts/TEST-STAB-2026-09-30/RECEIPT.md`

Source SHA-256 bindings for this uncommitted patch (receipt excluded):

```text
64dabfb11ac5711c9f0aa9da8fe6f94e871203fcfc538a09f11654ba3553ac9b  apps/web/app/ui/materials-command.test.ts
6ec5ec0770f416d5b048dc524220fe5ecec43664d44e52fdc2567e6be9ce8af0  apps/web/app/ui/materials-command.ts
df3fedc022810a232cba85c2217c7be7fabbe3da0bbbb1fc9ca0dfbf389a4f32  apps/web/app/ui/materials.tsx
ec6aefcb38d4d43a5e3fcdd70deb5a67ffcb0057fccaec37f7c246c7d4b2b054  apps/web/app/ui/purchase-order-state.test.ts
793abb056150767c138aeb8a5b2ead4233143f9d03c99f64ce898b89f4d3f562  apps/web/app/ui/purchase-order-state.ts
23a6a71c42ecaceb7d5cbb5c8167c3f7d7d807f2302486f70779886c7f500a22  apps/web/app/ui/purchase-order.tsx
d8d74a0157ab1af12d9f0cbd385729007ce9e0e122064d0dbcd58288955765c0  apps/web/app/ui/supplier-documents.tsx
66fc569c9fc82e2dc529e88a35d4d050a307020eb9ff77a5899076fadf00bc5b  apps/web/app/ui/supplier-fact-editor.tsx
a734bb11d628af491c3de41c55ce7c304401a9566721ad9188f426a6e32d8ab7  apps/web/app/ui/supplier-match.tsx
69404db69b5e25148d26d5c19be30b625b60c26321ecf8fc06e183fd25c794af  apps/web/app/ui/things-to-check.tsx
d552785fad2c6713d8ee64f35ae78b36537b3b7db99e1b898d0f4d5cf203e5e0  apps/web/e2e/M2-1B-S.spec.ts
3e6fb0d731ea5196ddabe3ed0cf4c73f9d7417d96fc84d12d9ba170b2c372a8b  apps/web/e2e/M2-5-S.spec.ts
8bf44e53379ea1d412c1e484ae0e0fc72660de7e6204ea251f4223cfd146bb27  config/agent-lane-assignments.json
f36d6ddd781e2d72718049d9d58e04e8aed4d937b7294e10f64f1da3079fe26a  packages/core/src/money.test.ts
b87e83d291fd5db09ef776737afa3f759629a44ef8af23bc14e6903ecadcc242  packages/core/src/money.ts
```
