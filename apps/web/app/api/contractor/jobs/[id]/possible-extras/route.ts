import { possibleExtrasResponse } from "../../../../../lib/possible-extras-server";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return possibleExtrasResponse(request, context.params, "list");
}
