import { fridayUpdateRequest } from "../../../../../lib/v2-friday-update-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return fridayUpdateRequest(request, (await params).id, "diary");
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return fridayUpdateRequest(request, (await params).id, "diary");
}
