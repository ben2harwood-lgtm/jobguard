import { NextResponse } from "next/server";
import { readRecurringExtras, recurringExtrasRequest, recurringExtrasFailure, recurringExtrasHeaders } from "../../../../lib/recurring-extras-server";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    recurringExtrasRequest(request);
    return NextResponse.json(await readRecurringExtras((await params).id), { headers: recurringExtrasHeaders });
  } catch (error) { return recurringExtrasFailure(error); }
}
