import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { extentOf, fitToPage, PAGE_SIZES } from "./page";

const box = (w: number, h: number) => ({ minX: 0, minY: 0, maxX: w, maxY: h });

describe("fitToPage reserveTop", () => {
  it("keeps the drawing below the reserved band and inside the margins (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 200, noNaN: true }),
        fc.constantFrom("a4", "letter"),
        fc.constantFrom("auto", "portrait", "landscape"),
        (w, h, band, page, orientation) => {
          const f = fitToPage(box(w, h), page, 36, orientation, band);
          expect(f.offsetY).toBeGreaterThanOrEqual(36 - 1e-9);
          expect(h * f.scale + f.offsetY).toBeLessThanOrEqual(f.height - 36 - band + 1e-9);
          expect(f.offsetX).toBeGreaterThanOrEqual(36 - 1e-9);
          expect(w * f.scale + f.offsetX).toBeLessThanOrEqual(f.width - 36 + 1e-9);
        },
      ),
    );
  });

  it("is the old behaviour at zero and shrinks the drawing otherwise", () => {
    const e = box(4, 6);
    expect(fitToPage(e, "a4", 36, "portrait", 0)).toEqual(fitToPage(e, "a4", 36, "portrait"));
    expect(fitToPage(e, "a4", 36, "portrait", 100).scale).toBeLessThan(
      fitToPage(e, "a4", 36, "portrait").scale,
    );
  });

  it("rejects a band that leaves no room", () => {
    expect(() => fitToPage(box(1, 1), "a4", 36, "portrait", -1)).toThrow(RangeError);
    expect(() => fitToPage(box(1, 1), "a4", 36, "portrait", 10_000)).toThrow(RangeError);
  });
});

describe("fitToPage", () => {
  it("uses one uniform scale and keeps the drawing inside the margins (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.double({ min: -20, max: 20, noNaN: true }),
        fc.constantFrom("a4", "letter"),
        fc.constantFrom("auto", "portrait", "landscape"),
        (w, h, x0, y0, page, orientation) => {
          const e = { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h };
          const f = fitToPage(e, page, 36, orientation);
          const lo = { x: (e.minX - e.minX) * f.scale + f.offsetX, y: f.offsetY };
          const hi = { x: w * f.scale + f.offsetX, y: h * f.scale + f.offsetY };
          expect(lo.x).toBeGreaterThanOrEqual(36 - 1e-9);
          expect(lo.y).toBeGreaterThanOrEqual(36 - 1e-9);
          expect(hi.x).toBeLessThanOrEqual(f.width - 36 + 1e-9);
          expect(hi.y).toBeLessThanOrEqual(f.height - 36 + 1e-9);
          // Centred: equal slack on both sides.
          expect(lo.x - 36).toBeCloseTo(f.width - 36 - hi.x, 6);
          expect(lo.y - 36).toBeCloseTo(f.height - 36 - hi.y, 6);
          // One scale touches the margin on at least one axis.
          const slackX = f.width - 72 - w * f.scale;
          const slackY = f.height - 72 - h * f.scale;
          expect(Math.min(slackX, slackY)).toBeCloseTo(0, 6);
        },
      ),
    );
  });

  it("auto picks landscape for a wide drawing and portrait for a tall one", () => {
    const wide = fitToPage(box(10, 1), "a4", 36, "auto");
    expect(wide.width).toBeGreaterThan(wide.height);
    const tall = fitToPage(box(1, 10), "a4", 36, "auto");
    expect(tall.height).toBeGreaterThan(tall.width);
  });

  it("honours a forced orientation and the page size", () => {
    const p = fitToPage(box(10, 1), "letter", 36, "portrait");
    expect([p.width, p.height]).toEqual([PAGE_SIZES.letter.width, PAGE_SIZES.letter.height]);
    const l = fitToPage(box(1, 10), "a4", 36, "landscape");
    expect([l.width, l.height]).toEqual([PAGE_SIZES.a4.height, PAGE_SIZES.a4.width]);
  });

  it("handles a point, a line and an empty drawing without dividing by zero", () => {
    for (const e of [box(0, 0), box(5, 0), box(0, 5), extentOf([])]) {
      const f = fitToPage(e, "a4", 36, "auto");
      expect(Number.isFinite(f.scale)).toBe(true);
      expect(f.scale).toBeGreaterThan(0);
      expect(Number.isFinite(f.offsetX) && Number.isFinite(f.offsetY)).toBe(true);
    }
  });

  it("rejects a bad margin, page, orientation or extent", () => {
    expect(() => fitToPage(box(1, 1), "a4", -1, "auto")).toThrow(RangeError);
    expect(() => fitToPage(box(1, 1), "a4", 300, "auto")).toThrow(RangeError);
    expect(() => fitToPage(box(1, 1), "a4", Number.NaN, "auto")).toThrow(RangeError);
    expect(() => fitToPage(box(1, 1), "a3" as never, 36, "auto")).toThrow(RangeError);
    expect(() => fitToPage(box(1, 1), "a4", 36, "tilted" as never)).toThrow(RangeError);
    expect(() => fitToPage({ minX: 1, minY: 0, maxX: 0, maxY: 1 }, "a4", 36, "auto")).toThrow(
      RangeError,
    );
  });
});

describe("extentOf", () => {
  it("is the bounding box, and zero for no points", () => {
    expect(
      extentOf([
        { x: 1, y: -2 },
        { x: -3, y: 4 },
      ]),
    ).toEqual({ minX: -3, minY: -2, maxX: 1, maxY: 4 });
    expect(extentOf([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 });
  });
});
