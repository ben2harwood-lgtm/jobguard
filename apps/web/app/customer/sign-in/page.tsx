export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer", robots: { index: false, follow: false } } as const;
import CustomerSignin from "./signin";
export default function Page() { return <CustomerSignin />; }
