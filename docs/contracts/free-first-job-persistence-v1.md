# MON-3-P-B fictional persistence v1

Issued 20 October 2026. Disabled synthetic foundation only; MON-3 remains incomplete.
No pricing-policy approval, release authority, customer data, network, collection or billing date is supplied.

Migration `0372_free_first_job_admission.sql` adds four immutable side tables. It changes no existing table or function.
`trial_business_verification` is one migration-owned fictional verified fixture per tenant, with source/version, independent verification time and available normalized company/phone facts. A phone alone is not sufficient trial identity. There is no runtime verification endpoint, browser verification flag, support override, identity replacement or merge. Fixture insertion by migration ownership is **not real business verification**.

`trial_card_attempt` stores a server-minted attempt bound by composite FK to that business verification, current owner and request command. `trial_card_result` stores one terminal simulated result per attempt, retaining the verification binding. Requested is represented by the attempt without a result. Redirect-only, failed, cancelled and outcome-unknown have no reference/fingerprint and cannot qualify. Only completed has both opaque `sim_ref_` and `sim_fp_` values. They are constructed by the migration-owned fixture writer from the stored attempt and one of two fictional instruments, never accepted from browser output. Instrument fingerprints remain stable across attempts and tenants; business identity still requires independent phone/company facts. No raw card data or hosted URL exists.

`app.mon3_request_card(tenant,digest,commandId,{version:'trial-card-request.v1'})` is runtime-callable. It reuses MON-1B's persisted synthetic session and SSO-aware membership bridge, and additionally requires an active owner. It takes tenant lock 184 and rechecks authority after waiting, including before receipt replay. It derives verification and attempt IDs from storage. The shared receipt namespace binds family, actor and canonical payload hash; changed payload/family/actor conflicts. Attempt, receipt and own `free_first_job.request_card` audit event commit together. No business lock follows audit-head allocation. Runtime has no direct table reads/writes.

`app.mon3_record_card_fixture(tenant,digest,resultId,{version:'trial-card-fixture.v1',attemptId,fixtureCard,outcome})` is migration-owned and has **no runtime EXECUTE grant**. It rechecks current owner/session even on replay; arbitrary/foreign attempts fail. It stores canonical actor/tenant/payload hash, so changing the scenario under the same result identity conflicts even if the noncompleted projection would be identical. Unknown outcomes are terminal nonqualifying facts in B: no blind retry, inferred completion or reconciliation authority. A new independently requested setup may create another attempt; this is not a charge or a retry of an external action. A future provider/reconciliation task requires its own authority and contracts.

`FreeFirstJobCardRepository.request` validates strict versioned input/output, UUID command and session digest, enters `withTenant`, and calls only the checked request function. Server environment must equal `synthetic_demo` before and after awaited SQL; a changed mode rolls back. Typed errors omit identity/constraint detail. The adapter produces a trusted fixture proposal referencing an attempt; a returned proposal alone never establishes card-on-file. No application module/controller/routes/OpenAPI or credential composition is added. The application port is unregistered; a future implementation must authenticate and strictly validate before performing the request, and the SQL remains the independent authority check.

## Disabled activation seam

`app.mon3_admit` authenticates current owner under the same tenant lock and **unconditionally raises `FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C` before every admission write**. It has no enabled argument, environment toggle, date override or administrative bypass. Even migration ownership cannot admit through it. `FreeFirstJobRepository.admit` and `DisabledFreeFirstJobActivationMutation` also refuse any unexpected successful return, rolling back. The existing practice facade does not select the mutation; it retains its existing policies and guarantees and does not become a trial route.

The unreachable SQL seam expresses the transaction composition for C to complete and review: require stored independently verified sufficient identity; inspect completed card results for that exact business; count distinct prior activations rather than small/shared-place meter counts; require a completed card before a distinct second activation; refuse legacy-policy conversion; delegate to unchanged `switch_job_live_v3` for owner/exact approved action, processing receipt, expected revision, accepted priced quote, acceptance and parties checks. First admission inserts A's exact snapshot using all available stored facts. A's existing insert trigger derives/claims **all** keys atomically; helpers remain private. The admission side row links verification, activation, optional first snapshot and command. No copied key algorithm or new helper grant exists. A collision or any later failure rolls back activation, snapshot, all claims and receipt through the surrounding command transaction.

The bounded mutation lock hook calls runtime-executable `mon3_owner(tenant,digest)` before receipt lookup, compares its actor to the command actor, and checks synthetic server mode again after awaiting. That helper authenticates the persisted session, takes tenant lock 184, and rechecks the current owner after waiting. This preserves session/owner checks even on dispatcher receipt replay and avoids receipt-before-tenant-lock inversions with card requests. It exposes no A helper or business identity data.

The dispatcher would own exact command receipt/replay and audit-last, but B cannot produce a successful mutation or successful activation audit. The unreachable body is source implementation only, **not successful admission evidence**. C must replace the hard stop and compose actual London deadline/end/conversion, successful receipt/audit results, and tests before any caller can use it. No elapsed-day preview timestamp is persisted as authority.

Core `admissionPrerequisites` consumes strict server-fact fixtures only and returns `awaiting_c`, never permission. No provisional unidentified skip exists: first-job skip needs independently sufficient identity (company, or verified phone plus completed card). A requested/redirected/failed/cancelled/unknown result is never a completed same-business card. Already active returns an existing-job prerequisite classification, not a new grant or actual command replay.

Acceptance: IDENTITY-01/LIVE-01/CARD-01/ATOMIC-01/AUTH-01/REPLAY-01/UPGRADE-01 have bounded fixture/unit/denial and PostgreSQL test sources. PostgreSQL execution, shared catalog integration and successful admission remain holds, not passes. A KEY-01/02/03 are preserved. CLOCK/END/BILL/FINAL belong to C. No subscription statement, original-anchor adjustment, trial end, conversion, Final Check or fee illustration changes here. MON-3 stays open.

## 28 October MON-3 END/CONV/WIRE composition

Reserved migration `0373_free_first_job_eligibility.sql` adds immutable lifecycle
sources and pinned subscription inputs after the unchanged 0372 foundation. New
checked `mon3_activate` uses current company-owner authority, exact accepted
quote/parties, original dispatcher approval and global key claims. B's legacy
`mon3_admit` remains closed. Main's capacity prerequisite currently refuses new
activation; it is never bypassed in runtime. Imports, historical conversions,
shared practice and missing verified identity also refuse.

Normal synthetic company sessions can read `/jobs/:id/trial`, request a card,
and explicitly complete a fictional card setup. Next exposes the same route
under `/api`; switch-live retains `/jobs/:id/quotes/activation`. No browser can
supply an identity, card fingerprint, successful outcome, timestamp or trial flag.
The UI is `/jobs/:id/trial`, linked from the job workspace. First-only Skip and
second-job Add a card are advisory offers; the command rechecks every condition.
The simulation uses a fixed fictional card and is not a hosted/live provider.

Trial days zero base and extras. Conversion uses the existing London clock,
keeps lock/close day free, begins on the successful second activation date or
exclusive day-90 midnight, and preserves the original monthly anchor. Initial
pre-start stub dates are free. Accepted monthly terms are required for paid
continuation. Wholly pre-start or unclosed periods and unsupported corrections
refuse. Issued documents keep their pinned input; a changed conversion boundary
blocks affected positive collection rather than rewriting or charging early.
