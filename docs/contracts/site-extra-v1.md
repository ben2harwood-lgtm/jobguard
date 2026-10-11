# ENT-3a — site extra v1

Issued 11 October 2026. Founder: “Use that default”, card
`jobguard-ent4b-who-records-extras-2026-10-11`. The integrator interprets “site
staff” as operative and supervisor. The exact merged names map “surveyors” to
`surveyor`, “commercial managers” to `commercial_manager`, “admins” to `admin`,
and “owners” to `owner`. This authority supersedes the older raising rows in
BUILD_PLAN §9.1.4 for this governed path; the integrator owns the plan amendment
and a separate pure-core alignment. This leaf never calls `transitionExtra`.

## Definitions

- **Work-order job:** a row of `app.job` with `provenance='work_order'`, bound in
  `app.job_commercial_track` with `job_track='contractor'` and
  `environment='synthetic_demo'`, having one `app.work_order` row.
- **Current revision; “the baseline in force”:** the `app.work_order_revision`
  named by `app.work_order_current` for that order when the command commits.
  Merged ENT-4b writes it to `extra_origin.work_order_revision_id`; this leaf
  never supplies it.
- **Cancelled order:** a work order whose current revision has
  `status='cancelled'`.
- **Extra:** a row of `app.variation` on a work-order job with exactly one
  `app.extra_origin` row, written only by merged `ExtraRepository.raiseExtra`.
- **Kind; command type:** kind is the origin kind; merged SH-1
  `app.validate_extra_origin` maps `LogSiteExtra` to `site_user` (site extra),
  `RecordOfficeExtra` to `office_entry` (office extra), and
  `RecordClientInstruction` to `client_instruction` (client-instructed extra).
  The fourth raising type, `ConfirmPrompt`, is HELD to ENT-8a and refused for
  everyone here.
- **The caller; the member:** the result of merged
  `ContractorRepository.resolveSession(sessionId)` for the `jg_session` cookie:
  tenant, membership and identity user from the database's `app.contractor_session`
  lookup. Body, path, query and other headers select none of them.
- **The caller's role:** `role` on that member's own `app.membership` row. SH-1
  forces `extra_origin.raising_role` to match it, and ENT-4b forces the raising
  grant's role to match it. An extra grant of a different role does not confer
  that role under this rule.
- **Active member:** merged `app.contractor_member_active(membershipId)` is true:
  contractor track and role, not revoked or expired.
- **“Site staff”:** `operative` and `supervisor`, the two merged ENT-1 roles with
  `extra.log`.
- **Permission holds for the job:** merged
  `app.contractor_job_allowed(member,permission,job)` is true. This is the
  authority for tenant/team/branch/region scope, revocation, activity and, for an
  operative grant, assignment and active job-team membership. It is called,
  not reimplemented.
- **Named on the job:** merged `app.contractor_job_assigned(member,job)` is true:
  a `job_assignment` row on the current revision.
- **The rule:** the founder's default is the table below; all unlisted pairs
  refuse.
- **Raising grant:** the lowest `id` among unrevoked `app.role_grant` rows owned by
  this member, with the same role as their membership and scope of tenant,
  job team (`app.contractor_job_team`), that team's branch, or that branch's
  region. This is a lookup, not the decision. ENT-4b's insert trigger remains
  the structural scope judge; [A16] compares it with the lookup.
- **Decision routine:** `app.ent3a_extra_authority`. **Guard:**
  `app.ent3a_require_extra_authority`, inside the command transaction through
  ENT-4b's seam.
- **Governed path:** `SiteExtraRepository.logSiteExtra`: pre-check followed by
  merged `raiseExtra` with `siteExtraAuthoritySeam`. [A18] allows no other
  application-source caller of `raiseExtra`.
- **Caller-only refusal:** `EXTRA_FORBIDDEN`, 403: inactive member or role not
  permitted for this kind. Depends only on member and command type; identical
  error for every real or unknown job ID.
- **Job refusal:** `NOT_FOUND`, 404: role may record this kind, but the target
  is unknown, another tenant's, not a work-order job, cancelled, lacks a current
  revision, outside permission scope, an operative is not named, or no raising
  grant exists. Every cause has the same code, status and body.
- **Nothing written:** no new row in `app.command_receipt`, `app.scope_identity`,
  `app.scope_lineage`, `app.variation`, `app.extra_origin`, `app.extra_event`,
  `app.extra_duplicate_link`, and no `contractor.extra.raised` audit. A refusal
  may add its own `contractor.extra.refused` audit event only.
- **Replay:** same command ID/payload/member, with the same selected grant,
  returns the first result with no additional writes. Authority is pre-checked
  again, so an already-revoked member or grant cannot replay successfully.
- **Conflict:** `COMMAND_CONFLICT`, 409: command ID reused with different
  payload, member or selected grant. Grant replacement changes the merged
  request hash even when the note is unchanged (issued Q11).
- **Authority fields:** `commandType`, `actorMembershipId`, `membershipId`,
  `grantId`, `tenantId`, `requested_tenant_id`, `role`, `raisingRole`, `origin`,
  `kind`, `jobTrack`, `track`, `serverRecordedAt`, `time`, `state`,
  `raiserAssigned`, `workOrderId`, `workOrderRevisionId`, `originHash`,
  `environment`, `provenance`. None may appear in the request; the strict schema
  refuses each. Stored facts come from the session or database.
- **Synthetic only:** `JOBGUARD_ENV==='synthetic_demo'`, database
  `jobguard_synthetic_demo`, `.invalid` addresses, fictional text, outbound
  attempts zero. No real contractor, resident or client data.

## Rule as built

| Command (kind) | Membership role | Merged job permission | Also required |
|---|---|---|---|
| LogSiteExtra (site) | operative | extra.log | named on job |
| LogSiteExtra (site) | supervisor | extra.log | — |
| LogSiteExtra (site) | surveyor | job.read | — |
| RecordOfficeExtra (office) | owner, admin | organisation.manage | — |
| RecordOfficeExtra (office) | finance | data.import | — |
| RecordClientInstruction (client-instructed) | owner, admin, commercial_manager | contract.manage | — |
| Other command or role (including read_only, client_approver) | — | refused | — |

Only the decision routine implements these authority rows. The existing
permission table is unchanged. Surveyors have no merged `extra.log` permission;
the founder-named surveyor row therefore uses scoped `job.read`.

## Versioned transport

Nest: `POST /contractor/jobs/:id/site-extras`. Next:
`POST /api/contractor/jobs/[id]/site-extras`. Both call the same application through
`createWorkspaceApplication`; the Next adapter imports `server-only`. Origin must
match server configuration, with no caller-controlled host authority. Responses
that reach the adapters are `Cache-Control: no-store`; success is HTTP 200.
**HELD transport requirement:** malformed JSON on the Nest HTTP surface is
parsed before the controller. The untouched Nest global parser/error handler
returns its generic 400 envelope without this controller's no-store header.
Next malformed JSON returns the required typed INVALID_COMMAND and no-store.
Fixing Nest's pre-controller envelope requires an additional global filter/parser
registration, beyond the issued one-controller registration in app.module.ts;
this leaf does not add it. A15 is therefore partial, not fully satisfied.

`log-site-extra.v1` is strict `{version,commandId,note,description}`: command ID
is UUID; note is 1–5000 characters containing non-whitespace; description is
1–500 characters containing non-whitespace. Text is preserved, not trimmed.
The path supplies job ID, never the body. Unknown fields, prices, SoR, visits,
evidence, resident confirmation, client capture, device and client time fields
are refused. Next malformed JSON and service-level invalid bodies are
`INVALID_COMMAND`; Nest pre-controller malformed JSON is HELD as above.

`site-extra-logged.v1` is strict
`{version,environment:'synthetic_demo',realExternalActions:0,jobId,extraId,state:'logged'}`.
`state` reflects the persisted logged event, not the mutable `variation.state`
cache; no first priced revision is written. `site-extra-error.v1` is strict
`{version,code}` with this closed mapping:

| Code | HTTP |
|---|---|
| UNAUTHENTICATED | 401 |
| MODE_FORBIDDEN, ORIGIN_FORBIDDEN, TRACK_FORBIDDEN, EXTRA_FORBIDDEN | 403 |
| INVALID_COMMAND | 400 |
| NOT_FOUND | 404 |
| COMMAND_CONFLICT, STALE_REVISION | 409 |
| SITE_EXTRA_UNAVAILABLE | 503 |

Mode refuses before database access. Session schema and persisted lookup precede
body validation in the service. Invalid path UUID returns the same NOT_FOUND as
an unknown job. Only `contextForContractorSession` obtains a context: an inert
AuthProvider adapts the database session result to the one real
`resolveVerifiedTenantContext` bridge. It neither constructs nor retains a
context. Its inert `read_only` role has no effect on authority. No pinned file or
boundary scanner is changed.

This is a **second copy of the ENT-10b adapter pattern**. Per the coordinator's
11 October ruling it **may not merge** until a separate reviewed shared bridge
exists and `contextForContractorSession` is switched to it. That bridge and any
scanner authorization are outside this lane.

## Routines and transaction

Exactly two new routines, schema-qualified, migration-owned, invoker only:

```sql
app.ent3a_extra_authority(p_actor uuid, p_command_type text, p_job uuid)
RETURNS TABLE(decision text, reason_code text, raising_grant uuid)
app.ent3a_require_extra_authority(p_job uuid, p_variation uuid) RETURNS void
ALTER FUNCTION app.ent3a_extra_authority(uuid,text,uuid) OWNER TO jobguard_migration;
ALTER FUNCTION app.ent3a_require_extra_authority(uuid,uuid) OWNER TO jobguard_migration;
REVOKE ALL ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) FROM PUBLIC,jobguard_infrastructure;
GRANT EXECUTE ON FUNCTION app.ent3a_extra_authority(uuid,text,uuid),app.ent3a_require_extra_authority(uuid,uuid) TO jobguard_runtime;
```

Both use PL/pgSQL, SECURITY INVOKER and `SET search_path=pg_catalog`.
The STABLE decision takes no lock and writes nothing; exactly one row even for
NULLs or absent, empty or malformed tenant setting. Ordered checks: tenant/member
active; permitted command type; membership role; in-tenant work-order job/current
non-cancelled revision; merged job permission and required assignment; raising
grant. Failed member returns `member_inactive`; command returns
`command_type_not_permitted`; role returns `role_not_permitted`; all job failures
return `job_out_of_scope`. Grant is non-null exactly for `allowed`.

The VOLATILE guard takes
`pg_advisory_xact_lock_shared(hashtextextended(tenant::text,54))` before reading the
stored origin. Administration takes that tenant lock exclusively. It judges
stored member/type/contractor track/command provenance and exact selected grant;
any failure is precisely `NOT_FOUND` / P0002. The seam invokes only this guard.
ENT-4b owns receipt, scope, variation, origin, event, raised audit and commit.
No new business lock follows its audit append.

Repository pre-check calls merged `assertContractorGate(...,'member')` and the
decision. An unexpected/missing/NULL answer fails closed. If ENT-4b returns
NOT_FOUND or INVALID_ORIGIN after pre-check, a fresh pre-check returns the current
refusal or STALE_REVISION if authority now allows. INVALID_COMMAND,
COMMAND_CONFLICT and STALE_REVISION retain names; invalid context becomes
NOT_FOUND; unknown errors become SITE_EXTRA_UNAVAILABLE. PostgreSQL messages,
detail, arguments and free text never enter public errors.

## Refusal audit

After rollback, separately append via `appendAuditBatch` for TRACK_FORBIDDEN,
EXTRA_FORBIDDEN and NOT_FOUND from the repository. ID is
`derivedUuid('extra-refusal:'+tenant+':'+commandId+':'+reason)` (UUIDs canonicalized
to lower case in the derivation so equivalent spellings coalesce); an advisory lock on
that ID serializes existence-check and append, so repeated/concurrent refusals
produce at most one event per command/reason. No command receipt is created.

Event: `contractor.extra.refused`, subject type `extra-command`, subject ref
command ID. Actor ref is `membership:<id>` only if that membership/identity user
exists in this tenant, otherwise `security:unverified-member`.
Payload: `{references:{command,command_type,reason,environment:'synthetic_demo'},
classifications:{action:'security'}}`, plus `references.job` only if that job is
visible in this tenant. No note or description. Validation errors, conflicts,
replays and unauthenticated requests create no refusal audit. If refusal audit
fails, the original typed refusal/status still returns (issued Q14); this leaf
adds no logging or operational alert for that failure.

## Limits and held work

Q5: the new role rule binds the governed path, **not every database writer**.
ENT-4b structural triggers remain unchanged. Its older synthetic fixtures can
still log as owner directly; a separate reviewed fixture alignment and
subsequent table-level guard are owed. [A18] forbids application bypasses.

Q10: **no signed-in person can reach this route's success path in today's practice
sandbox**: only owner sessions exist, and owners may not log site extras.
Success is implemented through the governed database path and stubbed-session
service tests. PostgreSQL tests remain NOT RUN here. Operative sign-in/switching
requires the separate founder F2 ruling.

HELD: screens and browser journey (UI parked; ENT-3e); visits and immutable
close-out answer (3b); order check, SoR, quantities, pricing, first revision (3c,
Q13; existing revision requires price, pricing basis undecided); photo and
resident confirmation (3d); state rules/submission/variation.state (ENT-5);
ConfirmPrompt (ENT-8a); linking/unlinking (ENT-4c, ENT-5); office/client raising
routes (Q7, later order unnamed); fees (ENT-7; founder F1 and D16 unresolved).
No AI prompt/parser/gateway change, money or commercial external action.

Remaining release gates: D16, G1, ENT-14 and UI; two independent RED verdicts
(fresh Claude Opus and separate Codex Sol) bound to a committed head, separate
acceptance, real PostgreSQL suites and the shared bridge merge hold. Builder
receipt only — not independently verified, not accepted.
