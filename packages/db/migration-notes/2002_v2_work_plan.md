# 2002 V2 work plan

The standard runner discovers 2002. It makes no schema or authority changes
outside the dedicated V2 rehearsal database. V2 bootstrap verifies its target
and runs 2002 after 2001 installs the restrictive firm policy on the parent job.
There is no backfill. Existing draft and accepted quote revisions can be planned
on demand. The shared catalogue proof is empty because the V2 tables are absent
from those databases. The V2 PostgreSQL test checks the actual tables and grants.

The quote revision identifies one plan within its job and tenant. Carrying the
revision and stable scope ID in each task also lets a foreign key bind that task
to the precise quote line. Task descriptions, trade, duration, prerequisites,
material needs, proof and choices resolve from the saved template key and task
keys. A template change that would alter saved plans needs a new template key.

Both tables force RLS. The bound tenant helper and visibility of the parent job
both have to pass. Runtime can select and insert. Reopening needs neither update
nor delete authority. The plan and all tasks commit together, and the unique
plan key serializes overlapping generation requests.

Forward fix in a later V2 migration. For local rollback, retain the rehearsal
database for reference and provision fresh V2 state with the intended checkout.
