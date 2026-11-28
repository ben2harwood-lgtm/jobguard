# Q81 · V2-AUTH-1: a linked builder can read and add job proof (H1 blocker B3), with no change to lp6 or main's proof SQL

**Tier:** RED (security and authority), practice tenant only. It merges on Ben's own card. **Builder:** Opus 5.5 thread. **Checker:** desktop Codex security review, using Codex's design conditions on #3 (7237808230). **Base:** v2/main @ 77ed320e7 plus #1057. **Migration:** the next free V2 number (2089) only if a V2-owned definer is needed. FL-F review rules apply. **Plan:** Q80 report B3 (`/mnt/project-files/jobguard-v2/notes/h1-dry-2026-11-28.md`). **Planner decision (under Ben's "you decide everything"):** this is the first slice of the parked Q74. It's taken now because H1 steps 8, 14 and 15 all depend on it. Planner: 28 Nov 15:15 UK.

## What breaks
`GET /api/jobs/:id/proof` returns 500 (42501) for a linked builder. The call chain is `job_proof_requirement` → `job_proof_authority` → `job_proof_session_digest` (0734). That function asks `lp6_session_authority` for a home practice-session digest, but a linked V2 session has a namespace digest, so lp6 refuses it by design. Because of this:
- no progress photo can be added;
- site work can't be finished;
- handover release and the customer pack can't run.

## Rules
- Don't change lp6, 0734, main's proof functions, their grants or main's RLS (standing rule).
- Don't rename the V2 database.

## Build
1. **Dry-check first.** List every main function on the proof path that calls `job_proof_session_digest` or `lp6_session_authority`, for the read, adding a proof photo and finishing site work. If any step can only work by changing main's SQL, stop and report to the planner.
2. **V2 entry points.** On the local V2 stack only, the proof routes resolve the actor through V2's existing verified path, `app.v2_work_plan_editor` plus `enforcePracticePair`, as F8, K5B-1 and G1 to G9 already do. They then call main's **side-effect-free** proof body functions for the read.
3. **Writes.** For the photo and site-complete writes, keep exactly one authenticated command boundary in a V2-owned function, as Codex requires:
   - The underlying write must not be callable directly by the runtime or a worker role.
   - The actor binding must be current, unexpired and unrevoked, for the exact firm, membership, job and transaction.
   - Re-check the binding on a retry before returning an earlier receipt.
   - The audit records the real membership.
4. Off the V2 stack, main's path stays exactly as it is.

## Tests (seed, as a linked builder)
- Proof read: 200, with the same requirement result that main's own path gives for a home session on the same fixture.
- Add a progress photo, then finish site work. A replay returns the same receipt, and a revoked session is refused.
- Same tenant, other firm: 404 on read and on write.
- A runtime-role direct call to the write body is refused.
- A browser step on the V2 launcher: progress photo, then site complete, then handover release unblocked.

## Done when
H1 steps 8 and 14 pass in the browser for a linked builder, lp6 and 0734 are unchanged, and the desktop Codex security review is clean.

## Planner decision after the dry-check (28 Nov 15:10 UK)
The builder's dry-check found three problems:
- main has no proof read that avoids lp6;
- `answer_job_proof_statement` (0734) refuses any database not named `jobguard_synthetic_demo`;
- `ProofApplication` hard-codes `DEMO_MEMBERSHIP_ID`.

The electrical-certificate path (photo, then complete, then site complete) needs no change to main's SQL.

**Chosen: option A, the narrow version.**
- **The read.** A V2-owned, read-only definer for the requirement read (2089; FL-F rules apply), commented as a mirror of 0734's `job_proof_requirement`. A parity test checks that it gives the same requirement as main's function for a home session on the same fixture, in every state.
- **The writes.** One V2 command boundary for upload and complete, on `v2_work_plan_editor` + `enforcePracticePair`. It records the real membership and re-checks the binding before returning an earlier receipt. Main's `ProofApplication` is unchanged.
- **"No electrical work" stays refused on V2**, with the message "On the practice V2 stack, record an electrical certificate photo instead."

Main's SQL, lp6 and 0734 are unchanged.

**Moved to Q74 for the 3 Dec decision:**
- B, a V2 fork of the statement answer that writes main's tables;
- C, changing 0734 so the linked namespace is accepted. That would be main-lane, RED, on Ben's card.
