// Facility upgrades bought in the Facilities app. Each tier is bought once
// and adds a little to the nightly upkeep.
export interface UpgradeDef {
  id: string;
  name: string;
  icon: string; // file in public/art/icons
  blurb: string;
  tiers: { cost: number; text: string }[];
}

export const UPKEEP_PER_TIER = 40; // tiers 1 and 2
export const UPKEEP_PER_LATE_TIER = 15; // tiers 3 and up are cheaper to keep

export const UPGRADES: UpgradeDef[] = [
  {
    id: "dispatch", name: "Dispatch Desk", icon: "U-phone.png",
    blurb: "A second phone line, then a third. More crews out at once.",
    tiers: [{ cost: 3000, text: "3 crews out at once" }, { cost: 8000, text: "4 crews out at once" }, { cost: 16000, text: "5 crews out at once" }, { cost: 30000, text: "6 crews out at once" }],
  },
  {
    id: "lab", name: "Lab Benches", icon: "U-sample-jar.png",
    blurb: "More benches, more jars, more things in the building overnight.",
    tiers: [{ cost: 2400, text: "Research 2 samples a night" }, { cost: 6000, text: "Research 3 samples a night" }, { cost: 12000, text: "Research 4 samples a night" }, { cost: 24000, text: "Research 5 samples a night" }],
  },
  {
    id: "mast", name: "Radio Mast", icon: "U-radio.png",
    blurb: "A taller antenna on the roof. Crews can wait longer for your call.",
    tiers: [{ cost: 800, text: "Calls wait 50% longer" }, { cost: 3000, text: "Calls wait twice as long" }, { cost: 6000, text: "Calls wait two and a half times as long" }, { cost: 12000, text: "Calls wait three times as long" }],
  },
  {
    id: "security", name: "Security Desk", icon: "U-padlock.png",
    blurb: "Someone in the lobby who says \"no comment\" a lot.",
    tiers: [{ cost: 1600, text: "Heat cools 8 a night instead of 5" }, { cost: 4000, text: "Heat cools 12 a night, bribes cost a quarter less" }, { cost: 9000, text: "Heat cools 16 a night" }, { cost: 18000, text: "Heat cools 20 a night, bribes cost half" }],
  },
  {
    id: "breakroom", name: "Break Room", icon: "U-vending.png",
    blurb: "A couch, a vending machine, and a door that locks from the inside.",
    tiers: [{ cost: 900, text: "+1 Morale for crews on a run" }, { cost: 4000, text: "+2 Morale for crews on a run" }, { cost: 9000, text: "+3 Morale for crews on a run" }, { cost: 16000, text: "+3 Morale and a free first aid kit on every run" }],
  },
];

export const upgradeDef = (id: string) => UPGRADES.find((u) => u.id === id)!;
