import "./design.css";
import "./design-fit.css";

// Screens rebuilt from the approved clickable design. The stylesheet is scoped under
// .jgd, so it only styles pages in this route group.
export default function DesignedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="jgd">{children}</div>;
}
