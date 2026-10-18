// Radio chatter templates. {n} is the speaker, {m} another crew member.
// Lines get stranger deeper down in later stages; Level 0 stays mostly funny.
export const AMBIENT = [
  "{n}: Hallway. Another hallway. Do you pay by the hallway?",
  "{n}: The hum is louder here. Or I'm getting used to the quiet.",
  "{n}: {m} says we passed this water stain before.",
  "{n}: Carpet's wet. Not saying with what.",
  "{n}: Found a chair. Just one. Facing the wall.",
  "{n}: Is overtime a thing here? Asking for {m}.",
  "{n}: Lights flickered. Everyone's fine. Probably.",
  "{n}: Smells like a printer that died.",
];
export const LOST = [
  "{n}: Pretty sure we've been here. Going around again.",
  "{n}: {m} took a wrong turn. We all took a wrong turn.",
  "{n}: This hallway wasn't here a second ago. Rerouting.",
];
export const LOOT = ["{n}: Got something. {item}. Bagging it.", "{n}: {item}! Is that worth anything? Say yes."];
export const ARRIVE = ["{n}: Reached your pin. It's an empty room. Great.", "{n}: We're at the X. Nothing here but carpet."];
export const RETREAT = ["{n}: That's it. I'm calling it. We're coming back.", "{n}: Team lead's call: we turn around. Dock my pay."];
export const HOME = ["{n}: Back at the door. Never again. Until tomorrow."];
export const WIPE = ["...static..."];

// Entity lines live with each entity in entities.ts.
export const SAMPLE = [
  "{n}: It left something behind. Bagging it for the lab. Gloves on.",
  "{n}: Scraped a bit of it off the wall. You wanted samples, right?",
];
