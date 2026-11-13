/**
 * Parameter sweep over regular twists: for each polygon, twist angle, paper size and pleat
 * assignment, does the pattern fold flat, and how nearly?
 *
 * Sits at the start of Phase 8 (generative math), after the whole data flow: it builds twists with
 * `regularTwist`, enumerates their locally valid M/V assignments, and asks the layer solver about
 * each one. The solver is the ground truth. No analytic limit other than αcrit is used to skip a
 * case, because the book's other limits are not available to check against (docs/PLAN.md 7.3d).
 *
 * Reference: Lang, "Twists, Tilings, and Tessellations" (2018), §3.4 and §3.6; the pleat words are
 * counted up to rotation by the necklace formula, Eq. 3.1.
 */

import { checkedMul } from "../lattice/eisenstein";
import {
  pleatEdges,
  regularTwist,
  twistFrameRadii,
  type TwistSides,
} from "../gadgets/regular-twist";
import { twistRegime, type PiFraction, type TwistRegime } from "../gadgets/twist-limits";
import { canonicalRotation } from "../solve/necklace";
import { locallyValidAssignments } from "../solve/local-solutions";
import { nearFoldability, type FoldableShare } from "../solve/near-foldability";
import { withMvAssignment } from "../solve/solver";

/** One rotation class of pleat words (see {@link SweepRow}). */
export type NecklaceRow = {
  /** The least rotation of the pleat word, one digit per pleat: 1 when the pleat's first crease is a mountain. */
  readonly word: string;
  /** Locally valid assignments with opposite creases in every pleat whose word is in this class. */
  readonly members: number;
  /** How many of those members fold flat. */
  readonly folding: number;
  /** The largest `nearFoldability` score over the members, or null when none has a folded state. */
  readonly bestScore: FoldableShare | null;
};

/** The result for one twist: polygon, angle and size. */
export type SweepRow = {
  readonly n: TwistSides;
  readonly alpha: PiFraction;
  readonly regime: TwistRegime;
  readonly side: number;
  readonly radius: number;
  /** Locally valid assignments of every crease (polygon edges and pleats). */
  readonly valid: number;
  /** Of those, the ones whose two creases of every pleat are opposite (the book's twists). */
  readonly anto: number;
  /** The anto assignments by rotation class, in word order. */
  readonly necklaces: readonly NecklaceRow[];
};

/** What to sweep: one polygon and angle, over paper sizes. */
export type SweepSpec = {
  readonly n: TwistSides;
  readonly alpha: PiFraction;
  /** The mirror-image twist (see `regularTwistCreases`); it folds the same, so rarely needed. */
  readonly mirror?: boolean;
  /** Polygon sides to try. */
  readonly sides: readonly number[];
  /** Frame radii to try for every side. */
  readonly radii: readonly number[];
};

/** The sweep rows, and the (side, radius) pairs for which no twist exists. */
export type SweepResult = {
  readonly rows: readonly SweepRow[];
  readonly skipped: readonly { readonly side: number; readonly radius: number }[];
};

/** Is share a at least share b? Exact, by cross-multiplication of positive denominators. */
function atLeast(a: FoldableShare, b: FoldableShare): boolean {
  return checkedMul(a.num, b.den) >= checkedMul(b.num, a.den);
}

/**
 * Sweeps one polygon and twist angle over paper sizes.
 *
 * For each (side, radius) at which the twist exists, every locally valid assignment is found
 * exactly (`locallyValidAssignments`), the ones with opposite creases in every pleat are sorted by
 * pleat word into rotation classes, and each is given to `nearFoldability`. Assignments that are
 * not anto in every pleat are counted in `valid` but not run through the layer solver: they are
 * not twists in the book's sense and would multiply the cost. The result is deterministic.
 *
 * @param spec - what to sweep
 * @returns one row per existing twist, in side then radius order
 * @throws RangeError for an unsupported polygon, angle or side, and past the enumeration limit
 */
export function twistSweep(spec: SweepSpec): SweepResult {
  const { n, alpha, mirror = false } = spec;
  const rows: SweepRow[] = [];
  const skipped: { side: number; radius: number }[] = [];
  const edges = pleatEdges(n);
  for (const side of spec.sides) {
    // A maximum radius of 0 tries no radius, so this only checks n, α and the side.
    twistFrameRadii(n, alpha, side, 0, mirror);
    for (const radius of spec.radii) {
      let cp;
      try {
        cp = regularTwist(n, alpha, side, radius, mirror);
      } catch (e) {
        if (!(e instanceof RangeError)) throw e;
        skipped.push({ side, radius });
        continue;
      }
      const valid = locallyValidAssignments(cp);
      const classes = new Map<
        string,
        { members: number; folding: number; best: FoldableShare | null }
      >();
      let anto = 0;
      for (const a of valid) {
        if (!edges.every(([x, y]) => a[x] !== a[y])) continue;
        anto++;
        const word = canonicalRotation(edges.map(([x]) => (a[x] ? 1 : 0))).join("");
        const entry = classes.get(word) ?? { members: 0, folding: 0, best: null };
        classes.set(word, entry);
        entry.members++;
        const result = nearFoldability(withMvAssignment(cp, a));
        if (result.status === "ok") entry.folding++;
        if (
          (result.status === "ok" || result.status === "partial") &&
          (entry.best === null || atLeast(result.score, entry.best))
        ) {
          entry.best = result.score;
        }
      }
      rows.push({
        n,
        alpha,
        regime: twistRegime(n, alpha),
        side,
        radius,
        valid: valid.length,
        anto,
        necklaces: [...classes.entries()]
          .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
          .map(([word, v]) => ({
            word,
            members: v.members,
            folding: v.folding,
            bestScore: v.best,
          })),
      });
    }
  }
  return { rows, skipped };
}
