import { describe, expect, it } from "vitest";
import {
  binaryMarkDecisionFromAwarded,
  markForBinaryDecision,
  responseModeUsesBinaryMarking,
  validateMarkTotalWithinMax,
} from "@/lib/marking-scoring";

describe("structured marking scoring", () => {
  it("uses binary marking for numerical and multiple-choice questions only", () => {
    expect(responseModeUsesBinaryMarking("numerical")).toBe(true);
    expect(responseModeUsesBinaryMarking("multiple_choice")).toBe(true);
    expect(responseModeUsesBinaryMarking("typed_text")).toBe(false);
    expect(responseModeUsesBinaryMarking("typed_or_upload")).toBe(false);
    expect(responseModeUsesBinaryMarking("upload_pdf")).toBe(false);
  });

  it("awards full marks for correct and zero for incorrect structured responses", () => {
    expect(markForBinaryDecision("correct", 4)).toBe(4);
    expect(markForBinaryDecision("incorrect", 4)).toBe(0);
    expect(markForBinaryDecision("unmarked", 4)).toBeNull();
  });

  it("derives the saved binary decision from an existing mark", () => {
    expect(binaryMarkDecisionFromAwarded(undefined, 3)).toBe("unmarked");
    expect(binaryMarkDecisionFromAwarded(3, 3)).toBe("correct");
    expect(binaryMarkDecisionFromAwarded(0, 3)).toBe("incorrect");
    expect(binaryMarkDecisionFromAwarded(1.5, 3)).toBe("unmarked");
  });

  it("rejects rubric or manual totals above the question maximum", () => {
    expect(validateMarkTotalWithinMax(3, 4)).toBeNull();
    expect(validateMarkTotalWithinMax(4, 4)).toBeNull();
    expect(validateMarkTotalWithinMax(-0.5, 4)).toMatch(/zero or greater/);
    expect(validateMarkTotalWithinMax(4.5, 4)).toMatch(/cannot exceed the question maximum/);
  });
});
