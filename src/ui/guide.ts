import { GUIDE, GUIDE_JOKE, GUIDE_LOOP } from "../data/guide";
import { esc } from "./dom";
import "./guide.css";

// **bold** in the guide text marks the term being explained.
const rich = (line: string) => esc(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

// The Guide tab of the Employee Handbook: a how-to with a picture of the loop.
export function renderGuide(el: HTMLElement): void {
  el.innerHTML = `
    <p class="dim">${esc(GUIDE_JOKE)}</p>
    <ol class="loop-strip" aria-label="The daily loop">${GUIDE_LOOP.map(
      (s, i) => `<li><img src="./art/icons/${s.icon}" alt=""><b>${i + 1}. ${esc(s.label)}</b><span class="dim">${esc(s.app)}</span></li>`,
    ).join("")}</ol>
    ${GUIDE.map(
      (g) => `<section class="guide-sec inset"><h4><img src="./art/icons/${g.icon}" alt="">${esc(g.title)}</h4>${g.lines.map((l) => `<p>${rich(l)}</p>`).join("")}</section>`,
    ).join("")}`;
}
