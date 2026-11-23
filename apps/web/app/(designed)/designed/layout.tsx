import Link from "next/link";
import { contractorHref } from "../../lib/contractor-href";

const links = [
  ["/northside", "Northside"],
  ["/contractor/work-orders", "Work orders"],
  ["/site/extra", "Log an extra"],
  ["/approvals/extras", "Review queue"],
] as const;

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  return <div className="contractor-design">
    <a className="skip" href="#contractor-content">Skip to content</a>
    <div className="contractor-frame">
      <aside className="sidebar">
        <Link className="contractor-brand" href={contractorHref("/northside", true)}><img src="/design/assets/logo-mark.png" alt="" width={32} height={36} />JobGuard</Link>
        <nav className="sidenav" aria-label="Contractor workspace">
          {links.map(([href, label]) => <Link key={href} href={contractorHref(href, true)}>{label}</Link>)}
        </nav>
      </aside>
      <div id="contractor-content" className="contractor-content" tabIndex={-1}>{children}</div>
    </div>
  </div>;
}
