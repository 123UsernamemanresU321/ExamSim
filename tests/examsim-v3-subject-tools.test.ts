import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_STUDENT_ACCOMMODATIONS } from "@/lib/examsim/accommodations";

const read = (path: string) => readFileSync(path, "utf8");

describe("Examsim V3 subject tools", () => {
  it("keeps every browser and provider-backed subject tool disabled by default", () => {
    expect(DEFAULT_STUDENT_ACCOMMODATIONS).toMatchObject({
      tts_allowed: false,
      desmos_allowed: false,
      geogebra_allowed: false,
      chemistry_editor_allowed: false,
    });
  });

  it("stores teacher-enabled tools in the server-issued session policy", () => {
    const form = read("components/owner/exam-session-form.tsx");
    const action = read("app/owner/exam-sessions/actions.ts");
    const edgePolicy = read("supabase/functions/_shared/accommodations.ts");

    for (const field of ["tts_allowed", "desmos_allowed", "geogebra_allowed", "chemistry_editor_allowed"]) {
      expect(form).toContain(`name="${field}"`);
      expect(action).toContain(`${field}: formData.get("${field}") === "on"`);
      expect(edgePolicy).toContain(`${field}: source.${field} === true`);
    }
  });

  it("renders the same policy-gated tool surface for authenticated and guest exams", () => {
    const authenticated = read("components/exam/exam-workspace.tsx");
    const guest = read("components/exam/guest-exam-workspace.tsx");
    const tools = read("components/exam/student-subject-tools.tsx");
    const desmos = read("components/exam/desmos-workspace.tsx");
    const geogebra = read("components/exam/geogebra-workspace.tsx");

    expect(authenticated).toContain("<StudentSubjectTools policy={accommodationPolicy}");
    expect(guest).toContain("<StudentSubjectTools policy={accommodationPolicy}");
    expect(tools).toContain("window.speechSynthesis");
    expect(desmos).toContain("NEXT_PUBLIC_DESMOS_API_KEY");
    expect(tools).toContain("dynamic(() => import(\"@/components/exam/geogebra-workspace\")");
    expect(geogebra).toContain("https://www.geogebra.org/apps/deployggb.js");
    expect(tools).toContain("dynamic(() => import(\"@/components/exam/ketcher-workspace\")");
    expect(desmos).toContain('sandbox="allow-scripts"');
    expect(geogebra).toContain('sandbox="allow-scripts"');
    expect(desmos).not.toContain("document.head.appendChild");
    expect(geogebra).not.toContain("document.head.appendChild");
  });

  it("self-hosts Ketcher and narrowly permits the two external math tools", () => {
    const packageJson = JSON.parse(read("package.json")) as { dependencies?: Record<string, string> };
    const csp = read("next.config.ts");

    expect(packageJson.dependencies).toMatchObject({
      "ketcher-core": "3.15.0",
      "ketcher-react": "3.15.0",
      "ketcher-standalone": "3.15.0",
    });
    expect(csp).toContain("https://www.desmos.com");
    expect(csp).toContain("https://www.geogebra.org");
    expect(csp).not.toContain("frame-src *");
    expect(csp).toContain('"jsdom/lib/jsdom/living/generated/utils": false');
    expect(csp).toContain('"canvas": false');
    expect(csp).toContain("new webpack.IgnorePlugin");
    expect(csp).toContain("paper[/\\\\]dist");
  });

  it("documents browser TTS, Desmos setup, GeoGebra limits, and Ketcher self-hosting", () => {
    const readme = read("README.md");
    const readiness = read("docs/examsim-production-readiness.md");
    const ketcher = read("docs/ketcher-self-hosting.md");

    expect(readme).toContain("NEXT_PUBLIC_DESMOS_API_KEY");
    expect(readiness).toContain("Browser Web Speech API");
    expect(readiness).toContain("GeoGebra geometry");
    expect(readiness).toContain("CAS remains unavailable");
    expect(ketcher).toContain("npm install --save-exact ketcher-core@3.15.0 ketcher-react@3.15.0 ketcher-standalone@3.15.0");
    expect(ketcher).toContain("No Ketcher API key is required");
  });
});
