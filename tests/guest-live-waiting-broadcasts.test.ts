import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("guest live exam waiting state and broadcasts", () => {
  it("shows an intentional waiting state instead of an endless secure-workspace loader", () => {
    const source = read("components/exam/guest-exam-workspace.tsx");
    const messages = read("components/exam/student-invigilation-messages.tsx");

    expect(source).toContain('state?.state === "WAITING"');
    expect(source).toContain("Question paper locked");
    expect(source).toContain("Exam starts soon");
    expect(source).toContain("The blank workspace is intentional");
    expect(messages).toContain("Teacher announcements");
  });

  it("returns only student-visible invigilation broadcasts and direct messages through the guest state endpoint", () => {
    const source = read("supabase/functions/guest-get-attempt-state/index.ts");
    const loader = read("supabase/functions/_shared/invigilation-messages.ts");

    expect(source).toContain("invigilation_messages");
    expect(source).toContain("loadStudentVisibleMessages");
    expect(loader).toContain('message_kind", "broadcast"');
    expect(loader).toContain("visible_to_student");
    expect(loader).not.toContain(".or(");
  });
});
