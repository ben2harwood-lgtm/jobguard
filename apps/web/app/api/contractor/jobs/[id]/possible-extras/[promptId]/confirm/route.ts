import { possibleExtrasResponse } from "../../../../../../../lib/possible-extras-server";
export async function POST(request: Request, context: { params: Promise<{ id: string; promptId: string }> }) {
  return possibleExtrasResponse(request, context.params, "confirm");
}
