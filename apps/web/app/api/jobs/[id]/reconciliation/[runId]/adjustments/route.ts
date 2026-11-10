import { financialReconciliationAdjustmentsResponse } from "../../../../../../lib/financial-reconciliation-adjustments-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; runId: string }> };
export const GET = (request: Request, context: Context) => financialReconciliationAdjustmentsResponse(request, context.params);
export const POST = (request: Request, context: Context) => financialReconciliationAdjustmentsResponse(request, context.params);
