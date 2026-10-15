# Practice role switch v1 — partial boundary build

Status: only the pure public schemas exist. There is no switch migration, repository, application, route or demo control in this change. This document does not authorize an acting session. The issued base-check-6 STOP holds those parts; see the builder receipt.

The 15 October decision 39 header supersedes the draft's two-role restriction. The intended practice flow lets the signed-in tester act as the made-up operative, surveyor, supervisor and client, with attribution to the tester who really acted. The existing contractor role for a client is `client_approver` (`BUILD_PLAN.md` §9.1.2). No role-selection policy is implemented by these schemas. The database and the current grants must decide authority in the eventual implementation.

## Implemented boundaries

`practiceWorkerSwitchOnV1` accepts exactly `{ version: "practice-worker-switch-on.v1", commandId: uuid }`. `practiceWorkerSwitchOffV1` accepts exactly `{ version: "practice-worker-switch-off.v1", commandId: uuid }`. Both refuse unknown keys. The eventual target comes only from the route path, and a body cannot select a tenant, actor, session, role, time, marker or window.

`practiceWorkerSwitchStateV1` accepts exactly:

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

Identifiers must be UUIDs; non-null timestamps must be UTC ISO timestamps with six fractional digits. All fields are required, including nullable fields. There are no row numbers, session values, digests, tenant IDs, identity-user IDs, email addresses or markers in this public shape. Shape validation is not a substitute for a database state-transition check.

`practiceWorkerSwitchFailureV1` accepts exactly the version `practice-worker-switch-error.v1` and a code from this list. `PracticeWorkerSwitchError` contains that code as its message and a typed `code` property. `practiceWorkerSwitchHttpStatus` supplies the mapping; no transport is implemented here.

| Code | HTTP status |
|---|---|
| UNAUTHENTICATED | 401 |
| MODE_FORBIDDEN | 403 |
| ORIGIN_FORBIDDEN | 403 |
| SWITCH_FORBIDDEN | 403 |
| INVALID_COMMAND | 400 |
| NOT_FOUND | 404 |
| SWITCH_OPEN | 409 |
| NOT_ACTING | 409 |
| COMMAND_CONFLICT | 409 |
| SWITCH_UNAVAILABLE | 503 |

`PRACTICE_WORKER_SWITCH_WINDOW_MINUTES` is 30 for documentation. It does not enforce a deadline; an eventual database routine must do that.

## Terminology and prerequisites for the held implementation

Session value, digest, row number, live, expired, revoked, ended and never issued retain the definitions in `contractor-practice-session-v1.md`. A session reference is a row number, never a session value; it may be an audit reference and must never be a response field. The session's own member is the persisted generated owner; switching must never alter that session row.

The draft's made-up-company rule requires the synthetic database name, a session row bound to the transaction's tenant setting, the active owner with organisation-management permission, and no sign-in roots for the company or any member. A permanent marker would be acquired only at the first successful switch. The full list of roots must first be reconciled against migrations 0143 and 0150 on the issued base; this document does not assert that the old path list is complete.

The old draft's target rule allows only operative and supervisor memberships with only those grants. That rule must be revised under decision 39 for the four chosen roles, including the corresponding grant guard. These are approved product directions, not questions being reopened here. No replacement authorization rule has been added in this partial build.

An eventual switch would be open when `ended_at` is null, current inside its database-clock window, and unclosed when open but no longer current. Acting would additionally require the live helper and every lookup condition. An ended session must be nobody. Replays must return the original stored facts without renewing a window; command IDs reused across sessions, targets or commands must conflict. These persistence properties remain unimplemented and unverified here.

## Held route contract and ENT-11a handoff

These are the draft's intended routes, **not callable endpoints in this change**:

| Method | Path | Input |
|---|---|---|
| POST | `/api/contractor/practice/workers/[workerId]/acting-as` | switch-on command |
| POST | `/api/contractor/practice/acting-as/end` | switch-off command |
| GET | `/api/contractor/practice/acting-as` | none |

ENT-11a's journey must eventually call the first route with the made-up person's persisted membership ID, end via the second before selecting another person, and read the third for current state. There is no exported application factory to call yet. Do not substitute an in-memory member object or fabricate a success response. The chosen four-role Northside flow and its CI browser specification remain blocked pending the path-list prerequisite and exact lane paths; browsers must run only in CI. The supplied 29-entry lane has no e2e, page or component path.

## Security design remaining unbuilt

Migration 0165 is reserved but absent. No table, routine, index, constraint, trigger, grant or audit event is added by this change. In particular, the runtime role gets no new privilege, and no session deadline or existing lookup changes.

The held draft proposes two control-plane exceptions (`practice_company_marker` and `practice_worker_switch`) with no runtime table access, ten routines, the existing SQL lookup replacement, four sign-in-refusal triggers and one grant-refusal trigger. It requires tenant, session-row and command advisory locks in that order, then the audit append as the final write. Its three externally callable routines must derive the actor from the persisted live session. The eventual role/grant rules must reflect decision 39. None of this is proved by schema tests.

The held proof layers are the database constraints and guards (A), mode/database-name refusal (B), and negative boundary controls (C). The differential, upgrade, canonical-row, race, audit, privilege and rollback proofs all remain required. The original path P9 claim that an emergency approval is impossible no longer describes the issued base: 0143 removes that constraint and implements owner-approved windows. Migration 0150 also replaces the sign-up, invitation and membership routines. Main wins.

## Limits carried from the draft, pending implementation

These are design limits, not verified properties of a shipped switch:

1. A request already past session resolution can finish as the member it resolved. The eventual grant guard must cover the four authorized roles.
2. Lookup before tenant resolution cannot inspect row-secured membership, grant, track or SSO tables; individual commands must recheck authority.
3. Passive switch expiry would not create an ended event.
4. The draft links the real actor through switch events only. Decision 39's requirement to record who really acted must be covered in the completed implementation and CI journey.
5. Ending a session would leave its open switch row inert rather than end it.
6. The database owner and a superuser can disable user triggers; the remaining constraints and lookup conditions have a limited boundary.
7. The draft's sign-in probes do not cover a later hand-written address or real session for another office member.
8. The proposed marker and restrictions on sign-in would be permanent in the synthetic demo.
9. Every new sign-in path must be included in the company rule, refusal trigger and lookup review. The issued STOP applies here.
10. HARDEN-1's session limits carry over; this partial build adds no storage of a session value or digest.
11. The application's session lookup and the bridge lookup can observe different switch states while proving the same company.
12. Marker acquisition and privileged hand-written identity rows would not be serialized against each other by the proposed locks.
13. A company built by the table owner in the generator's shape cannot be distinguished from a generated company solely by a session row. QI is no; no origin record is built.
14. The proposed lookup would scan some small synthetic identity tables; indexes on existing tables are held.
15. The proposed switch lookup would act only in READ COMMITTED; HARDEN-1's helper has its own isolation limits. QK is yes.
16. A replayed result describes the stored first result. Only a state read describes the current session.

UI polish, direct person-to-person switching, window renewal, new seed people, automatic closure on session/identity changes, marker removal, real sign-in for a marked company, changes to HARDEN-1, identity-table indexes, and all production/provider work remain held. PW-F1 stays a separate follow-up (QL no). Decision 39 lifts the old hold on writing the CI browser journey, but neither running it here nor widening this lane is authorized.
