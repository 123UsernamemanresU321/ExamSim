import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("owner deletion workflows", () => {
  it("deletes individual attempts through an AAL2-gated audited Edge Function", () => {
    const path = "supabase/functions/delete-attempt/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);

    expect(source).toContain("requireOwnerAal2");
    expect(source).toContain("attempt_id");
    expect(source).toContain("assessment.owner_profile_id !== ownerProfile.id");
    expect(source).toContain("auditOwnerAction");
    expect(source).toContain("attempt.deleted");
    expect(source).toContain('admin.storage.from("answer-uploads").remove');
    expect(source).toContain('admin.storage.from("marking-packets").remove');
    expect(source).toContain('.from("attempts").delete()');
  });

  it("deletes question bank items without deleting original assessment source files", () => {
    const path = "supabase/functions/delete-question-bank-item/index.ts";
    expect(existsSync(path)).toBe(true);
    const source = read(path);

    expect(source).toContain("requireOwnerAal2");
    expect(source).toContain("question_bank_item_id");
    expect(source).toContain(".eq(\"owner_profile_id\", ownerProfile.id)");
    expect(source).toContain("generated_paper_items");
    expect(source).toContain("question_bank_children");
    expect(source).toContain("question_bank_item.deleted");
    expect(source).not.toContain('storage.from("assessment-sources").remove');
    expect(source).not.toContain('storage.from("assessment-packages").remove');
  });

  it("exposes delete buttons that call only the owner Edge Functions", () => {
    const attemptButton = read("components/owner/delete-attempt-button.tsx");
    expect(attemptButton).toContain('"delete-attempt"');
    expect(attemptButton).toContain("requiresAal2: true");
    expect(attemptButton).not.toContain('.from("attempts").delete');

    const bankButton = read("components/owner/delete-question-bank-item-button.tsx");
    expect(bankButton).toContain('"delete-question-bank-item"');
    expect(bankButton).toContain("requiresAal2: true");
    expect(bankButton).not.toContain('.from("question_bank_items").delete');
  });

  it("places delete controls on attempt and question bank detail pages", () => {
    expect(read("app/owner/attempts/[id]/page.tsx")).toContain("DeleteAttemptButton");
    expect(read("app/owner/question-bank/[questionId]/page.tsx")).toContain("DeleteQuestionBankItemButton");
  });
});
