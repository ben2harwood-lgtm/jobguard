# OIDC library inspection — 2026-10-18

Builder source inspection only. Selected `openid-client` 6.8.8 was already pinned by dispatcher commit `7c8665248cd5abbd991d66480df08e064873d9ff`. API manifest and pnpm lockfile are unchanged by this builder. No downloads, second direct OIDC library, unrelated upgrades or audit exceptions.

| Installed package | Licence / copyright | Package provenance | Runtime dependencies |
| --- | --- | --- | --- |
| openid-client 6.8.8 | MIT; Filip Skokan, 2016 | package.json repository `panva/openid-client` | jose ^6.2.12; oauth4webapi ^3.8.8 |
| jose 6.2.12 | MIT; Filip Skokan, 2018 | package.json repository `panva/jose` | none |
| oauth4webapi 3.8.8 | MIT; Filip Skokan, 2022 | package.json repository `panva/oauth4webapi` | none |

Evidence read from `apps/api/node_modules/openid-client/{package.json,LICENSE.md,README.md,build/index.d.ts,build/index.js}` and `node_modules/.pnpm/{jose@6.2.12,oauth4webapi@3.8.8}/node_modules/<name>/{package.json,LICENSE.md}`. MIT permits commercial use/modification/distribution with copyright/licence notices retained; no paid service is introduced. These are package metadata/licence observations, not independent registry provenance attestation.

Lockfile package integrity entries:

- openid-client: `sha512-ZsucJA5Ad04Uv7YN4ql+s4GXNmb9uAYQwyJTsJx7CH/MX3JZioLE2pVKi1SC+YrbSLA4Px3Gi30dMjgOZtb6pA==`
- jose: `sha512-9NiFmJEex0sy2Dk58j2UGBSHgUs2ypF9eZSu4L6vjOX3Dp96Sw1F3uL+H+D1sx02jZZdzUT0HgvCy59CuvXcWw==`
- oauth4webapi: `sha512-8N28E+a/oxfXWBgOMt+ZP/JUf/XR+IFbvkAEPP3gznXOMv9BpAAwiIj0TFNz3tGTPc0ZQ8zmWBNgN1nAys0gng==`

The installed README states Node 20+ WebCrypto/Fetch support and upstream conformance certification, and links an upstream security policy. Package source exposes high-level discovery, PKCE helpers, authorization-code processing and explicit `enableNonRepudiationChecks`. Node 24.17.0 is used locally. Upstream certification is not certification of JobGuard. The supplied 2026-09-05 release date is dispatcher evidence, not independently verified from the installed archive. Installed metadata shows active v6 tooling/support but cannot establish present maintenance or advisory status.

Comparison: oauth4webapi is MIT, lower-level and dependency-free, but would require more application-owned orchestration. It remains a transitive dependency only; openid-client is the single direct OIDC client. The adapter uses its explicit signature check, no skip-validation option and no handwritten verification.

**STOP — advisory/current security evidence item only:** `tools/dependency-audit.mjs` was inspected unchanged. It invokes `pnpm audit --json --audit-level=low --ignore-registry-errors=false --ignore-unfixable=false`, requires registry vulnerability counts and has no offline mode. Audit: **NOT RUN** under the no-network/offline instruction. No clean-scan claim. Current upstream security-policy/advisory/release provenance verification remains held for dispatcher/checkers; local protocol work continues as issued. Retain this evidence hold until the unchanged scanner and current provenance checks run in an authorized environment.
