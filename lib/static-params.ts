import { sampleAttempts } from "@/lib/demo-data";

export function demoAttemptParams() {
  return sampleAttempts.map((attempt) => ({ id: attempt.id }));
}

export function demoAssessmentParams() {
  return [{ id: "asm_demo" }];
}
