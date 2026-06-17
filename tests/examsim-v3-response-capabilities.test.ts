import { describe, expect, it } from "vitest";
import { normalizedPackageSchema } from "@/lib/assessment-package";
import {
  formatStoredResponse,
  parseStoredResponseValue,
  serializeTableResponse,
  serializeWhiteboardResponse,
} from "@/lib/response-values";
import {
  buildDefaultInteractionForCapability,
  resolveResponseCapability,
} from "@/lib/examsim/response-capabilities";
import { inferAnswerTypeSuggestion } from "@/lib/examsim/compiler-readiness";

const basePackage = {
  schema_version: "1.0",
  assessment: {
    id: "assessment-1",
    title: "V3 Responses",
    assessment_kind: "exam",
    source_kind: "json",
    authoring_origin: "owner_pasted",
    display_timezone: "Africa/Johannesburg",
  },
  delivery: {
    delivery_mode: "browser",
    solutions_requested: true,
    response_policy: {
      typed_allowed: true,
      mixed_mode_allowed: true,
      per_question_pdf_upload: true,
      blank_submission_required_for_unattempted: true,
    },
  },
  source: {
    requires_owner_review: false,
  },
  questions: [],
};

describe("Examsim V3 response capabilities", () => {
  it("keeps whiteboard and table interaction metadata in released packages", () => {
    const parsed = normalizedPackageSchema.parse({
      ...basePackage,
      questions: [
        {
          node_id: "whiteboard-1",
          node_key: "Q1",
          ordinal: 1,
          node_type: "question",
          marks: 5,
          response_mode: "typed_text",
          prompt: { html: "<p>Sketch the graph.</p>" },
          interaction: {
            kind: "whiteboard",
            tools: ["pen", "eraser", "text"],
            submit_scratchpad: true,
          },
        },
        {
          node_id: "table-1",
          node_key: "Q2",
          ordinal: 2,
          node_type: "question",
          marks: 4,
          response_mode: "typed_text",
          prompt: { html: "<p>Complete the table.</p>" },
          interaction: {
            kind: "table",
            columns: [
              { id: "x", label: "x", locked: true },
              { id: "y", label: "y", answer: true, unit: "m" },
            ],
            rows: [
              { id: "r1", label: "1", cells: { x: "1" } },
              { id: "r2", label: "2", cells: { x: "2" } },
            ],
          },
        },
      ],
    });

    expect(parsed.questions[0]?.interaction?.kind).toBe("whiteboard");
    expect(parsed.questions[1]?.interaction?.kind).toBe("table");
    expect(resolveResponseCapability(parsed.questions[0])).toMatchObject({ kind: "whiteboard" });
    expect(resolveResponseCapability(parsed.questions[1])).toMatchObject({ kind: "table" });
  });

  it("serializes table and whiteboard responses as marker-readable structured values", () => {
    const tableAnswer = serializeTableResponse({
      cells: {
        "r1:y": "3.2",
        "r2:y": "6.4",
      },
    });
    const whiteboardAnswer = serializeWhiteboardResponse({
      strokes: [
        {
          id: "s1",
          color: "#111827",
          width: 2,
          points: [
            { x: 0.1, y: 0.2 },
            { x: 0.4, y: 0.5 },
          ],
        },
      ],
    });

    expect(parseStoredResponseValue(tableAnswer)).toMatchObject({ kind: "table" });
    expect(parseStoredResponseValue(whiteboardAnswer)).toMatchObject({ kind: "whiteboard" });
    expect(formatStoredResponse(tableAnswer)).toContain("Table response: 2 filled cells");
    expect(formatStoredResponse(whiteboardAnswer)).toContain("Whiteboard response: 1 stroke");
  });

  it("builds safe default interactions for manual authoring without claiming advanced providers", () => {
    expect(buildDefaultInteractionForCapability("whiteboard")).toEqual({
      kind: "whiteboard",
      tools: ["pen", "eraser", "text"],
      submit_scratchpad: false,
      provider_status: "manual",
    });
    expect(buildDefaultInteractionForCapability("table")).toMatchObject({
      kind: "table",
      provider_status: "manual",
      columns: [
        { id: "c1", label: "Column 1", answer: true },
        { id: "c2", label: "Column 2", answer: true },
      ],
    });
  });

  it("suggests table and whiteboard workspaces from command terms without making them canonical", () => {
    expect(inferAnswerTypeSuggestion("Complete the table below.")).toMatchObject({
      responseMode: "typed_text",
      capabilityKind: "table",
    });
    expect(inferAnswerTypeSuggestion("Sketch and label the curve.")).toMatchObject({
      responseMode: "typed_text",
      capabilityKind: "whiteboard",
    });
  });
});
