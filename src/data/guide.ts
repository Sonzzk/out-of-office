// The Guide: a short how-to inside the Employee Handbook. Dry corporate voice,
// but every line here is true of the game as it runs.
export const GUIDE_JOKE = "Help is not available on this workstation. Have you tried working harder? (It is available. It is just below.)";

// The daily loop, as a strip of five steps. icon is a file in public/art/icons.
export const GUIDE_LOOP: { icon: string; label: string; app: string }[] = [
  { icon: "U-crew.png", label: "Hire", app: "HR Roster" },
  { icon: "U-map.png", label: "Plan", app: "Facility Map" },
  { icon: "U-radio.png", label: "Orders", app: "Facility Map" },
  { icon: "U-cash.png", label: "Sell", app: "Ledger" },
  { icon: "U-clock.png", label: "Close", app: "Ledger" },
];

export interface GuideSection {
  id: string;
  title: string;
  icon: string;
  lines: string[]; // each one a paragraph; **bold** marks the term being explained
}

export const GUIDE: GuideSection[] = [
  {
    id: "loop",
    title: "A day at the office",
    icon: "U-clock.png",
    lines: [
      "**Hire.** Open the HR Roster. Candidates change every morning. Desperate hires are sturdy, prisoners are cheap, clones are cheaper. Everyone costs a wage every night.",
      "**Plan.** Open the Facility Map, pick a level and click the dark to drop pins. The crew walks the pins in order, then comes home. More pins means more floor covered, more loot and more company. Buy gear first if you can afford it. It is used up on that run.",
      "**Orders and calls.** The crew radios the office. Calls are questions, and your answer changes what happens next. Between calls you can give an order: Hold, Push on, Pull back, or Distract (drop something for whatever is following). Orders have a cooldown.",
      "**Sell.** Whatever comes home sits in the Ledger. Sell it there. Prices move with the day's twist.",
      "**Close the books.** The button is at the bottom of the Ledger. It pays wages, starts a new day, deals a new hiring pool and sends the night's memos. A crew still out blocks it.",
    ],
  },
  {
    id: "crew",
    title: "Your people",
    icon: "U-nerve.png",
    lines: [
      "**Stats.** Navigation finds the way and the loot. Stealth avoids what lives in the dark. Medical keeps people alive when things go badly. Morale keeps them from panicking. Each is 0 to 6.",
      "**Quirks.** One is on the card. One is hidden until they have done something about it.",
      "**Levels.** Survive runs and a person gains experience and levels, and asks for a raise. Veterans are worth the raise. Nobody is worth the second funeral.",
    ],
  },
  {
    id: "heat",
    title: "Heat and Infection",
    icon: "U-heat.png",
    lines: [
      "**Heat** is how closely the outside world is watching. Deaths, wipes and selling Index data raise it. It cools a little every night. At 60% Legal warns you. At 100% an inspector fines you. The Ledger lets you donate to the inspector's retirement fund, which brings it down.",
      "**Infection** is the office itself going wrong (the Air figure in the tray). Deaths, research and overtime feed it, and past 20% it grows by itself. The memos get stranger, the dead keep writing, your name starts turning up in other people's sentences. A deep clean, also in the Ledger, pushes it back for a price. It does not go away. It waits.",
    ],
  },
  {
    id: "index",
    title: "The Index and the Lab",
    icon: "U-magnifier.png",
    lines: [
      "**The Index** is the company's field guide to everything down there. Entries go Seen, then Documented (how to survive it), then Mastered (what it really is). Surviving an encounter, surveying a level or bringing an item home all raise a stage.",
      "Documented and Mastered data can be sold to collectors, once per stage, for cash and a little Heat.",
      "**The Lab** researches one sample per bench. A finished sample moves its entry up, at the cost of some Infection. Facilities sells more benches.",
    ],
  },
  {
    id: "board",
    title: "The Board",
    icon: "U-document.png",
    lines: [
      "**The target.** The Ledger shows a fiscal target: an amount of cash in the bank by a deadline day. On that morning the Board checks the balance. Meet it and the next target is larger. Miss it and you get three more days and a memo with fewer adjectives.",
      "**Daily goal.** Each morning the Board sets a small goal (bring home finds, sell some loot, get crew home alive). Meet it and Accounting pays a bonus.",
      "**Contracts.** Now and then the Board offers a contract: hand over some of one item before a deadline for more than it is worth. At most two are open. They are optional. They are in the Ledger, with a Deliver button.",
      "**Twists.** Some mornings carry a twist, shown in the tray: a collector paying extra, a staffing sale, fog on every floor, or a quarter-end rush that doubles the goal. Plan around it.",
    ],
  },
  {
    id: "mail",
    title: "Memos and the rest",
    icon: "U-mail.svg",
    lines: [
      "Memos arrive in the Memo Inbox. A memo with a **Decide** tag needs an answer, and if you do not give one by the end of the day, a default is chosen for you. The routine ones (wages, the plaque) arrive as one daily digest.",
      "The Feeds Wall shows what the body cams saw. Facilities sells upgrades. Everything else is in the Start menu. The Board would like you to know that nothing here is a metaphor.",
    ],
  },
];
