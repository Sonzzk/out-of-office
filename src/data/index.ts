// The Index: everything the company has learned about the Backrooms.
// Classic levels and entities are adapted from the Backrooms Wiki (CC BY-SA),
// rewritten in our own words. Credit goes in the game's credits.
import { ENTITIES } from "./entities";

export type IndexKind = "level" | "entity" | "item";
export type Stage = 0 | 1 | 2 | 3; // unknown, Seen, Documented, Mastered

export const STAGE_NAME = ["Unknown", "Seen", "Documented", "Mastered"] as const;

export interface IndexEntry {
  id: string;
  kind: IndexKind;
  name: string;
  art: string; // path under public/art
  cls: number; // Class 0 to 5
  difficulty: string;
  description: string;
  where: string;
  avoid: string; // shown from Documented on
  mastered?: string; // what Mastered gives you, shown from Documented on
  lore?: string; // hidden page, shown at Mastered
  maxStage: Stage;
  dataValue: number; // what collectors pay for the data, per stage sold
}

export const INDEX: IndexEntry[] = [
  {
    id: "level-0", kind: "level", name: "Level 0: The Waiting Floor", art: "levels/L00-waiting-floor.png",
    cls: 1, difficulty: "Safe-ish", maxStage: 3, dataValue: 150,
    description: "Mono-yellow office halls, damp carpet and a fluorescent hum that never stops. It goes on further than it should.",
    where: "Behind the door at the end of the hall.",
    avoid: "Stay out of the patches where the lights have died. Survey it and your crews stop getting lost.",
    mastered: "Crews know the layout: navigation counts for more on Level 0.",
    lore: "The carpet was installed by a contractor the company has no record of hiring. The invoice is still in the system. It is addressed to you.",
  },
  ...ENTITIES.map(
    (e): IndexEntry => ({
      id: e.id, kind: "entity", name: e.name, art: `entities/${e.art}`, cls: e.cls, difficulty: e.difficulty,
      description: e.description, where: e.where, avoid: e.avoid, mastered: e.mastered, lore: e.lore,
      maxStage: 3, dataValue: 100 + 40 * e.cls,
    }),
  ),
  ...[
    ["level-1", "Level 1: Storage Annex", "levels/L01-storage-annex.png", 1, "Patrolled",
      "A concrete warehouse that goes on for miles. The shelves are stocked with crates nobody ordered and nobody signs for.",
      "Two Hounds walk the aisles. Send three or more and they leave you alone.",
      "The forklifts start on their own at 3 PM. Every crate is addressed to an office that closed in 1994."],
    ["level-2", "Level 2: Pipe Gallery", "levels/L02-pipe-gallery.png", 2, "Dark and hot",
      "Narrow maintenance tunnels full of hot pipes. Most of the lights are out, and it's always too warm.",
      "Two Smilers live in the unlit stretches. Stealthy crews only.",
      "Some pipes are cold to the touch. Those ones are not carrying water."],
    ["level-3", "Level 3: Humming Station", "levels/L03-humming-station.png", 3, "Loud",
      "Rooms full of machines that hum, clank and whir, joined by cramped corridors. Nobody knows what the machines make.",
      "It's loud, so Hounds hear crews coming. Big crews and a quiet lead help.",
      "Every machine has an inspection sticker. Every sticker has your signature."],
    ["level-4", "Level 4: Empty Open Plan", "levels/L04-empty-open-plan.png", 2, "Crowded",
      "An endless office floor with desks, pillars and dead monitors. The chairs are still warm.",
      "Facelings sit at the desks. Learn about them first or crews keep panicking.",
      "One desk has a photo of your office on it. Someone is standing in the background."],
    ["level-5", "Level 5: Hotel Overflow", "levels/L05-hotel-overflow.png", 4, "Anchor level",
      "A hotel with too many floors and not enough exits. The corridors rearrange themselves every night.",
      "Checkout is strict: anyone still inside when the front desk calls time is checked in permanently. Get in, grab, get out.",
      "The guest book is full of names from your payroll. Some of them haven't been hired yet."],
  ].map(
    ([id, name, art, cls, difficulty, description, avoid, lore]): IndexEntry => ({
      id: id as string, kind: "level", name: name as string, art: art as string, cls: cls as number, difficulty: difficulty as string,
      description: description as string, avoid: avoid as string, lore: lore as string, maxStage: 3, dataValue: 150 + 40 * (cls as number),
      where: "Reached once the level above it is Documented.", mastered: "Crews know the layout: navigation counts for more here.",
    }),
  ),
  ...[
    ["almond-water", "Almond Water", "items/I01-almond-water.png", "Sweet, cloudy, calming. The only safe thing to drink down there."],
    ["wallpaper", "Wallpaper Fragment", "items/I08-wallpaper-fragment.png", "A strip of the yellow wallpaper. It is slightly warm."],
    ["polaroid", "Instant Camera", "items/I06-polaroid.png", "Still has film. The last photo shows your office, from the outside."],
    ["flashlight", "Dead Flashlight", "items/I05-flashlight.png", "Works for about a second when nobody is looking at it."],
    ["royal-ration", "Royal Ration", "items/I03-royal-ration.png", "A sealed meal pack. The label lists ingredients that don't exist."],
    ["level-key", "Level Key", "items/I09-level-key.png", "A key with no teeth. Collectors pay a lot and won't say why."],
    ["firesalt", "Firesalt", "items/I02-firesalt.png", "Orange crystals that are warm in the hand and hot in the mouth. Do not put in the mouth."],
    ["moth-jelly", "Moth Jelly", "items/I04-moth-jelly.png", "Sticky, sweet and faintly glowing. Moths gather wherever it's stored."],
    ["blue-armchair", "Blue Armchair", "items/I07-blue-armchair.png", "A comfortable blue armchair. Whoever sits in it feels watched, kindly."],
    ["candy", "Unlabelled Candy", "items/I10-candy.png", "Wrapped sweets with no brand. Each one tastes like a different birthday."],
    ["memory-jar", "Memory Jar", "items/I11-memory-jar.png", "A sealed jar of fog. Hold it to your ear and you hear someone else's afternoon."],
    ["liquid-silence", "Liquid Silence", "items/I13-liquid-silence.png", "A vial of black liquid. The room goes quiet when it's uncorked."],
    ["deuclidator", "Deuclidator", "items/I14-deuclidator.png", "A brass device with dials. It makes rooms the right size again. Mostly."],
    ["dumb-gum", "Dumb Gum", "items/I15-dumb-gum.png", "Gum that makes you briefly forget what you were afraid of. And your name."],
    ["ghost-light", "Ghost Light", "items/I16-ghost-light.png", "A lantern that lights rooms that aren't there."],
  ].map(
    ([id, name, art, description]): IndexEntry => ({
      id, kind: "item", name, art, description, cls: 0, difficulty: "Item", maxStage: 2, dataValue: 60,
      where: "Found lying around on the levels.", avoid: "Bring three of them home to document it.",
    }),
  ),
];

export const indexEntry = (id: string) => INDEX.find((e) => e.id === id)!;
