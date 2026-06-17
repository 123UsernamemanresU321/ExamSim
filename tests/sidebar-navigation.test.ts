import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("owner sidebar navigation", () => {
  it("groups owner pages into main sections instead of one flat long list", () => {
    const source = read("components/owner/sidebar-nav.tsx");

    expect(source).toContain("ownerNavSections");
    expect(source).toContain('title: "Dashboard"');
    expect(source).toContain('title: "Build"');
    expect(source).toContain('title: "Run"');
    expect(source).toContain('title: "Mark"');
    expect(source).toContain('title: "Review"');
    expect(source).toContain('title: "Manage"');
    expect(source).not.toContain('title: "Students & attempts"');
    expect(source).not.toContain('title: "Marking & feedback"');
    expect(source).not.toContain('title: "Learning tools"');
    expect(source).not.toContain("const ownerNav = [");
  });

  it("keeps every owner top-level page available in the grouped sidebar", () => {
    const source = read("components/owner/sidebar-nav.tsx");
    for (const href of [
      "/owner",
      "/owner/assessments",
      "/owner/assessments/new",
      "/owner/templates",
      "/owner/question-bank",
      "/owner/paper-generator",
      "/owner/exam-sessions",
      "/owner/operations",
      "/owner/attempts",
      "/owner/marking-queue",
      "/owner/feedback-releases",
      "/owner/comment-bank",
      "/owner/analytics",
      "/owner/export-hub",
      "/owner/topics",
      "/owner/mistakes",
      "/owner/students",
      "/owner/cohorts",
      "/owner/security",
      "/owner/support",
    ]) {
      expect(source).toContain(`href: "${href}"`);
    }
  });

  it("uses workflow labels while preserving compatibility routes", () => {
    const source = read("components/owner/sidebar-nav.tsx");

    expect(source).toContain('label: "Question Library"');
    expect(source).toContain('href: "/owner/question-bank"');
    expect(source).toContain('label: "Mock Generator"');
    expect(source).toContain('href: "/owner/paper-generator"');
    expect(source).toContain('label: "Groups"');
    expect(source).toContain('href: "/owner/cohorts"');
    expect(source).toContain('label: "Rubrics / Feedback Library"');
    expect(source).toContain('href: "/owner/comment-bank"');
    expect(source).toContain('label: "Error Patterns"');
    expect(source).toContain('href: "/owner/mistakes"');
    expect(source).toContain('label: "Export Hub"');
    expect(source).toContain('href: "/owner/export-hub"');
    expect(source).not.toContain('label: "Question Bank"');
    expect(source).not.toContain('label: "Generator"');
    expect(source).not.toContain('label: "Cohorts"');
    expect(source).not.toContain('label: "Comments"');
    expect(source).not.toContain('label: "Mistakes"');
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
