# 2003 · V2 draft work plan edits

The checked V2 bootstrap applies 2003 after 2001 and 2002. The shared runner
leaves databases without the dedicated V2 database name and firm policy
untouched. Existing plans and task rows are retained. New plans can reference
the preceding plan, and edits are appended as versioned receipts. The runtime
can read and insert only within the existing job visibility rule.

For a forward fix, add a subsequent V2 migration and preserve the edit receipts.
To rehearse the preceding branch, retain the existing V2 state for reference
and use fresh state in a separate checkout.
