import { describe, expect, it } from "vitest";
import {
  formatStoredResponse,
  parseStoredResponseValue,
  serializeChoiceResponse,
  serializeNumericalResponse,
} from "@/lib/response-values";

describe("structured response values", () => {
  it("round-trips multi-select answers", () => {
    const stored = serializeChoiceResponse(["a", "c"]);
    expect(parseStoredResponseValue(stored)).toEqual({ kind: "multiple_choice", choiceIds: ["a", "c"] });
  });

  it("round-trips numerical answers", () => {
    const stored = serializeNumericalResponse("3.14");
    expect(parseStoredResponseValue(stored)).toEqual({ kind: "numerical", value: "3.14" });
  });

  it("formats structured answers for marking", () => {
    const formatted = formatStoredResponse(serializeChoiceResponse(["a", "c"]), {
      interaction: {
        kind: "choice",
        choices: [
          { choice_id: "a", content_html: "<p>Alpha</p>" },
          { choice_id: "c", content_html: "<p>Gamma</p>" },
        ],
      },
    });
    expect(formatted).toBe("Selected choices: Alpha, Gamma");
  });
});
