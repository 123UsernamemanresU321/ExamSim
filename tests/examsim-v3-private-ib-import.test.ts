import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fixturePath = "scripts/fixtures/ib-dp-guide-structures.json";
const importerPath = "scripts/import-private-ib-content.mjs";

describe("Examsim V3 private IB content import", () => {
  it("defines the five reusable private booklet resources without public paths", () => {
    expect(existsSync(fixturePath)).toBe(true);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.resources).toHaveLength(5);
    expect(fixture.resources.map((resource: { key: string }) => resource.key).sort()).toEqual([
      "business-formulae",
      "chemistry-data-v1-1",
      "math-aa-hl-v1-0",
      "math-aa-sl-v1-0",
      "physics-data-v1-2",
    ]);
    for (const resource of fixture.resources) {
      expect(resource.sourceFile).toMatch(/^\/Users\/erichuang\/Downloads\/IB\/.+\.pdf$/);
      expect(resource.sourceFile).not.toContain("/public/");
      expect(resource.pageCount).toBeGreaterThan(0);
    }
  });

  it("defines school-reviewed draft frameworks for eleven DP subjects and three DP Core components", () => {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(fixture.frameworks).toHaveLength(14);
    const components = fixture.frameworks.map((framework: { component: string }) => framework.component);
    expect(components.filter((component: string) => component === "subject")).toHaveLength(11);
    expect(components.filter((component: string) => component === "core")).toHaveLength(3);

    for (const framework of fixture.frameworks) {
      expect(framework.reviewStatus).toBe("draft");
      expect(framework.sourceFile).toMatch(/^\/Users\/erichuang\/Downloads\/IB\/.+\.pdf$/);
      expect(framework.nodes.length).toBeGreaterThan(0);
      const kinds = framework.nodes.map((node: { kind: string }) => node.kind);
      expect(kinds).toEqual(expect.arrayContaining(["topic", "skill", "assessment_objective", "command_term"]));
      expect(kinds).toContain(framework.component === "core" ? "core_requirement" : "subtopic");
      for (const node of framework.nodes) {
        expect(node.sourcePageStart).toBeGreaterThan(0);
        expect(node.title.length).toBeLessThanOrEqual(180);
        expect((node.description ?? "").length).toBeLessThanOrEqual(300);
      }
    }
  });

  it("uploads only to private resource/source buckets and deduplicates by SHA-256", () => {
    expect(existsSync(importerPath)).toBe(true);
    const importer = readFileSync(importerPath, "utf8");
    expect(importer).toContain('"assessment-resources"');
    expect(importer).toContain('"curriculum-sources"');
    expect(importer).toContain('createHash("sha256")');
    expect(importer).toContain('from("resource_library_items")');
    expect(importer).toContain('from("curriculum_source_documents")');
    expect(importer).toContain("OWNER_EMAIL");
    expect(importer).toContain("AbortSignal.timeout(180_000)");
    expect(importer).toContain("Importing private resource");
    expect(importer).not.toContain("public/");
  });
});
