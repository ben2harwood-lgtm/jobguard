import { merchantOrderReply } from "../../../../../lib/merchant-order-server";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return merchantOrderReply(request, (await params).id);
}
