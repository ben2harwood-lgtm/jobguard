# 2087 · V2 quote laid out by room

The checked V2 bootstrap applies 2087 after the earlier V2 migrations. The
shared runner leaves databases without the dedicated V2 database name, the
firm policy or `app.quote_line` untouched.

It adds `app.v2_quote_section`, one row per included line of a quote
revision: the room it sits in, the room's place in the quote, and whether the
customer sees that room itemised or as one room total. It stores no price.
Totals still come from `app.quote_line`, and a room figure is always the sum
of that room's line nets.

Forced row security limits the runtime to its own tenant and, through the
restrictive `v2_practice_firm` policy, to jobs of its own practice firm. The
runtime can read and insert only, and rows are immutable: a new layout is the
next quote revision. An `AFTER INSERT` trigger refuses a row for an excluded
line, and two rows of one room in a revision with a different place or display
mode, or two rooms sharing one place.

Quote revisions saved without rooms, and every main-path quote, are
unchanged. For a forward fix, add a subsequent V2 migration and keep the rows.
