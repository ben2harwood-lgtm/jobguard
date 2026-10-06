import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { Pool } from 'pg';

const application = vi.hoisted(() => ({ list: vi.fn(), generate: vi.fn(), approveAttachment: vi.fn(), inspect: vi.fn(), download: vi.fn() }));
vi.mock('./evidence-pack.application.js', async original => ({
  ...(await original<typeof import('./evidence-pack.application.js')>()),
  EvidencePackApplication: class { list = application.list; generate = application.generate; approveAttachment = application.approveAttachment; inspect = application.inspect; download = application.download; },
}));
const { EvidencePackController } = await import('./evidence-pack.controller.js');

const request = { headers: { cookie: 'jg_session=18000000-0000-4000-8000-000000000001' } };
const caseId = '18000000-0000-4000-8000-000000000002';
async function failureOf(run: () => Promise<unknown>) {
  try { await run(); } catch (error) { expect(error).toBeInstanceOf(HttpException); return { status: (error as HttpException).getStatus(), body: (error as HttpException).getResponse() }; }
  throw new Error('expected the call to fail');
}

describe('evidence pack error mapping', () => {
  beforeEach(() => vi.clearAllMocks());
  it('never echoes an unexpected error message (for example PostgreSQL text) to the client', async () => {
    const leak = 'relation "app.evidence_pack_revision" does not exist at character 15';
    application.list.mockRejectedValue(new Error(leak));
    const failure = await failureOf(() => new EvidencePackController({} as Pool).get(request, caseId));
    expect(failure).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR' } });
    expect(JSON.stringify(failure)).not.toContain('relation');
  });
});
