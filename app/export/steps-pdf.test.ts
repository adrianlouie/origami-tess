import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { foldSteps } from "../../core/pattern/fold-steps";
import { creaseLines } from "../../core/pattern/lines";
import { toCartesian } from "../render/cartesian";
import { CREASE_STYLE, FAINT_STYLE } from "../render/crease-style";
import { HIGHLIGHT_GRID_COLOR, stepCaption } from "../render/step-text";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { foldStepsToPdf } from "./steps-pdf";

const latin = (b: Uint8Array) => new TextDecoder("latin1").decode(b);
const rgbOf = (c: number) =>
  [(c >> 16) & 255, (c >> 8) & 255, c & 255].map((v) => (v / 255).toFixed(3)).join(" ");

type Seg = [number, number, number, number];
type Block = { rgb: string; width: number; dash: string; segs: Seg[] };
type Page = { w: number; h: number; text: string[]; blocks: Block[] };

function unescape(s: string): string {
  return s.replace(/\\(\d{3}|.)/g, (_, c: string) => (c === "260" ? "°" : c));
}

/** Pages of the file, parsed back: size, text lines and stroked blocks. */
function pages(pdf: string): Page[] {
  const boxes = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
  const streams = [...pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
  return streams.map((m, i) => {
    const stream = m[2]!;
    expect(stream.length).toBe(Number(m[1]));
    const blocks = [...stream.matchAll(/q\n([\s\S]*?)\nQ/g)].map((b) => ({
      rgb: /([\d. ]+) RG/.exec(b[1]!)![1]!,
      width: Number(/([\d.]+) w/.exec(b[1]!)![1]),
      dash: /\[([\d. ]*)\] 0 d/.exec(b[1]!)![1]!,
      segs: [...b[1]!.matchAll(/([\d.-]+) ([\d.-]+) m ([\d.-]+) ([\d.-]+) l S/g)].map(
        (s) => [Number(s[1]), Number(s[2]), Number(s[3]), Number(s[4])] as Seg,
      ),
    }));
    const text = [...stream.matchAll(/\n\((.*)\) Tj\nET/g)].map((t) => unescape(t[1]!));
    return { w: Number(boxes[i]![1]), h: Number(boxes[i]![2]), text, blocks };
  });
}

/** True when the two lists hold the same segments (as a multiset), to within 0.05 point. */
function sameSegs(actual: readonly Seg[], expected: readonly Seg[]): boolean {
  if (actual.length !== expected.length) return false;
  const left = [...actual];
  return expected.every((e) => {
    const k = left.findIndex((a) => a.every((n, j) => Math.abs(n - e[j]!) < 0.05));
    if (k < 0) return false;
    left.splice(k, 1);
    return true;
  });
}

describe.each(GADGET_ENTRIES)("foldStepsToPdf: $name", ({ name, build }) => {
  const cp = build();
  const steps = foldSteps(cp);
  const bytes = foldStepsToPdf(cp, name);
  const pdf = latin(bytes);
  const all = pages(pdf);

  it("is a valid ASCII PDF with a cover and one page per step", () => {
    expect([...bytes].every((b) => b < 128)).toBe(true);
    expect(all).toHaveLength(1 + steps.length);
    expect(pdf).toMatch(new RegExp(`/Count ${1 + steps.length}\\b`));
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
    const table = /xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] \n)+)/.exec(pdf)!;
    const entries = table[2]!.match(/[\s\S]{20}/g)!;
    expect(pdf.slice(start, start + 4)).toBe("xref");
    entries.slice(1).forEach((e, i) => {
      expect(pdf.slice(Number(e.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
  });

  // Every page shares one placement, so the cover tells us the lattice-to-page map.
  const lines = creaseLines(cp);
  const cover = all[0]!;
  const coverSegs = cover.blocks.flatMap((b) => b.segs);
  const order = ["F", "U", "B", "V", "M"] as const;
  const inDrawOrder = order.flatMap((a) => lines.filter((l) => l.assignment === a));
  const p0 = toCartesian(inDrawOrder[0]!.from);
  const p1 = toCartesian(inDrawOrder[0]!.to);
  const scale =
    Math.hypot(coverSegs[0]![2] - coverSegs[0]![0], coverSegs[0]![3] - coverSegs[0]![1]) /
    Math.hypot(p1.x - p0.x, p1.y - p0.y);
  const ox = coverSegs[0]![0] - p0.x * scale;
  const oy = coverSegs[0]![1] - p0.y * scale;
  const at = (z: Parameters<typeof toCartesian>[0]): [number, number] => {
    const p = toCartesian(z);
    return [p.x * scale + ox, p.y * scale + oy];
  };
  const seg = (l: {
    from: Parameters<typeof toCartesian>[0];
    to: Parameters<typeof toCartesian>[0];
  }): Seg => [...at(l.from), ...at(l.to)];

  it("opens with the name and the full pattern in M/V styles", () => {
    expect(cover.text.join(" ")).toContain(name);
    expect(coverSegs).toHaveLength(lines.length);
    inDrawOrder.forEach((l, i) => expect(sameSegs([coverSegs[i]!], [seg(l)])).toBe(true));
    const m = cover.blocks.find((b) => b.rgb === rgbOf(CREASE_STYLE.M.color));
    expect(m?.width).toBeCloseTo(CREASE_STYLE.M.width, 3);
    expect(m?.dash).toBe(CREASE_STYLE.M.dash.map((d) => d.toFixed(3)).join(" "));
  });

  it("gives step i its caption and its own lines in full colour, the rest faint", () => {
    steps.forEach((step, i) => {
      const page = all[i + 1]!;
      expect(page.text.join(" "), `step ${i}`).toBe(stepCaption(steps, i, "print"));
      const faint = page.blocks.filter((b) => b.rgb === rgbOf(FAINT_STYLE.color));
      const mv = (c: number) => page.blocks.filter((b) => b.rgb === rgbOf(c));
      if (step.kind === "collapse") {
        expect(faint).toHaveLength(0);
        expect(
          sameSegs(
            page.blocks.flatMap((b) => b.segs),
            coverSegs,
          ),
        ).toBe(true);
        return;
      }
      const nonBorder = lines.filter((l) => l.assignment !== "B");
      expect(
        sameSegs(
          faint.flatMap((b) => b.segs),
          nonBorder.map(seg),
        ),
      ).toBe(true);
      const color =
        step.kind === "grid" ? HIGHLIGHT_GRID_COLOR : CREASE_STYLE[step.assignment].color;
      const mine = (step.kind === "grid" ? step.segments : step.lines).map(seg);
      expect(
        sameSegs(
          mv(color).flatMap((b) => b.segs),
          mine,
        ),
        `step ${i}`,
      ).toBe(true);
      // Nothing else is in a mountain or valley colour.
      for (const a of ["M", "V"] as const) {
        if (step.kind === "crease" && step.assignment === a) continue;
        expect(mv(CREASE_STYLE[a].color)).toHaveLength(0);
      }
      // Crease steps keep their dash so a black-and-white print still reads.
      if (step.kind === "crease") {
        expect(mv(color)[0]!.dash).toBe(
          CREASE_STYLE[step.assignment].dash.map((d) => d.toFixed(3)).join(" "),
        );
      }
    });
  });

  it("keeps every drawn line inside the margins and below the caption", () => {
    for (const [i, page] of all.entries()) {
      const textLines = page.text.length;
      const ys = page.blocks.flatMap((b) => b.segs.flatMap((s) => [s[1], s[3]]));
      const xs = page.blocks.flatMap((b) => b.segs.flatMap((s) => [s[0], s[2]]));
      expect(Math.min(...xs), `page ${i}`).toBeGreaterThanOrEqual(36 - 1e-3);
      expect(Math.max(...xs)).toBeLessThanOrEqual(page.w - 36 + 1e-3);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(36 - 1e-3);
      expect(Math.max(...ys)).toBeLessThanOrEqual(page.h - 36 - 14 * textLines + 1e-3);
    }
  });

  it("is deterministic", () => {
    expect(foldStepsToPdf(cp, name)).toEqual(bytes);
  });
});

describe("foldStepsToPdf options", () => {
  const cp = GADGET_ENTRIES[0]!.build();

  it("honours the page size and rejects bad options", () => {
    const a4 = pages(latin(foldStepsToPdf(cp, "x", { page: "a4", orientation: "portrait" })));
    const letter = pages(
      latin(foldStepsToPdf(cp, "x", { page: "letter", orientation: "portrait" })),
    );
    expect(a4[0]!.w).toBeCloseTo(595.28, 2);
    expect(letter[0]!.w).toBeCloseTo(612, 2);
    expect(() => foldStepsToPdf(cp, "x", { strokeWidth: 0 })).toThrow(RangeError);
    expect(() => foldStepsToPdf(cp, "x", { margin: -1 })).toThrow(RangeError);
  });

  it("escapes parentheses in the name and rejects a non-ASCII one", () => {
    expect(latin(foldStepsToPdf(cp, "A (b)"))).toContain("A \\(b\\)");
    expect(() => foldStepsToPdf(cp, "Café")).toThrow(RangeError);
  });
});

describe("foldStepsToPdf over random options (property)", () => {
  const cp = GADGET_ENTRIES[0]!.build();
  const steps = foldSteps(cp);

  it("keeps every page one size, every line inside the margins and below the caption", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("a4", "letter"),
        fc.constantFrom("auto", "portrait", "landscape"),
        fc.integer({ min: 0, max: 120 }),
        (page, orientation, margin) => {
          const pdf = latin(foldStepsToPdf(cp, "Hexagon twist", { page, orientation, margin }));
          const all = pages(pdf);
          expect(all).toHaveLength(1 + steps.length);
          // Every caption baseline on a page, to compare with the drawing below it.
          const streams = [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map((m) => m[1]!);
          all.forEach((pg, i) => {
            expect([pg.w, pg.h]).toEqual([all[0]!.w, all[0]!.h]);
            const xs = pg.blocks.flatMap((b) => b.segs.flatMap((q) => [q[0], q[2]]));
            const ys = pg.blocks.flatMap((b) => b.segs.flatMap((q) => [q[1], q[3]]));
            expect(Math.min(...xs)).toBeGreaterThanOrEqual(margin - 1e-3);
            expect(Math.max(...xs)).toBeLessThanOrEqual(pg.w - margin + 1e-3);
            expect(Math.min(...ys)).toBeGreaterThanOrEqual(margin - 1e-3);
            const baselines = [...streams[i]!.matchAll(/([\d.-]+) ([\d.-]+) Td/g)].map((t) =>
              Number(t[2]),
            );
            expect(baselines.length).toBeGreaterThan(0);
            expect(Math.max(...ys)).toBeLessThanOrEqual(Math.min(...baselines) + 1e-3);
          });
        },
      ),
      { numRuns: 25 },
    );
  });
});
