import type { AssessmentKind, DeliveryMode } from "@/lib/constants";

export type AssessmentPolicyPreset = {
  name: string;
  description: string;
  assessmentKind: AssessmentKind;
  defaultDurationSeconds: number;
  defaultUploadGraceSeconds: number | null;
  deliveryMode: DeliveryMode;
  solutionsRequested: boolean;
  typedEnabled: boolean;
  perQuestionUploadEnabled: boolean;
  requireBlankForSkipped: boolean;
};

export const DEFAULT_ASSESSMENT_PRESETS: AssessmentPolicyPreset[] = [
  {
    name: "IB Paper 1 MCQ",
    description: "Multiple-choice focused timed paper.",
    assessmentKind: "exam",
    defaultDurationSeconds: 3600,
    defaultUploadGraceSeconds: null,
    deliveryMode: "browser",
    solutionsRequested: false,
    typedEnabled: true,
    perQuestionUploadEnabled: false,
    requireBlankForSkipped: false,
  },
  {
    name: "IB Paper 2 handwritten",
    description: "Root-question PDF upload with post-writing upload grace.",
    assessmentKind: "exam",
    defaultDurationSeconds: 5400,
    defaultUploadGraceSeconds: 900,
    deliveryMode: "browser",
    solutionsRequested: true,
    typedEnabled: false,
    perQuestionUploadEnabled: true,
    requireBlankForSkipped: true,
  },
  {
    name: "Olympiad proof paper",
    description: "Long-form handwritten proof paper.",
    assessmentKind: "exam",
    defaultDurationSeconds: 10800,
    defaultUploadGraceSeconds: 1200,
    deliveryMode: "browser",
    solutionsRequested: true,
    typedEnabled: false,
    perQuestionUploadEnabled: true,
    requireBlankForSkipped: true,
  },
  {
    name: "Quick quiz",
    description: "Short typed quiz.",
    assessmentKind: "quiz",
    defaultDurationSeconds: 900,
    defaultUploadGraceSeconds: null,
    deliveryMode: "browser",
    solutionsRequested: false,
    typedEnabled: true,
    perQuestionUploadEnabled: false,
    requireBlankForSkipped: false,
  },
];

export function applyAssessmentPreset<T extends Record<string, unknown>>(base: T, preset: AssessmentPolicyPreset) {
  return {
    ...base,
    assessment_kind: preset.assessmentKind,
    duration_seconds: preset.defaultDurationSeconds,
    upload_only_grace_seconds: preset.defaultUploadGraceSeconds,
    delivery_mode: preset.deliveryMode,
    solutions_requested: preset.solutionsRequested,
    typed_enabled: preset.typedEnabled,
    per_question_upload_enabled: preset.perQuestionUploadEnabled,
    require_blank_for_skipped: preset.requireBlankForSkipped,
  };
}
