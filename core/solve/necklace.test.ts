import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canonicalRotation, necklaceCount } from "./necklace";

describe("necklaceCount (Lang Eq. 3.1, Table 3.1)", () => {
  it("matches the book's table for n = 3 to 12", () => {
    const table = [4, 6, 8, 14, 20, 36, 60, 108, 188, 352];
    table.forEach((expected, i) => expect(necklaceCount(i + 3)).toBe(expected));
  });

  it("gives 2 and 3 for one and two corners", () => {
    expect(necklaceCount(1)).toBe(2);
    expect(necklaceCount(2)).toBe(3);
  });

  it("equals the number of distinct canonical rotations of all 2^n words (brute force)", () => {
    for (let n = 1; n <= 14; n++) {
      const seen = new Set<string>();
      for (let bits = 0; bits < 1 << n; bits++) {
        const word = Array.from({ length: n }, (_, i) => (bits >> i) & 1);
        seen.add(canonicalRotation(word).join(""));
      }
      expect(seen.size).toBe(necklaceCount(n));
    }
  });

  it("rejects non-positive and non-integer n, and throws instead of passing 2^53", () => {
    for (const n of [0, -1, 2.5, Number.NaN]) expect(() => necklaceCount(n)).toThrow(RangeError);
    expect(() => necklaceCount(60)).toThrow(RangeError);
  });
});

describe("canonicalRotation", () => {
  it("returns the least rotation", () => {
    expect(canonicalRotation([1, 0, 0, 1, 0])).toEqual([0, 0, 1, 0, 1]);
    expect(canonicalRotation([])).toEqual([]);
    expect(canonicalRotation([3])).toEqual([3]);
  });

  it("is idempotent and unchanged by rotating the word", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 12 }),
        fc.nat(20),
        (word, shift) => {
          const k = shift % word.length;
          const rotated = [...word.slice(k), ...word.slice(0, k)];
          const c = canonicalRotation(word);
          expect(canonicalRotation(rotated)).toEqual(c);
          expect(canonicalRotation(c)).toEqual(c);
          expect(c).toHaveLength(word.length);
        },
      ),
    );
  });
});

describe("canonicalRotation is the least rotation (brute force)", () => {
  it("equals the smallest of all n rotations compared as strings of digits", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 12 }),
        (word) => {
          const rotations = word.map((_, k) => [...word.slice(k), ...word.slice(0, k)]);
          const least = rotations.map((r) => r.join("")).sort()[0]!;
          expect(canonicalRotation(word).join("")).toBe(least);
        },
      ),
    );
  });
});
