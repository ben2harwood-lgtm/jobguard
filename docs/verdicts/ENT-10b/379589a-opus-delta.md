VERDICT: PASS — bound to head 379589a846ed2c69550acabe5144cb1f20ebe367
Reviewer: the same fresh Claude Opus 5.5 that passed 129e19b; did not build or order this. Lane: RED. Round-1 re-check only (fixes, catch-up merge, regressions). Local HEAD = PR #133 head = 379589a (confirmed). Commits since 129e19b: 80b2fd5 (Codex round 1), 70fe9da (merge of main bbca5ca), 4331ab8 and 379589a (Sonnet verification, receipt). Worktree untouched by me.
Counts: BLOCKING 0, LATER 4 new (my earlier later items stand, except item 10 which is now fixed).
## Fix 1 — a refused revoked member is audited: DONE
- application.ts:25-35: when the existing contractor check refuses a session-resolved member, the service writes the refusal first, then throws 403. Tenant, membership and user all come from the database session lookup; nothing from the client.
- repository `refuse()` (audit-export-repository.ts): one `audit.export.refused` event in the session's tenant; actor is `membership:<id>` only if that membership row exists in that tenant with that user, otherwise the fixed `security:unverified-member`. It never reads `app.audit_export`, so the answer says nothing about whether exports exist.
- Not attributable (no cookie, malformed cookie, unknown session): 401 before any write, no audit row (unit test).
- If the refusal cannot be saved the caller gets 503, never access (unit test). Exactly one refusal per request (the two refusal paths are mutually exclusive).
- No privilege change: migration 0121 is byte-identical to the reviewed head; `refuse()` uses only existing reads and the merged audit appender.
- Tests fail without the fix: real-PostgreSQL case through the application for list and create (403, exactly one refusal row with the right tenant and actor, no export row, the other tenant's chain unchanged); unit cases prove the refusal is awaited before the 403 and that list/create are never reached.

## Fix 2 — the screen keeps its retry id: DONE
- page.tsx:25-31: the id is cleared only after a success whose returned id matches, or a versioned 4xx carrying FORBIDDEN, INVALID_INPUT, CHECKPOINT_REQUIRED or MODE_HELD. It is kept after 503, a network error, an unreadable body, an unknown code, a refusal code on a 5xx, or a "success" with no matching id; it survives the in-page list reload.
- page.test.tsx drives the real handlers: six fault kinds send the SAME id on retry; four definitive refusals start a new id; success clears it even when the following list refresh fails. Server replay of the same id returns the stored export with no new event (existing DB test).

## Fix 3 — two different exports at once: DONE
- Really concurrent: two separate pools of one connection each (different backend pids asserted), both creates started together under Promise.all; nothing in the test waits for one before starting the other. Ordering happens only inside PostgreSQL (tenant lock, then audit head lock), which is the behaviour under test.
- Asserts two rows, two `audit.export.created` events, sequences exactly 1..n and unique, head row equals the last event, the stored chain verifies against the checkpoint, entry counts are before+1 and before+2, each file equals the matching prefix of the chain, and BOTH files pass the command-line verifier with exit 0.
- The helper's set-up repair (passing the pool password explicitly) changes no assertion and adds no serialisation.

## Browser locators
`page.getByRole("main").getByRole("alert")` is role-based again, scoped to the page's own main area, still strict; text and focus assertions unchanged. Not weaker than either earlier form.

## Catch-up merge with main bbca5ca (ENT-10a, migration 0120)
- ENT-10b's diff against main is its own 26 files only; nothing under apps/api/src/auth; no package.json or lockfile; no scanner-pinned file.
- migrate.ts: 0119, 0120, 0121 in order. app.module.ts and workspace/application.ts: the long registration lines equal main's lines plus ONLY the ENT-10b insertion (checked mechanically), so SSO registrations are intact. openapi.json: +55 lines, the audit-exports path only. Lane registry: one line, now also allowing page.test.tsx as the repair order permitted. tenancy test: +4 rows, 0 removed. No existing assertion of a merged leaf changed (the only edited existing test is ENT-10b's own, renamed and strengthened).

## BLOCKING
None.

## LATER (new)
1. The concurrency test does not probe that the second transaction actually waited on a lock; overlap is by construction, not by assertion.
2. The pending command id lives in page memory, so a full browser reload after an unknown outcome starts a new id (the list would then show the first export if it had committed).
3. COMMAND_CONFLICT and UNAUTHENTICATED keep the id (as the repair order listed); harmless, but a conflict repeats until the page is reloaded.
4. A revoked member can now add one audit row per request, same as any refused member; fold into the earlier rate-limit item.

## Test evidence for this exact head (GitHub CI run 38168996421, head 379589a, all checks pass)
- typecheck, lint (lane boundary passed, base bbca5ca), test, build, browser: success; secrets and dependency-review pass.
- db: audit-export.integration.test.ts 11 passed (was 8; +2 revoked, +1 concurrency); verify-audit-export-cli.test.ts 14 passed; 73 db files passed.
- api: audit-export.application.test.ts 14 passed; context-boundary.test.ts 145 passed. web: audit-exports/page.test.tsx 11 passed.
- Browser: 326 passed, 0 skipped, retries off; main at bbca5ca is 324, so +2 = ENT-10b on both screen sizes.
- Not verified: CI prints file-level counts and no browser test names, so the new cases passing is read from the counts; I ran no test on the Mac. Receipt counts (25 / 13 / 159 / 11 / 2) agree with CI.

TL;DR: All three round-1 fixes are in and do what was ordered, the merge with ENT-10a kept both sides and nothing else, and GitHub's tests are green on this exact head. Nothing needs repair.
