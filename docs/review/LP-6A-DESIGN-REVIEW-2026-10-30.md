# LP-6a session-binding design: independent design review

Required by BUILD_PLAN.md:3308 ("review before fixing LP-5's interface or coding LP-6a") and the LP-6a card (:3391–3401). The LP-5 design review (origin/codex/sandbox/lp-5a-commands:docs/review/LP-5-DESIGN-REVIEW-2026-10-30.md) left §14 items 1 and 5 open as the LP-6a gate; this review covers only those two.

- **Reviewer:** an independent Claude subagent started by the JobGuard coordinator session. It read the files only and changed nothing in the repository; the coordinator records this file.
- **Date:** 30 October 2026
- **Bound to:** `docs/contracts/lp-command-binding-design-v1.md` at commit `5ce8a8c901d54c4a462dd16dadae85379dd2ba2a` (blob `e180abbd96d4bb87f48aa4a1c16c9b9a4976abda`), identical on `origin/main` (`d41d47ac`) and `origin/codex/sandbox/lp-design-note`.
- **Gate confirmed:** the LP-6a card says "Review table-backed versus transaction/environment-bound keyed-signature storage"; note §14 item 1 is that choice and item 5 is its key/owner custody. Items 2–3 were settled by the LP-5 review; items 4, 6 and 7 belong to LP-4, LP-6b and LP-10.
- **Inputs read:** note §§4, 7, 9, 10, 14, 15, 19; BUILD_PLAN §11.8 R1–R2 and LP-6a/6b; `packages/db/src/tenant-context.ts`, `practice-session.ts`; `apps/api/src/auth/principal-bridge.ts`, `persisted-auth-provider.ts`; migrations 0094 (practice session), 0111 (identity.session and grants), 0129/0143 (`identity.sso_session_memberships`), 0138 (PRACTICE-SESSION-HARDEN-1), 0184 (`app.mon1_company_actor`), 0387; `app.mon9_session` in 0483 on `origin/codex/sandbox/mon-9-persist` (`0db3ebea`, unmerged); `docs/contracts/lp-0-effective-privileges-v1.md` (identity role rows).

**Facts from the code that the note does not state:**

- A real session's stored `token_digest` is HMAC-SHA256 under the API's "identity code key" (`persisted-auth-provider.ts:23,80`). The database cannot recompute it, so `bind_request` for real sessions must take the digest. That digest is the bearer credential at database level.
- `jobguard_runtime` has no access to `identity.session` (0000:86, 0111:165). `jobguard_identity` has SELECT, INSERT and UPDATE(revoked_at) on it (0111:175–177), so a holder of the identity login can read every live digest and insert a session for any user.
- `identity.session.environment` is CHECK-constrained to `synthetic_demo` (0111:48). The real/practice kind can only come from *which table* holds the credential, never from that column.
- Home practice digests are unkeyed SHA-256 (`practice-session.ts:10`) and are copied into runtime-readable columns (`app.job.practice_session_digest`, 0094:13; practice feed `session_digest`, 0106:11). The runtime can call `app.issue_practice_session(digest)` with a digest it picks (0094:62). Contractor practice already takes the raw session id and hashes it inside the database (0138:9, `contractor_practice_session_live`).
- Three per-feature session bridges already exist: `app.mon1_company_actor` (0184), `identity.invite_member` (0150) and, unmerged, `app.mon9_session`. They read the session (some `FOR SHARE`), walk `identity.sso_session_memberships` and set `app.tenant_id`.

## Findings

1. **§14 item 1, table-backed binding versus keyed signature: CHANGE.** Choose the table-backed binding as recommended. The keyed signature would need a crypto encoding, domain separation and a verifier, and it still needs the same transaction identity and credential lookup, so it adds parts without removing any. The table is simpler and fits the existing session-bridge routines. Apply these changes before coding:
   - (a) **Row key.** Use the top-level full transaction ID (`pg_current_xact_id()`, xid8, which does not wrap and is the same inside savepoints) plus an environment identity that a logical dump does not carry. Neither the PID, the 32-bit `txid`, a subtransaction ID nor a migration-stored constant is enough on its own. Add a test: a dump restored into a fresh cluster must not honour a carried-over row.
   - (b) **Table.** Make the binding table `UNLOGGED`. That cuts the per-request write cost, keeps rows off physical backups and standbys, and empties it after a crash. Cleanup stays a restricted administrative path, as §9 says.
   - (c) **Credential input per kind.** Real sessions take the HMAC digest and are looked up only in `identity.session`. Contractor practice takes the raw session id, hashed inside the database (the 0138 precedent). Home practice digests are already readable and mintable by the runtime, so treat a practice binding as forgeable by the runtime password. Confine it to `current_database()='jobguard_synthetic_demo'` and its own practice tenant/membership, and test that it can never reach an `identity.session` membership.
   - (d) **Membership checks.** Reuse `identity.sso_session_memberships` for live membership (SSO-required, emergency-owner and SCIM rules) rather than re-implementing them. Assign `mon1_company_actor`, `mon9_session` and the `invite_member` bridges to LP-6c/6d for conversion onto the binding, so one session bridge remains.
   - (e) **Tenant input.** The requested tenant is a *selector* among the session's memberships, as in `principal-bridge.ts`. The actor is derived from (user, tenant) and is never accepted from the caller.
   - (f) **Locks.** Bind is the first statement in the request transaction. Take `FOR SHARE` on the session row only, matching 0387 and mon9, so a revocation waits for in-flight requests, and take no membership lock stronger than KEY SHARE. Add PostgreSQL tests of bind racing session revocation and SCIM deactivation (0137), with the watchdog-lock-order test unchanged.
   - (g) **Threat model.** §19's "DB password alone cannot mint a binding" holds only for the runtime and worker logins and only for real sessions. The `jobguard_identity` login can insert or read `identity.session` rows (0111:175), so it can bind as any user: classify it under threat 3 (identity-process takeover). Anyone who can read `identity.session` (owner, backups) can also bind any live session, which is threat 4. Closing the identity-login door with checked session issuance is a separately counted follow-up, not LP-6a scope.
2. **§14 item 5, key and owner custody, and rotation: CHANGE (text only).** The table-backed choice creates no new signing key, so the note should say so. Custody reduces to the narrow binding owner, which:
   - is a new NOLOGIN, NOINHERIT role with no members;
   - holds only SELECT on `identity.session`, `control_plane.practice_session` and `control_plane.contractor_practice_session`, EXECUTE on `identity.sso_session_memberships`, and its own table;
   - cannot be reached by SET ROLE from runtime, worker or identity (the LP-0 guard checks this);
   - follows the §10 rules: `pg_catalog` first, `pg_temp` last, PUBLIC revoked.

   Rotation does not apply to the binding. The existing identity HMAC key is unchanged by LP-6a. Rotating it invalidates every session, and its production custody belongs to the deployment work, not to this card. Nothing here needs a real secret in a real provider.

**OPEN (for Ben):** none. Both items are design choices. The only real secret involved, the identity HMAC key, already exists and is not touched by LP-6a.

## Verdict

**LP-6a DESIGN REVIEW: APPROVED WITH CHANGES.** The builder applies 1(a)–(g) and finding 2's text to the note, or to the LP-6a order, before coding. A delta check then confirms them. The card's other dependencies (LP-5c, PRACTICE-SESSION-HARDEN-1) are unaffected by this review.
