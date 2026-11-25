// Q29: fictional screen examples only. Nothing here is a business record or proof.
export const practice = "Practice sandbox — synthetic data; nothing is sent or charged";
export const job = "Kitchen splashback & hall decorating";
export const site = "24 Rowan Close";
export const firm = "Rowan Building (fictional)";
export const screens = ["Tomorrow", "Your choices", "Daywork sheet", "Certificates checklist", "Share", "Snags", "Handover", "Your handover pack"] as const;
export type Screen = (typeof screens)[number];
export const states: Record<Screen, readonly string[]> = {
  Tomorrow: ["Example", "Empty", "Problem", "Nothing for tomorrow"],
  "Your choices": ["Example", "Empty", "Problem", "Decided", "Link expired"],
  "Daywork sheet": ["Example", "Empty", "Problem", "Agreed", "Changed after sending"],
  "Certificates checklist": ["Example", "Empty", "Problem", "Job type has none"],
  Share: ["Example", "Empty", "Problem", "Phone cannot share"],
  Snags: ["Example", "Empty", "Problem"],
  Handover: ["Example", "Empty", "Problem"],
  "Your handover pack": ["Example", "Empty", "Problem", "Newer version available"],
};
export const locations: Record<Screen, string> = {
  Tomorrow: "Today", "Your choices": "Customer · by link", "Daywork sheet": "Job › Money",
  "Certificates checklist": "Job › Records", Share: "Sent Friday update / crew brief",
  Snags: "Job › Records", Handover: "Job › Records", "Your handover pack": "Customer · by link",
};
export const emptyCopy: Record<Screen, [string, string]> = {
  Tomorrow: ["No work planned yet", "Start with an accepted quote and assign the tasks and days on the Plan screen."],
  "Your choices": ["No open choices", "There is nothing to decide. Your builder will send a link when a choice is needed."],
  "Daywork sheet": ["No daywork sheets yet", "Record the date, people, hours and materials for an extra first."],
  "Certificates checklist": ["No checklist prepared yet", "Choose the job type when preparing the plan."],
  Share: ["Nothing ready to share", "Send a Friday update to the practice inbox or prepare a crew brief first."],
  Snags: ["No snags recorded yet", "Add a snag with an owner, due date and photo when you find one."],
  Handover: ["No handover draft yet", "Finish the site work, then choose what goes in the customer’s pack."],
  "Your handover pack": ["No handover pack released yet", "Your builder will share the pack when it is ready."],
};
export const crew = [
  { name: "Sam · Decorator", task: "Paint hall walls and woodwork", when: "Tue 1 Dec · 08:30–16:00", access: "Ring the front bell. Keep the hall route clear.", photo: "/design/assets/renovation-room.jpg", proof: "Photograph the finished hall from the front door." },
  { name: "Lee · Tiler", task: "No task confirmed for tomorrow", when: "Waiting for Thursday’s tile delivery", access: "Do not travel until the builder confirms your visit.", photo: "/design/assets/kitchen-photo-native.avif", proof: "Prepared wall and finished tile edges on the next visit." },
];
export const certificates = [
  { key: "electrical", label: "Minor Electrical Installation Works Certificate (BS 7671)", when: "If a socket or spur is moved or added behind the splashback. Building Regulations notification only for notifiable work.", issuer: "Registered electrician", status: "Still needed", reason: "" },
  { key: "gas", label: "Gas Safe check", when: "If a hob or gas pipe is disconnected or moved.", issuer: "Gas Safe engineer", status: "Not needed", reason: "No gas appliance or pipe moved on this job." },
  { key: "tiles", label: "Manufacturer’s tile adhesive and grout data sheets", when: "Always · for the handover pack.", issuer: "Product manufacturer", status: "Got it", reason: "" },
  { key: "paint", label: "Paint product data and colour references", when: "Always · for touch-ups.", issuer: "Product manufacturer", status: "Got it", reason: "" },
  { key: "waste", label: "Waste transfer note", when: "If a skip or waste carrier is used.", issuer: "Waste carrier", status: "Still needed", reason: "" },
];
export const packSections = ["What was done", "Changes", "Photos", "Manuals and certificates", "Outstanding snags", "Contacts"] as const;
export type PackSection = (typeof packSections)[number];
export const packContent: Record<PackSection, string[]> = {
  "What was done": ["Kitchen splashback tiled and grouted. Hall walls and woodwork decorated."],
  Changes: ["Agreed change · splashback extended to the end of the worktop."],
  Photos: ["Illustrative finished hall photo. Customer-visible proof photos: waits for V2-PX."],
  "Manuals and certificates": ["Tile adhesive and grout data sheets", "Paint product data · white matt walls, eggshell trim", "Still needed: electrical certificate and waste transfer note. Your builder will supply them separately."],
  "Outstanding snags": ["Refit the hall door stop · Jordan · due 4 Dec. Fix and second-person check outstanding; visit agreed with Alex."],
  Contacts: ["Rowan Building (fictional) · builder@rowan-building.invalid", "Aftercare: contact the builder about this job."],
};
export const daywork = {
  date: "30 Nov 2026", title: "Make good the kitchen window return",
  people: ["Jordan · 6.50 hours × £30.00 = £195.00", "Sam · 7.25 hours × £30.00 = £217.50"],
  materials: ["Repair plaster · 2.50 bags × £15.50 = £38.75"],
  // Exact decimal strings, pre-priced fictional example. No floating-point calculation.
  total: "451.25", changedTotal: "481.25",
};
export const fridayText = `${practice}\n${firm} · ${job}\nDone this week: splashback tiled; hall prepared.\nNext week: paint the hall and refit the trim.\nPlease choose the grout finish by 30 Nov.`;
export const crewText = `${practice}\n${crew[0]!.name}\n${site}\n${crew[0]!.when}\n${crew[0]!.task}\n${crew[0]!.access}\n${crew[0]!.proof}`;
