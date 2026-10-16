# Inspection command inventory

Commands below are read-only unless explicitly identified as writing task evidence or the issued lane row. Exits are the observed shell exit for the whole semicolon-separated batch, not invented exits for its individual reads. Validation commands/results are in `RUNS.json` and the receipt. `functions.wait` was not used; `write_stdin` collected asynchronous results and sent Control-C to the two stalled pnpm sessions.

1. Exit 0: `pwd`.
2. Exit 0: `git status --short; git rev-parse HEAD; git rev-parse origin/main; git branch --show-current`.
3. Exit 0: `cat AGENTS.md`.
4. Exit 0: `sed -n '1,220p' ~/.local/share/full-steam/handoffs/jobguard-task.md`.
5. Exit 1 (expected absent switch names):

```sh
git grep -n 'FUNCTION app.contractor_practice_session_live' -- packages/db/migrations; git grep -n -e practice_worker_switch -e practice_company_marker -- packages/db/migrations
```

6. Exit 0:

```sh
nl -ba packages/db/migrations/0138_practice_session_hardening.sql | sed -n '1,135p'; rg -n '0138|0158' packages/db/src/migrate.ts; ls packages/db/src/contractor-session-context.ts packages/db/src/contractor-practice-session-repository.ts packages/db/test/contractor-practice-session-fixtures.ts
```

7. Exit 0; 24 table declarations, 20 writer matches:

```sh
git grep -n -E 'CREATE TABLE( IF NOT EXISTS)? +identity\.' -- packages/db/migrations; git grep -n -E '(INSERT INTO|UPDATE) +identity\.(membership_locator|invitation|sso_connection|user_email|session)' -- packages/db/migrations packages/db/src apps/api/src
```

8. Exit 0:

```sh
rg -n '^## 2|^### 2\.[245]|^### 9\.1|C[1-8] ' BUILD_PLAN.md; cat package.json; cat docs/contracts/contractor-practice-session-v1.md
```

9. Exit 0:

```sh
rg -n 'practice-facts-1|sbox-1|practice-session-harden' config/agent-lane-assignments.json; memory_pressure | tail -1; df -g /System/Volumes/Data
```

10. Exit 0: `sed -n '63,205p' BUILD_PLAN.md; rg -n '^### 9\.1|^#### 9\.1\.2' BUILD_PLAN.md`.
11. Exit 0:

```sh
nl -ba packages/db/migrations/0143_sso_emergency_owner_window.sql | sed -n '1,185p'; nl -ba packages/db/migrations/0150_membership_authority_fix.sql | sed -n '1,165p'
```

12. Exit 0:

```sh
cat packages/core/src/contractor-practice-session.ts; cat packages/core/src/contractor-practice-session.test.ts; cat packages/core/package.json; cat package.json
```

13. Exit 0:

```sh
cat packages/db/test/contractor-practice-session-fixtures.ts; cat apps/api/src/auth/sso/action-paths.test.ts | head -90; sed -n '50,110p' packages/db/src/migrate.ts
```

14. Exit 0:

```sh
nl -ba packages/db/migrations/0143_sso_emergency_owner_window.sql | head -105; nl -ba packages/db/migrations/0150_membership_authority_fix.sql | head -155
```

15. Exit 0:

```sh
cat packages/core/src/contractor-practice-session.ts; cat packages/core/src/contractor-practice-session.test.ts; cat packages/core/package.json; rg -n '"(lint|typecheck|build|openapi|lint:lanes)' package.json; rg -n '^### 9\.1|^#### 9\.1\.2' BUILD_PLAN.md
```

16. Exit 0:

```sh
sed -n '542,588p' BUILD_PLAN.md; sed -n '1,85p' tools/lint.mjs; tail -12 packages/core/src/index.ts; sed -n '1,100p' tools/agent-lane-boundary-lint.mjs; rg -n 'sso_emergency_window|sso_emergency_use|CREATE OR REPLACE FUNCTION' packages/db/migrations/0143_sso_emergency_owner_window.sql
```

17. Exit 0; writes `/private/tmp/jg-pws-advisory-locks.txt` (146 matches):

```sh
sed -n '60,103p' apps/api/src/auth/context-boundary.test.ts; git diff --stat; git status --short; rg -n 'hashtextextended\(|hashtext\(|pg_advisory_xact_lock' packages/db/migrations packages/db/src > /private/tmp/jg-pws-advisory-locks.txt; wc -l /private/tmp/jg-pws-advisory-locks.txt; command -v node; node --version; command -v pnpm; cat .nvmrc; cat pnpm-workspace.yaml | head -30
```

18. Exit 0:

```sh
ls -ld node_modules packages/core/node_modules node_modules/.bin/turbo packages/core/node_modules/.bin/vitest; ls -l /Users/benharwood/Library/pnpm/bin/pnpm; sed -n '1,65p' /Users/benharwood/Library/pnpm/bin/pnpm; rg -n 'packageManager|engines' package.json
```

19. Exit 1, permission refusal; stopped this inspection, no alternate process enumeration:

```sh
ps -axo pid,ppid,etime,command | rg 'practice-worker-switch|vitest|pnpm' | head -30; ls -d /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1* /Users/benharwood/Library/pnpm/.tools/@pnpm* 2>/dev/null
```

20. Exit 2, last `rg` targets absent:

```sh
ls -a /Users/benharwood/Library/pnpm; ls -a /Users/benharwood/Library/pnpm/.tools; sed -n '1,20p' node_modules/.bin/turbo; sed -n '1,35p' apps/api/node_modules/.bin/vitest; cat turbo.json; rg -n 'MEMBERSHIP|practice-worker-switch|sso-emergency' apps/web/e2e/ENT-11a.spec.ts apps/web/app/contractor 2>/dev/null
```

21. Exit 1, glob absent:

```sh
ls -a /Users/benharwood/Library/pnpm/.tools/pnpm; ls -ld /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1/bin/pnpm.cjs /Users/benharwood/Library/pnpm/.tools/pnpm/10.28.1*/bin/pnpm.cjs 2>/dev/null
```

22. Exit 0:

```sh
ls -l /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0; rg --files /Users/benharwood/Library/pnpm/.tools/pnpm/11.8.0 | head -15; ls -l node_modules/.bin/tsc apps/api/node_modules/.bin/tsx; cat apps/api/package.json | head -35
```

23. Exit 0 for batch; the middle `cat` reported a nonexistent config path (no code or pin change):

```sh
cat packages/core/tsconfig.json; cat packages/config/tsconfig.base.json; sed -n '190,305p' tools/agent-lane-boundary-lint.mjs; rg -n 'randomUUID|crypto\.' packages/core/src/*.test.ts | head -18
```

24. Exit 0:

```sh
nl -ba tools/agent-lane-boundary-lint.mjs | sed -n '207,216p'; nl -ba config/agent-lane-assignments.json | sed -n '141,147p'; sed -n '126,190p' packages/db/migrations/0143_sso_emergency_owner_window.sql
```

25. Exit 0:

```sh
rg -n '^(CREATE|ALTER|REVOKE|GRANT).*FUNCTION|CHECK\(false\)' packages/db/migrations/0129_sso_required.sql | tail -15; git grep -n 'INSERT INTO identity\.' -- packages/db/src/audit-checkpoint-handoff-cli.ts packages/db/src/audit-checkpoint-handoff.ts packages/db/src/demo-bootstrap-cli.ts packages/db/src/demo-bootstrap.ts packages/db/src/demo-seed-cli.ts packages/db/src/demo-seed.ts
```

26. Exit 0; writes only temporary search evidence:

```sh
git grep -n -E 'CREATE TABLE( IF NOT EXISTS)? +identity\.' -- packages/db/migrations > /private/tmp/jg-pws-identity-tables.txt; git grep -n -E '(INSERT INTO|UPDATE) +identity\.(membership_locator|invitation|sso_connection|user_email|session)' -- packages/db/migrations packages/db/src apps/api/src > /private/tmp/jg-pws-identity-writers.txt; wc -l /private/tmp/jg-pws-identity-tables.txt /private/tmp/jg-pws-identity-writers.txt; git diff --check; git diff --stat 6671538c8d69936c162368c760dd6ce0f7f10493; git status --short
```

27. Exit 0: `memory_pressure | tail -1; df -g /System/Volumes/Data; node tools/core-purity-lint.mjs`. 169 TypeScript source files, pass. Latest memory 59%, disk 62 GB available.
28. Exit 0:

```sh
nl -ba packages/core/src/practice-worker-switch.ts; nl -ba packages/core/src/practice-worker-switch.test.ts | tail -25; tail -3 packages/core/src/index.ts; git diff -- config/agent-lane-assignments.json packages/core/src/index.ts
```

Task-writing shell operations also completed with exit 0: the initial `python3 - <<'PY'` inserted exactly the issued lane row using `json.dumps(..., separators=(',', ':'))`; the source-evidence Python script compared SHA-256 and bytes of the scanner plus eight pinned files against `git show <base>:<path>` and wrote `SOURCE_EVIDENCE.json`; `cat > /private/tmp/jg-msg-practice-worker-switch.txt <<'EOF'` wrote the intended commit text. Source and document edits used `apply_patch` and returned success. Final evidence generation records `git diff --stat`, the exact two-line registration diff and all new-file SHA-256 values in `DIFF_EVIDENCE.txt`; it makes no database or git write. No test counts are assigned to inspection or artifact-writing commands.
