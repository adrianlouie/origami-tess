/**
 * The fold angle of a hinge between two triangles, and its gradient.
 *
 * Sits in the physical stage of the data flow (… → solve → simulate): the bar-and-hinge model
 * stores one rotational spring per crease and per interior diagonal, and `relax.ts` needs the
 * hinge's angle and its derivative with respect to the four node positions. Positions are a flat
 * `Float64Array` (x, y, z per node), the layout shared with the viewer's position buffer.
 *
 * Reference: Schenk and Guest, "Origami folding: a structural engineering approach" (2011); Liu and
 * Paulino, "Nonlinear mechanics of non-rigid origami: an efficient computational approach" (2017),
 * §2.2 for the derivative of a dihedral angle; Ghassaei et al., "Fast, interactive origami
 * simulation using GPU computation" (2018), §3.
 */

/**
 * A hinge: the shared axis `j`–`k` and one wing node on each side.
 *
 * With the sheet flat in the plane z = 0 and seen from +z, `i` is to the left of the directed axis
 * j → k and `l` to its right, so triangle (j, k, i) and triangle (k, j, l) are both counter-clockwise.
 */
export type Hinge = {
  readonly i: number;
  readonly j: number;
  readonly k: number;
  readonly l: number;
};

/** Scratch numbers shared by the angle and gradient code. */
type Frame = {
  /** Axis length |x_k − x_j|. */
  length: number;
  /** Wing distances from the axis line. */
  h1: number;
  h2: number;
  /** Where each wing's foot lies along the axis, as a fraction from j (0) to k (1). */
  s1: number;
  s2: number;
  /** Unit normals of the two triangles. */
  n1: [number, number, number];
  n2: [number, number, number];
  /** Signed fold angle. */
  angle: number;
};

const sub = (x: Float64Array, a: number, b: number): [number, number, number] => [
  x[3 * a]! - x[3 * b]!,
  x[3 * a + 1]! - x[3 * b + 1]!,
  x[3 * a + 2]! - x[3 * b + 2]!,
];
const dot = (p: readonly number[], q: readonly number[]): number =>
  p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
const cross = (p: readonly number[], q: readonly number[]): [number, number, number] => [
  p[1]! * q[2]! - p[2]! * q[1]!,
  p[2]! * q[0]! - p[0]! * q[2]!,
  p[0]! * q[1]! - p[1]! * q[0]!,
];

function frame(x: Float64Array, { i, j, k, l }: Hinge): Frame {
  const e = sub(x, k, j);
  const length = Math.hypot(...e);
  if (!(length > 0)) throw new RangeError("hinge axis has zero length");
  const u: [number, number, number] = [e[0] / length, e[1] / length, e[2] / length];
  const ri = sub(x, i, j);
  const rl = sub(x, l, j);
  const ti = dot(ri, u);
  const tl = dot(rl, u);
  const h1 = Math.hypot(ri[0] - ti * u[0], ri[1] - ti * u[1], ri[2] - ti * u[2]);
  const h2 = Math.hypot(rl[0] - tl * u[0], rl[1] - tl * u[1], rl[2] - tl * u[2]);
  if (!(h1 > 0) || !(h2 > 0)) throw new RangeError("hinge wing lies on the axis");
  // n1 = (k − j) × (i − j) and n2 = (j − k) × (l − k) are the triangle normals, both +z when flat.
  const c1 = cross(e, ri);
  const c2 = cross([-e[0], -e[1], -e[2]], sub(x, l, k));
  const n1: [number, number, number] = [
    c1[0] / (length * h1),
    c1[1] / (length * h1),
    c1[2] / (length * h1),
  ];
  const n2: [number, number, number] = [
    c2[0] / (length * h2),
    c2[1] / (length * h2),
    c2[2] / (length * h2),
  ];
  // Signed angle from n1 to n2 about u, negated so that a valley (wings rising toward +z) is
  // positive: wings that each rise by α give n1 → n2 a turn of −2α about u.
  const angle = Math.atan2(-dot(cross(n1, n2), u), dot(n1, n2));
  return { length, h1, h2, s1: ti / length, s2: tl / length, n1, n2, angle };
}

/**
 * Returns the signed fold angle ρ of a hinge, in radians, in (−π, π].
 *
 * Formula: with unit axis u = (x_k − x_j)/|x_k − x_j| and the unit normals n₁ of triangle (j, k, i)
 * and n₂ of triangle (k, j, l), ρ = atan2(−(n₁ × n₂)·u, n₁·n₂) (Schenk and Guest 2011). ρ = 0 for a
 * flat hinge, ρ = π when the wings lie face to face, and ρ > 0 for a valley: the wings rise toward
 * +z, as in the FOLD convention. If the wings rise by α each, ρ = 2α.
 *
 * @param x - node positions, x, y, z per node
 * @param hinge - the four node indices (see {@link Hinge})
 * @throws RangeError if the axis has zero length or a wing node lies on the axis line
 */
export function foldAngle(x: Float64Array, hinge: Hinge): number {
  return frame(x, hinge).angle;
}

/**
 * Writes ∂ρ/∂x for the four nodes of a hinge into `out` and returns ρ.
 *
 * Formula: ∂ρ/∂x_i = n₁/h₁ and ∂ρ/∂x_l = n₂/h₂, where hₘ is the distance of wing m from the axis
 * line (a wing node moving along its triangle's normal turns that wing by an angle of
 * displacement/h). The axis nodes carry the opposite force: it is split between j and k by the
 * lever rule, so ∂ρ/∂x_j = −(1 − s₁) n₁/h₁ − (1 − s₂) n₂/h₂ and ∂ρ/∂x_k = −s₁ n₁/h₁ − s₂ n₂/h₂,
 * where sₘ ∈ ℝ is the fraction along j → k at which wing m's foot lies. The four vectors then sum to
 * zero (translation invariance) and the torque about the axis cancels between the wings (rotation
 * invariance). Liu and Paulino 2017 write the same result with cotangents.
 *
 * @param x - node positions, x, y, z per node
 * @param hinge - the four node indices
 * @param out - receives 12 numbers: the gradients at i, j, k, l in that order
 * @returns the fold angle ρ
 * @throws RangeError as {@link foldAngle} does
 */
export function foldAngleGradient(x: Float64Array, hinge: Hinge, out: Float64Array): number {
  const f = frame(x, hinge);
  for (let d = 0; d < 3; d++) {
    const g1 = f.n1[d]! / f.h1;
    const g2 = f.n2[d]! / f.h2;
    out[d] = g1;
    out[9 + d] = g2;
    out[3 + d] = -(1 - f.s1) * g1 - (1 - f.s2) * g2;
    out[6 + d] = -f.s1 * g1 - f.s2 * g2;
  }
  return f.angle;
}
