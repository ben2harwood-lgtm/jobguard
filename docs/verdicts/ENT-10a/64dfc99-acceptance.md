# Technical acceptance ENT-10a — PR #131 — verified head 64dfc99 (+ final catch-up) — ACCEPTED, "SAML synthetic, M4 held"

**Decision:** ENT-10a (SAML 2.0 sign-in for contractor tenants behind the existing `AuthProvider`; synthetic test identity provider only; migration 0120) is ACCEPTED for merge under Ben's written delegation and the three check lanes (Ben, 11 Oct, card `speed-up-three-check-lanes-2026-10-11`), provided GitHub CI is fully green on the exact final head that adds this file. Technical acceptance scope is **"SAML synthetic, M4 held"**: this is not full ENT-10 acceptance. Dark and synthetic; nothing is released; any identity provider other than the in-process test one is refused server-side.

**Actor:** Claude Opus 5.5 (`claude-opus-5-5`), JobGuard integrator (11 Oct), a subagent of the coordinator session. It issued the orders and dispatched builders; it built nothing here and gave no review verdict.

## Authority
Order `jg-orders/ENT-10a-issued.txt`. Ben, 8 Oct: "Approve a library". Coordinator, 11 Oct: adopted the ENT-10 split; the ONE approved library is `@node-saml/node-saml` (step 0, 8830a6c, pinned 5.1.0, dependency audit clean); no hand-written token or signature verification; ruled that tying a single-sign-on session to its company on every identity path is a defect fix inside the approved scope.

## Held and deferred (not built; confirmed by both checkers)
OIDC (HELD for Ben: second library); emergency-access administration (HELD for Ben: who approves its use); native path (HELD); D04/G5 founder evidence (HELD); SCIM (later sub-leaf ENT-10a2, owes DW4 first half); audit export (ENT-10b); assurance pack (ENT-10c). Ben's answer of 11 Oct, "SSO only" with one audited emergency route, becomes its own order (ENT-10d) and is NOT part of this piece: today an account linked by SAML can still sign in by emailed code.

## Chain
- Builder Codex GPT-6.1 Sol (a5a396b); Codex CI repair 1 (5ddcf56). Claude Sonnet helpers: step 0; catch-up, renumber 0114 → 0120 with the §12.2 ledger lines, and the first real database and browser runs (fecea25).
- Lane: **RED** (sign-in, sessions, roles, tenant separation, a new dependency). Floor RED.
- Sol on 8d208db (`8d208db-sol.md`): REPAIR — a single-sign-on session was tied to its company only inside the SSO code; a JSON operator precedence fault in the audit SQL. **Round 1** (34cf98e).
- Opus on fecea25 (`fecea25-opus.md`): PASS, 0 blocking, 16 later. Fresh Sol on fecea25 (`fecea25-sol.md`): REPAIR — the subject-confirmation Method was not required to be bearer; the Nest transport's state cookie had the wrong path. The Opus reviewer records that its PASS had missed both. **Round 2, the last allowed** (64dfc99, Claude Sonnet on the Mac).
- Re-checks on 64dfc99, fixes and regressions only: the SAME Opus reviewer `64dfc99-opus-delta.md`: "VERDICT: PASS — bound to head 64dfc9905fca558bc623cf72551821d7d253aef6", 0 blocking, 3 later; a fresh Sol session `64dfc99-sol-delta.md`: "VERDICT: PASS", no blocking finding (one carried later item).
- Tests on 64dfc99: GitHub CI run 38160797960 green (API 1004 passed; database 915 passed including enterprise-identity 19 of 19; browser 306 passed, no failed, flaky or retried).
- Hard limits confirmed by both checkers: no existing M0-6L identity assertion changed; `context-boundary.test.ts` and every file it pins untouched; lane registry change is ENT-10a's own line only; migration 0120 adds new objects only.
- **Final catch-up (green lane; integrator's verdict):** CH-7 (#132, 0119) merged to main after the re-checks, so a03f9e8 merges main 4a70824 into this branch and 459686a adds the builder's catch-up receipt. I checked the merge myself: the piece's own diff against main is still its own 33 files with none of CH-7's; `migrate.ts` gains only the 0120 line after 0119; no conflict markers; the lane registry parses; `git diff 64dfc99 HEAD` shows no change to `apps/api/src/auth/**`, migration 0120 or the identity repository. Everything merged in was already reviewed and merged on main. The combined result is proved by GitHub CI on the final head; nothing else changed after 64dfc99 except records.
- Migration order: merged through 0115 and 0119; 0120 is above every merged number and registered in numeric order.
- LATER findings (about 20) are on `jg-orders/FIX-LATER.md`; the one that matters before any real identity provider is the emailed-code route, now covered by Ben's "SSO only" answer (order ENT-10d).
- Only commits after 459686a: this one, adding record files inside `docs/verdicts/ENT-10a/`.

## Founder-reserved areas
Sign-in is a founder-reserved boundary area: this piece changes it only on a dark, synthetic build, inside the approved ENT-10 card, with both independent checks. No real identity provider, live provider, real data, spending, production mode, deployment or release. No security test edited.
