import { notify } from "./uncanny";

// "Clip": records the body cam canvas and saves a WebM.
// A WebM is only playable from its first chunk, so a simple rolling window of
// chunks would not play. Instead two recorders run staggered, each restarted
// every PERIOD ms; the older one always holds a complete, playable file of
// between PERIOD/2 and PERIOD seconds, and that is what a clip saves.
const PERIOD = 40_000;
const SLICE = 1000;

interface Take {
  rec: MediaRecorder;
  chunks: Blob[];
  started: number;
}

/** bodycam-HHMMSS.webm, named after the clock so clips sort in the order they were saved. */
export const clipName = (d: Date) => `bodycam-${d.toISOString().slice(11, 19).replace(/:/g, "")}.webm`;

/** Whole seconds of feed a take holds, at least one. */
export const clipSeconds = (started: number, now: number) => Math.max(1, Math.round((now - started) / 1000));

type CapturableCanvas = HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream };

export const clipSupported = (canvas: HTMLCanvasElement) =>
  typeof MediaRecorder !== "undefined" && typeof (canvas as CapturableCanvas).captureStream === "function";

// Wires the button to the canvas. Hides the button when recording is not
// possible. Returns a function that stops recording; it also stops by itself
// once the canvas leaves the page.
export function attachClip(canvas: HTMLCanvasElement, button: HTMLButtonElement, save: (blob: Blob, seconds: number) => void = download): () => void {
  if (!clipSupported(canvas)) {
    button.hidden = true;
    return () => {};
  }
  let stream: MediaStream;
  try {
    stream = (canvas as CapturableCanvas).captureStream!(15);
  } catch {
    button.hidden = true;
    return () => {};
  }
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m));
  const takes: Take[] = [];
  let timer = 0;
  let stopped = false;

  const begin = (): void => {
    const chunks: Blob[] = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      return;
    }
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start(SLICE);
    takes.push({ rec, chunks, started: Date.now() });
  };
  const finish = (t: Take) => {
    if (t.rec.state !== "inactive") t.rec.stop();
    takes.splice(takes.indexOf(t), 1);
  };
  const stop = (): void => {
    stopped = true;
    clearInterval(timer);
    clearInterval(labelTimer);
    for (const t of [...takes]) finish(t);
    stream.getTracks().forEach((tr) => tr.stop());
  };

  // The button says how much it will save, which is whatever the older take holds.
  const label = () => {
    const t = takes[0];
    if (t) button.textContent = `Clip the last ${clipSeconds(t.started, Date.now())} s`;
  };
  begin();
  label();
  const labelTimer = window.setInterval(() => (canvas.isConnected ? label() : clearInterval(labelTimer)), 2000);
  // Start the second recorder half a period later, then restart the oldest every half period.
  timer = window.setInterval(() => {
    if (!canvas.isConnected) return stop();
    if (takes.length < 2) return begin();
    const oldest = takes[0];
    if (Date.now() - oldest.started >= PERIOD - SLICE) {
      finish(oldest);
      begin();
    }
  }, PERIOD / 2);

  button.addEventListener("click", () => {
    if (stopped) return;
    const t = takes[0]; // the oldest take, started first
    if (!t) return;
    // Flush the current slice, then pack everything the older recorder has.
    const done = () => {
      if (t.chunks.length) save(new Blob(t.chunks, { type: t.rec.mimeType || "video/webm" }), clipSeconds(t.started, Date.now()));
    };
    if (t.rec.state === "recording") {
      t.rec.addEventListener("dataavailable", () => setTimeout(done, 0), { once: true });
      t.rec.requestData();
    } else done();
  });
  return stop;
}

function download(blob: Blob, seconds: number): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = clipName(new Date());
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  const desk = document.getElementById("desk");
  if (desk) notify(desk, "./art/icons/U-bodycam.png", "Clip saved", `Saved ${a.download} (about ${seconds} s). Check your downloads.`, 6000);
}
