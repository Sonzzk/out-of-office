// Loot that can turn up on Level 0. Art lives in public/art/items.
export interface ItemDef {
  id: string;
  name: string;
  art: string;
  value: number; // base sale price
  rarity: number; // relative spawn weight
}

export const ITEMS: Record<string, ItemDef> = {
  "almond-water": { id: "almond-water", name: "Almond Water", art: "I01-almond-water.png", value: 90, rarity: 6 },
  "wallpaper": { id: "wallpaper", name: "Wallpaper Fragment", art: "I08-wallpaper-fragment.png", value: 140, rarity: 4 },
  "polaroid": { id: "polaroid", name: "Instant Camera", art: "I06-polaroid.png", value: 260, rarity: 2 },
  "flashlight": { id: "flashlight", name: "Dead Flashlight", art: "I05-flashlight.png", value: 120, rarity: 3 },
  "royal-ration": { id: "royal-ration", name: "Royal Ration", art: "I03-royal-ration.png", value: 200, rarity: 2 },
  "level-key": { id: "level-key", name: "Level Key", art: "I09-level-key.png", value: 480, rarity: 1 },
};
