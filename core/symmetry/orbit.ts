/**
 * Orbit tiling: the images of a motif under p6m, within a finite window.
 *
 * Last module of the symmetry layer before the tiled render of step 2.3; it
 * turns a group and a seed into the points a gadget is later placed on. Exact
 * integers throughout.
 *
 * Reference: Armstrong, "Groups and Symmetry", ch. 16 (orbits); the window
 * bound below is the triangle inequality for the hex metric.
 */

import { add, eis, mul, norm, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance } from "../lattice/grid";
import { apply } from "./affine";
import type { P6m } from "./p6m";

/**
 * Returns O_R = { x ∈ G·motif : hexDistance(x) ≤ R }, sorted by a then b.
 *
 * The window is defined by the position of the point, not by how many
 * translations were applied, so O_R is exactly the part of the infinite orbit
 * inside the hexagon and the orbit is closed under G wherever the image stays
 * in the window.
 *
 * Completeness: each orbit point is λ + g(p) with g in D6 and λ in πΛ. D6 fixes
 * the origin and preserves hexDistance, which is a metric, so
 * hexDistance(λ) ≤ R + hexDistance(p) =: B. Writing λ = π·k, the norm satisfies
 * N(λ) = N(π)N(k), N(λ) ≤ B² and N(k) ≥ ¾·hexDistance(k)², hence
 * hexDistance(k) ≤ K for the largest K with 3K²N(π) ≤ 4B². Enumerating every
 * k within K therefore misses nothing; the extras are filtered by the window test.
 *
 * @param group - the p6m group
 * @param motif - seed points
 * @param radius - non-negative safe integer R
 * @throws RangeError if `radius` is not a non-negative safe integer
 */
export function orbit(group: P6m, motif: readonly Eisenstein[], radius: number): Eisenstein[] {
  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError(`Orbit radius must be a non-negative safe integer, got ${radius}`);
  }
  const n = norm(group.period);
  const found = new Map<string, Eisenstein>();
  for (const p of motif) {
    const bound = radius + hexDistance(p);
    let k = 0;
    while (3 * (k + 1) * (k + 1) * n <= 4 * bound * bound) k++;
    // D6 images are shared by every translate, so compute them once per point.
    const images = new Set<Eisenstein>(group.pointGroup.map((g) => apply(g, p)));
    for (let u = -k; u <= k; u++) {
      for (let v = -k; v <= k; v++) {
        const lambda = mul(group.period, eis(u, v));
        for (const q of images) {
          const x = add(lambda, q);
          if (hexDistance(x) <= radius) found.set(`${x.a},${x.b}`, x);
        }
      }
    }
  }
  return [...found.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}
