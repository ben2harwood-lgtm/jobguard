# MON-2A plan/subscription screen read v1 (P1, P2, C2)

Synthetic made-up companies only. RED: company sign-in and money presentation. This slice adds a read-only `/plans` screen, not acceptance, plan changes, issuing, collection or a provider. C3 browser journey remains a later piece; MON-2B and all production/commercial release gates remain closed. No migration or new database grants.

## Authority and transport

The screen calls only C1's existing `GET /api/subscriptions/current`, with same-origin credentials and `cache: no-store`. The C1 response is `Cache-Control: no-store`; no company read is stored in local storage or a shared cache. Every read re-enters current company authority and the persisted SQL session check. A practice cookie alone is insufficient. Ben's 28 October ruling is recorded in merged PR #362 (`ea5d7b1b`): exact subscription routes use the real email-code company session, checked before the practice shortcut; other money paths retain their existing rules. P1/P2/C2 do not amend that boundary. The sign-in link goes to `/sign-in`.

401/403 show company sign-in guidance; other HTTP, network, JSON or projection failures show unavailable, without figures, raw errors or returned private details. Initial loading renders no company figures. The screen sends no command, tenant selector, payment claim, plan selection or annual-enable override. Existing C1 command authorization is unchanged.

## Consumed C1 data

`subscriptionPlanReadV1` in core validates the consumed projection of `subscription-persisted-read.v1`, requiring `environment: synthetic_demo` and `hypothetical: true`. Arrays are mandatory, even when empty. Actual C1 rows retain additional SQL fields; unconsumed fields and arrays are stripped and cannot affect this view.

| Array | Consumed fields (SQL names) |
| --- | --- |
| agreements | tenant_id, id, revision, plan, cadence, anchor_day, maximum_pence, effective_date |
| periods | tenant_id, id, period_start, period_end, agreement_revision, principal_pence, maximum_pence |
| statements | tenant_id, id, period_id, namespace, amount_pence, currency, hypothetical |
| work | tenant_id, id, statement_id, amount_pence, environment |
| attempts | tenant_id, id, work_id |
| results | tenant_id, id, work_id, outcome, environment |

IDs must be UUIDs. All consumed rows must belong to one company, IDs must be unique within each array, agreement revisions unique, and joins unambiguous. Every period requires its applied agreement revision and exactly one subscription statement with the same amount. Work must bind that statement and its exact amount. Attempts/results require work; results require an attempt. Invalid data throws the existing typed `SubscriptionError(INVALID_SUBSCRIPTION_INPUT)`. This defensive validation grants no authority and does not replace the C1/SQL tenant boundary.

## Pure projection

`subscriptionPlanView(raw, asOfLondonDate)` returns `subscription-plan-view.v1`, a hypothetical catalogue, current agreement (or null), and issued periods newest first. The caller supplies the London civil date; core has no clock or network access. Current agreement means greatest effective date not after that date, then greatest accepted/applied revision. Pending change intentions never select a plan. Each historical period keeps the plan of its bound agreement revision; a mixed-plan period's amount and maximum remain the engine's period facts.

Catalogue data comes from `getSubscriptionCatalogue`, with Solo and Builder only. `subscriptionAnnualAvailable` is the existing flag; false hides annual prices and no annual execution is introduced. Annual catalogue prices are separate from the twelve-month monthly-profile totals below.

The screen labels prices and period amounts as principal excluding VAT. Amounts use public GBP `Money`, bounded nonnegative integer pence, and integer-only formatting to two decimal places. The view uses `principal_pence` including persisted applied corrections, requires statement equality, and refuses totals above `maximum_pence`. It does not reprice, round again, offset a fee, infer VAT, issue a statement or turn preview data into an obligation. Period end dates are exclusive. No issued period means an explicit empty message, never a fabricated £0 charge or a paid state.

Payment state is per statement/work, independent of array order:

| Saved facts | Display |
| --- | --- |
| No work | Simulation not started |
| Work, no attempt | Simulation approved |
| Attempt without result, or outcome_unknown without terminal result | Simulation outcome unknown — reconciliation required |
| Redirect without unknown/terminal result | Simulated redirect — not settled |
| Settled result | Simulated settlement — no real money paid |
| Failed result | Simulation failed |

A terminal result takes precedence over earlier redirect/unknown facts. Conflicting settled and failed outcomes refuse the read. Rendering never retries an external action, and repeated reads have no business effect. The existing engine owns idempotency and reconciliation.

## Exact MON-2A fixture amounts

New P2 tests pass the existing engine's results through the display, rather than duplicating its calculation.

| Scenario | Screen amount |
| --- | --- |
| Solo profile (1,1,1,2,2,2,2,2,2,3,3,4), twelve monthly periods | £348.00 total |
| Builder profile (3,4,4,4,4,5,5,5,5,6,6,7), twelve monthly periods | £828.00 total |
| Builder 8 places, full 30 days | £89.00 |
| Builder 8 places, 15 of 30 days | £79.00 |
| Builder 12 places | £169.00 |
| Solo 5 places | £49.00 |
| Solo with grace place | £49.00 |
| Solo 6 places, upgraded day 11 of 30 | £62.33 |
| Builder 8 places, 1 of 31 days | £69.65 |

Validation is targeted core tests plus web loader/static-render tests. These are deterministic checks, not independent RED review or browser evidence. Full required CI and the independent RED review against the router's exact committed head remain required before merge.
