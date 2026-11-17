# ENT-3c — order check and server-priced site extras v1

Third part of plan leaf ENT-3 (BUILD_PLAN §9.2). Server only; made-up practice data only; UI is parked (Ben, 11 October), so there is no screen,
no page and no browser journey here. Ruling A1 (Ben, “Yes, side note”, 12 October) un-holds the pricing basis; ruling A2 puts the server-priced first
revision in a side table; ruling A3 stops at “logged”; ruling A4 holds the supervisor query; Q2 settled that an excess is priced as its own line.
The coordinator’s ruling “B-prime” (12 October ~22:35) classifies the new write route `pre_live_allowed` with its own live-job guard.

## Definitions

ENT-3a’s definitions (work-order job, current revision, cancelled order, the caller / the member, the caller’s role, active member, named on the job,
authority fields, synthetic only) apply unchanged. New here:

- **Schedule item:** a row of merged `app.sor_item` (version, code, description, unit, rate in pence). **The job’s price list:** the `sor_version_id` stored on
  the CURRENT revision of the job’s work order — the version the merged import chose for that revision. This piece never chooses a version by date.
- **Baseline:** the `app.work_order_revision` that merged ENT-4b stores on the extra’s origin. The price and the order check of an extra use ITS price list,
  ITS two adjustment integers and ITS lines.
- **Order line; instructed quantity:** a row of merged `app.work_order_line`, identified to callers by its `scope_item_id`; its `quantity`.
- **Claimed quantity:** the TOTAL quantity of the item the caller says was done on that line (not “how much more”): canonical decimal text, at most 12 whole
  digits and 6 decimal places, greater than zero (merged `sorQuantityV1`, plus “not zero”).
- **Order check `order-check.v1`:** given a code, a claimed quantity, optionally one named order line, and the lines of one revision: (a) a named line must be
  on that revision and carry that code, else `ORDER_LINE_NOT_FOUND`; (b) with no line named: no line carries the code → `new`; exactly one → that line is compared;
  more than one → `ORDER_LINE_AMBIGUOUS` (the caller names the line, Q5); (c) claimed ≤ instructed → `already_on_order` (equal counts as within; compared as numbers, so
  “3.0” equals “3”); claimed > instructed → `more_than_ordered`, extra quantity = claimed − instructed. For `new` the extra quantity is the claimed quantity. Earlier extras are
  never netted off (Q6). The stored value `coverage` uses ENT-4a’s words: `new` → `new`, `more_than_ordered` → `excess`; `already_on_order` is never stored.
- **Price:** merged `app.sor_line_net_pence(extra quantity, the item’s rate, the baseline’s adjustment numerator, the baseline’s adjustment denominator)`. One line, rounded once,
  at least 1p (Q3).
- **First priced revision record:** one row of `app.extra_sor_revision`, at most one per extra, `revision=1`, never changed or removed. **Pricing-basis record:** one row of
  `app.extra_pricing_basis` beside a revision, one of ENT-4a’s three `priceSource` values; the only one this piece writes is `server_sor` for revision 1.
- **May log:** ENT-3a’s routine `app.ent3a_extra_authority(member, 'LogSiteExtra', job)` answers `allowed`. That one call decides who and which job; this piece writes no role list.
  **Caller-only refusal (`EXTRA_FORBIDDEN`, 403)** is identical for every job ID; **job refusal (`NOT_FOUND`, 404)** is identical for every cause. Authority is decided before any other
  fact is read.
- **Nothing written:** no new row in `app.command_receipt`, `app.scope_identity`, `app.scope_lineage`, `app.variation`, `app.extra_origin`, `app.extra_event`, `app.extra_sor_revision`,
  `app.extra_pricing_basis`, `app.variation_revision`, `app.extra_duplicate_link`, `app.extra_order_line_link`, and no `contractor.extra.raised` audit event. The one row a refusal may add is
  ENT-3a’s own `contractor.extra.refused` audit event, and only for `TRACK_FORBIDDEN`, `EXTRA_FORBIDDEN` and `NOT_FOUND`.
- **Replay:** the same command ID with the same body from the same member on the same job returns the first result and writes nothing, even if the order, the price list or the member’s
  grants have changed since, provided the member may still log on the job. **Conflict (`IDEMPOTENCY_CONFLICT`, 409):** the same ID with a different body, job or member, or an ID already used by any
  other command (ENT-3a’s free-text log included).
- **Server time:** `server_recorded_at` of the record is the origin’s own, copied by the database. No request value can set a time.

## Money

One money figure is computed: the net price in pence of the extra quantity, once, in the database, by merged `app.sor_line_net_pence`. Nothing in TypeScript does arithmetic on pence
and no answer carries a money value (Q7). The rounding rule is the merged one (half-even, once, at the line).

**Worked table** (rates are the merged demo’s; adjustment −35/1000 unless a row says otherwise; stored `quantity` is the extra quantity):

| Row | Case | Claimed | Instructed | Extra qty | Exact before rounding | Stored pence |
|---|---|---|---|---|---|---|
| M1 | new, CLEAR-GUTTER 350p | 1 | – | 1 | 337.75 | 338 |
| M2 | new, CLEAR-GUTTER | 1.625 | – | 1.625 | 548.84375 | 549 |
| M3 | new, CLEAR-GUTTER | 2 | – | 2 | 675.5 (tie, odd below) | 676 |
| M4 | new, PAINT-ROOM 25000p | 0.5 | – | 0.5 | 12062.5 (tie, even below) | 12062 |
| M5 | new, CLEAR-VOID 18000p | 1 | – | 1 | 17370 | 17370 |
| M6 | new, REPAIR-DOOR 10000p, order does not carry it | 1 | – | 1 | 9650 | 9650 |
| M7 | excess, REPAIR-DOOR | 3 | 1 | 2 | 19300 | 19300 |
| M8 | excess, FIT-LOCK 4500p | 5 | 2 | 3 | 13027.5 (tie, odd below) | 13028 |
| M9 | excess, FIT-LOCK | 3 | 2 | 1 | 4342.5 (tie, even below) | 4342 |
| M10 | excess as its own line, CLEAR-GUTTER | 6 | 4 | 2 | 675.5 (tie, odd below) | **676** (the alternative reading, whole-claim price 2026p minus instructed price 1351p, would be 675p) |
| M11 | fractional excess, CLEAR-GUTTER | 5.625 | 4 | 1.625 | 548.84375 | 549 |
| M12a | adjustment +50/1000, REPAIR-DOOR new | 2 | – | 2 | 21000 | 21000 |
| M12b | adjustment 0/1, CLEAR-GUTTER new | 1 | – | 1 | 350 | 350 |
| M13a | rounds to nothing (Q3) | 0.001 | – | 0.001 | 0.33775 → 0 | refused `EXTRA_NOT_POSITIVE`, nothing written |
| M13b | smallest accepted | 0.002 | – | 0.002 | 0.6755 | 1 |
| M14a | rate 1000000000000p, adjustment −35/1000 | 1.03 | – | 1.03 | 993950000000 | 993950000000 |
| M14b | too large | 1.04 | – | 1.04 | 1003600000000 | refused `MONEY_OUT_OF_RANGE`, nothing written |

## Routes, bodies, answers, codes

- `POST /contractor/jobs/:id/site-extras/sor` (Next: `/api/contractor/jobs/[id]/site-extras/sor`), success 201, documented 409 with code enum exactly `["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]`.
  Body `log-sor-site-extra.v1` = `{ version, commandId, sorCode, quantity, orderLineScopeItemId?, note }`, strict. There is no description field: the stored description is the schedule item’s own (Q13).
  Answer `sor-site-extra-logged.v1` = `{ version, environment:"synthetic_demo", realExternalActions:0, jobId, extraId, state:"logged", orderCheck:{ outcome, sorCode, unit, claimedQuantity, instructedQuantity, extraQuantity,
  orderLineScopeItemId }, priceSource:"server_sor" }`. `priceSource` is the label of where a price came from, not a value.
- `GET /contractor/jobs/:id/sor-items?q=` → `site-sor-items.v1` (items of THIS job’s price list whose code or description contains the text, compared with `position()` so no pattern character has a meaning, in
  code order, at most 50, with `truncated`). The text is REQUIRED, 1 to 80 characters after trimming (Q10 struck the “recent items” list; a missing or empty text is `INVALID_COMMAND`, nothing is read).
- `GET /contractor/jobs/:id/order-check?sorCode=&quantity=&orderLine=` → `site-order-check.v1` (all three outcomes, `already_on_order` included as a result).
- Failure body `sor-site-extra-error.v1` = `{ version, code }`. Codes and statuses: `UNAUTHENTICATED` 401, `MODE_FORBIDDEN` 403, `ORIGIN_FORBIDDEN` 403, `TRACK_FORBIDDEN` 403, `EXTRA_FORBIDDEN` 403,
  `INVALID_COMMAND` 400, `INVALID_QUANTITY` 400, `NOT_FOUND` 404, `JOB_NOT_LIVE` 409, `IDEMPOTENCY_CONFLICT` 409, `SOR_ITEM_NOT_FOUND` 422, `ORDER_LINE_NOT_FOUND` 422, `ORDER_LINE_AMBIGUOUS` 422,
  `ALREADY_ON_ORDER` 422, `EXTRA_NOT_POSITIVE` 422, `MONEY_OUT_OF_RANGE` 422, `SITE_PRICING_UNAVAILABLE` 503. A body valid apart from its quantity is `INVALID_QUANTITY`; any other invalid body is `INVALID_COMMAND`.
- Every response is `Cache-Control: no-store`. No answer carries a money key.
- Registry: `/api/contractor/jobs/[id]/site-extras/sor` and `nest:/contractor/jobs/:id/site-extras/sor` are `pre_live_allowed` (ruling B-prime: contractor work-order jobs have no pre-live phase, and the route carries its own
  live-job guard). The class switches off NO runtime check for this route; it only removes the shared harness and guard-list expectations. Gap (owned, FIX-LATER): extend the shared replay harness to
  contractor-track jobs in the synthetic database and move these routes onto it. `watchdogCommandGuards` is not touched.

## Tables and routines (migration `0140_site_extra_pricing.sql`)

Two tables, five routines, triggers on the two new tables only; no change to any existing object. Both tables: owner `jobguard_migration`, row security enabled and forced, the merged two-role tenant policy, the merged
immutability trigger, and `GRANT SELECT` to `jobguard_runtime` only (standard F). `app.extra_sor_revision` is complete on purpose (a later piece may fingerprint whole rows) and keeps the rate, unit, adjustment and baseline
that priced the extra. `app.extra_pricing_basis` is keyed by (extra, revision number).

1. `app.ent3c_record_sor_revision(uuid,uuid,text,text)` — SECURITY DEFINER, the ONLY writer of both tables, takes no actor, rate, price, outcome or time. Order of refusals: wrong database `MODE_FORBIDDEN`; no tenant `NOT_FOUND`;
   its own `PERFORM app.ent3a_require_extra_authority(p_job,p_variation)` checks the stored raising member's current authority under ENT-3a's tenant lock (`NOT_FOUND` on refusal, before any price or write);
   bad hash `INVALID_COMMAND`; bad or zero quantity `INVALID_QUANTITY`; the stored origin must be a contractor site command (`INVALID_COMMAND`); its receipt must still be `processing` for the same actor (so it runs only inside the
   raising command); the variation must carry the schedule item; the baseline must be `ordered` with the variation’s price list and excess revision (`ORDER_CHECK_STALE`); the item must exist (`ORDER_CHECK_STALE`); the
   order check is decided again from the baseline’s own lines (`ALREADY_ON_ORDER`, `ORDER_CHECK_STALE`); price by the merged function (`MONEY_OUT_OF_RANGE` passes through; below 1p is `EXTRA_NOT_POSITIVE`); insert the revision; insert the basis.
2. `app.ent3c_sor_revision_guard()` — BEFORE INSERT, binds every writer including the owner; sets `server_recorded_at` and `content_hash` itself.
3. `app.ent3c_require_sor_revision_audit()` — deferred at commit: the revision shares the origin’s transaction and exactly one `contractor.extra.raised` audit event with the same command and origin hash (`PRICING_AUDIT_REQUIRED`).
4. `app.ent3c_pricing_basis_guard()` — BEFORE INSERT: only `server_sor`, revision 1, beside a revision row of the same extra, hash, command and member, inside its command.
5. `app.ent3c_require_pricing_basis()` — deferred at commit: a priced revision never exists without its basis (`PRICING_BASIS_REQUIRED`).

Hash `extra-sor-revision-hash.v1`: SHA-256, lower-case hex, of the UTF-8 text `extra-sor-revision-hash.v1`, a line feed, then nineteen values framed as merged `extraOriginHashV1` frames them (NULL is `N;`, anything else is
`S<byte length>:<value>;`): tenant_id, job_id, variation_id, revision, origin hash, work_order_id, work_order_revision_id, sor_version_id, sor_code, unit, rate_pence, adjustment_numerator, adjustment_denominator, coverage,
excess_of_scope_item_id, instructed_quantity, claimed_quantity, quantity, net_pence. The TypeScript mirror is `extraSorRevisionHashV1`.

## The command, in order (`SiteExtraRepository.logSorSiteExtra`)

Parse strictly → authority first through ENT-3a’s private pre-check (and the same live-job guard it applies after an `allowed` answer) → replay lookup (same job, member and request hash returns the first result; anything else, or a receipt
of any other command under the ID, is `IDEMPOTENCY_CONFLICT`; this comes BEFORE the order check) → live guard and order check in one short transaction → merged `raiseExtra` with a seam that awaits `requireLiveJob`, then ENT-3a’s
`siteExtraAuthoritySeam`, then the pricing routine (each step records its own exact refusal in a local variable of the call, because `raiseExtra` rewrites every error it does not know) → the stored result is read back.
Lock order inside the write transaction: merged `raiseExtra` takes its per-job advisory lock first, then the job row share lock (held to commit) and the tenant administration share lock, then the rows the routine reads; the audit append is last and nothing
is locked after it. The live-job guard cannot be the transaction’s first lock (Q9). A replay after the job has left live still returns its first answer; a new log is `JOB_NOT_LIVE`; the two reads work on a job that is no longer live.

## Held, and honest limits

HELD: every screen and browser test (ENT-3e); dictation; “submitted” (`awaiting_approval`, requirement snapshot, `variation.state`: ENT-5); the supervisor query for an item within the order (ENT-5); “work status, with the proceed limit shown”
and candidate-duplicate flagging (nobody owns them yet); a revision record for a free-text extra and the `surveyor_quoted` / `unpriced` basis records; any read of the stored price for a person; photo and resident confirmation (ENT-3d);
visits and close-out (ENT-3b); offline capture (ENT-12); acting as a made-up site worker; office and client-instructed extras; fees (ENT-7); VAT.

1. Only the practice owner can hold a contractor practice session today and an owner may not log a site extra, so no signed-in person reaches a success path; it is proved through the repository and at service level.
2. Standard F: the writer carries its own authority check, using the stored origin's member, command and grant. A raw runtime-role call cannot bypass ENT-3a's authority rule; the raising receipt must also be in flight.
   No direct write grant is added. This check relies on the authenticated tenant context and existing stored origin; it does not establish the identity of a compromised database client.
3. The database does not force every schedule-item extra to have a price (merged ENT-4b tests raise such extras with none); the rule binds the one method.
4. The price is named in no audit payload; the record is tied to the raising transaction’s one audit event at commit and to the origin hash (Q8).
5. The live-job guard is not the write transaction’s first lock (Q9).
6. The pre-check and the command are separate transactions; the routine decides again from the stored baseline, so an order revision in between gives a refusal or a retry-safe 503, never a mixed record.
7. Nothing reads the stored price back to a person; ENT-5 owns that.
8. A free-text extra still has no revision record of any kind.
