# ENT-10e r3 assertion and touched-line tables

Baseline: a390b739095a4250c8f36dacb74ef3e0bfaaa672, after coordinator commits e77ef5c, 8ad002a and a942cdc. No RETIRED status is assigned by the builder. Each individual pre-existing expect call is a row (extracted with TypeScript AST); each touched line in the two database files also has a row. Newly appended tests add coverage. Both reviewers must confirm row by row; confirmation is pending.

## packages/db/test/sso-emergency.integration.test.ts

### Every individual pre-existing expect call

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 38 | KEPT | 38 | `expect(names.indexOf("0129_sso_required.sql")).toBeGreaterThan(names.indexOf("0120_enterprise_identity.sql"))` | `expect(names.indexOf("0129_sso_required.sql")).toBeGreaterThan(names.indexOf("0120_enterprise_identity.sql"))` |
| 39 | KEPT | 39 | `expect(names[i]!>names[i-1]!).toBe(true)` | `expect(names[i]!>names[i-1]!).toBe(true)` |
| 86 | KEPT | 86 | `expect(()=>verifyAuditChain(events)).not.toThrow()` | `expect(()=>verifyAuditChain(events)).not.toThrow()` |
| 112 | KEPT | 112 | `expect((await client.query("SELECT a.expires_at<=clock_timestamp() approval_expired,w.closes_at<=clock_timestamp() window_expired FROM identity.sso_emergency_approval a JOIN identity.sso_emergency_window w ON(w.tenant_id,w.approval_id)=(a.tenant_id,a.id) WHERE a.tenant_id=$1 AND a.id=$2",[f.principal.tenantId,expiredApproval])).rows).toEqual([{approval_expired:true,window_expired:true}])` | `expect((await client.query("SELECT a.expires_at<=clock_timestamp() approval_expired,w.closes_at<=clock_timestamp() window_expired FROM identity.sso_emergency_approval a JOIN identity.sso_emergency_window w ON(w.tenant_id,w.approval_id)=(a.tenant_id,a.id) WHERE a.tenant_id=$1 AND a.id=$2",[f.principal.tenantId,expiredApproval])).rows).toEqual([{approval_expired:true,window_expired:true}])` |
| 113 | KEPT | 113 | `expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:true,event_id:expiredEvent,window_open:false}])` | `expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:true,event_id:expiredEvent,window_open:false}])` |
| 115 | KEPT | 115 | `expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:false}])` | `expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:false}])` |
| 117 | KEPT | 117 | `expect(fresh).toMatchObject({used:true,cause:"EMERGENCY_USED",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId,windowMinutes:60})` | `expect(fresh).toMatchObject({used:true,cause:"EMERGENCY_USED",connectionId:f.connectionId,actorMembershipId:f.principal.membershipId,windowMinutes:60})` |
| 119 | KEPT | 119 | `expect(recorded).toHaveLength(1)` | `expect(recorded).toHaveLength(1)` |
| 120 | KEPT | 120 | `expect(recorded[0]).toMatchObject({membership_id:f.principal.membershipId,rule_id:rule,approver_ref:&#96;membership:${f.principal.membershipId}&#96;,reason_hash:reasonHash,event_id:fresh.eventId,command_id:freshCommand})` | `expect(recorded[0]).toMatchObject({membership_id:f.principal.membershipId,rule_id:rule,approver_ref:&#96;membership:${f.principal.membershipId}&#96;,reason_hash:reasonHash,event_id:fresh.eventId,command_id:freshCommand})` |
| 121 | KEPT | 121 | `expect(recorded[0].id).not.toBe(expiredApproval)` | `expect(recorded[0].id).not.toBe(expiredApproval)` |
| 122 | KEPT | 122 | `expect((await client.query(&#96;SELECT count(*)::int n FROM identity.${table} WHERE tenant_id=$1&#96;,[f.principal.tenantId])).rows[0].n).toBe(2)` | `expect((await client.query(&#96;SELECT count(*)::int n FROM identity.${table} WHERE tenant_id=$1&#96;,[f.principal.tenantId])).rows[0].n).toBe(2)` |
| 123 | KEPT | 123 | `expect(await expiredRows()).toEqual(expiredBefore)` | `expect(await expiredRows()).toEqual(expiredBefore)` |
| 124 | KEPT | 124 | `expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:false,event_id:fresh.eventId,window_open:true}])` | `expect((await client.query("SELECT required,event_id,window_open FROM identity.sso_required_state($1)",[f.principal.tenantId])).rows).toEqual([{required:false,event_id:fresh.eventId,window_open:true}])` |
| 125 | KEPT | 125 | `expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:true}])` | `expect((await client.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:true}])` |
| 129 | KEPT | 129 | `expect((await use(other.principal.identityUserId)).rows[0].result.used).toBe(false)` | `expect((await use(other.principal.identityUserId)).rows[0].result.used).toBe(false)` |
| 130 | KEPT | 130 | `expect((await use(f.principal.identityUserId,other.principal.tenantId)).rows[0].result.used).toBe(false)` | `expect((await use(f.principal.identityUserId,other.principal.tenantId)).rows[0].result.used).toBe(false)` |
| 133 | KEPT | 133 | `expect(submissions.filter(r=>r.rows[0].result.used)).toHaveLength(1)` | `expect(submissions.filter(r=>r.rows[0].result.used)).toHaveLength(1)` |
| 134 | KEPT | 134 | `expect(submissions.filter(r=>!r.rows[0].result.used)).toHaveLength(1)` | `expect(submissions.filter(r=>!r.rows[0].result.used)).toHaveLength(1)` |
| 135 | KEPT | 135 | `expect(submissions[0]!.rows[0].result).toMatchObject({used:true,connectionId:f.connectionId})` | `expect(submissions[0]!.rows[0].result).toMatchObject({used:true,connectionId:f.connectionId})` |
| 136 | KEPT | 136 | `expect((await client.query("SELECT required,actor_kind FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.principal.tenantId])).rows[0]).toEqual({required:false,actor_kind:"emergency"})` | `expect((await client.query("SELECT required,actor_kind FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.principal.tenantId])).rows[0]).toEqual({required:false,actor_kind:"emergency"})` |
| 137 | KEPT | 137 | `expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false)` | `expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false)` |
| 138 | KEPT | 138 | `expect((await client.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` | `expect((await client.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` |
| 156 | KEPT | 157 | `expect((await admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` | `expect((await admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` |
| 157 | KEPT | 158 | `expect((await admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` | `expect((await admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1)` |
| 161 | KEPT | 162 | `expect(f.service.emergency({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:request.fixtureCode!,reason:"Synthetic outage with held approval rule"},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` | `expect(f.service.emergency({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:request.fixtureCode!,reason:"Synthetic outage with held approval rule"},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` |
| 162 | KEPT | 163 | `expect(await snapshot(admin)).toEqual(prior)` | `expect(await snapshot(admin)).toEqual(prior)` |
| 162 | KEPT | 163 | `expect((await audit(f.principal.tenantId)).slice(0,earlier.length)).toEqual(earlier)` | `expect((await audit(f.principal.tenantId)).slice(0,earlier.length)).toEqual(earlier)` |
| 168 | RE-POINTED | 167 | `expect(result.used).toBe(true)` | `expect(result.used).toBe(true)` |
| 170 | RE-POINTED | 169 | `expect(await snapshot(client)).toEqual(prior)` | `expect(await snapshot(client)).toEqual(prior)` |
| 172 | RE-POINTED | 171 | `expect(after.slice(0,earlier.length)).toEqual(earlier)` | `expect(after.slice(0,earlier.length)).toEqual(earlier)` |
| 173 | RE-POINTED | 172 | `expect(after.at(-1).event_type).toBe("sso.emergency.used")` | `expect(after.at(-1).event_type).toBe("sso.emergency.used")` |
| 176 | KEPT | 175 | `expect(body).not.toMatch(/\b(?:UPDATE\|DELETE\|TRUNCATE)\b\|journal\|evidence/iu)` | `expect(body).not.toMatch(/\b(?:UPDATE\|DELETE\|TRUNCATE)\b\|journal\|evidence/iu)` |

### Every touched original line and every added line

RE-POINTED old setup effects now belong to the real owner command. A blank after for old fixture seeding means that effect moved into the checked routine, not that an assertion was removed. STRENGTHENED additions add checks and support them. The winning window is read by command id; the equality preserves all four old fields and gains all three persisted fields.

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 27 | RE-POINTED | 27 | `const required=()=>new SsoRequiredApplication(auth(),new SsoRequiredRepository(identity),origin,"synthetic_demo");` | `const required=()=>new SsoRequiredApplication(auth(),new SsoRequiredRepository(identity),origin,"synthetic_demo",60);` |
| — | STRENGTHENED | 140 | `` | `for(const table of ["sso_emergency_approval","sso_emergency_use"])expect((await admin.query(&#96;SELECT count(*)::int n FROM identity.${table} WHERE tenant_id=$1&#96;,[f.principal.tenantId])).rows[0].n).toBe(0);` |
| 164 | RE-POINTED | 165 | `await client.query("BEGIN");await client.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");const rule=randomUUID();` | `await client.query("BEGIN");` |
| 165 | RE-POINTED | 166 | `await client.query("INSERT INTO identity.sso_emergency_approver_rule VALUES($1,'fixture.v1','{}',clock_timestamp())",[rule]);` | `const result=(await client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId:randomUUID(),windowMinutes:60,reason:"Synthetic owner fixture confirms sole OFF effect"})])).rows[0].result;` |
| 166 | RE-POINTED | — | `await client.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,'fixture',$5,clock_timestamp(),clock_timestamp()+interval '20 minutes')",[f.principal.tenantId,randomUUID(),f.principal.membershipId,rule,"a".repeat(64)]);` | `` |
| 167 | RE-POINTED | — | `const result=(await client.query("SELECT identity.sso_emergency_use($1,$2::jsonb) result",[f.principal.identityUserId,JSON.stringify({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:"12345678",reason:"Synthetic owner fixture confirms sole OFF effect"})])).rows[0].result;` | `` |
| — | KEPT | — | `` | `` |
| — | STRENGTHENED | 179 | `` | `type OwnerFixture=Awaited<ReturnType<typeof fixture>>;` |
| — | STRENGTHENED | 180 | `` | `const emergencyReason="Synthetic owner requests emergency access";` |
| — | STRENGTHENED | 181 | `` | `const inputV2=(f:OwnerFixture,commandId=randomUUID())=>({version:"sso-emergency.v2",requested_tenant_id:f.principal.tenantId,commandId,email:f.email,reason:emergencyReason});` |
| — | STRENGTHENED | 182 | `` | `async function publicUse(f:OwnerFixture,commandId=randomUUID(),service=f.service) {` |
| — | STRENGTHENED | 183 | `` | `const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});` |
| — | STRENGTHENED | 184 | `` | `return service.emergency({...inputV2(f,commandId),code:request.fixtureCode},origin);` |
| — | STRENGTHENED | 185 | `` | `}` |
| — | STRENGTHENED | 186 | `` | `async function canonical(table:string,tenant?:string) {` |
| — | STRENGTHENED | 187 | `` | `return (await admin.query(&#96;SELECT row_to_json(r)::text bytes FROM ${table} r ${tenant?"WHERE tenant_id=$1":""} ORDER BY row_to_json(r)::text&#96;,tenant?[tenant]:[])).rows.map(r=>r.bytes);` |
| — | STRENGTHENED | 188 | `` | `}` |
| — | STRENGTHENED | 189 | `` | `const created=["identity.sso_emergency_approval","identity.sso_emergency_use","identity.sso_emergency_window","identity.sso_required_event"];` |
| — | STRENGTHENED | 190 | `` | `const beforeUse=(f:OwnerFixture)=>Promise.all(created.map(t=>canonical(t,f.principal.tenantId)));` |
| — | STRENGTHENED | 191 | `` | `async function grant(tenant:string,membership:string,role:string,email:string) {` |
| — | STRENGTHENED | 192 | `` | `let clientId:string\|null=null;` |
| — | STRENGTHENED | 193 | `` | `if(role==="client_approver"){clientId=randomUUID();await admin.query("INSERT INTO app.client_organisation(tenant_id,id,branch_id,name) VALUES($1,$2,$1,'Synthetic client')",[tenant,clientId]);}` |
| — | STRENGTHENED | 194 | `` | `await admin.query("INSERT INTO app.contractor_member(tenant_id,membership_id,email,client_id) VALUES($1,$2,$3,$4)",[tenant,membership,email,clientId]);` |
| — | STRENGTHENED | 195 | `` | `if(role!=="client_approver")await admin.query("INSERT INTO app.role_grant(tenant_id,id,membership_id,role,scope_kind,scope_id) VALUES($1,$2,$3,$4,'tenant',$1)",[tenant,randomUUID(),membership,role]);` |
| — | STRENGTHENED | 196 | `` | `}` |
| — | STRENGTHENED | 197 | `` | `async function pastUse(f:OwnerFixture,commandId:string) {` |
| — | STRENGTHENED | 198 | `` | `const c=await admin.connect();try{await c.query("BEGIN");await c.query("SELECT set_config('app.tenant_id',$1,true)",[f.principal.tenantId]);` |
| — | STRENGTHENED | 199 | `` | `const approval=randomUUID(),rule=(await c.query("SELECT id FROM identity.sso_emergency_approver_rule")).rows[0].id;` |
| — | STRENGTHENED | 200 | `` | `await c.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '16 minutes',clock_timestamp()-interval '15 minutes')",[f.principal.tenantId,approval,f.principal.membershipId,rule,&#96;membership:${f.principal.membershipId}&#96;,createHash("sha256").update(emergencyReason).digest("hex")]);` |
| — | STRENGTHENED | 201 | `` | `const event=(await c.query("SELECT identity.sso_required_append($1,$2,$3,'emergency',false,$4,(SELECT max(revision) FROM identity.sso_required_event WHERE tenant_id=$1)) result",[f.principal.tenantId,f.connectionId,f.principal.membershipId,emergencyReason])).rows[0].result.eventId;` |
| — | STRENGTHENED | 202 | `` | `await c.query("INSERT INTO identity.sso_emergency_use(tenant_id,approval_id,event_id,used_at) SELECT tenant_id,id,$3,approved_at FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event]);` |
| — | STRENGTHENED | 203 | `` | `await c.query("INSERT INTO identity.sso_emergency_window(tenant_id,approval_id,event_id,command_id,owner_membership_id,window_minutes,opened_at,closes_at) SELECT tenant_id,id,$3,$4,membership_id,15,approved_at,approved_at+interval '15 minutes' FROM identity.sso_emergency_approval WHERE tenant_id=$1 AND id=$2",[f.principal.tenantId,approval,event,commandId]);await c.query("COMMIT");` |
| — | STRENGTHENED | 204 | `` | `}catch(error){await c.query("ROLLBACK");throw error;}finally{c.release();}` |
| — | STRENGTHENED | 205 | `` | `}` |
| — | STRENGTHENED | 206 | `` | `describe("ENT-10e owner emergency records",()=>{` |
| — | STRENGTHENED | 207 | `` | `it("[E1] every non-owner role and all revoked or expired owner forms are refused without an OFF row",async()=>{` |
| — | STRENGTHENED | 208 | `` | `const check=(await admin.query("SELECT pg_get_constraintdef(c.oid) text FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname='role' WHERE c.conrelid='app.membership'::regclass AND c.contype='c' AND a.attnum=ANY(c.conkey)")).rows.map(r=>r.text).join(" ");` |
| — | STRENGTHENED | 209 | `` | `const roles=check?[...check.matchAll(/'([^']+)'/gu)].map(m=>m[1]!).filter(r=>r!=="owner"):["admin","operative","supervisor","surveyor","commercial_manager","finance","read_only","client_approver"];` |
| — | STRENGTHENED | 210 | `` | `expect(roles.length).toBeGreaterThan(0);` |
| — | STRENGTHENED | 211 | `` | `const f=await fixture();await f.enable();` |
| — | STRENGTHENED | 212 | `` | `for(const role of roles) {` |
| — | STRENGTHENED | 213 | `` | `const claimant={email:&#96;${role}@${f.domain}&#96;,principal:{identityUserId:randomUUID()}};` |
| — | STRENGTHENED | 214 | `` | `await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[claimant.principal.identityUserId]);` |
| — | STRENGTHENED | 215 | `` | `await admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[claimant.email,claimant.principal.identityUserId]);` |
| — | STRENGTHENED | 216 | `` | `const membership=await memberIn(claimant.principal.identityUserId,f.principal.tenantId,role);` |
| — | STRENGTHENED | 217 | `` | `await grant(f.principal.tenantId,membership,role,claimant.email);` |
| — | STRENGTHENED | 218 | `` | `const before=await beforeUse(f),logs=await canonical("identity.sso_emergency_event",f.principal.tenantId),events=await audit(f.principal.tenantId);` |
| — | STRENGTHENED | 219 | `` | `const code=await f.provider.requestCode({email:claimant.email,purpose:"signin",ip:randomUUID()});` |
| — | STRENGTHENED | 220 | `` | `await expect(f.service.emergency({...inputV2(f),email:claimant.email,code:code.fixtureCode},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(before);` |
| — | STRENGTHENED | 221 | `` | `const cause=role==="admin"?"EMERGENCY_NOT_OWNER":"EMERGENCY_PERMISSION_REFUSED";` |
| — | STRENGTHENED | 222 | `` | `const after=await audit(f.principal.tenantId);` |
| — | STRENGTHENED | 223 | `` | `if(role==="admin"){expect(after.slice(events.length).map(r=>({type:r.event_type,code:r.payload.references.code}))).toEqual([{type:"sso.emergency.refused",code:cause}]);expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[f.principal.tenantId])).rows).toEqual([{cause_code:cause}]);}` |
| — | STRENGTHENED | 224 | `` | `else {expect(after).toEqual(events);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(logs);}` |
| — | STRENGTHENED | 225 | `` | `expect((await admin.query("SELECT code FROM identity.sso_refusal_event ORDER BY created_at DESC LIMIT 1")).rows[0].code).toBe(cause);` |
| — | STRENGTHENED | 226 | `` | `}` |
| — | STRENGTHENED | 227 | `` | `for(const kind of ["revoked","expired","contractor revoked"]){` |
| — | STRENGTHENED | 228 | `` | `const f=await fixture();await f.enable();` |
| — | STRENGTHENED | 229 | `` | `if(kind==="contractor revoked")await admin.query("INSERT INTO app.contractor_membership_revocation(tenant_id,id,membership_id) VALUES($1,$2,$3)",[f.principal.tenantId,randomUUID(),f.principal.membershipId]);` |
| — | STRENGTHENED | 230 | `` | `else await admin.query(&#96;UPDATE app.membership SET ${kind==="revoked"?"revoked_at":"expires_at"}=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2&#96;,[f.principal.tenantId,f.principal.membershipId]);` |
| — | STRENGTHENED | 231 | `` | `const before=await beforeUse(f),logs=await canonical("identity.sso_emergency_event",f.principal.tenantId);await expect(publicUse(f)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(before);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(logs);` |
| — | STRENGTHENED | 232 | `` | `}` |
| — | STRENGTHENED | 233 | `` | `});` |
| — | STRENGTHENED | 234 | `` | `it("[E2] wrong-company owner, admin of A and owner of both can affect only the named company",async()=>{` |
| — | STRENGTHENED | 235 | `` | `const a=await fixture(),b=await fixture();await a.enable();await b.enable();` |
| — | STRENGTHENED | 236 | `` | `const bState=await b.service.view({version:"sso-required-view.v1",requested_tenant_id:b.principal.tenantId},b.bound!);` |
| — | STRENGTHENED | 237 | `` | `const bBefore=await Promise.all([...created,"identity.sso_emergency_event"].map(t=>canonical(t,b.principal.tenantId))),aBefore=await beforeUse(a),aLogs=await canonical("identity.sso_emergency_event",a.principal.tenantId);` |
| — | STRENGTHENED | 238 | `` | `const submit=async()=>{const code=await b.provider.requestCode({email:b.email,purpose:"signin",ip:randomUUID()});return a.service.emergency({...inputV2(a),email:b.email,code:code.fixtureCode},origin);};` |
| — | STRENGTHENED | 239 | `` | `await expect(submit()).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(a)).toEqual(aBefore);expect(await canonical("identity.sso_emergency_event",a.principal.tenantId)).toEqual(aLogs);` |
| — | STRENGTHENED | 240 | `` | `expect((await admin.query("SELECT code FROM identity.sso_refusal_event ORDER BY created_at DESC LIMIT 1")).rows[0].code).toBe("EMERGENCY_MEMBER_NOT_ACTIVE");` |
| — | STRENGTHENED | 241 | `` | `const membership=await memberIn(b.principal.identityUserId,a.principal.tenantId,"admin");await grant(a.principal.tenantId,membership,"admin",b.email);` |
| — | STRENGTHENED | 242 | `` | `await expect(submit()).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(a)).toEqual(aBefore);expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[a.principal.tenantId])).rows).toEqual([{cause_code:"EMERGENCY_NOT_OWNER"}]);` |
| — | STRENGTHENED | 243 | `` | `await admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[a.principal.tenantId,membership]);` |
| — | STRENGTHENED | 244 | `` | `expect((await submit()).required).toBe(false);expect(await Promise.all([...created,"identity.sso_emergency_event"].map(t=>canonical(t,b.principal.tenantId)))).toEqual(bBefore);` |
| — | STRENGTHENED | 245 | `` | `expect(await b.service.view({version:"sso-required-view.v1",requested_tenant_id:b.principal.tenantId},b.bound!)).toEqual(bState);` |
| — | STRENGTHENED | 246 | `` | `});` |
| — | STRENGTHENED | 247 | `` | `it("[E3] one owner command records exact approval, switch, use, window, log and audit with no session",async()=>{` |
| — | STRENGTHENED | 248 | `` | `const f=await fixture();await f.enable();const before=await beforeUse(f),session=await canonical("identity.session"),earlier=await audit(f.principal.tenantId),commandId=randomUUID();const result=await publicUse(f,commandId);` |
| — | STRENGTHENED | 249 | `` | `const row=(await admin.query("SELECT a.approver_ref,a.rule_id,a.reason_hash,a.approved_at=w.opened_at same_time,w.closes_at=w.opened_at+make_interval(mins=>w.window_minutes) exact_length,w.window_minutes,to_char(w.closes_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') closes_at,e.required,e.actor_kind,e.revision,u.event_id FROM identity.sso_emergency_window w JOIN identity.sso_emergency_approval a ON(a.tenant_id,a.id)=(w.tenant_id,w.approval_id) JOIN identity.sso_emergency_use u ON(u.tenant_id,u.approval_id,u.event_id)=(w.tenant_id,w.approval_id,w.event_id) JOIN identity.sso_required_event e ON(e.tenant_id,e.id)=(w.tenant_id,w.event_id) WHERE w.tenant_id=$1 AND w.command_id=$2",[f.principal.tenantId,commandId])).rows[0];` |
| — | STRENGTHENED | 250 | `` | `expect(row).toEqual({approver_ref:&#96;membership:${f.principal.membershipId}&#96;,rule_id:"14300000-0000-4000-8000-000000000001",reason_hash:createHash("sha256").update(emergencyReason).digest("hex"),same_time:true,exact_length:true,window_minutes:60,closes_at:result.requiredAgainAt,required:false,actor_kind:"emergency",revision:2,event_id:expect.any(String)});` |
| — | STRENGTHENED | 251 | `` | `expect(result).toEqual({version:"sso-emergency-response.v2",environment:"synthetic_demo",required:false,requiredAgainAt:row.closes_at,windowMinutes:60});` |
| — | STRENGTHENED | 252 | `` | `const after=await beforeUse(f);for(let i=0;i<created.length;i++)expect(after[i]).toHaveLength(before[i]!.length+1);` |
| — | STRENGTHENED | 253 | `` | `expect((await admin.query("SELECT outcome,cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1",[f.principal.tenantId])).rows).toEqual([{outcome:"used",cause_code:"EMERGENCY_USED"}]);` |
| — | STRENGTHENED | 254 | `` | `const events=await audit(f.principal.tenantId);expect(events.slice(earlier.length)).toHaveLength(1);expect(events.at(-1).event_type).toBe("sso.emergency.used");expect(events.at(-1).payload.hashes.document).toBe(row.reason_hash);expect(await canonical("identity.session")).toEqual(session);` |
| — | STRENGTHENED | 255 | `` | `});` |
| — | STRENGTHENED | 256 | `` | `it("[E4] failed audit append rolls back every emergency fact and keeps code sign-in closed",async()=>{` |
| — | STRENGTHENED | 257 | `` | `const f=await fixture();await f.enable();const repo=new SsoRequiredRepository(identity),service=new SsoRequiredApplication(f.provider,repo,origin,"synthetic_demo",60),before=await beforeUse(f),log=await canonical("identity.sso_emergency_event",f.principal.tenantId);` |
| — | STRENGTHENED | 258 | `` | `const original=repo.enterprise.audit;repo.enterprise.audit=async()=>{throw new Error("Synthetic audit rejection");};` |
| — | STRENGTHENED | 259 | `` | `try{await expect(publicUse(f,randomUUID(),service)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});}finally{repo.enterprise.audit=original;}` |
| — | STRENGTHENED | 260 | `` | `expect(await beforeUse(f)).toEqual(before);expect(await canonical("identity.sso_emergency_event",f.principal.tenantId)).toEqual(log);` |
| — | STRENGTHENED | 261 | `` | `expect((await admin.query("SELECT allowed FROM identity.sso_code_signin_allowed($1)",[f.principal.identityUserId])).rows).toEqual([{allowed:false}]);` |
| — | STRENGTHENED | 262 | `` | `});` |
| — | STRENGTHENED | 263 | `` | `it("[E5] open replay, closed replay, mailbox replay and a fresh post-close use preserve earlier windows",async()=>{` |
| — | STRENGTHENED | 264 | `` | `const f=await fixture();await f.enable();const commandId=randomUUID();await publicUse(f,commandId);const open=await canonical("identity.sso_emergency_window",f.principal.tenantId);` |
| — | STRENGTHENED | 265 | `` | `await expect(publicUse(f,commandId)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await canonical("identity.sso_emergency_window",f.principal.tenantId)).toEqual(open);` |
| — | STRENGTHENED | 266 | `` | `expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_ALREADY_USED");` |
| — | STRENGTHENED | 267 | `` | `await f.service.command(f.command(true,2),f.bound!);const pastCommand=randomUUID();await pastUse(f,pastCommand);const past=await canonical("identity.sso_emergency_window",f.principal.tenantId);` |
| — | STRENGTHENED | 268 | `` | `await expect(publicUse(f,pastCommand)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_COMMAND_REPLAYED");expect(await canonical("identity.sso_emergency_window",f.principal.tenantId)).toEqual(past);` |
| — | STRENGTHENED | 269 | `` | `const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()}),input={...inputV2(f),code:request.fixtureCode};await f.service.emergency(input,origin);const after=await beforeUse(f);` |
| — | STRENGTHENED | 270 | `` | `await expect(f.service.emergency(input,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect(await beforeUse(f)).toEqual(after);` |
| — | STRENGTHENED | 271 | `` | `const current=await canonical("identity.sso_emergency_window",f.principal.tenantId);expect(current).toHaveLength(past.length+1);expect(current.filter(x=>past.includes(x))).toEqual(past);` |
| — | STRENGTHENED | 272 | `` | `});` |
| — | STRENGTHENED | 273 | `` | `it("[E7] one owner rule is immutable, other seeds refused and application roles cannot insert approvals",async()=>{` |
| — | STRENGTHENED | 274 | `` | `expect((await admin.query("SELECT id,version,definition FROM identity.sso_emergency_approver_rule")).rows).toEqual([{id:"14300000-0000-4000-8000-000000000001",version:"company-owner-only.v1",definition:{approver:"company_owner"}}]);` |
| — | STRENGTHENED | 275 | `` | `expect((await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='sso_emergency_approver_rule_held'")).rows[0].n).toBe(0);` |
| — | STRENGTHENED | 276 | `` | `const c=await admin.connect();for(const sql of ["INSERT INTO identity.sso_emergency_approver_rule(id,version,definition) VALUES(gen_random_uuid(),'other.v1','{}')","UPDATE identity.sso_emergency_approver_rule SET version='other.v1'","DELETE FROM identity.sso_emergency_approver_rule"]){try{await c.query("BEGIN");await c.query("SET LOCAL ROLE jobguard_migration");await expect(c.query(sql)).rejects.toThrow();}finally{await c.query("ROLLBACK");}}c.release();` |
| — | STRENGTHENED | 277 | `` | `for(const role of ["jobguard_identity","jobguard_runtime"]){for(const table of ["sso_emergency_approver_rule","sso_emergency_approval"]){expect((await admin.query("SELECT has_table_privilege($1,$2,'INSERT') yes",[role,&#96;identity.${table}&#96;])).rows[0].yes).toBe(false);}const client=await admin.connect();try{await client.query("BEGIN");await client.query(&#96;SET LOCAL ROLE ${role}&#96;);await expect(client.query("INSERT INTO identity.sso_emergency_approval DEFAULT VALUES")).rejects.toMatchObject({code:"42501"});}finally{await client.query("ROLLBACK");client.release();}}` |
| — | STRENGTHENED | 278 | `` | `expect((await admin.query("SELECT has_table_privilege('jobguard_identity','identity.sso_emergency_approver_rule','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed")).rows[0].allowed).toBe(false);` |
| — | STRENGTHENED | 279 | `` | `const sql=await readFile(new URL("../migrations/0143_sso_emergency_owner_window.sql",import.meta.url),"utf8"),routine=sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION identity.sso_emergency_use"),sql.indexOf("CREATE FUNCTION identity.sso_required_detail"));` |
| — | STRENGTHENED | 280 | `` | `expect(sql.match(/INSERT INTO identity\.sso_emergency_approver_rule/gu)).toHaveLength(1);expect(sql.match(/INSERT INTO identity\.sso_emergency_approval/gu)).toHaveLength(1);expect(routine.match(/INSERT INTO identity\.sso_emergency_approval/gu)).toHaveLength(1);` |
| — | STRENGTHENED | 281 | `` | `});` |
| — | STRENGTHENED | 282 | `` | `it("[E8] refused and successful uses preserve all existing history and authority",async()=>{` |
| — | STRENGTHENED | 283 | `` | `// S11 above proves nonempty journal and evidence preservation; this adds canonical microsecond identity comparison.` |
| — | STRENGTHENED | 284 | `` | `const f=await fixture();await f.enable();const names=["identity.sso_connection","identity.verified_domain","identity.idp_group_role_mapping","identity.sso_subject","identity.sso_session_binding","identity.sso_grant","identity.session","app.membership","app.role_grant","app.journal","app.evidence_object"],before=await Promise.all(names.map(n=>canonical(n))),events=await canonical("app.audit_event",f.principal.tenantId);` |
| — | STRENGTHENED | 285 | `` | `for(const table of ["app.journal","app.evidence_object"])expect((await admin.query(&#96;SELECT count(*)::int n FROM ${table}&#96;)).rows[0].n).toBeGreaterThan(0);` |
| — | STRENGTHENED | 286 | `` | `await expect(f.service.emergency({...inputV2(f),version:"sso-emergency.v1",code:"0".repeat(8)},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});await publicUse(f);` |
| — | STRENGTHENED | 287 | `` | `expect(await Promise.all(names.map(n=>canonical(n)))).toEqual(before);expect((await canonical("app.audit_event",f.principal.tenantId)).filter(x=>events.includes(x))).toEqual(events);` |
| — | STRENGTHENED | 288 | `` | `const body=(await admin.query("SELECT pg_get_functiondef('identity.sso_emergency_use(uuid,jsonb)'::regprocedure) text")).rows[0].text;expect(body).not.toMatch(/\b(?:UPDATE\|DELETE\|TRUNCATE)\b\|journal\|evidence/iu);` |
| — | STRENGTHENED | 289 | `` | `});` |
| — | STRENGTHENED | 290 | `` | `it("[E9] retired v1, unknown mailbox, invalid code, switch off and invalid setting have identical public bodies",async()=>{` |
| — | STRENGTHENED | 291 | `` | `const f=await fixture(),controller=new (await import("../../../apps/api/src/auth/sso/sso-required.controller.js")).SsoRequiredController(()=>f.service);` |
| — | STRENGTHENED | 292 | `` | `const request=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()}),raw={...inputV2(f),code:request.fixtureCode};` |
| — | STRENGTHENED | 293 | `` | `for(const input of [{...raw,code:undefined},{...raw,code:"0".repeat(8)},{...raw,email:"unknown@fixture.invalid"},{...raw,version:"sso-emergency.v1"},raw]){const error=await controller.emergency(input,{headers:{origin}}).catch(e=>e);expect(error.getStatus()).toBe(403);expect(error.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});}` |
| — | STRENGTHENED | 294 | `` | `await f.enable();const invalid=new SsoRequiredApplication(f.provider,new SsoRequiredRepository(identity),origin,"synthetic_demo","invalid");await expect(publicUse(f,randomUUID(),invalid)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"});expect((await admin.query("SELECT cause_code FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1",[f.principal.tenantId])).rows[0].cause_code).toBe("EMERGENCY_WINDOW_INVALID");` |
| — | STRENGTHENED | 295 | `` | `await publicUse(f);const fresh=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});` |
| — | STRENGTHENED | 296 | `` | `const open=await controller.emergency({...inputV2(f),code:fresh.fixtureCode},{headers:{origin}}).catch(e=>e);expect(open.getStatus()).toBe(403);expect(open.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"});` |
| — | STRENGTHENED | 297 | `` | `});` |
| — | STRENGTHENED | 298 | `` | `});` |
## packages/db/test/sso-emergency-concurrency.integration.test.ts

### Every individual pre-existing expect call

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 87 | KEPT | 87 | `expect(() => verifyAuditChain(events)).not.toThrow()` | `expect(() => verifyAuditChain(events)).not.toThrow()` |
| 140 | RE-POINTED | 132 | `expect(new Set(pids).size).toBe(2)` | `expect(new Set(pids).size).toBe(2)` |
| 150 | RE-POINTED | 142 | `expect(results.filter(r => r.used)).toHaveLength(1)` | `expect(results.filter(r => r.used)).toHaveLength(1)` |
| 151 | RE-POINTED | 143 | `expect(results.filter(r => !r.used)).toEqual([{ used: false, cause: "EMERGENCY_ALREADY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId }])` | `expect(results.filter(r => !r.used)).toEqual([{ used: false, cause: "EMERGENCY_ALREADY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId }])` |
| 152 | STRENGTHENED | 146 | `expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId })` | `expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId, eventId:storedWindow.event_id, windowMinutes:storedWindow.window_minutes, closesAt:storedWindow.closes_at })` |
| 164 | RE-POINTED | 158 | `expect(primaryKey.length).toBeGreaterThan(0)` | `expect(primaryKey.length).toBeGreaterThan(0)` |
| 172 | RE-POINTED | 166 | `expect(existing).toEqual(allBefore)` | `expect(existing).toEqual(allBefore)` |
| 173 | RE-POINTED | 167 | `expect(added[name]).toEqual([])` | `expect(added[name]).toEqual([])` |
| 174 | RE-POINTED | 168 | `expect(added[name]).toHaveLength(1)` | `expect(added[name]).toHaveLength(1)` |
| 179 | RE-POINTED | 173 | `expect(revisionsAfter.slice(0, revisionsBefore.length)).toEqual(revisionsBefore)` | `expect(revisionsAfter.slice(0, revisionsBefore.length)).toEqual(revisionsBefore)` |
| 180 | RE-POINTED | 174 | `expect(revisionsAfter).toHaveLength(revisionsBefore.length + 1)` | `expect(revisionsAfter).toHaveLength(revisionsBefore.length + 1)` |
| 181 | RE-POINTED | 175 | `expect(revisionsAfter.at(-1)).toMatchObject({ required: false, revision: iteration * 2 + 2, actor_kind: "emergency" })` | `expect(revisionsAfter.at(-1)).toMatchObject({ required: false, revision: iteration * 2 + 2, actor_kind: "emergency" })` |
| 183 | RE-POINTED | 177 | `expect(newApproval).toMatchObject({ tenant_id: f.principal.tenantId, membership_id: f.principal.membershipId })` | `expect(newApproval).toMatchObject({ tenant_id: f.principal.tenantId, membership_id: f.principal.membershipId })` |
| 184 | RE-POINTED | 178 | `expect(newUse).toMatchObject({ tenant_id: f.principal.tenantId, approval_id: newApproval.id, event_id: revisionsAfter.at(-1).id })` | `expect(newUse).toMatchObject({ tenant_id: f.principal.tenantId, approval_id: newApproval.id, event_id: revisionsAfter.at(-1).id })` |
| 185 | RE-POINTED | 179 | `expect(newWindow).toMatchObject({ tenant_id: f.principal.tenantId, approval_id: newApproval.id, event_id: newUse.event_id, owner_membership_id: f.principal.membershipId })` | `expect(newWindow).toMatchObject({ tenant_id: f.principal.tenantId, approval_id: newApproval.id, event_id: newUse.event_id, owner_membership_id: f.principal.membershipId })` |
| 187 | RE-POINTED | 181 | `expect(uses).toHaveLength(1)` | `expect(uses).toHaveLength(1)` |
| 188 | RE-POINTED | 182 | `expect(uses[0].event_id).toBe(revisionsAfter.at(-1).id)` | `expect(uses[0].event_id).toBe(revisionsAfter.at(-1).id)` |
| 189 | RE-POINTED | 183 | `expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(iteration + 1)` | `expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(iteration + 1)` |
| 191 | RE-POINTED | 185 | `expect(afterAudit.slice(0, earlierAudit.length)).toEqual(earlierAudit)` | `expect(afterAudit.slice(0, earlierAudit.length)).toEqual(earlierAudit)` |
| 192 | RE-POINTED | 186 | `expect((await admin.query("SELECT * FROM app.audit_event WHERE id=ANY($1::uuid[]) ORDER BY tenant_id,sequence", [allEarlierAudit.map(r => r.id)])).rows).toEqual(allEarlierAudit)` | `expect((await admin.query("SELECT * FROM app.audit_event WHERE id=ANY($1::uuid[]) ORDER BY tenant_id,sequence", [allEarlierAudit.map(r => r.id)])).rows).toEqual(allEarlierAudit)` |
| 193 | RE-POINTED | 187 | `expect((await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows[0].n).toBe(allEarlierAudit.length + 2)` | `expect((await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows[0].n).toBe(allEarlierAudit.length + 2)` |
| 194 | RE-POINTED | 188 | `expect(afterAudit.slice(earlierAudit.length).map(r => ({ type: r.event_type, code: r.payload.references.code }))).toEqual([<br>        { type: "sso.emergency.used", code: "EMERGENCY_USED" },<br>        { type: "sso.emergency.refused", code: "EMERGENCY_ALREADY_USED" },<br>      ])` | `expect(afterAudit.slice(earlierAudit.length).map(r => ({ type: r.event_type, code: r.payload.references.code }))).toEqual([<br>        { type: "sso.emergency.used", code: "EMERGENCY_USED" },<br>        { type: "sso.emergency.refused", code: "EMERGENCY_ALREADY_USED" },<br>      ])` |
| 199 | RE-POINTED | 193 | `expect(logsAfter.slice(0, logsBefore.length)).toEqual(logsBefore)` | `expect(logsAfter.slice(0, logsBefore.length)).toEqual(logsBefore)` |
| 200 | RE-POINTED | 194 | `expect(logsAfter.slice(logsBefore.length).map(r => ({ outcome: r.outcome, cause: r.cause_code }))).toEqual([<br>        { outcome: "used", cause: "EMERGENCY_USED" }, { outcome: "refused", cause: "EMERGENCY_ALREADY_USED" },<br>      ])` | `expect(logsAfter.slice(logsBefore.length).map(r => ({ outcome: r.outcome, cause: r.cause_code }))).toEqual([<br>        { outcome: "used", cause: "EMERGENCY_USED" }, { outcome: "refused", cause: "EMERGENCY_ALREADY_USED" },<br>      ])` |

### Every touched original line and every added line

RE-POINTED old setup effects now belong to the real owner command. A blank after for old fixture seeding means that effect moved into the checked routine, not that an assertion was removed. STRENGTHENED additions add checks and support them. The winning window is read by command id; the equality preserves all four old fields and gains all three persisted fields.

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 20 | RE-POINTED | 20 | `const required = () => new SsoRequiredApplication(auth(), new SsoRequiredRepository(identity), origin, "synthetic_demo");` | `const required = () => new SsoRequiredApplication(auth(), new SsoRequiredRepository(identity), origin, "synthetic_demo",60);` |
| 23 | RE-POINTED | 23 | `// This file creates its own cluster and database; no other suite can observe the lifted fixture latch.` | `// This file creates its own cluster and database for the owner route.` |
| 105 | STRENGTHENED | 105 | `it("[S10d/S11] five competing transactions use each fresh approval once and preserve other authority/history", async () => {` | `it.each(["same", "different"] as const)("[E6] [S10d/S11] five competing transactions use each fresh approval once and preserve other authority/history (%s command ids)", async variant => {` |
| 106 | RE-POINTED | 106 | `const f = await fixture(), rule = randomUUID();` | `const f = await fixture();` |
| 109 | RE-POINTED | 109 | `const approval = randomUUID(), owner = await admin.connect();` | `// Consume two independent real mailbox challenges before the locked execution stage.` |
| 110 | RE-POINTED | 110 | `try {` | `for(let proof=0;proof<2;proof++) {` |
| 111 | RE-POINTED | 111 | `await owner.query("BEGIN");` | `const challenge=await f.provider.requestCode({email:f.email,purpose:"signin",ip:randomUUID()});` |
| 112 | RE-POINTED | 112 | `await owner.query("SET LOCAL ROLE jobguard_migration");` | `expect(await f.provider.proveEmergencyMailbox(f.email,challenge.fixtureCode!)).toBe(f.principal.identityUserId);` |
| 113 | RE-POINTED | 113 | `await owner.query("SELECT set_config('app.tenant_id',$1,true)", [f.principal.tenantId]);` | `}` |
| 114 | RE-POINTED | — | `if (iteration === 0) {` | `` |
| 115 | RE-POINTED | — | `await owner.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");` | `` |
| 116 | RE-POINTED | — | `await owner.query("INSERT INTO identity.sso_emergency_approver_rule(id,version,definition) VALUES($1,'fixture.v1','{}')", [rule]);` | `` |
| 117 | RE-POINTED | — | `}` | `` |
| 118 | RE-POINTED | — | `await owner.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,'owner-fixture',$5,clock_timestamp(),clock_timestamp()+interval '20 minutes')", [f.principal.tenantId, approval, f.principal.membershipId, rule, "a".repeat(64)]);` | `` |
| 119 | RE-POINTED | — | `// The approval must be committed before either independent identity transaction starts.` | `` |
| 120 | RE-POINTED | — | `await owner.query("COMMIT");` | `` |
| 121 | RE-POINTED | — | `} catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }` | `` |
| — | KEPT | — | `` | `` |
| 136 | RE-POINTED | 127 | `const input = { version: "sso-emergency.v1", requested_tenant_id: f.principal.tenantId, reason: "Synthetic concurrent emergency fixture reason" };` | `const input = { version: "sso-emergency.v2", requested_tenant_id: f.principal.tenantId, commandId:randomUUID(), reason: "Synthetic concurrent emergency fixture reason" };` |
| — | STRENGTHENED | 128 | `` | `const secondInput={...input,commandId:variant==="same"?input.commandId:randomUUID()};` |
| 143 | RE-POINTED | 135 | `race = [repositoryFor(first).emergency(f.principal.identityUserId, input), repositoryFor(second).emergency(f.principal.identityUserId, input)];` | `race = [repositoryFor(first).emergency(f.principal.identityUserId, input,60), repositoryFor(second).emergency(f.principal.identityUserId, secondInput,60)];` |
| 152 | STRENGTHENED | 144 | `expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId });` | `const winningCommand=[input.commandId,secondInput.commandId][results.findIndex(r=>r.used)]!;` |
| — | STRENGTHENED | 145 | `` | `const storedWindow=(await admin.query("SELECT event_id,window_minutes,to_char(closes_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') closes_at FROM identity.sso_emergency_window WHERE tenant_id=$1 AND command_id=$2",[f.principal.tenantId,winningCommand])).rows[0];` |
| — | STRENGTHENED | 146 | `` | `expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId, eventId:storedWindow.event_id, windowMinutes:storedWindow.window_minutes, closesAt:storedWindow.closes_at });` |
## apps/api/src/auth/sso/sso-emergency.test.ts

### Every individual pre-existing expect call

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 17 | KEPT | 17 | `expect(failure.getStatus()).toBe(403)` | `expect(failure.getStatus()).toBe(403)` |
| 17 | KEPT | 17 | `expect(failure.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"})` | `expect(failure.getResponse()).toEqual({code:"SSO_EMERGENCY_REFUSED"})` |
| 18 | KEPT | 18 | `expect(mailbox).toHaveBeenCalledWith(input.email,input.code)` | `expect(mailbox).toHaveBeenCalledWith(input.email,input.code)` |
| 19 | KEPT | 19 | `expect(refusal).toHaveBeenCalledWith("emergency",kind==="no code"?"EMERGENCY_INPUT_INVALID":["invalid code","unknown address"].includes(kind)?"EMERGENCY_MAILBOX_REFUSED":kind==="valid administrator"?"EMERGENCY_APPROVER_RULE_UNSET":"EMERGENCY_REFUSED")` | `expect(refusal).toHaveBeenCalledWith("emergency",kind==="no code"?"EMERGENCY_INPUT_INVALID":["invalid code","unknown address"].includes(kind)?"EMERGENCY_MAILBOX_REFUSED":kind==="valid administrator"?"EMERGENCY_APPROVER_RULE_UNSET":"EMERGENCY_REFUSED")` |
| 20 | KEPT | 20 | `expect(use).not.toHaveBeenCalled()` | `expect(use).not.toHaveBeenCalled()` |
| 20 | KEPT | 20 | `expect(use).toHaveBeenCalledWith(user,input)` | `expect(use).toHaveBeenCalledWith(user,input)` |
| 28 | KEPT | 28 | `expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBe(user)` | `expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBe(user)` |
| 29 | KEPT | 29 | `expect(statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1")` | `expect(statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1")` |
| 30 | KEPT | 30 | `expect(statements.some(sql=>sql.includes("verified")\|\|sql.includes("provision")\|\|sql.includes("identity.session"))).toBe(false)` | `expect(statements.some(sql=>sql.includes("verified")\|\|sql.includes("provision")\|\|sql.includes("identity.session"))).toBe(false)` |
| 31 | KEPT | 31 | `expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBeUndefined()` | `expect(await auth.proveEmergencyMailbox(input.email,input.code)).toBeUndefined()` |
| 32 | KEPT | 32 | `expect(await auth.proveEmergencyMailbox(input.email,"00000000")).toBeUndefined()` | `expect(await auth.proveEmergencyMailbox(input.email,"00000000")).toBeUndefined()` |
| 39 | KEPT | 39 | `expect(app.emergency(input,"https://other.invalid")).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` | `expect(app.emergency(input,"https://other.invalid")).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` |
| 40 | KEPT | 40 | `expect(app.emergency(undefined,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` | `expect(app.emergency(undefined,origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"})` |
| 40 | KEPT | 40 | `expect(mailbox).not.toHaveBeenCalled()` | `expect(mailbox).not.toHaveBeenCalled()` |
## apps/api/src/auth/sso/sso-required-disclosure.test.ts

### Every individual pre-existing expect call

| Before line | Status | After line | Before | After |
| --- | --- | --- | --- | --- |
| 44 | KEPT | 44 | `expect(result).toBeUndefined()` | `expect(result).toBeUndefined()` |
| 45 | KEPT | 45 | `expect(error).toBeInstanceOf(Error)` | `expect(error).toBeInstanceOf(Error)` |
| 49 | KEPT | 49 | `expect(cookie).not.toHaveBeenCalled()` | `expect(cookie).not.toHaveBeenCalled()` |
| 58 | KEPT | 58 | `expect(f.statements.some(sql => /INSERT INTO identity\.(?:session\|membership_locator)\|INSERT INTO app\.membership\|'session\.issued'\|UPDATE identity\.invitation/u.test(sql))).toBe(false)` | `expect(f.statements.some(sql => /INSERT INTO identity\.(?:session\|membership_locator)\|INSERT INTO app\.membership\|'session\.issued'\|UPDATE identity\.invitation/u.test(sql))).toBe(false)` |
| 59 | KEPT | 59 | `expect(f.statements).toContain("COMMIT")` | `expect(f.statements).toContain("COMMIT")` |
| 60 | KEPT | 60 | `expect(f.statements.filter(sql => sql.startsWith("UPDATE identity.challenge SET consumed_at="))).toHaveLength(1)` | `expect(f.statements.filter(sql => sql.startsWith("UPDATE identity.challenge SET consumed_at="))).toHaveLength(1)` |
| 62 | KEPT | 62 | `expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1")` | `expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2 WHERE id=$1")` |
| 63 | KEPT | 63 | `expect(f.statements.some(sql => sql.includes("verified=true") \|\| sql.includes("provision_verified_challenge"))).toBe(false)` | `expect(f.statements.some(sql => sql.includes("verified=true") \|\| sql.includes("provision_verified_challenge"))).toBe(false)` |
| 65 | KEPT | 65 | `expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2,verified=true WHERE id=$1")` | `expect(f.statements).toContain("UPDATE identity.challenge SET consumed_at=$2,verified=true WHERE id=$1")` |
| 66 | KEPT | 66 | `expect(f.statements.filter(sql => sql.includes("provision_verified_challenge"))).toHaveLength(1)` | `expect(f.statements.filter(sql => sql.includes("provision_verified_challenge"))).toHaveLength(1)` |
| 80 | KEPT | 80 | `expect(audit).not.toHaveBeenCalled()` | `expect(audit).not.toHaveBeenCalled()` |
| 82 | KEPT | 82 | `expect(refused.public).toEqual(baseline.public)` | `expect(refused.public).toEqual(baseline.public)` |
| 83 | KEPT | 83 | `expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } })` | `expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } })` |
| 84 | KEPT | 84 | `expect(refused.error.cause).toBe(failure)` | `expect(refused.error.cause).toBe(failure)` |
| 85 | KEPT | 85 | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN")` | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN")` |
| 91 | KEPT | 91 | `expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } })` | `expect(refused.public).toEqual({ status: 400, name: "AuthError", body: { code: "INVALID_CODE" } })` |
| 92 | KEPT | 92 | `expect(refused.error.cause).toBeUndefined()` | `expect(refused.error.cause).toBeUndefined()` |
| 93 | KEPT | 93 | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN")` | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, purpose === "invitation" ? "SSO_REQUIRED_INVITE_CLOSED" : "SSO_REQUIRED_CODE_SIGNIN")` |
| 106 | KEPT | 106 | `expect(http.getStatus()).toBe(403)` | `expect(http.getStatus()).toBe(403)` |
| 107 | KEPT | 107 | `expect(http.getResponse()).toEqual({ code: "TENANT_FORBIDDEN" })` | `expect(http.getResponse()).toEqual({ code: "TENANT_FORBIDDEN" })` |
| 108 | KEPT | 108 | `expect(error).toMatchObject({ name: "AuthError", code: "TENANT_FORBIDDEN", cause: failure })` | `expect(error).toMatchObject({ name: "AuthError", code: "TENANT_FORBIDDEN", cause: failure })` |
| 109 | KEPT | 109 | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, "SSO_REQUIRED_INVITE_CLOSED")` | `expect(audit).toHaveBeenCalledExactlyOnceWith(connection, "SSO_REQUIRED_INVITE_CLOSED")` |
| 110 | KEPT | 110 | `expect(f.statements).toEqual(["SELECT * FROM identity.sso_invite_member($1,$2,$3,$4)"])` | `expect(f.statements).toEqual(["SELECT * FROM identity.sso_invite_member($1,$2,$3,$4)"])` |
| 120 | KEPT | 120 | `expect(verification(f, purpose)).rejects.toBe(failure)` | `expect(verification(f, purpose)).rejects.toBe(failure)` |
| 121 | KEPT | 121 | `expect(f.statements).toContain("ROLLBACK")` | `expect(f.statements).toContain("ROLLBACK")` |
| 122 | KEPT | 122 | `expect(audit).not.toHaveBeenCalled()` | `expect(audit).not.toHaveBeenCalled()` |
| 130 | KEPT | 130 | `expect(parameters[1][0]).toBe(user)` | `expect(parameters[1][0]).toBe(user)` |
| 131 | RE-POINTED | 131 | `expect(JSON.parse(parameters[1][1] as string)).toEqual({ version: input.version, requested_tenant_id: tenant, reason: input.reason })` | `expect(JSON.parse(parameters[1][1] as string)).toEqual({ version: input.version, requested_tenant_id: tenant, commandId:input.commandId, windowMinutes:60, reason: input.reason })` |
| 132 | KEPT | 132 | `expect(JSON.stringify(parameters[1])).not.toContain(input.email)` | `expect(JSON.stringify(parameters[1])).not.toContain(input.email)` |
| 133 | KEPT | 133 | `expect(JSON.stringify(parameters[1])).not.toContain(input.code)` | `expect(JSON.stringify(parameters[1])).not.toContain(input.code)` |
