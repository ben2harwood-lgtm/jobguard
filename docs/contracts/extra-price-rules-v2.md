# Extra price rules v2 (pricing contract v2)

EP-CC-S1, Enterprise R1 workstream F (commercial controls). This contract adds two commands, `price-extra.v2` and `revise-extra.v2`, and a read, `extra-pricing-basis-query.v1`. It does not redefine [extra-price-rules-v1.md](extra-price-rules-v1.md): v1's Q01 money rules (whole GBP pence, 1 to 1,000,000,000,000, surveyor-only, a change of price is a new revision) and its Q03 contract binding still hold. Made-up data only. Real use waits on Gate G1, and nothing here opens a gate.

## 1. Every price states its basis

A price or revision gives exactly one basis:

| `basis.kind` | The caller gives | The database records |
|---|---|---|
| `server_sor` | `sorCode` (1–80 chars) and `claimedQuantity`: the **total** quantity claimed, as decimal text (up to 12 integer and 6 fractional digits, above zero) | The rate-list version, rate, unit and tendered adjustment of the job's current, ordered work-order revision; the order coverage; and the instructed, claimed and priced quantities. It also records the net in pence. |
| `surveyor_quoted` | `netPence` (whole pence, 1 to 1e12), `method` (`dayworks`, `quotation`, `agreed_lump_sum` or `materials_plus`), `note` (the basis note: 1–500 characters, not blank) and, optionally, one `evidenceId` | The net exactly as given, the method and the note, plus the evidence item. That item must be verified, current and original evidence **of the same job**; anything else is `EVIDENCE_NOT_FOUND`. |

The caller never sends a rate, an adjustment, a discount, VAT, a currency or a rounding rule. For `server_sor` the caller does not send an amount either. Any extra field is `INVALID_COMMAND`.

### Server-priced rate codes

- **Rate and adjustment.** The rate is the `sor_item` of the rate-list version bound to the job's current work-order revision. The adjustment is that revision's tendered adjustment, so it is the contract's terms as imported. Neither ever comes from the caller.
- **Already on the order.** If the code is on that revision's lines, the instructed quantity is the sum of all its lines with that code. Only the excess is priced: `priced = claimed − instructed`. A claim at or below the instructed quantity is refused `ALREADY_ON_ORDER`. Repricing therefore never bills the instructed quantity again. A code that is not on the order is `coverage: "new"`, and the whole claimed quantity is priced.
- **Money.** The pence come only from `app.sor_line_net_pence(priced, rate, numerator, denominator)`, the same exact half-even line price that first-revision pricing uses. It follows these rules:
  - A result outside 1..1e12 is `MONEY_OUT_OF_RANGE`.
  - A result below 1p is `EXTRA_NOT_POSITIVE`.
  - Malformed quantity text is `INVALID_QUANTITY`.

  Worked example: £100.00 at −35/1000 is £96.50 (10000 × 965/1000 = 9650p). One more example, half-even: 1.625 m of a 350p item at −35/1000 = 548.84… → 549p.
- **Missing rates.** An unknown code, or a job without a current ordered revision, is `RATE_NOT_FOUND`.

## 2. Commands

### `price-extra.v2`

`{ version, commandId, jobId, extraId, basis }`

This is the first price of a contractor extra. It works from two states:

- logged and never submitted;
- submitted **unpriced** and not yet decided (late pricing).

Late pricing supersedes the unpriced request: the request is opened again at the new net, the old request is refused as stale, and its open Decision is dismissed. Any other state is `INVALID_TRANSITION`. An extra whose first revision was origin-priced (`LogSiteExtra` with a rate code) already has a price, so it is also `INVALID_TRANSITION`.

### `revise-extra.v2`

`{ version, commandId, jobId, extraId, basis, reason, reasonNote?, answersRequestId }`

This is a new price after the latest request was decided (approved or rejected).

- **Reason.** `reason` is one of:
  - `response_to_rejection` (allowed only when the answered request was rejected);
  - `quantity_corrected`;
  - `rate_corrected`;
  - `pricing_error`.

  `reasonNote` is optional (1–500 characters, not blank). A missing or unknown reason, or a missing `answersRequestId`, is `REVISION_REASON_REQUIRED` in the database. The repository refuses it earlier as `INVALID_COMMAND`.
- **Answered request.** `answersRequestId` must be the extra's latest, decided request, which is the one on screen. An older or unknown request is `STALE_REVISION`.
- **Net.** A revision to the same net is `INVALID_TRANSITION`, as in v1.
- **History.** The revision opens a new request revision. Earlier revisions, bindings, request snapshots and decisions stay as they were.

### Common rules

- **Permission.** Only a surveyor whose grant covers the job (`extra.price`) may price or revise.
- **Command lifecycle.** The command types are still `PriceExtra` and `ReviseExtra`, with the same receipt lifecycle:
  - the same `commandId` with the same body replays the stored answer;
  - a changed body, or another member using the same id, is `COMMAND_CONFLICT`.
- **No basis.** A v2 body without a `basis` is `BASIS_REQUIRED`.
- **One transaction.** The variation revision, the revision binding and the basis row are written in one transaction. A deferred check refuses any ordinary binding that would commit without its v2 basis row (`BASIS_REQUIRED`).
- **Audit.** The audit event records the basis id and basis hash only. It never records the note or other free text.
- **Result.** The answer carries a `basis` summary: `basisId`, `basisHash`, `pricingBasis`, `netPence`, and the rate-code detail or the method.

### v1 is not redefined

| A `price-extra.v1` / `revise-extra.v1` body that is… | Answer |
|---|---|
| a completed v1 command, replayed with the same id, body and member | its stored v1 result, unchanged |
| the same id with a changed amount, or a v2 body under that id | `COMMAND_CONFLICT` |
| the same id from another member | `COMMAND_CONFLICT` |
| any new v1 command | `BASIS_REQUIRED`, with nothing written |

The merged v1 writer `app.xa_price` is unchanged. A v1 binding cannot commit without a v2 basis row, so it can no longer create a price.

## 3. Prices made before v2

Nothing is back-filled, inferred or rewritten. The read `extra-pricing-basis-query.v1` (`{ version, jobId, extraId }`) lists each priced binding, oldest first:

- `basisStatus: "recorded"` with `basis.source: "extra-pricing-basis.v2"` for v2 prices. It includes the revision's `reason`, `note` and `answersRequestId`.
- `basisStatus: "recorded"` with `basis.source: "origin_capture"` for a rate-code price made at capture (`LogSiteExtra`). It shows the recorded origin basis, including rate, adjustment, coverage and quantities.
- `basisStatus: "basis_not_recorded"` for a manual v1 price. No basis is shown or invented.

Only covered surveyors, supervisors and commercial managers (`job.read`) may use the read. Clients never reach it.

## 4. Storage

- **New columns.** `app.extra_pricing_basis` gains nullable v2 columns, and every legacy row keeps NULL in each of them. A CHECK makes a v2 row complete for its kind and command. Foreign keys tie it to the following, all within the same tenant and job:
  - its binding;
  - the work order, its revision and the rate item;
  - its evidence;
  - the answered request.
- **Guard.** The table's guard trigger stamps the server time and computes `basis_hash` (`extra-pricing-basis-hash.v2`). It checks each v2 row against the processing receipt, its binding and variation revision, the rate, the coverage and the net from the line-price function.
- **Origin pricing table.** `app.extra_sor_revision` stays the origin-bound first revision of a capture. Its one-row-per-extra rule is read by billing, evidence packs and the order check. A later rate-code price is an ordinary binding whose detail is on its v2 basis row.
- **Grants.** The runtime keeps SELECT only on the table. The single writer `app.xa_price_v2` is SECURITY DEFINER, owned by `jobguard_migration`, and executable by `jobguard_runtime` only.

Migration: `0784_extra_price_rules_v2.sql` (forward-only; see `packages/db/MIGRATIONS.md`).

## 5. HTTP

These routes sit under the existing contractor job routes. They require a trusted origin, return `no-store`, work in synthetic mode only, and take the actor from the session:

- `POST /api/contractor/jobs/{jobId}/site-extras/{extraId}/price` takes a `price-extra.v2` body without `jobId` or `extraId`.
- `POST …/revise` takes a `revise-extra.v2` body.
- `GET …/price` returns the basis read.

Failures use `extra-pricing-error.v1` with a closed code. Statuses:

| Status | Codes |
|---|---|
| 401 | unauthenticated |
| 403 | mode, origin or permission |
| 404 | not found, `RATE_NOT_FOUND` or `EVIDENCE_NOT_FOUND` |
| 422 | malformed command, `BASIS_REQUIRED`, `INVALID_BASIS`, `INVALID_QUANTITY`, `REVISION_REASON_REQUIRED` or `MONEY_OUT_OF_RANGE` |
| 503 | database unavailable |
| 409 | anything else |

The Northside practice routes now send a `server_sor` basis (rate code plus measured quantity) and show the database's net. They compute no money. A practice revision names the request it answers in its body (the one on screen). Its reason follows that request's own recorded outcome: `response_to_rejection` after a rejection, `quantity_corrected` otherwise. Nothing is read from the extra's current state, so an identical retry of a committed revision rebuilds the identical command and replays its stored answer.
