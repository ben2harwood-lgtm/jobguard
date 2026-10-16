# Practice role switch v1 — backend

Built source, with database/HTTP execution pending dispatcher/CI. Decision 39 of
15 October authorizes four targets: operative, supervisor, surveyor, and client
(the existing `client_approver` role). The current issued base is
`6671538c8d69936c162368c760dd6ce0f7f10493`. The continuation supersedes the old
surveyor restriction and assigns screens and the browser journey to ENT-11a.
No cookie, session, member or grant is created by switching. No money is read or
written. Switching neither extends nor revives a session.

## Definitions

- **Session value, digest, row number, live, expired, revoked, ended, never issued:** the Definitions of HARDEN-1's merged contract (`docs/contracts/contractor-practice-session-v1.md`), used here unchanged; note that "expired" there includes a session whose HOME practice record has ended (this text says "home-ended" where the difference matters). **Session reference (`session_ref`):** the row number as this piece stores and passes it. It is NOT the session value; it may appear in an audit event; it never appears in a response. **The session's own member:** the member on the session row (the generated owner). This piece never changes a session row.
- **Made-up practice company (decided by the database, routine 1):** a tenant T for which ALL hold: (a) the database is named `jobguard_synthetic_demo`; (b) T is the tenant of the session row whose row number is presented, and equals the transaction's tenant setting (through the product this means "the practice start generated it": of everything the product runs, only `app.start_contractor_practice` writes that table, and only for a company it has just made; what the table's own owner can write by hand is honest limit 13); (c) that row's member is T's membership with exactly that identity user, its role is `owner`, merged `app.contractor_member_active` is true for it (active, and T's latest track is `contractor`) and merged `app.contractor_allowed(member,'organisation.manage',T)` is true; (d) nobody can sign in to T: (d1) no `identity.membership_locator` row has `tenant_id = T`; (d2) no `identity.invitation` row has `tenant_id = T`, pending or accepted; (d3) no `identity.sso_connection` row has `tenant_id = T` (and therefore no verified domain, group mapping, SSO request, subject, session binding, SSO grant or SSO-required record of T: each carries a foreign key to the company's connection); (d4) no identity user of ANY membership of T has an `identity.user_email` row or an `identity.session` row.
- **Made-up marker; marked company:** one row of new `control_plane.practice_company_marker` for T. A company ACQUIRES it in the same transaction as its first successful switch-on, when routine 1 has just answered `made_up`; never earlier, never by any other route of the product. It is permanent: never changed, never removed. From then on the database refuses every write that would attach a sign-in identity to T (Migration item 11). The lookup also re-reads, at every request, the sign-in facts it can read (Migration item 12), so the marker is never the only thing standing between a running switch and a company somebody can sign in to.
- **Real company (for this order):** every tenant that is not a made-up practice company; in particular any tenant in a database with another name, any tenant created by sign-up (`0111:86-93`), any tenant with no practice session row of its own, and any tenant, however created, that a person can sign in to, which includes a practice-start company that has been given a sign-in identity.
- **Made-up site worker (the only permitted target):** a member W for which ALL hold: W is a membership of the SAME tenant T; W is not the session's own member; W's own role is `operative`, `supervisor`, `surveyor` or `client_approver`; merged `app.contractor_member_active(W)` is true; every un-revoked `app.role_grant` W holds has role `operative`, `supervisor`, `surveyor` or `client_approver`; and nobody can sign in as W (no `identity.user_email` row, no `identity.membership_locator` row and no `identity.session` row for W's identity user; an `identity.sso_subject` row naming W cannot exist, because T has no connection). W need NOT be named on a job (coordinator Q3). "Nobody can sign in as W" is about SIGN-IN rows only: the contact address every contractor member has (`app.contractor_member.email`, ending `.invalid`, `0054:41`) is not a sign-in address and plays no part, so the sample operative and an invited supervisor are eligible exactly as the product makes them.
- **Switch:** one row of new `control_plane.practice_worker_switch`. **Open:** `ended_at IS NULL`. **Current:** open and `started_at <= now < expires_at` by the database clock. **Unclosed:** open and no longer current. **Acting:** the session is live, its company is marked, it has a current switch, and every lookup-time condition of Migration item 12 holds; the merged lookup then names the worker. **Window:** exactly 30 minutes from `started_at`, fixed in the migration (coordinator Q4).
- **The one public answer for an ended session:** for a never-issued, a cap-expired, a revoked and a home-ended session value alike, every route of this piece answers `UNAUTHENTICATED`, decided BEFORE anything else is read, with or without an open switch (merged test [PH7], `contractor-practice-session.integration.test.ts:84-88`, is the rule this follows).
- **Caller-only refusal:** `SWITCH_FORBIDDEN` (the session's company is not a made-up practice company, its own member is not that company's owner, or the company's marker names another session row or owner) and `SWITCH_OPEN` (the session already has an open switch, current or unclosed). Both depend only on the caller and take precedence over the target's answer, so they are identical for every target id. **Target refusal:** `NOT_FOUND`, one and the same for every reason a target is not a made-up site worker of this company: unknown id, another company's member, wrong role, revoked, a wider grant, a sign-in identity, the owner.
- **Authority fields (never accepted from a request):** `tenantId`, `tenant_id`, `requested_tenant_id`, `membershipId`, `workerMembershipId`, `targetMembershipId`, `ownerMembershipId`, `actorMembershipId`, `identityUserId`, `sessionId`, `session`, `sessionRef`, `digest`, `sessionDigest`, `role`, `grantId`, `environment`, `marker`, `markedAt`, `startedAt`, `expiresAt`, `endedAt`, `minutes`, `window`, `reason`, `switchId`.
- **Nothing written:** no new row in `control_plane.practice_worker_switch` or `control_plane.practice_company_marker`, no change to any row of either, no change to any session row, and no `practice.worker_switch.started` or `practice.worker_switch.ended` audit event. The one row a refusal may add is its own `practice.worker_switch.refused` audit event.
- **Replay:** the same command id from the same session with the same target returns the stored facts and writes nothing; it never re-opens or lengthens a switch. **Conflict (`COMMAND_CONFLICT`, 409):** a command id already used by another session, for another target, or for the other command; two uses of one command id are decided one after the other whichever sessions send them (the per-command lock, Migration items 5 and 6). A replayed answer is the STORED first answer, not a statement about now: only the state route says what the session is now.

Decision 39 updates the target and grant allowlist to the four roles above. These
are still the member's persisted grants, including their existing scope and
client restrictions. Switch audit events attribute the change to the persisted
owner. There is no new authority supplied by the request.

## Callable contract and ENT-11a handoff

`createPracticeWorkerSwitchApplication({ pool })` supplies:

- `start({ version: "contractor-principal.v1", sessionId }, workerId, raw)`.
- `end(principal, raw)`.
- `read(principal)`.

The principal comes from the existing `jg_session` cookie. ENT-11a calls
`POST /api/contractor/practice/workers/{membershipId}/acting-as` to switch to each
of the existing operative, surveyor, supervisor and client_approver memberships.
The body is exactly `{ version: "practice-worker-switch-on.v1", commandId: uuid }`.
Call `POST /api/contractor/practice/acting-as/end` with exactly
`{ version: "practice-worker-switch-off.v1", commandId: uuid }` before selecting
a different member. `GET /api/contractor/practice/acting-as` reads current state.
Nest exposes the same paths without `/api`, its normal configured prefix.

Every success is HTTP 200, with `cache-control: no-store` and no cookie write:

```ts
{
 version: "practice-worker-switch-state.v1";
 environment: "synthetic_demo";
 realExternalActions: 0;
 state: "owner" | "acting" | "unclosed";
 switchId: string | null;
 workerMembershipId: string | null;
 startedAt: string | null;
 expiresAt: string | null;
 endedAt: string | null;
 endReason: "switched_back" | "expired" | null;
}
```

All properties are required. Non-null times use UTC text with six fractional
digits. Start returns `acting`, switch/worker IDs and start/expiry times; end
returns `owner`, switch/worker IDs and end facts. Read returns current state and
any open switch's start facts. Internal owner, session reference and marker facts
are strictly parsed, used only for audit and never returned. Unexpected routine
facts or database diagnostics become `SWITCH_UNAVAILABLE`. Unknown keys in a
command are refused, including every authority field in the definitions.

| Closed failure | Status |
| --- | --- |
| UNAUTHENTICATED | 401 |
| MODE_FORBIDDEN, ORIGIN_FORBIDDEN, SWITCH_FORBIDDEN | 403 |
| INVALID_COMMAND | 400 |
| NOT_FOUND | 404 |
| SWITCH_OPEN, NOT_ACTING, COMMAND_CONFLICT | 409 |
| SWITCH_UNAVAILABLE | 503 |

The failure body contains only `version: "practice-worker-switch-error.v1"` and
`code`. The POST origin check precedes the application. Mode is checked before
pool creation in Next and before database access in the application. Then the
persisted session is resolved before body/path validation. The bridge is called
unchanged once per application request. No global guard or filter is changed.
The existing Nest guard returns its own 401 before the controller in non-demo
modes and with no cookie; malformed JSON receives the framework's 400. That is
an explicit partial PW19 transport assertion, not a new guard exemption.

## Database rules and objects

The company rule is written once in `app.practice_company_made_up(uuid)`. It
checks mode, session row number, transaction tenant, active owner with organisation
management, then all company sign-in roots, in that order. The target rule is
written once in `app.practice_worker_switch_decision(uuid,uuid)`: company first,
then a different active same-company member of the four authorized roles, without
an unrevoked grant outside those roles or a sign-in address, locator or session.
A client remains restricted by the existing client-bound grant routines.

The marker is acquired only by a first successful start. It is permanent. Both
new tables are private identity/control-plane exceptions without RLS: the runtime
has no privilege, and authentication must read them before a company is known.
They reference the existing hardened session by its row number. Their full
schema, constraints, indexes and triggers are in migration 0165. No existing row
is migrated or backfilled.

| Routine | Language/security | Runtime execute |
| --- | --- | --- |
| practice_company_made_up(uuid) | plpgsql stable invoker | no |
| practice_worker_switch_decision(uuid,uuid) | plpgsql stable invoker | no |
| practice_worker_switch_on(uuid,uuid,uuid) | plpgsql volatile definer | yes |
| practice_worker_switch_off(uuid,uuid) | plpgsql volatile definer | yes |
| practice_worker_switch_state(uuid) | plpgsql volatile definer | yes |
| practice_company_marker_guard() | plpgsql invoker trigger | no |
| practice_worker_switch_guard() | plpgsql invoker trigger | no |
| practice_worker_switch_require_audit() | plpgsql invoker trigger | no |
| practice_company_refuse_sign_in() | plpgsql definer trigger | no |
| practice_worker_refuse_wider_grant() | plpgsql definer trigger | no |

Every routine is in `app`, owned by `jobguard_migration`, with
`search_path=pg_catalog`. PUBLIC and infrastructure execute are revoked. Exactly
three grants are introduced, EXECUTE on on/off/state to `jobguard_runtime`.
Each callable routine derives authority from the persisted live session and
checks its tenant against the transaction setting. No runtime table privileges
are added. The five refusal triggers added to existing tables are
`made_up_company_no_sign_in` on locator, invitation, SSO connection and sign-in
address, and `made_up_worker_no_wider_grant` on role_grant. New-table guards apply
to their owner too, including true database-clock time bounds and immutable ends.
The end-column CHECK additionally requires a non-null end reason to close SQL's
NULL CHECK case.

## Transactions, audit, replay and lookup

On/off lock in this order: shared tenant key 54; exclusive session-reference key
16501; exclusive command key 16502; inserts or the one end update; final audit-head
lock and append. Existing session foreign-key locks precede the audit head, as in
the hardened revoke path. No network call is made. State and lookup take no lock.
A cross-session command reuse conflicts. A replay returns the original stored
facts and never opens, closes or lengthens another switch. An open expired switch
must be explicitly ended. An old end replay cannot end a newer switch.

Started and ended events use `practice.worker_switch.started` and
`practice.worker_switch.ended`, the switch as subject, and the persisted owner
as actor. The session field is its row number. A deferred constraint requires the
event at commit; a failed append or commit rolls back the marker and switch too.
Refused company/target attempts append `practice.worker_switch.refused` in a
separate transaction, at most one per command and reason. A foreign target is
omitted; failure to record a refusal does not change the refusal.

The lookup calls the hardened live helper, never its copied logic. It sets no
setting and names no row-secured table. Existing callers send one authentication
statement outside a transaction; `withTenant` uses READ COMMITTED. A fresh lookup
after a committed end sees the end. Other isolation levels never receive a worker.
Actual database clock readings decide the window.

| Session/helper | Switch join | Answer |
| --- | --- | --- |
| not live, other database, never issued | any | no row |
| live | any missing, invalid or ended condition | original owner |
| live | every marker, identity, tenant, time and isolation condition passes | worker in original company |

An error in the helper fails the lookup; it does not return the owner.

Old hardened body:

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;
```

New body (unchanged from the issued item 12):

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id, coalesce(a.worker_membership_id,l.membership_id), coalesce(a.worker_identity_user_id,l.identity_user_id) FROM app.contractor_practice_session_live(s) l LEFT JOIN (control_plane.practice_worker_switch a JOIN control_plane.practice_company_marker k ON k.tenant_id=a.tenant_id AND k.session_ref=a.session_ref AND k.owner_membership_id=a.owner_membership_id AND k.environment='synthetic_demo') ON a.session_ref=l.session_ref AND a.tenant_id=l.tenant_id AND a.owner_membership_id=l.membership_id AND k.owner_identity_user_id=l.identity_user_id AND a.environment='synthetic_demo' AND a.ended_at IS NULL AND a.started_at<=clock_timestamp() AND a.expires_at>clock_timestamp() AND current_database()='jobguard_synthetic_demo' AND current_setting('transaction_isolation')='read committed' AND NOT EXISTS(SELECT 1 FROM identity.membership_locator ml WHERE ml.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.invitation iv WHERE iv.tenant_id=l.tenant_id) AND NOT EXISTS(SELECT 1 FROM identity.user_email ue WHERE ue.user_id IN(l.identity_user_id,a.worker_identity_user_id)) AND NOT EXISTS(SELECT 1 FROM identity.session rs WHERE rs.user_id IN(l.identity_user_id,a.worker_identity_user_id)) $$;
```

## Attach paths on the issued main

| Path | Set-side / attach-side / lookup-side |
| --- | --- |
| P1 signup | new company's locator; never selects an existing marked company |
| P2 invitation issue | invitation exists / invitation trigger / invitation probe |
| P3 invitation accept | locator or invitation / locator INSERT and UPDATE triggers / both probes |
| P4 connection create | connection exists / connection trigger / subsequent locator, address or session probes |
| P5 connection dependants | same connection foreign keys / P4 / subsequent sign-in roots |
| P6 first SSO sign-in | connection, address and locator / P4 or locator trigger / locator probe |
| P7 address on existing user | any membership's address / owner and ever-acted-as address trigger / owner and worker address probe |
| P8 real sign-in session | any membership's session / roots above / owner and worker session probe |
| P9 emergency access | locator and connection roots / those roots / locator and session probes |
| P10 SCIM | needs connection, removes access / no new attach / no grant created |
| P11 email-code signin | existing address and locator / those roots / corresponding probes |
| P12 existing SSO member | connection, address and session / connection root / owner/worker address and session probes |
| P13 owner operator tools | no existing-company sign-in writer on this base; inspection evidence, no source pin |
| P14 hand writes | company rule / trigger unless deliberately disabled / readable roots rechecked |
| P15 direct real session | company rule / no session trigger / owner and worker session probe |
| P16 0143 emergency window creation | existing locator/connection / existing root triggers / locator and session probes |
| P17 0143 emergency approval now enabled | existing locator/connection / existing root triggers / corresponding probes |
| P18 0143 replacement emergency-use routine | current_memberships locator / existing root triggers / locator and session probes |
| P19 0150 user_email insert | address / address trigger / owner or worker address probe |
| P20 0150 signup locator insert | locator / locator trigger / tenant locator probe |
| P21 0150 locator repoint | locator / locator UPDATE trigger / tenant locator probe |
| P22 0150 invitation locator insert | invitation/locator / their triggers / both probes |
| P23 0150 invitation accepted update | invitation already exists / cannot issue on marked company / invitation probe |
| P24 0150 invitation create | invitation / invitation trigger / invitation probe |

P16 onward are the nine extra paths from the continuation's S1 ruling. They need
no new table or trigger because they use these existing roots. Each has its own
PW31 test title. Direct lookup-root controls disable only user triggers, commit
the row, and check that the current switch is no longer honoured; they do not
claim to execute every complete identity workflow. Full product-path verification
of these paths remains part of the database review/run gate.

## Proof scope and limitations

Layer A proves database foreign keys, CHECKs, guards, ACLs and deferred audit.
Layer B tests mode and database-name refusals independently. Layer C tries other
sessions, targets, contexts, authority fields, later sign-in roots and wider grants.
The upgrade proof snapshots named columns and full types using the merged helper,
compares original identities only, checks its own migration alone, then permits
later additions and runs migrations twice. Its rolled-back controls include a
microsecond change, retype, nullable addition, function replacement and later insert.
These tests are written; database execution is NOT RUN in this sandbox.

The following sixteen limits remain explicit:

1. A request authenticated immediately before an end may finish with its already-resolved member.
2. Revocations remove permissions through existing commands; lookup does not re-evaluate the row-secured role tables.
3. The target need not have a job assignment; job access still checks assignments and scope.
4. Later business audit events use the worker; per-action switch attribution is a separate piece.
5. An ended session may leave an inert open switch with no synthetic end event.
6. A privileged database owner can disable triggers or rewrite the database; this is not protection against that owner.
7. A hand-written sign-in fact on another office member after marking is outside the owner/worker lookup probes; the next start rechecks every company member. An SSO connection deliberately written with triggers off is row-secured and cannot be seen at lookup.
8. Markers and acted-as identity address refusal persist after ending.
9. A future identity writer must extend the three checks and its tests when it introduces a new root.
10. All hardened session limits carry over unchanged; the helper is the session authority.
11. Application actor lookup and bridge lookup are two reads; the company remains identical on either side of a switch.
12. A privileged hand-written sign-in row may race marker acquisition; readable roots are checked at the next lookup.
13. A hand-built company with no sign-in rows and an owner-written practice session is treated as made-up. There is no protected origin record (QI no).
14. Lookup identity probes scan the existing small synthetic tables; no existing-table index is added.
15. A non-READ-COMMITTED caller receives the owner, while the hardened helper retains its separately documented isolation limit.
16. Replay facts are historical. Only read answers what the session is now.

## Rollback and held work

First restore the hardened lookup:

```sql
CREATE OR REPLACE FUNCTION app.contractor_session(s uuid) RETURNS TABLE(tenant_id uuid,membership_id uuid,identity_user_id uuid) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT l.tenant_id,l.membership_id,l.identity_user_id FROM app.contractor_practice_session_live(s) l $$;
```

No session is then acting, but the routes can still record switches and mark
companies; state calls report `unclosed`. Separately disable starting:

```sql
REVOKE EXECUTE ON FUNCTION app.practice_worker_switch_on(uuid,uuid,uuid) FROM jobguard_runtime;
```

Switch-on then returns unavailable; end/state retain their grants. Neither
statement removes records, markers, guards or refusal triggers. Removal of those
refusals would be five separate DROP TRIGGER statements and is not authorized or
performed here. Their names and tables are specified above.

HELD: screens and browser journey (ENT-11a rework); PW-F1 follow-up (QL no); direct
worker-to-worker switching; renewal; new seeds; automatic closing on session-end
or sign-in attachment; marker removal; session issuance changes; protected origin
record (QI no); indexes on existing identity tables; per-action switch attribution;
all real data, provider, pilot, billing, deployment and release work. Independent
RED verdicts, separate acceptance, and dispatcher PostgreSQL execution are required.

## Issued upgrade rule

**Upgrade proofs (coordinator, 11 Oct ~23:27, after MIG-ORDER-1, 2 and 3 all repaired the same over-strict shape after merge).** Every order that carries a migration includes this paragraph verbatim, and the reviewer of any piece with an upgrade proof checks the proof against it: "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no column or replace no function; the fingerprinted-table guard owns 'may never gain a column'." A proof found with the old shape (whole rows or every function compared after ALL later migrations) is fixed in its own piece before that piece merges. **Compare canonical text, never driver-parsed values:** the named-column comparison selects `row_to_json(t)::text` over a sub-select of exactly the named pre-existing columns (as `recovery-follow-up-upgrade.integration.test.ts:95` does), because the driver rounds timestamps to the millisecond and a parsed comparison would let a sub-millisecond change pass (found by the Opus reviewer on #139's reshape, 11 Oct 23:50). **Names AND full types:** also snapshot each pre-existing column's `format_type(atttypid, atttypmod)` and require the same name-and-type list after all migrations (Sol on #139, 23:53). **Every reshaped or new proof carries rolled-back controls using the same comparison code:** a one-microsecond change to a stored time and a retype of a pre-existing column must FAIL it; an added nullable column and a replaced function after N's step must PASS; and a guard asserts at least one pre-existing row per compared table. **Rows are matched by identity:** capture the primary keys of the rows that exist before N and, after all later migrations, compare only those rows (every one still present and unchanged); a row ADDED by a later migration (for example its own audit event) is ignored, and a control proves a later insert leaves the proof passing (Sol on #142, 12 Oct 00:08).
