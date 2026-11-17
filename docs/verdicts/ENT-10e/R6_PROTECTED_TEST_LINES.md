# ENT-10e r6 fixture line accounting — 13 October 2026

Baseline: HEAD `51986a49fd9b891b752e8c808409ab01d6a4120a`. Set-up/inputs only. Every touched line in `packages/db/test/sso-emergency.integration.test.ts` is below. The client approver still belongs to the same tenant and synthetic client; its branch reference now points to the existing, correctly typed branch seeded by `startPractice`. The person client type, member role, grant behavior and every expectation are retained.

| Before line | After line | Status | Before | After |
| --- | --- | --- | --- | --- |
| 198 | 198 | RE-POINTED | <code> if(role===&quot;client_approver&quot;){clientId=randomUUID();await admin.query(&quot;INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES($1,$2,$1,&#x27;Synthetic client&#x27;,&#x27;person&#x27;)&quot;,[tenant,clientId]);}</code> | <code> if(role===&quot;client_approver&quot;){</code> |
| — | 199 | RE-POINTED | <code>—</code> | <code>  clientId=randomUUID();</code> |
| — | 200 | RE-POINTED | <code>—</code> | <code>  const branchId=(await admin.query(&quot;SELECT id FROM app.org_unit WHERE tenant_id=$1 AND kind=&#x27;branch&#x27; ORDER BY id LIMIT 1&quot;,[tenant])).rows[0].id;</code> |
| — | 201 | RE-POINTED | <code>—</code> | <code>  await admin.query(&quot;INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES($1,$2,$3,&#x27;Synthetic client&#x27;,&#x27;person&#x27;)&quot;,[tenant,clientId,branchId]);</code> |
| — | 202 | RE-POINTED | <code>—</code> | <code> }</code> |

All other lines are **KEPT** byte-for-byte. The other protected file, `packages/db/test/sso-emergency-concurrency.integration.test.ts`, is entirely **KEPT**. R6_ASSERTION_CHECK.json records a deterministic TypeScript AST comparison of every original expect/matcher expression against HEAD, preserving source bytes and order. This is deterministic checking, not an independent model verdict.
