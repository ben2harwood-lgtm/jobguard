# MON-3 free first job reference contract v1

Status: synthetic preview, A's private key storage (actual migration 0194), and B's
fictional verification/card persistence (0235). B admission is unconditionally disabled
pending C; MON-3 remains incomplete. No production provider, charge, trial conversion,
statement or settlement is authorized. The proposed D09 policy is not approved.
The historical preview delivery and later supersessions are recorded below.

The 16 October build-ahead order overrides the 13 October draft's whole-piece
hold. BUILD_PLAN.md §§10.1.3–10.1.12 and the MON-3 card at lines 2175–2194
agree with the quoted trial/price/card rules. The historical graph reservation
0087 differs from the issued provisional 0185. The original preview created no migration; MON-3-P-A now adds private migration
0192. Runtime identity, agreement, capacity-lock and subscription composition
remain outside A. MON-2A's catalogue, calculator and existing files are reused unchanged.
The parent receipt's LP-0 inventory restriction is superseded for own new objects
by this order, but does not supply the missing persisted authority contracts.

`packages/core/src/free-first-job.ts` provides strict, versioned Zod boundaries
and typed `FreeFirstJobError` codes. Its only import is Zod. All inputs and outputs
are synthetic, and every preview is hypothetical with zero real external actions.
No return value authorizes activation.

- `freeFirstJobKeys`: all available exact tuples; company number and independently complete
  phone/card. Preview checks every tuple. The compatibility-only `freeFirstJobKey`
  is deprecated for entitlement decisions; it returns company number when supplied, otherwise
  normalized phone plus simulated-provider fingerprint. Tenant/user/job is absent
  from the business key. Separators cannot cause collisions. Missing fallback
  identity returns `identity_required`; phone alone or card alone is insufficient.
  These are supplied fictional normalized identifiers, not verification or
  normalization services. Keys are internal personal-data references, never logs,
  public projections or audit payloads. Private migration-owned fictional storage now exists under MON-3-P-A; no
  runtime verification, retention or deletion rules are invented here.
- `previewFreeFirstJob`: supplied immutable consumed keys prevent a new candidate
  across tenants. Distinct prior live jobs require a completed same-tenant card,
  regardless of small-job status, stopped counts or customer/site grouping. An
  already-live target returns `existing_job`, never a new trial or skip. It cannot
  replay an actual activation command. First-job skip is offered even when identity
  is unresolved; that preview neither denies nor grants the unresolved activation.
- Card states are strict. Requested, cancelled, failed, unknown and redirect-only
  setup do not qualify. Completed cards accept only simulated provider references
  and fingerprints with environment/tenant binding. No raw card fields are accepted.
- `previewFreeFirstJobEnd`: the earliest supplied successful own-job lock, close,
  distinct-job activation or reference deadline ends the trial. Another job's lock
  or close does not. Cross-tenant, pre-start and inconsistent same-job activation
  facts refuse. Finished-on-site, quiet and failed commands are not valid ends.
  Input order and duplicate identical events cannot change the effective instant.
  Future events do not end the preview early. No data/export or fee policy changes.

The reference policy explicitly chooses 90 elapsed 24-hour days, canonical UTC
millisecond instants, and a stable lexical reason for simultaneous ends. These
are reversible synthetic technical assumptions pending coordinator ruling, not
production billing rules. Production clock semantics, original database precision,
chargeable conversion date, subscription anchor and late corrections remain held.
No timestamp or trial flag from this preview is fed into a persisted statement.

`apps/api/src/free-first-job.application.ts` defines an uncomposed read port.
Its future implementation must authenticate the current session, verify tenant/job
permission, read server facts and return null with identical unauthorized behavior
for every job state. No actor role is selected here. The service requires a server
synthetic mode before and after its awaited read, checks access before query
validation, validates tenant/job binding and projects no identities/card references.
There is no concrete repository, controller, Next route, API registration or new
OpenAPI operation. Service-port fixture tests are not database or authorization
integration evidence. The service never caches an earlier read or writes anything.

`free-first-job-card.adapter.ts` generates a stateless simulated hosted-flow fixture
only in server-configured `JOBGUARD_ENV=synthetic_demo`, independently of a
fixture flag. It uses a trusted scenario's tenant, setup identity, two fictional instruments and
outcome. The opaque reference binds tenant/setup; provider-scoped fingerprints
remain stable across setup attempts for the same fictional instrument. It creates
no hosted URL, network call, durable setup, replay receipt, card-on-file fact,
settlement, collection approval or billing obligation. Do not expose its scenario
input as an HTTP completion payload. Durable setup binding, unknown-outcome
reconciliation and command idempotency remain held on persistence/provider seams.

Pricing tests call unchanged MON-2A `computeSubscriptionPeriod` with explicitly
supplied days: trial days contribute no base/extras, subsequent supplied days
prorate once with half-even, and all 416 distinct generated periods stay within the
existing maxima. The 1,933p fixture is arithmetic for ten explicitly supplied free
days of a 30-day Solo period, not approval of a real conversion-day interpretation.
No new billing calculator, fee credit/offset, VAT assumption or meter logic exists.
The inherited parent calculator's transitive dependency on fee/shadow modules
remains unresolved by this piece; parent ownership is preserved.

Future runtime composition must use checked actor/session routines, append-only
facts, RLS, same-tenant/job FKs, durable command uniqueness, audit rollback and
replay proofs. A grants no runtime access at all. Migration 0192 supplies the
private tables, standalone note, additive catalog inventory and own-migration
upgrade tests; historical provisional 0185 is not an allocation for this task.

Held: verified identity/continuity, unidentified-business skip reconciliation,
historical/import/reopen eligibility, persisted first/second activation and old
facade enforcement, actual lock/close/expiry/conversion, parent statement/payment
seams, transactional replay/races/audit, actual SV-5/SV-6 Final Check and illustration,
real provider/data/charging, all policy/release approvals and UI. No rule, schema
or flag here disables Final Check or changes existing success-fee processing.

18 October supersession: the historical persistence holds above describe the original
preview delivery. MON-3-P-A adds migration 0192 and private dual-key storage only,
under Ben’s issued authority; it does not enable admission or settle B/C interfaces.
The old elapsed-day clock remains preview-only, never persisted billing authority.

20 October supersession — MON-3-P-B adds disabled fictional verification/card persistence
in actual migration `0316_free_first_job_admission.sql`; A's merged migration is
`0194_free_first_job_keys.sql` (historical 0192 references above are superseded).
See `free-first-job-persistence-v1.md` for strict request/result boundaries, immutable
business bindings, owner/session replay checks and the disabled activation seam.
The stateless preview and fixture remain proposals, never stored authority.
The new setup path does not accept browser completion. No runtime verification or
provider integration is installed. Admission always refuses pending C's authoritative
London deadline/end/conversion work; no provisional unknown-identity trial is admitted.
C's CLOCK/END/BILL/FINAL acceptance and MON-3 as a whole remain incomplete.
