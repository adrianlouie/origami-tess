/**
 * Browser entry for the 3D viewer: WebGL renderer, pointer events and the gadget picker.
 *
 * The last stop of the data flow, and the only file that touches the DOM. All maths lives in
 * `camera-rig.ts`, `input.ts` and `fold-driver.ts`; this file only forwards events and redraws when
 * something changed. The one animation loop runs only while the fold simulation is settling, and
 * stops as soon as the driver is done, so an idle page does no work.
 *
 * The export buttons download the selected gadget's flat crease pattern or its folding steps (`app/export/download.ts`).
 *
 * URL parameters, for screenshots: `?gadget=<index>` and `?fold=<percent>`.
 */

import * as THREE from "three";
import { fitRig, type Rig } from "./camera-rig";
import {
  foldDriver,
  foldToSlider,
  parseFoldParam,
  parseGadgetParam,
  setTarget,
  settle,
  sliderToFold,
  tick,
  type FoldDriver,
} from "./fold-driver";
import { exportFile, type ExportKind } from "../export/download";
import type { PageName } from "../export/page";
import type { CreasePattern } from "../../core/pattern/crease-pattern";
import { GADGET_ENTRIES } from "./gadgets";
import { pointerToRig } from "./input";
import { applyRig, buildScene, setPaperColor, setStepHighlight, updateSheet } from "./scene";
import { foldSteps, type FoldStep } from "../../core/pattern/fold-steps";
import { stepCaption, stepHighlight } from "../render/step-text";

/** Wall-clock time one frame may spend relaxing, in milliseconds. */
const FRAME_BUDGET_MS = 10;
/** Relaxation steps per frame: start here, then scale to hit the budget within these limits. */
const MIN_STEPS = 100;
const MAX_STEPS = 5000;
/** Most ticks a `?fold=` deep link may spend settling before the page gives up and animates. */
const DEEP_LINK_TICKS = 400;

const FOV_DEGREES = 40;
const fovY = THREE.MathUtils.degToRad(FOV_DEGREES);

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const picker = document.querySelector<HTMLSelectElement>("#gadget");
const reset = document.querySelector<HTMLButtonElement>("#reset");
const slider = document.querySelector<HTMLInputElement>("#fold");
const readout = document.querySelector<HTMLOutputElement>("#readout");
const exportSvg = document.querySelector<HTMLButtonElement>("#export-svg");
const exportPdf = document.querySelector<HTMLButtonElement>("#export-pdf");
const exportStepsSvg = document.querySelector<HTMLButtonElement>("#export-steps-svg");
const exportStepsPdf = document.querySelector<HTMLButtonElement>("#export-steps-pdf");
const pageSize = document.querySelector<HTMLSelectElement>("#page");
const paperFront = document.querySelector<HTMLInputElement>("#paper-front");
const paperBack = document.querySelector<HTMLInputElement>("#paper-back");
const stepPrev = document.querySelector<HTMLButtonElement>("#step-prev");
const stepNext = document.querySelector<HTMLButtonElement>("#step-next");
const stepText = document.querySelector<HTMLOutputElement>("#step-text");
if (
  !canvas ||
  !picker ||
  !reset ||
  !slider ||
  !readout ||
  !exportSvg ||
  !exportPdf ||
  !exportStepsSvg ||
  !exportStepsPdf ||
  !pageSize ||
  !paperFront ||
  !paperBack ||
  !stepPrev ||
  !stepNext ||
  !stepText
)
  throw new Error("index.html is missing the viewer elements");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0xf3f4f6);
const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1);

let scene = new THREE.Scene();
let rig: Rig | undefined;
let home: Rig | undefined;
let driver: FoldDriver | undefined;
let current: { name: string; cp: CreasePattern } | undefined;
let steps = MIN_STEPS;
let foldList: readonly FoldStep[] = [];
/** The folding step shown, or -1 before the first Next. */
let stepIndex = -1;
let frame = 0;

function draw(): void {
  if (!rig) return;
  applyRig(camera, rig);
  renderer.render(scene, camera);
}

function showReadout(): void {
  if (!driver) return;
  const percent = Math.round(foldToSlider(driver.fold));
  readout!.textContent = driver.done ? `fold ${percent} %` : `fold ${percent} % (settling)`;
}

/** Gives up on the simulation (it diverged): keeps the last drawn sheet and says so in the readout. */
function stop(error: unknown): void {
  console.error(error);
  driver = undefined;
  readout!.textContent = "simulation failed; pick a gadget to restart";
}

/** One animation frame: relax within the time budget, show the result, and stop when done. */
function animate(): void {
  frame = 0;
  if (!driver || driver.done) return;
  const start = performance.now();
  try {
    driver = tick(driver, steps);
  } catch (error) {
    stop(error);
    return;
  }
  const spent = Math.max(performance.now() - start, 0.1);
  steps = Math.round(Math.min(MAX_STEPS, Math.max(MIN_STEPS, (steps * FRAME_BUDGET_MS) / spent)));
  updateSheet(scene, driver.state.positions);
  showReadout();
  draw();
  if (!driver.done) frame = requestAnimationFrame(animate);
}

/** Starts the loop if it is not already running. */
function wake(): void {
  if (frame === 0 && driver && !driver.done) frame = requestAnimationFrame(animate);
}

function size(): { width: number; height: number } {
  const { clientWidth: width, clientHeight: height } = canvas!;
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

function load(index: number, foldPercent = 0, instant = false): void {
  const entry = GADGET_ENTRIES[index];
  if (!entry) return;
  cancelAnimationFrame(frame);
  frame = 0;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      // The front and back paper meshes share a geometry; disposing it twice is harmless.
      o.geometry.dispose();
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        material.dispose();
      }
    }
  });
  const cp = entry.build();
  current = { name: entry.name, cp };
  scene = buildScene(cp, {
    front: parseInt(paperFront!.value.slice(1), 16),
    back: parseInt(paperBack!.value.slice(1), 16),
  });
  driver = foldDriver(cp);
  steps = MIN_STEPS;
  foldList = foldSteps(cp);
  stepIndex = -1;
  showStep(-1, false);
  slider!.value = String(foldPercent);
  driver = setTarget(driver, sliderToFold(foldPercent));
  if (instant) {
    try {
      driver = settle(driver, MAX_STEPS, DEEP_LINK_TICKS);
      updateSheet(scene, driver.state.positions);
    } catch (error) {
      stop(error);
    }
  }
  if (driver) showReadout();
  const box = new THREE.Box3().setFromObject(scene.getObjectByName("sheet")!);
  const { width, height } = size();
  home = fitRig({ min: box.min.toArray(), max: box.max.toArray() }, fovY, width / height);
  rig = home;
  draw();
  wake();
}

/**
 * Shows folding step `index` (-1 for none): its caption and highlight, and the fold target, which
 * is 0 for the pre-crease steps and 100 percent for the collapse.
 */
function showStep(index: number, redraw = true): void {
  stepIndex = Math.max(-1, Math.min(foldList.length - 1, index));
  const step = foldList[stepIndex];
  stepText!.textContent = step
    ? stepCaption(foldList, stepIndex)
    : "Press Next for the folding steps.";
  stepPrev!.disabled = stepIndex < 0;
  stepNext!.disabled = stepIndex >= foldList.length - 1;
  const highlight = step ? stepHighlight(step) : null;
  setStepHighlight(scene, highlight?.segments ?? null, highlight?.color);
  if (!redraw || !driver) return;
  const percent = step?.kind === "collapse" ? 100 : 0;
  slider!.value = String(percent);
  driver = setTarget(driver, sliderToFold(percent));
  showReadout();
  wake();
  draw();
}

function resize(): void {
  const { width, height } = size();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  draw();
}

picker.append(...GADGET_ENTRIES.map((e, i) => new Option(e.name, String(i))));
picker.addEventListener("change", () => load(Number(picker.value)));
slider.addEventListener("input", () => {
  if (!driver) return;
  driver = setTarget(driver, sliderToFold(Number(slider.value)));
  showReadout();
  wake();
});
stepPrev.addEventListener("click", () => showStep(stepIndex - 1));
stepNext.addEventListener("click", () => showStep(stepIndex + 1));
for (const [input, side] of [
  [paperFront, "front"],
  [paperBack, "back"],
] as const) {
  input.addEventListener("input", () => {
    setPaperColor(scene, side, input.value);
    draw();
  });
}
reset.addEventListener("click", () => {
  rig = home;
  draw();
});

/** Downloads the selected gadget's flat crease pattern or its folding steps in the given format. */
function download(kind: ExportKind): void {
  if (!current) return;
  const file = exportFile(current.cp, current.name, kind, pageSize!.value as PageName);
  const url = URL.createObjectURL(new Blob([file.data], { type: file.mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
exportSvg.addEventListener("click", () => download("svg"));
exportPdf.addEventListener("click", () => download("pdf"));
exportStepsSvg.addEventListener("click", () => download("steps-svg"));
exportStepsPdf.addEventListener("click", () => download("steps-pdf"));
window.addEventListener("resize", resize);

let last: { x: number; y: number } | null = null;
let button: "left" | "right" = "left";
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  last = { x: e.clientX, y: e.clientY };
  button = e.button === 2 ? "right" : "left";
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!last || !rig) return;
  const gesture = {
    kind: "drag",
    button,
    shift: e.shiftKey,
    dx: e.clientX - last.x,
    dy: e.clientY - last.y,
  } as const;
  last = { x: e.clientX, y: e.clientY };
  rig = pointerToRig(rig, gesture, { height: size().height, fovY });
  draw();
});
const release = () => (last = null);
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (!rig) return;
    rig = pointerToRig(rig, { kind: "wheel", deltaY: e.deltaY }, { height: size().height, fovY });
    draw();
  },
  { passive: false },
);

const params = new URLSearchParams(window.location.search);
const first = parseGadgetParam(params.get("gadget"), GADGET_ENTRIES.length);
picker.value = String(first);
resize();
load(first, Math.round(parseFoldParam(params.get("fold")) * 100), true);
