# Free first job lifecycle v1 — contract and holds

MON-3C-P0, coordinator family, ruling C264; issued 25 October 2026.
Documentation preparation only. MON-3 remains OPEN. This contract issues no
sibling implementation, trial activation, provider access or charging policy.

Authority: `AGENTS.md` rev 3.0; `BUILD_PLAN.md` §§10.1.7 and MON-3;
the 20 October corrected build-ahead draft, §7 MON-3C-P0 and sibling CAL,
ELIG, END, CONV and WIRE cards, plus its DRAFT MON-3C inventory and
§§2.2a–2.3b. The 25 October dispatch supersedes P0's DRAFT status only;
its P0-01–P0-04 criteria and all dependent holds survive. Future leaf IDs
below are ownership/evidence obligations, not issued work or completed tests.

## Source boundary inspected

HEAD and local `origin/main` both resolve to
`28416d1ea7e154f2353d56e28f30db34e06e36ab`. Initial working tree was clean;
branch is `codex/sandbox/mon-3c-p0`. This is the actual locally available main
snapshot, not a claim of a network refresh. Source presence is distinguished
from exact-head review, CI and acceptance evidence.

| Area | Actual source on this main | Limitation / consumer |
| --- | --- | --- |
| Original preview | `packages/core/src/free-first-job.ts`; `apps/api/src/free-first-job.application.ts`; `free-first-job-card.adapter.ts` | Supplied synthetic facts, uncomposed read port, stateless card fixture. No persisted runtime entitlement or completed setup. |
| A key storage | `packages/db/migrations/0194_free_first_job_keys.sql`; `free-first-job-keys-v1.md`; `MON-3-P-A` receipt and ledger | Immutable private snapshots and global all-key claims, migration-owned only. Historical prose still says 0192; inspected SQL is 0194. No number is allocated here. |
| B admission/card | **ABSENT:** `packages/db/src/free-first-job-repository.ts`, `free-first-job-card-repository.ts`, `0206_free_first_job_admission.sql`, `DisabledFreeFirstJobActivationMutation` | Draft describes a candidate, not a merged seam. No B signature is copied or inferred. H-B blocks every source-changing C leaf. |
| CH-4-C | `job-work-state-repository.ts`, `job-work-state-sources.ts`, `0201_job_work_state_commands.sql`, `job-work-timing.ts` and their contracts | Command/read source exists. Ledger/receipt retain review/CI/acceptance and timing holds; source inspection alone clears none. H-CH4 needs final exact evidence. |
| Subscription | `subscription-repository.ts`, `subscription-meter-source.ts`, `0195_subscription_persistence.sql`, `subscription-v1.md` | Existing checked synthetic terms/statements and arithmetic; no authoritative lifecycle trial facts or approved conversion convention. |
| Activation / lock | `activation-repository.ts`; `final-account-lock-repository.ts`; `0187_final_account_sources_and_pdf.sql` | Existing v1/v3/practice and lock paths are not C trial admission. Consume accepted public seams only after coordinator handoff. |

Exact declaration excerpts below are copied from the inspected files, without
inventing return annotations for inferred types. Constructors and bodies are
omitted; these are source signatures, not a proposed new API.

```ts
// packages/core/src/free-first-job.ts
export function freeFirstJobKeys(raw: unknown): readonly string[]

// apps/api/src/free-first-job.application.ts — interface member, uncomposed
authorizeAndRead(sessionHandle: unknown, jobId: string): Promise<unknown | null>;
// FreeFirstJobApplication
async read(sessionHandle: unknown, jobId: string, rawQuery: unknown)

// apps/api/src/free-first-job-card.adapter.ts — stateless fixture only
export function simulateFreeFirstJobCardSetup(raw: unknown)

// packages/db/src/job-work-state-repository.ts — JobWorkStateRepository
async read(context:VerifiedTenantContext,jobId:string,digest:string)
async command(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown)
async finish(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown)
async cancelFinish(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown)
async resume(context:VerifiedTenantContext,jobId:string,digest:string,raw:unknown)

// packages/core/src/job-work-timing.ts
export function workDeadlineCandidate(kind: "finish" | "quiet" | "trial", rawOriginAt: unknown)
export function resolveWorkDeadline(_candidate: ReturnType<typeof workDeadlineCandidate>): never
export function compareWorkFactTimes(a: unknown,b: unknown): -1 | 0 | 1
export function trialTimingFacts(raw: unknown)

// packages/db/src/subscription-repository.ts — SubscriptionRepository
async command(context:VerifiedTenantContext,digest:string,commandId:string,raw:unknown):Promise<Record<string,unknown>>
async read(context:VerifiedTenantContext,digest:string):Promise<SubscriptionPersistedRead>
// packages/db/src/subscription-meter-source.ts — SubscriptionMeterSource
async read(context:VerifiedTenantContext,digest:string,sourceId:string)

// packages/db/src/final-account-lock-repository.ts — FinalAccountLockRepository
async read(context: VerifiedTenantContext, jobId: string): Promise<FinalAccountLockView>
async lock(context: VerifiedTenantContext, raw: z.infer<typeof lockInput>): Promise<PersistedFinalAccountLock>
```

`lockInput` is module-private; this excerpt does not export it or establish a
new actor authority. The existing lock projection includes `lockedAt` from SQL
six-digit UTC text, `id`, `commandId`, `auditEventId`, revision and snapshot
hashes. The coordinator must bind the final accepted source reference contract
before END or WIRE uses it.

Actual SQL declarations/calls relevant to the consumer handoff:

```sql
-- 0194, private SECURITY INVOKER, no runtime execution grant
CREATE FUNCTION app.claim_trial_identity_keys(p_tenant uuid,p_snapshot uuid) RETURNS void
-- CH-4 read call in JobWorkStateRepository; arguments tenant, job, digest
SELECT app.ch4_read_work_facts($1,$2,$3) result
-- 0201, checked command entrypoints
CREATE FUNCTION app.ch4_record_work_state(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
CREATE FUNCTION app.ch4_link_post_lock_job(t uuid,j uuid,digest text,input jsonb) RETURNS jsonb
-- 0201, private capacity refusal (not B's absent trial refusal)
CREATE FUNCTION app.ch4_admit_place(t uuid,j uuid,action text) RETURNS void
```

The CH-4 command routines derive/recheck owner/session authority; the repository
has separate membership UUID and practice digest handling. Read requires the
existing digest contract. Do not generalize this to company subscription access.
`resume` and capacity-dependent reopen remain refused with
`CAPACITY_ADMISSION_UNAVAILABLE`. `resolveWorkDeadline` always raises
`WORK_TIMING_CONVENTION_REQUIRED`. Six-digit source comparisons and London
date candidates exist; precise operational trial deadlines do not.

## Proposed interfaces — unavailable until exact issuance

| Leaf | Proposed only, from the issued preparation's sibling specifications | Boundary |
| --- | --- | --- |
| CAL | `trialDeadlineV1(startedAt: WorkFactTime, approvedClock: TrialClockPolicyV1): TrialDeadlineV1`; `reduceTrialEndsV1({trialId,tenantId,jobId,startedAt,deadline,asOf,events}): TrialEndProjectionV1` | New strict pure types; `WorkFactTime` is a proposed alias of existing `workFactTimeV1`, not an exported type. Clock approval required even for pure implementation. |
| ELIG | `FreeFirstJobEligibilityRepository(pool).read(context,digest,jobId): Promise<TrialEligibilityReadV1>`; proposed checked `app.mon3_read_eligibility(tenant_uuid,digest_text,job_uuid)` | Advisory safe read; no key consumption or activation authorization. Practice authority cannot be a caller flag. |
| END | `FreeFirstJobLifecycleRepository(pool).read(context,digest,jobId): TrialLifecycleReadV1`; private `mon3_trial_start_from_activation(...)`, `mon3_record_trial_end_source(...)` | Ellipses explicitly unbound: exact B/source receipt arguments absent. No standalone runtime grants or guessed timestamp arguments. |
| CONV | `FreeFirstJobConversionSource(pool).read(context,digest,{sourceId,periodStart}): TrialPeriodAuthorityV1` | Internal source-linked trial dates only; held result without approved terms/conversion. Existing MON-1/MON-2 computes money. |
| WIRE | `FreeFirstJobLifecycleApplication.read(sessionHandle,jobId)`; proposed Next `GET /api/jobs/:id/trial`, Nest `GET /jobs/:id/trial` | No route installed by P0. Activation stays on existing `/api/jobs/:id/quotes/activation`; no force-trial endpoint or caller-supplied authority. |

## State and provenance rules

Eligible/candidate means a checked prospective result, never authorized or
activated. Final admission must re-read current owner/session, exact accepted
quote/parties, terms and all keys under common business locks, including after
waits and before replay. Newness cannot be inferred from `status='accepted'`:
imports, prior activation/pilot history and any historical reopening must be
checked from authoritative provenance. Missing evidence stays held.

Requested setup, redirect-only, cancellation, failure and `outcome_unknown`
are not completed same-business card-on-file facts. Browser outcomes, fingerprints
and hosted redirects cannot complete a card. Synthetic completion requires the
accepted trusted fixture/provenance seam; real hosted-provider integration is
separately gated. Store only permitted references/fingerprints, never raw cards.
First-only Skip is an offer; incomplete fallback identity grants nothing.
Every distinct second job requires completed same-business card, including a
small job or another job at the same customer/site place.

Proposed end/date candidate is not a persisted effective end. The start must
bind the actual committed first activation, immutable key snapshot and original
six-digit switch-live source time. Earliest qualified own lock, own close,
approved deadline or distinct successful second activation ends the trial.
Failed commands, finish, quiet and card redirects are not ends; lock/close needs
no card. Preserve every co-earliest source identity in canonical display order,
without treating that order as a financial precedence rule. Preserve microseconds,
reject foreign/pre-start/conflicting duplicate sources and ignore future facts
until as-of. Reopening/reset never renews entitlement or deletes consumed claims.

END's future immutable revisions retain effective and recorded times, predecessor
and source set. Delayed earlier sources may shorten the boundary, never extend
it or rewrite issued statements. GET derives status without surprise writes;
no expiry worker actor/schedule may be invented. Any explicit materialization
entrypoint remains held until its authority exists. Private migration-owned
synthetic foundation fixtures in END/CONV are not public activation proof.

One checked transaction must eventually commit activation, all-key claims,
trial start/second end, capacity result, command receipt/result and audit, or
none. Common business locks precede receipt/audit locks; coordinator binds exact
order with MON-1/MON-2/B before issuance. Replay rechecks current authority;
changed actor/payload/job/source conflicts. No commercial network call occurs
inside it. Tenant/job/session binding comes from authenticated server facts,
never caller tenant, identity, trial flags, source success or requested times.

## Decision and issue gates — every row remains HOLD

No default money policy is proposed. A source read, fixture, arithmetic example,
or this dispatch is not approval. The coordinator attaches versioned decision
and exact predecessor evidence before issuing the dependent behavior.

| Hold / decision slot | Required resolution or evidence | Blocking dependent leaf |
| --- | --- | --- |
| H-PREDECESSORS | Exact accepted MON-2A boundary/split, original A/B/C dependencies, actual A acceptance and merge ancestry; MON-2A-P source alone is insufficient | CAL, ELIG, END, CONV, WIRE |
| H-ISSUE / H-NORMATIVE | Exact later leaf order, refs, actors and allowed files; any conflicting normative requirement resolved through the governing versioned decision/amendment process | Every affected implementation leaf; P0 issues none |
| H-B | Final merged B source, both exact-head Claude PASSes, green required CI, separate acceptance and Ben merge; exact identity/card/admission signatures and tests | CAL, ELIG, END, CONV, WIRE |
| H-CH4 | Final CH-4-C exact-head two PASSes, CI, separate acceptance, merge and public source handoff; existing source/repair ledger alone is insufficient | CAL, ELIG, END, WIRE; CONV transitively |
| H-TRIAL-CLOCK / London day-count and deadline | Reconcile “90 days after” and “on day 90”; approve versioned origin/day inclusion, precise deadline instant and equal-time endpoint/attribution convention, coordinated with CH-4/MON-1 | CAL, END, CONV, WIRE |
| H-TRIAL-CLOCK / DST gap | If wall-clock instant selected, approve explicit missing spring-time mapping or refusal; no JS/PostgreSQL coercion | CAL, END, CONV, WIRE |
| H-TRIAL-CLOCK / DST overlap | If wall-clock instant selected, approve duplicated autumn-time mapping or refusal; no implicit earlier/later offset | CAL, END, CONV, WIRE |
| H-IDENTITY / first-skip identity | Sufficient independently verified identity without card; incomplete phone/card fallback stays held. Identifier continuity/replacement/merge cannot reset claims without approved rule | ELIG, END, WIRE; CAL also retains inherited B gate |
| H-PRACTICE / company versus practice authority | Explicit normal-company owner/admin policy and approved isolated-company or dedicated per-session synthetic authority for jobs, identity, cards and terms; expiry/revocation/reset and no cross-session summary | ELIG, END, CONV, WIRE |
| H-HTTP | Separately authorized normal-company method/route/CSRF/origin/current-membership composition; no global `SYNTHETIC_WORKFLOW_ONLY` removal | WIRE normal-company transport |
| H-METER-CLOCK | Accepted finish/quiet/endpoints/cancel-after-stop rules and first evidence after a stop versus cap-checked restart; no guessed interval convention | Affected END/CONV/WIRE meter integration; MON-1 owns resolution |
| H-CONVERSION / billing date | Exact London conversion day for each end, same-day inclusion and end/deadline boundary | CONV, WIRE |
| H-CONVERSION / first-period stub | Approved short-first-period treatment or explicit supported-boundary refusal | CONV, WIRE |
| H-CONVERSION / original anchor | Explicit original monthly anchor handling, including 29/30/31 and any requested reanchor; no inferred new anchor | CONV, WIRE |
| H-CONVERSION / terms acceptance | Exact effective agreement revision, authorized actor, accepted terms/hash/version and route; no worker acceptance, annual auto-selection or retrospective trial | CONV, WIRE |
| H-CONVERSION / late negative corrections | Approved handling of negative effects/refund/carry-forward and closed receiving periods. Positive correction still uses existing maximum, reconciliation and excess-uncollected alert | CONV, WIRE |
| H-EXTERNAL / source/lock/meter handoff | Accepted MON-1 lifecycle/place admission and integration, actual CH-4 historical reopen identity, exact successful activation/close/lock source references and lock order; final accepted CH-5/SV-7A/MON-2A journey/SV-5/SV-6 seams/tests from their owners | ELIG, END, CONV, WIRE as applicable; whole DEMO-S remains externally owned |
| H-CH4-Q01/Q03 | Later accepted authority for running/completed Final Check and reopen/earlier-lock consequences, or new snagging/post-live exceptions; accepted C commands alone do not resolve these | Affected END/WIRE consumers; current closed-job new-lock/check refusal survives |
| H-ENABLE | Separate exact synthetic activation order after all above prerequisites; complete active slice and positive runtime/browser proof required in that later candidate | WIRE; every preparatory leaf must retain refusal |
| Live/release | D01/D02/D03/D08/D09/D16, D05/G4-S and applicable provider/data/charging approvals; no new production authority here | All live/provider/charging behavior, outside every preparatory leaf |

B's draft-reported unconditional hard stop **must survive** every preparatory
leaf when B merges. Its exact error/signature is absent on this base and cannot
be asserted as an executed protection. No preparatory leaf may remove/replace
it, enable a successful public trial path or install a bypass toggle. WIRE's
positive runtime/browser/composition proof is **BLOCKED** while H-ENABLE is open,
not PASS, a skipped success or an incomplete executable scaffold.

## Original requirements to owners and required evidence (P0-01)

Rows cover the MON-3 Build and Done-when list and every §10.1.7 rule. Acceptance
IDs retain their sibling-card meaning. All future execution is outstanding.

| Original criterion / trace | Responsible leaf acceptance IDs | Required evidence |
| --- | --- | --- |
| Trial entitlement / one trial per business; same company OR same phone+card; no tax ID/raw card | A KEY-01/02/03 retained; ELIG-01–06,09–12; WIRE-01,02,04,09,15; WMT-C-01/02 | Stable all-key bytes and private global uniqueness; real new/non-imported/never-reopened provenance; complete identity, current authority, collision races one winner with no disclosure or partial claims; catalog/upgrade proof. |
| First switch-live card request with hosted flow and “Skip for now” first only; permitted reference/fingerprint storage | B handoff; ELIG-05–08; WIRE-01–03,07,11; WMT-C-03 | Trusted persisted setup provenance and exact first action; incomplete/foreign states refuse; first skip cannot bypass sufficient identity. Synthetic provider boundary explicit; no claim that fixture is a live hosted flow. |
| Second switch-live without card refuses and offers “Add a card” | ELIG-07–10; WIRE-03,05–07; CONV-05 | Each requested/redirect/cancelled/failed/unknown/foreign state tested; every distinct second job including small/shared-place; exact copy; zero activation/end/key/payment effects on refusal; recheck after waits/replay. |
| No subscription while trial job alone live (zero base AND extras) | CONV-01,04,08–11; WIRE-10,13; WMT-C-06 | Authoritative trial dates, accepted terms and unchanged core arithmetic; reject supplied trial/plan/annual flags; zero synthetic statement/payment effect for held semantics. |
| Ends on own lock and own close | CAL-04–06; END-01–09,11/12; WIRE-05,08,10; WMT-C-04 | Each actual source independently, wrong-job/foreign/failed facts refused; no card needed; precise earliest/equal-time/race/rollback/replay proof and immutable source links. |
| Ends on day 90 / 90 days after switch-live | CAL-01–08; END-01–04,08; WMT-C-04/05 | Approved London deadline, March/October DST gap/overlap, leap/month/year cases, one-microsecond before/at/after, immutable origin, future/as-of handling and old preview outputs unchanged. |
| Ends when distinct second job goes live, subscription pro-rated from that day | CAL-04–06; END-01–06; CONV-02–08; WIRE-05,10; WMT-C-04/06 | Actual committed activation and atomic end/capacity/key/receipt/audit; failed second command leaves trial unchanged; approved conversion day/stub/anchor/terms; real 28/29/30/31 denominators and single half-even rounding. |
| Trial Final Check and success-fee illustration run normally | WIRE-08,10,11; WMT-C-07; external SV-5/SV-6 owners | Actual lock/check/reveal/illustration services compared with nontrial treatment, not a mock. Preserve closed-job refusal, evidence qualification, prelock disclosure and fee-free capture exclusions; no trial-derived recovery entitlement or subscription fee offset. |
| Reopening never grants another trial; late facts preserve history | CAL-07; ELIG-02; END-02,06,08; CONV-06/07; WMT-C-05 | Reopen/reset, permutations/duplicates/equal microseconds, delayed earlier end and source-linked correction; old issued statement/hash and consumed keys retained, negative effects held. |
| Unchanged v1/pilot and disabled preparation | CAL-08; ELIG-12; END-12; CONV-09,11; WIRE-13–15; WMT-C-08 | Original elapsed-day preview expectations, v1 £79/cap/legacy tests and `none_recorded_pre_mon2a` unchanged; no retrospective pilot discount/bill or new trial v1 obligation; all public/direct-SQL old-facade trial bypasses denied after separately authorized integration. |
| Security / retry / migration / browser acceptance across original C split | ELIG-09–11; END-04–06,09–11; CONV-10; WIRE-04–07,09–12,15; WMT-ALL-01/02 | Real PostgreSQL RLS/owner/grants/indirect roles/FKs, auth before disclosure and after waits/replay; own migration alone plus successors twice with populated predecessor type/row/identity preservation and damage controls; both production-build browser projects with stored source trace/reload/deep link/second context, keyboard/focus/errors/44px/no overflow/synthetic banner. |

The existing 1,933p example is arithmetic for ten supplied free dates in an
agreed 30-day Solo period (CONV-03), not approval of which ten dates a real trial
exempts. Existing MON-2 nine examples/maxima remain unchanged; there is no second
price calculator, fee offset, automatic annual activation or default refund rule.

## Sole file ownership and handoff (P0-03)

| Files / shared area | Sole editing owner |
| --- | --- |
| This contract, `config/lanes/mon-3c-p0.json`, P0 receipt | P0 for this documentation candidate; coordinator serializes later contract amendments. Own lane JSON uses validator's implicit own-file rule; no self-grant. |
| New calendar module/tests | CAL after exact issuance only; existing `free-first-job.ts`/preview tests unchanged. |
| New eligibility repository/tests and own SQL/note | ELIG after holds/issuance; no competing identity store. |
| New lifecycle repository/tests and own SQL/note | END after holds/issuance; existing source owners alone write authoritative source facts. |
| New conversion source/tests and own SQL/note | CONV after holds/issuance; no subscription UI/transport. |
| New lifecycle application/contracts/controller, trial routes/page/client, composition tests and browser spec, own SQL/note | WIRE only after separate H-ENABLE order; no partial runtime scaffold now. |
| `activation-repository.ts`, `commands.ts`, B's final admission/card files, quote application/contracts/controller and activation Next route | Coordinator, booked serial window after MON-1 hooks and accepted B reinspection. No second leaf edits these in parallel. |
| `job-work-state-repository.ts`, `job-work-state-sources.ts`, existing work-state API/Next files | CH-4-C source owner through acceptance; then coordinator alone for consumer patches. SV-7A owns diary/message intake. |
| `subscription-meter-source.ts`, `subscription-repository.ts`, checked SQL source/calendar/correction integration | Coordinator alone, source adapter before conversion. MON-2 retains terms/pricing/statements/payment meaning. |
| `final-account-lock-repository.ts`, `final-account-repository.ts`, `shadow-repository.ts`, variation/final-review consumer hooks | Coordinator alone for C consumer hunks after accepted source-owner handoff; no competing source edits during that window. |
| Actual Final Check/reveal/illustration source implementation | Respective external SV-5/SV-6 source owner retains its module; C consumes the handed-off public seam only. #189/#181 worktrees/internals reserved; no reconstruction. |
| Core/db/API barrels, package export maps, app/workspace composition, `apps/api/openapi.json` | Coordinator only. |
| Auth guards/principal/session bridges, `identity-server.ts`, `workspace-server.ts`, `synthetic-server.ts` | Coordinator only under separate approved authority. |
| Shell/navigation/job page/global CSS | Coordinator only; WIRE's private components remain leaf-owned. |
| Tenancy/catalog/LP-0/SERIOUS-B5/authority/fingerprint expectations and effective-privilege contracts | Coordinator only; additive actual object records, no invented hashes or blanket rebaseline. |
| Migration numbers and same-stem notes | Root/coordinator alone at future issuance. No numbers reserved here; never modify historical SQL or migration runner/list/discovery tools. |
| Import adapter / chooser / reset-resume / complete DEMO-S report | External CH-5/DEMO-S owners after accepted handoff. |
| Each future `config/lanes/<leaf>.json` | That leaf's one exact issued lane only. `config/agent-lane-assignments.json` remains excluded, including from P0. |

Any shared file discovered beyond this inventory requires a coordinator ownership
handoff before edits. Shared hunks must enter the same reviewed candidate during
a serialized window; “integration later” is not acceptance. P0 changes no runtime,
migration, grant, environment, provider, prompt, schema or commercial policy.

## P0 review boundary and completion evidence

P0-01 is the requirement/owner/evidence matrix; P0-02 is the explicit HOLD table;
P0-03 is the sole-owner inventory and exact own lane; P0-04 is the hard-stop and
historical-compatibility requirement. This is documentation consistency work,
not implementation test evidence. Commands actually executed and limitations
belong in `docs/verdicts/MON-3C-P0/BUILDER_RECEIPT.md`.

Source-inspected means read at the SHA above. Test-executed means an actual
recorded command/result. Independently reviewed means a real separate-model
verdict bound to the dispatcher-created exact commit. None implies the others.
P0 awaits one independent check (JobGuard fast lane), separate acceptance and
Ben's merge. Future siblings retain their own mandated two-Claude/exact-CI
review gates; this documentation fast lane does not waive them or close MON-3.
