# Technical acceptance M4-2-S-R — PR #102 — verified head 71e7367 — ACCEPTED

**Decision:** ACCEPTED for merge under Ben's written delegation, subject only to GitHub CI being fully green on the exact final head that adds this file. This record does not deploy or release anything.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), the fresh-context JobGuard integrator and technical-acceptance agent launched on 4 October 2026 by the Claude session "Full-steam parallel build plan". It did not build, repair, merge-resolve or check any part of M4-2-S or M4-2-S-R. It is not the cloud Opus review session or any Sol check run. Earlier the same day it accepted and merged #101 (M4-3-S-R), whose code this branch now contains through `main`.

**Repository / PR:** `ben2harwood-lgtm/jobguard` PR #102, `codex/sandbox/m4-2-s-repair` → `main`. No migration (0044 stays unused, as BUILD_PLAN rev 3.0 §12.2 allows: "0044 if needed"). Merging now, after 0042 and before 0043, respects migration order.

## 1. Authority applied
- `BUILD_PLAN.md` §2.1 on `main`, "Written delegation (Ben, 30 September 2026 … 'Also merge on PASS')": CI fully green on the exact head, a recorded PASS bound to that head in `docs/verdicts/`, a separate acceptance by an actor that is neither builder nor checker, migration order (§12.2), and no founder-reserved area touched.
- Coordinator's rule for this queue: an independent Claude Opus PASS and a GPT-6.1 Sol high PASS on the code merged. For this PR the coordinator specified the three verdicts to record: Opus on `36362d1`, Sol on `db6d5f0`, and the Sol merge check on `71e7367`, with the main-merge resolution inspected by this actor.
- Repair verdicts live in the original task's folder `docs/verdicts/M4-2-S/`, as every earlier M4-2-S-R record does.

## 2. Verdict chain and binding — PASS
| Head | What changed to reach it | Verdict (copied verbatim here) |
|---|---|---|
| `36362d16d7c7` | repair 3 (server-side stale-revision refusal, UI revisions from the saved review, canonical case IDs) | Opus **PASS**: `36362d1-opus.md` (PR comment 5974556730). The Sol run on the same head was REPAIR (C1: second browser *context*, not a second tab). |
| `db6d5f0f9904` | repair 4: `26282d9` changes only `apps/web/e2e/M4-2-S.spec.ts`; `db6d5f0` adds only `BUILDER_RECEIPT_repair4.md` | Sol **PASS**: `db6d5f0-sol.md` (`m4-2-s-r-solcheck-20261004T025538`) |
| `71e736703ac9` | `e2ca790` merges `origin/main` `29826ee` (#101); `71e7367` adds only a merge section to `BUILDER_RECEIPT_repair4.md` | Sol **PASS** (merge check): `71e7367-sol-merge.md` (`m4-2-s-r-solcheck-20261004T080916`) |

- **Opus carries from `36362d1` to the final code.** `git diff --stat 36362d1 db6d5f0` lists exactly two files, `apps/web/e2e/M4-2-S.spec.ts` (+34/−6) and the receipt. I read the spec diff in full. It adds a `secondContextReads` helper: a separate browser context carrying only `jg_session`, a cookie-free context that must get 401, and server- and page-level assertions of case/source identity and saved revisions. It replaces three same-context second-tab checks whose assertions the helper covers more strictly. No assertion is weakened, skipped, retried or given a longer timeout. Every application and database file Opus reviewed is unchanged between `36362d1` and `db6d5f0`.
- **Both Sol verdicts** were checked against their logs: `model: gpt-6.1-sol`, `reasoning effort: high`, candidate line naming the exact head; `dispatch.log` records exit 0, verdict PASS.
- **`origin/main` has not moved** since the merge: `origin/main` = merge base = `29826ee3f1e0a13841f903b052396ed320fa90d4`.

## 3. Main-merge resolution, inspected by this actor — PASS
The merge `e2ca790` was made on the builder side (merge section of `BUILDER_RECEIPT_repair4.md`; receipt commit co-authored by Claude Sonnet 5.5). It is a real code merge, so I checked it directly:
- `git diff-tree --cc e2ca790` lists only `apps/web/app/ui/recovery-cases.tsx` and `config/agent-lane-assignments.json`. Comparing `e2ca790` with git's own automatic merge tree shows the same two files. Every other file is git's clean automatic merge.
- **`recovery-cases.tsx`:** the file packs whole statements and JSX onto long lines, so git saw one conflict. I split the base (`b039abf`), branch (`db6d5f0`), main (`29826ee`) and resolution (`e2ca790`) versions at every `;` and `>` (a reversible split) and ran `git merge-file` on them. It merged with **zero conflicts**, and the result is **byte-for-byte identical** to the resolution. So the resolution is exactly main's file plus this branch's own change:
  - `useRef` import and alert focus (`errorRef` and its effect, `ref={errorRef}` on the alert);
  - the `recovery-eligibility-command` import;
  - review, approve, supersede and stale commands built by that module from the saved review instead of literal revision 1.
  Main's #101 source picker (recorded customer invoice and supplier version IDs, fixture comment, source-label warning paragraph) is unchanged.
- **Branch diff preserved:** for every other file in `origin/main...71e7367`, the added/removed lines equal the branch's pre-merge diff `b039abf...db6d5f0`. The only exceptions are `recovery-cases.tsx` (explained above), the lane file and receipt 4's new merge section.
- **Lane file:** parsed, `e2ca790` differs from `main` only in lane `m4-2-s-repair`, which is identical to its `db6d5f0` entry (16 paths including `docs/verdicts/M4-2-S/**`). This matches a `lane-union.py` union. `71e7367` leaves it unchanged.
- **Interaction:** after #101, the £320 button records the latest generated customer-invoice ID when one exists and otherwise keeps the label "Generated customer invoice INV-18800". The M4-2-S spec still asserts that label on the practice job, and it passed on the merged tree (CI below; builder's local run 10/10 for M4-2-S and M4-3-S in both projects). The Sol merge check independently confirmed both PRs' behaviour is preserved.
- **Migration counts:** no change needed. This branch adds no migration, and main's `UIWIRE-12` and demo-bootstrap assertions (43; `0000..0042`) arrived unchanged.

## 4. Only commit after the verified head
The commit that adds this file. Its parent is `71e7367`, and it only adds four documents under `docs/verdicts/M4-2-S/`: `36362d1-opus.md`, `db6d5f0-sol.md`, `71e7367-sol-merge.md` and this file. The lane already allows `docs/verdicts/M4-2-S/**`, so this actor made **no** lane, count or code edit on this PR.

## 5. Roles — PASS (no actor accepted its own work)
| Step | Actor | Record |
|---|---|---|
| Original M4-2-S (PR #85) | Codex | `be81bd5.md` (HOLD, Claude reviewer) |
| Repair 1 | Codex | `BUILDER_RECEIPT_repair.md` |
| Repairs 2, 3, 4 and the main-merge resolution | Claude Sonnet 5.5 | `BUILDER_RECEIPT_repair2.md` … `repair4.md` |
| Opus check on `36362d1` | cloud Claude Opus 5.5 review session | `36362d1-opus.md` (PASS) |
| Sol checks on `db6d5f0` and `71e7367` | GPT-6.1 Sol high, local Codex CLI | `db6d5f0-sol.md`, `71e7367-sol-merge.md` (PASS) |
| Technical acceptance and merge | this fresh-context Opus 5.5 agent | this file |

## 6. Scope and founder-reserved areas — PASS
`origin/main...71e7367` touches 19 files, all in lane `m4-2-s-repair`: core eligibility, the recovery-case repository and DB tests, API application/controller, the eligibility route, the page, the pure command module, the M4-2-S e2e spec, the lane entry and receipts. There are no `.github/` changes, no migration, and no grant, RLS, role, posting, fee or landing change. Nothing touches live providers, production mode, real data, spending, decision approvals, deployment, release, or any CI check.

## 7. Evidence
- **CI on `71e7367` (observed run-level; logs retrieved by Sol):** run 37184509985: `checks`, `secrets`, `dependency-review` SUCCESS. It tested merge `cfed4b3`, which GitHub shows has zero changed files against this head. 180 DB tests passed (recovery cases 12/12, tenancy, bootstrap, evidence-pack upgrade) and 166 browser tests passed.
- **Earlier CI:** run 37168944523 on `db6d5f0` and run 37159072093 on `36362d1` were both green.
- **Sol (merge check)** ran typecheck, lint and lane check with PR metadata, core (216), web (63), recovery API (8), DB unit (7) and OpenAPI, plus nine independent tests including merge preservation.
- **This actor** did the token-level three-way merge check and the per-file diff-preservation check, read the e2e spec delta in full, and confirmed commit graph, lane parsing and migration state by direct git inspection. It did not re-run test suites; it relies on the verdicts and CI.
- **Merge condition still to be met:** GitHub CI fully green on the final head that adds this file. That result is recorded in the merge commit body.

## 8. Founder decision recorded
Ben, 4 October 2026 about 05:15, Command Center card `jobguard-open-from-jobs-substitute-2026-10-03` (status `decided`), answer "Accept the substitute". For repairs #101, #102 and #103:
- C7's "open the job from Jobs" is satisfied by reopening the saved job fresh plus a second browser context;
- **PR #85's branch binding as recorded in this repair's receipt is accepted** (PR #85's body is not edited);
- fictional sample-source labels are accepted for now;
- the evidence-pack zero-omissions approval rule is confirmed.

This closes the Opus verdict's open item 2 and the Sol verdicts' "OPEN FOR BEN" items.

## 9. Open items (recorded, not blocking)
- Opus open item 1 (textual conflicts with #101/#103): #101's are resolved above. #103 must merge this `main` and reconcile its `case-fee` assertion when it lands (Sol, `db6d5f0-sol.md`).
- The synthetic reviewer principal stays a labelled synthetic bridge, not real-user authentication (Opus P3-5; Sol).
