import { managedRecoveryRequest } from "../../../../../../lib/managed-recovery-server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; caseId: string }> };
export async function GET(request: Request, { params }: Context) {
  return managedRecoveryRequest(request, await params);
}
export async function POST(request: Request, { params }: Context) {
  return managedRecoveryRequest(request, await params, true);
}
