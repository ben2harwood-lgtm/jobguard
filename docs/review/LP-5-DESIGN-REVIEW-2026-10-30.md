# LP-4–LP-6 command-binding design note: independent design review

Required by BUILD_PLAN.md:3308 and :3325 before LP-5's command interface is fixed.

- **Reviewer:** an independent Claude subagent started by the JobGuard coordinator session. It read the files only and changed nothing; the coordinator recorded this file.
- **Date:** 30 October 2026
- **Bound to:** `docs/contracts/lp-command-binding-design-v1.md` at commit `5ce8a8c901d54c4a462dd16dadae85379dd2ba2a`, which is the same on `origin/main` and `origin/codex/sandbox/lp-design-note`.
- **Inputs read:** the note (§§4, 5, 10, 14, 17, 19); BUILD_PLAN LP-5a/5b/5c (:3308, :3325, :3365–3390); `packages/db/src/commands.ts`; `packages/core/src/watchdog.ts`; the commands, command-replay-contract and watchdog-lock-order integration test titles.

**Correction to the builder's inspection notes:** `commands.ts` has no `handler.inputHash`. In ordinary dispatch, membership is checked before the replay path only when `handler.lock` exists, so without a lock a revoked member gets the stored result back.

## Findings

1. **`begin_command` / `complete_command` signatures: CHANGE.** §5 has the caller supply `input_digest`, but §17 says the database derives it. Delete the §5 sketch and keep §17's signatures as the only ones:
   - `begin_command(version, command_id, command_type, semantic_key, resource, expected_revisions, significant_input jsonb)`, which returns claim, replay or refusal;
   - `complete_command(command_id, outcome)`, where the outcome is either an adapter-derived result reference or the defined no-op.

   The caller never supplies a digest.
2. **Key / input-hash conflict rule: CHANGE.** Today the lookup takes `rows[0]` of `command_id = $2 OR (command_type, semantic_key)`, which is non-deterministic when the two keys match different receipts. Resolve both keys. Conflict if they point to different receipts, or if any matching receipt's stored digest differs. Keep today's digest exclusions (commandId, decisionId, resolutionId, authorizationId), and keep the actor, subject and full action terms in the digest.
3. **Replay access re-check: CHANGE.** Two live behaviours are defects to fix in LP-5a, each with a failing test first:
   - (a) a dispatch without `handler.lock` replays its stored result to a revoked or expired member;
   - (b) `dismissDecision` replays before its owner check.

   Re-check access without upgrading the membership foreign key's KEY SHARE lock to FOR UPDATE. That preserves the existing deadlock fix and its test.
4. **Type registry: CHANGE.** Add an explicit database registry keyed on `(command_type, version)`. Each entry holds the permission rule, the lock-phase adapter, the completion adapter and the required outbox/audit classes, and only the narrow owner role can write to it. Seed it with exactly today's behaviour: every dispatcher type is owner-only, and `finding.resolve` is owner-only with no authorization. Reconcile it with the `watchdog.ts` registry keys rather than creating a second taxonomy, and extend command-replay-contract's "every registry key" test to cover both.
5. **Completion proof: CHANGE.** Add a deferred constraint trigger on `command_receipt`. At commit, no receipt touched in the transaction may still be `processing`. A `succeeded` receipt must have:
   - a business row that the type's adapter verifies against the receipt's actor, type, resource and revision;
   - an audit event whose references contain this `command_id`;
   - every outbox row the registry requires.

   `succeeded_noop` is only for an adapter-proven "no change needed", recorded with a reason. The stored result is built by the adapter; handler JSON is never stored.
6. **Transaction boundaries and lock order: ACCEPT, with one clarification.** `begin_command` takes no business lock. The adapter's lock phase runs before it in the same transaction. Keep the watchdog-lock-order test and the two commands integration lock tests unchanged.
7. **Privileges / SECURITY DEFINER: ACCEPT, plus a stated limit.** The §10 rules stand. Until LP-6 binding is enforced, `p_actor` and `p_tenant` are trusted inputs, so LP-5 claims nothing against a forged actor.
8. **Migration of existing dispatcher routes: ACCEPT, plus a test requirement.** Each converted route must keep its refusal codes (FORBIDDEN, COMMAND_CONFLICT, AUTHORIZATION_INVALID), its authority-first order and its existing assertions. The only intended changes are the tightenings in finding 3.

**OPEN (for Ben):** none for LP-5's interface. §14 items 1 and 5 gate LP-6a, not LP-5.

## Verdict

**DESIGN REVIEW: APPROVED WITH CHANGES.** The builder applies findings 1–5 (CHANGE) and the clarifications in 6–8 before LP-5a's interface is fixed. A delta check then confirms them.
