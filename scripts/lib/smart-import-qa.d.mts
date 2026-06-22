export type SmartImportQaExpectations = {
  expectedQuestionCount: number;
  expectedTotalMarks: number;
  sectionAEnd: number;
  sectionBStart: number;
  requiredPrompts?: Record<string, string[]>;
};

export type SmartImportQaEvaluation = {
  passed: boolean;
  actualQuestionCount: number;
  actualTotalMarks: number;
  missingQuestionNumbers: number[];
  unexpectedQuestionNumbers: number[];
  missingRequiredPrompts: string[];
  sectionBoundaryValid: boolean;
  marksMatch: boolean;
};

export function evaluatePaperPackage(
  packageValue: unknown,
  expectations: SmartImportQaExpectations,
): SmartImportQaEvaluation;

export function evaluateExtractedPaperText(
  textValue: string,
  expectations: SmartImportQaExpectations,
): SmartImportQaEvaluation;

export function classifyProviderFailure(error: unknown):
  | "insufficient_balance"
  | "quota_reached"
  | "not_configured"
  | "provider_unavailable";
