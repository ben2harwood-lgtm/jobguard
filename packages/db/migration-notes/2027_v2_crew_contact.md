# 2027 · V2 crew contacts and bound task assignment

The checked V2 bootstrap applies 2027 after 2001 to 2004. The shared runner
leaves databases without the dedicated V2 database name and firm policy
untouched.

It adds `app.v2_crew_contact`, the practice firm's own crew records (name,
trade, a fictional phone number from Ofcom's drama ranges and an optional
`.invalid` email). Each row carries the firm key, and forced row security
limits the runtime to its own tenant **and** firm, because V2 practice firms
share one backing tenant. The runtime can read and insert only. Rows are
immutable: a correction is the next revision of the same crew record, and a
foreign key keeps every revision in the first revision's firm.

An `AFTER INSERT` trigger on `app.v2_work_plan_edit` refuses an edit whose
`assigneeRef` does not name a crew record of the job's own firm. Existing
edits, including free-text assignees, are retained and unchanged.

For a forward fix, add a subsequent V2 migration and keep the contact rows. To
rehearse the preceding branch, keep the existing V2 state for reference and use
fresh state in a separate checkout.
