// Office infection. Cruelty and bringing things back from Level 0 feed it;
// past the first stage it also grows on its own. {boss}, {phrase} and
// {company} are filled in when shown, so they use whatever name you signed with.
export const STAGES = [0, 20, 40, 60, 80]; // infection needed for each stage

export const STAGE_MEMOS = [
  null,
  {
    from: "Facilities",
    subject: "The smell",
    body:
      "Several employees have reported a smell like wet carpet near the break room. There is no carpet in the break room.\n\n" +
      "Facilities has placed an air freshener. The air freshener is now also damp.\n\n- Facilities",
  },
  {
    from: "{boss}",
    subject: "Note to self",
    body:
      "Remember to check the door at the end of the hall.\n\nRemember that you already checked it.\n\nRemember that it was open.\n\n- {boss}",
  },
  {
    from: "HR",
    subject: "Re: \"{phrase}\"",
    body:
      "Staff have started saying \"{phrase}\" to each other in the hallway. Nobody remembers who said it first.\n\n" +
      "It is on the whiteboard in the break room. Nobody wrote it. It is in your handwriting.\n\n- HR",
  },
  {
    from: "Level 0",
    subject: "{boss}",
    body: "{boss}.\n\n{boss}.\n\nWe can see the office from here. It looks just like ours.\n\nCome in. The carpet is new. The hum is normal.",
  },
];

// Radio lines that start turning up once the office is infected.
export const INFECTED_RADIO = [
  "{n}: {boss}? Is that you on the channel? Someone keeps breathing.",
  "{n}: Found a desk down here with your nameplate on it, {boss}.",
  "{n}: {m} says they saw you in the hall a minute ago, {boss}. You were waving.",
  "{n}: Someone wrote \"{phrase}\" on the wall. Fresh paint.",
  "{n}: The muzak down here is playing the hum from your office.",
  "{n}: Your voice just came out of the wall. It said we did great.",
  "{n}: There's a memo pinned up. It's addressed to {m}. It's signed with your name, {boss}.",
  "{n}: {boss}, we can see the office through the ceiling. It's looking up at us.",
  "{n}: The carpet here matches the carpet in your office. Down to the stain.",
  "{n}: Whoever's on the channel with us isn't {boss}. Sounds a lot like {boss}.",
  "{n}: Found your coffee mug, {boss}. Still hot. Down here.",
];

// Memos from people who are not coming back. {name}, {first}, {words} (their last
// words), {skill} (what they were best at), {quirk} (what HR had on file), {rank}
// (the level they died on), {day} (the day they died), {boss}. They escalate: tier 0
// is small talk, tier 1 is the office noticing the dead, tier 2 is about the Exit.
export interface DeadMemo {
  tier: 0 | 1 | 2;
  subject: string;
  body: string;
}

export const DEAD_MEMOS: DeadMemo[] = [
  { tier: 0, subject: "Re: Re: lunch", body: "Hi {boss}. Nobody told me the lunch order changed.\n\nI'm at my desk. I'm always at my desk. The chair is warm.\n\n- {name}" },
  { tier: 0, subject: "Timesheet", body: "I've filled in my timesheet for the days I wasn't there. They add up to more than the days there were.\n\nFor the record, I logged my {skill} at the highest rate. Please approve.\n\n- {name}" },
  { tier: 0, subject: "Quick question", body: "Is the carpet supposed to move? Asking for a friend.\n\nThe friend is also me.\n\n- {name}" },
  { tier: 0, subject: "Out of office (auto-reply)", body: "{name} is out of office until further notice.\n\n\"{words}\"\n\nIf your matter is urgent, please come down. We are all here." },
  { tier: 0, subject: "Re: Your performance review", body: "HR says my file still lists me as \"{quirk}\". I'd like that updated.\n\nIt was true on the day. It is not true now. Nothing is, down here, which is restful.\n\n- {name}" },
  { tier: 1, subject: "My badge still works", body: "I swiped in this morning. The door took it. Nobody looked up.\n\nI died on Day {day}, {boss}. I checked. It says so on the plaque. I am at my desk anyway.\n\n- {name}" },
  { tier: 1, subject: "Re: {first}'s last words", body: "You had my last words laminated. They read: \"{words}\".\n\nI would like to correct the record. That was not the last thing I said. It is the last thing I said to you.\n\n- {name}" },
  { tier: 1, subject: "Skills inventory", body: "Facilities asked for a skills inventory of the break room. I listed myself under {skill}.\n\nThey wrote back: \"Noted. Needed.\" I do not know what for.\n\n- {name}" },
  { tier: 1, subject: "Level {rank} ID card", body: "They reissued my card. It says Level {rank}. It is the level I was when I stopped.\n\nThe lanyard fits. It has been fitted. I did not stand for the fitting.\n\n- {name}" },
  { tier: 1, subject: "Is {first} still on payroll?", body: "Payroll says yes. Payroll has always said yes.\n\nI keep getting the {quirk} newsletter. I am the only subscriber. I am also the only author.\n\n- {name}" },
  { tier: 2, subject: "See you at the 3 o'clock", body: "Reminder: the 3 o'clock is mandatory. Attendance is tracked. Everyone's coming.\n\nBring {boss}.\n\n- {name}" },
  { tier: 2, subject: "The door at the end of the wheat", body: "There is a farmhouse. All the lights are on. There is a table. I have been laying places since Day {day}.\n\nYours has a card. It is in your handwriting. Come when you are ready, {boss}. Or when the Board says.\n\n- {name}" },
  { tier: 2, subject: "Exit interview (mine)", body: "HR held my exit interview on Day {day}. I answered every question. \"{words}\" was the answer to the last one.\n\nThey said it was the right answer. They said it was the only one. They said you would give it too.\n\n- {name}" },
  { tier: 2, subject: "Your desk", body: "We moved your desk down here. The {skill} was always going to be needed, and so were you.\n\nThe hum is lovely at this depth. Come and hear it, {boss}.\n\n- {name}" },
];

// The radio answers before you have. {boss}, {phrase}, {n}.
export const ECHO_LINES = [
  "{n}: Your answer came through before you pressed anything, {boss}. In your voice. \"{phrase}\".",
  "{n}: We heard you say it, {boss}. Then we heard you say it again, a little later, a little wetter.",
  "{n}: The radio replied in your voice. Word for word. Ahead of you.",
];

export const TITLE_AWAY = ["{boss}, come back", "Out of Office (1)", "We're still here, {boss}", "Don't close this tab"];

export const DEEP_CLEAN_COST = 300;
export const DEEP_CLEAN_AMOUNT = 15;

// How coworkers behave once the office is infected (shown on their HR card).
export const ODD_MOODS = [
  "Looks at you a half-second too long.",
  "Has started wearing your lanyard.",
  "Hums the muzak without hearing it.",
  "Says good morning at night.",
  "Has not blinked in the meeting. The meeting ended an hour ago.",
  "Keeps straightening a desk that is not theirs.",
];

// Lines that creep onto the end of a warped memo, by stage.
export const MEMO_INTRUSIONS = [
  "Come in.",
  "Please do not look up.",
  "The door is open. It was always open.",
  "We are very proud of you, {boss}.",
];
