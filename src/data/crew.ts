// Hiring pool content. Portraits live in public/art/portraits.
export type Source = "desperate" | "prisoner" | "clone";
export type Skill = "nav" | "stealth" | "medical" | "morale";

export const SKILLS: Skill[] = ["nav", "stealth", "medical", "morale"];
export const SKILL_LABEL: Record<Skill, string> = {
  nav: "Navigation",
  stealth: "Stealth",
  medical: "Medical",
  morale: "Morale",
};

export const PEOPLE = [
  { name: "Dave Kowalczyk", portrait: "dave.png" },
  { name: "Dev Raman", portrait: "dev.png" },
  { name: "Gene Albright", portrait: "gene.png" },
  { name: "Mr. Halloran", portrait: "halloran.png" },
  { name: "Marla Voss", portrait: "marla.png" },
  { name: "Priya Shah", portrait: "priya.png" },
  { name: "Ruth Ann Pike", portrait: "ruth.png" },
  { name: "Saint Okafor", portrait: "saint.png" },
  { name: "Tomas Brandt", portrait: "tomas.png" },
  { name: "Walt Heiner", portrait: "walt.png" },
];

export const CLONE_PORTRAITS = ["clone07.png", "clone06.png"];

export const SOURCE_INFO: Record<Source, { label: string; pitch: string }> = {
  desperate: { label: "Desperate hire", pitch: "Answered the flyer. Did not read the flyer." },
  prisoner: { label: "Bribed prisoner", pitch: "Released into your care. Paperwork pending forever." },
  clone: { label: "Vat clone", pitch: "Cheap. Slightly off. Do not ask about the other ones." },
};

export interface QuirkDef {
  id: string;
  name: string;
  blurb: string;
  mods?: Partial<Record<Skill, number>>;
  // Line on the radio when a hidden quirk first shows itself. Quirks without
  // one only ever appear as the visible quirk.
  reveal?: string;
}

// Every worker has one quirk HR knows about and one it doesn't. The hidden one
// comes out when it first matters (see sim/expedition.ts) or after three runs.
export const QUIRKS: QuirkDef[] = [
  { id: "whistler", name: "Nervous whistler", blurb: "Whistles when scared. Things hear it.", mods: { stealth: -2 },
    reveal: "{n} has started whistling. Softly. Constantly." },
  { id: "mallcop", name: "Ex-mall cop", blurb: "Knows a floor plan when he sees one.", mods: { nav: 2 } },
  { id: "muzak", name: "Hums the muzak", blurb: "Keeps spirits up. Nobody knows where the tune is from.", mods: { morale: 2 } },
  { id: "lunchbox", name: "Brought a lunchbox", blurb: "Thinks this is a normal job.", mods: { morale: 1, nav: -1 } },
  { id: "noblink", name: "Doesn't blink", blurb: "Very good at holding still.", mods: { stealth: 2 } },
  { id: "nurse", name: "Former night nurse", blurb: "Has seen worse. Probably.", mods: { medical: 2 } },
  { id: "debts", name: "Owes money to everyone", blurb: "Won't turn back empty-handed.", mods: { morale: -1 },
    reveal: "{n}: We are NOT going back with nothing. I have people to pay." },
  { id: "carpet", name: "Allergic to carpet", blurb: "This is going to be a problem.", mods: { stealth: -1, morale: -1 } },
  { id: "calm", name: "Too calm", blurb: "Never calls a retreat. Never.",
    reveal: "{n}: Someone died. Okay. Let's keep going." },
  { id: "lost", name: "No sense of direction", blurb: "Got lost on the way to the interview.", mods: { nav: -2 } },
  { id: "coward", name: "Runs first", blurb: "Always the first one out of a bad room.",
    reveal: "{n} was halfway down the hall before anyone else moved." },
  { id: "pockets", name: "Pockets things", blurb: "Some of the loot never makes it to the Ledger.",
    reveal: "{n}: What? I'm not holding anything. Check the others." },
  { id: "lucky", name: "Born lucky", blurb: "Things just miss them.",
    reveal: "{n}: It walked right past me. Right past me." },
  { id: "walls", name: "Talks to the walls", blurb: "The walls have not answered. Yet.", mods: { morale: -1 },
    reveal: "{n}: The wall says hi. It says it knows you, boss." },
];

export const LEVEL_XP = [0, 2, 5, 9]; // xp needed for levels 1 to 4
export const LEAD_LEVEL = 3; // veterans from this level on
