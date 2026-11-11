import * as THREE from "three";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import { faceDoubledArea, type CreasePattern } from "../../core/pattern/crease-pattern";
import { RENDER_TOLERANCE } from "../render/cartesian";
import { fitRig, orbit } from "./camera-rig";
import { applyRig, buildScene } from "./scene";
import { ASSIGNMENTS } from "./sheet";

const GADGETS: [string, CreasePattern][] = [
  ["hexagon twist (1, 2)", hexagonTwist(1, 2)],
  ["hexagon twist (2, 3)", hexagonTwist(2, 3)],
  ["triangle twist (3, 1)", triangleTwist(3, 1)],
  ["triangle twist (4, 1)", triangleTwist(4, 1)],
  ["triangle twist (6, 2)", triangleTwist(6, 2)],
  ["star twist, full", starTwist(1, "full")],
  ["star twist, partial", starTwist(1, "partial")],
];

const FOV = 50;
const ASPECTS = [0.5, 1, 16 / 9];

function sheetOf(scene: THREE.Scene): THREE.Mesh {
  const mesh = scene.getObjectByName("sheet");
  if (!(mesh instanceof THREE.Mesh)) throw new Error("no sheet mesh");
  return mesh;
}

/** Area of the mesh, summed from its triangles. */
function meshArea(mesh: THREE.Mesh): number {
  const pos = mesh.geometry.getAttribute("position");
  const index = mesh.geometry.getIndex()!;
  const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let area = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    area += new THREE.Triangle(a, b, c).getArea();
  }
  return area;
}

/** The largest |NDC| coordinate over the sheet's vertices; at most 1 means all are in view. */
function worstNdc(mesh: THREE.Mesh, camera: THREE.PerspectiveCamera): number {
  const pos = mesh.geometry.getAttribute("position");
  const v = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).project(camera);
    worst = Math.max(worst, Math.abs(v.x), Math.abs(v.y), Math.abs(v.z));
  }
  return worst;
}

describe.each(GADGETS)("buildScene: %s", (_name, cp) => {
  const scene = buildScene(cp);
  const mesh = sheetOf(scene);

  it("the paper mesh has the area of the pattern's faces", () => {
    const expected = cp.faces.reduce(
      (sum, f) => sum + (faceDoubledArea(cp.vertices, f) * Math.sqrt(3)) / 4,
      0,
    );
    expect(Math.abs(meshArea(mesh) - expected)).toBeLessThan(RENDER_TOLERANCE);
  });

  it("has one line segment per crease, by assignment, sharing the sheet's positions", () => {
    for (const a of ASSIGNMENTS) {
      const count = cp.edges.filter((e) => e.assignment === a).length;
      const lines = scene.getObjectByName(`creases-${a}`);
      if (count === 0) {
        expect(lines).toBeUndefined();
        continue;
      }
      expect(lines).toBeInstanceOf(THREE.LineSegments);
      const geometry = (lines as THREE.LineSegments).geometry;
      expect(geometry.getIndex()!.count).toBe(2 * count);
      expect(geometry.getAttribute("position")).toBe(mesh.geometry.getAttribute("position"));
    }
  });

  it.each(ASPECTS)("fitRig puts every vertex in view at aspect %s", (aspect) => {
    const sheet = buildScene(cp);
    const camera = new THREE.PerspectiveCamera(FOV, aspect);
    const bounds = new THREE.Box3().setFromBufferAttribute(
      sheetOf(sheet).geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    const rig = fitRig(
      { min: bounds.min.toArray(), max: bounds.max.toArray() },
      THREE.MathUtils.degToRad(FOV),
      aspect,
    );
    applyRig(camera, rig);
    expect(worstNdc(sheetOf(sheet), camera)).toBeLessThanOrEqual(1);
  });

  it("every vertex stays in view after any orbit", () => {
    const bounds = new THREE.Box3().setFromBufferAttribute(
      mesh.geometry.getAttribute("position") as THREE.BufferAttribute,
    );
    const start = fitRig(
      { min: bounds.min.toArray(), max: bounds.max.toArray() },
      THREE.MathUtils.degToRad(FOV),
      1,
    );
    const camera = new THREE.PerspectiveCamera(FOV, 1);
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: -4, max: 4, noNaN: true }),
        (dAz, dPol) => {
          applyRig(camera, orbit(start, dAz, dPol));
          expect(worstNdc(mesh, camera)).toBeLessThanOrEqual(1);
        },
      ),
      { numRuns: 50 },
    );
  });
});
