// Suggestions only. The builder must assess the actual site and products.
// Both the template and task identity must match; a trade alone is insufficient.
export const ramsHazards: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  "splashback-decorating.v1": {
    "prepare-splashback": [
      "Occupied home: agree access, protect surfaces and separate residents, children and pets from the work area.",
      "Dust and debris during preparation: assess the surface, control dust at source and plan safe clearance.",
    ],
    "tile-splashback": [
      "Tile-cutting dust: assess the material and cutting method; control dust at source, keep others away and select suitable protection.",
      "COSHH for adhesives and grout: check the product safety information, ventilation, storage and suitable protection before use.",
      "Sharp edges and cutting equipment: plan safe handling and a segregated cutting area.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "prepare-hall": [
      "Occupied home: agree access, protect surfaces and keep walkways clear of trip hazards.",
      "Preparation dust: assess existing coatings, control dust and protect people outside the work area.",
    ],
    "paint-hall": [
      "Working at height for hall ceilings: assess access equipment, its condition, stable positioning and exclusion below.",
      "COSHH for paint: check product safety information, ventilation, storage and suitable protection before use.",
      "Occupied home: separate the work area, maintain safe access and agree when residents can return.",
    ],
  },
};
