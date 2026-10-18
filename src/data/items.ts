import { ENTITIES } from "./entities";

// Loot that can turn up on Level 0. Art lives in public/art/items.
export interface ItemDef {
  id: string;
  name: string;
  art: string;
  value: number; // base sale price
  rarity: number; // relative spawn weight, 0 = never lies on the floor
  sampleOf?: string; // entity id: samples can be sold or researched, never both
}

export const ITEMS: Record<string, ItemDef> = {
  "almond-water": { id: "almond-water", name: "Almond Water", art: "I01-almond-water.png", value: 90, rarity: 6 },
  "wallpaper": { id: "wallpaper", name: "Wallpaper Fragment", art: "I08-wallpaper-fragment.png", value: 140, rarity: 4 },
  "polaroid": { id: "polaroid", name: "Instant Camera", art: "I06-polaroid.png", value: 260, rarity: 2 },
  "flashlight": { id: "flashlight", name: "Dead Flashlight", art: "I05-flashlight.png", value: 120, rarity: 3 },
  "royal-ration": { id: "royal-ration", name: "Royal Ration", art: "I03-royal-ration.png", value: 200, rarity: 2 },
  "level-key": { id: "level-key", name: "Level Key", art: "I09-level-key.png", value: 480, rarity: 1 },
  // Deeper levels. rarity only marks "found on the floor"; each level has its own loot table.
  "firesalt": { id: "firesalt", name: "Firesalt", art: "I02-firesalt.png", value: 180, rarity: 1 },
  "moth-jelly": { id: "moth-jelly", name: "Moth Jelly", art: "I04-moth-jelly.png", value: 220, rarity: 1 },
  "blue-armchair": { id: "blue-armchair", name: "Blue Armchair", art: "I07-blue-armchair.png", value: 600, rarity: 1 },
  "candy": { id: "candy", name: "Unlabelled Candy", art: "I10-candy.png", value: 110, rarity: 1 },
  "memory-jar": { id: "memory-jar", name: "Memory Jar", art: "I11-memory-jar.png", value: 520, rarity: 1 },
  "liquid-silence": { id: "liquid-silence", name: "Liquid Silence", art: "I13-liquid-silence.png", value: 340, rarity: 1 },
  "deuclidator": { id: "deuclidator", name: "Deuclidator", art: "I14-deuclidator.png", value: 700, rarity: 1 },
  "dumb-gum": { id: "dumb-gum", name: "Dumb Gum", art: "I15-dumb-gum.png", value: 160, rarity: 1 },
  "ghost-light": { id: "ghost-light", name: "Ghost Light", art: "I16-ghost-light.png", value: 420, rarity: 1 },
  // Samples come off entities a crew survived, see entities.ts.
  ...Object.fromEntries(
    ENTITIES.filter((e) => e.sample > 0).map((e) => [
      `sample-${e.id}`,
      { id: `sample-${e.id}`, name: e.sampleName, art: "../icons/U-sample-jar.png", value: e.sampleValue, rarity: 0, sampleOf: e.id },
    ]),
  ),
};
