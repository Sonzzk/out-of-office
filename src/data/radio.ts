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
export const SPOTTED = ["{n}: Something's smiling at us in the dark.", "{n}: Don't look at the teeth. Don't look at the teeth."];
export const ESCAPE = ["{n}: It's gone. We're good. We're good.", "{n}: Ran. Didn't look back. Recommend that."];
export const DEATH = ["{n}: {m} is gone. It just... took them.", "{n}: We lost {m}. I heard the grin. You can hear a grin."];
export const ARRIVE = ["{n}: Reached your marker. It's an empty room. Great.", "{n}: We're at the X. Nothing here but carpet. Heading back."];
export const RETREAT = ["{n}: That's it. I'm calling it. We're coming back.", "{n}: Team lead's call: we turn around. Dock my pay."];
export const HOME = ["{n}: Back at the door. Never again. Until tomorrow."];
export const WIPE = ["...static..."];

// Per-entity lines. SPOTTED above is the Smiler's.
export const SPOTTED_HOUND = [
  "{n}: Something on all fours down the hall. It's sniffing.",
  "{n}: Heard panting. Not ours. Keep together.",
];
export const SPOTTED_FACELING = [
  "{n}: There's a guy in a suit. He doesn't have a face. He waved.",
  "{n}: Someone's walking toward us. No eyes, no mouth. Just... skin.",
];
export const HOUND_BACKS_OFF = [
  "{n}: The dog thing looked at all of us and backed off. Strength in numbers.",
  "{n}: It circled us twice and left. Nobody split up. Good.",
];
export const HOUND_DEATH = ["{n}: It went for {m}. Dragged them round the corner. We heard it finish."];
export const FACELING_PASS = [
  "{n}: The faceless guy walked right past. Didn't even slow down. Rude, honestly.",
  "{n}: Faceling passed us. Nobody screamed this time. Progress.",
];
export const FACELING_PANIC = [
  "{n}: It stood right in front of me. No face. I'm done. We're leaving.",
  "{n}: {m} is screaming at the faceless thing. We're pulling out.",
];
export const SAMPLE = [
  "{n}: It left something behind. Bagging it for the lab. Gloves on.",
  "{n}: Scraped a bit of it off the wall. You wanted samples, right?",
];
