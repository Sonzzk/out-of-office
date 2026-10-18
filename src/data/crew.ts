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
}

export const QUIRKS: QuirkDef[] = [
  { id: "whistler", name: "Nervous whistler", blurb: "Whistles when scared. Things hear it.", mods: { stealth: -2 } },
  { id: "mallcop", name: "Ex-mall cop", blurb: "Knows a floor plan when he sees one.", mods: { nav: 2 } },
  { id: "muzak", name: "Hums the muzak", blurb: "Keeps spirits up. Nobody knows where the tune is from.", mods: { morale: 2 } },
  { id: "lunchbox", name: "Brought a lunchbox", blurb: "Thinks this is a normal job.", mods: { morale: 1, nav: -1 } },
  { id: "noblink", name: "Doesn't blink", blurb: "Very good at holding still.", mods: { stealth: 2 } },
  { id: "nurse", name: "Former night nurse", blurb: "Has seen worse. Probably.", mods: { medical: 2 } },
  { id: "debts", name: "Owes money to everyone", blurb: "Will not turn back without something to sell.", mods: { morale: -1 } },
  { id: "carpet", name: "Allergic to carpet", blurb: "This is going to be a problem.", mods: { stealth: -1, morale: -1 } },
  { id: "calm", name: "Too calm", blurb: "Has not asked a single question.", mods: { morale: 1 } },
  { id: "lost", name: "No sense of direction", blurb: "Got lost on the way to the interview.", mods: { nav: -2 } },
];
