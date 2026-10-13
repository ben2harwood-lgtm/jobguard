Built by Codex; dispatched 13 Oct 2026.

# ENT-10e — blocked builder receipt

Builder receipt only — not independently verified, not accepted.

Actual builder: Codex. The addendum's requested Claude attribution would describe a different builder, so it is not claimed. No independent review or acceptance was performed. No sub-agent was started.

## Base and scope

- Branch: codex/sandbox/ent-10e; final existing HEAD: `e77ef5c8ee9ab26c47e0558308a7791637cfa07a`. No git writes.
- Issued base: 1f54750 plus coordinator retirement commit e77ef5c (35 lines removed from two test files, no added lines). Initial working tree was clean.
- At inspection the local origin/main reference was `ec6ad4d2a411bf058cb1f107419d68da9fdffc05`; it has moved since the issued base. It was not merged or rebased by this builder.
- Migration 0129 SHA-256: 4bbeb8d9e88a8f65dc4c47ac369717b95c62e68b113793f5a0c0ad62a7446c50, matching the issued draft reference on the inspected branch.
- First change: exactly the issued ent-10e lane line, after ent-10d and before ent-2. The issued line's historical stacked-base note is copied verbatim; this receipt records the actual issued base.
- Other changes: this receipt, unchanged-file hash inventory, surviving-assertion inventory, and command journal. Intended message is outside the repository at /private/tmp/jg-msg-ent-10e.txt.
- No feature implementation, migration, schema, transport, contract or test edit has been made. No rule UUID selected. No new GRANT statements. Standard F: no direct application write grant added; no new routine or route introduced.

## STOP 1 — existing expired-approval refusal

File: `packages/db/test/sso-emergency.integration.test.ts:98` (line 130 at 1f54750).

Before (unchanged):

```ts
expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false);
```

The previous line inserts an approval that expired one minute ago and was approved 31 minutes ago. The existing routine at 0129 lines 220–225 selects only a recent, unexpired, unused approval; this expectation proves refusal without one. ENT-10e step h instead creates and immediately consumes a NEW approval after the owner's command passes the role, rule, setting and command checks. For a valid v2 request, allowed setting and new command id in the same company state, an unrelated expired approval cannot make that call fail.

Behavior required after implementation (NOT applied):

```ts
expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(true);
```

Changing the request to an invalid setting, retired v1 input or a replayed command would keep a false result while changing the assertion's meaning. That is not the permitted meaning-preserving RE-POINTED edit. Keeping a requirement for a pre-existing approval would contradict the issued one-step owner approval and step h. This assertion is not among the five retired checks. BLOCKING: coordinator amendment required; unchanged.

## STOP 2 — all approval rows frozen across the race

File: `packages/db/test/sso-emergency-concurrency.integration.test.ts:150` (line 151 at 1f54750); population at lines 71–81, including approval table at line 74.

Before (unchanged):

```ts
expect(await snapshot()).toEqual(before);
```

`snapshot()` includes EVERY row of identity.sso_emergency_approval. The old fixture commits the approval BEFORE taking the snapshot, then consumes it without changing that table. ENT-10e E6 and step h require the winning call to insert a new approval AFTER the before-snapshot. Thus equality of all approval rows cannot hold.

Required after behavior (NOT applied): keep every captured approval unchanged and assert exactly one new approval belonging to the successful use, while retaining complete equality for the other tables. This would permit an insertion the original assertion forbids. There is intentionally no replacement line or snapshot-population edit: those are forbidden pending a coordinator amendment. BLOCKING: unchanged.

## Check launcher refusal — no bypass

Command: `/Users/benharwood/Library/pnpm/bin/pnpm --version`.

Exact observed refusal:

```text
[ERROR] Refusing to run pnpm@10.28.1: its npm registry signature could not be verified (@pnpm/exe@10.28.1: fetch failed; @pnpm/macos-arm64@10.28.1: fetch failed; pnpm@10.28.1: fetch failed). The bytes selected by this project's lockfile/registry do not match a published, signed pnpm release.
This can indicate a tampered lockfile or a malicious/unreachable registry. Set `pmOnFail` to `ignore` to skip the version switch if this is unexpected.
```

The enclosing inspection command exited 0 because its last command was df. The pnpm subcommand's exit code was not separately captured; it did not print a version. No switch override, alternate launcher, package download command or manual execution of the refused checks was attempted. Node reported v24.17.0. Observed memory free 69%; data volume available 90 GB.

## Retired checks and replacements — not implemented

| Coordinator-retired check | Ordered replacement | Status |
|---|---|---|
| S10a, original lines 90–103 | E9 + E1 + E2; rule count E7 | NOT BUILT; STOP above |
| S10b, original lines 104–115 | E1 + E2 + E3 + E4 | NOT BUILT; STOP above |
| S10c, original lines 116–121 | E7 | NOT BUILT; STOP above |
| S10d, original lines 143–144 | E7 plus zero approval/use rows after rollback | NOT BUILT; STOP above |
| concurrency, original line 115 | E6 + E7 | NOT BUILT; STOP above |

Coordinator removals were source-inspected. No replacement exists yet and none is claimed to pass. Both independent reviewers must still confirm all five rows one for one. Every other surviving assertion line is listed in RETAINED_ASSERTIONS.md as KEPT, source unchanged and NOT RUN; none is marked retired by the builder. The two permitted unit cases remain entirely unchanged.

## Acceptance and configuration

E1–E9, T1–T8, L1–L7, K1 and U1: NOT BUILT, blocked by the order's preservation conflict; no test-executed claim. R1: surviving assertions inventoried, replacements not built, reviewers not run; incomplete. No first-failing unit run was taken because no implementation/test alteration was authorized past the STOP and the check launcher also refused.

Default 60 minutes; allowed 15 to 240; chosen by the order drafter and confirmed by the integrator's answer to Q3. These are the confirmed design, not implemented configuration.

No object from 0111 or 0120 altered or restated. 0129 changed only as the order names: in this stopped run no 0129 object or file was changed. sso_required_command and sso_required_append unchanged. No caller-supplied time, request setting, retained context, grant, clock process or external action added. No migration 0143 registered or authored. No upgrade proof was executed. Approval/use/window cannot be compared before the proposed migration as specified in U1; no snapshots were taken for that proof. E8's planned identity/history comparisons have not been implemented; existing S11 source comparison remains unchanged.

## NOT RUN

- Force typecheck, root lint, force lint, lint:lanes with the issued base, force build, API prerequisite build and openapi:check: NOT RUN, task stopped before code and pinned pnpm launcher refused. No cached result is reported as a run or green.
- New unit files sso-emergency-owner.test.ts and sso-required-unlinked.test.ts: NOT BUILT / NOT RUN, STOP conflict.
- Existing piece unit files sso-emergency.test.ts and sso-required-disclosure.test.ts: NOT RUN, same STOP and launcher refusal.
- Database files sso-emergency.integration.test.ts, sso-emergency-concurrency.integration.test.ts, sso-required.integration.test.ts, enterprise-identity.integration.test.ts and identity.integration.test.ts: NOT RUN (sandbox cannot start PostgreSQL / a browser); no heavy-slot or PostgreSQL start attempted.
- Proposed database files sso-emergency-window.integration.test.ts, sso-required-unlinked.integration.test.ts and sso-emergency-owner-upgrade.integration.test.ts: NOT BUILT / NOT RUN (STOP; sandbox cannot start PostgreSQL / a browser).
- Unedited unit regressions sso-required.test.ts, sso-required-paths.test.ts and context-boundary.test.ts: NOT RUN, dispatcher/helper runs still required.
- ENT-10d.spec.ts: NOT RUN (sandbox cannot start PostgreSQL / a browser).
- Repository/package test suites: NOT RUN, prohibited by the issued memory/test scope. No AI change or evaluation.

## Held and later

Second-person sign-off stays HELD; support approval is excluded by Ben. Clock process and restoration audit row are excluded by Q4. All screens remain parked, including the now-stale emergency-availability line: FIX-LATER for the integrator, no UI edits. Per-company windows, two-step approval, re-linking a re-invited member, domain capture, grants while OFF, OIDC, SCIM/native additions, D04/G5 evidence, real providers/people/data remain out of scope or held as issued. The proposed limits (a gate begun before close may finish afterwards; no row at closure; no emergency session; new command/code/use after close; joined/re-invited people await linking) remain design limits, not implemented claims.

## Self-review

Source-inspected the issued base, exact coordinator diff, surviving S10d and race expectations, merged membership/admin/permission mechanisms, current emergency routine, application and repository, scanner header and applicable plan sections. Verified that expired-approval refusal and approval-table equality are not among the five retired checks and would need behavior changes under step h. Chose no workaround and left every existing test, security list, pinned value, migration, gate and runtime source byte-identical. Hash inventory records unchanged protected files; git diff evidence records the lane/receipt-only scope. No new code means no before/after routine replacement, grant list or acceptance evidence exists yet. No commit, push, merge, pull request, data mutation or independent verdict.

## Final scope evidence

89 hashes in UNCHANGED_SHA256.txt; 39 surviving assertion-line entries in RETAINED_ASSERTIONS.md. These are receipt evidence, not permanent tests. Every tracked source/test/migration change since the issued coordinator head was checked by git diff --name-only: exactly the lane registry. Receipt files are untracked pending dispatcher staging.

Diff against e77ef5c (builder tracked edits only):

```text
 config/agent-lane-assignments.json | 1 +
 1 file changed, 1 insertion(+)
```

Diff against 1f54750 (includes ONLY the coordinator's 35 removed test lines plus builder lane entry):

```text
 config/agent-lane-assignments.json                 |  1 +
 .../sso-emergency-concurrency.integration.test.ts  |  1 -
 packages/db/test/sso-emergency.integration.test.ts | 34 ----------------------
 3 files changed, 1 insertion(+), 35 deletions(-)
```

Status:

```text
 M config/agent-lane-assignments.json
?? docs/verdicts/ENT-10e/
```

`git diff --check`: exit 0. This is a whitespace check only; no implementation check or independent review is claimed. Commands and counts are in COMMANDS.md. The final HEAD is unchanged at e77ef5c8ee9ab26c47e0558308a7791637cfa07a.
