export const job = {
  title: "Kitchen splashback & hall decorating",
  site: "24 Rowan Close · Occupied home",
  quote: "Quote revision 2",
  merchant: "Rowan Builders’ Merchant",
  enquiryNotes: "Please confirm stock and whether collection is available before each needed-by date.",
};

export const trades = ["Tiler", "Decorator"] as const;

export type Task = {
  name: string;
  area: string;
  trade: (typeof trades)[number];
  duration: string;
  day: string;
  status: string;
  change?: string;
};

export const tasks: Task[] = [
  { name: "Prepare and tile the splashback", area: "Kitchen", trade: "Tiler", duration: "1 day", day: "Mon 30 Nov", status: "Ready", change: "Splashback extended to the end of the worktop" },
  { name: "Prepare hall walls and woodwork", area: "Hall", trade: "Decorator", duration: "½ day", day: "Mon 30 Nov", status: "Ready" },
  { name: "Grout the splashback", area: "Kitchen", trade: "Tiler", duration: "½ day", day: "Tue 1 Dec", status: "Waiting for tiles to set" },
  { name: "Paint hall walls and woodwork", area: "Hall", trade: "Decorator", duration: "1 day", day: "Wed 2 Dec", status: "Waiting for prep" },
];

export type ScopeItem = {
  name: string;
  area: string;
  unit: string;
  value: string;
  source: string;
  confirmed: boolean;
  question?: string;
  product: string;
  products: string[];
  packSizes: string[];
  packSize: string;
  wastage: string;
};

export const scope: ScopeItem[] = [
  { name: "Tile the splashback", area: "Kitchen", unit: "m²", value: "6", source: "Builder’s tape measure", confirmed: true,
    product: "White ceramic wall tiles", products: ["White ceramic wall tiles", "Sage ceramic wall tiles"], packSizes: ["1.2 m²", "1.5 m²"], packSize: "1.2 m²", wastage: "10%" },
  { name: "Paint hall walls", area: "Hall", unit: "m²", value: "24", source: "Builder’s site walk", confirmed: true,
    product: "White matt emulsion", products: ["White matt emulsion", "Washable matt emulsion"], packSizes: ["5 L", "10 L"], packSize: "5 L", wastage: "10%" },
  { name: "Paint hall woodwork", area: "Hall", unit: "m", value: "", source: "Site check needed", confirmed: false, question: "How many metres of skirting and door trim need painting?",
    product: "Customer’s eggshell paint", products: ["Customer’s eggshell paint"], packSizes: ["1 L", "2.5 L"], packSize: "1 L", wastage: "10%" },
  { name: "Refit splashback trim", area: "Kitchen", unit: "m", value: "", source: "Site check needed", confirmed: false, question: "How long is the existing trim?",
    product: "", products: [], packSizes: [], packSize: "", wastage: "" },
];

export type Material = {
  scopeIndex: number;
  supplier: string;
  needed: string;
  suppliedBy: "Builder" | "Customer";
  packs: number | null;
  onSite: number | null;
};

export const materials: Material[] = [
  { scopeIndex: 0, supplier: job.merchant, needed: "2026-11-30", suppliedBy: "Builder", packs: 6, onSite: 1 },
  { scopeIndex: 1, supplier: job.merchant, needed: "2026-12-02", suppliedBy: "Builder", packs: 2, onSite: 0 },
  { scopeIndex: 2, supplier: "", needed: "2026-12-02", suppliedBy: "Customer", packs: null, onSite: null },
];

export const briefs = [
  {
    trade: trades[0], area: "Kitchen", when: "Mon 30 Nov, 08:30–16:00 · Tue 1 Dec, 08:30–12:30",
    work: "Protect the worktop. Prepare the wall, tile to the end of the worktop and grout on the return visit.",
    access: "Ring the front bell. Keep the sink usable for the household at the end of each visit.",
    photo: "/design/assets/kitchen-photo-native.avif", photoLabel: "Illustrative kitchen photo",
    proof: "Take a photo of the prepared wall and a finished photo showing the tile edges and grout.",
  },
  {
    trade: trades[1], area: "Hall", when: "Mon 30 Nov, 13:00–16:00 · Wed 2 Dec, 08:30–16:00",
    work: "Fill and sand the walls and woodwork. Paint the walls, then use the customer’s eggshell on the trim.",
    access: "Ring the front bell. Keep a clear route through the hall while the household is in.",
    photo: "/design/assets/renovation-room.jpg", photoLabel: "Illustrative hall photo",
    proof: "Take a photo of the filled areas before painting and a finished photo from the front door.",
  },
];
