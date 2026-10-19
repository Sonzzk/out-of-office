// The story, in three acts: memos and radio lines. {boss} and {company} are
// filled in when a memo is shown. Act 1 is the job, Act 2 is the cost, Act 3 is
// the exit; after an ending the office goes on in "new quarter" mode (act 4).
import type { EventDef } from "./events";
import type { GameState } from "../sim/state";

export interface StoryFx {
  replied?: number; // counts as answering one of the strange memos
  infection?: number;
  heat?: number;
  cash?: number;
  ledger?: string;
  flags?: Record<string, number>;
}

export interface StoryChoice {
  label: string;
  result: string;
  fx?: StoryFx;
}

export interface StoryBeat {
  id: string; // memos that ask something are "story-..." ids, registered as events
  act: 1 | 2 | 3;
  day: number; // earliest day
  when?: (s: GameState) => boolean;
  from: string;
  subject: string;
  body: string;
  ask?: { choices: StoryChoice[]; fallback: number };
}

const dead = (s: GameState) => s.crew.filter((w) => w.status === "dead").length;

export const BEATS: StoryBeat[] = [
  // --- Act 1: The Job ------------------------------------------------------
  {
    id: "board-intro", act: 1, day: 2, from: "The Board", subject: "A note on who we are",
    body:
      "{boss},\n\nYou have been asking Facilities who the Board is. The Board is not a person, a room or a committee. The Board is the reason the cheques clear.\n\n" +
      "You will not meet us. You will meet our targets. They are very punctual.\n\n- The Board",
  },
  {
    id: "handbook-pages", act: 1, day: 4, from: "HR", subject: "Your Employee Handbook",
    body:
      "Several staff report that the Handbook skips from page 12 to page 14. HR has checked. There is no page 13.\n\n" +
      "HR would like it noted that there has never been a page 13, and that the staff who went looking for it were not on the payroll.\n\n- HR",
  },
  {
    id: "board-index", act: 1, day: 6, from: "The Board", subject: "About the Index",
    body:
      "We see you are logging what your crews find. Good. Keep the Index current and complete.\n\n" +
      "The Board reads it every night. The Board does not say what it is looking for. The Board will know when it finds it.\n\n- The Board",
  },
  {
    id: "corridor", act: 1, day: 7, from: "Facilities", subject: "Corridor change notice",
    body:
      "The corridor to the supply closet is now forty feet longer. We did not authorise this. We have not been able to find out who did.\n\n" +
      "The supply closet is still where it was. It is just further away.\n\n- Facilities",
  },
  {
    id: "story-hello", act: 1, day: 9, from: "(no sender)", subject: "do you still work here",
    body: "do you still work here\n\nyou can reply to this\n\nmost people don't",
    ask: {
      choices: [
        { label: "Reply: yes, I still work here", result: "Reply sent. It was marked delivered before you pressed the key. Nothing wrote back. Your chair is slightly warmer.", fx: { replied: 1, infection: 1 } },
        { label: "Don't reply", result: "Marked unread. It marked itself read. Some time later it went away, politely.", fx: {} },
      ],
      fallback: 1,
    },
  },
  {
    id: "no-thirteen", act: 1, day: 10, when: (s) => dead(s) > 0, from: "Legal", subject: "Everything is fine",
    body:
      "Legal has reviewed the incidents of the past week and finds that everything is fine.\n\n" +
      "Legal would like to remind staff that \"everything is fine\" is a legal finding, and disputing it is a separate matter.\n\n- Legal",
  },
  {
    id: "probation", act: 1, day: 12, from: "The Board", subject: "End of your probation",
    body:
      "Your probation ends tomorrow. You were never told it was a probation. You passed anyway, which is the usual outcome for those who last this long.\n\n" +
      "Expect a reorganisation. Wear something you can be found in.\n\n- The Board",
  },

  // --- Act 2: The Cost -----------------------------------------------------
  {
    id: "story-derek", act: 2, day: 14, from: "Derek Vance, CEO, Vance Exploratory Holdings", subject: "A word between professionals",
    body:
      "{boss},\n\nI'll skip the pleasantries. I have a map of the lower levels that is better than yours, and I'd like to share it. In return I'd like your Index.\n\n" +
      "I know what the Board wants from you. I used to want it too. Take the retainer and we'll talk.\n\nDerek\n\nP.S. We have a window. Ask about the window.",
    ask: {
      choices: [
        { label: "Take Derek's retainer (+$800)", result: "The retainer cleared in four minutes. Derek sent a one-line reply: \"Smart.\" The company logo on his email now has a tiny second logo underneath. It's ours.", fx: { cash: 800, ledger: "Vance Holdings retainer", flags: { derek: 1 } } },
        { label: "Burn the card", result: "It burned green. Derek replied: \"Respect. Also, noted.\" Hollis called the front desk to ask about the smoke.", fx: { heat: 4, flags: { derek: 0 } } },
        { label: "Forward it to the Board (+$300)", result: "The Board thanked you in under a second. $300 appeared in Accounting. Derek will know. Derek always knows.", fx: { cash: 300, ledger: "The Board: loyalty bonus", flags: { derek: -1 } } },
      ],
      fallback: 1,
    },
  },
  {
    id: "board-q2", act: 2, day: 15, from: "The Board", subject: "Regarding the Index",
    body:
      "Phase Two in brief. The Board has an interest in the Index that goes beyond statistics.\n\n" +
      "We do not want what your crews bring back. We want what they stop being able to describe. Level by level, the Index gets closer to a place we call the Table.\n\n" +
      "Keep documenting. Do not read the entries aloud.\n\n- The Board",
  },
  {
    id: "story-ask", act: 2, day: 17, from: "(no sender)", subject: "who is the other boss",
    body: "there is another one of you\n\nhe sends memos too\n\nwhich of you is the one that signs",
    ask: {
      choices: [
        { label: "Reply: I sign", result: "The memo thanked you. It said \"Noted for the file.\" Someone, somewhere, has begun a file.", fx: { replied: 1, infection: 2 } },
        { label: "Reply: neither of us", result: "It sent back a smiley face. Nobody has taught the system to do that.", fx: { replied: 1, heat: 3 } },
        { label: "Don't reply", result: "It waited, then asked someone else.", fx: {} },
      ],
      fallback: 2,
    },
  },
  {
    id: "air", act: 2, day: 18, when: (s) => s.infection >= 25, from: "Facilities", subject: "Air quality: a second opinion",
    body:
      "We commissioned a second air quality report because the first one came back as a drawing of the office.\n\n" +
      "The second report says the air is \"present, and listening.\" Facilities recommends opening a window. Facilities has not been able to find a window.\n\n- Facilities",
  },
  {
    id: "attrition", act: 2, day: 19, when: (s) => dead(s) >= 2, from: "Legal", subject: "A note on attrition",
    body:
      "Staff turnover is 100% of the staff that left. Legal considers this a rounding error.\n\n" +
      "Several families have sent a joint letter. It is written in the same handwriting four times. Legal has filed it with the other letters, which are also in that handwriting.\n\n- Legal",
  },
  {
    id: "vance-yes", act: 2, day: 20, when: (s) => s.storyFlags?.derek === 1, from: "Derek Vance, CEO, Vance Exploratory Holdings", subject: "Deliverables (they are due)",
    body:
      "{boss},\n\nWe've been reading your Index. It's thorough. Too thorough, frankly. You write like someone who thinks the Board is on your side.\n\n" +
      "It was never anyone's side. I've been at that table. It has a logo carved into it. Guess whose.\n\nDerek",
  },
  {
    id: "vance-no", act: 2, day: 20, when: (s) => s.storyFlags?.derek !== 1, from: "Derek Vance, CEO, Vance Exploratory Holdings", subject: "Fruit basket (second one)",
    body:
      "{boss},\n\nNo hard feelings. The first basket was a courtesy. This one is a warning. It is a better basket.\n\n" +
      "My crews are on Level 9 now. They send postcards. The postcards are of your office.\n\nDerek",
  },
  {
    id: "story-badge", act: 2, day: 22, from: "(no sender)", subject: "your badge photo",
    body: "we found your badge photo\n\nit is not you\n\nit is smiling\n\nshould we send it to payroll",
    ask: {
      choices: [
        { label: "Reply: send it", result: "Payroll received it. Payroll now pays two of you. The second cheque is made out to something with no name.", fx: { replied: 1, infection: 2, cash: 150, ledger: "Payroll: second badge", } },
        { label: "Reply: that's not me", result: "\"Understood,\" it wrote. \"That's what he said.\"", fx: { replied: 1 } },
        { label: "Don't reply", result: "It went to payroll anyway. It was always going to.", fx: { infection: 1 } },
      ],
      fallback: 2,
    },
  },
  {
    id: "hollis-off", act: 2, day: 23, when: (s) => s.heat >= 30, from: "Inspector Hollis", subject: "Off the record",
    body:
      "{boss},\n\nI am writing this on my own time, which is the only kind I have left.\n\n" +
      "The department I work for does not exist. I have checked. I looked for it for eleven years. The Board knows my badge number. If you ever stand at a farmhouse table, think of me.\n\n- H.",
  },
  {
    id: "appendix-c", act: 2, day: 24, from: "The Board", subject: "Appendix C (do not open)",
    body:
      "You opened it. Good.\n\nThe Table is on Level 10, in a farmhouse at the far end of the wheat. A place is laid for the one who reaches it. The Board has been unable to send anyone to sit down.\n\n" +
      "To go, you need Level 10 charted, a handful of Index entries mastered, and a bank balance that persuades us you're serious. Meet the second year's target. Then we will open a door.\n\n- The Board",
  },
  {
    id: "gary-numbers", act: 2, day: 25, when: (s) => s.infection >= 40, from: "Gary (Accounts)", subject: "Your numbers",
    body:
      "Hi {boss}!\n\nGary. I've finished the headcount. There are more of you than there should be. I've corrected it by adding a line.\n\n" +
      "Don't worry about the line. It's in your handwriting.\n\nGary",
  },
  {
    id: "story-door", act: 2, day: 27, from: "(no sender)", subject: "the door is open",
    body: "the door at the end of the hall is open\n\nit has been open all along\n\nyou are the one who keeps closing it",
    ask: {
      choices: [
        { label: "Reply: I'll leave it open", result: "The hum got a half-step lower. Lights came on in a corridor that was not on the plan.", fx: { replied: 1, infection: 3 } },
        { label: "Close it. Lock it.", result: "You locked it. The lock has already been replaced by one that opens from the other side.", fx: { replied: 1, heat: 2 } },
        { label: "Don't reply", result: "It remained open. It is very patient about it.", fx: {} },
      ],
      fallback: 2,
    },
  },
  {
    id: "exit-interviews", act: 2, day: 28, from: "HR", subject: "Exit interviews (a reminder)",
    body:
      "HR would like to remind you that every employee has the right to resign. HR has never seen it used. We have the form on file. We have always had the form on file.\n\n" +
      "Use of the form is not discouraged. It is just not recommended. Starting this quarter you can find it under Clock Out.\n\n- HR",
  },
  {
    id: "board-last", act: 2, day: 30, from: "The Board", subject: "Final notice (preliminary)",
    body: "We are very pleased with you. We are pleased in the way you are pleased with a lock that is about to open.\n\n- The Board",
  },

  // --- Act 3: The Exit -----------------------------------------------------
  {
    id: "derek-wheat", act: 3, day: 0, when: (s) => s.storyFlags?.derek === 1, from: "Derek Vance, CEO, Vance Exploratory Holdings", subject: "I'll see you at the table",
    body: "{boss},\n\nMy crew is already in the wheat. They are not coming back, which is a thing I have come to accept. I'm sitting down first. I have the paperwork.\n\nDerek",
  },
  {
    id: "board-final", act: 3, day: 0, from: "The Board", subject: "Instructions for the descent",
    body:
      "One crew, one trip. The farmhouse is at the far end of the wheat. Go in, eat supper, come back. If you are not hungry, bring your appetite anyway.\n\n" +
      "What happens at the table depends on who you are by the time you reach it. The Board has no opinion. The Board has a seat.\n\n- The Board",
  },
  {
    id: "hr-quit", act: 3, day: 0, from: "HR", subject: "Resignation (form attached)",
    body:
      "In case it is useful: you may resign instead. HR will process it in the order received. You are the first.\n\n" +
      "We cannot guarantee where the door will lead. We can guarantee it will be a door.\n\n- HR",
  },
];

// Beats that ask something are real events with a choice, so the inbox treats
// them like any other. They never roll by chance (their cooldown is forever).
export const STORY_EVENTS: Record<string, EventDef> = Object.fromEntries(
  BEATS.filter((b) => b.ask).map((b) => [
    b.id,
    { id: b.id, from: b.from, subject: b.subject, bodies: [b.body], choices: b.ask!.choices.map((c) => c.label), fallback: b.ask!.fallback, cooldown: 99999 } satisfies EventDef,
  ]),
);

export const ACT_MEMOS = {
  2: {
    from: "The Board",
    subject: "Phase Two: the reorganisation (you are part of it)",
    body:
      "{boss},\n\nThe Board has finished reviewing {company}'s probation. You passed. That is not praise; it is a classification.\n\n" +
      "Effective now the company is in Phase Two:\n1. Targets are larger and the deadlines are not kinder.\n2. Your numbers are read by people you have not met.\n" +
      "3. Please stop saying \"Backrooms\" in correspondence. The Board prefers \"the other floor.\"\n\n- The Board",
  },
  3: {
    from: "The Board",
    subject: "The Exit",
    body:
      "{boss},\n\nEvery job has a last day. You have mapped the way down far enough that the Board would like it to be short.\n\n" +
      "There is now an EXIT icon on your desktop. It is not a metaphor. Behind it are one crew, one trip and a farmhouse at the far end of the wheat.\n\n" +
      "You may also resign. HR has the form. HR has always had the form.\n\n- The Board",
  },
};

// The desktop gets a title card when an act begins.
export const ACT_CARDS: Record<number, { title: string; sub: string }> = {
  2: { title: "ACT II", sub: "The Cost" },
  3: { title: "ACT III", sub: "The Exit" },
};

export const STICKIES: Record<number, string> = {
  2: "Board: read the Index. All of it. Out loud.",
  3: "EXIT is on the desktop. You have been told.",
};

// Radio lines that only the later acts hear on the way in.
export const ACT_RADIO: Record<number, string[]> = {
  1: [
    "{n}: This corridor has a pattern. It's our pattern. It's the logo.",
    "{n}: {m} says the vending machine on the last floor knows his coffee order.",
  ],
  2: [
    "{n}: Another crew's down here. Different logo. They're going the same way as us, a little ahead.",
    "{n}: Heard a radio that wasn't ours. A man was reading the Index out loud.",
    "{n}: Found a memo on the floor. It's addressed to {boss}. It's from {boss}.",
    "{n}: The Board's name is on the wall down here. As a sponsor.",
    "{n}: Somebody left a fruit basket. It's all the same fruit.",
  ],
  3: [
    "{n}: We're being waited for. Not in a mean way. Like a bus stop.",
    "{n}: The wheat is leaning toward the office. All of it, the same direction.",
    "{n}: {m} says the farmhouse smells like the break room. Like the break room did before it was damp.",
  ],
};

export const FINAL_RADIO = [
  "{n}: Wheat to the horizon. A light in the distance. It's on. It's always on.",
  "{n}: We've stopped asking whose idea this was. It's quieter.",
  "{n}: {m} is humming. It's the hum from the office. Nobody taught {m} the hum.",
  "{n}: There's a path. Someone mowed it. For us. Recently.",
  "{n}: The sun hasn't moved since we left. {boss}, I'd like that on the record.",
];

export const FINAL_ARRIVE = [
  "{n}: The farmhouse. Every light on. A table for the whole crew. And a place with {boss} on a card.",
  "{n}: The porch swing is still moving. There's a woman. She says she kept it warm.",
  "{n}: On the table, a logo carved into the wood. Ours. It looks older than the company.",
];

// --- Endings -----------------------------------------------------------------
export interface EndingDef {
  title: string;
  kicker: string;
  text: string[];
  quarter: { cash: number; floor: number; heat?: number; infection?: number; memo: string };
}

export const ENDINGS: Record<string, EndingDef> = {
  daylight: {
    title: "Severance",
    kicker: "You sat down. You ate. You walked out.",
    text: [
      "Supper was good. The woman asked after the company, and for once you did not have an answer prepared. She nodded as though that was the answer.",
      "At the back of the kitchen is a door. Behind it, rain. Real rain, on a real road. Your badge stops working as you step through. Behind you, the table has one fewer place set.",
      "Accounting sends a final cheque. It is for exactly what you are owed. It is the only exact thing that has ever happened to you.",
    ],
    quarter: { cash: 1500, floor: 1500, heat: 0, infection: 0, memo: "You are back. The Board has hired you as a consultant. You are consulting yourself. The rate is fair." },
  },
  promotion: {
    title: "Promoted",
    kicker: "The Board has a seat. It fits.",
    text: [
      "You answered every memo that asked. You kept the books healthy and the crews mostly alive. The Board noticed. The Board always notices.",
      "There is a chair at the head of the table. It has your name on a card, in your own handwriting, dated years ago. You sit. The farmhouse lights dim to a warm yellow and the hum becomes, briefly, a kind of applause.",
      "Your first act as the Board is to approve a target. You choose a number. It is higher than the last one.",
    ],
    quarter: { cash: 3000, floor: 3000, heat: 0, memo: "Welcome to the Board's side of the memo. Everything is the same, except you are now the reason the cheques clear." },
  },
  acquired: {
    title: "Acquired",
    kicker: "Derek was already at the table.",
    text: [
      "Derek is in the chair at the head of the table, with a fork in one hand and the paperwork in the other. \"Synergy,\" he says, and means it.",
      "Vance Exploratory Holdings has absorbed {company}. Your badges were reprinted overnight. They were printed already. Your crews' new lanyards are a better colour.",
      "You keep your desk. You keep the title. The title now has \"Regional\" in front of it.",
    ],
    quarter: { cash: 500, floor: 1000, memo: "Derek has rebranded {company} as a division. He still emails. The emails now come from inside the building." },
  },
  assimilated: {
    title: "Remote Work",
    kicker: "You never really left the office.",
    text: [
      "The farmhouse door opens onto your open-plan floor. Same carpet. Same hum. The desks are in the wheat, in rows, and everyone is typing.",
      "You realise the crew radio has been your voice for some time. The crew did not mind. They said you sounded rested.",
      "Your name is on a nameplate at every desk. You are, in a sense, fully staffed.",
    ],
    quarter: { cash: 500, floor: 800, infection: 45, memo: "You are back at your desk. The desk is back at you. Facilities says the air is \"mostly yours now.\"" },
  },
  audit: {
    title: "Inspected",
    kicker: "Hollis was the exit all along.",
    text: [
      "He is at the table, in the raincoat, with the clipboard. He has been waiting a long time and has had a lot of tea.",
      "\"You can go,\" says Inspector Hollis, \"in the sense that the form is complete.\" He stamps something. The stamp is a door.",
      "You walk out with a record. It lists every crew you sent and every one that did not come back. The charges are for a place that does not exist. You are advised to appeal.",
    ],
    quarter: { cash: -400, floor: 800, heat: 25, memo: "The fine has been paid from your account. Hollis has sent a card: SEE YOU SOON. It is a nice card." },
  },
  skeleton: {
    title: "Skeleton Crew",
    kicker: "Nobody came back up.",
    text: [
      "The lights in the farmhouse were on. The wheat did not move. The radio carried one long breath and then nothing.",
      "The Board sent its condolences with an invoice enclosed. HR has reposted every position. The flyer is unchanged.",
      "You sit at your desk with the hum. The hum is sorry. The hum has been sorry for some time.",
    ],
    quarter: { cash: 0, floor: 800, memo: "The Board has released a little seed money. It says \"for hiring.\" It does not say who." },
  },
  resigned: {
    title: "Notice Given",
    kicker: "You used the form.",
    text: [
      "You clear your desk. There is not much on it. You take the mug nobody touches. HR stamps the form, then stamps your forehead, then apologises.",
      "The front door opens onto a car park. It is daylight. It is a little too bright, the way a first day anywhere is.",
      "Your badge stops working behind you. You do not look back, which is the rule, and also the point.",
    ],
    quarter: { cash: 1000, floor: 1000, heat: 0, memo: "You came back. Everyone does. HR has already reprinted your badge. It is the old badge. It is warm." },
  },
  looped: {
    title: "Last Day (Again)",
    kicker: "The door led back to the office.",
    text: [
      "You hand in the form. You walk to the end of the hall and open the door. It is your office. The lights are off, and somebody is at your desk, typing your resignation.",
      "He looks up. He has your face and a better chair. \"Welcome aboard,\" he says. \"The carpet is new.\"",
      "You sit down. The hum is normal.",
    ],
    quarter: { cash: 500, floor: 800, infection: 45, memo: "Facilities says it is a new quarter. Facilities says it was always a new quarter." },
  },
};

// The order the endings are listed in, with locked slots for the unseen ones.
export const ENDING_ORDER = ["daylight", "promotion", "acquired", "assimilated", "audit", "skeleton", "resigned", "looped"];

export const QUARTER_MEMOS: { from: string; subject: string; body: string }[] = [
  { from: "The Board", subject: "Quarter {q}: the Board is pleased", body: "{boss},\n\nThe door is open again if you want it. Some people need the table more than once.\n\n- The Board" },
  { from: "HR", subject: "Quarter {q}: orientation", body: "Welcome back. Orientation is the same as last time. It is still in progress.\n\n- HR" },
  { from: "Facilities", subject: "Quarter {q}: the carpet", body: "The carpet has been replaced. It is the same carpet. It is newer, in a way.\n\n- Facilities" },
  { from: "Gary (Accounts)", subject: "Quarter {q}: the numbers", body: "Hi {boss}! Gary. The numbers are fine. They've always been fine. I'll let you know if they stop being fine.\n\nGary" },
];
