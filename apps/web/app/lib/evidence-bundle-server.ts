import 'server-only';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { ContractorRepository, contractorSessionContext, type VerifiedTenantContext } from '@jobguard/db';
import { ContractorBundleCheckApplication, BundleCheckError } from '@jobguard/api/evidence-bundle';
import { contractorBundleCheckV1 } from '@jobguard/api/evidence-bundle-contracts';
import { syntheticPool } from './synthetic-server';
import { practiceStorage } from './northside-server';

export async function checkContractorBundle(raw: unknown) {
  if (process.env.JOBGUARD_ENV !== 'synthetic_demo') throw new BundleCheckError('MODE_FORBIDDEN');
  const token = (await cookies()).get('jg_session')?.value;
  if (!z.string().uuid().safeParse(token).success) throw Object.assign(new Error('UNAUTHENTICATED'), { code: 'UNAUTHENTICATED' });
  const pool = syntheticPool();
  const context: VerifiedTenantContext = await contractorSessionContext(pool, token!);
  const actor = await new ContractorRepository(pool).resolveSession(token!);
  const parsed = contractorBundleCheckV1.safeParse(raw);
  if (!parsed.success) throw new BundleCheckError('INVALID_INPUT');
  return new ContractorBundleCheckApplication(pool, practiceStorage(context, parsed.data.jobId, pool)).check(context, actor, raw);
}
export function bundleCheckFailure(error: unknown) {
  const code = (error as { code?: string })?.code;
  const status = code === 'UNAUTHENTICATED' ? 401 : code === 'MODE_FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'INVALID_INPUT' ? 400 : 503;
  return { status, body: { version: 'contractor-bundle-check-error.v1', code: status === 503 ? 'BUNDLE_CHECK_UNAVAILABLE' : code } };
}
