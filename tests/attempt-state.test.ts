import { describe, expect, it } from "vitest";
import {
  computeAttemptState,
  getCountdownTarget,
  type AttemptStateInput,
} from "@/lib/attempt-state";

const base: AttemptStateInput = {
  serverNowUtc: "2026-05-05T06:00:00.000Z",
  startAtUtc: "2026-05-05T07:00:00.000Z",
  endAtUtc: "2026-05-05T09:00:00.000Z",
  uploadDeadlineAtUtc: "2026-05-05T09:30:00.000Z",
  solutionsRequested: true,
};

describe("computeAttemptState", () => {
  it("returns WAITING before the server start time", () => {
    expect(computeAttemptState(base)).toBe("WAITING");
  });

  it("returns ACTIVE between start and end", () => {
    expect(
      computeAttemptState({
        ...base,
        serverNowUtc: "2026-05-05T07:30:00.000Z",
      }),
    ).toBe("ACTIVE");
  });

  it("returns UPLOAD_ONLY after writing time when solutions are requested", () => {
    expect(
      computeAttemptState({
        ...base,
        serverNowUtc: "2026-05-05T09:10:00.000Z",
      }),
    ).toBe("UPLOAD_ONLY");
  });

  it("skips UPLOAD_ONLY when solutions are not requested", () => {
    expect(
      computeAttemptState({
        ...base,
        serverNowUtc: "2026-05-05T09:10:00.000Z",
        solutionsRequested: false,
      }),
    ).toBe("FINISHED_REVIEW");
  });

  it("returns FINISHED_REVIEW after the upload deadline", () => {
    expect(
      computeAttemptState({
        ...base,
        serverNowUtc: "2026-05-05T09:30:00.000Z",
      }),
    ).toBe("FINISHED_REVIEW");
  });
});

describe("getCountdownTarget", () => {
  it("maps states to the next server-controlled boundary", () => {
    expect(getCountdownTarget("WAITING", base)).toBe(base.startAtUtc);
    expect(getCountdownTarget("ACTIVE", base)).toBe(base.endAtUtc);
    expect(getCountdownTarget("UPLOAD_ONLY", base)).toBe(base.uploadDeadlineAtUtc);
    expect(getCountdownTarget("FINISHED_REVIEW", base)).toBeNull();
  });
});
