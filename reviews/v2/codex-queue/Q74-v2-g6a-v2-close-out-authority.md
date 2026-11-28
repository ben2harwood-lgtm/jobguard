# Q74 · V2-G6A: a V2 builder can run main's final account, lock, Final Check and final invoice, through V2's own authority, without weakening main's

**Tier:** RED money and security (who may run money commands). **Builder:** Opus 5.5 thread. **Checker:** Codex, by an `@codex review` comment on the PR. **Base:** G6 part 1's PR (Q73: the review card and the two stage-draft guards), at its head; record the sha. **Branch:** the builder thread's own branch, in `config/lanes/v2-g6a.json`. **Migration: 2088** (next free after this: 2089). **Plan check:** a Claude stand-in after 2 hours. Astra is also asked on #3, because this touches session authority. Rules 1 to 30 apply. Planner: 28 Nov 09:55 UK.

## Why
Q73's reading 1 hit its stop. On the seed stack, `app.finalAccount.build(job, final-account.assemble.v1)` refuses a linked V2 builder with `42501 REQUEST_BINDING_REFUSED` from `app.lp6_session_authority` (`0562_lp6a_request_binding.sql` line 46). That's deliberate in main: a linked practice session's digest is a namespace, and `0741_identity_linked_practice.sql` (line 3) says "Namespace digests are explicitly NON-CREDENTIALS". PX hit the same wall for proof photos (the seed test "PX: main's demo-only proof command still refuses on the V2 database (42501)") and solved it with V2's own path rather than loosening lp6. G6A does the same for close-out.

## Planner reading (please confirm or correct)
1. **Main's lp6 doesn't change.** No new kind, no exception for namespace digests, no change to `lp6_session_authority` or any main grant. The PX seed test and a new one for `finalAccount.build` keep proving that main's commands still refuse a V2 session.
2. **V2 entry points, main's computation.**
   - V2 gets four commands: build final account, lock, request Final Check, issue final or supplementary invoice.
   - Each authorises the actor the way the other V2 money commands do: `app.v2_work_plan_editor`, the practice tenant, `JOBGUARD_LOCAL_V2=1`, and the V2 firm lock.
   - Each then calls the **same** core and repository functions main's commands call (`assembleDraftFinalAccount`, the lock repository, Final Check, invoice issue), in the same order and inside one transaction.
   - Nothing is copied or re-implemented. If a main function can't be called without its lp6 wrapper, split the wrapper from the body inside main's file, so main's command still calls wrapper-then-body. Record each split as a mount, and prove main's specs are unchanged.
3. **Definer functions only if unavoidable.** If a step needs privileges the V2 runtime lacks, add a V2 `SECURITY DEFINER` function in 2088 with:
   - `search_path` pinned;
   - the V2 firm lock checked inside it;
   - an explicit actor check;
   - `REVOKE ALL FROM PUBLIC`, and EXECUTE granted only to `jobguard_runtime`.
   Each one is listed in the PR for the FL-F definer review (`Q40`). Prefer none.
4. **Same records, same audit.** The V2 commands write the same final-account, lock, Final Check and invoice rows main writes, plus main's audit events. The actor reference is the V2 membership. There is no V2 copy of any money row.
5. **The Q73 guards stay first.** `V2_STAGE_DRAFT_OPEN` at lock, and `FINAL_ACCOUNT_LOCKED` in `draftStage`, under K5B-1's schedule lock, before the lock's own locks.

## Build
1. A V2 close-out application with the four commands, routes under `/api/jobs/[id]/close-out/…` (V2 local, practice tenant, the usual job, firm and session gates), and idempotent commands with replay and conflict.
2. 2088 only if reading 3 needs it: V2 fence, firm lock, run twice with no change.
3. The screen: the existing designed money tab controls (Q69) call the V2 routes on a V2 job, and main's routes otherwise. One switch, tested.
4. Lane `config/lanes/v2-g6a.json`, recording every mount on main-owned files.

## Tests (seed, appended)
1. **Q73's done-when.** Accepted quote, +£240 approved extra, stage draft withdrawn, all tasks done. Build, lock and Final Check, then the final invoice. The invoice total equals quote + £240 + VAT to the penny, and the final account's variation total equals `approvedExtrasTotal`.
2. Main's `finalAccount.build`, lock and proof commands still refuse the V2 session with 42501. Main's own final-account, lock, Final Check and invoice specs pass unchanged.
3. A failed reconciliation leaves the invoice pending. A late approved extra goes to a supplementary invoice, and the final invoice's bytes and hash don't change.
4. Another firm gets 404 on every V2 close-out route. Rule 30 firm A/B check on any 2088 object.
5. Replay and conflict for each command. An un-withdrawn stage draft still gives `V2_STAGE_DRAFT_OPEN`.
6. Rule 29: pending V2-SX unless SX is on the base.

## Stop
- If any step would need main's computation copied, or lp6 relaxed, stop and report.
- If the V2 path's final account differs by a penny from what main's path would compute for the same sources, that's a defect. Stop.

## Done when
- On the practice job, a V2 builder closes the account end to end through main's own computation, main's authority rules are unchanged, and the final invoice is exact.
- CI1 is green, and the Codex check is clean or answered. Merge only on Ben's own card (RED money and security).

## Parked, 28 Nov 10:55 UK (coordinator decision under Ben's standing say-so)
The builder's dry-check (`/mnt/project-files/jobguard-v2/notes/q74-dry-check-2026-11-28.md`) found two blockers:
- Main's close-out is gated to the demo database: 167 functions check `current_database()='jobguard_synthetic_demo'`, including the Final Check worker (`lp11_bind_shadow_job`) and `answer_job_proof_statement`.
- The proof session digest goes through lp6.
Renaming the V2 database was refused, because it would switch on main's demo-only shortcuts, such as generated proof, on V2 and would clash with the Mac demo database. Opening main's gates is a RED main change. Decision: park until after the 3 Dec hosting decision. G6 part 1 (the review card and stage-draft guards) ships. 2088 stays reserved for this piece.

## Codex design reply while parked (#3 7237808230, 28 Nov 10:18 UK), for the restart
- A wrapper and body split is fine for shared calculation with no side effects. A write keeps one authenticated command boundary, and a runtime or worker role can't call the body directly. Any privileged function needed still goes through FL-F review, with restricted execution and a trusted search path.
- Keep a current, unexpired, unrevoked actor binding to the exact firm, membership, job and transaction. Recheck it on retries before returning an earlier receipt. Return an earlier invoice only for the same authorised command.
- Record the real membership in the money audit.
- Tests: normal success, a refusal for the same tenant with a different firm, and a stage draft racing the close.
- An issued invoice and its digest survive a later supplement.
