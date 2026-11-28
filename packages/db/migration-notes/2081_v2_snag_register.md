# 2081 · V2 snag register

The three tables carry the same restrictive `v2_practice_firm` lock as every V2 table, joined to `app.job`.

The checked V2 bootstrap applies 2081 after 2056, which brings main's QW-4 snag
list into V2. The shared runner leaves databases without the dedicated V2
database name, the firm policy, main's snag tables or the V2 crew records
untouched.

It adds three records beside main's snag list, which stays unchanged:

- `app.v2_snag_owner`: the snag's owner as a crew record of the job's firm,
  or both columns null to fall back to main's free-text label. Latest wins.
- `app.v2_snag_event_person`: which person (the builder, or a crew record) did
  each fixed, checked or reopened event of `app.snag_event`. An `AFTER INSERT`
  trigger refuses a checked event whose person is the person on the latest
  fixed event before it (`V2_SNAG_CHECKER_IS_FIXER`), so the main event rolls
  back with it.
- `app.v2_snag_agreed`: the builder's mark that a snag is agreed with the
  customer to stay open at handover, with a short note. It never closes a snag.

A trigger keeps owner and person rows in the job's own firm. Row security is
forced; the runtime is confined to its tenant and, through the job's
practice-firm policy, its firm. It can read and insert only, and rows are
immutable. There is no SECURITY DEFINER function. A second run changes nothing.

For a forward fix, add a subsequent V2 migration and keep the rows. To rehearse
the preceding branch, keep the existing V2 state for reference and use fresh
state in a separate checkout.
