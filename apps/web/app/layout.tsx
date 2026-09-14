import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = { title: "JobGuard", description: "Know where every job stands" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB"><body>{children}</body></html>;
}
