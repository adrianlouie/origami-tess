/**
 * Eisenstein integers: exact-integer points of the triangular lattice.
 *
 * First module in the data flow (lattice → symmetry/gadgets → pattern → …).
 * Every vertex position downstream is an Eisenstein integer, so lattice math
 * never touches floating point; floats appear only at the render boundary.
 *
 * Reference: Conway & Sloane, "Sphere Packings, Lattices and Groups", ch. 4
 * (the A2 lattice); Hardy & Wright, "An Introduction to the Theory of
 * Numbers", §12.9 (Eisenstein integers).
 */

/**
 * An Eisenstein integer z = a + bω, where ω = e^{2πi/3} = (−1 + i√3)/2.
 *
 * The pair (a, b) are integer coordinates in the basis {1, ω}. These basis
 * vectors are 120° apart, so the lattice points are the vertices of the
 * triangular tiling of the plane. Immutable: all operations return new values.
 */
export type Eisenstein = { readonly a: number; readonly b: number };

/**
 * Builds an Eisenstein integer a + bω.
 *
 * Throws unless both coordinates are safe integers, so a float or an overflow
 * can never silently enter lattice math. Negative zero is normalised to zero
 * so that structural equality and `Object.is` agree.
 *
 * @param a - coefficient of 1
 * @param b - coefficient of ω
 */
export function eis(a: number, b: number): Eisenstein {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) {
    throw new RangeError(`Eisenstein coordinates must be safe integers, got (${a}, ${b})`);
  }
  // `+ 0` turns -0 into 0 (-0 + 0 === +0).
  return { a: a + 0, b: b + 0 };
}

/**
 * Returns x·y, throwing RangeError unless the product is a safe integer.
 *
 * Why: IEEE 754 doubles are exact for integers up to 2⁵³ and round beyond, and
 * rounding is monotone, so a true product of magnitude ≥ 2⁵³ can never come out
 * below 2⁵³. Checking every intermediate therefore catches all precision loss,
 * including the case where two rounded terms later cancel to a plausible result.
 */
export function checkedMul(x: number, y: number): number {
  return checkSafe(x * y);
}

/** Returns x + y, throwing RangeError unless the sum is a safe integer (see {@link checkedMul}). */
export function checkedAdd(x: number, y: number): number {
  return checkSafe(x + y);
}

function checkSafe(n: number): number {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Integer arithmetic left the exact range (|n| ≤ 2^53 − 1): ${n}`);
  }
  return n + 0;
}

/** The additive identity, 0. */
export const ZERO: Eisenstein = eis(0, 0);

/** The multiplicative identity, 1. */
export const ONE: Eisenstein = eis(1, 0);

/** The generator ω = e^{2πi/3}, a primitive cube root of unity (ω³ = 1, 1 + ω + ω² = 0). */
export const OMEGA: Eisenstein = eis(0, 1);

/** Returns true when x and y are the same lattice point. */
export function equals(x: Eisenstein, y: Eisenstein): boolean {
  return x.a === y.a && x.b === y.b;
}

/** Returns x + y, added componentwise: (a + c) + (b + d)ω. */
export function add(x: Eisenstein, y: Eisenstein): Eisenstein {
  return eis(x.a + y.a, x.b + y.b);
}

/** Returns −z = (−a) + (−b)ω. */
export function neg(z: Eisenstein): Eisenstein {
  return eis(-z.a, -z.b);
}

/** Returns x − y. */
export function sub(x: Eisenstein, y: Eisenstein): Eisenstein {
  return eis(x.a - y.a, x.b - y.b);
}

/**
 * Returns the product x·y.
 *
 * Formula: from ω² = −1 − ω,
 * (a + bω)(c + dω) = (ac − bd) + (ad + bc − bd)ω.
 */
export function mul(x: Eisenstein, y: Eisenstein): Eisenstein {
  const { a, b } = x;
  const { a: c, b: d } = y;
  const bd = checkedMul(b, d);
  return eis(
    checkedAdd(checkedMul(a, c), -bd),
    checkedAdd(checkedAdd(checkedMul(a, d), checkedMul(b, c)), -bd),
  );
}

/**
 * Returns the complex conjugate of z.
 *
 * Formula: ω̄ = ω² = −1 − ω, so conj(a + bω) = (a − b) − bω.
 */
export function conj(z: Eisenstein): Eisenstein {
  return eis(z.a - z.b, -z.b);
}

/**
 * Returns the norm N(z) = z·z̄ = a² − ab + b².
 *
 * This is the squared Euclidean length with the basis vectors at unit length,
 * and it is a non-negative integer, which keeps distance comparisons exact.
 * Throws RangeError if any intermediate leaves the safe-integer range.
 * N is multiplicative: N(zw) = N(z)N(w) (Hardy & Wright §12.9).
 */
export function norm(z: Eisenstein): number {
  return checkedAdd(checkedAdd(checkedMul(z.a, z.a), -checkedMul(z.a, z.b)), checkedMul(z.b, z.b));
}

/**
 * Rotates z by 60° (π/3 radians) counter-clockwise about the origin.
 *
 * Formula: multiplication by the unit e^{iπ/3} = 1 + ω (= −ω²), a primitive
 * 6th root of unity, so (a + bω)(1 + ω) = (a − b) + aω. Applying it six times
 * returns z (rot60⁶ = identity) and three times negates it. Exact in integers,
 * unlike a float rotation matrix.
 */
export function rot60(z: Eisenstein): Eisenstein {
  return eis(z.a - z.b, z.a);
}
