# 2069 · V2 spoken-job understanding and the model-reader ledger

The checked V2 bootstrap applies 2069 after 2027. The shared runner leaves
databases without the dedicated V2 database name and firm policy untouched, so
the hosted synthetic demo has neither table, and the capture there never calls
the model reader.

It adds `app.v2_job_understanding`: one row per capture whose proposal was
built from Reader A combined with the model reader (V2-SQ-G). It holds the
combined `job-understanding.v1`, Reader A's own, and the contract, reader and
prompt versions. Forced row security reaches it through the job, as 2002 does,
so each practice firm sees only its own.

It adds `app.v2_ai_call`, an append-only ledger. A call is a `reserved` row
written before the call and a `settled` row written after it; a trigger
refuses a settled row with no reservation. The UTC month and day are derived in
the database. No job exists when a call is made, so this table is locked on
the tenant only, and it stores no session digest. The runtime can read and
insert only.

For a forward fix, add a subsequent V2 migration and keep the rows: the ledger
is the record of spend against the practice cap.
