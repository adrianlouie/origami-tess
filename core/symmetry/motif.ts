/**
 * Motif and tiling types: the seed that a symmetry group is applied to, and the result.
 *
 * Sits between the symmetry layer and the gadgets in the data flow
 * (lattice → symmetry → gadgets): `tile` in `orbit.ts` maps a `Motif` to a `Tiling`.
 * Edges are carried as well as points because later steps tile crease segments,
 * not isolated vertices.
 */

import type { Eisenstein } from "../lattice/eisenstein";
import type { Edge } from "../lattice/grid";

/**
 * A seed for tiling: lattice points and undirected segments between lattice points.
 *
 * Edge endpoints need not appear in `points`; `points` lists vertices to tile on
 * their own.
 */
export type Motif = {
  readonly points: readonly Eisenstein[];
  readonly edges: readonly Edge[];
};

/** The image of a motif under a group within a window; same shape as a motif. */
export type Tiling = Motif;
