import * as THREE from "three";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { starTwist } from "../../core/gadgets/star-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import { eis } from "../../core/lattice/eisenstein";
import {
  faceDoubledArea,
  fromSegments,
  type CreasePattern,
} from "../../core/pattern/crease-pattern";
import { RENDER_TOLERANCE } from "../render/cartesian";
import { fitRig, orbit } from "./camera-rig";
import { barHingeModel } from "../../core/simulate/model";
import { applyRig, buildScene, updateSheet } from "./scene";
import { ASSIGNMENTS, sheetGeometry } from "./sheet";

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

describe.each(GADGETS)("updateSheet: %s", (_name, cp) => {
  it("the simulation model and the sheet share one node order and one triangle list", () => {
    const model = barHingeModel(cp);
    const sheet = sheetGeometry(cp);
    expect(model.triangles.flat()).toEqual(Array.from(sheet.triangles));
    expect(model.rest.length).toBe(sheet.positions.length);
    model.rest.forEach((r, i) => expect(Math.abs(r - sheet.positions[i]!)).toBeLessThan(1e-6));
  });
});

describe("updateSheet", () => {
  const cp = hexagonTwist(1, 2);

  /** Rest positions with every vertex lifted to z = h. */
  function lifted(h: number): Float64Array {
    const p = Float64Array.from(barHingeModel(cp).rest);
    for (let i = 2; i < p.length; i += 3) p[i] = h;
    return p;
  }

  it("copies the positions into the one attribute the sheet and the creases share", () => {
    const scene = buildScene(cp);
    const positions = lifted(2.5);
    updateSheet(scene, positions);
    const attribute = sheetOf(scene).geometry.getAttribute("position");
    expect(attribute.getZ(0)).toBeCloseTo(2.5, 5);
    const lines = scene.getObjectByName("creases-M") as THREE.LineSegments;
    expect(lines.geometry.getAttribute("position")).toBe(attribute);
  });

  it("marks the buffer for upload", () => {
    const scene = buildScene(cp);
    const attribute = sheetOf(scene).geometry.getAttribute("position") as THREE.BufferAttribute;
    const before = attribute.version;
    updateSheet(scene, lifted(1));
    expect(attribute.version).toBeGreaterThan(before);
  });

  it("recomputes the bounding sphere, so the folded sheet is not culled by the flat one", () => {
    const scene = buildScene(cp);
    const mesh = sheetOf(scene);
    mesh.geometry.computeBoundingSphere();
    const flat = mesh.geometry.boundingSphere!.clone();
    updateSheet(scene, lifted(50));
    expect(mesh.geometry.boundingSphere!.center.z).toBeCloseTo(50, 3);
    expect(mesh.geometry.boundingSphere!.center.z).not.toBeCloseTo(flat.center.z, 1);
    const line = scene.getObjectByName("creases-M") as THREE.LineSegments;
    expect(line.geometry.boundingSphere?.center.z ?? 50).toBeCloseTo(50, 3);
  });

  it("recomputes the bounding box too, so Box3.setFromObject sees the folded sheet", () => {
    const scene = buildScene(cp);
    const mesh = sheetOf(scene);
    mesh.geometry.computeBoundingBox();
    updateSheet(scene, lifted(50));
    expect(mesh.geometry.boundingBox!.min.z).toBeCloseTo(50, 3);
    expect(new THREE.Box3().setFromObject(mesh).min.z).toBeCloseTo(50, 3);
    const line = scene.getObjectByName("creases-M") as THREE.LineSegments;
    expect(line.geometry.boundingBox?.min.z ?? 50).toBeCloseTo(50, 3);
  });

  it("recomputes the dash distances of unassigned (U) creases, which depend on the positions", () => {
    // LineDashedMaterial reads a per-vertex `lineDistance` made by computeLineDistances. Computed
    // once on the flat sheet it would stay at the flat length and the dashes would stretch.
    const square = fromSegments(
      [],
      [
        { from: eis(0, 0), to: eis(1, 0), assignment: "B" },
        { from: eis(1, 0), to: eis(1, 1), assignment: "B" },
        { from: eis(1, 1), to: eis(0, 1), assignment: "B" },
        { from: eis(0, 1), to: eis(0, 0), assignment: "B" },
        { from: eis(1, 0), to: eis(0, 1), assignment: "U" },
      ],
    );
    const scene = buildScene(square);
    const line = scene.getObjectByName("creases-U") as THREE.LineSegments;
    const distances = () => Array.from(line.geometry.getAttribute("lineDistance").array);
    const flat = distances();
    const positions = Float64Array.from(barHingeModel(square).rest);
    const u = square.edges.find((e) => e.assignment === "U")!;
    // Lift one end of the dashed crease: its length grows from √2 to √(2 + 9).
    positions[3 * u.v1 + 2] = 3;
    updateSheet(scene, positions);
    const lifted = distances();
    expect(lifted[1]).toBeGreaterThan(flat[1]! + 1);
    expect(lifted[1]).toBeCloseTo(Math.hypot(flat[1]!, 3), 3);
  });

  it("shades the paper flat, so a crease is a sharp edge rather than a smooth blend", () => {
    // Averaged vertex normals round off every fold; flat shading takes the normal per triangle.
    const material = sheetOf(buildScene(cp)).material as THREE.MeshStandardMaterial;
    expect(material.flatShading).toBe(true);
  });

  it("throws RangeError when the array is the wrong length", () => {
    expect(() => updateSheet(buildScene(cp), new Float64Array(3))).toThrow(RangeError);
  });
});
