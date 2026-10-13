# Site visit start and complete, and the close-out answer (ENT-3b, server only)

Version `site-visit.v1`. Synthetic demo only; no screen (UI is parked); no price, photo or resident data.

## Definitions
- **Visit**: a row of `app.site_visit`. **Open**: `completed_at IS NULL`. **The caller's visit**: its `membership_id` is the caller's membership.
- **May visit**: role is `operative` or `supervisor`; `app.ent3a_extra_authority(member,'LogSiteExtra',job)` answers `allowed`; and `app.contractor_job_assigned(member,job)` is true. The rule lives once, in `app.ent3b_visit_authority`, which calls these and restates none of them. A surveyor, owner, admin, commercial manager, finance, read-only and client approver may not.
- **Refusals**: caller-only `VISIT_FORBIDDEN` (403; identical for every job id) and job `NOT_FOUND` (404; identical for an unknown job, another company's job, a non-work-order job, a cancelled order, a job out of scope, a job the caller is not named on, and a visit that is not the caller's own on that job).
- **Close-out question** `closeout-question.v1`: "Did the resident ask for anything extra?" Answer exactly `yes` or `no`. A "yes" with no extra logged is accepted (the prompt belongs to ENT-8a).
- **Server times**: `started_at` is the column default; `completed_at` and the answer's `server_recorded_at` are one `clock_timestamp()` reading inside the completing routine. No request value can set a time.

## Routes (Nest and thin Next, one service)
`POST /contractor/jobs/:id/site-visits/start` (201), `POST /contractor/jobs/:id/site-visits/:visitId/complete` (201), `GET /contractor/site/jobs` (200), `GET /contractor/jobs/:id/order-lines` (200). Documented 409 on both POSTs: `JOB_NOT_LIVE`, `IDEMPOTENCY_CONFLICT`. Every response `Cache-Control: no-store`; error bodies carry `version` (`site-visit-error.v1`) and `code` only. Both POSTs check `Origin`. Bodies: `start-site-visit.v1 {commandId}`, `complete-site-visit.v1 {commandId, closeoutAnswer}`; unknown keys refused; the job and visit come from the path. A body valid apart from a missing or null answer is `CLOSEOUT_ANSWER_REQUIRED` (400), any other invalid body `INVALID_COMMAND` (400).
Codes and statuses: UNAUTHENTICATED 401, MODE_FORBIDDEN 403, ORIGIN_FORBIDDEN 403, TRACK_FORBIDDEN 403, VISIT_FORBIDDEN 403, INVALID_COMMAND 400, CLOSEOUT_ANSWER_REQUIRED 400, NOT_FOUND 404, JOB_NOT_LIVE 409, IDEMPOTENCY_CONFLICT 409, VISIT_ALREADY_OPEN 422, VISIT_ALREADY_COMPLETED 422, SITE_VISIT_UNAVAILABLE 503.
Reads: `site-assigned-jobs.v1` (at most 200, `truncated`, the caller's own `openVisitId`) and `site-order-lines.v1` (current revision, by position). Neither carries a money, resident or address field.

## Database (migration 0139)
Table `app.closeout_answer` (one row per visit for ever; forced row security; runtime SELECT only; update and delete refused). Functions: `ent3b_visit_authority`, `ent3b_start_visit`, `ent3b_complete_visit` (the two writers, SECURITY DEFINER, `search_path=pg_catalog`), `ent3b_require_open_visit`, and the trigger functions `ent3b_closeout_guard` and `ent3b_require_closeout_audit`. One deferred trigger on `app.site_visit` makes a completed visit without exactly one matching answer (or an answered visit that is not completed) impossible to commit for every writer. Advisory lock keys: 3101 (tenant, job, member) and 3102 (tenant, visit); keys already in use were 0, 54, 55, 56, 126, 130 and 417; 54 is taken shared. Lock order of a command: live-job row share lock, command receipt, tenant lock 54 (shared), the visit lock, audit head last; the deferred triggers take no lock.
Each command is one tenant transaction: live guard first, receipt claim (a replay returns the stored result and writes nothing; a changed payload, job, visit or member conflicts), routine, one audit event (`contractor.visit.started` id = visit; `contractor.visit.completed` id = answer, identifiers only, never the answer value), receipt completed. A refusal writes only its own `contractor.visit.refused` event, once per command id and reason, and only for track, caller and job/visit refusals.

## Honest limits
1. Only the practice owner can hold a contractor session today and an owner may not visit, so no signed-in person reaches a success path (F2); proved through the repository and service with stubbed sessions.
2. The writers take the actor as a parameter, as `app.work_order_commit` does; the rule binds the governed path, not a raw client holding the runtime role.
3. The database does not itself require the start's audit event.
4. A member taken off the job or whose order is cancelled cannot complete an open visit; nothing here closes it.
5. The pre-check and the command are two transactions; the routine re-decides under the tenant lock.
6. Replay and the live guard: these routes are `pre_live_allowed` (coordinator ruling B-prime) and prove the replay properties in their own suite. FIX-LATER: extend the shared replay harness to contractor-track jobs and move these routes onto it.

HELD: all screens and browser journeys (ENT-3e); acting as a made-up site worker (F2); surveyor visits; order check, prices (ENT-3c); photo and resident confirmation (ENT-3d); the "yes with no extra" prompt (ENT-8a); close-out rates (ENT-9); offline capture; closing stale open visits; state rules (ENT-5); fees (ENT-7).
