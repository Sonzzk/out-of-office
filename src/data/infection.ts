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
