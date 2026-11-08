/**
 * Orbit tiling: the images of a motif under p6m, within a finite window.
 *
 * Last module of the symmetry layer; it turns a group and a seed into the points
 * and edges that `app/render/svg.ts` draws and gadgets are later placed on. Exact integers throughout.
 *
 * Reference: Armstrong, "Groups and Symmetry", ch. 16 (orbits); the window
 * bound below is the triangle inequality for the hex metric.
 */

import { eis, mul, norm, type Eisenstein } from "../lattice/eisenstein";
import { hexDistance, type Edge } from "../lattice/grid";
import { apply, compose, translation, type Affine } from "./affine";
import type { Motif, Tiling } from "./motif";
import type { P6m } from "./p6m";

const pointKey = (z: Eisenstein) => `${z.a},${z.b}`;

/** Throws unless `radius` is a non-negative safe integer. */
function checkRadius(radius: number): void {
  if (!Number.isSafeInteger(radius) || radius < 0) {
    throw new RangeError(`Orbit radius must be a non-negative safe integer, got ${radius}`);
  }
}

/**
 * Yields every group element f = (translation by λ) ∘ g, g in D6, that can send a
 * point at hex distance `reach` into the window of radius `radius`.
 *
 * Completeness: each orbit point is λ + g(p) with g in D6 and λ in πΛ. D6 fixes
 * the origin and preserves hexDistance, which is a metric, so
 * hexDistance(λ) ≤ radius + reach =: B. Writing λ = π·k, the norm satisfies
 * N(λ) = N(π)N(k), N(λ) ≤ B² and N(k) ≥ ¾·hexDistance(k)², hence
 * hexDistance(k) ≤ K for the largest K with 3K²N(π) ≤ 4B². Enumerating every
 * k within K therefore misses nothing; callers filter the extras by the window test.
 */
function* windowElements(group: P6m, radius: number, reach: number): Generator<Affine> {
  const n = norm(group.period);
  const bound = radius + reach;
  let k = 0;
  while (3 * (k + 1) * (k + 1) * n <= 4 * bound * bound) k++;
  for (let u = -k; u <= k; u++) {
    for (let v = -k; v <= k; v++) {
      const t = translation(mul(group.period, eis(u, v)));
      for (const g of group.pointGroup) yield compose(t, g);
    }
  }
}

/**
 * Returns O_R = { x ∈ G·motif : hexDistance(x) ≤ R }, sorted by a then b.
 *
 * The window is defined by the position of the point, not by how many
 * translations were applied, so O_R is exactly the part of the infinite orbit
 * inside the hexagon and the orbit is closed under G wherever the image stays
 * in the window. Completeness follows from the bound in `windowElements`.
 *
 * @param group - the p6m group
 * @param motif - seed points
 * @param radius - non-negative safe integer R
 * @throws RangeError if `radius` is not a non-negative safe integer
 */
export function orbit(group: P6m, motif: readonly Eisenstein[], radius: number): Eisenstein[] {
  checkRadius(radius);
  const found = new Map<string, Eisenstein>();
  for (const p of motif) {
    for (const f of windowElements(group, radius, hexDistance(p))) {
      const x = apply(f, p);
      if (hexDistance(x) <= radius) found.set(pointKey(x), x);
    }
  }
  return [...found.values()].sort((x, y) => x.a - y.a || x.b - y.b);
}

/** Orders an undirected edge's endpoints by (a, b) so {p, q} and {q, p} coincide. */
function canonical(e: Edge): Edge {
  return (e.from.a - e.to.a || e.from.b - e.to.b) <= 0 ? e : { from: e.to, to: e.from };
}

/**
 * Returns the tiling of a motif: its orbit points and the images of its edges,
 * all inside the window hexDistance ≤ R.
 *
 * An image edge is kept only when both endpoints lie in the window, so the
 * result is closed under G wherever the image stays in the window. The
 * completeness argument is the one for `orbit` applied to the endpoint farther
 * from the origin: a translation that brings that endpoint into the window is
 * within the enumerated bound, and the nearer endpoint is then tested directly.
 * Edges are undirected and deduplicated, sorted by their endpoints (a, b).
 *
 * Reference: Armstrong, "Groups and Symmetry", ch. 16 (orbits).
 *
 * @param group - the p6m group
 * @param motif - seed points and edges
 * @param radius - non-negative safe integer R
 * @throws RangeError if `radius` is not a non-negative safe integer, or a motif edge is zero-length
 */
export function tile(group: P6m, motif: Motif, radius: number): Tiling {
  checkRadius(radius);
  const found = new Map<string, Edge>();
  for (const e of motif.edges) {
    if (pointKey(e.from) === pointKey(e.to)) {
      throw new RangeError("Motif edges must join two distinct points (a crease has length > 0)");
    }
    const reach = Math.max(hexDistance(e.from), hexDistance(e.to));
    for (const f of windowElements(group, radius, reach)) {
      const p = apply(f, e.from);
      const q = apply(f, e.to);
      if (hexDistance(p) <= radius && hexDistance(q) <= radius) {
        const c = canonical({ from: p, to: q });
        found.set(`${pointKey(c.from)}|${pointKey(c.to)}`, c);
      }
    }
  }
  const edges = [...found.values()].sort(
    (x, y) => x.from.a - y.from.a || x.from.b - y.from.b || x.to.a - y.to.a || x.to.b - y.to.b,
  );
  return { points: orbit(group, motif.points, radius), edges };
}
