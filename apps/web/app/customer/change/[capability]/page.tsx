import type { Metadata } from "next";
import { assertExtraLinkMode } from "@jobguard/db";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
import { CustomerExtraAgreement } from "./view";
export const metadata: Metadata = { title: "Agree to an extra · JobGuard practice", referrer: "no-referrer", robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ capability: string }> }) {
  try { assertExtraLinkMode(); } catch { notFound(); }
  return <CustomerExtraAgreement capability={(await params).capability} />;
}
