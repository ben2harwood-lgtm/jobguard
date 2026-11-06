import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "JobGuard", description: "Know where every job stands" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body><div className="sandbox-banner" role="note" aria-label="Practice sandbox notice">Practice sandbox — synthetic data; nothing is sent or charged</div>{children}</body></html>;
}
