import { NextResponse } from "next/server";
import { rateSession, rateOrigin, rateQuery, rateFailure, rateHeaders, refuseRateIdentity } from "../../../../lib/rate-suggestion-server";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    refuseRateIdentity(request);
    const query = rateQuery(new URL(request.url).searchParams);
    const { application, token } = await rateSession();
    return NextResponse.json(await application.read(token, (await params).id, query), { headers: rateHeaders });
  } catch (error) { return rateFailure(error); }
}
export async function POST(request: Request, { params }: Params) {
  try {
    refuseRateIdentity(request);
    if (new URL(request.url).search) throw new Error("INVALID_ACCEPTANCE");
    rateOrigin(request);
    const { application, token } = await rateSession(request);
    return NextResponse.json(await application.accept(token, (await params).id, await request.json()), { headers: rateHeaders });
  } catch (error) { return rateFailure(error); }
}
