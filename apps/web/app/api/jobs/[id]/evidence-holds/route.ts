import { evidenceHoldResponse } from "../../../../lib/evidence-hold-server";
export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  return evidenceHoldResponse(request, (await params).id, false);
}
export async function POST(request: Request, { params }: Params) {
  return evidenceHoldResponse(request, (await params).id, true);
}
