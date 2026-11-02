import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnterpriseLivePromptApplication, enterpriseLivePromptHttpFailure } from './enterprise-live-prompt.application.js';
const principal = () => ({ version: 'contractor-principal.v1', sessionId: randomUUID() });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('persisted live prompt application boundary', () => {
 it.each(['pilot_no_charge', 'production_billing', ''])('server mode %s refuses before database access', async mode => {
  vi.stubEnv('JOBGUARD_ENV', mode);
  const connect = vi.spyOn(Pool.prototype, 'connect');
  await expect(new EnterpriseLivePromptApplication(new Pool()).list(principal(), randomUUID(), {})).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' });
  expect(connect).not.toHaveBeenCalled();
 });
 it('rejects a caller principal carrying tenant or actor authority', async () => {
  vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
  await expect(new EnterpriseLivePromptApplication(new Pool()).list({ ...principal(), tenantId: randomUUID() }, randomUUID(), {})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
 });
 it('does not leak database errors', () => {
  expect(enterpriseLivePromptHttpFailure(new Error('secret SQL'))).toEqual({ status: 503, body: { version: 'enterprise-live-prompt-error.v1', code: 'PROMPT_UNAVAILABLE' } });
 });
});

it('binds confirmation to path identifiers and the authenticated session without adding authority', async () => {
 vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
 const { EnterpriseLivePromptRepository } = await import('@jobguard/db');
 const result = { outcome: 'coalesced', extraId: randomUUID() }, confirm = vi.spyOn(EnterpriseLivePromptRepository.prototype, 'confirm').mockResolvedValue(result);
 const identity = principal(), jobId = randomUUID(), promptId = randomUUID(), commandId = randomUUID(), promptHash = 'a'.repeat(64);
 expect(await new EnterpriseLivePromptApplication(new Pool()).confirm(identity, jobId, promptId, { version: 'confirm-prompt.v1', commandId, promptHash })).toBe(result);
 expect(confirm).toHaveBeenCalledExactlyOnceWith(identity.sessionId, { version: 'confirm-prompt.v1', commandId, promptHash, jobId, promptId });
});
it('reads current persisted projection on each request without application caching', async () => {
 vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
 const { EnterpriseLivePromptRepository } = await import('@jobguard/db');
 const list = vi.spyOn(EnterpriseLivePromptRepository.prototype, 'list').mockResolvedValueOnce({ items: [], nextCursor: null }).mockResolvedValueOnce({ items: [{ id: randomUUID(), jobId: randomUUID(), promptHash: 'a'.repeat(64), rule: 'b', ruleVersion: 'materials-strict-excess.v1', surfacedAt: '2026-10-18T12:00:00Z', resolution: null }], nextCursor: null });
 const app = new EnterpriseLivePromptApplication(new Pool()), identity = principal(), jobId = randomUUID();
 expect(await app.list(identity, jobId, { limit: '10' })).toEqual({ items: [], nextCursor: null });
 expect(await app.list(identity, jobId, { limit: '10' })).toMatchObject({ items: [{ id: expect.any(String) }] });
 expect(list).toHaveBeenCalledTimes(2);
 expect(list).toHaveBeenLastCalledWith(identity.sessionId, { version: 'live-prompt-list.v1', jobId, limit: 10 });
});
