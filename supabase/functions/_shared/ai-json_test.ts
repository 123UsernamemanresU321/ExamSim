import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseAiJsonObject } from "./ai-json.ts";

Deno.test("parseAiJsonObject accepts plain JSON objects", () => {
  const parsed = parseAiJsonObject('{"normalized_package":{"questions":[]},"confidence":0.7}');
  assertEquals(parsed.value.confidence, 0.7);
  assertEquals(parsed.warnings, []);
});

Deno.test("parseAiJsonObject extracts JSON from markdown and trailing prose", () => {
  const parsed = parseAiJsonObject('```json\n{"normalized_package":{"questions":[{"prompt":"{x}"}]},"confidence":0.8}\n```\nUse this draft carefully.');
  assertEquals(parsed.value.confidence, 0.8);
  assertEquals(parsed.warnings.length, 1);
});

Deno.test("parseAiJsonObject ignores braces in JSON strings", () => {
  const parsed = parseAiJsonObject('{"message":"Keep {a} and {b} labels","normalized_package":{}}\nExplanation');
  assertEquals(parsed.value.message, "Keep {a} and {b} labels");
});

Deno.test("parseAiJsonObject rejects non-json responses", () => {
  assertThrows(
    () => parseAiJsonObject("I cannot parse this paper."),
    Error,
    "AI response was not valid JSON",
  );
});
