/**
 * Test helper: a brute-force layer-order oracle for small crease patterns with convex faces (not
 * imported by shipped code).
 *
 * It decides "does this folded pattern admit a layer order?" from the physical picture, without
 * using the clause families of `stacking.ts` or the exact predicates of `overlap.ts`. At the
 * midpoint of every stretch of every crease line it looks at the paper on both sides with float
 * point-in-polygon tests, finds the sheets that pass through the line and the folds that sit on it,
 * and requires that no fold's wrap cuts through a passing sheet, that folds on one side do not
 * interleave, and that two sheets passing through the line keep their order across it. Then it
 * tries every assignment of "above" to the overlapping pairs (2^P of them), enforcing transitivity
 * on triples of faces that share a point (found by convex clipping in floats).
 *
 * Floats and 2^P search are fine for a test oracle and limit it to a couple of dozen overlapping pairs.
 */

import { toCartesian } from "../../app/render/cartesian";
import type { CreasePattern } from "../pattern/crease-pattern";
import { faceAdjacency } from "../pattern/faces";
import { apply } from "../symmetry/affine";
import { overlappingFacePairs } from "./overlap";
import type { Folded } from "./stacking";

type P2 = { x: number; y: number };

const EPS = 1e-9;
/** How far off a crease line the side tests probe; the lattice scale is 1, so this is tiny. */
const PROBE = 1e-5;

const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: P2, b: P2) => a.x * b.y - a.y * b.x;
const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;

/** Ray-casting point-in-polygon; the probe points are never on an edge. */
function inside(poly: readonly P2[], p: P2): boolean {
  let hit = false;
  for (let i = 0; i < poly.length; i++) {
    const u = poly[i]!;
    const v = poly[(i + 1) % poly.length]!;
    if (u.y > p.y !== v.y > p.y && p.x < u.x + ((p.y - u.y) / (v.y - u.y)) * (v.x - u.x))
      hit = !hit;
  }
  return hit;
}

const area2 = (poly: readonly P2[]) =>
  poly.reduce((s, u, i) => s + cross(u, poly[(i + 1) % poly.length]!), 0);

/** Area of the intersection of convex polygons (Sutherland–Hodgman). */
function clipArea(polys: readonly (readonly P2[])[]): number {
  const ccw = (poly: readonly P2[]) => (area2(poly) >= 0 ? [...poly] : [...poly].reverse());
  let ring = ccw(polys[0]!);
  for (const other of polys.slice(1).map(ccw)) {
    for (let i = 0; i < other.length && ring.length > 0; i++) {
      const u = other[i]!;
      const v = other[(i + 1) % other.length]!;
      const side = (r: P2) => cross(sub(v, u), sub(r, u));
      const out: P2[] = [];
      ring.forEach((r, k) => {
        const n = ring[(k + 1) % ring.length]!;
        const sr = side(r);
        const sn = side(n);
        if (sr >= 0) out.push(r);
        if (sr * sn < 0) {
          const t = sr / (sr - sn);
          out.push({ x: r.x + t * (n.x - r.x), y: r.y + t * (n.y - r.y) });
        }
      });
      ring = out;
    }
  }
  return ring.length < 3 ? 0 : Math.abs(area2(ring)) / 2;
}

/** The oracle's verdict, or `too-big` when there are more overlapping pairs than it will search. */
export type OracleResult = "foldable" | "unfoldable" | "too-big";

/** One necessary condition on the "above" relation, named after the physical situation it checks. */
type Rule = {
  readonly name: string;
  readonly bits: readonly number[];
  readonly test: (above: readonly boolean[]) => boolean;
};

/** The overlapping pairs and every physical rule among them, as built by {@link oracleRules}. */
type OracleRules = {
  readonly pairs: readonly (readonly [number, number])[];
  readonly bit: ReadonlyMap<string, number>;
  readonly rules: readonly Rule[];
};

/**
 * Builds the physical rules of a folded crease pattern with convex faces.
 *
 * @param cp - a pattern whose faces are all convex, every crease assigned
 * @param folded - from `foldFaces`
 * @param maxPairs - give up beyond this many overlapping pairs (the search is exponential in it)
 * @param faces - only consider the constraints among these faces
 */
function oracleRules(
  cp: CreasePattern,
  folded: Folded,
  maxPairs: number,
  faces?: ReadonlySet<number>,
): OracleRules | "too-big" {
  const pairs = overlappingFacePairs(cp, folded.transforms).filter(
    ([i, j]) => faces === undefined || (faces.has(i) && faces.has(j)),
  );
  if (pairs.length > maxPairs) return "too-big";
  const bit = new Map<string, number>();
  pairs.forEach(([i, j], k) => bit.set(`${i},${j}`, k));

  const polys = cp.faces.map((walk, f) =>
    walk.map((v) => toCartesian(apply(folded.transforms[f]!, cp.vertices[v]!))),
  );
  polys.forEach((poly) => {
    // Convexity check: all turns of a polygon walk have one sign (collinear vertices allowed).
    const turns = poly.map((u, i) =>
      cross(
        sub(poly[(i + 1) % poly.length]!, u),
        sub(poly[(i + 2) % poly.length]!, poly[(i + 1) % poly.length]!),
      ),
    );
    if (!(turns.every((t) => t >= -EPS) || turns.every((t) => t <= EPS))) {
      throw new Error("layerOracle needs convex faces");
    }
  });

  /** Is face p above face q, under the relation `mask` (one entry per overlapping pair)? */
  const aboveBit = (mask: readonly boolean[], p: number, q: number): boolean => {
    const k = bit.get(p < q ? `${p},${q}` : `${q},${p}`);
    if (k === undefined) throw new Error(`Oracle needs faces ${p} and ${q} to overlap`);
    const iAbove = mask[k] === true;
    return p < q ? iAbove : !iAbove;
  };
  const rules: Rule[] = [];
  const seen = new Set<string>();
  const bitOf = (p: number, q: number): number => {
    const k = bit.get(p < q ? `${p},${q}` : `${q},${p}`);
    if (k === undefined) throw new Error(`Oracle needs faces ${p} and ${q} to overlap`);
    return k;
  };
  /** Adds a rule that reads only the "above" bits of the listed face pairs. */
  const add = (
    key: string,
    uses: readonly [number, number][],
    test: (mask: readonly boolean[]) => boolean,
  ) => {
    if (faces && uses.some(([p, q]) => !faces.has(p) || !faces.has(q))) return;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({ name: key, bits: [...new Set(uses.map(([p, q]) => bitOf(p, q)))], test });
  };
  const between = (mask: readonly boolean[], x: number, a: number, b: number) =>
    aboveBit(mask, x, a) !== aboveBit(mask, x, b);

  const creases = faceAdjacency(cp)
    .filter((a) => cp.edges[a.edge]!.assignment !== "B")
    .map((a) => {
      const e = cp.edges[a.edge]!;
      const at = (v: number) => toCartesian(apply(folded.transforms[a.left]!, cp.vertices[v]!));
      return { ...a, kind: e.assignment, p: at(e.v0), q: at(e.v1) };
    });

  // The crease itself: valley seen from the front puts the far face above, unless it is upside down.
  for (const c of creases) {
    if (c.kind === "F") continue;
    const rightAbove = (c.kind === "V") !== folded.flipped[c.left]!;
    const [hi, lo] = rightAbove ? [c.right, c.left] : [c.left, c.right];
    add(`crease${c.edge}`, [[hi, lo]], (m) => aboveBit(m, hi, lo));
  }

  const onSegment = (m: P2, p: P2, q: P2) => {
    const d = sub(q, p);
    const t = dot(sub(m, p), d) / dot(d, d);
    return t > 0 && t < 1 && Math.abs(cross(d, sub(m, p))) / Math.sqrt(dot(d, d)) < 1e-7;
  };

  for (const c of creases) {
    const d = sub(c.q, c.p);
    const len2 = dot(d, d);
    const ts = new Set<number>([0, 1]);
    for (const poly of polys) {
      poly.forEach((u, i) => {
        const v = poly[(i + 1) % poly.length]!;
        const s1 = cross(d, sub(u, c.p)) / Math.sqrt(len2);
        const s2 = cross(d, sub(v, c.p)) / Math.sqrt(len2);
        const param = (r: P2) => dot(sub(r, c.p), d) / len2;
        if (Math.abs(s1) < EPS && Math.abs(s2) < EPS) {
          ts.add(param(u));
          ts.add(param(v));
        } else if (s1 * s2 <= 0) {
          const k = s1 / (s1 - s2);
          ts.add(param({ x: u.x + k * (v.x - u.x), y: u.y + k * (v.y - u.y) }));
        }
      });
    }
    const sorted = [...ts].filter((t) => t >= -EPS && t <= 1 + EPS).sort((x, y) => x - y);
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (sorted[i + 1]! - sorted[i]! < 1e-7) continue;
      const tm = (sorted[i]! + sorted[i + 1]!) / 2;
      const m = { x: c.p.x + tm * d.x, y: c.p.y + tm * d.y };
      const n = { x: -d.y / Math.sqrt(len2), y: d.x / Math.sqrt(len2) };
      const plus = { x: m.x + PROBE * n.x, y: m.y + PROBE * n.y };
      const minus = { x: m.x - PROBE * n.x, y: m.y - PROBE * n.y };
      const sideOf = (f: number): 1 | -1 => {
        const l = inside(polys[f]!, plus);
        const r = inside(polys[f]!, minus);
        if (l === r) throw new Error(`Face ${f} is not on exactly one side of crease ${c.edge}`);
        return l ? 1 : -1;
      };

      // What passes through, and what folds, at m (every crease line through m, not only this one).
      const sheets: { plus: number; minus: number }[] = [];
      const folds: { a: number; b: number; side: 1 | -1 }[] = [];
      polys.forEach((poly, f) => {
        if (inside(poly, plus) && inside(poly, minus)) sheets.push({ plus: f, minus: f });
      });
      for (const e of creases) {
        if (!onSegment(m, e.p, e.q)) continue;
        const sa = sideOf(e.left);
        const sb = sideOf(e.right);
        if (e.kind === "F") {
          if (sa === sb) throw new Error("Flat crease with both faces on one side");
          sheets.push(
            sa === 1 ? { plus: e.left, minus: e.right } : { plus: e.right, minus: e.left },
          );
        } else {
          if (sa !== sb) throw new Error("Fold with faces on opposite sides");
          folds.push({ a: e.left, b: e.right, side: sa });
        }
      }

      for (const f of folds) {
        for (const s of sheets) {
          const x = f.side === 1 ? s.plus : s.minus;
          if (x === f.a || x === f.b) continue;
          add(
            `wrap:${f.a},${f.b},${x}`,
            [
              [x, f.a],
              [x, f.b],
            ],
            (mask) => !between(mask, x, f.a, f.b),
          );
        }
      }
      for (let u = 0; u < folds.length; u++) {
        for (let v = u + 1; v < folds.length; v++) {
          const f = folds[u]!;
          const g = folds[v]!;
          if (f.side !== g.side) continue; // opposite sides separate in the limit of the folding
          if (new Set([f.a, f.b, g.a, g.b]).size < 4) continue;
          add(
            `nest:${f.a},${f.b},${g.a},${g.b}`,
            [
              [g.a, f.a],
              [g.a, f.b],
              [g.b, f.a],
              [g.b, f.b],
            ],
            (mask) => between(mask, g.a, f.a, f.b) === between(mask, g.b, f.a, f.b),
          );
        }
      }
      for (let u = 0; u < sheets.length; u++) {
        for (let v = u + 1; v < sheets.length; v++) {
          const s = sheets[u]!;
          const t = sheets[v]!;
          if (s.plus === t.plus || s.minus === t.minus) continue;
          add(
            `pass:${s.plus},${s.minus},${t.plus},${t.minus}`,
            [
              [s.plus, t.plus],
              [s.minus, t.minus],
            ],
            (mask) => aboveBit(mask, s.plus, t.plus) === aboveBit(mask, s.minus, t.minus),
          );
        }
      }
    }
  }

  // Transitivity where three faces really share a point.
  for (const [i, j] of pairs) {
    for (let k = j + 1; k < polys.length; k++) {
      if (!bit.has(`${i},${k}`) || !bit.has(`${j},${k}`)) continue;
      if (clipArea([polys[i]!, polys[j]!, polys[k]!]) < 1e-9) continue;
      const trio: [number, number][] = [
        [i, j],
        [j, k],
        [i, k],
      ];
      add(`tr:${i},${j},${k}`, trio, (m) => {
        const ij = aboveBit(m, i, j);
        const jk = aboveBit(m, j, k);
        const ik = aboveBit(m, i, k);
        return !(ij && jk && !ik) && !(!ij && !jk && ik);
      });
    }
  }

  return { pairs, bit, rules };
}

/**
 * Decides whether a folded crease pattern with convex faces has a layer order.
 *
 * @param cp - a pattern whose faces are all convex, every crease assigned
 * @param folded - from `foldFaces`
 * @param maxPairs - give up beyond this many overlapping pairs (the search is exponential in it)
 * @param faces - only consider the constraints among these faces. Every constraint is necessary for
 *   a folding, so "unfoldable" for a subset proves the whole pattern unfoldable; "foldable" only
 *   means this subset has no conflict
 */
export function layerOracle(
  cp: CreasePattern,
  folded: Folded,
  maxPairs = 26,
  faces?: ReadonlySet<number>,
): OracleResult {
  const built = oracleRules(cp, folded, maxPairs, faces);
  if (built === "too-big") return "too-big";
  const { pairs, rules } = built;
  // Depth-first search over the pair bits; a rule is checked as soon as its last bit is set.
  const lastBit: Rule[][] = pairs.map(() => []);
  for (const r of rules) {
    if (r.bits.length === 0) {
      if (!r.test([])) return "unfoldable";
    } else lastBit[Math.max(...r.bits)]!.push(r);
  }
  const current: boolean[] = pairs.map(() => false);
  const search = (k: number): boolean => {
    if (k === pairs.length) return true;
    for (const value of [false, true]) {
      current[k] = value;
      if (lastBit[k]!.every((r) => r.test(current)) && search(k + 1)) return true;
    }
    current[k] = false;
    return false;
  };
  return search(0) ? "foldable" : "unfoldable";
}

/**
 * Names the physical rules that a given "above" relation breaks.
 *
 * The rules are the oracle's own (crease, wrap, nest, pass, transitivity), found by float sampling,
 * so this check shares no code with the clause families of `stacking.ts`.
 *
 * @param above - `above(p, q)` is true when face p lies above face q; only called for overlapping pairs
 * @param faces - only check the rules among these faces
 * @returns the names of the broken rules, empty when the relation is a valid layer order
 */
export function oracleBrokenRules(
  cp: CreasePattern,
  folded: Folded,
  above: (p: number, q: number) => boolean,
  faces?: ReadonlySet<number>,
): string[] {
  const built = oracleRules(cp, folded, Number.POSITIVE_INFINITY, faces);
  if (built === "too-big") throw new Error("unreachable");
  const relation = built.pairs.map(([i, j]) => above(i, j));
  return built.rules.filter((r) => !r.test(relation)).map((r) => r.name);
}
