import { describe, expect, it } from "vitest";
import { calculateAvailableMarks, calculateAwardedMarks, isFeedbackVisibleToStudent, validateAwardedMark } from "@/lib/marking";
import { isAllowedOwnerAal, requiresOwnerAal2 } from "@/lib/owner-security";
import { mineruWorkerInstructions, nextParserStatusForMinerUResult } from "@/lib/parser-jobs";
import { canAcceptOneFileForSlot, MAX_UPLOAD_BYTES, uploadSizeLabel, validatePdfUpload } from "@/lib/upload-policy";

describe("production owner security helpers", () => {
  it("requires owner AAL2 for sensitive production actions", () => {
    expect(requiresOwnerAal2("assessment.published")).toBe(true);
    expect(isAllowedOwnerAal("aal1", "assessment.published")).toBe(false);
    expect(isAllowedOwnerAal("aal2", "assessment.published")).toBe(true);
  });

  it("does not require AAL2 for read-only owner navigation", () => {
    expect(isAllowedOwnerAal("aal1", "owner.dashboard.viewed")).toBe(true);
  });
});

describe("strict upload policy", () => {
  it("accepts one non-empty PDF up to 10MB", () => {
    expect(validatePdfUpload({ name: "solution.pdf", size: MAX_UPLOAD_BYTES, type: "application/pdf" })).toEqual({ ok: true });
    expect(uploadSizeLabel()).toBe("10MB");
  });

  it("denies wrong type, empty files, and oversized PDFs", () => {
    expect(validatePdfUpload({ name: "solution.png", size: 1024, type: "image/png" }).ok).toBe(false);
    expect(validatePdfUpload({ name: "solution.pdf", size: 0, type: "application/pdf" }).ok).toBe(false);
    expect(validatePdfUpload({ name: "solution.pdf", size: MAX_UPLOAD_BYTES + 1, type: "application/pdf" }).ok).toBe(false);
  });

  it("locks a slot after any successful file or blank confirmation", () => {
    expect(canAcceptOneFileForSlot({ status: "pending" })).toBe(true);
    expect(canAcceptOneFileForSlot({ status: "uploaded", object_path: "answer-uploads/a.pdf" })).toBe(false);
    expect(canAcceptOneFileForSlot({ status: "blank_placeholder", locked_at: "2026-05-06T08:00:00.000Z" })).toBe(false);
  });
});

describe("marking and feedback helpers", () => {
  it("calculates totals and release visibility", () => {
    expect(calculateAwardedMarks([{ awarded_marks: 4 }, { awarded_marks: 2.5 }])).toBe(6.5);
    expect(calculateAvailableMarks([{ max_marks: 5 }, { max_marks: 3 }])).toBe(8);
    expect(isFeedbackVisibleToStudent({ visible_to_student: true })).toBe(true);
    expect(isFeedbackVisibleToStudent(null)).toBe(false);
  });

  it("validates awarded marks against criterion maximums", () => {
    expect(validateAwardedMark(2, 3)).toBeNull();
    expect(validateAwardedMark(-1, 3)).toMatch(/zero or greater/);
    expect(validateAwardedMark(4, 3)).toMatch(/cannot exceed/);
  });
});

describe("MinerU parse job helpers", () => {
  it("treats MinerU output as owner-reviewed draft evidence", () => {
    expect(nextParserStatusForMinerUResult({ ok: true })).toBe("review_required");
    expect(nextParserStatusForMinerUResult({ ok: true, requiresOwnerReview: false })).toBe("succeeded");
    expect(nextParserStatusForMinerUResult({ ok: false })).toBe("failed");
    expect(mineruWorkerInstructions()).toContain("Mark the parse job review_required so the owner confirms structure before publish.");
  });
});
