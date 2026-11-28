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
  // V2-SQ-F: one entry per trades.v1 task key (packages/db/src/v2-work-plan-templates.ts). Trades with no entry
  // ("Other") show "No standard hazards listed" and need the builder's own controls.
  "trades.v1": {
    "strip-out-protect": [
      "Occupied home: agree access, protect surfaces and separate residents, children and pets from the work area.",
      "Trip hazards from sheeting and boards: tape down coverings and keep walkways clear.",
    ],
    "strip-out-clear": [
      "Asbestos: check the age of the building and any survey before disturbing materials; stop and get advice if suspected.",
      "Hidden services: isolate and check for live electrics, gas and water before removing fittings.",
      "Dust, sharp debris and manual handling: control dust at source, plan safe lifting and waste removal routes.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "groundworks-prepare": [
      "Buried services: check plans and scan before digging; dig by hand near suspected services.",
      "Excavation edges and collapse: support or batter sides, barrier open excavations and keep plant and spoil back from the edge.",
      "Manual handling and plant: plan lifting and keep people clear of moving machinery.",
    ],
    "groundworks-lay": [
      "COSHH for cement and concrete: check the product safety information, ventilation, storage and suitable protection before use.",
      "Manual handling of heavy materials: plan deliveries, use lifting aids and share loads.",
      "Public and resident access: barrier the work area and keep a safe route past it.",
    ],
    "brickwork-set-up": [
      "Working at height: assess scaffold or access equipment, its condition, stable positioning and exclusion below.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "brickwork-build": [
      "Cutting dust (silica): use wet cutting or extraction and suitable protection; keep others away.",
      "COSHH for mortar and cement: check the product safety information, ventilation, storage and suitable protection before use.",
      "Manual handling of bricks and blocks: plan loading-out and avoid overloading platforms.",
      "Falling materials: keep the area below clear and use toe boards or netting where needed.",
    ],
    "roofing-access": [
      "Working at height: plan edge protection, scaffold or other access, and check it before use.",
      "Fragile surfaces and roof lights: identify, cover or barrier them before work starts.",
      "Falling materials: exclude people below and plan how materials come up and down.",
    ],
    "roofing-work": [
      "Working at height: keep edge protection in place and stop work in high wind, rain or ice.",
      "Fragile surfaces: never walk on roof lights or fragile sheets; use crawling boards where needed.",
      "Hot works and adhesives: check the method and products; keep fire extinguishers to hand where heat is used.",
    ],
    "plumbing-first-fix": [
      "Water and gas services: isolate and check before cutting into pipework; gas work only by a Gas Safe registered engineer.",
      "Hidden cables when drilling or lifting floors: scan first and check routes.",
      "Hot works (soldering): protect nearby materials, keep an extinguisher to hand and check the area afterwards.",
    ],
    "plumbing-second-fix": [
      "Pressure testing and leaks: test before covering, protect finished surfaces and know where the stopcock is.",
      "Gas appliances: commission and test only by a Gas Safe registered engineer.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "electrics-first-fix": [
      "Electricity: safe isolation, lock off and prove dead before work; work only by a competent electrician.",
      "Drilling and chasing dust: control dust at source and check for hidden pipes.",
      "Lifting floorboards and access to lofts: plan safe footing and cover openings.",
    ],
    "electrics-second-fix": [
      "Electricity: safe isolation, prove dead, and test the installation before handing over; issue the certificate.",
      "Occupied home: tell residents when power is off and keep them away from open boards and sockets.",
    ],
    "carpentry-fit": [
      "Power tools and cutting: guards in place, a segregated cutting area and dust extraction.",
      "Manual handling of boards and units: plan lifting and share heavy loads.",
      "Hidden services when fixing: scan for cables and pipes before drilling or nailing.",
    ],
    "plastering-plaster": [
      "Working at height for ceilings and high walls: assess access equipment, its condition and stable positioning.",
      "COSHH for plaster: check the product safety information, ventilation, storage and suitable protection before use.",
      "Mixing dust and slips: mix in a ventilated area and keep floors clear and dry.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "plastering-dry": [
      "Ventilation and heaters: keep the area ventilated and any heaters safe and attended.",
      "Keep residents away from wet surfaces and trip hazards until dry.",
    ],
    "kitchen-fitting-units": [
      "Manual handling of units and appliances: plan lifting and share heavy loads.",
      "Hidden services when fixing: scan for cables and pipes before drilling.",
      "Gas and electric connections: only by a competent or registered person.",
    ],
    "kitchen-fitting-worktops": [
      "Worktop cutting dust (including stone and composite silica): use wet cutting or extraction and suitable protection.",
      "COSHH for adhesives and sealants: check the product safety information, ventilation, storage and suitable protection before use.",
      "Sharp edges and cutting equipment: plan safe handling and a segregated cutting area.",
    ],
    "tiling-prepare": [
      "Dust and debris during preparation: assess the surface, control dust at source and plan safe clearance.",
      "COSHH for primers: check the product safety information, ventilation, storage and suitable protection before use.",
      "Occupied home: agree access, protect surfaces and separate residents, children and pets from the work area.",
    ],
    "tiling-tile": [
      "Tile-cutting dust: assess the material and cutting method; control dust at source, keep others away and select suitable protection.",
      "COSHH for adhesives and grout: check the product safety information, ventilation, storage and suitable protection before use.",
      "Sharp edges and cutting equipment: plan safe handling and a segregated cutting area.",
      "Occupied home: keep residents, children and pets outside the work area and maintain a safe access route.",
    ],
    "flooring-prepare": [
      "Dust from sanding or levelling: control dust at source and select suitable protection.",
      "COSHH for levelling compounds and primers: check the product safety information, ventilation, storage and suitable protection before use.",
      "Hidden pipes and cables under floors: check routes before fixing or cutting.",
    ],
    "flooring-lay": [
      "Kneeling work and manual handling: use knee protection and plan lifting of rolls and boards.",
      "COSHH for adhesives: check the product safety information, ventilation, storage and suitable protection before use.",
      "Cutting tools: plan safe handling and a segregated cutting area.",
      "Slips and trips: keep offcuts cleared and tell residents when floors are safe to use.",
    ],
    "decorating-prepare": [
      "Occupied home: agree access, protect surfaces and keep walkways clear of trip hazards.",
      "Preparation dust: assess existing coatings (including possible lead paint), control dust and protect people outside the work area.",
    ],
    "decorating-paint": [
      "Working at height for ceilings and stairwells: assess access equipment, its condition, stable positioning and exclusion below.",
      "COSHH for paint: check the product safety information, ventilation, storage and suitable protection before use.",
      "Occupied home: separate the work area, maintain safe access and agree when residents can return.",
    ],
  },
};
