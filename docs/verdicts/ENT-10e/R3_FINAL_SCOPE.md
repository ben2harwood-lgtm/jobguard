# ENT-10e r3 final working-tree evidence

Existing HEAD `a390b739095a4250c8f36dacb74ef3e0bfaaa672`; no builder commit. This inventory is source evidence, not an independent verdict. All listed paths are inside the issued lane. 91 protected hashes checked against R3_UNCHANGED_SHA256.txt. Coordinator ancestry intact.

## git diff --stat (tracked edits only)

```text
 apps/api/src/auth/sso/sso-emergency.test.ts        |   2 +-
 .../src/auth/sso/sso-required-disclosure.test.ts   |   6 +-
 apps/api/src/auth/sso/sso-required.application.ts  |  36 +++++-
 apps/api/src/auth/sso/sso-required.contracts.ts    |  11 +-
 apps/api/src/auth/sso/sso-required.controller.ts   |  15 ++-
 apps/api/src/workspace/application.ts              |   3 +-
 apps/web/app/api/auth/sso-required/route.ts        |   4 +-
 docs/contracts/sso-required-v1.md                  |  45 ++++++-
 docs/operations/sso-data-flow.md                   |   7 ++
 docs/verdicts/ENT-10e/BUILDER_RECEIPT.md           | 137 +++++++++++++++++++++
 packages/db/MIGRATIONS.md                          |   6 +
 packages/db/src/migrate.ts                         |   1 +
 packages/db/src/sso-required-repository.ts         |  22 +++-
 .../sso-emergency-concurrency.integration.test.ts  |  36 +++---
 packages/db/test/sso-emergency.integration.test.ts | 130 ++++++++++++++++++-
 15 files changed, 411 insertions(+), 50 deletions(-)
```

## New files

```text
apps/api/src/auth/sso/sso-emergency-owner.test.ts
apps/api/src/auth/sso/sso-required-unlinked.test.ts
apps/web/app/api/auth/sso-required/detail/route.ts
docs/verdicts/ENT-10e/R3_ACCEPTANCE_MAP.md
docs/verdicts/ENT-10e/R3_ASSERTION_TABLES.md
docs/verdicts/ENT-10e/R3_COMMANDS.md
docs/verdicts/ENT-10e/R3_FINAL_SCOPE.md
docs/verdicts/ENT-10e/R3_GATE_READS.md
docs/verdicts/ENT-10e/R3_TEST_BASELINE_SHA256.txt
docs/verdicts/ENT-10e/R3_UNCHANGED_SHA256.txt
packages/db/migrations/0143_sso_emergency_owner_window.sql
packages/db/test/sso-emergency-owner-upgrade.integration.test.ts
packages/db/test/sso-emergency-window.integration.test.ts
packages/db/test/sso-required-unlinked.integration.test.ts
```

## Source and test hashes

```text
afff907a264786bc58f6b42bdff6db2cef84b47f6cda005a5a56ec337198d093  apps/api/src/auth/sso/sso-emergency.test.ts
ade8dba2cb158b6f38cf8f336ff904545023addd74d40146a17503aeeb0ce628  apps/api/src/auth/sso/sso-required-disclosure.test.ts
f67a71b5e71b7befc9e66df445d069a71cc269a6005d321e8ab0d76ce59aca94  apps/api/src/auth/sso/sso-required.application.ts
a886d50d9cc492769759ab04c9f977b431ebaa23e4c34fe1f4d05fb8cccc49df  apps/api/src/auth/sso/sso-required.contracts.ts
e7f7f0ab8d492570086c9745d1f2861f0622a2c0516c4d170752547fc018b4fc  apps/api/src/auth/sso/sso-required.controller.ts
67dfce427452a901f2543978f94f659ee3e83b186642c3e41c9f596098f0e9d7  apps/api/src/workspace/application.ts
42614c25cc324117bdfc343b01d7f53a6058a6fbd17c204bf234adc0ea8a834f  apps/web/app/api/auth/sso-required/route.ts
150d6f30c79c403334c40e2608a4b24a78724da566e7f9fa5c12317c1cfba1e5  packages/db/src/migrate.ts
0e00fee496ab42e8b59d4800bba1cb5149be1e168f22e976ac7fff5149171cc7  packages/db/src/sso-required-repository.ts
6457c251d2117b3b77f9e9cdff16f1be85eef37df87681fdfdbbe5d635c5f741  packages/db/test/sso-emergency-concurrency.integration.test.ts
5c637b625854ac11b4b1a13b2a161a737c1eb47cb62a0dcd70b9e29f773f76c1  packages/db/test/sso-emergency.integration.test.ts
166508e3626e67b6daafcd5a8d26671f2419c7f96b65f25b7bb8f1ac26f6b45b  apps/api/src/auth/sso/sso-emergency-owner.test.ts
1143473c9e803b9c3040623ed1611f1bc245e783796c6ba4944f24b53685a2f7  apps/api/src/auth/sso/sso-required-unlinked.test.ts
82d1924bd4fed4ccb15cf8235a5698bf4ce63fbda86362299bcf219618f8f75e  apps/web/app/api/auth/sso-required/detail/route.ts
b62eafc1bc958613bc0cf746af271530345c88fe239885328ea769d7696788ab  packages/db/migrations/0143_sso_emergency_owner_window.sql
8660813d0b54d0be695d867337994ba5035d05a5d2bc70aaf301b864a02b4260  packages/db/test/sso-emergency-owner-upgrade.integration.test.ts
fc1efaf35ee671779e5bfdba50c18c9182905f09bba8eb4f4e25bf426548b541  packages/db/test/sso-emergency-window.integration.test.ts
3090613d8ebbdff2d9b8130f3ef4aa108f3bcfc03259ed82e28341216104e747  packages/db/test/sso-required-unlinked.integration.test.ts
```

OpenAPI unchanged: c368255cd5e89140d2c4d6422a373edab192e478c773ddf20fed1a21a51413b5. Generator STOP and required dispatcher regeneration recorded in BUILDER_RECEIPT.md.
