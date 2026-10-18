// The Index: everything the company has learned about the Backrooms.
// Classic levels and entities are adapted from the Backrooms Wiki (CC BY-SA),
// rewritten in our own words. Credit goes in the game's credits.
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
  {
    id: "smiler", kind: "entity", name: "Smiler", art: "entities/E01-smiler.png",
    cls: 3, difficulty: "Deadly in the dark", maxStage: 3, dataValue: 220,
    description: "A wide grin and two pale eyes floating in the dark. Nobody has seen the rest of it.",
    where: "Dark patches of Level 0.",
    avoid: "Don't run and don't stare. Stealthy crews slip past; loud ones don't.",
    mastered: "Crews know not to run: Smilers take half as many people.",
    lore: "Recovered audio from a dead crew's radio: the grin makes a sound. It sounds like the office muzak, played slower.",
  },
  {
    id: "hound", kind: "entity", name: "Hound", art: "entities/E02-hound.png",
    cls: 3, difficulty: "Hunts loners", maxStage: 3, dataValue: 200,
    description: "Something that used to walk upright and now prefers all fours. It hunts by sound and goes for whoever is alone.",
    where: "Roams the lit halls of Level 0.",
    avoid: "Send crews of three or more. Hounds back off from a group.",
    mastered: "Hounds back off from a pair, not just from three.",
    lore: "Hounds wear the remains of company lanyards. HR has asked that this not be investigated further.",
  },
  {
    id: "faceling", kind: "entity", name: "Faceling", art: "entities/E03-faceling.png",
    cls: 1, difficulty: "Harmless, upsetting", maxStage: 3, dataValue: 120,
    description: "A person-shaped thing with no face, wandering the halls like it is late for a meeting.",
    where: "Anywhere on Level 0.",
    avoid: "Ignore it. Crews that don't know that tend to panic and turn back.",
    mastered: "Crews walk right past Facelings and pick up their shed skin more often.",
    lore: "Facelings stop and turn toward the office when your company name is said out loud.",
  },
  ...[
    ["almond-water", "Almond Water", "items/I01-almond-water.png", "Sweet, cloudy, calming. The only safe thing to drink down there."],
    ["wallpaper", "Wallpaper Fragment", "items/I08-wallpaper-fragment.png", "A strip of the yellow wallpaper. It is slightly warm."],
    ["polaroid", "Instant Camera", "items/I06-polaroid.png", "Still has film. The last photo shows your office, from the outside."],
    ["flashlight", "Dead Flashlight", "items/I05-flashlight.png", "Works for about a second when nobody is looking at it."],
    ["royal-ration", "Royal Ration", "items/I03-royal-ration.png", "A sealed meal pack. The label lists ingredients that don't exist."],
    ["level-key", "Level Key", "items/I09-level-key.png", "A key with no teeth. Collectors pay a lot and won't say why."],
  ].map(
    ([id, name, art, description]): IndexEntry => ({
      id, kind: "item", name, art, description, cls: 0, difficulty: "Item", maxStage: 2, dataValue: 60,
      where: "Found lying around Level 0.", avoid: "Bring three of them home to document it.",
    }),
  ),
];

export const indexEntry = (id: string) => INDEX.find((e) => e.id === id)!;
