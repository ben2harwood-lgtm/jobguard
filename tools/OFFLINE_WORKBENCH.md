# Disposable JobGuard test workbench

This task only prepares an offline developer environment because the current coding container cannot resolve GitHub or npm DNS. It is not deployment, release, acceptance, a government/control-plane change, or permission to bypass a blocked connector operation.

The additional CI job runs only for the exact same-repository branch `codex/m0-1/offline-test-workbench`. All existing CI checks remain unchanged and mandatory. It has contents-read permission, no application or provider secrets, no data sources or payment routes, and a twelve-minute timeout. Artifacts expire after one day. The archive contains this public repository's git objects, pinned package dependencies, Node/pnpm and a test Chromium installation. It never archives runner HOME, environment variables, credentials, database files or generated business documents.

Verify SHA256SUMS before use. Clone source.bundle into a disposable checkout, extract dependencies there, and use the included Node24/pnpm10 toolchain. Browsers are optional test infrastructure. Any local result must record the candidate diff, runtime and commands; the artifact itself proves neither isolation nor correctness. Do not distribute dependency binaries as user deliverables. Keep receipts and source patches separately.

This PR is stacked on the JobGuard receipts candidate for practical test coverage. It must not merge/release the parent or change founder/independent-review gates. It can remain an unmerged development utility after the archive is obtained.
