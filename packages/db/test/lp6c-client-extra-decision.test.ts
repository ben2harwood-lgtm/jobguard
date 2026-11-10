import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const sql=readFileSync(new URL('../migrations/0970_lp6c_client_extra_decision.sql',import.meta.url),'utf8');
const body=(source:string)=>source.split('FUNCTION identity.extra_customer_approval(')[1]!.split('AS $$')[1]!.split('$$;')[0]!;
it('preserves the complete customer approval body except its decide-only binder call',()=>{
 const prior=readFileSync(new URL('../migrations/0644_extra_customer_approval.sql',import.meta.url),'utf8');
 expect(body(sql).replace('  PERFORM app.lp6_bind_client_approver(t,j,c,k.token_hash,k.recipient);\n','')).toBe(body(prior));
 expect(body(sql).match(/app\.lp6_bind_client_approver/gu)).toHaveLength(1);
 expect(body(sql).indexOf('app.lp6_bind_client_approver')).toBeGreaterThan(body(sql).indexOf("IF input->>'action'='decide' THEN"));
 expect(body(sql).indexOf('app.lp6_bind_client_approver')).toBeLessThan(body(sql).indexOf('app.begin_command'));
});
it('reuses the existing link validator and confines binding to the client actor, job and command',()=>{
 expect(sql).toContain("identity.extra_customer_use(t,j,c,s.token_digest,NULL,'resolve')");
 expect(sql).toContain("'customer_portal_delegated',s.id::text,t,c");
 expect(sql).toContain("least(s.expires_at,clock_timestamp()+interval '1 minute'),j,'ClientDecideExtra'");
 expect(sql).toContain("l.token_hash=lp6_bind_client_approver.token_hash");
 expect(sql).toContain("lower(l.recipient)=lower(lp6_bind_client_approver.recipient)");
 expect(sql).not.toMatch(/CREATE ROLE|TO jobguard_runtime|CREATE OR REPLACE FUNCTION app\./u);
});
it('the customer integration fixture has no member binding to hide a missing delegation',()=>{
 const fixture=readFileSync(new URL('./extra-client-session.integration.test.ts',import.meta.url),'utf8');
 expect(fixture).not.toMatch(/testBoundTenantContext|app\.bind_request/u);
 expect(fixture).toContain('const client=await identity.connect()');
});
