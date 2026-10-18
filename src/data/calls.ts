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
}

export const CALL_TICKS = 18;
export const VENDING_PRICE = 40;

export const CALLS: CallDef[] = [
  { id: "closet", text: "{n}: There's a locked supply closet. We can force it, but it'll be loud.", options: ["Force it", "Leave it"], fallback: 1 },
  { id: "phone", text: "{n}: A phone is ringing in an empty office. Do we pick up?", options: ["Answer it", "Ignore it"], fallback: 1 },
  { id: "ankle", text: "{n}: {m} twisted an ankle. They can limp, but it slows us down.", options: ["Bring everyone home", "Keep going"], fallback: 1, needs: "pair" },
  { id: "vending", text: "{n}: Vending machine. Takes company cards. Want anything? It's {price}.", options: ["Buy something", "No snacks"], fallback: 1 },
  { id: "farmhouse", text: "{n}: A farmhouse with every light on. A woman on the porch waves us in for supper. Go in?", options: ["Go in", "Keep walking"], fallback: 1, only: "level-10" },
  { id: "rival", text: "{n}: Another crew down here. Different logo. They'll pay cash for what we're carrying.", options: ["Trade", "Refuse"], fallback: 1, needs: "loot" },
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
};
