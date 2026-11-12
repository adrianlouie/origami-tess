import { describe, expect, it } from "vitest";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { triangleTwist } from "../../core/gadgets/triangle-twist";
import { eis } from "../../core/lattice/eisenstein";
import { fromSegments, type Assignment } from "../../core/pattern/crease-pattern";
import { creaseLines } from "../../core/pattern/lines";
import { toCartesian } from "../render/cartesian";
import { CREASE_STYLE } from "../render/crease-style";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { extentOf, fitToPage, PAGE_SIZES } from "./page";
import { creasePatternToPdf } from "./pdf";

const text = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

type Seg = { x1: number; y1: number; x2: number; y2: number };
type Block = { rgb: number[]; width: number; dash: number[]; cap: number; segs: Seg[] };

/** The stroked blocks of the page's content stream, parsed back out of the file. */
function blocks(pdf: string): Block[] {
  const stream = /stream\n([\s\S]*?)endstream/.exec(pdf)![1]!;
  return [...stream.matchAll(/q\n([\s\S]*?)\nQ/g)].map((m) => {
    const body = m[1]!;
    const nums = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(Number);
    const rgb = nums(/([\d. ]+) RG/.exec(body)![1]!);
    const width = Number(/([\d.]+) w/.exec(body)![1]);
    const dash = nums(/\[([\d. ]*)\] 0 d/.exec(body)![1]!);
    const cap = Number(/(\d) J/.exec(body)![1]);
    const segs = [...body.matchAll(/([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S/g)].map((s) => ({
      x1: Number(s[1]),
      y1: Number(s[2]),
      x2: Number(s[3]),
      y2: Number(s[4]),
    }));
    return { rgb, width, dash, cap, segs };
  });
}

describe("creasePatternToPdf", () => {
  it("is a structurally valid PDF: header, exact xref offsets, startxref and EOF", () => {
    for (const { name, build } of GADGET_ENTRIES) {
      const pdf = text(creasePatternToPdf(build()));
      expect(pdf.startsWith("%PDF-1.4\n"), name).toBe(true);
      expect(pdf.endsWith("%%EOF\n"), name).toBe(true);
      const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
      expect(pdf.slice(start, start + 4)).toBe("xref");
      const table = /xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] \n)+)/.exec(pdf)!;
      const count = Number(table[1]);
      const entries = table[2]!.match(/[\s\S]{20}/g)!;
      expect(entries).toHaveLength(count);
      entries.slice(1).forEach((entry, i) => {
        const off = Number(entry.slice(0, 10));
        expect(pdf.slice(off).startsWith(`${i + 1} 0 obj`), `${name} object ${i + 1}`).toBe(true);
      });
      // The stream length in the dictionary is the real byte length.
      const len = Number(/\/Length (\d+)/.exec(pdf)![1]);
      const body = /stream\n([\s\S]*?)endstream/.exec(pdf)![1]!;
      expect(body.length).toBe(len);
    }
  });

  it("draws each maximal crease line at its scaled place, with its colour, dash and cap", () => {
    for (const { name, build } of GADGET_ENTRIES) {
      const cp = build();
      const bytes = text(creasePatternToPdf(cp, { page: "a4", margin: 36, strokeWidth: 1 }));
      const fit = fitToPage(extentOf(cp.vertices.map(toCartesian)), "a4", 36, "auto");
      const ext = extentOf(cp.vertices.map(toCartesian));
      const place = (z: Parameters<typeof toCartesian>[0]) => {
        const p = toCartesian(z);
        return [
          (p.x - ext.minX) * fit.scale + fit.offsetX,
          (p.y - ext.minY) * fit.scale + fit.offsetY,
        ];
      };

      const lines = creaseLines(cp);
      const drawn = blocks(bytes).flatMap((b) => b.segs.map((s) => ({ b, s })));
      expect(drawn, name).toHaveLength(lines.length);
      for (const l of lines) {
        const [x1, y1] = place(l.from);
        const [x2, y2] = place(l.to);
        const hit = drawn.find(
          ({ s }) => Math.hypot(s.x1 - x1!, s.y1 - y1!, s.x2 - x2!, s.y2 - y2!) < 2e-3,
        );
        expect(hit, `${name} line ${l.edges[0]}`).toBeDefined();
        const style = CREASE_STYLE[l.assignment as Assignment];
        const { b } = hit!;
        expect(b.rgb.map((c) => Math.round(c * 255))).toEqual([
          (style.color >> 16) & 255,
          (style.color >> 8) & 255,
          style.color & 255,
        ]);
        expect(b.width).toBeCloseTo(style.width, 3);
        style.dash.forEach((d, i) => expect(b.dash[i]).toBeCloseTo(d, 3));
        expect(b.dash).toHaveLength(style.dash.length);
        expect(b.cap).toBe(style.dash.includes(0) ? 1 : 0);
      }
    }
  });

  it("keeps the drawing inside the page margins, on A4 and Letter", () => {
    for (const page of ["a4", "letter"] as const) {
      const pdf = text(creasePatternToPdf(triangleTwist(6, 2), { page, margin: 36 }));
      const media = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf)!;
      const [w, h] = [Number(media[1]), Number(media[2])];
      expect(Math.min(w, h)).toBeCloseTo(Math.min(PAGE_SIZES[page].width, PAGE_SIZES[page].height));
      for (const { segs } of blocks(pdf)) {
        for (const s of segs) {
          for (const [x, y] of [
            [s.x1, s.y1],
            [s.x2, s.y2],
          ] as const) {
            expect(x).toBeGreaterThanOrEqual(36 - 1e-2);
            expect(y).toBeGreaterThanOrEqual(36 - 1e-2);
            expect(x).toBeLessThanOrEqual(w - 36 + 1e-2);
            expect(y).toBeLessThanOrEqual(h - 36 + 1e-2);
          }
        }
      }
    }
  });

  it("does not flip the pattern: PDF is y-up like the lattice", () => {
    const cp = fromSegments([], [{ from: eis(0, 0), to: eis(0, 2), assignment: "M" }]);
    const [s] = blocks(text(creasePatternToPdf(cp, { orientation: "portrait" })))[0]!.segs;
    // ω points up-left in the plane, so the far end is higher on the page and left of the near end.
    const [lo, hi] =
      s!.y1 < s!.y2
        ? [
            [s!.x1, s!.y1],
            [s!.x2, s!.y2],
          ]
        : [
            [s!.x2, s!.y2],
            [s!.x1, s!.y1],
          ];
    expect(hi![1]).toBeGreaterThan(lo![1]!);
    const farIsEnd = s!.y2 > s!.y1;
    expect(farIsEnd ? s!.x2 < s!.x1 : s!.x1 < s!.x2).toBe(true);
  });

  it("makes an empty pattern a valid blank page", () => {
    const pdf = text(creasePatternToPdf(fromSegments([eis(0, 0)], [])));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(blocks(pdf)).toEqual([]);
  });

  it("is deterministic (no dates or ids) and rejects bad options", () => {
    const cp = hexagonTwist(1, 2);
    expect(creasePatternToPdf(cp)).toEqual(creasePatternToPdf(cp));
    expect(() => creasePatternToPdf(cp, { strokeWidth: 0 })).toThrow(RangeError);
    expect(() => creasePatternToPdf(cp, { margin: -1 })).toThrow(RangeError);
    expect(() => creasePatternToPdf(cp, { page: "a0" as never })).toThrow(RangeError);
  });

  it("matches the byte snapshot for the hexagon twist (1, 2) on A4", async () => {
    await expect(text(creasePatternToPdf(hexagonTwist(1, 2)))).toMatchFileSnapshot(
      "./__snapshots__/crease-hexagon-1-2.pdf.txt",
    );
  });
});
