# ENT-2 work-order import v1 and schedules of rates

Synthetic data only; no production or pilot capability, no connector, no outbound action. This contract describes what migration `0110_work_orders.sql`, `packages/db/src/work-order-repository.ts` and the `/contractor/work-order-imports` surfaces do.

## Authority (Ben, 9 October 2026, card `jobguard-ent-2-import-roles-2026-10-08`, answer "Existing roles")

- A **work-order import** is run by a member holding `organisation.manage` (owner, admin) or `data.import` (finance). That is exactly the predicate CH-3b's `app.bind_contractor_parties` (0102) enforces per order, so every order's import and its party binding agree.
- A **schedule-of-rates (SoR) version import** is run by a member holding `contract.manage` (owner, admin, commercial_manager), tenant-wide.
- No new permission and no change to any role's permission list. Surveyor and every other role get no import; a non-member is refused. Out-of-scope is the same not-found (`NOT_FOUND`, 404) as a non-existent id. A small-builder-track tenant is refused with `TRACK_FORBIDDEN` (403).
- The SQL copy of ENT-1's matrix (`app.contractor_role_permits`) is proved equal to `app.contractor_allowed` for a real member of every role. One difference from the core matrix is recorded and tested: core gives `client_approver` `extra.approve` (when a decision awaits them, ENT-5); the SQL function that ENT-2 mirrors never does.

## The file

`work-order-import.v1` is one order per CSV record (RFC 4180 quoting; LF or CRLF). The header is fixed:

```csv
version,clientId,contractId,workOrderReference,issuedOn,dueOn,priority,status,expectedRevision,siteRevisionId,resident,teamId,assignedMembershipIds,lines
```

`resident`, `assignedMembershipIds` and `lines` are JSON cells; blank client, contract, site, resident, due date and team cells mean null. Receipt row numbers count CSV records including the header (the first order is row 2). Input is bounded to 16,000,000 characters and 10,000 order records. An unknown or reordered header, or broken quoting, refuses the whole file (`INVALID_CSV_HEADER`, `INVALID_CSV`); every other fault is a typed error on that one row.

An input line carries only `clientLineReference` (non-empty or null), `sorCode` and `quantity` (a canonical non-negative decimal: up to twelve integer digits and six fractional places). Prices, tenant, provenance, track, status overrides and origin are server authority and are refused as fields. `priority` is `routine | urgent | emergency`; `status` is `ordered | cancelled`.

In `synthetic_demo` the screen and HTTP route import only **generated, selectable** files (Q8): `POST /api/contractor/work-order-imports` takes `source: { kind: "generated", sample }`, and `{ kind: "csv" }` is refused with `UPLOAD_NOT_ALLOWED`. The same service (`WorkOrderApplication.importFile`, `WorkOrderRepository.importCsv`) accepts a caller-supplied CSV for the later API (B1); no route exposes it while uploads are disallowed.

## Identity, revisions and replay

- Order identity is (tenant, client contract, client work-order reference).
- A **new** order runs, in one savepoint inside the file's transaction: draft `work_order` job with provenance `work_order` and its immutable contractor job-track binding (SH-1) -> CH-3b `app.bind_contractor_parties` (refuses with `CONTRACTOR_PARTIES_REQUIRED` unless client, contract, site and resident contact or reason are all present) -> pricing -> the order, revision 1, lines, scope identities and assignments -> the job enters `live`. No quote, acceptance, obligation, journal, cap or fee-policy row is written; the job's baseline, net value, fee-policy and cap columns stay null (a CHECK, not a convention).
- An **identical** row (same revisable content) is a recorded no-op: outcome `unchanged`, receipt only. A **changed** row appends one immutable revision with its diff and fresh immutable lines. A **cancellation** is a revision (status `cancelled`) that keeps the order's last lines and so their identities.
- Revisable content: status, issue and due dates, priority, team, assigned operatives and the lines. The parties (client, contract, site, resident) are bound once per job by CH-3b; a revising row must restate them, and a different site, client, contract or resident is refused (`PARTY_CHANGE_REFUSED`), an incomplete restatement `CONTRACTOR_PARTIES_REQUIRED`.
- `expectedRevision` is the revision the sender saw (0 for a new order). A changed row whose expected revision is not the current one is `STALE_REVISION`; an identical row is a no-op whatever it expects. A cancellation of an unknown order is `ORDER_NOT_FOUND`.
- Each line mints a `scope_item_id` in the existing `scope_identity` registry. A line keeps its identity across revisions when its client line reference matches, else when its SoR code and zero-based position match; quantity or price changes do not change identity. Origin is the only value `client_instruction`.
- The whole file is one transaction; a refused row commits nothing of its order and is recorded in the batch. The batch, its receipts and every audit event are written last. The **same command with the same file**, or **the same file again after a clean import** (no refused row), is replayed from the stored batch and writes nothing; the same command with a different file is `COMMAND_CONFLICT`. A file with refused rows is processed again under a new command, so a fixed schedule or party can be retried. Concurrent imports serialise on the ENT-1 tenant lock, so racing imports of one file produce one set of rows.

## Pricing and the schedule of rates

`quantity x rate x (1 + signed tendered adjustment)`, exact rational arithmetic, rounded half-even once at the line, computed by the core bigint kernel and re-verified by `app.sor_line_net_pence` in the database (a line whose net is not that exact price is refused by trigger). £100.00 at -35/1000, quantity 1, is £96.50. Zero and positive adjustments, fractional quantities, half-even ties, overflow (`MONEY_OUT_OF_RANGE`) and a negative multiplier (`NEGATIVE_MULTIPLIER`) are tested.

An order is priced against the **contract version in force when the order was created** (pinned on the order) and the **SoR version in force on the order's issue date**: the latest version listed by that contract version whose effective date is on or before the issue date (`SOR_VERSION_NOT_FOUND` if none, `AMBIGUOUS_SOR_VERSION` if two share the day). A version the contract does not list is never used. A line's rate and unit are the persisted `sor_item`'s (composite foreign key), so a later SoR version, or a later contract version listing it, never reprices a stored revision; new orders under the later contract version use it.

`sor-version-import.v1` creates an immutable `sor_version` and its `sor_item`s (up to 10,000 items) in one transaction with its audit event; the same command and payload replays, a changed payload or a second version for the same schedule and effective date conflicts.

## Scheduling (Q3): read projection only

`job_assignment` rows come from the import (one team row and one row per operative for each revision); `site_visit` is a table that ENT-3 will write. `GET /api/contractor/jobs/{id}/assignments` and `/site-visits` are the only routes: there is no office scheduling command and no new role. A job's team is the team of its **current** revision's assignment; `app.contractor_job_allowed` resolves job scope from it (tenant, region, branch or team grants through the team's branch and region; an operative also needs an active team membership and an assignment to the job). A job with no team resolves to no scope and reads as not-found for everyone, including every resident-contact read. `app.read_contractor_resident` (0102) now uses this resolution, which supplies the team-scoped positive cases CH-3b could not prove.

## Personal data

The resident contact is bound and stored only by CH-3b. It does not appear in any ENT-2 list, projection, receipt, revision, diff, audit payload, job title or log. Audit payloads are identifiers, hashes and the operational classification only (strict schemas). Receipts carry the client's own order reference and a typed error code, nothing else.

## Not in this leaf

Extras, variations and `extra_origin` (ENT-4b), "Log an extra", visit start and complete and `closeout_answer` (ENT-3), approvals (ENT-5), billing export (ENT-6), connectors (ENT-13a). The §9.4 row "Client formally instructs a logged extra later" belongs to ENT-3 and ENT-4b: this leaf creates no variation. An order's issue date is not checked against the contract's start and end dates. A cancelled order's job stays `live`; ENT-3 and later decide what a cancellation means on site.
