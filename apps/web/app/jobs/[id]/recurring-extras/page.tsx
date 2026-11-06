import React from "react";
import { readRecurringExtras } from "../../../lib/recurring-extras-server";
import { RecurringExtrasScreen } from "./recurring-extras-screen";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function RecurringExtrasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try {
    if (Object.keys(await searchParams).length) throw new Error("INVALID_INPUT");
    return <RecurringExtrasScreen result={await readRecurringExtras((await params).id)} />;
  } catch { return <main><h1>Recurring extras</h1><p>Practice read refused. Sign in with a current company owner membership.</p></main>; }
}
