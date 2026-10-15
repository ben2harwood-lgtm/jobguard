# Existing assertions at e77ef5c

Every surviving line containing an assertion is unchanged. This is a source inventory, not executed evidence. The two STOP assertions below require a coordinator amendment before implementation. No additional assertion is retired by the builder.

| File and line | State | Exact source |
|---|---|---|
| packages/db/test/sso-emergency.integration.test.ts:38 | KEPT, source unchanged; NOT RUN | expect(names.indexOf("0129_sso_required.sql")).toBeGreaterThan(names.indexOf("0120_enterprise_identity.sql")); |
| packages/db/test/sso-emergency.integration.test.ts:39 | KEPT, source unchanged; NOT RUN | for(let i=1;i<names.length;i++)expect(names[i]!>names[i-1]!).toBe(true); |
| packages/db/test/sso-emergency.integration.test.ts:86 | KEPT, source unchanged; NOT RUN | expect(()=>verifyAuditChain(events)).not.toThrow();return rows; |
| packages/db/test/sso-emergency.integration.test.ts:98 | KEPT, source unchanged; NOT RUN | expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false); |
| packages/db/test/sso-emergency.integration.test.ts:100 | KEPT, source unchanged; NOT RUN | expect((await use(other.principal.identityUserId)).rows[0].result.used).toBe(false); |
| packages/db/test/sso-emergency.integration.test.ts:101 | KEPT, source unchanged; NOT RUN | expect((await use(f.principal.identityUserId,other.principal.tenantId)).rows[0].result.used).toBe(false); |
| packages/db/test/sso-emergency.integration.test.ts:104 | KEPT, source unchanged; NOT RUN | expect(submissions.filter(r=>r.rows[0].result.used)).toHaveLength(1); |
| packages/db/test/sso-emergency.integration.test.ts:105 | KEPT, source unchanged; NOT RUN | expect(submissions.filter(r=>!r.rows[0].result.used)).toHaveLength(1); |
| packages/db/test/sso-emergency.integration.test.ts:106 | KEPT, source unchanged; NOT RUN | expect(submissions[0]!.rows[0].result).toMatchObject({used:true,connectionId:f.connectionId}); |
| packages/db/test/sso-emergency.integration.test.ts:107 | KEPT, source unchanged; NOT RUN | expect((await client.query("SELECT required,actor_kind FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1",[f.principal.tenantId])).rows[0]).toEqual({required:false,actor_kind:"emergency"}); |
| packages/db/test/sso-emergency.integration.test.ts:108 | KEPT, source unchanged; NOT RUN | expect((await use(f.principal.identityUserId)).rows[0].result.used).toBe(false); |
| packages/db/test/sso-emergency.integration.test.ts:109 | KEPT, source unchanged; NOT RUN | expect((await client.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1); |
| packages/db/test/sso-emergency.integration.test.ts:127 | KEPT, source unchanged; NOT RUN | expect((await admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1); |
| packages/db/test/sso-emergency.integration.test.ts:128 | KEPT, source unchanged; NOT RUN | expect((await admin.query("SELECT count(*)::int n FROM app.evidence_object WHERE tenant_id=$1",[f.principal.tenantId])).rows[0].n).toBe(1); |
| packages/db/test/sso-emergency.integration.test.ts:132 | KEPT, source unchanged; NOT RUN | await expect(f.service.emergency({version:"sso-emergency.v1",requested_tenant_id:f.principal.tenantId,email:f.email,code:request.fixtureCode!,reason:"Synthetic outage with held approval rule"},origin)).rejects.toMatchObject({code:"SSO_EMERGENCY_REFUSED"}); |
| packages/db/test/sso-emergency.integration.test.ts:133 | KEPT, source unchanged; NOT RUN | expect(await snapshot(admin)).toEqual(prior);expect((await audit(f.principal.tenantId)).slice(0,earlier.length)).toEqual(earlier); |
| packages/db/test/sso-emergency.integration.test.ts:139 | KEPT, source unchanged; NOT RUN | expect(result.used).toBe(true); |
| packages/db/test/sso-emergency.integration.test.ts:141 | KEPT, source unchanged; NOT RUN | expect(await snapshot(client)).toEqual(prior); |
| packages/db/test/sso-emergency.integration.test.ts:143 | KEPT, source unchanged; NOT RUN | expect(after.slice(0,earlier.length)).toEqual(earlier); |
| packages/db/test/sso-emergency.integration.test.ts:144 | KEPT, source unchanged; NOT RUN | expect(after.at(-1).event_type).toBe("sso.emergency.used"); |
| packages/db/test/sso-emergency.integration.test.ts:147 | KEPT, source unchanged; NOT RUN | expect(body).not.toMatch(/\b(?:UPDATE\|DELETE\|TRUNCATE)\b\|journal\|evidence/iu); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:87 | KEPT, source unchanged; NOT RUN | expect(() => verifyAuditChain(events)).not.toThrow(); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:132 | KEPT, source unchanged; NOT RUN | expect(new Set(pids).size).toBe(2); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:142 | KEPT, source unchanged; NOT RUN | expect(results.filter(r => r.used)).toHaveLength(1); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:143 | KEPT, source unchanged; NOT RUN | expect(results.filter(r => !r.used)).toEqual([{ used: false, cause: "EMERGENCY_ALREADY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId }]); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:144 | KEPT, source unchanged; NOT RUN | expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId }); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:150 | KEPT, source unchanged; NOT RUN | expect(await snapshot()).toEqual(before); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:152 | KEPT, source unchanged; NOT RUN | expect(revisionsAfter.slice(0, revisionsBefore.length)).toEqual(revisionsBefore); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:153 | KEPT, source unchanged; NOT RUN | expect(revisionsAfter).toHaveLength(revisionsBefore.length + 1); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:154 | KEPT, source unchanged; NOT RUN | expect(revisionsAfter.at(-1)).toMatchObject({ required: false, revision: iteration * 2 + 2, actor_kind: "emergency" }); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:156 | KEPT, source unchanged; NOT RUN | expect(uses).toHaveLength(1); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:157 | KEPT, source unchanged; NOT RUN | expect(uses[0].event_id).toBe(revisionsAfter.at(-1).id); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:158 | KEPT, source unchanged; NOT RUN | expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(iteration + 1); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:160 | KEPT, source unchanged; NOT RUN | expect(afterAudit.slice(0, earlierAudit.length)).toEqual(earlierAudit); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:161 | KEPT, source unchanged; NOT RUN | expect((await admin.query("SELECT * FROM app.audit_event WHERE id=ANY($1::uuid[]) ORDER BY tenant_id,sequence", [allEarlierAudit.map(r => r.id)])).rows).toEqual(allEarlierAudit); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:162 | KEPT, source unchanged; NOT RUN | expect((await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows[0].n).toBe(allEarlierAudit.length + 2); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:163 | KEPT, source unchanged; NOT RUN | expect(afterAudit.slice(earlierAudit.length).map(r => ({ type: r.event_type, code: r.payload.references.code }))).toEqual([ |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:168 | KEPT, source unchanged; NOT RUN | expect(logsAfter.slice(0, logsBefore.length)).toEqual(logsBefore); |
| packages/db/test/sso-emergency-concurrency.integration.test.ts:169 | KEPT, source unchanged; NOT RUN | expect(logsAfter.slice(logsBefore.length).map(r => ({ outcome: r.outcome, cause: r.cause_code }))).toEqual([ |
