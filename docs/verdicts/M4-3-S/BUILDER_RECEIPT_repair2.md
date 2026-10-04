# M4-3-S-R repair 2 — BUILDER RECEIPT, not an independent review

**Builder:** Claude Sonnet 5.5 (repair 2, on top of Codex's repair 1). Branch `codex/sandbox/m4-3-s-repair`, local only.
**Date:** 3 October 2026. **Code commit all results below are bound to: `daa8328f772c725185f6bfaeb9cf0fea2b6b196f`**
(`fix(e2e): make the M4-3-S spec runnable against the real app`), on top of Codex's `914ca68` (implementation `906f35b`).
This receipt is a later, documentation-only commit; no code changed after the verification runs.
Migration: **0042** `0042_evidence_pack_repair.sql` (the number the rev 3.0 §12.2 ledger gives this repair). Unchanged by me.

**State: NOT independently verified. NOT technically accepted. NOT pushed. No PR.** Two earlier verdicts
(`fd56bdd.md`, `8116aa6-repair.md`) are preserved as written and are not superseded by this receipt. A fresh independent
verdict bound to the exact head is still required. I built; I did not review or accept anything.

## What was wrong when I started, and what I did

Codex's repair 1 was never executed (its sandbox could not start PostgreSQL or bind a port). On this Mac, with the
environment working, **the database side was already green** (`pnpm test:db` 167/167) but **the browser spec had never
run and was broken in three ways**. I fixed only those three, in `apps/web/e2e/M4-3-S.spec.ts`; I changed no product code,
no migration and no other test.

1. `persistedSources` called live-job APIs before the asynchronous "Start this practice job" activation had finished
   (`{"code":"ACTIVATION_REQUIRED"}`, all four runs). It now waits for the persisted "Live · baseline frozen" heading,
   the same condition `m1-15-complete-journey.spec.ts` waits for.
2. The merchant journey imported the `materials-B-delivery` fixture with no purchase-order draft
   (`{"code":"PURCHASE_ORDER_REQUIRED"}`, a real intake rule in `supplier-document-repository.ts`). It now creates the draft
   through the real `purchase-orders/revisions` command first (quantity 40 at £20.00, matching the recorded rate).
3. The "open the job from Jobs" step clicked a Jobs row that cannot exist (see OPEN FOR BEN, item A). It now leaves through
   the Jobs home and reopens the saved job by a fresh navigation (not a reload) and asserts the same persisted pack hash.

No assertion about packs, hashes, findings, approvals, banner count, overflow, focus or 44px targets was weakened,
skipped, retried or given a longer timeout. No test was skipped anywhere.

## Environment

macOS 26.4 (arm64), Node v24.17.0 (`.nvmrc` says 24.15.0), pnpm 10.28.1 (via the pnpm 11 launcher; the "pnpm field in
package.json is no longer read" warning comes from that launcher and is harmless), embedded PostgreSQL **16.10**
(`embedded-postgres` 16.10.0-beta.15), Vitest 4.1.11, Playwright 1.55.1, Next 15.5.25. `pnpm install --frozen-lockfile
--offline` → exit 0, "Lockfile is up to date… Already up to date" (nothing to reinstall).

Database environment: PostgreSQL started cleanly on this Mac with no change from me. The dylib sibling symlinks Codex added
under `node_modules` (`libicu*.68`, `libicui18n`, `libzstd.1`, `liblz4.1`, `libz.1`) were already present and sufficient;
`initdb` and a probe server start/stop worked. The "No space left on device / shmget" failure Codex hit did not occur here;
`ipcs -m` shows 14 leaked 56-byte SysV segments (NATTCH 0, from killed Postgres runs earlier today) against `kern.sysv.shmmni`
= 32. I did not remove them (not needed, not mine to clear); they are a latent risk if more leak.

**Browser environment (a real deviation, please read).** Playwright 1.55.1 needs `chromium_headless_shell-1193`, which is not
installed on this Mac (the cache holds a truncated `chromium-1193`, left by a `playwright install chromium` process that has
been hung since 22 Sep, pid 82448, not mine, left running). Downloading a browser needs Ben's permission, so I did not
download one. The exact required command was run once and fails at browser launch (see table, row E0). The runs that count
used **an already-installed Chrome-for-Testing 151.0.7922.34 headless shell** (Playwright's own build, from the 1234 cache) via
an untracked override config kept outside the repository
(`/private/tmp/claude-501/-Users-benharwood-Claude-Projects-Next-Gen-Learning-Platform/779eca0d-4227-4a11-b830-3a8387c288bc/scratchpad/pw-local-browser.config.ts`):
it spreads the repository's `apps/web/playwright.config.ts` and changes **only** `launchOptions.executablePath` (plus absolute
paths). Same spec, same two projects and viewports (`mobile-360` 360×800, `desktop` 1280×800), same production `next start`,
same global setup and real embedded PostgreSQL. It is **not** the pinned Chromium 140 and not CI's browser; CI-identical browser
evidence needs `pnpm exec playwright install chromium` (about 100 MB from Playwright's CDN) with Ben's OK, then a re-run.

Every database or browser command ran inside `heavy-slot m43r …`. Logs: `/private/tmp/m43r-logs/`.

## Commands run (all in the worktree; "counts" are runner counts, not acceptance)

| # | Command | Exit | Result |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile --offline` | 0 | already up to date |
| 2 | `TURBO_FORCE=true pnpm typecheck` | 0 | 7/7 tasks, 0 cached, 0 TS errors |
| 3 | `TURBO_FORCE=true LANE_BASE_REF=origin/main pnpm lint` | 0 | 7/7 tasks, 0 cached; purity, lane, money, commercial checks pass |
| 4 | `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `m4-3-s-repair`, all changed files inside its allow-list |
| 5 | `pnpm build` (at `914ca68`; only the e2e spec and this receipt changed after) | 0 | 7/7 tasks (4 cached), production Next build passed |
| 5b | `TURBO_FORCE=true pnpm build` at `daa8328`, run after the verification runs | 0 | 7/7 tasks, 0 cached |
| 6 | `heavy-slot m43r pnpm test` | 0 | tools 39/39; storage 4, config 2, core 366, ai 72 (turbo cache hits, replayed); api 84, web 36, db **167** executed fresh; 13/13 tasks |
| 6b | `pnpm --filter @jobguard/{core,ai,storage,config} test` run directly, bypassing the turbo cache | 0 ×4 | core 366 (68 files; includes generated `dist` duplicates, not 366 distinct tests), ai 72, storage 4, config 2 |
| 7 | `heavy-slot m43r pnpm test:db` | 0 | **36 files, 167 tests passed, 0 skipped** (first run and final run identical). Includes `evidence-packs.integration` 11, `evidence-pack-sources.integration` 6, `demo-bootstrap.integration` and `sandbox.integration` (real `SET ROLE jobguard_migration` bootstrap), `UIWIRE-12` (43 migrations) |
| 8 | `heavy-slot m43r pnpm test:migrations` | 0 | 2 files, 11 tests passed (`tenancy.integration`, `demo-bootstrap.integration`) |
| 9 | `pnpm openapi:check` | 0 | spec matches (plain `tsx`; no IPC failure here) |
| E0 | `heavy-slot m43r env CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop M4-3-S.spec.ts` (the exact required command, pre-fix spec) | 1 | global setup/bootstrap passed; **0 of 4 ran**: `Executable doesn't exist … chromium_headless_shell-1193`. Environmental, not a test result |
| E1 | same spec, override browser, **before my fixes** | 1 | 4 failed: `ACTIVATION_REQUIRED` ×4 (spec defect 1) |
| E2 | same, after fix 1 | 1 | 4 failed: customer test timed out on the Jobs row (defect 3; every pack assertion before it passed); merchant test `PURCHASE_ORDER_REQUIRED` (defect 2) |
| E3 | same, after fixes 2 and 3-first-attempt | 1 | merchant test 2/2 passed; customer test still timed out (I first tried a `← Jobs` link that capture-created job pages do not have) |
| E4 | `-g 'maps immutable'`, after the final fix 3 | 0 | 2/2 passed |
| **E5** | `heavy-slot m43r env CI=1 pnpm --filter @jobguard/web exec playwright test -c <override> --project=mobile-360 --project=desktop M4-3-S.spec.ts` **at `daa8328`** | **0** | **4 passed (15.1s): mobile-360 2/2, desktop 2/2** |
| E6 | same override, `M4-1-S.spec.ts M4-2-S.spec.ts`, both projects (extra regression evidence; this branch changed `recovery-cases.tsx`) | 0 | **6 passed (14.3s)**: M4-1-S and M4-2-S, 3 tests × 2 projects |
| C | `node packages/db/tools/verify-evidence-pack.mjs` on generated packs | 0/1/1/1/2 | intact + independently supplied digest: complete (exit 0); intact without digest: `Checkpoint not independently trusted` (1); tampered: `Content hash mismatch` (1); missing: `Missing original source` (1); malformed file: exit 2 |

Screenshots (uncommitted by rule C7, "no binary assets committed"; SHA-256 recorded): `/private/tmp/m43r-logs/M4-3-S-mobile-360.png`
(`366b42bf159df537cdf066411871b1077be688edc0998e3acc3d036184617a6c`) and `/private/tmp/m43r-logs/M4-3-S-desktop.png`
(`57bced7b173337199a52a8c0e9af655e63cd8f1b00b67df2fab65ab59fe1d5c7`), from the run in E5. Playwright traces are only kept on failure.

## Every finding

### `fd56bdd.md` (original FAIL)
| # | Sev | Status | Where / proof |
|---|---|---|---|
| 1 | HIGH sources are template strings | **FIXED** (Codex, verified by execution here) | `packages/db/src/evidence-pack-sources.ts` reads tenant/job-bound quote, acceptance, verified proof bytes, approved variations, claim revisions and events, and the case's real `source_refs`; unmapped refs fail closed; absent categories are explicit omissions. Proof: `evidence-pack-sources.integration` 6/6; e2e asserts quote, proof, variation and invoice source IDs from the server response and that a merchant pack excludes the unrelated delivery and credit (E5) |
| 2 | HIGH approval invalidation vacuous | **FIXED** (Codex, verified here) | append-only `evidence_pack_attachment_approval`; validity recomputed against current sources. Proof: `evidence-packs.integration` "records exact attachment approval, rejects stale hashes, and invalidates previous approvals…"; e2e shows "Attachment approval recorded for these exact hashes", then a new proof flips it to "Previous attachment approval invalidated…" and a stale approve returns 409 |
| 3 | MED server cannot report findings / no standalone verifier | **FIXED** (Codex, verified here) | server `inspect()` verifies the stored artifact; e2e compares server findings with the core verifier for all four scenarios; standalone `packages/db/tools/verify-evidence-pack.mjs` run by me (row C) |
| 4 | MED download not a ZIP | **FIXED** (Codex, verified here) | `text/plain`, `.txt`; e2e asserts content type, filename and the downloaded bundle's banner and manifest (E5) |
| 5 | MED no DB integration test | **FIXED** (Codex, executed here) | `evidence-packs.integration` 11/11 on real PG16: replay, wrong case, cross-tenant INSERT 42501, wrong-job FK 23503, UPDATE/DELETE/TRUNCATE 42501, legacy ZIP/PDF held, audit counts and rollback, concurrency |
| 6 | MED C6 spec never ran | **FIXED by execution, with the browser caveat above** | E5 (and the three spec defects it exposed, fixed above). Counts and screenshots attached |
| 7 | LOW hand-rolled SHA-256 vectors | **FIXED** (Codex, executed here) | core tests: "abc", the 448-bit NIST string and a non-ASCII string pass (row 6b) |
| 8 | LOW docs / client actor / no receipt | **FIXED** (Codex) | `packages/db/MIGRATIONS.md` has 0041 and 0042; actor is server-derived `membership:<id>`; receipts exist in `docs/verdicts/M4-3-S/` |

### `8116aa6-repair.md` (repair-candidate FAIL)
| # | Sev | Status | Where / proof |
|---|---|---|---|
| 1 | HIGH 0042 cannot apply under `jobguard_migration` FORCE RLS | **FIXED** (Codex's `ALTER POLICY … nullif(current_setting('app.tenant_id', true), '')::uuid` at the start of 0042) and **now executed**: `demo-bootstrap.integration` (real non-superuser owner + `SET ROLE jobguard_migration`, fresh and idempotent, 43 migrations), `sandbox.integration`, and the Playwright global setup bootstrap all pass (rows 7, 8, E4/E5). **I did not run a break-it check of the fix** (a request to temporarily remove the policy statements for a mutation check was denied by the permission system; I did not pursue it). The three failures reproduced by the earlier reviewer do not occur |
| 2 | MED stale migration count in UIWIRE-12 | **FIXED** (Codex), passes (row 7) | `UIWIRE-12.integration.test.ts` and the bootstrap test now expect 43 |
| 3 | LOW view reports `'TEXT'` for legacy rows | **FIXED** (Codex) | `evidence-packs.integration` `it.each(['ZIP','PDF'])` reports the stored format while holding download and approval |
| 4 | LOW session cookie written to `actor_ref` | **FIXED** (Codex) | actor is `membership:<id>`; `evidence-pack.application.test.ts` proves identical generate arguments across two sessions |
| 5 | LOW "Untrusted checkpoint" scenario a no-op | **FIXED by labelling** (Codex) | option reads "Untrusted checkpoint (same intact sources)" with an explanation; e2e asserts the finding appears for `checkpoint` |
| R6 | counts + two screenshots | **DONE** | rows 7, 8, E5 and the two screenshots above |

## OPEN FOR BEN (these keep the repair on hold until answered)

**A. C7 "open the job from Jobs" cannot be met literally for this job type.** The Jobs home is "the deliberately filtered
home-page fixture list" (`packages/db/src/demo-runtime.ts`): it excludes every job with a capture proposal or a sandbox run, and
the capture-created job page (`workspace-shell.tsx`) has no link back to it. The M4-3-S journey necessarily uses a
capture-created job, so there is no Jobs row to click. I did not change product behaviour (that is a product decision, and it
would alter other specs' fixtures). The spec instead goes to the Jobs home, then reopens the saved job by a fresh navigation and
checks the same persisted pack hash, plus a second browser context deep link. Question for Ben: accept that as meeting C7 for
capture-created jobs, or order a product change (list them on Jobs and link back)?

**B. Browser evidence is on a substitute browser.** To get CI-identical evidence Ben must allow `pnpm exec playwright install
chromium` (downloads from Playwright's CDN, about 100 MB), and the spec then needs a re-run. A hung installer (pid 82448, since 22 Sep)
also holds that cache; it should be looked at by Ben, not by me.

**C. Branch is behind `origin/main`.** Local `origin/main` is now `3e0764b` (another session fetched; plan rev 3.0 #93 and #95
"remove in-flight races from purchase-order and supplier screens; clear 30 Sep dependency advisories"). This branch is based on
`694e9e1`. The only overlapping file is `config/agent-lane-assignments.json` (will conflict on a rebase); `package.json` and
the lockfile also moved on main. I did not rebase or merge (not asked). All results above are on the `694e9e1` base. Per rev 3.0
the verdict must be re-recorded on the final head, which will be a rebased one, so these runs will need repeating after the rebase.

## Not run

- The exact required e2e command succeeding with Playwright's pinned browser (see B; E0 shows the failure).
- A break-it (mutation) check that 0042's policy change is what makes the bootstrap pass (denied; see finding 1).
- `pnpm test:regression` and the other web specs beyond `M4-3-S`, `M4-1-S`, `M4-2-S`.
- Live providers, deployment, release, anything involving real data: not in scope and not touched.

## Remaining gates

Fresh independent verdict bound to the final head; separate technical acceptance; Ben's decisions A–C; rebase onto current
`main` and a re-run; Ben's push and merge. Nothing here is a release or customer claim.
