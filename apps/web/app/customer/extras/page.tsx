export const dynamic = "force-dynamic";
import CustomerExtras from "./extras";
export default function Page() { return <CustomerExtras pilot={process.env.JOBGUARD_ENV === "pilot_no_charge"}/>; }
