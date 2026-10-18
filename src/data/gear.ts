// Gear bought when a run is planned. Each piece is used up on that run.
export interface GearDef {
  id: string;
  name: string;
  art: string; // file in public/art/items
  cost: number;
  blurb: string;
}

export const GEAR: GearDef[] = [
  { id: "flashlight", name: "Flashlight Pack", art: "I05-flashlight.png", cost: 40, blurb: "See further in the dark." },
  { id: "rope", name: "Rope Kit", art: "I17-rope-kit.png", cost: 60, blurb: "Get lost less. Nobody gets left limping." },
  { id: "radio", name: "Radio Kit", art: "I19-radio-kit.png", cost: 50, blurb: "Twice as long to answer a call." },
  { id: "firstaid", name: "First Aid Kit", art: "I18-first-aid.png", cost: 90, blurb: "Saves one life on this run." },
  { id: "repellent", name: "Smiler Repellent", art: "I12-smiler-repellent.png", cost: 120, blurb: "Drives off one thing that hunts in the dark." },
];

export const gearDef = (id: string) => GEAR.find((g) => g.id === id)!;
