import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { add, conj, eis, equals as eisEquals, norm, rot60, sub } from "../lattice/eisenstein";
import {
  IDENTITY,
  about,
  affine,
  apply,
  compose,
  equals,
  inverse,
  isIsometry,
  reflection,
  rotation60,
  translation,
  type Affine,
} from "./affine";

const coord = fc.integer({ min: -1000, max: 1000 });
const point = fc.record({ a: coord, b: coord }).map(({ a, b }) => eis(a, b));

/** A random lattice isometry: a short word in rotations, the reflection and translations. */
const generator: fc.Arbitrary<Affine> = fc.oneof(
  fc.integer({ min: 0, max: 5 }).map(rotation60),
  fc.constant(reflection()),
  point.map(translation),
);
const isometry: fc.Arbitrary<Affine> = fc
  .array(generator, { maxLength: 5 })
  .map((word) => word.reduce(compose, IDENTITY));

describe("affine group axioms (Armstrong, Groups and Symmetry, ch. 1)", () => {
  it("composition is associative", () => {
    fc.assert(
      fc.property(isometry, isometry, isometry, (f, g, h) => {
        expect(equals(compose(compose(f, g), h), compose(f, compose(g, h)))).toBe(true);
      }),
    );
  });

  it("the identity is a two-sided neutral element", () => {
    fc.assert(
      fc.property(isometry, (f) => {
        expect(equals(compose(IDENTITY, f), f)).toBe(true);
        expect(equals(compose(f, IDENTITY), f)).toBe(true);
      }),
    );
  });

  it("every element has a two-sided inverse", () => {
    fc.assert(
      fc.property(isometry, (f) => {
        expect(equals(compose(f, inverse(f)), IDENTITY)).toBe(true);
        expect(equals(compose(inverse(f), f), IDENTITY)).toBe(true);
      }),
    );
  });

  it("composition is closed: the result is a valid lattice affine map", () => {
    fc.assert(
      fc.property(isometry, isometry, (f, g) => {
        const { m, t } = compose(f, g);
        const [a, b, c, d] = m;
        expect(Math.abs(a * d - b * c)).toBe(1);
        expect([...m, t.a, t.b].every(Number.isSafeInteger)).toBe(true);
      }),
    );
  });
});

describe("apply and compose", () => {
  it("apply(compose(f, g), z) = apply(f, apply(g, z))", () => {
    fc.assert(
      fc.property(isometry, isometry, point, (f, g, z) => {
        expect(eisEquals(apply(compose(f, g), z), apply(f, apply(g, z)))).toBe(true);
      }),
    );
  });

  it("translation(t) adds t", () => {
    fc.assert(
      fc.property(point, point, (t, z) => {
        expect(eisEquals(apply(translation(t), z), add(z, t))).toBe(true);
      }),
    );
  });
});

describe("rotations and the reflection", () => {
  it("rotation60(1) agrees with rot60", () => {
    fc.assert(
      fc.property(point, (z) => {
        expect(eisEquals(apply(rotation60(1), z), rot60(z))).toBe(true);
      }),
    );
  });

  it("rotation60(1)^6 = identity (order 6)", () => {
    let f = IDENTITY;
    for (let i = 1; i < 6; i++) {
      f = compose(f, rotation60(1));
      expect(equals(f, IDENTITY)).toBe(false);
    }
    expect(equals(compose(f, rotation60(1)), IDENTITY)).toBe(true);
  });

  it("rotation60 reduces its exponent mod 6, including negatives", () => {
    expect(equals(rotation60(7), rotation60(1))).toBe(true);
    expect(equals(rotation60(-1), rotation60(5))).toBe(true);
  });

  it("reflection agrees with conj and is an involution", () => {
    fc.assert(
      fc.property(point, (z) => {
        expect(eisEquals(apply(reflection(), z), conj(z))).toBe(true);
      }),
    );
    expect(equals(compose(reflection(), reflection()), IDENTITY)).toBe(true);
  });

  it("satisfies the dihedral relation s r s = r^-1", () => {
    const r = rotation60(1);
    const s = reflection();
    expect(equals(compose(s, compose(r, s)), inverse(r))).toBe(true);
  });

  it("about(f, c) fixes the centre c", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), point, (k, c) => {
        expect(eisEquals(apply(about(rotation60(k), c), c), c)).toBe(true);
        expect(eisEquals(apply(about(reflection(), c), c), c)).toBe(true);
      }),
    );
  });
});

describe("isometries (norm N(z) = a^2 - ab + b^2 is the squared length)", () => {
  it("generated maps are isometries", () => {
    fc.assert(
      fc.property(isometry, (f) => {
        expect(isIsometry(f)).toBe(true);
      }),
    );
  });

  it("isometries preserve N(z - w)", () => {
    fc.assert(
      fc.property(isometry, point, point, (f, z, w) => {
        expect(norm(sub(apply(f, z), apply(f, w)))).toBe(norm(sub(z, w)));
      }),
    );
  });

  it("a shear is a lattice automorphism but not an isometry", () => {
    expect(isIsometry(affine([1, 1, 0, 1], eis(0, 0)))).toBe(false);
  });
});

describe("construction", () => {
  it("rejects a matrix whose determinant is not +-1", () => {
    expect(() => affine([2, 0, 0, 1], eis(0, 0))).toThrow(RangeError);
    expect(() => affine([1, 1, 1, 1], eis(0, 0))).toThrow(RangeError);
  });

  it("rejects non-integer entries", () => {
    expect(() => affine([1, 0.5, 0, 1], eis(0, 0))).toThrow(RangeError);
  });

  it("normalises negative zero so structural equality holds", () => {
    expect(Object.is(affine([1, -0, 0, 1], eis(0, 0)).m[1], 0)).toBe(true);
  });
});

describe("rotation60 argument validation", () => {
  it("rejects non-integer and non-finite step counts", () => {
    for (const k of [1.5, NaN, Infinity, -Infinity]) {
      expect(() => rotation60(k)).toThrow(RangeError);
    }
  });
});
