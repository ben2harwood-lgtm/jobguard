import 'reflect-metadata';
import { Pool } from 'pg';
import { afterEach, expect, it, vi } from 'vitest';
import { EnterpriseLivePromptController } from './enterprise-live-prompt.controller.js';
import { EnterpriseLivePromptApplication } from './enterprise-live-prompt.application.js';
// Controller-level transport checks intentionally bind no socket. Full HTTP/DB read-after-write belongs to CI.
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it.each([undefined, 'null', 'https://foreign.invalid'])('rejects Origin %s before application or storage', origin => {
 vi.stubEnv('JOBGUARD_ALLOWED_ORIGINS', 'https://practice.invalid');
 const application = vi.spyOn(EnterpriseLivePromptApplication.prototype, 'evaluate');
 expect(() => new EnterpriseLivePromptController(new Pool()).evaluate('job', 'jg_session=session', origin, {})).toThrow();
 expect(application).not.toHaveBeenCalled();
});
it('extracts only session cookie and passes path and strict body to application', async () => {
 vi.stubEnv('JOBGUARD_ALLOWED_ORIGINS', 'https://practice.invalid');
 const application = vi.spyOn(EnterpriseLivePromptApplication.prototype, 'evaluate').mockResolvedValue({ prompts: [] });
 const body = { version: 'evaluate-live-prompts.v1', commandId: 'command' };
 await new EnterpriseLivePromptController(new Pool()).evaluate('job', 'tenantId=forged; jg_session=session', 'https://practice.invalid', body);
 expect(application).toHaveBeenCalledWith({ version: 'contractor-principal.v1', sessionId: 'session' }, 'job', body);
});
it('every read and write route has no-store metadata', () => {
 for (const name of ['list', 'detail', 'materials', 'observation', 'evaluate', 'confirm', 'dismiss'] as const) expect(Reflect.getMetadata('__headers__', EnterpriseLivePromptController.prototype[name])).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
});
