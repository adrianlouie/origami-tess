/**
 * Three.js scene for the flat crease pattern, and the camera hookup.
 *
 * Render end of the data flow (… → render). It builds scene objects only, with no renderer, so it
 * runs in Node and is tested there; `main.ts` owns the WebGL renderer and the browser events. The
 * paper mesh and every crease line share one position buffer, so the fold simulation moves the
 * vertices by updating that one attribute ({@link updateSheet}).
 */

import * as THREE from "three";
import type { Assignment, CreasePattern } from "../../core/pattern/crease-pattern";
import { clipPlanes, rigPose, type Rig } from "./camera-rig";
import { ASSIGNMENTS, sheetGeometry } from "./sheet";

/** Line colours by assignment: mountain red, valley blue, border and flat grey, unassigned dashed. */
export const CREASE_COLORS: Readonly<Record<Assignment, number>> = {
  M: 0xd62828,
  V: 0x1d4ed8,
  B: 0x333333,
  F: 0x9ca3af,
  U: 0x6b7280,
};

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
  paper.computeVertexNormals();
  const mesh = new THREE.Mesh(
    paper,
    new THREE.MeshStandardMaterial({
      color: 0xf5ecd7,
      side: THREE.DoubleSide,
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", position);
    geometry.setIndex(new THREE.BufferAttribute(pairs, 1));
    const dashed = a === "U";
    const material = dashed
      ? new THREE.LineDashedMaterial({ color: CREASE_COLORS[a], dashSize: 0.1, gapSize: 0.1 })
      : new THREE.LineBasicMaterial({ color: CREASE_COLORS[a] });
    const lines = new THREE.LineSegments(geometry, material);
    if (dashed) lines.computeLineDistances();
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
 * recomputes the paper's normals and the bounding spheres: three culls by bounding sphere, and the
 * flat one would hide a sheet that has folded away from it.
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
  sheet.geometry.computeVertexNormals();
  scene.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry.computeBoundingSphere();
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
