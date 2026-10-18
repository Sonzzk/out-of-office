// Radio calls: the crew asks the office to decide something. If nobody answers
// before the timer runs out, the team lead picks `fallback`.
// {n} is the caller, {m} another crew member, {price} a cost.
export interface CallDef {
  id: string;
  text: string;
  options: string[];
  fallback: number;
  needs?: "pair" | "loot"; // only asked when there are two people, or something to trade
  only?: string; // only asked on this level
  outbound?: boolean; // only asked on the way in
}

export const CALL_TICKS = 18;
export const MAX_CALLS = 4; // calls in one run
export const CALL_GAP = 12; // ticks between one call and the next
export const VENDING_PRICE = 40;

export const CALLS: CallDef[] = [
  { id: "closet", text: "{n}: There's a locked supply closet. We can force it, but it'll be loud.", options: ["Force it", "Leave it"], fallback: 1 },
  { id: "phone", text: "{n}: A phone is ringing in an empty office. Do we pick up?", options: ["Answer it", "Ignore it"], fallback: 1 },
  { id: "ankle", text: "{n}: {m} twisted an ankle. They can limp, but it slows us down.", options: ["Bring everyone home", "Keep going"], fallback: 1, needs: "pair", outbound: true },
  { id: "vending", text: "{n}: Vending machine. Takes company cards. Want anything? It's {price}.", options: ["Buy something ($40)", "No snacks"], fallback: 1 },
  { id: "farmhouse", text: "{n}: A farmhouse with every light on. A woman on the porch waves us in for supper. Go in?", options: ["Go in", "Keep walking"], fallback: 1, only: "level-10" },
  { id: "rival", text: "{n}: Another crew down here. Different logo. They'll pay cash for what we're carrying.", options: ["Trade (sell one item, +30%)", "Refuse"], fallback: 1, needs: "loot" },
  { id: "door", text: "{n}: A door with light under it and a sound behind it like someone getting ready. Open it?", options: ["Open it", "Walk past"], fallback: 1 },
  { id: "voice", text: "{n}: A voice on our channel. Not yours. It's asking where we are, very kindly. Answer it?", options: ["Answer", "Cut the radio"], fallback: 1 },
  { id: "fork", text: "{n}: Fork in the hall. Left is lit and long. Right is dark and short. Which way?", options: ["Lit and long", "Dark and short"], fallback: 0 },
  { id: "sleeper", text: "{n}: Someone's asleep at a desk. Lanyard, shoes off, breathing slow. Wake them?", options: ["Wake them", "Let them sleep"], fallback: 1 },
  { id: "elevator", text: "{n}: An elevator, doors open, music playing. It's lit and warm and empty. Ride it?", options: ["Ride it", "Take the stairs"], fallback: 1 },
  { id: "coworker", text: "{n}: A coworker with a visitor's badge says they've been here since the start. They want us to carry a letter out.", options: ["Take the letter", "Decline"], fallback: 1 },
  { id: "supply", text: "{n}: Medical cabinet. Door's off the hinge. The kits are right there, still sealed. Take one?", options: ["Take a kit (first aid, may be loud)", "Leave it"], fallback: 0 },
  { id: "payphone", text: "{n}: A payphone is ringing. Collect call from your office. Accept the charges? It's $60.", options: ["Accept the charges ($60, Heat -5)", "Hang up"], fallback: 1 },
  { id: "mirror", text: "{n}: A mirror at the end of the hall. It shows the hall, and nobody in it. Look closer?", options: ["Look closer", "Cover it"], fallback: 1 },
  { id: "shortcut", text: "{n}: Service hatch in the wall. We could crawl through. It's shorter. It's also a hatch.", options: ["Crawl through", "Go around"], fallback: 1 },
];

export const CALL_TIMEOUT = "{n}: No answer from the office. My call, then.";

export const CALL_OUTCOMES: Record<string, string[]> = {
  "closet:found": ["{n}: Door's open. Got a {item}. Something down the hall heard that."],
  "closet:empty": ["{n}: Empty. Mop, bucket, and now everything on this floor knows where we are."],
  "closet:leave": ["{n}: Leaving it. Probably just mops."],
  "phone:answer": ["{n}: It was a voice reading out our names. All of them. Also, I know the layout now. Don't ask."],
  "phone:ignore": ["{n}: It stopped when we walked off. Then it started again behind us."],
  "ankle:home": ["{n}: Turning around. {m} says thanks. {m} says it quietly."],
  "ankle:lost": ["{n}: {m} fell behind. We went back for them. They weren't there anymore."],
  "ankle:fine": ["{n}: {m} is keeping up. Mostly. Pushing on."],
  "vending:buy": ["{n}: Got a {item}. The machine said thank you. In my voice."],
  "vending:skip": ["{n}: No snacks. The machine looked disappointed. Machines can't look."],
  "farmhouse:good": ["{n}: Best meal of my life. She sent us off with a {item}. She knew all our names."],
  "farmhouse:wrong": ["{n}: Supper was fine. Then we noticed the table has the office's logo carved into it. She asked after the boss."],
  "farmhouse:pass": ["{n}: Kept walking. She kept waving. She was still waving when we lost sight of the porch."],
  "rival:trade": ["{n}: Sold them the {item}. They paid in cash. The bills are warm."],
  "rival:refuse": ["{n}: Told them no. They wrote down our names."],
  "door:loot": ["{n}: Opened it. A neat little room with a {item} on the desk and a chair pulled out for us.", "{n}: Behind the door: a {item}. And fresh footprints that end in the middle of the carpet."],
  "door:empty": ["{n}: Opened it. Empty room. The light was a lamp, on a table, with nothing under it.", "{n}: Nothing. The sound was a radio. It's off now. It's warm."],
  "door:woke": ["{n}: Opened it. Something was home. It's looking at us. We are leaving.", "{n}: There was a person-shaped thing getting ready. It's ready now."],
  "door:pass": ["{n}: Walking past. The sound stopped as we did. Then it started again, closer to the door."],
  "voice:answer": ["{n}: Told it where we are. It said 'I know' and thanked us. Also I know the layout now. We all do.", "{n}: It asked how many of us. Then it asked who's missing. Nobody's missing. Yet."],
  "voice:cut": ["{n}: Radios off. Quiet. The quiet is also listening."],
  "fork:lit": ["{n}: Taking the lit hall. Long walk, but nothing looks at us on the way."],
  "fork:dark": ["{n}: Dark side. Short, yes. {m} says there's a breath ahead. Not ours."],
  "fork:darkgood": ["{n}: Dark side. Short, and we spotted a {item} on the way. Nobody breathed on us."],
  "sleeper:item": ["{n}: Woke them. They blinked, said 'finally', and handed us a {item} before drifting off again."],
  "sleeper:noise": ["{n}: Woke them. They screamed. The kind that carries. Something answered from down the hall."],
  "sleeper:leave": ["{n}: Let them sleep. They smiled in their sleep. It's the smile that makes me glad we left."],
  "elevator:ride": ["{n}: The elevator went sideways. Doors opened somewhere new. The music kept playing the same bar."],
  "elevator:stairs": ["{n}: Stairs. Long, but ours. The elevator closed and played the next song."],
  "coworker:take": ["{n}: Took the letter. It's sealed with company wax. It's addressed to somebody in accounting. In 1989."],
  "coworker:decline": ["{n}: Said no. They nodded like they expected it. They went back to waiting."],
  "supply:take": ["{n}: Took a kit. Unopened, still warm, smells like a hospital that was never built."],
  "supply:alarm": ["{n}: Took a kit. The cabinet rang like a bell. Something on this floor came running."],
  "supply:leave": ["{n}: Left it. Some things you don't take from a building that didn't ask you to."],
  "payphone:accept": ["{n}: Took the call. It was Legal. They said the file was clean, and then they said it again slower."],
  "payphone:hang": ["{n}: Hung up. It rang again immediately. We walked away. It kept ringing."],
  "mirror:item": ["{n}: Looked closer. The reflection held up a {item} and put it in my hand. It's a real {item}."],
  "mirror:look": ["{n}: Looked closer. The hall in the mirror is cleaner than ours. It has more of us in it."],
  "mirror:cover": ["{n}: Covered it with a jacket. The jacket is on the other side now. That's fine."],
  "shortcut:through": ["{n}: Crawled through. Tight, dark and full of cobwebs, but we came out ahead of ourselves."],
  "shortcut:stuck": ["{n}: Crawled through. {m} got stuck for a minute. Nobody pulled. We just waited. It let go."],
  "shortcut:around": ["{n}: Going around. The hatch was open behind us the whole way."],
};

// A deadly thing is closing in. The crew freezes and waits for one word.
export const THREAT_TICKS = 8;
export const THREAT_OPTIONS = ["Hide", "Run", "Distract it", "Give it someone"];
export const THREAT_LINES = [
  "{n}: It's coming. It's coming. What do we do?",
  "{n}: It's seen us! Say something, boss!",
  "{n}: Close. Too close. Orders?",
  "{n}: It's right there. Tell us what to do.",
  "{n}: Boss, it knows we're here. Orders. Now.",
  "{n}: Don't move or run? Somebody pick! Boss!",
  "{n}: It's ten steps off and getting bigger. Say the word.",
  "{n}: We're out of corridor. What do we do?",
];
export const THREAT_OUTCOMES = {
  hide: ["{n}: Everyone down. Lights out. Don't breathe.", "{n}: Behind the cabinet. Quiet. Quiet."],
  runClean: ["{n}: We ran! It lost us at the corner. We lost a boot, nothing else.", "{n}: Run! Run! ...It's gone. Everyone's here."],
  runCaught: ["{n}: We ran. It was faster. It's right behind us now."],
  distract: ["{n}: Threw the {item} down the hall. It went for it. We're moving."],
  sacrifice: ["{n}: We gave it {m}. We're sorry. We're so sorry. We're running."],
};
