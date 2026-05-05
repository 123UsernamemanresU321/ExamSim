import { describe, expect, it } from "vitest";
import {
  assertOwnAttempt,
  canIssueUploadSlotUrl,
  canReleaseAttemptPackage,
  canSaveTextResponse,
  isAppendOnlyEventOperation,
} from "@/lib/attempt-access";

describe("mocked Edge access invariants", () => {
  it("denies package release while WAITING", () => {
    expect(canReleaseAttemptPackage("WAITING")).toBe(false);
  });

  it("allows package release when ACTIVE", () => {
    expect(canReleaseAttemptPackage("ACTIVE")).toBe(true);
  });

  it("denies upload URLs after FINISHED_REVIEW", () => {
    expect(canIssueUploadSlotUrl({ state: "FINISHED_REVIEW", uploadsDuringActive: true })).toBe(false);
  });

  it("requires own attempt access", () => {
    expect(assertOwnAttempt("student_a", "student_a")).toBe(true);
    expect(assertOwnAttempt("student_a", "student_b")).toBe(false);
  });

  it("keeps attempt event operations append-only", () => {
    expect(isAppendOnlyEventOperation("insert")).toBe(true);
    expect(isAppendOnlyEventOperation("update")).toBe(false);
    expect(isAppendOnlyEventOperation("delete")).toBe(false);
  });

  it("only autosaves typed responses while ACTIVE", () => {
    expect(canSaveTextResponse({ state: "ACTIVE", typedEnabled: true })).toBe(true);
    expect(canSaveTextResponse({ state: "UPLOAD_ONLY", typedEnabled: true })).toBe(false);
    expect(canSaveTextResponse({ state: "ACTIVE", typedEnabled: false })).toBe(false);
  });
});
