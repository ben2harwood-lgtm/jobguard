import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const check = vi.hoisted(() => vi.fn());
vi.mock('../../../../../lib/evidence-bundle-server', () => ({ checkContractorBundle: check,
  bundleCheckFailure: () => ({ status: 404, body: { code: 'NOT_FOUND' } }) }));
import { GET } from './route';
it('uses the path and selection only, ignores client authority, and disables caching', async () => {
  check.mockResolvedValue({ sections: [] });
  const response = await GET(new Request('http://localhost/api/contractor/jobs/job/bundle-check?extraId=extra&requestId=request&tenantId=forged',
    { headers: { 'x-tenant-id': 'forged' } }), { params: Promise.resolve({ id: 'job' }) });
  expect(check).toHaveBeenLastCalledWith({ version: 'contractor-bundle-query.v1', jobId: 'job', extraId: 'extra', requestId: 'request' });
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('no-store');
});
it('returns the same safe no-store refusal without internal details', async () => {
  check.mockRejectedValue(new Error('PRIVATE database detail'));
  const response = await GET(new Request('http://localhost/'), { params: Promise.resolve({ id: 'job' }) });
  expect(response.status).toBe(404); expect(await response.json()).toEqual({ code: 'NOT_FOUND' });
  expect(response.headers.get('cache-control')).toBe('no-store');
});
