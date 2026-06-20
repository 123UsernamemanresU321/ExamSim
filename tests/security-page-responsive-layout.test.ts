import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("owner security responsive layout", () => {
  it("uses wrap-safe narrative rows instead of wide tables for readiness content", () => {
    const provider = read("components/owner/provider-readiness-dashboard.tsx");
    const deployment = read("components/owner/deployment-readiness-console.tsx");
    const production = read("components/owner/examsim-production-readiness-panel.tsx");
    const securityPage = read("app/owner/security/page.tsx");

    expect(provider).not.toContain('headers={["Capability", "Status", "Safe probe", "Setup / fallback"]}');
    expect(deployment).not.toContain('headers={["Gate", "Status", "Evidence", "Next action"]}');
    expect(production).not.toContain('headers={["Feature", "Status", "Production path", "Fallback / QA"]}');
    expect(securityPage).not.toContain('headers={["Control", "Production rule"]}');

    for (const source of [provider, deployment, production]) {
      expect(source).toContain("ReadinessList");
    }
    expect(securityPage).toContain("ReadinessList");
  });

  it("allows long configuration names and explanatory text to wrap", () => {
    const readinessList = read("components/ui/readiness-list.tsx");

    expect(readinessList).toContain("min-w-0");
    expect(readinessList).toContain("[overflow-wrap:anywhere]");
    expect(readinessList).not.toContain("overflow-x-auto");
  });
});
