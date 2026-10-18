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
}

export function apps(_state: GameState): DesktopApp[] {
  const art = "./art/icons/";
  return [
    { id: "map", title: "Facility Map", icon: art + "U-map.png", w: 900, h: 560, render: renderExpedition },
    { id: "inbox", title: "Memo Inbox", icon: art + "U-envelope.png", w: 560, h: 380, render: renderInbox },
    { id: "feeds", title: "Feeds Wall", icon: art + "U-bodycam.png", w: 660, h: 460, render: renderFeeds },
    { id: "hr", title: "HR Roster", icon: art + "U-crew.png", w: 560, h: 520, render: renderHR },
    { id: "index", title: "The Index", icon: art + "U-magnifier.png", w: 640, h: 470, render: renderIndex },
    { id: "ledger", title: "Ledger", icon: art + "U-cash.png", w: 440, h: 480, render: renderLedger },
    { id: "lab", title: "Lab", icon: art + "U-sample-jar.png", w: 460, h: 360, render: renderLab },
    { id: "facilities", title: "Facilities", icon: art + "U-key.png", w: 560, h: 540, render: renderFacilities },
    { id: "handbook", title: "Employee Handbook", icon: art + "U-padlock.png", w: 500, h: 540, render: renderHandbook },
  ];
}
