import type { GameState } from "../sim/state";
import { renderExpedition } from "./expedition";
import { renderFacilities } from "./facilities";
import { renderFeeds } from "./feeds";
import { renderHandbook } from "./handbook";
import { renderHR } from "./hr";
import { renderInbox } from "./inbox";
import { renderIndex } from "./indexApp";
import { renderLab } from "./lab";
import { renderLedger } from "./ledger";
import type { AppDef } from "./windows";

export interface DesktopApp extends AppDef {
  icon: string;
  hint: string; // one line on what it is for, shown on hover
}

export function apps(_state: GameState): DesktopApp[] {
  const art = "./art/icons/";
  return [
    { id: "map", title: "Facility Map", icon: art + "U-map.png", hint: "Send crews into the Backrooms. Drop pins, give orders.", w: 900, h: 560, render: renderExpedition },
    { id: "inbox", title: "Memo Inbox", icon: art + "U-mail.svg", hint: "Memos from the Board, HR and the dead. Some need an answer.", w: 640, h: 400, render: renderInbox },
    { id: "feeds", title: "Feeds Wall", icon: art + "U-bodycam.png", hint: "Body cam feeds from the crews in the field.", w: 660, h: 460, render: renderFeeds },
    { id: "hr", title: "HR Roster", icon: art + "U-crew.png", hint: "Hire, train and keep track of your staff.", w: 560, h: 520, render: renderHR },
    { id: "index", title: "The Index", icon: art + "U-magnifier.png", hint: "The field guide: entities, levels and items. Sell the data.", w: 640, h: 470, render: renderIndex },
    { id: "ledger", title: "Ledger", icon: art + "U-cash.png", hint: "Sell loot, read the books, close the day.", w: 440, h: 480, render: renderLedger },
    { id: "lab", title: "Lab", icon: art + "U-sample-jar.png", hint: "Research samples to raise Index entries.", w: 460, h: 360, render: renderLab },
    { id: "facilities", title: "Facilities", icon: art + "U-key.png", hint: "Buy upgrades for the office.", w: 560, h: 540, render: renderFacilities },
    { id: "handbook", title: "Employee Handbook", icon: art + "U-padlock.png", hint: "The Guide (how to play), settings and your save file.", w: 500, h: 540, render: renderHandbook },
  ];
}
