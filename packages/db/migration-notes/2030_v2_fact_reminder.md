# 2030 · V2 reminders for unanswered replies

The checked V2 bootstrap applies this migration after 2023 (E2 replies). The
shared runner leaves databases without the V2 name, the firm policy or E2's
request table untouched.

No backfill is needed. A job starts with no reminders.

`app.v2_fact_reminder_run` records one press of "Run reminders now
(practice)": its command id, request digest, actor, the run's clock and the
result. An exact retry returns the stored result and sends nothing again; the
same id from another actor or with other content is refused.

`app.v2_fact_reminder` holds at most one `reminder` and one `unconfirmed` row
per E2 reply request. The primary key (tenant, job, request, kind) is the
"exactly one chase per request" rule in the database. A reminder row names the
request's own `.invalid` contact (a CHECK, and the code copies it from the
request); an `unconfirmed` row names its reason (`no_reply` or
`link_expired`) and no one. Every row points at the run that wrote it.

When a row is due is decided in code (`v2-fact-reminder-policy.ts`): a reminder
from the later of 08:00 London two days before the needed-by date and a day
after the request, until 08:00 London the day before; the flag from 08:00
London the day before. A reply, a cancel, a changed question, a newer request
or a corrected recipient stops both.

Runtime can only read and insert rows for visible jobs. A trigger refuses any
UPDATE or DELETE, even by the owner. No SECURITY DEFINER function is added.

The audit payloads hold ids and the run's request hash only: no address,
question or answer. The reminder reaches only the local catcher, as metadata,
after commit; it carries no new link.

Correct the schema with a later V2 migration if needed.
