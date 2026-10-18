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
  // Samples come off entities a crew survived. Art is the generic sample jar.
  "sample-smiler": { id: "sample-smiler", name: "Smiler Residue", art: "../icons/U-sample-jar.png", value: 320, rarity: 0, sampleOf: "smiler" },
  "sample-hound": { id: "sample-hound", name: "Hound Tooth", art: "../icons/U-sample-jar.png", value: 260, rarity: 0, sampleOf: "hound" },
  "sample-faceling": { id: "sample-faceling", name: "Faceling Skin Flake", art: "../icons/U-sample-jar.png", value: 150, rarity: 0, sampleOf: "faceling" },
};
