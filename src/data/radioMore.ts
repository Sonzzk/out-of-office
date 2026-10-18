// More radio. The first release had eight ambient lines and one line for coming
// home, which a crew said out loud within a single session. This file is the
// rest: lines by level, by mood, by what the crew carries, and by how the run
// went. {n} is the speaker, {m} someone else, {item} the best thing carried,
// {day} the day. Nothing here changes a rule; it only changes what you hear.

// What a crew says about the floor they are on. Keyed by level id.
export const LEVEL_AMBIENT: Record<string, string[]> = {
  "level-0": [
    "{n}: Yellow. Everything is yellow. I'm starting to taste it.",
    "{n}: The hum has a key. It's B flat. Don't tell me which B flat.",
    "{n}: Fluorescent tubes, every four meters. Somebody counted. It was me.",
    "{n}: Wallpaper's peeling in a pattern. I think it's a map. Of the wallpaper.",
    "{n}: I keep seeing the same exit sign. It points at a wall.",
    "{n}: There's a ceiling tile missing. I'm not looking up. You can't make me.",
  ],
  "level-1": [
    "{n}: Shelves up to the ceiling. Every box is labelled 'MISC'.",
    "{n}: Forklift's still warm. Nobody's driving it.",
    "{n}: Aisle 14. Aisle 14. We were just in Aisle 14.",
    "{n}: The inventory sheet lists us. Under 'perishable'.",
    "{n}: It's so quiet in the stacks I can hear the boxes breathing.",
    "{n}: Found a pallet of staplers. Hundreds. All jammed.",
  ],
  "level-2": [
    "{n}: It's like a sauna with opinions down here.",
    "{n}: Pipes knock. I swear they knock in threes.",
    "{n}: Steam just said my name. I'd like to go up now.",
    "{n}: Every valve is labelled. None of the labels match the pipes.",
    "{n}: My radio's sweating. Is that possible?",
    "{n}: Something is running the water. Somewhere. Constantly.",
  ],
  "level-3": [
    "{n}: Machines humming in unison. Is it a hymn?",
    "{n}: There's a control panel with one button. It says 'DO NOT'.",
    "{n}: Everything here is warm like it was just used.",
    "{n}: The conveyor belt is moving. Nothing is on it. Yet.",
    "{n}: I can feel the floor vibrating through my boots.",
    "{n}: Gauge says 'NORMAL'. It has said 'NORMAL' since we got here. I don't trust it.",
  ],
  "level-4": [
    "{n}: Open plan. So open. Nobody's at any desk and every chair is warm.",
    "{n}: Monitors all on, all showing the same spreadsheet. It has our names.",
    "{n}: There's a motivational poster. It says 'STAY'. That's the whole poster.",
    "{n}: Somebody's lunch is still on a desk. It's today's date.",
    "{n}: A phone is ringing on every desk. In order. Along the row. Toward us.",
    "{n}: There's a meeting in the glass room. Nobody in it. Everyone's name on the door.",
  ],
  "level-5": [
    "{n}: Hotel carpet, wallpaper, the smell of a hundred different perfumes. It's lovely. Why is it lovely?",
    "{n}: Room 214 has a Do Not Disturb sign. On the inside.",
    "{n}: The lobby music is the hum again. With violins.",
    "{n}: There's a fruit bowl at every turn. The fruit is wax. We checked. Twice.",
    "{n}: Front desk bell rang by itself. We should go.",
    "{n}: Somebody left a tray outside 220. Two plates. One is ours.",
  ],
  "level-6": [
    "{n}: Can't see my own hand. I'm holding my hand. It's there. Probably.",
    "{n}: Lights are all dead. The dead lights hum anyway.",
    "{n}: Walking by the wall. If the wall stops, I'm going to say something.",
    "{n}: Did anyone just breathe on my neck? Anyone? Don't all say no.",
    "{n}: The dark here is thick. You push through it.",
    "{n}: Something clicks along the ceiling, in time with our steps. In time, then not.",
  ],
  "level-7": [
    "{n}: Knee-deep. The water's warm. I wish it were cold. Cold I'd understand.",
    "{n}: There are fish in the carpet. Just saying.",
    "{n}: Every ripple is going the wrong way.",
    "{n}: A photocopier is floating past us. Still copying.",
    "{n}: Water in my boots. Mine are full. {m}'s are full. We're all full.",
    "{n}: There's an island of dry floor ahead. It has a desk. It has a lamp. It's on.",
  ],
  "level-8": [
    "{n}: Vending machines in a cave. Microwaves like stalagmites.",
    "{n}: I found a break room with a fridge. The fridge has a staff memo from 1994.",
    "{n}: Everything smells like popcorn. Nobody's making popcorn.",
    "{n}: There's a coffee machine that's been dripping since before we hired anyone.",
    "{n}: Every stalagmite has a label. Names. Dates. Somebody was thorough.",
    "{n}: A microwave just beeped. We're all standing here. Nobody touched it.",
  ],
  "level-9": [
    "{n}: Street lamps, parked cars, every window lit. Nobody home. Everyone home.",
    "{n}: There's a sprinkler running. It's 3 AM. It's always 3 AM.",
    "{n}: A dog barked in a house. I think it was a dog.",
    "{n}: That's a bike on the lawn. There's a kid's name chalked on the driveway. It's {m}'s.",
    "{n}: The TV in the front room is on. It's showing this street. Us on it.",
    "{n}: Every mailbox has your name on it, {boss}. Every one.",
  ],
  "level-10": [
    "{n}: Wheat. As far as I can see. In every direction. The sun is not moving.",
    "{n}: It's quiet. A good quiet. I hate it.",
    "{n}: The road is gone. We walked off it ten minutes ago.",
    "{n}: There's a scarecrow ahead. It's pointing at us, not the crows.",
    "{n}: I could just lie down here. {m} says no. I'm not so sure.",
    "{n}: The wheat's rustling against the wind.",
  ],
};

// A longer list for everywhere, so a crew is not stuck with the same eight.
export const AMBIENT_EXTRA = [
  "{n}: This corridor smells like a breakroom that's given up.",
  "{n}: I think {m} just whispered something. {m} says no.",
  "{n}: Do we get lunch for this? Asking on {m}'s behalf. {m} is very hungry.",
  "{n}: There's a stain on the ceiling shaped exactly like the stain on the floor.",
  "{n}: The air is too still. Like a held breath.",
  "{n}: Found a door that wasn't on the map. It opened onto another door.",
  "{n}: Stapler. Just one stapler, in the middle of the hall. Not touching it.",
  "{n}: My watch says 3:07. It's been saying 3:07 since we got in.",
  "{n}: Everyone's still here. I counted. Twice. Same number. Probably the same people.",
  "{n}: There's a hum in my teeth now.",
  "{n}: Corridors keep going. Are corridors supposed to keep going?",
  "{n}: Was that a footstep or an echo? Either's bad.",
  "{n}: A clipboard on the floor. The list on it is our names. All crossed out. Except ours.",
  "{n}: It's like walking through an old photo of a place you've never been.",
  "{n}: Found a plant. A real one. It leaned toward us. We leaned back.",
  "{n}: I think I can hear a coworker. Doing a presentation. Far away.",
  "{n}: Air conditioning's on. It's blowing warm. It sounds like a sigh.",
  "{n}: Lost my sense of direction again. Don't tell the boss. Hi boss.",
  "{n}: Another hallway. At this point I'd settle for a staircase.",
  "{n}: My boots keep sticking to the carpet. Like the carpet doesn't want us to leave.",
];

// When something has already gone wrong on this run.
export const TENSE = [
  "{n}: Keep your voices down. Keep your eyes up.",
  "{n}: Nobody say it. Nobody say what we're all thinking.",
  "{n}: I'm not scared. I'm just awake in a very specific way.",
  "{n}: Stay close. Count off every minute. One. Two. Three.",
  "{n}: My heart is doing something my training doesn't cover.",
  "{n}: Just a little farther. Then we turn around. Promise.",
  "{n}: Whatever that was, it's still out there. Walking.",
  "{n}: {m}, you're shaking. Is that your hand or the building?",
  "{n}: I want to go home. I want to go home. I want to go home. Sorry. Radio check.",
  "{n}: If we do this quietly, nothing has to know.",
];

// When the crew is carrying something. {item} is the best thing they have.
export const CARRYING = [
  "{n}: This {item} is heavier than it should be. Or I'm weaker than I thought.",
  "{n}: Got the {item} in my bag. Don't look at it. It looks back.",
  "{n}: If we get home with this {item}, I'm asking for a raise.",
  "{n}: Is it normal for a {item} to be warm?",
  "{n}: The {item} is making a noise. Quiet. Like it's thinking.",
  "{n}: {m}, guard the {item}. Don't put it down. I mean it.",
  "{n}: I'd like it noted that I'm carrying the {item} and nobody's thanked me.",
  "{n}: Let's get the {item} to the Ledger before it changes its mind.",
];

// Running jokes: they come up in order as the days go by.
export const RUNNING_JOKES: { fromDay: number; lines: string[] }[] = [
  { fromDay: 1, lines: ["{n}: That water stain again. It's a stain. It's just a stain.", "{n}: {m} says the stain looks like a face. {m} should stop saying that."] },
  { fromDay: 4, lines: ["{n}: The stain's bigger than yesterday. It's reaching.", "{n}: The stain is definitely a thumb now."] },
  { fromDay: 9, lines: ["{n}: The stain is waving. I'm waving back. This is fine.", "{n}: The stain has a name. {m} gave it a name. It answers to it."] },
  { fromDay: 14, lines: ["{n}: Remember the dog thing? The dog thing remembers us.", "{n}: Heard barking from the exact corridor we left yesterday. Hello, dog thing."] },
  { fromDay: 20, lines: ["{n}: I filed a complaint about the hum. The hum filed one back.", "{n}: HR says the hum is a 'workplace environment feature'. They said it in unison."] },
];

// Coming home, by how the run went. The default is the old line.
export const HOME_CLEAN = [
  "{n}: Back at the door. Nothing followed us. That's the scariest part.",
  "{n}: Home. No incidents. I'd like that on my review, please.",
];
export const HOME_RICH = [
  "{n}: Back with the goods. Cash register's gonna be happy. Is that a thing registers do?",
  "{n}: Home, and we're carrying. Worth every blister.",
];
export const HOME_EMPTY = [
  "{n}: Home. Empty-handed. At least we're still handed.",
  "{n}: Nothing to show for it but the stories. Don't ask for the stories.",
];
export const HOME_SHAKEN = [
  "{n}: Home. I'm not going to talk about it. Ask me tomorrow. Don't ask me tomorrow.",
  "{n}: Made it. {m} hasn't said a word since the last hallway.",
];
export const HOME_COSTLY = [
  "{n}: We're out. We're not all here. I'll say who in the debrief.",
  "{n}: Back at the door. Count us again. Please count us again.",
];
export const HOME_LATE = [
  "{n}: That was a long one. My feet have opinions.",
  "{n}: Home. It's later than it should be. Everywhere.",
];

// Extra entity lines, merged with each entity's own. Keyed by entity id.
export const SPOTTED_MORE: Record<string, string[]> = {
  smiler: ["{n}: Two eyes and a grin. Hanging there. No body.", "{n}: Teeth, in the dark. Lots of them. They're getting closer.", "{n}: I think it's smiling at {m}. {m} is smiling back. That's worse."],
  hound: ["{n}: Claws on the tile. Slow. Patient. It knows where we are.", "{n}: Something's walking just behind us. On four legs. On two. On four.", "{n}: It's picked someone. Don't wander."],
  faceling: ["{n}: It's got no face. It's pointing at ours. Politely.", "{n}: It's just standing there. In a tie. Without a face. Waiting for a handshake.", "{n}: Don't talk to it. Don't be rude to it. Don't anything it."],
  partygoer: ["{n}: Streamers. In the hallway. Somebody put up streamers.", "{n}: They've got a cake. It says '{m}' on it. {m}'s not saying anything.", "{n}: Party music. Muffled. Like it's in the next room, then the next."],
  "skin-stealer": ["{n}: Which of you is {m}? Two of you are. Don't answer.", "{n}: Ask everyone a question only they'd know. Quietly.", "{n}: That doesn't look right. That doesn't walk right."],
  deathmoth: ["{n}: Dust on the lights. The dust has wings.", "{n}: They're drawn to the flashlight. Turn it off. Turn it off!", "{n}: A paper-thin sound. Hundreds of them. Overhead."],
  clump: ["{n}: Very big. Very slow. Very there.", "{n}: It's slow. It doesn't need to be fast.", "{n}: Hands. Lots of hands. None of them are waving."],
  wretch: ["{n}: Gray. Torn uniform. It looks like us, in a few years.", "{n}: A badge on its jacket. Our logo. A very old logo.", "{n}: It's shuffling. It's holding a clipboard. It's checking us off."],
  duller: ["{n}: Something blurry in the hall. I can't recall what blurry was.", "{n}: I had a point. It was important. It was a good point.", "{n}: Everyone keep talking. Out loud. What day is it? Say it."],
  dunk: ["{n}: Little thing in the water. Following the bags.", "{n}: It's looking at the loot like a cashier.", "{n}: Hold your bags. Hold them close. Do not trust anything wet."],
  dollface: ["{n}: A doll on a shelf. Smiling. I don't like that it's smiling.", "{n}: Don't turn around. Don't turn around. Don't — ugh.", "{n}: There are more dolls than before."],
  "death-rat": ["{n}: Squeaking inside the walls. Getting louder. Not getting farther.", "{n}: Red eyes under the shelves. Dozens of them.", "{n}: Whatever you do, don't drop food."],
  "light-guide": ["{n}: A friendly light. Following us. It's not hurting anyone.", "{n}: It's humming a note. A nice note. It's pointing somewhere.", "{n}: The little light seems glad to see us."],
  "warning-kite": ["{n}: Kite. It's tugging at the string like it's trying to warn us.", "{n}: Paper kite. Floating in a dead-air hallway. It wants us to turn.", "{n}: I'll take a hint from a kite. Slowing down."],
  mother: ["{n}: The walls are singing. A low note. Very warm.", "{n}: She's huge. She's coming. She's humming the muzak.", "{n}: Every wall is leaning in. Every wall is warm."],
  window: ["{n}: A window. Not a window. A window that shows my kitchen.", "{n}: Don't look at the window. Don't look at the window. It's looking at us.", "{n}: Someone just waved from the other side of the glass. It wasn't anyone I know."],
  crawler: ["{n}: Something just ran on the ceiling. And the floor. At the same time.", "{n}: Fast. Scratchy. It's in the vents above us.", "{n}: It's playing with us. Like it knows the pipes."],
  anna: ["{n}: Little girl. Asking for {boss} by name. Very politely.", "{n}: Don't ask her where her parents are. Don't ask her anything.", "{n}: She's smiling. She's holding a drawing of the office."],
  humans: ["{n}: People. They're armed. They're trying to look friendly.", "{n}: Another crew. Different uniform. They look like us, three years from now.", "{n}: They want to talk. About what we're carrying."],
  chupavida: ["{n}: Something's tired in the dark. I feel it from here.", "{n}: My legs feel like they're sinking. Is it the carpet or is it it?", "{n}: It's a thirst. I can feel it thirsting."],
};

export const PASSED_MORE: Record<string, string[]> = {
  smiler: ["{n}: It turned away. I don't know why. I'm not asking.", "{n}: Gone. That grin is on the back of my eyelids now."],
  hound: ["{n}: It backed off. It's circling. Keep moving.", "{n}: Okay. Okay. It decided it didn't want us. For now."],
  faceling: ["{n}: It shook my hand. It's gone. Hand's cold.", "{n}: It tipped its head and moved on. Polite."],
  partygoer: ["{n}: We said no thank you. They said 'next time'.", "{n}: The music faded. I still feel like I owe somebody a gift."],
  "skin-stealer": ["{n}: Counted heads. We're us. All of us. I think.", "{n}: It's gone. Whatever it was, it's wearing someone else now."],
  deathmoth: ["{n}: Lights off. They drifted away. Don't turn them on yet.", "{n}: Wings. Then silence. Then more silence."],
  clump: ["{n}: We outwalked it. We always outwalk it. That's how it gets you.", "{n}: Slow, so slow. We're past. Don't look back."],
  wretch: ["{n}: It looked at us, then at its clipboard, then walked away.", "{n}: It's let us pass. The name tag said 'ME'."],
  duller: ["{n}: What happened? I'm fine. We're fine. We were going somewhere.", "{n}: I've forgotten something. Let's keep going."],
  dunk: ["{n}: Bag's still here. Counting items. Still here.", "{n}: It slid off. Nothing taken. This time."],
  dollface: ["{n}: Didn't look. Didn't look. We're good. Didn't look.", "{n}: It's behind us now. We're not turning around."],
  "death-rat": ["{n}: The squeaking moved away. We kept every finger.", "{n}: Rats. Gone. For now, rats."],
  "light-guide": ["{n}: It circled us once and drifted off. I wanted it to stay.", "{n}: Good little light. Safe travels."],
  "warning-kite": ["{n}: The kite bobbed once and floated away. Thanks, kite.", "{n}: It's gone. We listened. That's why we're fine."],
  mother: ["{n}: We held our breath. Singing stopped. We exhaled.", "{n}: She didn't notice us. She noticed something. It wasn't us."],
  window: ["{n}: We walked on. We didn't look. We aren't looking now.", "{n}: Closed. I swear it wasn't open before."],
  crawler: ["{n}: Scratching faded. We're not cheering.", "{n}: It's lost interest. Or it's setting up."],
  anna: ["{n}: She waved goodbye. She'll see {boss} soon, she said.", "{n}: She let us go. She kept the drawing."],
  humans: ["{n}: They let us go. They'll be back. Different faces.", "{n}: Peaceful. Mostly. We paid in goodwill."],
  chupavida: ["{n}: We got out of its range. Everyone's exhausted. Everyone's alive.", "{n}: Slept on my feet for a second. Anyone else?"],
};

export const LOOT_MORE = [
  "{n}: {item}. I'm calling dibs on the credit.",
  "{n}: Behind a door nobody wanted to open: a {item}.",
  "{n}: We have a {item}! Bag it, bag it, bag it.",
  "{n}: There's a {item} here. Sitting. Like it was waiting for a delivery.",
];

export const ARRIVE_MORE = [
  "{n}: Your pin is a room. The room is empty. Why did you pin an empty room?",
  "{n}: At the pin. There's a chair. Facing the corner. Should we sit in it?",
  "{n}: This is the spot. It feels like the spot. It also feels like a trap.",
  "{n}: We're here. There's nothing here. Which is where the nothing was.",
];

export const RETREAT_MORE = [
  "{n}: This is a bad idea. We're going back. You can fire me from the door.",
  "{n}: That's enough. Everyone, hands on a wall, we're heading out.",
  "{n}: Calling it. Next trip's a different hallway.",
];

export const SAMPLE_MORE = [
  "{n}: Got a clean sample. Please tell the lab it's still warm.",
  "{n}: Scraped a little of it into a jar. The jar's whispering.",
  "{n}: Took a swab. Don't ask how. Don't ask where.",
];

export const LOST_MORE = [
  "{n}: Okay. We're not lost. We're exploring a loop.",
  "{n}: That door wasn't there when we came past. That door's very smug about it.",
  "{n}: I'd say left. {m} would say right. The hallway says both.",
];

// How a team lead checks in at the start of a run.
export const OPENERS = [
  "{n}: Team lead here. Going in.",
  "{n}: Radio check. We're through the door.",
  "{n}: Lead here. Everyone's got their bag. Moving.",
  "{n}: Heading in. If I don't call back, it's the carpet.",
  "{n}: Clocking in. Again. Morning, everyone.",
  "{n}: We're in. Same smell as last time. Different hallway.",
  "{n}: Entering now. Keep the line open, boss.",
];
