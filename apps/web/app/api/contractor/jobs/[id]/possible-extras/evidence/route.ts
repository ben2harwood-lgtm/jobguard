import { observationEvidenceResponse } from "../../../../../../lib/observation-evidence-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 return observationEvidenceResponse(request, context.params);
}
