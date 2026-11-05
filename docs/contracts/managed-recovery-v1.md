# MON-9 practice choice surface v1

RED: money and tenant isolation. Synthetic preparation only; the managed-recovery
service is **not on offer**. Pilot data, a solicitor's view on damages-based
agreements, the exact D01 service table and the release gate remain with Ben.
G0–G5 remain closed. No provider, partner, drafting, sending, issuance or collection
is introduced. No database migration, role or grant changes.

The unlinked page `/jobs/[id]/recovery-cases/[caseId]/managed-recovery` reads and
writes `/api/jobs/[id]/recovery-cases/[caseId]/managed-recovery`. Both methods use
one server-only boundary and return `Cache-Control: no-store`. Outside
`synthetic_demo`, the page and API return not-found.

Authority comes from `jobguard_session`, its sole current membership and the
existing verified-context bridge. Only an owner may proceed. Ambiguous sessions
with multiple memberships fail closed; no client tenant selector is introduced.
Tenant/actor headers have no authority. The repository additionally binds the
persisted session digest to the actor and rechecks owner membership and case scope.
POST requires the existing configured trusted-browser-origin gate, before reading
the body or resolving identity.

GET returns the existing repository invoice preview under `preview`, plus the
`managed-recovery-screen.v1` display envelope: existing schema-derived choices,
terms version, formatted preview amounts, the unchanged success-fee label and a
plain-language message. The browser performs no fee arithmetic. Without election,
the preview has no service-charge line. The success-fee derivation is unchanged.
GET never elects a service.

POST accepts exactly `managed-recovery-election-command.v1`: `version`,
`commandId`, `caseId`, `termsVersion`, and `selection` (`service`, `points`). It
uses the existing strict schema and requires the body case to match the path.
Actor, tenant, price, status and other extra fields are refused. No new command
type is introduced; the POST route is classified as `post_live_billing`.
An explicit radio choice and confirmation are required on screen. The repository
binds the case, points and terms, serializes elections, refuses election after
pursuit, and handles identical replay and changed-body conflicts.

The browser stores the exact command in tab session storage **before** submission.
Uncertain transport/server outcomes preserve that body and ID for retry, including
after reload. While uncertain, changing the choice is disabled. Definite refusal
closes the form; access refusal also clears the displayed case. Responses use 400
for invalid commands, 403 for untrusted origins, the same 404 for missing/foreign
cases or refused roles, 409 for election conflict or pursuit already started, and
a redacted 503 for unavailable/uncertain results.

Boundary unit tests use a persistence double and the real pure recovery policy;
they are not database evidence. The adjacent route integration test uses real
PostgreSQL fixtures for replay, isolation, pursuit and unchanged nonzero fees.
The browser spec is a transport rendering fixture for mobile-360 and desktop:
confirmation, keyboard use, 44px controls, accessible names/landmarks, text
contrast, overflow, reload/retry and pursuit refusal. Its native Chromium checks
are scoped form accessibility checks, not a comprehensive axe audit. CI must run
the database and headless browser suites; this sandbox cannot run them.
