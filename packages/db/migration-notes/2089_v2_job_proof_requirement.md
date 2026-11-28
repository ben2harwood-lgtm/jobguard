# 2089 · V2 linked builder's proof requirement (Q81 V2-AUTH-1)

The checked V2 bootstrap applies 2089 after 2068. The shared runner leaves databases
without the dedicated V2 database name and firm policy untouched.

Main's `app.job_proof_requirement` (0734) asks `app.lp6_session_authority` for a home
practice-session digest. A linked V2 session has a namespace digest, so lp6 refuses it by
design, and a linked builder couldn't read a job's proof (H1 blocker B3). 0734, lp6, main's
proof functions and their grants are unchanged.

2089 adds `app.v2_job_proof_requirement(credential_digest, job, revision)`, a read-only
security-definer function owned by `jobguard_migration` (as 0734's reader is), with a
`pg_catalog, pg_temp` search path. Only `jobguard_runtime` may execute it. It is a mirror of
0734's `job_proof_requirement` and the `read_job_proof_statement` it calls. Only the authority
differs:

- the credential must resolve through `app.v2_work_plan_editor`, which goes through
  `app.linked_practice_authority` (live credential, namespace session and parent sign-in, bound firm);
- the bound tenant must be the transaction's tenant;
- the job must belong to the bound firm, through the same owned-job walk 0734 uses.

A refused caller gets 42501 with `FORBIDDEN` or `NOT_FOUND`, as from 0734. The seed parity test
checks that it returns exactly what 0734 returns for a home session on the same fixture, in
every state.

2089 also adds the restrictive `v2_practice_firm` policy to `app.stage_completion` and
`app.stage_review_event` (through both its stage completion and its evidence invalidation). The site-complete write lands there,
and both carried tenant isolation only, so a second firm sharing the practice tenant could
read or write them for this firm's job.

For a forward fix, add a subsequent V2 migration. Dropping the function and the two policies
returns the state before 2089.
