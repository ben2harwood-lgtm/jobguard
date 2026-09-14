# JobGuard dependency security repair

Status: implemented candidate, independent acceptance pending.
Task: security-remediation subtask of PR #15, authorised by Ben on 14 September 2026 to complete the repair. This is not a product rebuild.

Next.js remains 15, React 19, NestJS 11, AWS SDK 3 and Playwright 1. Exact changes are recorded in the adjacent dependency-remediation JSON. Vitest moves from 3.2.4 to 4.1.11 because the maintained security fix for GHSA-82fw-gwwq-j7x9 is not backported to 3.x. This is test tooling only; full existing tests must pass without weakening assertions. Drizzle moves from 0.44.5 to 0.45.2; the bounded sharp override moves 0.34 to 0.35.4. These pre-1.0 minor changes require full build/integration/browser verification. No runtime provider, commercial, privacy, fee or deployment policy is approved or changed here.

Transitive overrides only replace affected older ranges with published patched versions. No audit exclusions, severity exceptions, removal of tests or changes to application business logic are authorised. The task lane is expanded only to package manifests, the lockfile, explicit web test/type configurations and repair evidence. The regression assertion continues to prohibit application-source and migration grants. The temporary branch-only repair workflow must be removed before merge.

Primary references: https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9 ; https://pnpm.io/10.x/cli/audit . Release/security approval remains separate from passing the scanner.
