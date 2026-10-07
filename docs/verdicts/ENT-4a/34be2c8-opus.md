VERDICT: PASS — bound to head 34be2c8e9ee0b32eabc0ffb8e90660fc80c71767
Reviewer: fresh Claude Opus 5.5 review agent spawned by the JobGuard integrator session (7 Oct 2026); did not build, repair or order any commit in this PR.

**Delta re-review of my REPAIR verdict on 4f1e80d** (https://github.com/ben2harwood-lgtm/jobguard/pull/110#issuecomment-6037489389). The head did not move while I reviewed.

**In short:** round 3 fixes P2-R1, the only repair item, and breaks nothing I can find. Withdrawn, rejected, billing-rejected, logged, awaiting-approval, approved and only-exported extras now give zero through both statement derivations, which matches `feeBearing`. The round-2 full-credit and full-reversal replay fixes still hold.

**Merge gate (not a code finding).** CI has not run on this head: GitHub reports the PR as `CONFLICTING` with `main`, so no `pull_request` run exists for 34be2c8. My local checks stand in for it below. Before merge:
- resolve the lane-registry conflict;
- confirm the resolved commit differs from 34be2c8 only by keeping both appended lanes (`ent-4a` and main's `sec-deps-2026-10-07`) plus main's own changes;
- get `checks` green on that commit;
- explicitly rebind this verdict to it.

## The round-3 change
4f1e80d → 34be2c8 touches exactly three files: `origin.ts`, `fee.test.ts` and `docs/verdicts/ENT-4a/BUILDER_RECEIPT_round3.md`, all inside the `ent-4a` lane. The lane registry is unchanged since 4f1e80d.

- **Code.** `origin.ts:67–68` now always requires `billed | part_paid | paid`, and additionally allows `credited` only when a recorded cutoff is supplied. This is exactly what I asked for.
  - The no-cutoff path behaves as before.
  - The cutoff path again excludes every state a billed extra cannot reach.
  - The only change from 4f1e80d is that gate plus a reworded comment.
- **Tests.** 35 new rows were added (`fee.test.ts:36–68`). No timeout, retry or assertion was changed or removed. The only other edit is the import line. I grepped for timeouts and retries, and the pre-existing test blocks are unchanged in the diff.
  - All seven states are checked through `qualifyingPrincipal`, with and without a cutoff and with and without the reference flag.
  - `feeBearing` is checked false for all seven.
  - Both derivations are checked: each row first shows the ENT-F1 control earning 1500p, then changes only the state and asserts zero principal, zero fee, zero delta and a zero line.
  - A missing cutoff is checked to give a typed `INVALID_STATEMENT`.

## My probes, re-run at 34be2c8
I ran these from my own untracked file, `packages/core/opus-probe/ent4a-r3-probe.test.ts`: 8 probe tests, all green.

- **R1 (P2-R1).** Same input as before: an F1 extra, production mode, gate open, with only the cached state changed.
  - The seven states give `feeBearing` false and 0p through both `deriveEnterpriseStatement` and `deriveEnterpriseReferenceStatement`. At 4f1e80d they gave 1500p.
  - With a prior 1500p posting, each of them gives F 0 and a linked −1500p compensation, never a positive fee.
  - `billed`, `part_paid` and `paid` still give 1500p and `feeBearing` true.
  - `credited` still gives 1500p on a replay where the credit was recorded after the cutoff. That is the intended P1-1 case.
- **R2 (P1-1 still fixed).** October stays byte-identical after each of these November facts, and November carries the linked compensation, with lines summing to the delta:

  | November fact | resulting state | November compensation |
  |---|---|---|
  | full credit | `credited` | −1500p |
  | full reversal built from the allocator | `billed` | −1500p |
  | one-third partial reversal | `part_paid` | −500p |
  | credit recorded exactly at the cutoff (`+00:00`) | unchanged | −500p |

  As a control, a credit recorded 1 ns before the cutoff lands in October. The PR's own round-2 ENT-F12 full-credit and full-reversal tests pass unchanged.
- **R3 to R5 (earlier fixes still hold).**
  - Allocator reversals feed straight into qualification across five refund partitions, and over-reversal is refused.
  - Explicit and separate-invoice steering of a reversal is refused, with fair ratios kept (−600000/31 and −144000/31).
  - An invoice fact is accepted only from `exported` or `billed`, for every role.
  - Statement references carry kind and status, and leave out pending and after-cutoff facts.
  - 400 random consistent derivations were never refused; lines summed to the delta and each sat within 2p of its exact change.

## Follow-ups
These are unchanged and now recorded in the round-3 receipt; I accept them as recorded:
- **P3-R2 → ENT-7:** untimestamped inputs are not frozen at the cutoff. Probe R2b still shows a later duplicate candidate or a later photo rejection zeroing the October replay.
- **P3-R3 → ENT-6:** a partial refund can still be steered through the supplied `remainingGross`. Probe R3 still shows it.
- **P3-R4:** timing margin only; no action needed.
- **P3-4 → ENT-5:** recorded in the round-2 receipt, unchanged.

## What I executed
Everything below ran in the detached worktree `/private/tmp/opus-ent-4a-34be2c8-0710` at 34be2c8, on Node 24.17.0 (the pin is 24.15.0) with pnpm 10.28.1, at load average 21–34.

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile --ignore-scripts` | exit 0 |
| `vitest run src/enterprise-domain` | exit 0, 278/278, including the 35 round-3 rows and both ENT-F12 full-adjustment tests; slowest 1.4 s |
| `vitest run src` (whole core) | 590/591; the only failure was a 5.5 s timeout in SH-1's untouched `extra-origin.test.ts`, which passed 6/6 when rerun on its own |
| `pnpm typecheck` | exit 0, 7/7 |
| `pnpm lint` with a simulated `pull_request` event (head 34be2c8, base a5ed99a, branch `codex/sandbox/ent-4a`, no refs created) and `LANE_BASE_REF=origin/main` | exit 0; lane boundary passed for `ent-4a`; purity, money-arithmetic and package lints passed |
| `pnpm build` | exit 0, 7/7 |
| `node --test tools/shared-money-origin.test.mjs tools/core-purity.test.mjs` | 4/4 |
| `heavy-slot opus-ent4a-r3 pnpm test` | exit 1; see below |

What the `pnpm test` run showed:
- Tools 42/42, config 2, storage 4, web 63, AI 72, API 108.
- Core 1186/1190. The 4 failures were 5-second timeouts in SH-1's untouched `receipt-allocation` and `extra-origin` tests (source and compiled copies). All enterprise tests passed.
- The DB suite did not run locally: every file was skipped with no error output, consistent with embedded PostgreSQL not starting in an `--ignore-scripts` worktree. I did not retry.

`git merge-tree origin/main 34be2c8` shows the only conflict is `config/agent-lane-assignments.json`, where both sides append one lane.

## Relied on CI
Run 37614081624 on 4f1e80d (merged into a5ed99a): `checks` green (core 556, API 108, web 63, eval 72, PostgreSQL 38 files/191, build, e2e 166 at both viewports) and `secrets` green.

I rely on that run for the PostgreSQL and e2e suites. The round-3 delta is one pure-core gate plus tests, and no code in `apps/`, `packages/db` or `packages/ai` imports the enterprise domain (grep).

`dependency-review` was red there only for the advisories that #113 has since fixed on `main`.

## Not verified
- CI on this exact head or on the conflict-resolved commit; that is the merge gate above.
- A run on the pinned Node 24.15.0.
- A local PostgreSQL or e2e run.
- The builder's `/private/tmp` logs.
- Any commercial validity of the D16 terms, which stay `proposed`. Nothing here opens a gate or authorises posting.

