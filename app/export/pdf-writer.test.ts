import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { hexagonTwist } from "../../core/gadgets/hexagon-twist";
import { creaseLines } from "../../core/pattern/lines";
import { CREASE_STYLE } from "../render/crease-style";
import { creasePatternToPdf } from "./pdf";
import {
  num,
  pdfDocument,
  pdfString,
  strokeBlock,
  textBlock,
  textWidth,
  wrapText,
} from "./pdf-writer";

const latin = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

describe("pdfString", () => {
  it("escapes backslash and parentheses", () => {
    expect(pdfString("a(b)c\\d")).toBe("(a\\(b\\)c\\\\d)");
  });

  it("writes the degree sign as the WinAnsi octal escape \\260", () => {
    expect(pdfString("60°")).toBe("(60\\260)");
  });

  it("rejects any other non-ASCII character, so the file stays ASCII", () => {
    expect(() => pdfString("naïve")).toThrow(RangeError);
    expect(() => pdfString("tab\there")).toThrow(RangeError);
  });
});

describe("textWidth and wrapText", () => {
  it("measures Helvetica from the AFM advance widths", () => {
    expect(textWidth("", 10)).toBe(0);
    expect(textWidth("A", 10)).toBeCloseTo(6.67, 6);
    expect(textWidth("iii", 1000)).toBe(666);
    expect(textWidth("0°", 10)).toBeCloseTo(5.56 + 4, 6);
  });

  it("rejects text it has no width for", () => {
    expect(() => textWidth("é", 10)).toThrow(RangeError);
  });

  it("wraps greedily: lines fit, and the words rejoin to the input (property)", () => {
    const word = fc.stringMatching(/^[A-Za-z0-9.,:()°-]{1,12}$/);
    fc.assert(
      fc.property(
        fc.array(word, { minLength: 1, maxLength: 30 }),
        fc.double({ min: 60, max: 400, noNaN: true }),
        (words, width) => {
          const text = words.join(" ");
          const lines = wrapText(text, 11, width);
          expect(lines.join(" ")).toBe(text);
          for (const line of lines) {
            if (line.includes(" ")) expect(textWidth(line, 11)).toBeLessThanOrEqual(width + 1e-9);
          }
          // Greedy: the first word of the next line would not have fitted on this one.
          lines.slice(0, -1).forEach((line, i) => {
            const next = lines[i + 1]!.split(" ")[0]!;
            expect(textWidth(`${line} ${next}`, 11)).toBeGreaterThan(width);
          });
        },
      ),
    );
  });

  it("puts a word longer than the width on a line of its own", () => {
    expect(wrapText("a verylongwordindeed b", 11, 20)).toEqual(["a", "verylongwordindeed", "b"]);
  });

  it("gives no lines for empty text", () => {
    expect(wrapText("", 11, 100)).toEqual([]);
  });
});

describe("pdfDocument", () => {
  const page = (content: string) => ({ width: 200, height: 100, content });

  it("writes every page with exact xref offsets and the right /Count", () => {
    const pdf = latin(pdfDocument([page("0 0 m 1 1 l S\n"), page("1 1 m 2 2 l S\n"), page("")]));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    expect(/\/Count 3/.test(pdf)).toBe(true);
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const table = /xref\n0 (\d+)\n((?:\d{10} \d{5} [nf] \n)+)/.exec(pdf)!;
    const entries = table[2]!.match(/[\s\S]{20}/g)!;
    expect(entries).toHaveLength(Number(table[1]));
    entries.slice(1).forEach((entry, i) => {
      expect(pdf.slice(Number(entry.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true);
    });
    const streams = [...pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)];
    expect(streams).toHaveLength(3);
    for (const m of streams) expect(m[2]!.length).toBe(Number(m[1]));
  });

  it("adds one Helvetica font object only when asked", () => {
    const without = latin(pdfDocument([page("")]));
    const withFont = latin(pdfDocument([page("")], { font: true }));
    expect(without).not.toMatch(/Helvetica/);
    expect(withFont.match(/\/BaseFont \/Helvetica/g)).toHaveLength(1);
    expect(withFont).toMatch(/\/Font << \/F1 \d+ 0 R >>/);
  });

  it("refuses non-ASCII content, which would make the offsets wrong", () => {
    expect(() => pdfDocument([page("é")])).toThrow(RangeError);
  });

  it("ends every stream on a newline, so the last operator never glues to endstream", () => {
    const bytes = latin(pdfDocument([{ width: 100, height: 100, content: "0 0 m 1 1 l S" }]));
    expect(bytes).toContain("S\nendstream");
    expect(bytes).not.toContain("Sendstream");
    // /Length counts that newline, and the xref still points at every object.
    const length = Number(/\/Length (\d+)/.exec(bytes)![1]);
    expect(length).toBe("0 0 m 1 1 l S\n".length);
  });

  it("refuses text that names the font in a document built without it", () => {
    const content = textBlock("hi", 1, 2, 10);
    expect(() => pdfDocument([{ width: 100, height: 100, content }])).toThrow(RangeError);
    expect(() => pdfDocument([{ width: 100, height: 100, content }], { font: true })).not.toThrow();
  });

  it("refuses a document with no pages", () => {
    expect(() => pdfDocument([])).toThrow(RangeError);
  });
});

describe("content helpers", () => {
  it("refuses numbers a PDF cannot hold: NaN, Infinity and exponent forms", () => {
    expect(() => num(Number.NaN)).toThrow(RangeError);
    expect(() => num(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => num(1e21)).toThrow(RangeError);
    expect(num(123456789012)).toBe("123456789012.000");
  });

  it("formats numbers to three decimals without -0", () => {
    expect(num(1.23456)).toBe("1.235");
    expect(num(-0.0001)).toBe("0.000");
  });

  it("writes a text block with a font, size, position and escaped string", () => {
    expect(textBlock("Hi (1)", 10, 20, 11)).toBe(
      "BT\n/F1 11.000 Tf\n10.000 20.000 Td\n(Hi \\(1\\)) Tj\nET",
    );
  });

  it("writes a stroke block in the style's colour, width, cap and dash", () => {
    const cp = hexagonTwist(1, 2);
    const mine = creaseLines(cp).filter((l) => l.assignment === "M");
    const block = strokeBlock(CREASE_STYLE.M, 2, mine, () => "0.000 0.000").split("\n");
    expect(block[0]).toBe("q");
    expect(block).toContain("2.000 w");
    expect(block).toContain("[16.000 6.000 2.000 6.000] 0 d");
    expect(block.filter((l) => l.endsWith(" l S"))).toHaveLength(mine.length);
    expect(block.at(-1)).toBe("Q");
  });
});

describe("single-page writer after the refactor", () => {
  it("still makes a one-page file with no font", () => {
    const pdf = latin(creasePatternToPdf(hexagonTwist(1, 2)));
    expect(pdf).toMatch(/\/Count 1/);
    expect(pdf).not.toMatch(/Font/);
  });
});
