import 'server-only';
import { NextResponse } from 'next/server';
import { checkContractorBundle, bundleCheckFailure } from '../../../../../lib/evidence-bundle-server';
const headers = { 'cache-control': 'no-store' };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, query = new URL(request.url).searchParams;
    return NextResponse.json(await checkContractorBundle({ version: 'contractor-bundle-query.v1', jobId: id,
      extraId: query.get('extraId'), requestId: query.get('requestId') }), { headers });
  } catch (error) { const failure = bundleCheckFailure(error); return NextResponse.json(failure.body, { status: failure.status, headers }); }
}
