import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: state.token }) }) }));
const pool = vi.hoisted(() => vi.fn());
vi.mock('./synthetic-server', () => ({ syntheticPool: pool }));
vi.mock('./northside-server', () => ({ practiceStorage: vi.fn() }));
vi.mock('@jobguard/api/evidence-bundle', async () => await import('../../../api/src/evidence-bundle.application.js'));
import { checkContractorBundle, bundleCheckFailure } from './evidence-bundle-server';
afterEach(() => { vi.unstubAllEnvs(); pool.mockClear(); });
it('refuses disabled mode and absent session before any database access', async () => {
  vi.stubEnv('JOBGUARD_ENV', 'production');
  await expect(checkContractorBundle({})).rejects.toMatchObject({ code: 'MODE_FORBIDDEN' });
  vi.stubEnv('JOBGUARD_ENV', 'synthetic_demo');
  await expect(checkContractorBundle({})).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(pool).not.toHaveBeenCalled();
});
it('maps safe failures identically and hides unknown error details', () => {
  expect(bundleCheckFailure({ code: 'NOT_FOUND' }).status).toBe(404);
  expect(bundleCheckFailure(new Error('PRIVATE'))).toEqual({ status: 503, body: { version: 'contractor-bundle-check-error.v1', code: 'BUNDLE_CHECK_UNAVAILABLE' } });
});
