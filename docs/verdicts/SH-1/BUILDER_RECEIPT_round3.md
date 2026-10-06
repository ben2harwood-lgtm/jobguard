# SH-1 repair round 3 — builder receipt

**Task:** SH-1 Shared money and origin primitives (PR #99, branch `codex/sandbox/sh-1`)
**Repair builder:** Claude Sonnet 5.5 (not the original builder, not the checker, not the acceptor)
**Checked head repaired:** `60757108ad2a96c3170bdef39385770f41c6ceef`, Sol 6.1 high verdict REPAIR (three P2 findings)
**Status: not independently verified, not accepted.** A fresh Sol check and a fresh Claude Opus re-review check the new head. This builder reviews, accepts and merges nothing.

## Scope reading (settled by the integrator, recorded verbatim)

- IN SCOPE, fix now (all three, plus any further findings in the verdict): P2-1 (valid rational totals rejected before reduction), P2-2 (outstanding balances can exceed the original invoice line), P2-3 (invalid timezone offsets accepted). All are in the card's pure receipt-to-line allocation rules and the cumulative-fee kernel.
- Nothing is out of scope. Ben approved widening the sh-1 lane (cards `jobguard-sh-1-lane-allow-list` and `jobguard-sh-1-evidence-pack-fixture`, both decided); use only the paths those cards and the existing lane allow.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order. Keep this task's allocated migration number (0053).

The verdict lists no other finding, so there is nothing further to fix from it. One defect of my own was found and fixed inside this round (see "Found while repairing"). No finding became a follow-up; no order file was written.

## Merge with main (step 0)

`git fetch origin && git merge origin/main` brought in one commit, `ebfeaae` (TEST-STAB-2, PR #105: wait for review saves before reloading in the UIWIRE-1 spec, plus its three verdict files). Merge commit `e37e37b`.

- **`config/agent-lane-assignments.json`** conflicted (one-line JSON, both sides added a lane). Resolved with `lane-union.py` mid-merge: 80 lanes, every lane of main unchanged, `sh-1` kept exactly as on this branch (checked by comparing the merged file with both parents lane by lane), then `git add`.
- **No other conflict.** Main added no migration, so the migration-count assertions are unchanged: main's 43 plus 0053 = 44 (`UIWIRE-12`, `demo-bootstrap`, `tenancy` rows and the "0000..0042 and 0053" text). 0053 is not renumbered.
- No real code conflict, so no behaviour was reconciled by hand.

## Findings: failing-first test, then fix

Regression tests were committed first (`ff4da52`) and run against the merged head before any source change. 17 of 90 tests in the two touched files failed for these reasons (log: scratchpad `red-run.txt`; summary below); then the fix followed (`16586f4`).

| # | Finding | Failing-first tests and the reason they failed | Fix (file:line) | Commit |
|---|---|---|---|---|
| P2-1 | Valid rational totals rejected before reduction | `receipt-allocation.test.ts`, "balances whose exact total reduces to a short value" (pro-rata 1p across 1/d1, (d1-1)/d1, 1/d2, (d2-1)/d2 = 2p; settle the whole 2p and reject 3p; reversal; explicit allocation with those balances as line limits; explicit shares that are the complementary fractions; the cancelling-pairs size test) all threw `INVALID_ALLOCATION` at the allocation total. `cumulative-fee.test.ts`: `sumExactPence(complements, 100)` threw `INVALID_SHARED_MONEY` at `common >= limit` (the 121-digit common denominator was compared with the 100-digit result limit before reduction). Size-constant tests failed because `MAX_ALLOCATION_WORKING_DIGITS` did not exist. | `cumulative-fee.ts:117-152`: `sumExactPence(values, maxDigits, maxWorkingDigits)` applies the result limit to the reduced numerator and denominator and a separate working limit to the common denominator (default: the kernel limit). `cumulative-fee.ts:21` new `MAX_ALLOCATION_WORKING_DIGITS` = 10,000 x 13 = 130,000. `receipt-allocation.ts:83-85` the allocator sums balances and explicit shares with result 100 digits, working 130,000. `cumulative-fee.ts:22-39` kernel limit re-derived (below). `cumulative-fee.ts:107-116` powers of ten are remembered (a 260,000-digit power costs 40 ms per call otherwise). | `16586f4` |
| P2-1 (derivation) | "Recheck the kernel-size derivation against the supported balance denominators" | `cumulative-fee.test.ts` "derives the supported rational size from the allocation limits" and the new "derives the working and kernel sizes" test. | The old derivation used the total's denominator where the balances' own common denominator is needed; they differ exactly when balances cancel. New: net denominators divide (receipt denominator) x (total numerator) x lcm(balance denominators) x lcm(line gross amounts) = 100 + 100 + 130,000 + 130,000 + 13 = **260,213** digits (was 130,313). Explicit allocation is covered by the same working limit on its shares. Contract text updated (`docs/contracts/shared-money-origin-v1.md`). This is the only existing assertion edited: the formula in the old test now includes the missing term (it adds a term, so it does not weaken the check). | `ff4da52`, `16586f4` |
| P2-2 | Outstanding balances can exceed the original line | "a line balance can never exceed the line's original gross": 240p on a 100p net / 120p gross line (pro-rata, explicit, separate-invoice, reversal pro-rata and explicit), 121p with a 1p receipt, exact boundary (gross allowed; gross + 1/(10^97+1) rejected; gross - 1/(10^97+1) allowed; unreduced 240/2 allowed and 242/2 rejected), and a balance on a line the receipt does not reach. All failed with "expected to throw" because the allocator paid out 200p net. | `receipt-allocation.ts:33-34`: line refinement compares `numerator <= grossPence x denominator` exactly (bigint cross-multiplication) for every supplied line, in the versioned schema, so every path (receipt, reversal, explicit, pro-rata, separate invoice) throws `INVALID_ALLOCATION`. Negative balances stay rejected by the allocator. | `16586f4`, hardened in `8097adb` |
| P2-3 | Invalid timezone offsets accepted | "UTC offsets are validated at the schema boundary": `+99:99`, `-99:99`, `+24:00`, `-24:00`, `+23:60`, `-23:60`, `+00:60`, `+2400`, `+9999`, `+1260`, `-0060`, `+30:00`, `+12:99` on a line (pro-rata and explicit) and on the receipt time. They failed with "expected true to be false": the schema accepted them and `+99:99` moved a post-receipt line before the receipt. A second test (offsets from -23:59 to +23:59, colon and compact, with sub-second fractions) already passed and is kept as the guard that valid offsets and exact fractional comparison still work. | `receipt-allocation.ts:14-15`: the offset grammar `Z` or `[+-](0[0-9]\|1[0-9]\|2[0-3]):?[0-5][0-9]` is one expression, `INSTANT`, that both validates (`effectiveAt` and `existedAt` are `instant`, the zod datetime check plus this refinement) and reads the offset (`parseInstant`), so the schema and the reader cannot disagree. Exact fractional-second comparison is untouched. | `16586f4` |

### Found while repairing (my own regression, fixed in the same round)

The first version of the P2-2 refinement ran `BigInt(...)` on a field that had already failed its own check (zod runs a refinement on a "dirty" field), so a balance such as `"abc"`, `"1.5"`, `"1e5"` or a non-integer gross raised a raw `SyntaxError`/`RangeError` out of `safeParse` instead of a typed `INVALID_ALLOCATION`. Test first (`a6fd336`, fails on `16586f4` with `SyntaxError: Cannot convert abc to a BigInt`), then fix (`8097adb`, `receipt-allocation.ts:16-20,33`: compare only well-formed integers). Covered: 16 malformed balance shapes and 8 malformed gross values, each as a non-throwing `safeParse` failure and a typed `INVALID_ALLOCATION`.

One more correction to my own new tests, made in `16586f4` before they passed: the first expected-value formula in the "cancelling balances enter the fee kernel" test was arithmetically wrong (it mixed /4 and /12); it now sums one unreduced fraction over the product of every denominator, independent of the module, compared by cross-multiplication (a full-length gcd of 30,000-digit numbers would be needlessly slow). No pre-existing test was weakened, skipped, retried or given a longer timeout, and no new test sets a timeout.

### Size and time (measured on this Mac under heavy load, load average 15 to 50)

The derivation was checked numerically at the working limit, not only argued: 1,290 cancelling pairs of distinct 100-digit denominators and distinct 12-digit line grosses (balances' common denominator about 129,000 digits, inside the 130,000 limit) are accepted; allocation took 2.0 s, `sumExactPence` of the nets 3.3 s, and the exact net has a 146,478-digit denominator, inside the 260,213 kernel limit. 300 pairs: allocation 0.13 s, sum 0.17 s. Not asserted in a unit test (seconds). More distinct 100-digit denominators than the working limit allows (1,600 lines) fail closed with `INVALID_ALLOCATION` (asserted; well under a second).

### Behaviour changes a consumer will see

- Balances that cancel to a short total are now accepted (they were rejected). Totals longer than 100 digits still fail closed; a balance common denominator longer than 130,000 digits now also fails closed with `INVALID_ALLOCATION`.
- `cumulative-fee.v1` principal strings may now be up to 260,213 digits (was 130,313). No consumer exists yet in this checkout.
- A line whose balance exceeds its gross, and a timestamp offset outside -23:59..+23:59 (or minutes above 59), now fail the schema.
- `sumExactPence` gained an optional third parameter; two-argument calls keep working and now accept totals that cancel.

## Commands (Node 24.17.0, pnpm 10.28.1; database and browser commands ran inside `heavy-slot sh-1`)

Run on head `8097adb` (the receipt commit adds only this file).

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks; core purity, lane boundary, money-arithmetic checks pass |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `sh-1` passed (20 files, merge-base comparison) |
| `pnpm build` | 0 | 7 of 7 tasks |
| `pnpm openapi:check` | 0 | up to date |
| `pnpm test` (slot) | 0 | tools 42; config 2; storage 4; ai 72; web 63 (8 files); api 108 (15 files); core 618 (74 files); db 194 (39 files) |
| `pnpm test:db` (slot) | 0 | 39 files, 194 tests |
| `pnpm test:migrations` (slot) | 0 | 2 files, 11 tests |
| `CI=1 playwright test --project=mobile-360 --project=desktop UIWIRE-1.spec.ts` (slot) | 0 | 12 passed |
| Sol's six independent cases (`/tmp/sh1-independent.test.mjs`, repointed to this worktree's build in a scratch copy; the original is untouched) | 0 | 6 of 6 pass (four failed on the checked head) |
| Core files touched, before the fix | 1 | 17 failed, 73 passed, for the reasons above |

## Not run, and why

- **Browser suite in full, locally.** SH-1 adds no web workflow and has no spec, and this round changes only `packages/core` arithmetic, its tests and one contract document; no web or API code calls these functions yet. `UIWIRE-1.spec.ts` (the spec main changed in the merged commit) was run in both projects. GitHub CI runs everything.
- **Pinned Playwright browser.** Pinned `chromium_headless_shell-1187` is not installed. An UNCOMMITTED local config (`playwright.local.config.ts`, spreading the repository config and only setting `launchOptions.executablePath` to the installed `chromium_headless_shell-1234`) was used for the one browser run and then moved out of the tree; nothing about it is committed. GitHub CI with the pinned browser is the proof of record.
- `pnpm eval` and live-provider checks: out of scope for this leaf. The database suites passed on the first attempt; no environment repair was needed this round.
- Downstream consumer integration (SV-1, ENT-4a, M4-8-S): those tasks are absent from this checkout, so the architecture guard stays conditional, as the verdict noted.

## Open

GitHub CI on the pushed head is read from `gh pr checks 99`; its run id and result are in the integrator reply, not in this file (a receipt cannot cite the CI run of its own commit). Fresh independent verdicts and separate acceptance remain pending. **Not independently verified, not accepted.**
