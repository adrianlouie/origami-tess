import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  ONE,
  OMEGA,
  ZERO,
  add,
  conj,
  eis,
  equals,
  mul,
  neg,
  norm,
  rot60,
  sub,
  type Eisenstein,
} from "./eisenstein";

/**
 * Bounded so every intermediate stays a safe integer: N(z) <= 3e6 here, so
 * N(z)N(w) <= 9e12 and triple products are far below 2^53.
 */
const coord = fc.integer({ min: -1_000, max: 1_000 });
const eisenstein = fc.tuple(coord, coord).map(([a, b]) => eis(a, b));

/** Apply `f` to `z` exactly `n` times. */
function iterate(f: (z: Eisenstein) => Eisenstein, n: number, z: Eisenstein) {
  let out = z;
  for (let i = 0; i < n; i++) out = f(out);
  return out;
}

describe("rot60 (rotation by 60° = multiplication by the unit 1 + ω)", () => {
  it("rot60^6 is the identity (a primitive 6th root of unity has order 6)", () => {
    fc.assert(
      fc.property(eisenstein, (z) => equals(iterate(rot60, 6, z), z)),
    );
  });

  it("rot60^3 is negation (rotation by 180°)", () => {
    fc.assert(
      fc.property(eisenstein, (z) => equals(iterate(rot60, 3, z), neg(z))),
    );
  });

  it("rot60 has order exactly 6 on 1 (no smaller power is the identity)", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      expect(equals(iterate(rot60, n, ONE), ONE)).toBe(false);
    }
  });

  it("rot60 equals multiplication by 1 + ω", () => {
    const unit = add(ONE, OMEGA);
    fc.assert(fc.property(eisenstein, (z) => equals(rot60(z), mul(z, unit))));
  });

  it("rot60 preserves the norm (rotations are isometries)", () => {
    fc.assert(fc.property(eisenstein, (z) => norm(rot60(z)) === norm(z)));
  });
});

describe("cube roots of unity", () => {
  it("ω^3 = 1", () => {
    expect(equals(mul(OMEGA, mul(OMEGA, OMEGA)), ONE)).toBe(true);
  });

  it("1 + ω + ω² = 0", () => {
    const w2 = mul(OMEGA, OMEGA);
    expect(equals(add(ONE, add(OMEGA, w2)), ZERO)).toBe(true);
  });
});

describe("commutative ring axioms (Z[ω] is a ring)", () => {
  it("addition is commutative and associative", () => {
    fc.assert(
      fc.property(eisenstein, eisenstein, eisenstein, (x, y, z) => {
        return (
          equals(add(x, y), add(y, x)) &&
          equals(add(add(x, y), z), add(x, add(y, z)))
        );
      }),
    );
  });

  it("multiplication is commutative and associative", () => {
    fc.assert(
      fc.property(eisenstein, eisenstein, eisenstein, (x, y, z) => {
        return (
          equals(mul(x, y), mul(y, x)) &&
          equals(mul(mul(x, y), z), mul(x, mul(y, z)))
        );
      }),
    );
  });

  it("multiplication distributes over addition", () => {
    fc.assert(
      fc.property(eisenstein, eisenstein, eisenstein, (x, y, z) =>
        equals(mul(x, add(y, z)), add(mul(x, y), mul(x, z))),
      ),
    );
  });

  it("ZERO and ONE are the additive and multiplicative identities", () => {
    fc.assert(
      fc.property(
        eisenstein,
        (z) => equals(add(z, ZERO), z) && equals(mul(z, ONE), z),
      ),
    );
  });

  it("z + (-z) = 0 and sub(x, y) = x + (-y)", () => {
    fc.assert(
      fc.property(
        eisenstein,
        eisenstein,
        (x, y) =>
          equals(add(x, neg(x)), ZERO) && equals(sub(x, y), add(x, neg(y))),
      ),
    );
  });
});

describe("norm N(z) = a² − ab + b² (squared Euclidean length)", () => {
  it("is multiplicative: N(zw) = N(z)N(w)", () => {
    fc.assert(
      fc.property(
        eisenstein,
        eisenstein,
        (z, w) => norm(mul(z, w)) === norm(z) * norm(w),
      ),
    );
  });

  it("equals z times its conjugate", () => {
    fc.assert(
      fc.property(eisenstein, (z) =>
        equals(mul(z, conj(z)), eis(norm(z), 0)),
      ),
    );
  });

  it("is non-negative and zero only at the origin", () => {
    fc.assert(
      fc.property(
        eisenstein,
        (z) => norm(z) >= 0 && (norm(z) === 0) === equals(z, ZERO),
      ),
    );
  });

  it("the six unit vectors all have norm 1", () => {
    let z = ONE;
    for (let i = 0; i < 6; i++) {
      expect(norm(z)).toBe(1);
      z = rot60(z);
    }
  });
});

describe("conj (complex conjugation)", () => {
  it("is an involution that preserves the norm", () => {
    fc.assert(
      fc.property(
        eisenstein,
        (z) => equals(conj(conj(z)), z) && norm(conj(z)) === norm(z),
      ),
    );
  });
});

describe("eis constructor (exact integers only)", () => {
  it("rejects non-integer coordinates", () => {
    expect(() => eis(0.5, 0)).toThrow();
    expect(() => eis(0, 1.25)).toThrow();
    expect(() => eis(NaN, 0)).toThrow();
    expect(() => eis(Infinity, 0)).toThrow();
  });

  it("rejects integers beyond the safe range", () => {
    expect(() => eis(2 ** 53, 0)).toThrow();
  });

  it("normalises -0 to 0 so Object.is-style comparisons agree", () => {
    const z = eis(-0, -0);
    expect(Object.is(z.a, 0)).toBe(true);
    expect(Object.is(z.b, 0)).toBe(true);
    expect(Object.is(neg(ZERO).a, 0)).toBe(true);
  });
});
