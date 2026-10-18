// Every entity crews can meet, as data: how it moves, what it does when it
// reaches a crew, what resists it, and its Index page. Adapted from the
// Backrooms Wiki (CC BY-SA), rewritten in our own words.
import type { Skill } from "./crew";

export type Moves = "dark" | "lit" | "any" | "wander" | "still";
// kill: takes at most one person. panic: the lead may turn back. steal: loot
// goes missing. lure: one person walks off. guide: shows the way. warn: the
// next deadly encounter is avoided. infect: the office gets worse.
export type Effect = "kill" | "panic" | "steal" | "lure" | "guide" | "warn" | "infect";

export interface EntityDef {
  id: string;
  name: string;
  art: string; // file in public/art/entities
  cls: number;
  difficulty: string;
  moves: Moves;
  sense: number; // chases within this distance (0 = never chases)
  speed: number; // chance to step toward the crew each tick while chasing
  effect: Effect;
  check?: Skill; // the skill that resists it
  base?: number; // chance per person before skill
  per?: number; // chance removed per skill point
  groupDeter?: number; // backs off crews this big or bigger
  sample: number; // chance of a sample after a survived encounter
  sampleName: string;
  sampleValue: number;
  spotted: string[]; // radio lines, {n} speaker, {m} someone else
  outcome: string; // radio line when it does its thing, {m} is the person it took
  passed: string; // radio line when the crew gets away
  description: string;
  where: string;
  avoid: string;
  mastered: string;
  lore: string;
}

export const ENTITIES: EntityDef[] = [
  {
    id: "smiler", name: "Smiler", art: "E01-smiler.png", cls: 3, difficulty: "Deadly in the dark",
    moves: "dark", sense: 5, speed: 0.7, effect: "kill", check: "stealth", base: 0.5, per: 0.075,
    sample: 0.35, sampleName: "Smiler Residue", sampleValue: 320,
    spotted: ["{n}: Something's smiling at us in the dark.", "{n}: Don't look at the teeth. Don't look at the teeth."],
    outcome: "{n}: We lost {m}. I heard the grin. You can hear a grin.",
    passed: "{n}: It's gone. We're good. We're good.",
    description: "A wide grin and two pale eyes floating in the dark. Nobody has seen the rest of it.",
    where: "Dark patches on most levels.",
    avoid: "Don't run and don't stare. Stealthy crews slip past; loud ones don't.",
    mastered: "Crews know not to run: Smilers take half as many people.",
    lore: "Recovered audio from a dead crew's radio: the grin makes a sound. It sounds like the office muzak, played slower.",
  },
  {
    id: "hound", name: "Hound", art: "E02-hound.png", cls: 3, difficulty: "Hunts loners",
    moves: "lit", sense: 4, speed: 0.6, effect: "kill", check: "stealth", base: 0.55, per: 0.06, groupDeter: 3,
    sample: 0.35, sampleName: "Hound Tooth", sampleValue: 260,
    spotted: ["{n}: Something on all fours down the hall. It's sniffing.", "{n}: Heard panting. Not ours. Keep together."],
    outcome: "{n}: It went for {m}. Dragged them round the corner. We heard it finish.",
    passed: "{n}: The dog thing looked at all of us and backed off. Strength in numbers.",
    description: "Something that used to walk upright and now prefers all fours. It hunts by sound and goes for whoever is alone.",
    where: "Roams the lit halls.",
    avoid: "Send crews of three or more. Hounds back off from a group.",
    mastered: "Hounds back off from a pair, not just from three.",
    lore: "Hounds wear the remains of company lanyards. HR has asked that this not be investigated further.",
  },
  {
    id: "faceling", name: "Faceling", art: "E03-faceling.png", cls: 1, difficulty: "Harmless, upsetting",
    moves: "wander", sense: 0, speed: 0.35, effect: "panic", check: "morale", base: 0.5, per: 0.08,
    sample: 0.5, sampleName: "Faceling Skin Flake", sampleValue: 150,
    spotted: ["{n}: There's a guy in a suit. He doesn't have a face. He waved.", "{n}: Someone's walking toward us. No eyes, no mouth. Just... skin."],
    outcome: "{n}: It stood right in front of me. No face. I'm done. We're leaving.",
    passed: "{n}: The faceless guy walked right past. Didn't even slow down. Rude, honestly.",
    description: "A person-shaped thing with no face, wandering the halls like it is late for a meeting.",
    where: "Anywhere, often in groups on the office levels.",
    avoid: "Ignore it. Crews that don't know that tend to panic and turn back.",
    mastered: "Crews walk right past Facelings and pick up their shed skin more often.",
    lore: "Facelings stop and turn toward the office when your company name is said out loud.",
  },
  {
    id: "partygoer", name: "Partygoer", art: "E04-partygoer.png", cls: 4, difficulty: "Invites you",
    moves: "any", sense: 6, speed: 0.5, effect: "lure", check: "morale", base: 0.5, per: 0.07,
    sample: 0.3, sampleName: "Party Streamer", sampleValue: 380,
    spotted: ["{n}: Someone in a party hat is waving at us. Big smile. Too big.", "{n}: I can hear a party. Balloons. Someone's calling {m} by name."],
    outcome: "{n}: {m} said they'd just pop in for one drink. The door closed behind them. There's no door now.",
    passed: "{n}: We said no thank you to the party. It took it personally, but we're fine.",
    description: "A yellow figure with a painted smile and a party hat. It wants you to come to the party. Everyone is already there.",
    where: "The hotel and the deeper office levels.",
    avoid: "High-morale crews say no. Low-morale ones say yes.",
    mastered: "Crews know the script: half as many people go to the party.",
    lore: "The party has a guest list. The guest list has a seating chart. You are at the head of the table.",
  },
  {
    id: "skin-stealer", name: "Skin-Stealer", art: "E05-skin-stealer.png", cls: 4, difficulty: "Wears a friend",
    moves: "any", sense: 3, speed: 0.5, effect: "kill", check: "medical", base: 0.45, per: 0.07,
    sample: 0.3, sampleName: "Borrowed Skin", sampleValue: 420,
    spotted: ["{n}: {m} just came back from the other direction. {m} is also standing next to me.", "{n}: Someone's walking with us who wasn't in the briefing."],
    outcome: "{n}: The {m} that came back isn't {m}. It's gone now. So is the real one.",
    passed: "{n}: Our medic spotted the fake. Wrong pulse. It ran off on all the wrong joints.",
    description: "It looks like one of your crew until it doesn't. Medics notice the details first.",
    where: "Open floors where crews spread out.",
    avoid: "Bring someone with medical training. They notice what's off.",
    mastered: "Crews use a password. Skin-Stealers fool half as many.",
    lore: "One crew came back with five members after sending four. Payroll paid all five. Nobody has asked the fifth.",
  },
  {
    id: "deathmoth", name: "Deathmoth", art: "E06-deathmoth.png", cls: 3, difficulty: "Swarms in the dark",
    moves: "dark", sense: 4, speed: 0.6, effect: "kill", check: "medical", base: 0.35, per: 0.05,
    sample: 0.5, sampleName: "Moth Wing", sampleValue: 200,
    spotted: ["{n}: Big moths. Really big. They like our lights.", "{n}: Wings in the dark. Lots of them."],
    outcome: "{n}: The swarm covered {m}. When it lifted, there was nothing to bring back.",
    passed: "{n}: Moth bites. Patched up. Still walking.",
    description: "Moths the size of a hand, then the size of a head. They swarm anything warm in the dark.",
    where: "Hot unlit tunnels.",
    avoid: "A medic can treat the bites before they turn bad.",
    mastered: "Crews cover up and keep the lights low: half as many losses.",
    lore: "Deathmoths are drawn to monitors. The office has many monitors.",
  },
  {
    id: "clump", name: "Clump", art: "E07-clump.png", cls: 4, difficulty: "Slow, final",
    moves: "any", sense: 3, speed: 0.3, effect: "kill", check: "nav", base: 0.6, per: 0.08,
    sample: 0.25, sampleName: "Clump Tissue", sampleValue: 460,
    spotted: ["{n}: There's a pile of... limbs. It's moving. Slowly.", "{n}: Something big and lumpy is blocking the corridor."],
    outcome: "{n}: We got cornered. {m} pushed us out and didn't follow.",
    passed: "{n}: Found another way round. It can't keep up.",
    description: "A mass of limbs that drags itself after crews. Slow, but corners are its friend.",
    where: "Machine rooms and dead ends.",
    avoid: "Good navigators never let it corner them.",
    mastered: "Crews map escape routes: half as many cornered.",
    lore: "Some of the hands in a Clump wear wedding rings. A few wear company rings.",
  },
  {
    id: "wretch", name: "Wretch", art: "E08-wretch.png", cls: 3, difficulty: "Used to be staff",
    moves: "lit", sense: 5, speed: 0.55, effect: "kill", check: "stealth", base: 0.45, per: 0.06, groupDeter: 4,
    sample: 0.35, sampleName: "Wretch Badge", sampleValue: 300,
    spotted: ["{n}: Someone in a torn uniform. Gray skin. It's looking for something.", "{n}: It's wearing a name tag. I can't read the name."],
    outcome: "{n}: It grabbed {m} and they both went quiet. Then only one of them got up.",
    passed: "{n}: It lost interest. It looked lonely, honestly.",
    description: "What happens to people who stay too long. They wander the halls looking for whoever they used to be.",
    where: "The deeper levels.",
    avoid: "Stealth, or a crew of four it won't take on.",
    mastered: "Crews recognize the signs early: half as many taken.",
    lore: "Every Wretch has a staff ID. Several IDs are from your company. They are dated next year.",
  },
  {
    id: "duller", name: "Duller", art: "E09-duller.png", cls: 2, difficulty: "Steals memories",
    moves: "wander", sense: 0, speed: 0.4, effect: "steal", check: "morale", base: 0.6, per: 0.08,
    sample: 0.4, sampleName: "Gray Dust", sampleValue: 180,
    spotted: ["{n}: Gray thing. Hard to look at. Hard to remember looking at.", "{n}: Something's here. What was I saying?"],
    outcome: "{n}: We had something in the bag a minute ago. Didn't we?",
    passed: "{n}: Kept our heads. And our bags.",
    description: "A gray, smudged shape. Being near it makes you forget things, including what you were carrying.",
    where: "Warehouse levels.",
    avoid: "Keep morale high and minds busy. Crews of three hold onto their loot.",
    mastered: "Crews know to keep talking. Dullers can't take anything.",
    lore: "The Duller leaves things behind too: someone else's memories. One crew came back remembering your childhood home.",
  },
  {
    id: "dunk", name: "Dunk", art: "E10-dunk.png", cls: 2, difficulty: "Takes things",
    moves: "any", sense: 4, speed: 0.6, effect: "steal", check: "stealth", base: 0.55, per: 0.07,
    sample: 0.4, sampleName: "Dunk Slime", sampleValue: 190,
    spotted: ["{n}: Little wet thing following us. It's eyeing the bags.", "{n}: It's got loot in its mouth. Ours, I think."],
    outcome: "{n}: It snatched something and dove into a puddle that wasn't there before.",
    passed: "{n}: Shooed it off. Bags are closed.",
    description: "A small wet creature that steals shiny things and vanishes into puddles.",
    where: "Flooded and damp levels.",
    avoid: "Stealthy crews keep it from noticing the loot.",
    mastered: "Crews seal their bags. Dunks can't take anything.",
    lore: "Somewhere there is a pile of everything Dunks have taken. It is shaped like a desk.",
  },
  {
    id: "dollface", name: "Dollface", art: "E11-dollface.png", cls: 4, difficulty: "Don't look",
    moves: "still", sense: 0, speed: 0, effect: "kill", check: "stealth", base: 0.4, per: 0.06,
    sample: 0.3, sampleName: "Porcelain Chip", sampleValue: 400,
    spotted: ["{n}: There's a doll in the corner. Wasn't there before.", "{n}: Don't look at the doll. Seriously, don't."],
    outcome: "{n}: {m} looked. The doll is closer now. {m} isn't anywhere.",
    passed: "{n}: Eyes on the floor. We got past it.",
    description: "A porcelain figure that only moves when nobody is looking. Someone always looks.",
    where: "Office floors and hotel rooms.",
    avoid: "Quiet, careful crews keep their eyes down.",
    mastered: "Crews walk past backwards. Half as many look.",
    lore: "The dolls are all the same face. It's the face from your company's stock photos.",
  },
  {
    id: "death-rat", name: "Death Rat", art: "E12-death-rat.png", cls: 2, difficulty: "Swarm",
    moves: "any", sense: 3, speed: 0.7, effect: "kill", check: "medical", base: 0.2, per: 0.03,
    sample: 0.6, sampleName: "Rat Tail", sampleValue: 120,
    spotted: ["{n}: Rats. Too many rats. Red eyes.", "{n}: Squeaking from inside the shelves."],
    outcome: "{n}: The rats got {m}. It was fast, at least.",
    passed: "{n}: Bites, nothing worse. Antiseptic's out.",
    description: "Rats with red eyes and bad intentions. One is a nuisance; they never come as one.",
    where: "Warehouses and storage.",
    avoid: "Medics keep bites from going bad.",
    mastered: "Crews carry traps: half as many losses.",
    lore: "The rats are always heading toward the exit. They know where it is.",
  },
  {
    id: "light-guide", name: "Light Guide", art: "E13-light-guide.png", cls: 0, difficulty: "Friendly",
    moves: "wander", sense: 0, speed: 0.3, effect: "guide",
    sample: 0.2, sampleName: "Guide Spark", sampleValue: 350,
    spotted: ["{n}: A little light is bobbing ahead of us. It seems to want us to follow.", "{n}: Floating light. Warm. Friendly? Friendly."],
    outcome: "{n}: The light showed us around. There's stuff over there we missed.",
    passed: "{n}: The light flickered and went its own way.",
    description: "A small warm light that leads lost people to safety, and sometimes to loot.",
    where: "Machine rooms, where it keeps out of the noise.",
    avoid: "Nothing to avoid. Follow it.",
    mastered: "Crews know how to ask: it shows them more.",
    lore: "The Light Guide has led crews back to the door every time. It has never once gone through the door itself.",
  },
  {
    id: "warning-kite", name: "Warning Kite", art: "E14-warning-kite.png", cls: 0, difficulty: "Helpful",
    moves: "wander", sense: 0, speed: 0.3, effect: "warn",
    sample: 0.2, sampleName: "Kite String", sampleValue: 300,
    spotted: ["{n}: There's a kite flying indoors. It's pointing somewhere.", "{n}: Kite. Indoors. It keeps tugging left."],
    outcome: "{n}: The kite warned us off a bad corridor. Feels like we owe it.",
    passed: "{n}: The kite drifted off.",
    description: "A paper kite that flies where there's no wind and tugs crews away from danger.",
    where: "The hotel's long corridors.",
    avoid: "Nothing to avoid. Listen to it.",
    mastered: "Crews read the kite better: it warns more often.",
    lore: "The kite's paper is a page from a memo. The memo is addressed to you. It says turn back.",
  },
  {
    id: "mother", name: "The Mother", art: "E15-mother.png", cls: 5, difficulty: "Run",
    moves: "any", sense: 6, speed: 0.45, effect: "kill", check: "stealth", base: 0.75, per: 0.06,
    sample: 0.15, sampleName: "Mother's Thread", sampleValue: 900,
    spotted: ["{n}: Something huge is moving behind the walls.", "{n}: It's singing. A lullaby. It's getting closer."],
    outcome: "{n}: It took {m} like a parent picks up a child. Gently. Then it left.",
    passed: "{n}: We hid until the singing stopped.",
    description: "Something enormous that sings and gathers people up. Nobody has seen all of it.",
    where: "Deep levels only.",
    avoid: "Don't be found. Only the quietest crews get past.",
    mastered: "Crews know the lullaby's rhythm: half as many taken.",
    lore: "The lullaby is the same tune as the hold music on the office phones.",
  },
  {
    id: "window", name: "Window", art: "E16-window.png", cls: 3, difficulty: "Don't stare",
    moves: "still", sense: 0, speed: 0, effect: "lure", check: "morale", base: 0.45, per: 0.07,
    sample: 0.3, sampleName: "Glass Shard", sampleValue: 340,
    spotted: ["{n}: There's a window. It shows outside. Real outside. Sunshine.", "{n}: A window to home. My actual street."],
    outcome: "{n}: {m} climbed through the window to get home. The window's a wall now.",
    passed: "{n}: Pulled the curtain. Kept walking. Didn't look back.",
    description: "A window in a wall where no window should be, showing the place you most want to be.",
    where: "The hotel and office floors.",
    avoid: "High morale crews remember why they're here. Homesick ones don't.",
    mastered: "Crews tape over windows: half as many climb through.",
    lore: "Some crews say the window showed them the office. They climbed through. They came back. Some of them.",
  },
  {
    id: "crawler", name: "Crawler", art: "E17-crawler.png", cls: 3, difficulty: "Fast in tunnels",
    moves: "any", sense: 6, speed: 0.8, effect: "kill", check: "nav", base: 0.4, per: 0.06,
    sample: 0.35, sampleName: "Crawler Claw", sampleValue: 280,
    spotted: ["{n}: Scratching in the pipes. Fast. Moving with us.", "{n}: Something just went across the ceiling."],
    outcome: "{n}: It came out of a vent and took {m} back in with it.",
    passed: "{n}: Took the long way round. It lost us.",
    description: "Long, low and quick, it lives in the walls and pipes and comes out at junctions.",
    where: "Pipe tunnels.",
    avoid: "Navigators who avoid junctions avoid Crawlers.",
    mastered: "Crews avoid junctions: half as many taken.",
    lore: "Crawlers have been seen in the office ceiling. Facilities has scheduled a survey. Facilities has been rescheduled.",
  },
  {
    id: "anna", name: "Anna", art: "E18-anna.png", cls: 2, difficulty: "Asks for you",
    moves: "wander", sense: 0, speed: 0.3, effect: "infect",
    sample: 0.25, sampleName: "Anna's Ribbon", sampleValue: 500,
    spotted: ["{n}: A little girl in a dress. She's asking for {boss}.", "{n}: Kid. Alone. She says she knows the boss."],
    outcome: "{n}: She said to tell {boss} she'll visit soon. Then she wasn't there.",
    passed: "{n}: She waved goodbye. She said see you at the office.",
    description: "A quiet girl in an old dress who appears to crews and asks about their boss by name.",
    where: "Deep levels.",
    avoid: "She doesn't hurt anyone. The office feels worse afterwards.",
    mastered: "Crews don't answer her questions. The office stays calmer.",
    lore: "Anna has been seen in the office break room. She was drawing. It was a picture of you, from behind.",
  },
  {
    id: "humans", name: "Wanderers", art: "E19-humans.png", cls: 2, difficulty: "Other people",
    moves: "any", sense: 4, speed: 0.5, effect: "steal", check: "morale", base: 0.5, per: 0.06, groupDeter: 3,
    sample: 0, sampleName: "", sampleValue: 0,
    spotted: ["{n}: People. Actual people. They look rough. They're looking at our bags.", "{n}: Another group. No logo. Lots of knives."],
    outcome: "{n}: They took a bag at knifepoint and wished us luck.",
    passed: "{n}: They sized us up and decided against it.",
    description: "People who got lost and stayed lost. Some trade, some rob, all of them are tired.",
    where: "Deep levels.",
    avoid: "Big crews don't get robbed.",
    mastered: "Crews know the right words: nobody robs them.",
    lore: "One of them asked if your company is hiring. You are. He has a familiar name.",
  },
  {
    id: "chupavida", name: "Chupavida", art: "E20-chupavida.png", cls: 4, difficulty: "Drains",
    moves: "dark", sense: 5, speed: 0.65, effect: "kill", check: "medical", base: 0.5, per: 0.07,
    sample: 0.3, sampleName: "Dry Husk", sampleValue: 480,
    spotted: ["{n}: Something thin and dry in the dark. It's breathing like a straw.", "{n}: I feel tired all of a sudden. Really tired."],
    outcome: "{n}: It drained {m}. There's not much left to carry.",
    passed: "{n}: Medic got the color back in everyone. We're moving.",
    description: "A dry, thin thing that drains the life out of people in the dark.",
    where: "Deep unlit levels.",
    avoid: "Medics can bring people back from the edge.",
    mastered: "Crews know the early signs: half as many drained.",
    lore: "Chupavida husks are always found facing the exit. They were so close.",
  },
];

export const entityDef = (id: string) => ENTITIES.find((e) => e.id === id)!;
