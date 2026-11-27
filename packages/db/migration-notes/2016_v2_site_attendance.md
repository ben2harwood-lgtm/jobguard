# 2016 · V2 who was on site today

The checked V2 bootstrap applies 2016 after 2027, because its guard reads the
crew records. The shared runner leaves databases without the dedicated V2
database name and firm policy untouched.

It adds `app.v2_site_attendance`: one current row per job, Europe/London day
and person (a crew record of the job's firm, or the builder who tapped "Me").
A second tap is a replay of the same command or the next revision of that
person's day, for example "not on site after all". Rows are immutable, and a
foreign key keeps every revision on its predecessor.

The table stores no location, IP address, device or user agent. Forced row
security limits the runtime to its own tenant and to jobs visible to its firm
(`app.job` carries the restrictive `v2_practice_firm` policy). The table
also carries its own restrictive `v2_practice_firm` policy, joining `app.job` on
`(tenant_id, job_id)` as FL-1's guard requires. The runtime can read and insert
only. An `AFTER INSERT` trigger refuses a crew id that is
not a crew record of the job's own firm, and a day outside today and the six
days before it.

For a forward fix, add a subsequent V2 migration and keep the attendance rows.
To rehearse the preceding branch, keep the existing V2 state for reference and
use fresh state in a separate checkout.
