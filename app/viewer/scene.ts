/**
 * Three.js scene for the crease pattern (flat, then folded by the simulation), and the camera hookup.
 *
 * Render end of the data flow (… → render). It builds scene objects only, with no renderer, so it
 * runs in Node and is tested there; `main.ts` owns the WebGL renderer and the browser events. The
 * paper mesh and every solid crease line share one position buffer, so the fold simulation moves the
 * vertices by updating that one attribute ({@link updateSheet}); dashed (U) lines keep a private
 * non-indexed copy, because three can only compute their dash distances that way.
 */

import * as THREE from "three";
import type { Assignment, CreasePattern } from "../../core/pattern/crease-pattern";
import { CREASE_STYLE } from "../render/crease-style";
import { clipPlanes, rigPose, type Rig } from "./camera-rig";
import { ASSIGNMENTS, sheetGeometry } from "./sheet";

/** Line colours by assignment, from the shared style table (`app/render/crease-style.ts`). */
export const CREASE_COLORS: Readonly<Record<Assignment, number>> = {
  M: CREASE_STYLE.M.color,
  V: CREASE_STYLE.V.color,
  B: CREASE_STYLE.B.color,
  F: CREASE_STYLE.F.color,
  U: CREASE_STYLE.U.color,
};

/** Writes the endpoints of each vertex pair, two positions per segment, into a non-indexed geometry. */
function copyPairs(
  geometry: THREE.BufferGeometry,
  pairs: Uint32Array,
  positions: ArrayLike<number>,
): void {
  const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
  const out = attribute.array as Float32Array;
  pairs.forEach((v, i) => {
    out[3 * i] = positions[3 * v]!;
    out[3 * i + 1] = positions[3 * v + 1]!;
    out[3 * i + 2] = positions[3 * v + 2]!;
  });
  attribute.needsUpdate = true;
}

/**
 * Builds the scene for a crease pattern lying flat at z = 0.
 *
 * Contains a double-sided mesh named "sheet", one `LineSegments` named `creases-<A>` for each
 * assignment that occurs, and two lights. The mesh is pushed back with a polygon offset so the lines
 * drawn at the same depth are not hidden by it.
 *
 * @param cp - the crease pattern
 * @returns a scene whose sheet and crease lines reuse a single position attribute
 * @throws RangeError if the pattern has a face with a hole (see {@link sheetGeometry})
 */
export function buildScene(cp: CreasePattern): THREE.Scene {
  const sheet = sheetGeometry(cp);
  const scene = new THREE.Scene();
  const position = new THREE.BufferAttribute(sheet.positions, 3);

  const paper = new THREE.BufferGeometry();
  paper.setAttribute("position", position);
  paper.setIndex(new THREE.BufferAttribute(sheet.triangles, 1));
  const mesh = new THREE.Mesh(
    paper,
    new THREE.MeshStandardMaterial({
      color: 0xf5ecd7,
      side: THREE.DoubleSide,
      // Per-triangle normals from screen-space derivatives: a crease reads as a sharp edge, and no
      // normal attribute has to be recomputed on every simulation frame.
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
  );
  mesh.name = "sheet";
  scene.add(mesh);

  for (const a of ASSIGNMENTS) {
    const pairs = sheet.creases[a];
    if (pairs.length === 0) continue;
    const dashed = a === "U";
    const geometry = new THREE.BufferGeometry();
    if (dashed) {
      // `computeLineDistances` only handles non-indexed geometry (it warns and does nothing on an
      // indexed one), so a dashed crease gets its own two-vertex-per-segment position buffer,
      // refreshed from the sheet in `updateSheet`. Solid creases keep sharing the sheet's buffer.
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(3 * pairs.length), 3),
      );
      copyPairs(geometry, pairs, sheet.positions);
    } else {
      geometry.setAttribute("position", position);
      geometry.setIndex(new THREE.BufferAttribute(pairs, 1));
    }
    const material = dashed
      ? new THREE.LineDashedMaterial({ color: CREASE_COLORS[a], dashSize: 0.1, gapSize: 0.1 })
      : new THREE.LineBasicMaterial({ color: CREASE_COLORS[a] });
    const lines = new THREE.LineSegments(geometry, material);
    if (dashed) {
      lines.userData.pairs = pairs;
      lines.computeLineDistances();
    }
    lines.name = `creases-${a}`;
    scene.add(lines);
  }

  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-1, -2, 3);
  scene.add(sun);
  return scene;
}

/**
 * Moves the sheet and its crease lines to simulated positions.
 *
 * Copies into the shared position attribute (float64 to float32), flags it for upload, and
 * recomputes what is derived from the positions: the bounding spheres and boxes (three culls by
 * bounding sphere, and the flat one would hide a sheet that has folded away from it) and the dash
 * distances of dashed crease lines. The paper is flat shaded, so it has no normals to refresh.
 *
 * @param scene - a scene from {@link buildScene}
 * @param positions - x, y, z per node, in the sheet's node order (`RelaxState.positions`)
 * @throws RangeError if `positions` is not the length of the sheet's position buffer
 */
export function updateSheet(scene: THREE.Scene, positions: Float64Array): void {
  const sheet = scene.getObjectByName("sheet");
  if (!(sheet instanceof THREE.Mesh)) throw new Error("scene has no sheet mesh");
  const attribute = sheet.geometry.getAttribute("position") as THREE.BufferAttribute;
  if (positions.length !== attribute.array.length) {
    throw new RangeError("positions must have 3 numbers per sheet vertex");
  }
  (attribute.array as Float32Array).set(positions);
  attribute.needsUpdate = true;
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.computeBoundingSphere();
      o.geometry.computeBoundingBox();
    }
    if (o instanceof THREE.LineSegments && o.userData.pairs instanceof Uint32Array) {
      copyPairs(o.geometry, o.userData.pairs, positions);
      o.computeLineDistances();
      o.geometry.computeBoundingSphere();
      o.geometry.computeBoundingBox();
    }
  });
}

/**
 * Puts a perspective camera where the rig says.
 *
 * Sets position, up (+z), look-at target and the clip planes from {@link clipPlanes}, then refreshes
 * the projection and world matrices so `Vector3.project` can be used straight away.
 */
export function applyRig(camera: THREE.PerspectiveCamera, rig: Rig): void {
  const { position } = rigPose(rig);
  const { near, far } = clipPlanes(rig);
  camera.position.set(...position);
  camera.up.set(0, 0, 1);
  camera.lookAt(...rig.target);
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
