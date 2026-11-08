/**
 * Exact affine maps of the Eisenstein lattice.
 *
 * Sits right after `core/lattice` in the data flow (lattice → symmetry/gadgets
 * → pattern → …). A wallpaper group (step 2.2) is a set of these maps, and
 * orbit tiling applies them to a motif. Matrix entries and translations are
 * integers, so every image of a lattice point is again a lattice point and no
 * floating point is involved.
 *
 * Reference: Armstrong, "Groups and Symmetry", ch. 1 and 24 (groups of
 * isometries); Conway, Burgiel & Goodman-Strauss, "The Symmetries of Things",
 * ch. 1–2.
 */

import { add, checkedAdd, checkedMul, eis, norm, type Eisenstein } from "../lattice/eisenstein";

/**
 * A 2×2 integer matrix [a, b, c, d] meaning the rows (a, b) and (c, d), acting
 * on the column (x, y) of lattice coordinates in the basis {1, ω}.
 */
export type Matrix = readonly [number, number, number, number];

/**
 * The lattice affine map z ↦ M·z + t.
 *
 * M acts on the coordinates (a, b) of z = a + bω, and t is a lattice
 * translation. Invariant (enforced by {@link affine}): det M = ±1, so M ∈
 * GL₂(ℤ) and the inverse is integral, which makes the maps a group.
 * Immutable.
 */
export type Affine = { readonly m: Matrix; readonly t: Eisenstein };

/**
 * Builds the affine map z ↦ M·z + t.
 *
 * Throws unless every entry is a safe integer and det M = ±1. A determinant of
 * ±1 is exactly the condition for M⁻¹ = det·adj(M) to be integral (Cramer's
 * rule), so the inverse of a valid map never leaves the lattice. Negative zero
 * is normalised so structural equality works.
 *
 * @param m - matrix [a, b, c, d] in the basis {1, ω}
 * @param t - translation
 */
export function affine(m: Matrix, t: Eisenstein): Affine {
  if (!m.every(Number.isSafeInteger)) {
    throw new RangeError(`Affine matrix entries must be safe integers, got [${m.join(", ")}]`);
  }
  const [a, b, c, d] = m;
  const det = checkedAdd(checkedMul(a, d), -checkedMul(b, c));
  if (Math.abs(det) !== 1) {
    throw new RangeError(`Affine matrix must have determinant ±1, got ${det}`);
  }
  // `+ 0` turns -0 into 0.
  return { m: [a + 0, b + 0, c + 0, d + 0], t: eis(t.a, t.b) };
}

/** The identity map z ↦ z. */
export const IDENTITY: Affine = affine([1, 0, 0, 1], eis(0, 0));

/** Returns true when f and g are the same map. */
export function equals(f: Affine, g: Affine): boolean {
  return f.m.every((v, i) => v === g.m[i]) && f.t.a === g.t.a && f.t.b === g.t.b;
}

/** Returns f(z) = M·z + t. */
export function apply(f: Affine, z: Eisenstein): Eisenstein {
  const [a, b, c, d] = f.m;
  return add(
    eis(
      checkedAdd(checkedMul(a, z.a), checkedMul(b, z.b)),
      checkedAdd(checkedMul(c, z.a), checkedMul(d, z.b)),
    ),
    f.t,
  );
}

/**
 * Returns f∘g, the map that applies g first and then f.
 *
 * Formula: f(g(z)) = M_f(M_g z + t_g) + t_f = (M_f M_g) z + (M_f t_g + t_f),
 * so the linear part multiplies and the translation is f applied to t_g.
 */
export function compose(f: Affine, g: Affine): Affine {
  const [a, b, c, d] = f.m;
  const [e, h, i, j] = g.m;
  const dot = (p: number, q: number, r: number, s: number) =>
    checkedAdd(checkedMul(p, q), checkedMul(r, s));
  return affine(
    [dot(a, e, b, i), dot(a, h, b, j), dot(c, e, d, i), dot(c, h, d, j)],
    apply(f, g.t),
  );
}

/**
 * Returns f⁻¹.
 *
 * Formula: solving w = Mz + t gives z = M⁻¹w − M⁻¹t, with M⁻¹ = det(M)·adj(M)
 * because det M = ±1 (so 1/det = det) and adj([a b; c d]) = [d −b; −c a].
 */
export function inverse(f: Affine): Affine {
  const [a, b, c, d] = f.m;
  const det = checkedAdd(checkedMul(a, d), -checkedMul(b, c));
  const inv: Matrix = [det * d, -det * b, -det * c, det * a];
  const t = apply(affine(inv, eis(0, 0)), f.t);
  return affine(inv, eis(-t.a, -t.b));
}

/** Returns the translation z ↦ z + t. */
export function translation(t: Eisenstein): Affine {
  return affine([1, 0, 0, 1], t);
}

/**
 * Returns the counter-clockwise rotation by k·60° about the origin.
 *
 * Formula: multiplication by the primitive 6th root of unity e^{iπ/3} = 1 + ω,
 * which in the basis {1, ω} is the matrix [[1, −1], [1, 0]] (the same map as
 * `rot60`). The exponent is reduced mod 6 because (1 + ω)⁶ = 1.
 *
 * @param k - number of 60° steps; any integer
 */
export function rotation60(k: number): Affine {
  if (!Number.isSafeInteger(k)) {
    throw new RangeError(`rotation60 needs an integer number of steps, got ${k}`);
  }
  const steps = ((k % 6) + 6) % 6;
  let f = IDENTITY;
  const r = affine([1, -1, 1, 0], eis(0, 0));
  for (let i = 0; i < steps; i++) f = compose(r, f);
  return f;
}

/**
 * Returns the reflection across the real axis, z ↦ z̄.
 *
 * Formula: conj(a + bω) = (a − b) − bω, i.e. the matrix [[1, −1], [0, −1]].
 * It is an involution, and s r s = r⁻¹ gives the dihedral group D6 with r.
 */
export function reflection(): Affine {
  return affine([1, -1, 0, -1], eis(0, 0));
}

/**
 * Conjugates f by a translation so that it acts about `center` instead of the
 * origin: T_c ∘ f ∘ T_{−c}. The point `center` is fixed whenever f fixes the
 * origin.
 *
 * @param f - a map, typically a rotation or reflection about the origin
 * @param center - lattice point to act about
 */
export function about(f: Affine, center: Eisenstein): Affine {
  return compose(translation(center), compose(f, translation(eis(-center.a, -center.b))));
}

/**
 * Returns true when f preserves distances, i.e. is a rigid motion.
 *
 * Formula: the squared length is the quadratic form N(z) = a² − ab + b²
 * (`norm`). A linear map preserves a quadratic form iff it preserves it on a
 * spanning set that fixes the cross term, so it is enough that N(M e₁) = 1,
 * N(M e₂) = 1 and N(M(e₁ − e₂)) = 3 (N(1) = N(ω) = 1, N(1 − ω) = 3).
 * Translations never change distances, so only M is checked.
 */
export function isIsometry(f: Affine): boolean {
  const [a, b, c, d] = f.m;
  return (
    norm(eis(a, c)) === 1 &&
    norm(eis(b, d)) === 1 &&
    norm(eis(checkedAdd(a, -b), checkedAdd(c, -d))) === 3
  );
}
