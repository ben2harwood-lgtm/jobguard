# ENT-10e r5 protected test line accounting — 13 October 2026

Baseline: dispatcher-provided HEAD baa2d591a99beadbaadf6635f8718142ddd81502. Every changed or inserted line in the two protected files is below. Changes are fixture set-up/inputs only. Every original expect expression is retained verbatim (AST comparison recorded in the receipt). No production limit, assertion, security outcome, mailbox proof or locked race is changed.

## packages/db/test/sso-emergency.integration.test.ts

| Before line | After line | Status | Before | After |
| --- | --- | --- | --- | --- |
| — | 49 | RE-POINTED | <code>—</code> | <code>async function requestSigninCode(provider:PersistedAuthProvider,email:string) {</code> |
| — | 50 | RE-POINTED | <code>—</code> | <code> // Fixture-only elapsed cooldown: keep attempts, expiry and consumption intact; do not move the database window clock.</code> |
| — | 51 | RE-POINTED | <code>—</code> | <code> await admin.query("UPDATE identity.challenge SET requested_at=LEAST(requested_at,clock_timestamp()-interval '61 seconds') WHERE email=$1 AND purpose='signin'",[email]);</code> |
| — | 52 | RE-POINTED | <code>—</code> | <code> return provider.requestCode({email,purpose:"signin",ip:randomUUID()});</code> |
| — | 53 | RE-POINTED | <code>—</code> | <code>}</code> |
| 161 | 166 | RE-POINTED | <code>  const prior=await snapshot(admin),earlier=await audit(f.principal.tenantId),request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});</code> | <code>  const prior=await snapshot(admin),earlier=await audit(f.principal.tenantId),request=await requestSigninCode(f.provider,f.email);</code> |
| 183 | 188 | RE-POINTED | <code> const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});</code> | <code> const request=await requestSigninCode(f.provider,f.email);</code> |
| 193 | 198 | RE-POINTED | <code> if(role==="client_approver"){clientId=randomUUID();await admin.query("INSERT INTO app.client_organisation(tenant_id,id,branch_id,name) VALUES($1,$2,$1,'Synthetic client')",[tenant,clientId]);}</code> | <code> if(role==="client_approver"){clientId=randomUUID();await admin.query("INSERT INTO app.client_organisation(tenant_id,id,branch_id,name,client_type) VALUES($1,$2,$1,'Synthetic client','person')",[tenant,clientId]);}</code> |
| 219 | 224 | RE-POINTED | <code>   const code=await f.provider.requestCode({email:claimant.email,purpose:"signin",ip:randomUUID()});</code> | <code>   const code=await requestSigninCode(f.provider,claimant.email);</code> |
| 238 | 243 | RE-POINTED | <code>  const submit=async()=&gt;{const code=await b.provider.requestCode({email:b.email,purpose:"signin",ip:randomUUID()});return a.service.emergency({...inputV2(a),email:b.email,code:code.fixtureCode},origin);};</code> | <code>  const submit=async()=&gt;{const code=await requestSigninCode(b.provider,b.email);return a.service.emergency({...inputV2(a),email:b.email,code:code.fixtureCode},origin);};</code> |
| 269 | 274 | RE-POINTED | <code>  const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()}),input={...inputV2(f),code:request.fixtureCode};await f.service.emergency(input,origin);const after=await beforeUse(f);</code> | <code>  const request=await requestSigninCode(f.provider,f.email),input={...inputV2(f),code:request.fixtureCode};await f.service.emergency(input,origin);const after=await beforeUse(f);</code> |
| 292 | 297 | RE-POINTED | <code>  const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()}),raw={...inputV2(f),code:request.fixtureCode};</code> | <code>  const request=await requestSigninCode(f.provider,f.email),raw={...inputV2(f),code:request.fixtureCode};</code> |
| 295 | 300 | RE-POINTED | <code>  await publicUse(f);const fresh=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});</code> | <code>  await publicUse(f);const fresh=await requestSigninCode(f.provider,f.email);</code> |

## packages/db/test/sso-emergency-concurrency.integration.test.ts

| Before line | After line | Status | Before | After |
| --- | --- | --- | --- | --- |
| — | 45 | RE-POINTED | <code>—</code> | <code>async function requestSigninCode(provider:PersistedAuthProvider,email:string) {</code> |
| — | 46 | RE-POINTED | <code>—</code> | <code> // Fixture-only elapsed cooldown: keep attempts, expiry and consumption intact; do not move the database window clock.</code> |
| — | 47 | RE-POINTED | <code>—</code> | <code> await admin.query("UPDATE identity.challenge SET requested_at=LEAST(requested_at,clock_timestamp()-interval '61 seconds') WHERE email=$1 AND purpose='signin'",[email]);</code> |
| — | 48 | RE-POINTED | <code>—</code> | <code> return provider.requestCode({email,purpose:"signin",ip:randomUUID()});</code> |
| — | 49 | RE-POINTED | <code>—</code> | <code>}</code> |
| 111 | 116 | RE-POINTED | <code>        const challenge=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});</code> | <code>        const challenge=await requestSigninCode(f.provider,f.email);</code> |

All other lines: **KEPT** byte-for-byte. New helper lines age only this mailbox’s signin request timestamps through the isolated cluster’s administrator, then call the unchanged real requestCode method. Expiry, failed-attempt counters, consumption and mailbox ownership are preserved; emergency window time stays on the real PostgreSQL clock. The E1 client fixture now declares the existing allowed person client type.
