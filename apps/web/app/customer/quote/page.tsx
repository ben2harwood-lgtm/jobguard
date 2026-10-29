export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer", robots: { index: false, follow: false } } as const;
import CustomerQuote from "./quote";
export default function Page() { return <CustomerQuote />; }
