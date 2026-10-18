// Overnight events: a memo with a choice. Unanswered ones resolve with their
// default when the books close. {vars} are filled when the event is rolled.
export interface EventDef {
  id: string;
  from: string;
  subject: string;
  bodies: string[]; // picked by how many times this event has happened before
  choices: string[];
  fallback: number; // the choice made if the boss never answers
  cooldown: number; // days before it can happen again
}

export const EVENTS: Record<string, EventDef> = {
  inspector: {
    id: "inspector",
    from: "Front Desk",
    subject: "Inspector Hollis is in the lobby",
    bodies: [
      "A man in a beige raincoat is in the lobby. He says he is Inspector Hollis, from a department he wouldn't name, and he would like to \"have a look around.\"\n\nHe has a clipboard. The clipboard has our name on it.",
      "Inspector Hollis is back. He says he \"was in the neighbourhood.\" We are not in a neighbourhood.\n\nHe asked about the door marked OVERTIME.",
      "Hollis again. He brought his own chair this time. He says the last visit \"raised questions.\"",
      "Hollis is here. He knows the receptionist's name. We don't know the receptionist's name.",
    ],
    choices: ["Give him the full tour", "Coffee and an envelope ({bribe})", "Tell him we're closed"],
    fallback: 2,
    cooldown: 3,
  },
  lawsuit: {
    id: "lawsuit",
    from: "Legal",
    subject: "We are being sued (re: {name})",
    bodies: [
      "The family of {name} has filed a wrongful death suit. They are asking for {amount}.\n\nOur position is that {name} signed the waiver. Their position is that the waiver was written in a language that does not exist.\n\n- Legal",
    ],
    choices: ["Settle quietly ({amount})", "Fight it in court", "Ignore it"],
    fallback: 2,
    cooldown: 0,
  },
  outage: {
    id: "outage",
    from: "Facilities",
    subject: "Power is out on every floor",
    bodies: [
      "The power went out overnight. The hum did not stop. We are choosing not to think about that.\n\nWe can rent a generator for the day, or the crews can go in with what light the levels give them.\n\n- Facilities",
    ],
    choices: ["Rent a generator ({cost})", "Work in the dark today"],
    fallback: 1,
    cooldown: 4,
  },
  vending: {
    id: "vending",
    from: "Break Room Vending Unit",
    subject: "A message from the vending machine",
    bodies: [
      "HELLO {boss}. I HAVE BEEN WATCHING THE BREAK ROOM. NOBODY FEEDS ME.\n\nI HAVE SOMETHING SPECIAL TODAY. IT IS NOT ON THE MENU. NOTHING IS ON THE MENU.",
      "HELLO AGAIN {boss}. I REMEMBER YOU. I REMEMBER EVERYONE.\n\nI HAVE SOMETHING FOR YOU. IT COSTS MONEY. EVERYTHING COSTS MONEY.",
      "{boss}. I HAVE MOVED. I AM NOW SIX INCHES TO THE LEFT. NOBODY SAW ME DO IT.\n\nBUY SOMETHING.",
    ],
    choices: ["Feed it {cost}", "Unplug it", "Ignore it"],
    fallback: 2,
    cooldown: 3,
  },
  rival: {
    id: "rival",
    from: "Derek Vance, CEO, Vance Exploratory Holdings",
    subject: "An offer for {name}",
    bodies: [
      "{boss},\n\nI'll be blunt, because I respect you. Not much, but some.\n\nI want {name}. I'll pay {price} for their contract, today. They'd be happier with us. We have a window.\n\nThink it over. Or don't. I've already printed their badge.\n\nDerek",
      "{boss},\n\nMe again. You may have noticed our crews on Level 0. We're everywhere now.\n\nI'll take {name} off your hands for {price}. Final offer. My offers are always final until the next one.\n\nDerek",
    ],
    choices: ["Sell their contract (+{price})", "Decline"],
    fallback: 1,
    cooldown: 4,
  },
  gary: {
    id: "gary",
    from: "Gary (Accounts)",
    subject: "Hi from Accounts!",
    bodies: [
      "Hi {boss}!\n\nGary here, from Accounts. I don't think we've met. I've been here a long time.\n\nI noticed the books are a bit of a mess. I'd love to help. I'm very good with numbers. I know all of them.\n\nGary",
      "Hi {boss}!\n\nGary again. HR says I don't work here. That's so funny. I have a desk. It's under the other desks.\n\nWant me to look at the books again?\n\nGary",
      "{boss}.\n\nIt's Gary. I've been counting the employees. The number keeps changing. It's fine. I'll keep counting.\n\nThe books, though?\n\nGary",
    ],
    choices: ["Let Gary do the books", "Report Gary to HR"],
    fallback: 1,
    cooldown: 4,
  },
};

export const VENDING_FEED = 50;
export const VENDING_PRIZES = ["almond-water", "candy", "royal-ration", "dumb-gum"];
export const GENERATOR_COST = 150;
export const GARY_PAY = 200;
