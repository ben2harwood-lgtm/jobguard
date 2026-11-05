import { billabilityFailure, recoveryBillabilityRequest } from "../../../../../../lib/recovery-billability-server";
export const dynamic = "force-dynamic";
async function reply(request: Request, { params }: { params: Promise<{ id: string; caseId: string }> }) {
  const { id, caseId } = await params;
  try { return Response.json(await recoveryBillabilityRequest(request, id, caseId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) {
    const { status, ...body } = billabilityFailure(error);
    return Response.json({ version: "recovery-billability-error.v1", ...body }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
export const POST = reply;
export const GET = reply;
