# M4-1-S-R — builder receipt, repair 6

Date: 2026-10-04. Builder: **Claude Sonnet 5.5** (repair 6, on top of repairs 1 to 5).
**Not independently verified. Not accepted.** Input: the GPT-6.1 Sol high check of `2674fe4` (`jg-runs/m4-1-s-r-solcheck-20261004T042331.md`): REPAIR, no P1, three P2.

## Binding

- Branch `codex/sandbox/m4-1-s-repair`, PR #103. Previous pushed head `f53d2be` (CI had passed on it, but the PR then became CONFLICTING because #101 reached main). Final head: see the coordinator report (this receipt is the last commit).
- Commits (all end `Co-Authored-By: Claude Sonnet 5.5`): `614c5b1` tests written first; `d681012` the fix; `f216043` a one-line repair of a comment I broke in the e2e spec (it failed typecheck in the first full run and was fixed before anything was pushed); `9a1a7a5` the merge of `origin/main` 29826ee (#101, migration 0042); this receipt.
- Lane `m4-1-s-repair` unchanged; lane lint passes against the new main.

## Merge with main (#101, M4-3-S-R) and recorded sources

- Resolved: `migrate.ts` registers 0042 then 0043; migration-count assertions are main's count plus one (**44**; the `0000..0042` range check stays 43); `MIGRATIONS.md` keeps 0041, 0042, then 0043; `evidence-pack-repository.ts` is main's version unchanged (it already canonicalises UUID lock keys and reads claims and events directly, so none of this branch's edit is needed); `recovery-cases.tsx` is main's UI (recorded-source picker) with this branch's behaviours re-applied (parsed money, error focus, job fee liability and postings, source links and details), and the client-asserted `reviewerRef: "practice-owner"` that #101 had re-added is removed again (the server derives the reviewer); the lane registry is main's file plus this lane.
- **Recorded source references from #101 are accepted.** Case opening resolves a recorded id with the same predicates #101's pack loader uses (customer invoice for the job; supplier agreement rate used on the job; ready supplier invoice or delivery document by version or document id). Proof in the full browser run below: `M4-3-S.spec.ts` (#101) opens cases through the UI with recorded invoice and rate/invoice ids, then builds and checks evidence packs, in both projects; plus this branch's PostgreSQL tests for accepted and refused recorded ids. Practice labels remain accepted (Ben's decision) and fail closed in #101's pack loader, as #101 designed.

## Founder decision recorded (Sol P2-2 and P2-3)

**Ben decided on Command Center card `jobguard-open-from-jobs-substitute-2026-10-03`, answer "Accept the substitute" (reported by the coordinator on the morning of 4 October 2026).** Recorded exceptions, exactly:

1. **C7 "open the job from Jobs"** is accepted as met by the substitute for capture-created jobs in M4-1-S-R: the job page is reopened fresh (reload), and again in a second browser context that signs in by itself and reads the identical persisted `recovery-cases` response (ids, revisions, amounts, source identities) and the same case and source links. The Jobs list still excludes capture-created jobs by design; no change was made to it.
2. **Fictional sample-source labels** stay admitted next to recorded source ids (recorded ids resolve to stored rows for the same tenant and job).

These are founder dispositions; the builder did not waive anything. Sol P2-2 and P2-3 are therefore **closed by founder decision**. I could not edit `BUILD_PLAN.md` (outside this lane); this receipt and the card are the record, and a checker may want the contract amended to cite the card.

## Tests first

Red before any fix (`m41r-logs/r6-red-db.log`): core, `prevent` with landed principal was allowed; PostgreSQL, an approved landing followed by `prevent` resolved instead of being refused.

## Finding fixed

| # | Finding | Status | Fix and proof |
|---|---|---|---|
| 1 (P2) | Received money can be relabelled "Prevented before payment" | **FIXED** | `transitionRecoveryCase` now rejects `prevent` whenever landed principal (manual or approved) remains. The landing routine can accept an approved landing while the stage is still "identified"; the repository passes the received principal, so `identified -> prevent` is refused. Proof: core tests (landed 100,000 and 1 refused; 0 still prevents). Real PostgreSQL: a 2,500.00 claim with an approved 1,000.00 landing refuses prevention with "is not allowed" and leaves the case view, allocations, derivations, fee journal, audit events and case events exactly as before; after the approved landing is reversed (nothing received) prevention succeeds |
| 2 (P2) | C7 Jobs navigation | **CLOSED by founder decision** | see above |
| 3 (P2) | Fictional-source disposition | **CLOSED by founder decision** | see above |

## Commands actually run on the merged head

`CI=1`, `LANE_BASE_REF=origin/main`; database and browser commands inside `heavy-slot m41r`. Logs `m41r-logs/r7-*.log`.

| Command | Exit | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7/7 |
| `pnpm lint` | 0 | 7/7; lane `m4-1-s-repair` passes |
| `pnpm lint:lanes` | 0 | passed |
| `pnpm build` | 0 | 7/7 |
| `pnpm openapi:check` | 0 | matches |
| `TURBO_FORCE=true heavy-slot m41r pnpm test` | 0 | 0 of 13 cached: `node --test` 39/39; core 660 (330 unique, also run from `dist`); ai 72; api 103 (14 files); web 61 (8 files); db 194 (38 files); storage 4; config 2 |
| `heavy-slot m41r pnpm test:db` | 0 | 38 files, 194 tests |
| `heavy-slot m41r pnpm test:migrations` | 0 | 2 files, 11 tests (fresh install of all 44 migrations) |
| full e2e, both projects, all specs, including #101's M4-3-S (shim outside the repo) | 0 | **164 passed**, 0 failed, 0 flaky |

## Failed runs that were re-run, and why (no test changed)

- First pipeline of this round: `typecheck` (exit 2), `lint` (exit 1) and the e2e run (exit 1 within seconds) failed because of **my own** broken comment line in `M4-1-S.spec.ts`; fixed in `f216043` and the whole pipeline re-run green.
- The same first pipeline's `pnpm test` exited 1 because `decision-inbox.integration.test.ts` reported `Connection terminated unexpectedly` once under machine load (a file I did not touch; the same suite passed in `pnpm test:db` seconds later and in every later run). Pre-existing intermittent database-connection flake, not hidden.

## NOT RUN / deviations

- Locally the browser is the cached `chromium_headless_shell-1234` via a shim outside the repository; GitHub CI uses the pinned Chromium.
- No clean from-scratch install; no traces kept (all passed).
- Not done: a viewer for recorded source records; sibling conflicts with #101 and #102 (integration step). The case state remains the workflow stage set by workbench events.
- Still discovered and unfixed (pre-existing, out of scope): `reverse_synthetic_landing` applies plan credit unconditionally while `approve_synthetic_landing` applies it only after a plan-fee settlement event.
- Environment: Node v24.17.0, pnpm 10.28.1, Playwright 1.55.1, embedded PostgreSQL 16.10, macOS Darwin 25.4.0.

## Status

Prepared, built, locally tested and committed. GitHub CI is recorded in the coordinator report after the push. Not independently verified, not accepted, not merged.
