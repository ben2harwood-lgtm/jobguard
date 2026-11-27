# 2036 · V2 diary notes the customer can see

The checked V2 bootstrap applies 2036 after 2021. The shared runner leaves
databases without the dedicated V2 database name, the firm policy or main's
diary table untouched.

It adds `app.v2_diary_share`: the builder's mark, note by note, that a diary
entry may be offered to the customer. The latest row per entry wins, so a note
can be marked and unmarked. Main's diary tables, routines and screen are
unchanged, and the mark holds no diary text.

Only marked notes from the week are offered when the builder prepares that
week's Friday update, through K3's own line rule (no amounts, one line), and
the builder reviews the draft before it is sent to the local catcher.

Row security is forced; the runtime is confined to its tenant and, through the
job's practice-firm policy, its firm. It can read and insert only, and rows are
immutable. There is no SECURITY DEFINER function. A second run changes nothing.

For a forward fix, add a subsequent V2 migration and keep the rows.
