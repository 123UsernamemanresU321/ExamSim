import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildGuestResponseBackupKey,
  createGuestResponseBackup,
  parseGuestResponseBackup,
  shouldRestoreGuestResponseBackup,
} from "@/lib/examsim/guest-response-recovery";

describe("guest typed-response recovery", () => {
  it("binds local recovery to the attempt and token binding without storing the raw token", () => {
    const key = buildGuestResponseBackupKey("attempt-1", "token-hash");
    expect(key).toBe("examvault_guest_response_backup:attempt-1:token-hash");
    expect(key).not.toContain("raw-secret-token");

    const backup = createGuestResponseBackup({
      attemptId: "attempt-1",
      tokenBinding: "token-hash",
      answers: { q1: "Answer", q2: 42 as unknown as string, q3: "x".repeat(260_000) },
      now: new Date("2026-06-18T10:00:00.000Z"),
    });

    expect(backup.answers.q1).toBe("Answer");
    expect(backup.answers.q2).toBe("");
    expect(backup.answers.q3?.length).toBe(250_000);
    expect(backup.savedAt).toBe("2026-06-18T10:00:00.000Z");
  });

  it("rejects backups from another attempt or token binding", () => {
    const raw = JSON.stringify(createGuestResponseBackup({
      attemptId: "attempt-1",
      tokenBinding: "token-a",
      answers: { q1: "Recovered" },
    }));
    expect(parseGuestResponseBackup(raw, "attempt-1", "token-a")?.answers.q1).toBe("Recovered");
    expect(parseGuestResponseBackup(raw, "attempt-2", "token-a")).toBeNull();
    expect(parseGuestResponseBackup(raw, "attempt-1", "token-b")).toBeNull();
  });

  it("only restores when the current workspace has no local answers yet", () => {
    const backup = createGuestResponseBackup({ attemptId: "attempt-1", tokenBinding: "token-a", answers: { q1: "Recovered" } });
    expect(shouldRestoreGuestResponseBackup(backup, {})).toBe(true);
    expect(shouldRestoreGuestResponseBackup(backup, { q1: "Current" })).toBe(false);
    expect(shouldRestoreGuestResponseBackup(createGuestResponseBackup({ attemptId: "attempt-1", tokenBinding: "token-a", answers: { q1: "" } }), {})).toBe(false);
  });

  it("wires recovered drafts back through the Edge save path before finalization", () => {
    const workspace = readFileSync("components/exam/guest-exam-workspace.tsx", "utf8");
    expect(workspace).toContain("pendingRecoveredAnswerKeys");
    expect(workspace).toContain("flushGuestAnswerSaves");
    expect(workspace).toContain('"guest-save-response"');
    expect(workspace).toContain("Recovered local drafts could not be synced because the writing window has closed");
  });
});
