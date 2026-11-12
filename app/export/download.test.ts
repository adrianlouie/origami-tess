import { describe, expect, it } from "vitest";
import { GADGET_ENTRIES } from "../viewer/gadgets";
import { creasePatternToSvg } from "../render/crease-svg";
import { exportFile, slug } from "./download";
import { creasePatternToPdf } from "./pdf";
import { foldStepsToPdf } from "./steps-pdf";
import { foldStepsToSvg } from "../render/steps-svg";

describe("slug", () => {
  it("makes a lower-case, dash-separated file stem", () => {
    expect(slug("Hexagon twist (1, 2)")).toBe("hexagon-twist-1-2");
    expect(slug("Star twist, partial")).toBe("star-twist-partial");
    expect(slug("  --A//B--  ")).toBe("a-b");
  });

  it("never returns an empty stem", () => {
    expect(slug("***")).toBe("pattern");
    expect(slug("")).toBe("pattern");
  });

  it("gives every shipped gadget a different stem", () => {
    const stems = GADGET_ENTRIES.map((e) => slug(e.name));
    expect(new Set(stems).size).toBe(stems.length);
  });
});

describe("exportFile", () => {
  const entry = GADGET_ENTRIES[0]!;
  const cp = entry.build();

  it("exports the renderer's SVG under a .svg name", () => {
    const f = exportFile(cp, entry.name, "svg", "a4");
    expect(f.filename).toBe("hexagon-twist-1-2-cp.svg");
    expect(f.mime).toBe("image/svg+xml");
    expect(f.data).toBe(creasePatternToSvg(cp));
  });

  it("exports the writer's PDF under a .pdf name, on the chosen page", () => {
    for (const page of ["a4", "letter"] as const) {
      const f = exportFile(cp, entry.name, "pdf", page);
      expect(f.filename).toBe("hexagon-twist-1-2-cp.pdf");
      expect(f.mime).toBe("application/pdf");
      expect(f.data).toEqual(creasePatternToPdf(cp, { page }));
    }
    const a4 = exportFile(cp, entry.name, "pdf", "a4").data as Uint8Array;
    const letter = exportFile(cp, entry.name, "pdf", "letter").data as Uint8Array;
    expect(a4).not.toEqual(letter);
  });

  it("exports the folding steps as a PDF and as an SVG sheet", () => {
    const pdf = exportFile(cp, entry.name, "steps-pdf", "letter");
    expect(pdf.filename).toBe("hexagon-twist-1-2-steps.pdf");
    expect(pdf.mime).toBe("application/pdf");
    expect(pdf.data).toEqual(foldStepsToPdf(cp, entry.name, { page: "letter" }));
    const svg = exportFile(cp, entry.name, "steps-svg", "a4");
    expect(svg.filename).toBe("hexagon-twist-1-2-steps.svg");
    expect(svg.mime).toBe("image/svg+xml");
    expect(svg.data).toBe(foldStepsToSvg(cp, entry.name));
  });

  it("rejects an unknown kind", () => {
    expect(() => exportFile(cp, entry.name, "png" as never, "a4")).toThrow(RangeError);
  });
});
