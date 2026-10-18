// Levels the company can send crews to. Generator style, loot and entities are
// data so new levels are mostly writing. Adapted from the Backrooms Wiki
// (CC BY-SA) in our own words.
export type LevelStyle = "halls" | "aisles" | "pipes" | "machines" | "openplan" | "hotel" | "flooded" | "caves" | "streets" | "field";

export interface LevelDef {
  id: string; // also the Index id
  depth: number;
  name: string;
  art: string; // file in public/art/levels
  style: LevelStyle;
  entities: string[]; // one entry per entity on the level, repeats allowed
  loot: [itemId: string, weight: number][];
  lootCount: number;
  darkBlobs: number;
  blurb: string; // one line for the planning panel
  rule?: "hotel" | "wheat"; // anchor levels bend the usual rules
  dark?: boolean; // no working lights anywhere
  vision?: number; // how far a crew sees in the lit parts, when not the usual 3
}

export const LEVELS: LevelDef[] = [
  {
    id: "level-0", depth: 0, name: "The Waiting Floor", art: "L00-waiting-floor.png", style: "halls",
    entities: ["smiler", "hound", "faceling"],
    // Order and weights must stay as they are: they decide existing saves' layouts.
    loot: [["almond-water", 6], ["wallpaper", 4], ["polaroid", 2], ["flashlight", 3], ["royal-ration", 2], ["level-key", 1]],
    lootCount: 7, darkBlobs: 4,
    blurb: "Endless yellow halls. Smilers in the dark, Hounds in the halls.",
  },
  {
    id: "level-1", depth: 1, name: "Storage Annex", art: "L01-storage-annex.png", style: "aisles",
    entities: ["hound", "hound", "faceling", "death-rat", "duller"],
    loot: [["almond-water", 4], ["firesalt", 4], ["royal-ration", 3], ["candy", 3], ["blue-armchair", 1]],
    lootCount: 8, darkBlobs: 3,
    blurb: "Concrete aisles of shelving. Two Hounds patrol them; rats and a Duller in the stacks.",
  },
  {
    id: "level-2", depth: 2, name: "Pipe Gallery", art: "L02-pipe-gallery.png", style: "pipes",
    entities: ["smiler", "smiler", "hound", "crawler", "deathmoth"],
    loot: [["moth-jelly", 4], ["firesalt", 3], ["liquid-silence", 2], ["almond-water", 3], ["level-key", 1]],
    lootCount: 8, darkBlobs: 7,
    blurb: "Long hot tunnels, mostly unlit. Two Smilers, Deathmoths, and a Crawler in the pipes.",
  },
  {
    id: "level-3", depth: 3, name: "Humming Station", art: "L03-humming-station.png", style: "machines",
    entities: ["smiler", "hound", "hound", "faceling", "clump", "light-guide"],
    loot: [["deuclidator", 1], ["memory-jar", 2], ["dumb-gum", 4], ["firesalt", 3], ["royal-ration", 2]],
    lootCount: 9, darkBlobs: 5,
    blurb: "Machine rooms joined by corridors. Loud, so Hounds hear you coming. Watch for the Clump.",
  },
  {
    id: "level-4", depth: 4, name: "Empty Open Plan", art: "L04-empty-open-plan.png", style: "openplan",
    entities: ["faceling", "faceling", "faceling", "hound", "smiler", "skin-stealer", "dollface"],
    loot: [["polaroid", 3], ["ghost-light", 2], ["candy", 3], ["wallpaper", 3], ["memory-jar", 1]],
    lootCount: 9, darkBlobs: 3,
    blurb: "An office floor nobody works on. Facelings at the desks, a doll in the corner, and one coworker too many.",
  },
  {
    id: "level-5", depth: 5, name: "Hotel Overflow", art: "L05-hotel-overflow.png", style: "hotel", rule: "hotel",
    entities: ["faceling", "smiler", "partygoer", "window", "warning-kite"],
    loot: [["ghost-light", 3], ["memory-jar", 3], ["liquid-silence", 3], ["deuclidator", 1], ["level-key", 2]],
    lootCount: 12, darkBlobs: 3,
    blurb: "Anchor level. Rearranges itself nightly, checkout is strict, and someone is throwing a party.",
  },
  {
    id: "level-6", depth: 6, name: "Lights Out", art: "L06-lights-out.png", style: "halls", dark: true,
    entities: ["smiler", "smiler", "hound", "chupavida", "deathmoth"],
    loot: [["ghost-light", 3], ["memory-jar", 2], ["firesalt", 2], ["liquid-silence", 2], ["deuclidator", 1]],
    lootCount: 10, darkBlobs: 0,
    blurb: "No working lights at all. Crews see one step ahead; a flashlight makes it two. Smilers and a Chupavida love it.",
  },
  {
    id: "level-7", depth: 7, name: "Flooded Floor", art: "L07-flooded-floor.png", style: "flooded",
    entities: ["dunk", "dunk", "hound", "crawler", "death-rat"],
    loot: [["almond-water", 3], ["moth-jelly", 3], ["memory-jar", 2], ["liquid-silence", 2], ["blue-armchair", 1]],
    lootCount: 10, darkBlobs: 4,
    blurb: "Knee-deep water over office carpet, with islands of dry floor. Dunks slip off with whatever you carry.",
  },
  {
    id: "level-8", depth: 8, name: "Breakroom Caves", art: "L08-breakroom-caves.png", style: "caves",
    entities: ["wretch", "wretch", "clump", "skin-stealer", "dollface", "hound"],
    loot: [["blue-armchair", 2], ["dumb-gum", 3], ["candy", 3], ["deuclidator", 1], ["level-key", 1]],
    lootCount: 10, darkBlobs: 4,
    blurb: "Winding caves of vending machines and microwaves. Wretches wear the old staff badges.",
  },
  {
    id: "level-9", depth: 9, name: "Night Suburbs", art: "L09-night-suburbs.png", style: "streets",
    entities: ["humans", "anna", "wretch", "window", "partygoer", "chupavida"],
    loot: [["ghost-light", 3], ["polaroid", 2], ["level-key", 2], ["memory-jar", 3], ["candy", 2]],
    lootCount: 11, darkBlobs: 8,
    blurb: "Quiet streets and lit windows. Every house has someone home, and some of them are people.",
  },
  {
    id: "level-10", depth: 10, name: "Wheat Field", art: "L10-wheat-field.png", style: "field", rule: "wheat", vision: 2,
    entities: ["humans", "humans", "mother", "anna", "warning-kite", "wretch", "wretch"],
    loot: [["level-key", 3], ["deuclidator", 2], ["memory-jar", 3], ["ghost-light", 3], ["liquid-silence", 2]],
    lootCount: 12, darkBlobs: 0,
    blurb: "Anchor level. Wheat to the horizon under a sun that never sets. It's easy to walk out and hard to walk back.",
  },
];

export const levelDef = (id: string) => LEVELS.find((l) => l.id === id)!;

// Hotel Overflow: anyone still inside past checkout is checked in for good.
export const CHECKOUT_WARN = 55;
export const CHECKOUT_TICK = 75;
