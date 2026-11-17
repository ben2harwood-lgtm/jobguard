VERDICT: PASS — bound to head 129e19b524e5f7080888566714f9e8e4809b7a0b
Reviewer: fresh Claude Opus 5.5; did not build or order this; did not coordinate with the Sol check.
Lane: RED
Piece: ENT-10b signed single-tenant audit export + verifier, PR #133, base 4a70824. Local HEAD = PR head = 129e19b (confirmed). Worktree left untouched.
Counts: BLOCKING 0, LATER 13.

## (1) Does it meet the order? — criterion by criterion
- Scope: MET. Audit export only. No file under apps/api/src/auth (diff 0 lines), nothing for SSO/SAML/OIDC/SCIM/emergency access/assurance pack/key rotation. No dependency change (package.json and lockfile diff 0 lines).
- DW6 altered / missing / reordered / truncated tail / invalid signature: MET. verify-audit-export-cli.test.ts runs the real command-line tool for each, once with the original signature and once RE-SIGNED with a fresh valid key, so the chain checks are proven separately from the signature check; plus truncation with the count and head rewritten, a zeroed signature, a swapped public key and the wrong trusted key. Each fails without the code.
- One tenant only: MET. Every query in audit-export-repository.ts filters tenant_id=$1 inside withTenant (row-level security on top). DB test forces tenants A and B to share one user and asserts A's signed payload holds no B tenant id, membership id, export id, head hash or key, and that entryCount equals A's own row count. Browser test repeats it with two practice tenants.
- Own audit event: MET. create() appends `audit.export.created` (id = the export id) before reading the chain; the verifier requires that event to be the signed tail.
- How the tenant is fixed: from the session cookie only. The session is looked up in the database (app.contractor_session) and returns tenant, membership and user; the request schema is strict {version, commandId}; a posted tenantId gives 400 and a query string gives 400 (tested). No route takes an export id. Keys are (tenant_id,id), so re-using another tenant's export id as a commandId only creates a row in the caller's own tenant — nothing of the other tenant is read or revealed.
- Who may export: MET. Active member with an unrevoked, tenant-wide owner or admin grant, rechecked under the ENT-1 lock. DB test loops every other role (create and list) and asserts the committed `audit.export.refused` rows; branch-scoped admin, revoked grant and revoked membership are refused. The refusal is committed before the 403 is thrown.
- Runtime privileges not widened (Q10): MET. See the list below. The checkpoint is copied by the restricted credential into a hand-off table; runtime can only read its own tenant's copies and cannot insert. The DB test compares every existing table ACL/owner/RLS flag, policy, routine and role attribute before and after 0121 (equal) and proves runtime gets 42501 on audit_control and on a hand-off insert.
- Signing: MET. Node crypto only (generateKeyPairSync ed25519, sign, verify, createPublicKey, sha256); no hand-written cryptography. A key pair is made in memory per export and the private half is never stored. Any mode other than synthetic_demo (including unset) throws typed AUDIT_EXPORT_MODE_HELD before the database is touched (API and DB tests).
- Signed bytes: unambiguous. The exact payload bytes travel in the file and are verified as-is (no re-serialising); non-canonical base64 is rejected; wrapper and payload schemas are strict, so an extra unsigned field is rejected (tested). The report is built from the signed payload only.
- Where trust comes from: the verifier takes the trusted public key from a SEPARATE file (--trusted-public-key) and compares its fingerprint with the bundled key and with the fingerprint inside the signed bytes. A tampered export that swaps in its own key fails against a previously saved key. With no trusted key the tool exits 1 and says signerTrusted:false / complete:false. Screen and contract both say, in those words, "The signature proves export integrity only", and that a bundled key needs independent trust.
- Verifier needs only the file and the public key: MET (no database, server or credential; the repository's database import is lazy so the tool does not load it).
- Migration 0121: MET. Two new tables only, tenant-qualified primary and foreign keys, FORCE row-level security, append-only triggers reusing the existing reject function, no ALTER of anything existing, registered after 0119, test positions it by file name.
- Scanner and pinned files untouched: MET (0 lines changed; 145 scanner tests pass in CI). Lane registry: one added line, in name order. Existing tests: tenancy +4 catalogue rows, 0 removed lines; UIWIRE-12 and demo-bootstrap unchanged.
- The helper's locator change (4× getByRole("alert") → locator("p[role=alert]")): does NOT weaken the spec. The page has exactly one <p role="alert">; Playwright strict mode still fails on two matches; the matchers, expected text and focus checks are byte-identical. It only stops Next's own route announcer being matched. Same idiom already in M4-1-S.spec.ts and shell.spec.ts.

## What migration 0121 adds
- Table app.audit_export_checkpoint (owner jobguard_migration). Runtime: SELECT only, own tenant via RLS. Migration role: all, via policy.
- Table app.audit_export (owner jobguard_migration). Runtime: SELECT and INSERT only, own tenant via RLS. No UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER for runtime (tested).
- Policies: tenant_isolation on each (FOR ALL TO jobguard_runtime, tenant must equal app.tenant_id, USING and WITH CHECK); migration_integrity on each (FOR ALL TO jobguard_migration).
- Grants: REVOKE ALL on both from PUBLIC, jobguard_runtime, jobguard_infrastructure; GRANT SELECT,INSERT ON app.audit_export TO jobguard_runtime; GRANT SELECT ON app.audit_export_checkpoint TO jobguard_runtime.
- Triggers: audit_export_immutable, audit_export_checkpoint_immutable (BEFORE UPDATE OR DELETE → existing app.reject_audit_mutation).
- Routines: NONE. No SECURITY DEFINER. Nothing lets runtime read audit_control or another tenant.

## (2) Could it cause harm? Boundary cases reasoned through the code
- Two exports at once / an export while another event is being appended: no fork. create() takes the tenant advisory lock, then the audit head row lock (app.lock_audit_head, FOR UPDATE), which every appender takes; the chain is read only after that lock, in READ COMMITTED, so it sees every committed event plus its own. The (tenant_id,sequence) primary key would reject a duplicate anyway, and create() re-verifies the whole chain before signing; any failure rolls back the event and the row together (tested).
- Same command id raced twice: one event, one row, identical bytes returned (tested); a different member re-using the id gets a typed conflict.
- Empty chain: cannot produce an export. No checkpoint can exist without an event (foreign key), so creation stops with CHECKPOINT_REQUIRED and nothing is written (tested).
- Admin in tenant A, operative in tenant B: a session maps to exactly one tenant and membership. B's session is refused and audited in B's chain. At repository level, pairing A's context with B's membership is refused and B's membership id is NOT written into A's chain (generic `security:unverified-member`).
- Verifier fed an extra unsigned field, or a re-signed forgery: rejected / reported untrusted as above.
- Money: not touched. Main journeys: only additive registrations (one controller, one service entry, one barrel export); CI's full suite is green.

## BLOCKING
None.

## LATER (one line each)
1. Nothing in the product performs the checkpoint hand-off, and the existing all-tenant checkpoint function errors on a second run when any tenant has no new events, so on a hosted sandbox "Create signed audit export" shows CHECKPOINT_REQUIRED until someone with restricted credentials runs per-tenant SQL; needs a follow-up operator command (the order chose this route, so not a defect of this leaf).
2. apps/api/src/audit-export/audit-export.application.ts:34-45 obtains the tenant context by handing the real bridge a hand-made AuthProvider with a constant CSRF token and a fictional origin; not exploitable (tenant comes from the database session lookup) but it is an eighth practice-session route that the scanner's approved, hash-pinned list does not cover. Move construction into the db repository and add it to the scanner list through a reviewed scanner edit.
3. With no trusted key the verifier prints integrityValid:true for a self-signed (possibly forged) file; exit code is 1 and signerTrusted is false, but the field name invites misreading.
4. Every refused GET writes an audit event, so a low-privilege member can grow the chain by refreshing; rate-limit or coalesce.
5. Each export stores a full copy of the chain and the list returns every file; size grows fast; paginate or list metadata only.
6. No database guard that an audit_export row points at an `audit.export.created` event or matches its head hash; the migration-role policy on audit_export could be SELECT only.
7. Hand-off rows are immutable and the foreign key covers (tenant, sequence) but not the hash, so one wrong privileged hand-off blocks that tenant's exports for good (fails closed).
8. createdAt is ISO on first create but PostgreSQL text format on replay and list.
9. The screen is reachable by URL only; nothing links to it.
10. A revoked membership is refused at the API before the repository, so that refusal is not audited over HTTP (it is at repository level).
11. Foreign-key row locks are taken after the audit head lock in create(), against the "head lock is final" convention; low deadlock risk.
12. The Nest controller uses its own origin allow-list idiom, unlike sibling contractor controllers.
13. A stored event that fails the strict schema would surface as 400 INVALID_INPUT, and a broken chain as 503; clearer typed codes later.

## Executed vs inspected vs not verified
- Executed by me: read-only git and gh only (head identity, diffs, CI status and job log). No test suite run on this Mac, as instructed.
- Inspected in full: migration 0121, audit-export-repository.ts, the three audit-export api files, verify-audit-export.mjs, the three test files, ENT-10b.spec.ts, route, screen, contract, data-flow doc, shared-file diffs, merged audit.ts, tenant-context.ts, principal-bridge.ts, migration 0001 and the role-grant parts of 0054.
- Not verified: the scanner's internals (relied on it being unchanged and passing); behaviour on a deployed host; that the two extra browser tests are ENT-10b's is inferred from totals because CI's dot reporter prints no names.

## Test evidence seen (GitHub CI run 38164379947, head 129e19b, all three checks pass)
- typecheck, lint (lane boundary passed for ent-10b, base 4a70824), test, build, browser: all success; secrets and dependency-review pass.
- db: test/audit-export.integration.test.ts 8 passed; test/verify-audit-export-cli.test.ts 14 passed; db package 72 files / 941 tests passed.
- api: src/audit-export/audit-export.application.test.ts 9 passed; src/auth/context-boundary.test.ts 145 passed.
- Browser: 320 passed in 17.6 min, retries 0; main's latest run is 318, so +2 = ENT-10b in mobile-360 and desktop.
- Helper's Mac runs in the receipt (22 / 13 / 154 / 2) agree with CI.

TL;DR: The export does what the order asked and I found no way for one tenant to see another's audit records, no widened database permission and no way to fork the audit chain. Nothing needs repair before merge. The one thing to know is that the "create export" button cannot succeed on a hosted sandbox until a restricted operator step for the checkpoint exists — that is a follow-up, not a fault in this piece.
