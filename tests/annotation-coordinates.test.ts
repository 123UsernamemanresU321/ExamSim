import { describe, expect, it } from "vitest";
import {
  clampNormalized,
  normalizedRectToScreen,
  normalizedToPdf,
  normalizedToScreen,
  pdfToNormalized,
  screenRectToNormalized,
  screenToNormalized,
} from "@/lib/annotation-coordinates";

describe("annotation coordinate mapping", () => {
  const viewport = { width: 1000, height: 2000 };
  const pdf = { width: 500, height: 1000 };

  it("maps screen points to normalized page coordinates", () => {
    expect(screenToNormalized({ x: 250, y: 500 }, viewport)).toEqual({ x: 0.25, y: 0.25 });
    expect(screenToNormalized({ x: -20, y: 2200 }, viewport)).toEqual({ x: 0, y: 1 });
  });

  it("maps normalized page coordinates back to screen points", () => {
    expect(normalizedToScreen({ x: 0.4, y: 0.75 }, viewport)).toEqual({ x: 400, y: 1500 });
  });

  it("normalizes dragged rectangles regardless of drag direction", () => {
    expect(screenRectToNormalized({ x: 800, y: 1600, width: -300, height: -400 }, viewport)).toEqual({
      x: 0.5,
      y: 0.6,
      width: 0.3,
      height: 0.2,
    });
  });

  it("maps normalized rectangles to rendered screen rectangles", () => {
    expect(normalizedRectToScreen({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }, viewport)).toEqual({
      x: 100,
      y: 400,
      width: 300,
      height: 800,
    });
  });

  it("converts normalized coordinates to PDF coordinates with Y-axis inversion", () => {
    expect(normalizedToPdf({ x: 0.25, y: 0.1 }, pdf)).toEqual({ x: 125, y: 900 });
  });

  it("converts PDF coordinates back to normalized browser coordinates", () => {
    expect(pdfToNormalized({ x: 125, y: 900 }, pdf)).toEqual({ x: 0.25, y: 0.1 });
  });

  it("clamps invalid normalized values", () => {
    expect(clampNormalized({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 });
  });
});
