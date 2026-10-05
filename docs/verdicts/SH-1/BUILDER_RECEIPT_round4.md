# SH-1 repair round 4 — builder receipt

**Task:** SH-1 Shared money and origin primitives (PR #99, branch `codex/sandbox/sh-1`)
**Repair builder:** Claude Sonnet 5.5 (not the original builder, not the checker, not the acceptor)
**Checked head repaired:** `ae749e7e2438305be549c3f5aa72dd8c80b7fb80`, Sol 6.1 high verdict REPAIR (one P2 finding)
**Status: not independently verified, not accepted.** A fresh Sol check and a fresh Claude Opus re-review check the new head. This builder reviews, accepts and merges nothing.

## Scope reading (settled by the integrator, recorded verbatim)

- IN SCOPE, fix now: every finding in the round-4 verdict (one P2 at ae749e7). Sol's count went 2 -> 3 -> 1, so this should close it; record the reading in your receipt.
- Nothing is out of scope. Ben approved widening the sh-1 lane (cards `jobguard-sh-1-lane-allow-list` and `jobguard-sh-1-evidence-pack-fixture`, both decided); use only the paths those cards and the existing lane allow.
- Founder decisions (Ben, 4 Oct 2026), not defects: the C7 "open the job from Jobs" step is met by reopening the saved job fresh plus a second browser context, for every JobGuard task; fictional sample-source labels are acceptable for now. Coordinator ruling (4 Oct): migration numbers follow merge order. Keep this task's allocated migration number (0053).

The verdict lists no other finding, so there is nothing further to fix from it. No finding became a follow-up; no order file was written.

## Merge with main (step 0)

`git fetch origin && git merge origin/main` reported "Already up to date" (origin/main is still `ebfeaae`, already merged in round 3 as `e37e37b`). No merge commit, no conflict, no resolution needed. Migration counts are unchanged: main's 43 plus 0053 = 44. 0053 is not renumbered.

## Finding: failing-first test, then fix

| # | Finding | Failing-first tests and the reason they failed | Fix (file:line) | Commits |
|---|---|---|---|---|
| P2 | `extra-origin.v1` `serverRecordedAt` and `deviceCapturedAt` use `datetime({ offset: true })`, which accepts `+99:99`, `-24:00`, `+0060` (all `Date.parse` = NaN) | `extra-origin.test.ts`: "rejects impossible timezone offsets on both origin timestamps" (16 impossible offsets x both fields, each also required to fail on exactly that field's path) failed with `serverRecordedAt +99:99: expected true to be false`. "accepts exactly the offsets from -23:59 to +23:59 and never an instant JavaScript cannot read" (every sign x hour 00-99 x minute 00-99 on both fields: accepted iff hour <= 23 and minute <= 59, and every accepted value must have a finite `Date.parse`) failed with `serverRecordedAt +00:60: expected true to be false`. Two guard tests already passed before the fix and still pass: valid offsets (`Z`, `+01:00`, `+0100`, `+05:45`, `-23:59`, `-2359`, minutes-less `12:00Z`, 1 to 12 fractional digits, a leap day) are accepted and returned unchanged, a null `deviceCapturedAt` and null `deviceId` are accepted, a null or missing `serverRecordedAt` is rejected; and unrelated malformed timestamps (`yesterday`, a date alone, no offset, `+01`, lowercase `z`, `2026-02-30`, hour 24, minute 60, empty) stay rejected. | `receipt-allocation.ts:14-17`: the existing offset-range schema (`INSTANT`, which also reads the offset) is now exported as `instantV1`, so the receipt-allocation fields and the origin fields share one grammar and the schema cannot accept an offset the reader rejects. `extra-origin.ts:2,15-16`: both fields use `instantV1` (the device field is `instantV1.nullable()`). `docs/contracts/shared-money-origin-v1.md` line 50 states the rule for the origin fields. | `050fdc4` (tests), `2cee13f` (fix) |

Behaviour change a consumer will see: `extra-origin.v1` timestamps with an offset outside -23:59..+23:59 (or minutes above 59) now fail the schema. Valid values are returned byte for byte as before. `instantV1` is a new export of `@jobguard/core`. No consumer of `extraOriginV1` exists outside its own test, the contract and the database integration test, which uses only valid values.

## Commands (Node 24.17.0, pnpm 10.28.1; database commands ran inside `heavy-slot sh-1`)

Run on head `2cee13f` (the receipt commit adds only this file).

| Command | Exit | Result |
|---|---:|---|
| `pnpm install --frozen-lockfile` | 0 | up to date |
| `pnpm typecheck` | 0 | 7 of 7 tasks |
| `LANE_BASE_REF=origin/main pnpm lint` | 0 | 7 of 7 tasks; core purity, lane boundary, money-arithmetic checks pass |
| `LANE_BASE_REF=origin/main pnpm lint:lanes` | 0 | lane `sh-1` passed (21 files, merge-base comparison) |
| `pnpm build` | 0 | 7 of 7 tasks |
| `pnpm openapi:check` | 0 | up to date |
| `pnpm test` (slot) | 0 | tools 42; config 2; storage 4; ai 72; web 63 (8 files); api 108 (15 files); core 626 (74 files: 313 source tests run again from the build output, 37 files each); db 194 (39 files) |
| `pnpm test:db` (slot) | 0 | 39 files, 194 tests (includes the 11 SH-1 integration tests) |
| `pnpm test:migrations` (slot) | 0 | 2 files, 11 tests |
| `vitest run src/extra-origin.test.ts`, before the fix | 1 | 2 failed, 4 passed, for the reasons above |
| `vitest run src/extra-origin.test.ts src/receipt-allocation.test.ts`, after the fix | 0 | 40 passed |

Core went from 618 to 626 because four tests were added to `extra-origin.test.ts` and the suite runs each source test twice (source and build output).

## Not run, and why

- **Browser suite and SH-1 spec, locally.** The card's `test` path `apps/web/e2e/SH-1.spec.ts` does not exist: SH-1 adds no web workflow, and this round changes only `packages/core` (a schema, its tests) and one contract document; no web or API code calls these schemas. No spec was changed, so no spec was run locally and no local Playwright config was needed. GitHub CI runs the full browser suite with the pinned browser and is the proof of record.
- `pnpm eval` and live-provider checks: out of scope for this leaf.
- Downstream consumer integration (SV-1, ENT-4a, M4-8-S): absent from this checkout; the architecture guard stays conditional, as the verdict noted.
- The database suites started without an environment repair; no embedded-Postgres or dylib fix was needed.

## Open

GitHub CI on the pushed head is read from `gh pr checks 99`; its run id and result are in the integrator reply, not in this file (a receipt cannot cite the CI run of its own commit). Fresh independent verdicts and separate acceptance remain pending. **Not independently verified, not accepted.**
