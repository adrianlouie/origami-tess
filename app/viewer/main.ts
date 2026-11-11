/**
 * Browser entry for the 3D viewer: WebGL renderer, pointer events and the gadget picker.
 *
 * The last stop of the data flow, and the only file that touches the DOM. All maths lives in
 * `camera-rig.ts` and `input.ts`; this file only forwards events and redraws when something
 * changed, so there is no animation loop.
 */

import * as THREE from "three";
import { fitRig, type Rig } from "./camera-rig";
import { GADGET_ENTRIES } from "./gadgets";
import { pointerToRig } from "./input";
import { applyRig, buildScene } from "./scene";

const FOV_DEGREES = 40;
const fovY = THREE.MathUtils.degToRad(FOV_DEGREES);

const canvas = document.querySelector<HTMLCanvasElement>("#view");
const picker = document.querySelector<HTMLSelectElement>("#gadget");
const reset = document.querySelector<HTMLButtonElement>("#reset");
if (!canvas || !picker || !reset) throw new Error("index.html is missing the viewer elements");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setClearColor(0xf3f4f6);
const camera = new THREE.PerspectiveCamera(FOV_DEGREES, 1);

let scene = new THREE.Scene();
let rig: Rig | undefined;
let home: Rig | undefined;

function draw(): void {
  if (!rig) return;
  applyRig(camera, rig);
  renderer.render(scene, camera);
}

function size(): { width: number; height: number } {
  const { clientWidth: width, clientHeight: height } = canvas!;
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}

function load(index: number): void {
  const entry = GADGET_ENTRIES[index];
  if (!entry) return;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
  scene = buildScene(entry.build());
  const box = new THREE.Box3().setFromObject(scene.getObjectByName("sheet")!);
  const { width, height } = size();
  home = fitRig({ min: box.min.toArray(), max: box.max.toArray() }, fovY, width / height);
  rig = home;
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
reset.addEventListener("click", () => {
  rig = home;
  draw();
});
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

resize();
load(0);
