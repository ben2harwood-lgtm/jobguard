# MON-2A reference subscription contract v1

Status: partial build, hypothetical calculations only. D09
`subscription_pricing_policy_v4`, D05 `standing_authority_policy_v3` and D02
`reference_tax_invoice_policy_v1` remain proposed. Principal only; VAT not
calculated. No agreement, obligation, statement, payment or authority is created.

## Dispatch and source reconciliation

The build-ahead header supersedes the draft dependency restriction. Supplied
HEAD and `origin/codex/sandbox/mon-1` are
`2514049c8dfb7630598fdf81f5c0d6d23444abb4`; `origin/main` is
`6671538c8d69936c162368c760dd6ce0f7f10493`. MON-1 is unmerged. No PR may open
before its merge and dispatcher reconciliation of any parent repairs.

The quoted pricing formula, nine card figures, parameters, table rows and graph
edge agree with inspected BUILD_PLAN sections 10.1, 10.4, 10.5 and 12.3 on main.
The source migration list extends through 0158, beyond the draft's inspection of
0138. Actual decision files still record no dated approval evidence. No policy
approval is inferred from the dispatch. Migration **0166** is allocated by the
header, but is **not created or registered** because of the inventory STOP below.

MON-1 exports its functions from `packages/core/src/jobs-on-the-go.ts` through
`packages/core/src/index.ts`. The available pricing seam is
`computeSuppliedMeterPeriod(unknown)` with `suppliedMeterPeriodV1` and
`suppliedMeterPeriodResultV1`. Its strict input has:

- version `meter-supplied-period.v1`, environment `synthetic_demo` or
  `pilot_no_charge`, and exact proposed `syntheticMeterPolicySchemaV1`;
- `startDate`, `endDateExclusive`, and every supplied date exactly once, 28–31
  calendar dates, accepted independently of any anchor construction;
- per day: `plan`, `countedPlaces`, `trial`, `annualPrepaid` and `date`.

MON-1 sorts dates, caps the paid extras and sums the numerator with bigint. It
uses `moneyFromBigInt(divideRounded(numerator, days, "half_even"))`, returning
hypothetical principal, maximum and exact unallocated daily contributions.
MON-2A delegates to this function and never groups/recounts jobs or derives
counting intervals. These supplied counts are fictional inputs, **not trusted
persisted company derivations**.

Other available MON-1 seams include `groupSuppliedMeterPlaces` with supplied
`tenantId/jobId/customerId/siteId`, `computeSmallPlaceAllowance`, and
`suppliedMeterCorrection` (difference of two supplied principal values).
These are pure fixtures/calculations only. There are **no** persisted ledger,
source revision, event-derived daily result, qualified SQL place/correction key,
capacity lock, correction business identity, meter SQL routine or company/session
authority in this parent. MON-2A introduces no executable database meter adapter.
Q7/Q8 remain held; no future SQL signature or lock order is invented.

Inspection found no `platform_statement` or `platform_statement_line` in database
source/migrations. The namespace is not created here: statement persistence is
held under Q4/Q7/Q8. Its eventual first merged owner remains M4-10-S or released
MON-2A; re-inspect before that implementation.

## Buildable schema and calculation boundaries

`subscriptionCatalogueRequestV1` requires an explicit version and policy version.
`getSubscriptionCatalogue` returns frozen Solo/Builder rows validated against
`subscriptionCatalogueRowV1`:

| Plan | Monthly pence | Annual pence | Included | Extra pence | Cap | Maximum pence |
|---|---:|---:|---:|---:|---:|---:|
| Solo | 2900 | 29000 | 4 | 2000 | 1 | 4900 |
| Builder | 6900 | 69000 | 7 | 2000 | 5 | 16900 |

All rows have schemaVersion 1, GBP, proposed status and policy version v4. The
monthly parameters reference MON-1's actual versioned constants rather than
introducing a second counting/pricing policy.

`subscriptionTermsSelectionV1` describes only catalogue version, selected plan,
cadence, expected revision and terms-version label. It is an **unaccepted
selection**; it cannot describe an anchor, effective date, actor, approval or
maximum. `subscriptionPlanChangeSelectionV1` adds settled from/to plan fields,
without choosing any change execution rule. Cadence defaults to monthly.
`selectSubscriptionTerms` refuses annual selection; `subscriptionAnnualAvailable`
is false and no caller input can enable it. The descriptive schema's annual
literal does not grant annual availability or execution.

`subscriptionPeriodPreviewV1` wraps the actual MON-1 input with version
`subscription-period-preview.v1`. `computeSubscriptionPeriod` validates and
returns `subscription-period-preview-result.v1`, hypothetical true and zero real
external actions. It exposes principal, maximum, exact numerator/denominator
and unallocated daily contributions. No source hash, representative job,
statement penny allocation or artifact is constructed. Trial days contribute
zero; an explicitly supplied annual-prepaid reference flag suppresses the base
only, without proving annual prepayment. Existing MON-1 errors remain typed;
invalid outer input returns `SubscriptionError(INVALID_SUBSCRIPTION_INPUT)`.

`roundSubscriptionContribution` validates signed canonical integer text and a
positive integer denominator up to 366, checks the numerator against
MAX_MONEY_PENCE times that denominator, and rounds half-even once with bigint.
It creates no correction record and applies no settlement/credit policy.

`subscriptionTrackReviewInputV1` accepts a plan, committed scalar capacity and
zero to three explicitly identified periods. Each period supplies every day's
count, 28–31 dates implied by its supplied bounds. Periods must be ordered,
non-overlapping, adjacent and have distinct identities. The caller must supply
the trailing periods; this pure function cannot authenticate completeness
against a ledger. Sustained review is evaluated only with a complete three-period
window; at least two must contain ten days strictly above seven places.
Immediate review requires Builder committed capacity at least fourteen.
A thirteenth place does not trigger it. Results are hypothetical booleans and
busy-day counts; no Decision, operations card or track assignment is written.

Onboarding schemas require a safe non-negative integer usual-job count and a
boolean site-staff capture answer. Seven/no staff routes `small_builder`;
above seven or staff capture routes `contractor`. This is a pure recommendation.
API schemas are definitions only; no controller/application/provider/route is
registered, and OpenAPI is unchanged.

## Coordinator prerequisites and holds

**STOP — catalogue persistence:** the existing LP-0 guard compares all actual
runtime capabilities against `docs/contracts/lp-0-effective-privileges-v1.json`.
Its entries array starts at line 61 and has no subscription-catalogue capability.
`packages/db/test/lp-0-grant-freeze.integration.test.ts:64` requires
`expect(brief(compareInventory(inventory, baselineMigrationOnly))).toEqual([]);`.
The necessary new runtime SELECT would be an unreviewed addition. Rule G forbids
this builder from updating the inventory or that assertion. A coordinator must
add the reviewed catalogue-only SELECT inventory entry (and schema reachability
facts if necessary), preserving the assertion, before 0166, repository access
and real upgrade proofs can proceed. No inert table or guessed access substitute
has been created. Standard F: no new grants of any kind in this piece.

**STOP — transitive architecture:** `packages/core/src/jobs-on-the-go.ts:2`
imports `isSmallJobV3` from `activation-v3.ts`; that module's line 3 imports
`shadowSuccessFeeV1` from `./shadow-domain/success-fee.js`. The subscription
calculator's supplied MON-1 seam therefore reaches fee/shadow schemas. Its new
architecture assertion is deliberately still red. No fee operation is invoked
by the subscription function, but transitive isolation is not proved. Parent
owners must expose an isolated supplied-pricing/date/policy seam; this builder
cannot edit their implementation beyond additive exports and has not duplicated
meter arithmetic to avoid the dependency.

Q3 anchor/first-period/same-day rules; Q4 full line attribution/allocation;
Q5 correction application/collection; Q6 annual activation/prepayment/proration;
Q7 tenant/session authority; Q8 roles/internal executor; Q9 actual legal track
move all remain held. Agreements, business tables, statements, controlled SQL,
HTTP execution, durable reviews/routing, payments, corrections, audit writes and
actual track changes remain unbuilt. UI, MON-3, MON-8 and live MON-2B remain with
their assigned tasks. No redirect or fabricated payload has a settlement writer
to call; the required durable payment proofs remain unbuilt rather than claimed.
