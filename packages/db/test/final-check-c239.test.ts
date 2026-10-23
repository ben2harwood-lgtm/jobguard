import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const sql = readFileSync(new URL('../migrations/0205_final_check.sql', import.meta.url), 'utf8');
it('C204 processing inventory excludes terminal uploads using the prerequisite manifest exclusion', () => {
 expect(sql).toContain('ms.excluded_state IS NULL');
 expect(sql).toContain('app.shadow_final_check_run_binding');
});
it('C239 keeps prerequisite table definitions, policies and grants intact', () => {
 expect(sql).not.toMatch(/CREATE TABLE app\.final_check_manifest(?:_source)?\s*\(/u);
 expect(sql).not.toMatch(/(?:DROP|ALTER) (?:POLICY|TRIGGER).*ON app\.final_check_manifest/u);
});
it('B3 signal evidence offered to main reconciliation is bounded by the immutable lock cutoff', () => {
 const read = sql.slice(sql.indexOf('CREATE FUNCTION app.read_final_check_manifest'), sql.indexOf('CREATE FUNCTION app.begin_final_check'));
 expect(read).toContain('e.source_received_at<=manifest.evidence_cutoff_at');
});
it.each([
 ['FINAL_CHECK_NOT_COMPLETE','FINAL_CHECK_PENDING'],
 ['FINAL_CHECK_INPUT_UNAVAILABLE','FINAL_CHECK_PENDING'],
 ['FORBIDDEN','FINAL_CHECK_FORBIDDEN'],
 ['IDEMPOTENCY_PAYLOAD_CONFLICT','IDEMPOTENCY_CONFLICT'],
])('maps prerequisite %s to typed %s after rollback', async (failure,code) => {
 const { FinalCheckRepository } = await import('../src/final-check-repository.js');
 const { testTenantContext } = await import('./tenant-context-test-utils.js');
 const statements:string[]=[];
 const client={query:async (sql:string)=>{statements.push(sql);if(sql.includes('app.complete_final_check'))throw new Error(failure);return {rows:[]};},release:()=>undefined};
 const pool={connect:async()=>client} as unknown as import('pg').Pool;
 const id='11111111-1111-4111-8111-111111111111';
 const result=new FinalCheckRepository(pool).reconcile(testTenantContext(id),id,id,[]);
 const {FinalCheckError}=await import('@jobguard/core');
 await expect(result).rejects.toBeInstanceOf(FinalCheckError);await expect(result).rejects.toMatchObject({code});
 expect(statements.at(-1)).toBe('ROLLBACK');expect(statements).not.toContain('COMMIT');
});
