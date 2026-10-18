// Facility upgrades bought in the Facilities app. Each tier is bought once
// and adds a little to the nightly upkeep.
export interface UpgradeDef {
  id: string;
  name: string;
  icon: string; // file in public/art/icons
  blurb: string;
  tiers: { cost: number; text: string }[];
}

export const UPKEEP_PER_TIER = 15;

export const UPGRADES: UpgradeDef[] = [
  {
    id: "dispatch", name: "Dispatch Desk", icon: "U-phone.png",
    blurb: "A second phone line, then a third. More crews out at once.",
    tiers: [{ cost: 1500, text: "3 crews out at once" }, { cost: 4000, text: "4 crews out at once" }],
  },
  {
    id: "lab", name: "Lab Benches", icon: "U-sample-jar.png",
    blurb: "More benches, more jars, more things in the building overnight.",
    tiers: [{ cost: 1200, text: "Research 2 samples a night" }, { cost: 3000, text: "Research 3 samples a night" }],
  },
  {
    id: "mast", name: "Radio Mast", icon: "U-radio.png",
    blurb: "A taller antenna on the roof. Crews can wait longer for your call.",
    tiers: [{ cost: 600, text: "Calls wait 50% longer" }, { cost: 1500, text: "Calls wait twice as long" }],
  },
  {
    id: "security", name: "Security Desk", icon: "U-padlock.png",
    blurb: "Someone in the lobby who says \"no comment\" a lot.",
    tiers: [{ cost: 800, text: "Heat cools 8 a night instead of 5" }, { cost: 2000, text: "Heat cools 12 a night, bribes cost a quarter less" }],
  },
  {
    id: "breakroom", name: "Break Room", icon: "U-vending.png",
    blurb: "A couch, a vending machine, and a door that locks from the inside.",
    tiers: [{ cost: 700, text: "+1 Morale for crews on a run" }, { cost: 2000, text: "+2 Morale for crews on a run" }],
  },
];

export const upgradeDef = (id: string) => UPGRADES.find((u) => u.id === id)!;
