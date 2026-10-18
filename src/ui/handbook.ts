import { isPrivate, isStreamer, setPrivacy, setStreamer } from "../privacy";
import { update } from "../store";
import { refreshCalm } from "./uncanny";

// The Employee Handbook: the two settings that decide how much the office may
// know about you.
export function renderHandbook(body: HTMLElement): void {
  body.classList.add("handbook");
  const paint = () => {
    body.innerHTML = `
      <p class="dim">Employee Handbook, section 9: Your Privacy. Nothing here ever leaves this browser.</p>
      <label class="opt inset"><input type="checkbox" data-opt="privacy" ${isPrivate() ? "checked" : ""} ${isStreamer() ? "disabled" : ""}>
        <span><b>Employee privacy</b><br><span class="dim">On: the office knows nothing about the real world. Off: it may notice your local time and how long you have been at your desk.</span></span></label>
      <label class="opt inset"><input type="checkbox" data-opt="streamer" ${isStreamer() ? "checked" : ""}>
        <span><b>Streamer mode</b><br><span class="dim">Hides the name you signed with, keeps privacy on and tones the scares down.</span></span></label>`;
  };
  body.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.opt === "privacy") setPrivacy(t.checked);
    if (t.dataset.opt === "streamer") setStreamer(t.checked);
    refreshCalm();
    paint();
    update(() => {}); // repaint every window that shows the name
  });
  paint();
}
