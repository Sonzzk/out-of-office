// A second voice on the radio for every facility you have paid for. Each list is
// indexed by tier - 1 and heard from that tier up, so a better desk adds a line
// without taking the old ones away. Nothing here changes a rule.
export const FACILITY_LINES: Record<string, string[][]> = {
  dispatch: [
    ["Dispatch: Line two is lit. Line two was not lit a minute ago."],
    ["Dispatch: Three crews on the board. I have run out of pencils and not out of crews."],
    ["Dispatch: Four lines up. The fourth only breathes. I log it as a crew."],
    ["Dispatch: Five on the board. Somebody keeps adding a sixth name in my handwriting."],
  ],
  lab: [
    ["Lab: Bench is clear. Bring anything that still moves."],
    ["Lab: Two benches running. The jars are keeping each other company."],
    ["Lab: Third bench hums. I did not plug it in."],
    ["Lab: Four benches. One jar is facing the wall. I did not turn it."],
  ],
  mast: [
    ["Mast: Antenna's up. You're coming in clearer. So is everything else."],
    ["Mast: Signal's holding. We can wait for your answer. It won't wait long, but we can."],
    ["Mast: Somebody on the roof says the mast is leaning toward the exit. Our exit, I mean."],
    ["Mast: You are loud and clear. So is the thing behind you. Mast out."],
  ],
  security: [
    ["Security: Lobby is quiet. A man with a clipboard was told no comment."],
    ["Security: Turned away a gentleman from the city. He left a card. I put it in the shredder."],
    ["Security: Door camera caught him twice. Different coats, same face. Both turned away."],
    ["Security: Lobby is sealed. Nobody has asked me a question in days. I'm not sure that's good."],
  ],
  breakroom: [
    ["Break Room: Coffee's on for when you're back. It is always on."],
    ["Break Room: The couch has a dent shaped like you. Take your time."],
    ["Break Room: Vending machine just gave out a free snack. Nobody pressed anything."],
    ["Break Room: First aid kit is by the door. We put it there for you. Not for us."],
  ],
  floor2: [["Upstairs: Footsteps again. Whoever it is, they're pacing for you."]],
};

// Spoken by the Security Desk when a crew does not come back and the lobby holds.
export const SECURITY_HELD = "Security Desk kept the lobby shut. Nobody official got past the door.";
