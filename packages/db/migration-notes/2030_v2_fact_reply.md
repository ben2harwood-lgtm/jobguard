# 2023 · V2 replies

The checked V2 bootstrap applies this migration after 2029 (E1 open facts) and its firm lock 2064. The shared runner
leaves databases without both the V2 name and the firm policy untouched, and
every token function refuses outside `jobguard_v2_local`.

No backfill is needed. A job starts with no reply requests.

`app.v2_reply_recipient` holds a merchant or crew contact the builder recorded
for practice ("Recorded by you"). The address must end in `.invalid` (a
database CHECK, not only the API schema), so no real address can be stored.
When a merchant id is set, a composite foreign key to
`app.merchant(tenant_id, id, name)` makes the display name the merchant's own.
A correction is a new row naming the row it corrects; the old row stays.

`app.v2_fact_reply_request` holds one question sent by link for one open fact
at one fact version. A customer request pins the job's current party binding
and customer revision; a merchant or crew request pins one recipient row id. A
newer request, a new fact version, a new binding or revision, or a correction
of the pinned recipient makes the request out of date. It is never re-pointed.
Only the SHA-256 of the link token is stored.

`app.v2_fact_reply_cancel` records a cancelled link. `app.v2_fact_reply` holds
the one answer a request may get (unique per request, so each link is single
use), or a reply the builder pasted from a call. `app.v2_fact_reply_applied`
records that the builder applied a reply to the fact through E1's own answer
command; the reply and the fact are checked again at that moment.

Runtime can only read and insert rows for visible jobs. Nothing is ever
updated or deleted, and a seed test proves the app role is refused both.

The no-sign-in reply page writes only through `app.v2_fact_reply_receive`, a
SECURITY DEFINER function owned by `jobguard_migration` with EXECUTE revoked
from PUBLIC and granted to the runtime role only. It copies the customer job
link's anonymous check (`control_plane.lp11_customer_scope`, 0765): a private
scope row keyed on the transaction, opened only for the one request whose
token hash matches, and closed before commit. Unknown, expired and cancelled
tokens are refused alike and counted in `control_plane.v2_fact_reply_failure`;
after 20 failures in ten minutes every link is refused until the window
passes. The limit is global because an unknown token names no request.

The audit payloads hold ids and hashes only. The email hash in the
`v2.reply_recipient.recorded` payload is a reference for matching records,
not anonymisation: a known address can be hashed and compared. The token and its hash never enter the audit payload.

Known limit: the Next.js dev server prints request paths, so a `/reply/<token>`
page load appears in the local launcher's terminal. The reply POST sends the
token in the body, and the API never logs or returns it in an error. Hiding
the page path from the dev log is left for the hosted-pilot packet.

Correct the schema with a later V2 migration if needed. To rehearse the
previous branch, keep its database in a separate checkout with separate state.
