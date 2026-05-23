import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("owner sidebar navigation", () => {
  it("groups owner pages into main sections instead of one flat long list", () => {
    const source = read("components/owner/sidebar-nav.tsx");

    expect(source).toContain("ownerNavSections");
    expect(source).toContain('title: "Main"');
    expect(source).toContain('title: "Assessments"');
    expect(source).toContain('title: "Students & attempts"');
    expect(source).toContain('title: "Marking & feedback"');
    expect(source).toContain('title: "Learning tools"');
    expect(source).toContain('title: "System"');
    expect(source).not.toContain("const ownerNav = [");
  });

  it("keeps every owner top-level page available in the grouped sidebar", () => {
    const source = read("components/owner/sidebar-nav.tsx");
    for (const href of [
      "/owner",
      "/owner/assessments",
      "/owner/templates",
      "/owner/question-bank",
      "/owner/paper-generator",
      "/owner/students",
      "/owner/cohorts",
      "/owner/attempts",
      "/owner/marking-queue",
      "/owner/feedback-releases",
      "/owner/comment-bank",
      "/owner/topics",
      "/owner/mistakes",
      "/owner/security",
    ]) {
      expect(source).toContain(`href: "${href}"`);
    }
  });

  it("uses section toggles with expanded state for the active owner route", () => {
    const source = read("components/owner/sidebar-nav.tsx");

    expect(source).toContain("expandedSections");
    expect(source).toContain("activeSectionId");
    expect(source).toContain("aria-expanded");
    expect(source).toContain("toggleSection");
  });

  it("keeps assessment dynamic routes under one slug name so local dev can start", () => {
    expect(existsSync("app/owner/assessments/[assessmentId]")).toBe(false);
    expect(existsSync("app/owner/assessments/[id]/cross-mark/page.tsx")).toBe(true);
    expect(existsSync("app/owner/assessments/[id]/markscheme/page.tsx")).toBe(true);
  });
});
