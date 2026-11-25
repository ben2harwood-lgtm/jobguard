// Fictional walk-round for the V2 rehearsal job. Static mock data only: no fetches, no writes,
// no camera or microphone. "saved" means the server confirmed it; "pending" means it has not.
export const job = {
  title: "Kitchen splashback & hall decorating",
  site: "24 Rowan Close · Occupied home",
};

export const rooms = ["Kitchen", "Hall"] as const;
export type Room = (typeof rooms)[number];

export type ItemStatus = "saved" | "pending";

export type WalkNote = { id: string; room: Room; text: string; status: ItemStatus };

export type WalkPhoto = {
  id: string;
  label: string;
  src: string;
  // Room the photo is filed under now; null while it waits in "needs room".
  room: Room | null;
  // Room it was first linked to by the order of capture; null for imported photos.
  original: Room | null;
  // Position in the walk; imported photos have none.
  order: number | null;
  status: ItemStatus;
  imported?: boolean;
  unclear?: string | undefined;
};

export const notes: WalkNote[] = [
  { id: "n1", room: "Kitchen", text: "Splashback runs the full length of the worktop, about 3.2 metres by 0.6.", status: "saved" },
  { id: "n2", room: "Kitchen", text: "Existing trim is loose at the sink end. Customer wants it refitted.", status: "saved" },
  { id: "n3", room: "Hall", text: "Walls about 24 square metres. Skirting and door trim to paint in the customer’s eggshell.", status: "saved" },
];

export const photos: WalkPhoto[] = [
  { id: "p1", label: "Illustrative kitchen photo · worktop and wall", src: "/design/assets/kitchen-photo-native.avif", room: "Kitchen", original: "Kitchen", order: 1, status: "saved" },
  { id: "p2", label: "Illustrative photo · loose trim at the sink end", src: "/design/assets/renovation-interior.jpg", room: "Hall", original: "Hall", order: 3, status: "saved",
    unclear: "Taken 4 seconds after you moved to Hall. It may belong to Kitchen." },
  { id: "p3", label: "Illustrative hall photo · walls and woodwork", src: "/design/assets/renovation-room.jpg", room: "Hall", original: "Hall", order: 4, status: "saved" },
  { id: "p4", label: "Imported photo · kitchen layout sketch", src: "/design/assets/kitchen-blueprint.avif", room: null, original: null, order: null, status: "saved", imported: true },
  { id: "p5", label: "Imported photo · site entrance", src: "/design/assets/renovation-site.jpg", room: null, original: null, order: null, status: "saved", imported: true },
];

// What the mock camera and dictation add. Nothing is captured from the device.
export const nextPhoto: Record<Room, { label: string; src: string }> = {
  Kitchen: { label: "Illustrative kitchen photo · end of the worktop", src: "/design/assets/reference-photos.avif" },
  Hall: { label: "Illustrative hall photo · front door trim", src: "/design/assets/renovation-site.jpg" },
};

export const dictated: Record<Room, string> = {
  Kitchen: "Socket above the worktop needs a tile cut round it.",
  Hall: "Two dents in the plaster by the stairs to fill before painting.",
};
