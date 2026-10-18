// One-off office projects bought in the Facilities app. Each one changes
// something you can see on the desktop as well as a number behind it.
export interface ProjectDef {
  id: string;
  name: string;
  cost: number;
  blurb: string;
  effect: string; // what it does, in plain words
  seen: string; // what changes on the desktop
}

export const PROJECTS: ProjectDef[] = [
  {
    id: "memorial", name: "Memorial Wall", cost: 2500,
    blurb: "HR's plaques get a wall to hang on. Nobody is allowed to stand near it.",
    effect: "Deaths bring half as much of the building home with the crew.",
    seen: "A sticky note on the desktop lists everyone you lost.",
  },
  {
    id: "cage", name: "Security Cage", cost: 5000,
    blurb: "A steel cage around the lobby desk. It faces inward.",
    effect: "A death raises Heat by half as much.",
    seen: "Hazard tape along the top of the taskbar.",
  },
  {
    id: "corner", name: "Corner Office", cost: 6500,
    blurb: "Your name on a door that locks. Buyers like doing business with a door.",
    effect: "Everything sells for 10% more.",
    seen: "The start menu carries your name and the windows get wood trim.",
  },
  {
    id: "floor2", name: "Second Floor", cost: 14000,
    blurb: "Stairs that were not in the plans. The contractor will not say who built them.",
    effect: "One more crew out at once.",
    seen: "FL 2 in the tray. Footsteps overhead at night.",
  },
];

export const projectDef = (id: string) => PROJECTS.find((p) => p.id === id)!;

export const RECOVER_COST = 900;
