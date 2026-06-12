import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

describe("design quality guardrails", () => {
  it("keeps the public app metadata product-specific", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("title: {");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("Server-authoritative exam delivery");
    expect(layout).toContain("icon: \"/icon.svg\"");
  });

  it("does not reintroduce obvious vibe-coded UI artifacts", () => {
    const files = [
      "app/page.tsx",
      "components/owner/ai-parse-review-panel.tsx",
      "components/owner/sidebar-nav.tsx",
      "components/student/student-sidebar-nav.tsx",
      "components/ui/button.tsx",
      "components/ui/tabs.tsx",
    ];
    const combined = files.map(read).join("\n");
    expect(combined).not.toContain("Sparkles");
    expect(combined).not.toContain("transition-all");
    expect(combined).not.toContain("shadow-2xl");
    expect(combined).not.toContain("href=\"#\"");
  });

  it("keeps Figma-derived product tokens in the global stylesheet", () => {
    const globals = read("app/globals.css");
    expect(globals).toContain("--background: #f8fafc");
    expect(globals).toContain("--sidebar: #131b2e");
    expect(globals).toContain("--sidebar-active: #3f465c");
    expect(globals).toContain("--primary: #316bf3");
    expect(globals).toContain("--primary-strong: #0051d5");
    expect(globals).toContain("--border: #e2e8f0");
  });

  it("keeps authenticated shells persistent instead of rendering the public header", () => {
    const ownerLayout = read("app/owner/layout.tsx");
    const studentLayout = read("app/student/layout.tsx");
    expect(ownerLayout).not.toContain("AppHeader");
    expect(studentLayout).not.toContain("AppHeader");
    expect(ownerLayout).toContain("OwnerShell");
    expect(studentLayout).toContain("StudentSidebarNav");
  });

  it("keeps destructive owner deletes behind menu and confirmation components", () => {
    const files = [
      "components/owner/delete-assessment-button.tsx",
      "components/owner/delete-attempt-button.tsx",
      "components/owner/delete-question-bank-item-button.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).toContain("DangerMenu");
      expect(source).toContain("ConfirmDialog");
      expect(source).not.toContain("window.confirm");
    }
  });

  it("renders owner and student route loading skeletons instead of blank loaders", () => {
    expect(read("app/owner/loading.tsx")).toContain("PageSkeleton");
    expect(read("app/student/loading.tsx")).toContain("PageSkeleton");
    expect(read("components/ui/loading-skeleton.tsx")).toContain("rounded-[4px] border border-[var(--border)] bg-white");
  });
});
