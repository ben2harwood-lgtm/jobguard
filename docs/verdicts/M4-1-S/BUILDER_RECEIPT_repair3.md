# M4-1-S-R — builder receipt, repair 3

Date: 2026-10-03. Builder: **Claude Sonnet 5.5** (repair 3, on top of repair 1 by Codex and repair 2 by Claude Sonnet 5.5).
**Not independently verified. Not accepted.** This is the builder's account. Two independent checks asked for this repair: Claude Opus (`jg-verdicts/M4-1-S-R-13d9fa7.md`) and GPT-6.1 Sol high (`jg-runs/m4-1-s-r-solcheck-20261003T215128.md`). A fresh verdict bound to the new head and a separate acceptance are still owed.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103, previous head `13d9fa7` (CI red: both M4-2-S browser projects).
- Commits in this repair (all end `Co-Authored-By: Claude Sonnet 5.5`): `b9a25f7` tests written first; `3061a43` the fixes; the merge of `origin/main` b039abf (one conflict, the one-line shared lane registry: main's file taken and only this lane re-added); this receipt.
- Lane: the repair now has **its own lane** `m4-1-s-repair` with exact files and `docs/verdicts/M4-1-S/**` (Opus P3 5). Lane `m4-1-s` is exactly main's again.
- The local Playwright shim now lives **outside the repository** (`/private/tmp/.../scratchpad/m41r-pw/playwright.m41r.config.ts`) so it cannot be committed and does not trip lane lint. There is no untracked file in the worktree.

## Tests first

Written and run red before any fix (logs `m41r-logs/r3-red-db.log` and a core run): core 6 failed (reversal after dispute x3, pursuing/negotiating reversal rows, recorded-id shape); PostgreSQL 5 failed (computed fee/no-landing proof, SQL landing into written-off principal, wrong-job replay, reversal after dispute, plus a fixture defect of mine that I then fixed). The e2e additions (fee, float input, error focus, 44x44) were written before the UI change but I did **not** run them red on their own; they were first run against the fixed UI.

## Findings from both checks

| Check / # | Finding | Status | Fix and proof |
|---|---|---|---|
| Opus P1-1, Sol 2 | CI red: fee label broke `M4-2-S.spec.ts` | **FIXED, sibling spec untouched** | The fee is no longer a label: `RecoveryCaseRepository.list` returns `feeIllustrativePence`, the per-case sum of posted `recovery_fee_derivation.posting_delta_pence` (through the case's allocations and their reversals). It is 0.00 until a qualifying landing is approved, so `M4-2-S.spec.ts` (`case-fee` = 0.00, landed 0.00) is **unchanged** and now asserts a computed value. Executable proof that eligibility approval creates neither a landing nor a fee: DB test "shows a computed per-case fee; eligibility approval creates neither a landing nor a fee, and an approved landing does" — after repository review + approve, `landing_allocation`, `recovery_fee_derivation` and `recovery_fee_journal` rows for the case are 0/0/0 and fee 0; after an approved landing the fee equals the stored derivation delta (> 0). `M4-1-S.spec.ts` asserts 0.00 plus a basis note |
| Opus P1-2 | Closed source catalogue blocks M4-3-S-R's recorded ids | **FIXED** | Sources are a catalogue label **or** a recorded id that must resolve for the same tenant and job to the right kind: customer invoice; supplier agreement rate used on the job (via `material_requirement`); ready supplier invoice/delivery document by version or document id (same predicates as `evidence-pack-sources.ts` on #101). Held and credit documents, other jobs/tenants, wrong kind, unused rates, duplicates, free text are refused with `RECOVERY_SOURCE_NOT_RECOGNISED`, writing nothing. Proof: DB tests (accepts recorded invoice with its label; mixed label + id; rate + supplier version + delivery document id; refuses 12 bad shapes) and core tests. **Links**: each source link focuses an in-page detail that names the kind and, for recorded ones, the record id; there is no separate record viewer yet |
| Opus P2-3 | Binary-float money in the UI | **FIXED** | `parsePoundsToPence` replaces `Math.round(Number(x)*100)`; `1e3`, `0x10`, `-1`, `1.234`, `0` are refused with a message in the alert. e2e: `1e3` is refused before any command is sent |
| Opus P2-4 | Conflicts with siblings #101 and #102 | **NOT FIXABLE HERE — integration step** | They are real (migration registration 0042 before 0043, count assertions 43 to 44, `MIGRATIONS.md`, `recovery-cases.tsx`, `recovery-case-repository.ts`, `recovery-cases.integration.test.ts`, lane registry, `evidence-pack-repository.ts`). Resolving them needs those branches' final heads. Compatibility facts for the merge: #101's UI sends recorded ids or falls back to practice labels, and this branch now admits both; #101's literal `reviewerRef` is ignored by the server |
| Opus P3-5 | Reuses lane `m4-1-s` | **FIXED** | own lane `m4-1-s-repair`, exact files |
| Opus P3-6 | No landing-routine-versus-workbench concurrency test | **FIXED** | DB test: 6 concurrent rounds of a landing, a workbench landing and a workbench dispute on one case; no `40P01`/`55P03`/deadlock, only typed outcomes, final accounting exact, allocation count matches the landing's outcome. It cannot prove absence of every ordering, but would fail on a deadlock |
| Opus P3-7 | Advisory key lower-casing differs across repositories | **PARTLY FIXED** | the evidence-pack repository here now lower-cases `caseId`. The #101 and #102 repositories are not on this branch; normalise there |
| Sol 1 (P2) | SQL landing ignores written-off principal | **FIXED** | `0043` routine bound is now `allocated + eligible <= claim_pence - written_off`. PostgreSQL tests: after landing 100,000 and writing off 150,000 of 250,000, an allocation of 100,001 is refused and 100,000 is allowed (rolled back in a savepoint); after writing off everything, an allocation of 1 is refused and no allocation, derivation or journal row exists |
| Sol 3 (P2) | Dispute blocks a later payment reversal | **FIXED** | `reverse_landing` is allowed from `pursuing` and `negotiating` (still bounded by an amount > 0 and <= what has landed). Result rule unchanged (partially landed, or evidence assembled when nothing remains). Core: 99+ pair table updated and sequence tests (landed/closed-recovered to dispute to reverse, resume pursuit then reverse, bounds); PostgreSQL: landed to dispute to reverse 100,000 to dispute to reverse 150,000 with exact accounting |
| Sol 4 (P2) | Replay not bound to the target job | **FIXED** | the stored event's `job_id` must equal the requested job, else `IDEMPOTENCY_PAYLOAD_CONFLICT` (HTTP 409); stored hashes are unchanged so legitimate replays on the same job still work. Applied to both the workbench command and the eligibility command. PostgreSQL test: open, transition and eligibility replays on the right job succeed, against another job conflict, and nothing is written for that job |
| Sol 5 (P3) | Error focus and 44x44 targets | **FIXED** | a rejected command moves focus to the alert (server error and client-side parse error), asserted in both projects; buttons, the amount input and source links are asserted at least 44x44 (links needed one CSS rule) |

### OPEN FOR BEN (the repair stays on hold while these stand)

1. **Open from Jobs** (unchanged): the Jobs list deliberately excludes capture-created jobs, so C7's "open the job from Jobs" cannot be met for this journey; the second page deep-links as the M4-2-S and M4-3-S specs do. Builder lean: accept.
2. **Fictional practice labels** (narrowed): recorded sources are now admitted, so M4-3-S-R is not blocked. Open question: may the plain workbench keep fictional labels once recorded sources exist (as #101's fallback does)? Builder lean: accept for the synthetic slice.

## Commands actually run on the merged head

All pnpm commands `CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r3b-*.log` (merged head) and `r3-*.log` (pre-merge head, same results).

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 (5 cached) |
| `pnpm lint` | 0 | 7/7 (5 cached); lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 (5 cached) |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 608 (68 files = 34 test files run from `src` and again from their compiled `dist` copies, so 304 unique tests; CI reports 304); ai 72; api 78; web 56 (7 files); db 163 (34 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 34 files, 163 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests |
| full e2e: `CI=1 pnpm --filter @jobguard/web test:e2e --project=mobile-360 --project=desktop -c <shim outside repo>` under `heavy-slot` | 0 | **162 passed**, 0 failed, 0 flaky, both projects, all specs (the same 162 CI ran; production Next build, real PostgreSQL) |

## NOT RUN / deviations

- **Browser build**: locally the shim points Playwright 1.55.1 at the cached `chromium_headless_shell-1234` (the pinned 1193 shell is not installed; no download). GitHub CI uses the pinned Chromium and is the authority for that.
- No Playwright traces kept (all passed). No clean from-scratch install (existing modules reused).
- The stress/concurrency test is a deadlock detector, not an exhaustive interleaving proof.
- Not fixed (not in scope or not possible here): the sibling merge conflicts (P2-4); a record viewer for recorded sources; the M4-2 eligibility actor literal `practice-owner`; the UI still prints the demo membership id after "Reviewed by".
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested (full unit, database, migration and complete browser suite), committed and pushed (fast-forward, no force). **GitHub CI on `55d942c` (code identical to this receipt's head): `checks` pass in 7m50s including Playwright 162 passed on the pinned Chromium (both projects), `dependency-review` pass, `secrets` pass** (run 37159709092). Not independently verified, not accepted, not merged.
