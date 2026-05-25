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
});
