# 2004 · V2 quote disposition

The checked V2 bootstrap applies 2004 after the V2 firm-visibility policy is
installed. It retargets the existing exact quote disposition command to that
database. The routine keeps its owner, grants, request binding and exact
authorization checks. It continues to record cancellation through the existing
command and preserves the immutable acceptance. The shared runner leaves
databases without both the V2 database name and the firm policy untouched.

No tables or data are added. Use a subsequent V2 migration to correct the
routine if needed. To rehearse the previous branch, keep its database in a
separate checkout with separate state.
