// Levels the company can send crews to. Generator style, loot and entities are
// data so new levels are mostly writing. Adapted from the Backrooms Wiki
// (CC BY-SA) in our own words.
export type LevelStyle = "halls" | "aisles" | "pipes" | "machines" | "openplan" | "hotel";

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
  rule?: "hotel"; // anchor levels bend the usual rules
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
    entities: ["hound", "hound", "faceling"],
    loot: [["almond-water", 4], ["firesalt", 4], ["royal-ration", 3], ["candy", 3], ["blue-armchair", 1]],
    lootCount: 8, darkBlobs: 3,
    blurb: "Concrete aisles of shelving. Two Hounds patrol them.",
  },
  {
    id: "level-2", depth: 2, name: "Pipe Gallery", art: "L02-pipe-gallery.png", style: "pipes",
    entities: ["smiler", "smiler", "hound"],
    loot: [["moth-jelly", 4], ["firesalt", 3], ["liquid-silence", 2], ["almond-water", 3], ["level-key", 1]],
    lootCount: 8, darkBlobs: 7,
    blurb: "Long hot tunnels, mostly unlit. Two Smilers.",
  },
  {
    id: "level-3", depth: 3, name: "Humming Station", art: "L03-humming-station.png", style: "machines",
    entities: ["smiler", "hound", "hound", "faceling"],
    loot: [["deuclidator", 1], ["memory-jar", 2], ["dumb-gum", 4], ["firesalt", 3], ["royal-ration", 2]],
    lootCount: 9, darkBlobs: 5,
    blurb: "Machine rooms joined by corridors. Loud, so Hounds hear you coming.",
  },
  {
    id: "level-4", depth: 4, name: "Empty Open Plan", art: "L04-empty-open-plan.png", style: "openplan",
    entities: ["faceling", "faceling", "faceling", "hound", "smiler"],
    loot: [["polaroid", 3], ["ghost-light", 2], ["candy", 3], ["wallpaper", 3], ["memory-jar", 1]],
    lootCount: 9, darkBlobs: 3,
    blurb: "An office floor nobody works on. Facelings sit at the desks; something grins in the dark corners.",
  },
  {
    id: "level-5", depth: 5, name: "Hotel Overflow", art: "L05-hotel-overflow.png", style: "hotel", rule: "hotel",
    entities: ["faceling", "smiler"],
    loot: [["ghost-light", 3], ["memory-jar", 3], ["liquid-silence", 3], ["deuclidator", 1], ["level-key", 2]],
    lootCount: 12, darkBlobs: 3,
    blurb: "Anchor level. The hotel rearranges itself every night, and checkout is strict.",
  },
];

export const levelDef = (id: string) => LEVELS.find((l) => l.id === id)!;

// Hotel Overflow: anyone still inside past checkout is checked in for good.
export const CHECKOUT_WARN = 55;
export const CHECKOUT_TICK = 75;
