import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { EnterpriseLivePromptApplication } from './enterprise-live-prompt.application.js';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each(['tenantId', 'actorId', 'role', 'gate', 'settlement', 'environment', 'jobId'])('rejects caller %s in mutation body before storage', async field => {
 vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
 const connect = vi.spyOn(Pool.prototype, 'connect');
 await expect(new EnterpriseLivePromptApplication(new Pool()).evaluate({ version: 'contractor-principal.v1', sessionId: randomUUID() }, randomUUID(), { version: 'evaluate-live-prompts.v1', commandId: randomUUID(), [field]: randomUUID() })).rejects.toMatchObject({ code: 'INVALID_PROMPT_COMMAND' });
 expect(connect).not.toHaveBeenCalled();
});
it('pagination rejects unbounded or authority-bearing queries', async () => {
 vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
 const app = new EnterpriseLivePromptApplication(new Pool()), principal = { version: 'contractor-principal.v1', sessionId: randomUUID() };
 for (const query of [{ limit: '101' }, { limit: '-1' }, { tenantId: randomUUID() }, { after: 'invalid' }]) await expect(app.list(principal, randomUUID(), query)).rejects.toMatchObject({ code: 'INVALID_PROMPT_COMMAND' });
});
it('every mutation rejects body path authority and extra privileged fields', async () => {
 vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
 const app = new EnterpriseLivePromptApplication(new Pool()), principal = { version: 'contractor-principal.v1', sessionId: randomUUID() }, jobId = randomUUID(), promptId = randomUUID(), commandId = randomUUID();
 const cases = [
  (extra: object) => app.importMaterials(principal, jobId, { version: 'materials-issue.v1', commandId, sourceId: 'store', eventId: 'event', workIdentity: 'REPAIR-DOOR', unit: 'each', quantity: '2', occurredAtMicros: '1', kind: 'issue', ...extra }),
  (extra: object) => app.registerObservation(principal, jobId, { version: 'completion-observation.v1', commandId, evidenceId: randomUUID(), sha256: 'a'.repeat(64), objectVersion: 'version', sourceText: 'door', locator: { kind: 'text_span', start: 0, end: 4, quote: 'door' }, workIdentity: 'REPAIR-DOOR', ...extra }),
  (extra: object) => app.confirm(principal, jobId, promptId, { version: 'confirm-prompt.v1', commandId, promptHash: 'a'.repeat(64), ...extra }),
  (extra: object) => app.dismiss(principal, jobId, promptId, { version: 'dismiss-prompt.v1', commandId, promptHash: 'a'.repeat(64), reason: 'Already considered', ...extra }),
 ];
 const connect = vi.spyOn(Pool.prototype, 'connect');
 for (const invoke of cases) for (const extra of [{ jobId }, { tenantId: randomUUID() }, { actorId: randomUUID() }, { role: 'owner' }, { gate: true }, { settlement: 'paid' }]) await expect(invoke(extra)).rejects.toMatchObject({ code: 'INVALID_PROMPT_COMMAND' });
 expect(connect).not.toHaveBeenCalled();
});
