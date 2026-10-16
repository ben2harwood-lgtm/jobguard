# MON-5B synthetic server slice

Plan of record: BUILD_PLAN.md §5.1–5.6, §10.2.1–10.2.5, MON-5 (:2215),
SV-7 (:1901). Issued order 16 October 2026 supersedes the 13 October draft's
kit hold. This implementation is partial builder work, awaiting independent review.

## Quote companion

Both quote creation repositories attach `cancellation-kit.v1` to every **new**
quote snapshot when the server selects `synthetic_demo`. This includes domestic
quotes without inferring a legal domestic classification from a customer's party
type. The companion carries the exact label:

> synthetic template, not reviewed (D06 v2)

It contains a blank fictional cancellation request, its template version and
SHA-256, and exact quote revision, document version and reference. The strict
quote schema checks those bindings. The PDF includes the companion and manifest,
so its existing approval content hash covers them. This does not select legal
rights, deadlines, service methods or production terms. Downloading the form
submits nothing. MON-5A owns customer acceptance and any new approval gate.

The existing immutable JSON snapshot stores the companion; no column or table
is added. Old snapshots remain readable and render without a companion exactly
as before. Preview reuses an old artifact; direct creation retries preserve a
legacy document rather than silently adding a kit. A new document version gets
the kit. Historical documents are never backfilled. A companion supplied outside
synthetic mode is refused by the attachment helper; legacy creation behavior
outside that mode is unchanged and supplies no new real-use authority.

## Message observation

`customer-message:exposed-wires.synthetic.v1` recognizes exactly the labelled
fictional text `There are exposed live wires beside the new socket.` and only
the `customer_request` source kind. It emits the unchanged `observation.v1`
schema with a full exact citation, unknown price and safety implication. Unknown
or edited originals stay unprocessed. This is a deterministic synthetic fixture
adapter, not a text classifier or a reviewed production safety policy.

The SV-7A source reader continues to verify original bytes/hash/version,
tenant/job links, finalized upload and evidence, invalidation and receive time.
The shadow worker uses its existing terms gate, detection/sink and mandatory
safety disclosure path. Nothing in builder message reads queries shadow state.
No scheduling owner, audit format, fee calculation or privilege changes.

## Customer execution hold

The actual merged #225 switch (`0165_practice_worker_switch.sql`) permits
operative, supervisor, surveyor and client_approver members **within a contractor
company**. Its company predicate requires `contractor_member_active` and
organisation-management authority. SV-7A's insert guard and source reader accept
only `small_builder` jobs. The two persisted session types and ownership rules
are distinct. Neither supplies a small-builder customer/job binding.

No new role, tenant access, session issuer, customer identity or constructor is
inferred. Customer-message POST execution, its replay/authority assertions and
the full customer-to-evidence journey remain held pending the approved seam.
The new integration test uses SV-7A's explicitly labelled migration-role fixture
to exercise stored-source-to-worker behavior; it cannot prove customer intake.
Real links/customers, diary intake, UI and all live releases remain held.
