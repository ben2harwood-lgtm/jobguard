# 0766 — MON-6 customer practice display

Adds one identity-only read routine; no tables, columns, roles or table grants.
Its EXECUTE permission is restricted to the existing identity login, as for other
customer portal routines. It resolves and locks current portal authority before
reading only the session-bound job's latest synthetic final invoice (issue date,
then invoice number). It returns only invoice number and current balance, after
credits and unreversed receipts. There is no invoice selector or attempt read.
No deposit/stage model is introduced. No financial, audit or session row is stored
by resolve/read. Existing resolve locks also serialize grant revocation.

Forward fix: replace this routine in a reviewed migration; disable the practice
route while investigating. No data rollback is necessary because it writes none.
The 0766 proof is a declared catalogue expectation, awaiting PostgreSQL CI.
