VERDICT: PASS
82692fdae89e8111634d30b94e31efc1df32fc6d

# FIXLATER-3 (PR #140) — independent AMBER check

Reviewer: Claude Opus 5.5, fresh session, 11 Oct 2026. I did not build this and saw no other opinion of it.
Candidate: worktree `.worktrees/fixlater-3`, branch `codex/sandbox/fixlater-3`, head `82692fdae89e8111634d30b94e31efc1df32fc6d`
(confirmed with `git rev-parse`; working tree clean). Base `4564e888b85aba559c542e935e52fe9f78769595` = local `origin/main` = the
head's only parent (one commit in the range). Requirement read: `jg-orders/FIXLATER-3-issued.txt` (ISSUED header over the draft).
Method: read the whole diff `4564e88..82692fd`, the changed files at head, and the merged code F8 compares
(`packages/db/src/audit.ts`, `packages/db/migrations/0115_recovery_follow_up_repair.sql`, the 0112 trigger, `sandbox-repository.ts`,
`pool-test-utils.ts`). Read and `git` only; I ran no test, build, install, server or database.

Counts: 9 of 9 named items MET. BLOCKING findings: 0. LATER findings: 5.

All line numbers below are at head 82692fd, files under `packages/db/test/` unless a fuller path is given.

## 1. F1–F9 against the order's wording

| Item | Verdict | Evidence |
|---|---|---|
| F1 | MET | `prevention-checks.integration.test.ts:185` is `it("upgrades the previous supported schema without altering an existing quoting job"`; its closing line `:199` is now `  }, 60_000);`. Only line changed in the file (numstat 1/1). The file's `beforeAll` budget `:38` (`},60000);`) is untouched. |
| F2(a) | MET | `job-parties.integration.test.ts:287` "fresh installation invents no non-synthetic parties…", closing `:296` `  }, 60_000);`. |
| F2(b) | MET | same file `:297` "applies the full migration chain to a SQL_ASCII database…", closing `:314` `  }, 60_000);`. File numstat 2/2. |
| F2(c) | MET | `job-activation-terms.integration.test.ts:105` "upgrades from the schema just before CH-1's migration…", closing `:121` ` }, 60_000);` (file's own one-space indent kept). Numstat 1/1. |
| F2(d) | MET | `recovery-message-upgrade.integration.test.ts:85` 'keeps the runner idempotent and the previous release path working', closing `:94` `  }, 60_000);`. Numstat 1/1. Existing `beforeAll` budget `:60` (`120_000`) untouched. |
| F2(e) | MET | `extra-origin-upgrade.integration.test.ts:12` "[S8] preserves old columns…", closing `:48` ` }, 120_000);`. Numstat 1/1. Existing `beforeAll` budget `:9` (`60_000`) untouched. |
| F3(a) | MET | `recovery-follow-up-upgrade.integration.test.ts`: the `beforeAll` opening at `:116` closes at `:157` with `}, 120_000);`. |
| F3(b) | MET | same file `:169` "applies 0112 and 0115 as migration owner…", closing `:202` `  }, 60_000);`. |
| F3(c) | MET | same file `:204` "preserves preview/approve/revoke/deliver/reconcile…", closing `:253` `  }, 60_000);`. File numstat 3/3; port line `:118`, column lists and row comparisons untouched. |
| F1–F3 shape check | MET | I ran the order's own `git diff -U0 … \| grep` pipeline over the six files against 4564e88: it prints nothing. Numstat for the six files totals 9 added, 9 removed. |
| F4(a) | MET | `recovery-follow-up.integration.test.ts:894` "R1 DW6: delivered message 1 remains the source…", closing `:920` `  }, 90_000);`. |
| F4(b) | MET | same file `:962` "Round 1 A: an unapproved reminder survives close and reopen…", closing `:986` `  }, 90_000);`. The two sibling 90 s budgets the order cites (`:614`, `:625`) are unchanged. |
| F5 | MET | same file, test at `:995`. (1) `:1032` `const waitDeadline = Date.now() + 20_000;` sits directly before `let blocked = false;` (`:1033`). (2) `:1041` new last branch `else if (Date.now() > waitDeadline) { throw new Error("retry neither waited on the audit key nor finished within 20 s"); }`, after the existing `else if (retryFinished)` branch (`:1040`). (3) closing `:1057` `  }, 60_000);`. (4) comment `:1031` reworded to say it gives up with a named error after 20 seconds and nothing is retried. A before/after `diff` of the whole test shows exactly these four changes and nothing else. |
| F6 | MET | `free-port.test.ts:13-19` new file-local helper `occupyWithFreeNeighbour`: up to 20 tries, each `occupy(0, "127.0.0.1")` (listener stays open, closed by the existing `afterEach` `:6`); returns the first port with `port < 65535` and `port + 1` listenable on `127.0.0.1` and `::1`; otherwise throws "could not find a held port with a free neighbour on both loopbacks in 20 tries" (never skips). Probe is the local `canListen` `:8-12` (open then close). Test set-up `:23` uses it; the `expect` line `:24` is byte-identical. Known-limit sentence is in the receipt (`BUILDER_RECEIPT.md:50`). |
| F7 | MET | `free-port.test.ts:27` is now the single `const taken = await occupy(0, "127.0.0.1");`; the `anyFree` helper is removed (nothing else used it); the `expect(...).rejects.toThrow(...)` line `:28` is byte-identical. |
| F8 | MET | `recovery-follow-up.integration.test.ts:1059-1086`, inside `describe("M4-6-S-R1 atomic due audit and reopened continuation"` (`:830`), after Round 1 B and before the describe's closing `:1087`. Exact name; budget `60_000`. Steps 1–6 all present (detail in point 6). |
| F9 | MET | `fingerprinted-row-shape.integration.test.ts`: the `beforeAll` opening at `:75` closes at `:83` with `}, 120_000);`. See point 3. |

## 2. The rule for every item — every removed or changed line in existing test files

The complete list of removed lines in the code diff (17 lines, from `git diff -U0`):

- 13 closing lines (`});`, ` });` or `  });`), each replaced by the same line with a number added — the thirteen named in F1–F5 and F9.
- `free-port.test.ts`: the `anyFree` helper line (removal named in F7); the set-up line `const taken = await occupy(0, "127.0.0.1");` of test 1 (F6); the set-up line `const taken = await anyFree(); await occupy(taken, "127.0.0.1");` of test 2 (F7).
- `recovery-follow-up.integration.test.ts`: one comment line (F5 point 4).

Result: MET. No `expect(...)` line, expected value or test name was removed or altered. No `.skip`, `.todo`, `.only`, retry
wrapper, `vi.setConfig`, `testTimeout` or `hookTimeout` appears in any added line. No removed line contains a number of
milliseconds, so no pre-existing time limit changed (existing `60000`, `60_000`, `90_000`, `120_000`, `180_000` budgets all stand).
No file-mode change. Every one of the 17 changed lines is named by the order.

## 3. `fingerprinted-row-shape.integration.test.ts` (MIG-ORDER-2's guard)

MET. `git diff --numstat 4564e88 82692fd -- packages/db/test/fingerprinted-row-shape.integration.test.ts` prints `1	1`. The
`-U0` diff is one hunk, `@@ -83 +83 @@`: `-});` → `+}, 120_000);`, the closing of the `beforeAll` that starts at `:75`. Nothing
else in the file differs.

## 4. F5 — is the new wait real, and does the test still prove the same thing?

MET.
- Bounded: every pass of the loop (`:1034-1042`) now ends in one of four ways: `blocked` becomes true; the retry finished without
  waiting (existing throw, `:1040`); 20 s have passed (new throw, `:1041`); or go round again after the unchanged 25 ms pause.
  The 20 s limit is well inside the 60 s test budget, so the named error normally arrives first.
- Same proof as before: the only way out of the loop without throwing is still `wait_event_type === "Lock"` AND
  `blockers.includes(pidA)` (`:1038`), followed by the unchanged check that the waiting statement mentions
  `recovery-follow-up-audit` (`:1039`). The `pg_stat_activity` query, the two lock statements (`:1022-1023`), the `finally`
  block (`:1052-1056`) and all eight `expect` lines are byte-identical.
- Cannot pass when the behaviour is wrong: the added branch only throws. It adds no new way to succeed.

## 5. F6/F7 — more stable, not vacuous

MET. Both `expect` lines are byte-identical (SHA-256 of the file's `expect` lines is the same at base and head:
`cdde88f4…6b1b93`).
- Test 1 still demands `freePort(taken, 2) === taken + 1` twenty times with `taken` held open on `127.0.0.1`. The helper only
  chooses a `taken` whose neighbour is free; a `freePort` that returned the busy port, or anything outside the range, still fails.
  If no suitable port is found the test fails with a set-up error; it is never skipped.
- Test 2 still demands the exact rejection message with the one port in range held open. A `freePort` that returned the busy port
  would resolve and fail the test. Holding the listener (instead of close-then-reopen) removes a race and weakens nothing.
- `pool-test-utils.ts` is untouched.

## 6. F8 — is the parity test a real comparison?

MET, and it is not trivial.
- The two sides are genuinely different code. The stored `event_hash` of the two rows is computed in PL/pgSQL
  (`packages/db/migrations/0115_recovery_follow_up_repair.sql:111-119`), reached through the trigger on `app.sandbox_run_event`
  (`0112_recovery_follow_up.sql:464-469`) when the test calls `sandbox.advance` (`:1062`). The test calls no follow-up
  repository method between that advance and the read, so the TypeScript catch-up path
  (`packages/db/src/recovery-follow-up-repository.ts:435-438`) cannot have written them. The other side is
  `canonicalAuditHash` imported from `packages/db/src/audit.ts:38-41`, applied to each stored row (`:1069`).
- Fields and ordering: `canonicalAuditHash` joins ten fields with character 31 (version, tenant, sequence, actor, event type,
  subject type, subject ref, ISO timestamp, payload hash, previous hash); the SQL joins the same ten in the same order
  (`0115:114-116`). A change to order, separator, timestamp format or any field on either side fails `:1069`.
- Not vacuous: `:1068` first requires exactly the two event types in sequence order, so the `for` loop cannot run over an empty
  list. Rows are selected with the same thirteen columns as `verifyChain` (`:833-835` vs `:1063-1065`), every value bound as a
  parameter (`:1066-1067`).
- Payload: `:1076-1083` require the exact stored payloads from the order (clock hash read from the one matching
  `sandbox_run_event` row, `:1073-1075`; decision id and audit id read from `recovery_follow_up_due`, `:1070-1072`), and
  `:1084` requires the `became_due` entry's id to equal the due row's `audit_event_id`. The two `toHaveLength(1)` checks
  (`:1072`, `:1075`) are additions that make it stricter.
- Payload-hash parity and chain links: `canonicalAuditHash` takes the stored payload hash as given, so it does not itself
  re-derive that hash; the closing `await verifyChain()` (`:1085`) does, with `audit.ts`'s own `verifyAuditChain`
  (`audit.ts:83-84`: payload hash, previous-hash link, sequence, event hash, for every entry of the tenant). This is the
  order's step 6.
- Would it fail against merged code? By reading, no: the SQL truncates the timestamp to milliseconds before storing
  (`0115:111`), writes payload keys in the same sorted order `canonicalJson` produces (`0115:102,106`), and uses
  `coalesce(previous,'')` where TypeScript uses `?? ""`. The helper's log also shows it passing (see "Evidence").
- `audit.ts`, migration 0115 and the `verifyChain` helper are unchanged.

## 7. Lane and scope

MET. `config/agent-lane-assignments.json`: numstat `1 0`; the file goes from 116 to 117 lines; the new line 25 `"fixlater-3"`
sits directly after `"fixlater-2"` (24) and before `"harden-signin"` (26); branches, note text and the allow list (the lane
file, `docs/verdicts/FIXLATER-3/**`, and the nine test files) match the order word for word; no existing line changed.
`git diff --name-status` lists exactly 11 paths: the lane file, the receipt `docs/verdicts/FIXLATER-3/BUILDER_RECEIPT.md`, and
the nine test files. Nothing under any `src/`, `migrations/`, `tools/`, CI workflow, `package.json` or lockfile. No added line
matches the secret-scanner pattern.

## 8. Budgets

MET. The thirteen budgets added to existing tests and hooks are exactly the thirteen the order names (F1 ×1, F2 ×5, F3 ×3,
F4 ×2, F5 ×1, F9 ×1), with the numbers the order gives (60 s; 90 s for the two long journeys; 120 s for the two cluster
set-ups and F2(e)). The fourteenth added number is the new F8 test's own 60 s, also named. The receipt lists all thirteen
(`BUILDER_RECEIPT.md:70-84`).
None hides a hang that a smaller EXPLICIT limit used to catch: every one of these places had no number before (vitest
default 5 s for a test, 10 s for a hook; `packages/db/vitest.config.ts` and the package's test script set no other default). A
real hang still fails the run; it now takes 60–120 s to show instead of 5–10 s, which is what the order chose and matches the
budgets already used beside them. In F5 the loop's own 20 s limit fires first with a named error.

## BLOCKING findings

None.

## LATER findings

1. F5 give-up path can lose its named error (`recovery-follow-up.integration.test.ts:1041` with `:1054`). After the new 20 s
   throw, the unchanged `finally` still awaits the retry. If the second connection were stuck on something that rolling back
   the first connection does not free, the test would end at 60 s with vitest's generic time-out instead of the named message.
   The order forbade touching the `finally`, the test still fails, and nothing is weakened; this is only about how clear the
   failure message is in a rare case.
2. F6 local probe is slightly stricter than the shared helper (`free-port.test.ts:10` vs `pool-test-utils.ts:7`). The copy
   forgives the two "no IPv6 here" error codes only for `::1`; the shared helper forgives them for either address. This follows
   the order's words ("on `::1`") and cannot make the test pass wrongly; at worst the helper tries another port.
3. F6 keeps the known small race the order accepts: another program could take the neighbour port between the probe and the
   twenty calls (stated in the receipt).
4. F8 exercises one entry of each kind in a chain that already has earlier entries, so the "first entry in a chain, no
   previous hash" branch (`0115:116` `coalesce(previous_digest,'')` vs `audit.ts:41`) is not covered by this test. The order
   did not ask for it.
5. Receipt, builder side: the builder's own `pnpm lint` and `pnpm lint:lanes` exited 1 in its sandbox because the branch was
   still identical to main there (`BUILDER_RECEIPT.md:127-128`, "refusing a misleading pass"). The receipt says so honestly
   and claims no test run. The lane check that counts is the one run at the committed head (see below).

## Evidence run by others that I looked at (read-only)

`jg-runs/fixlater-3-mac-run1.log`: 3 files, 108 tests passed. `…-run2.log`: 3 files, 7 tests passed. `…-run3.log`: 3 files, 75
tests passed, including "Round 1 B" and "R1 parity…" and both free-port tests. Total 190, matching what I was told.
`…-mac-lanes.log`: "Lane boundary passed", lane `fixlater-3`, base `4564e888…`, head `82692fda…`.

## What I did not verify

- I ran nothing: no test, typecheck, lint or build. The pass results above are other people's runs; I read their logs only. The
  three test logs do not print the commit they ran on; I take that from the lane log's head and the matching timestamps.
- GitHub run 38179635995 on this head (queued when I was briefed). I did not look at GitHub.
- That local `origin/main` (4564e88) is still GitHub's main; I did not fetch.
- Type correctness of the test files (the package typecheck does not read `packages/db/test`); I checked by reading only.
- The order's process instruction that F8 be written before F4/F5 (not visible in a single commit).
- Behaviour on a machine with no IPv6 loopback, or on a slow CI runner, for F6/F7 and the new 20 s wait.
- Receipt lines 86–119 and 148–399 (loop before/after, parse script, NOT RUN list) were skimmed, not checked line by line.
