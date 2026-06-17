export type ExamsimProductionFeatureKey =
  | "smart_import_compiler"
  | "ocr_question_detection"
  | "markscheme_rubrics"
  | "ai_answer_grouping"
  | "guest_seb_lockdown"
  | "paper_mode"
  | "stem_handwriting_ocr"
  | "collaborative_grading"
  | "live_invigilation"
  | "guest_upload_recovery"
  | "offline_resilience"
  | "teacher_analytics"
  | "question_bank_generator"
  | "student_claim_flow"
  | "source_pdf_health"
  | "accommodations_matrix"
  | "subject_tools"
  | "curriculum_alignment"
  | "qti_moodle_interop"
  | "version_history_rollback"
  | "school_reporting"
  | "deployment_validation";

export type ExamsimProductionStatus =
  | "ready"
  | "provider_ready_needs_staging"
  | "provider_required"
  | "manual_fallback"
  | "blocked"
  | "staging_required";

export type ExamsimReadinessEnv = Partial<Record<string, string | undefined>>;

export type ExamsimProductionReadinessItem = {
  key: ExamsimProductionFeatureKey;
  title: string;
  status: ExamsimProductionStatus;
  ownerMessage: string;
  productionPath: string;
  fallback?: string;
  blocker?: string;
  requiredEnvVars: string[];
  qaChecklist: string[];
};

export const EXAMSIM_PRODUCTION_FEATURE_KEYS = [
  "smart_import_compiler",
  "ocr_question_detection",
  "markscheme_rubrics",
  "ai_answer_grouping",
  "guest_seb_lockdown",
  "paper_mode",
  "stem_handwriting_ocr",
  "collaborative_grading",
  "live_invigilation",
  "guest_upload_recovery",
  "offline_resilience",
  "teacher_analytics",
  "question_bank_generator",
  "student_claim_flow",
  "source_pdf_health",
  "accommodations_matrix",
  "subject_tools",
  "curriculum_alignment",
  "qti_moodle_interop",
  "version_history_rollback",
  "school_reporting",
  "deployment_validation",
] as const satisfies readonly ExamsimProductionFeatureKey[];

export function getExamsimProductionReadiness(env: ExamsimReadinessEnv = process.env) {
  const hasDeepSeek = hasEnv(env, "DEEPSEEK_API_KEY");
  const hasMineru = hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  const hasMathpix = hasEnv(env, "MATHPIX_API_KEY");

  const items: ExamsimProductionReadinessItem[] = [
    {
      key: "smart_import_compiler",
      title: "Smart Import / Exam Compiler",
      status: hasDeepSeek && hasMineru ? "ready" : "provider_required",
      ownerMessage: hasDeepSeek && hasMineru
        ? "Provider-backed Smart Import can run through the configured DeepSeek and MinerU/OCR paths, with owner review still required before publishing."
        : "Smart Import has a manual PDF/LaTeX/JSON fallback, but provider-backed OCR and AI extraction require configured DeepSeek and MinerU credentials.",
      productionPath: "Upload PDF or LaTeX, create source pages, repair regions, generate question cards, review health, then publish.",
      fallback: "Teachers can upload PDFs, draw regions manually, edit question cards, and use deterministic LaTeX parsing without AI/OCR.",
      requiredEnvVars: ["DEEPSEEK_API_KEY", "MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
      qaChecklist: ["Import a PDF", "Review low-confidence regions", "Publish only after health check warnings are handled"],
    },
    {
      key: "ocr_question_detection",
      title: "AI/OCR Question Detection",
      status: hasDeepSeek && hasMineru ? "provider_ready_needs_staging" : "provider_required",
      ownerMessage: "Question detection is provider-backed when OCR/AI credentials exist; otherwise the product must show manual region editing rather than claiming automatic extraction.",
      productionPath: "MinerU/OCR extracts layout and text; DeepSeek/parser repair converts suggestions into a reviewed question tree.",
      fallback: "Manual PDF Region Editor remains the production-safe workflow when providers are missing or low confidence.",
      requiredEnvVars: ["DEEPSEEK_API_KEY", "MINERU_API_KEY or MINERU_WORKER_HMAC_SECRET"],
      qaChecklist: ["Verify provider failure state", "Verify low-confidence queue", "Verify manual correction before publish"],
    },
    {
      key: "markscheme_rubrics",
      title: "Markscheme Mapping and Rubric Drafting",
      status: "ready",
      ownerMessage: "Markscheme mapping, rubric templates, rubric items, reusable feedback, and per-rubric awards are available with owner review boundaries.",
      productionPath: "Map markscheme blocks to question nodes, convert mark codes into editable rubric points, mark with rubric clicks, then release feedback.",
      fallback: "Manual rubric authoring remains available if automatic markscheme parsing is low confidence.",
      requiredEnvVars: [],
      qaChecklist: ["Map a markscheme section", "Award rubric items", "Confirm totals match question marks"],
    },
    {
      key: "ai_answer_grouping",
      title: "AI Answer Grouping",
      status: hasDeepSeek ? "provider_ready_needs_staging" : "manual_fallback",
      ownerMessage: "Deterministic/manual grouping is safe today; semantic grouping should be treated as provider-backed and review-required.",
      productionPath: "Group typed, numeric, and short text answers; teacher reviews groups before marks are applied.",
      fallback: "Manual and deterministic grouping are used when semantic AI grouping is not configured.",
      requiredEnvVars: ["DEEPSEEK_API_KEY"],
      qaChecklist: ["Create groups", "Review group membership", "Audit group marking decisions"],
    },
    {
      key: "guest_seb_lockdown",
      title: "Guest SEB / Lockdown",
      status: "blocked",
      ownerMessage: "Authenticated SEB verification exists, but guest SEB remains blocked until server-verifiable guest BEK/CK/request-hash evidence is implemented without weakening secure mode.",
      productionPath: "Use authenticated student SEB flow for secure-browser sittings.",
      blocker: "No-login guest attempts cannot be considered locked down without a server-verifiable SEB evidence path.",
      requiredEnvVars: [],
      qaChecklist: ["Confirm guest SEB-required sessions do not release packages", "Confirm Browser Mode is labelled tamper-evident"],
    },
    {
      key: "paper_mode",
      title: "Paper Mode",
      status: "manual_fallback",
      ownerMessage: "Paper Mode has a safe manual print/scan/upload/mark path, but automated scan-to-student/question mapping still requires OCR/barcode staging.",
      productionPath: "Generate printable papers, collect scans, attach scans to attempts, manually repair mappings, and mark digitally.",
      fallback: "Manual scan upload and correction remains the supported production-safe workflow.",
      requiredEnvVars: ["Optional OCR/barcode provider credentials"],
      qaChecklist: ["Generate printable identifiers", "Upload scans", "Manually repair failed mappings"],
    },
    {
      key: "stem_handwriting_ocr",
      title: "Handwriting / STEM / Table / Diagram OCR",
      status: hasMathpix || hasMineru ? "provider_ready_needs_staging" : "provider_required",
      ownerMessage: "Advanced STEM OCR requires a capable provider; the app must keep manual transcription and region editing as the fallback.",
      productionPath: "Provider extracts handwriting, equations, tables, chemistry, and diagrams into review-required suggestions.",
      fallback: "Manual transcription, source-page preview, and teacher-edited question cards remain available.",
      requiredEnvVars: ["MATHPIX_API_KEY or MINERU_API_KEY"],
      qaChecklist: ["Test equations", "Test handwritten proof", "Test table extraction", "Review provider confidence"],
    },
    {
      key: "collaborative_grading",
      title: "Anonymous and Collaborative Grading",
      status: "manual_fallback",
      ownerMessage: "Marker assignment and review surfaces exist, but institution-grade role separation needs staging with real owner/marker/reviewer accounts.",
      productionPath: "Assign marking work, hide student identity where configured, flag review conflicts, and audit grading decisions.",
      fallback: "Owner-led marking and review flags remain safe until full institution roles are validated.",
      requiredEnvVars: [],
      qaChecklist: ["Assign a marker", "Hide student name", "Review a flagged mark", "Confirm students see released data only"],
    },
    {
      key: "live_invigilation",
      title: "Live Invigilation Dashboard",
      status: "staging_required",
      ownerMessage: "Live roster, messages, interventions, uploads, heartbeat gaps, and technical issues exist; classroom-scale behavior must be validated with synthetic sessions.",
      productionPath: "Monitor current question, progress, upload status, disconnects, messages, extra time, pause/resume, and force-submit logs.",
      fallback: "Attempt reports and recovery center preserve evidence if live subscriptions are interrupted.",
      requiredEnvVars: [],
      qaChecklist: ["Simulate 20 attempts", "Send private message", "Grant extra time", "Force submit", "Review audit trail"],
    },
    {
      key: "guest_upload_recovery",
      title: "Guest Upload Recovery",
      status: "ready",
      ownerMessage: "Guest upload signing, PDF verification, retries, confirmation, missing-required-upload blocking, and idempotent finalization are implemented server-side.",
      productionPath: "Issue upload URL, upload to private storage, confirm server-side PDF bytes, finalize with required-slot checks.",
      fallback: "Attempt recovery center and incident logs support owner review when a network failure interrupts upload.",
      requiredEnvVars: ["ATTEMPT_STATE_TOKEN_SECRET"],
      qaChecklist: ["Retry failed upload", "Reject oversized file", "Confirm missing required upload blocks finalization"],
    },
    {
      key: "offline_resilience",
      title: "Offline / Recovery Resilience",
      status: "manual_fallback",
      ownerMessage: "Autosave/retry and recovery states exist, but the browser cannot securely retain selected upload files after process termination.",
      productionPath: "Recover typed responses through server autosaves and local in-browser backup when feasible.",
      fallback: "Show honest recovery instructions and require file re-selection after browser/process restart.",
      requiredEnvVars: [],
      qaChecklist: ["Refresh during exam", "Reconnect after offline", "Retry finalization", "Verify no false offline-submission claim"],
    },
    {
      key: "teacher_analytics",
      title: "Teacher Analytics",
      status: "ready",
      ownerMessage: "Teacher analytics now summarize real stored attempts, marks, question nodes, topic links, and rubric awards; school-scale exports still need staging validation.",
      productionPath: "Show score distribution, weakest questions, topic weaknesses, rubric loss, and low-score support flags from stored marking data.",
      fallback: "Owner can still review marking queue, attempts, results, and exports if a dataset is too sparse for meaningful analytics.",
      requiredEnvVars: [],
      qaChecklist: ["Mark several attempts", "Link topic tags", "Verify score distribution", "Verify rubric loss breakdown"],
    },
    {
      key: "question_bank_generator",
      title: "Question Bank and Mock Generator",
      status: "staging_required",
      ownerMessage: "Question library, extraction, subject filters, source previews, and mock generator exist; generated papers still need health-check validation before publish.",
      productionPath: "Extract approved root questions, preserve source references, filter by topic/marks/difficulty, generate draft, review, publish code.",
      fallback: "Manual assessment creation remains available if generator criteria cannot satisfy a paper exactly.",
      requiredEnvVars: [],
      qaChecklist: ["Extract from an approved paper", "Generate a mock by topic mix", "Replace one question", "Run publish health check"],
    },
    {
      key: "student_claim_flow",
      title: "Student Account Claim Flow",
      status: "staging_required",
      ownerMessage: "Guest identity and reconciliation flows exist; self-claim must be tested with one-time release/claim codes and ambiguous identity cases.",
      productionPath: "Student claims released attempt through secure code; owner reconciles mismatches and duplicate student numbers.",
      fallback: "Owner reconciliation remains the safe path for ambiguous or duplicate identities.",
      requiredEnvVars: [],
      qaChecklist: ["Claim own attempt", "Reject another student's attempt", "Resolve duplicate student number"],
    },
    {
      key: "source_pdf_health",
      title: "Source PDF Health and Coverage",
      status: "ready",
      ownerMessage: "Health checks now cover missing source regions, unlinked boxes, overlapping boxes, low confidence, missing marks/response types, and failed PDF processing.",
      productionPath: "Run health before publish; block critical errors and require warning acknowledgement.",
      fallback: "Teachers can manually repair source regions and question cards in the visual editor.",
      requiredEnvVars: [],
      qaChecklist: ["Check unlinked regions", "Check missing marks", "Check overlap warning", "Acknowledge non-critical warnings"],
    },
    {
      key: "accommodations_matrix",
      title: "Accommodations Matrix",
      status: "manual_fallback",
      ownerMessage: "Extra time and upload extension affect server-computed attempt state; broader rest-break/tool/TTS accommodations require policy setup and staging.",
      productionPath: "Apply per-student/session timing, access, font, tools, materials, and audit history.",
      fallback: "Extra time and upload extensions are the production-safe interventions until the full matrix is validated.",
      requiredEnvVars: [],
      qaChecklist: ["Apply extra time", "Verify server timer changes", "Review accommodation audit log"],
    },
    {
      key: "subject_tools",
      title: "Built-in Subject Tools",
      status: "manual_fallback",
      ownerMessage: "Allowed materials, structured table responses, and a simple normalized-stroke whiteboard are available. Advanced graphing, geometry, CAS, and chemistry tools must stay labelled unavailable until integrated.",
      productionPath: "Teacher enables allowed materials and configures table or whiteboard response workspaces where the question requires structured cells or sketches.",
      fallback: "Use allowed-materials drawer, PDF uploads, typed answers, table responses, whiteboard strokes, and manual working uploads.",
      requiredEnvVars: [],
      qaChecklist: ["Verify allowed materials policy", "Save a table response", "Save a whiteboard response", "Hide unavailable graphing/geometry/CAS tools"],
    },
    {
      key: "curriculum_alignment",
      title: "Curriculum / Standard Alignment",
      status: "manual_fallback",
      ownerMessage: "Topic tags exist and can feed analytics; full IB/MYP/IGCSE/Olympiad standard trees need seeded content and owner validation.",
      productionPath: "Attach subject, topic, subtopic, standard, command term, and difficulty to questions/rubrics.",
      fallback: "Manual topic tags and subject filters remain supported without a seeded standard tree.",
      requiredEnvVars: [],
      qaChecklist: ["Seed standards", "Tag questions", "Verify analytics by tag"],
    },
    {
      key: "qti_moodle_interop",
      title: "QTI / Moodle / XML Interoperability",
      status: "manual_fallback",
      ownerMessage: "Export Hub now provides conservative CSV/JSON handoffs and QTI remains assessment-scoped through the existing Edge export. Moodle XML is intentionally blocked until fidelity warnings are validated.",
      productionPath: "Export/import without losing marks, response types, topics, or source metadata silently; keep lossy formats visibly warned.",
      fallback: "Use Export Hub CSV/JSON and assessment-scoped QTI where supported; keep Moodle XML unavailable until unsupported-feature mapping is verified.",
      requiredEnvVars: [],
      qaChecklist: ["Export CSV/JSON handoff", "Export QTI from an assessment", "Check unsupported-feature warnings", "Validate normalized JSON"],
    },
    {
      key: "version_history_rollback",
      title: "Version History and Rollback",
      status: "manual_fallback",
      ownerMessage: "Published versions are protected by versioning; teacher-facing diff/rollback UX should be validated before relying on rollback in production.",
      productionPath: "Duplicate from old version, compare text/marks/rubrics/topics/source regions, and publish a new version.",
      fallback: "Create a new draft version rather than mutating live attempts.",
      requiredEnvVars: [],
      qaChecklist: ["Publish version", "Create draft from existing", "Compare source-region changes", "Confirm live attempts stay attached"],
    },
    {
      key: "school_reporting",
      title: "School-level Reporting",
      status: "manual_fallback",
      ownerMessage: "Export Hub provides owner-scoped group/cohort CSV and analytics handoff JSON. Full school dashboards still need cross-workspace permission and export validation.",
      productionPath: "Show group comparisons, completion rates, topic weaknesses, support flags, progress, and exports.",
      fallback: "Use Export Hub group/cohort exports, cohort filters, marking queue, and CSV handoffs until school reporting is validated at scale.",
      requiredEnvVars: [],
      qaChecklist: ["Check owner-only data boundaries", "Export group report", "Verify no cross-workspace leakage"],
    },
    {
      key: "deployment_validation",
      title: "Deployment Validation",
      status: "staging_required",
      ownerMessage: "The repo can pass static checks locally, but production launch still requires migrations, Edge deployment, env vars, private buckets, and synthetic workflow QA.",
      productionPath: "Run migrations, deploy Edge Functions, set secrets, confirm buckets private, run end-to-end staging workflow.",
      fallback: "Do not launch high-stakes exams until the staging checklist passes.",
      requiredEnvVars: ["APP_ALLOWED_ORIGINS", "ATTEMPT_STATE_TOKEN_SECRET", "MINERU_WORKER_HMAC_SECRET"],
      qaChecklist: ["Run lint/typecheck/test/build", "Deploy Edge Functions", "Apply migrations", "Run synthetic guest and authenticated flows"],
    },
  ];

  return items;
}

export function summarizeExamsimProductionReadiness(items: ExamsimProductionReadinessItem[]) {
  return {
    total: items.length,
    ready: countStatus(items, "ready"),
    providerReadyNeedsStaging: countStatus(items, "provider_ready_needs_staging"),
    providerRequired: countStatus(items, "provider_required"),
    manualFallback: countStatus(items, "manual_fallback"),
    blocked: countStatus(items, "blocked"),
    stagingRequired: countStatus(items, "staging_required"),
  };
}

function countStatus(items: ExamsimProductionReadinessItem[], status: ExamsimProductionStatus) {
  return items.filter((item) => item.status === status).length;
}

function hasEnv(env: ExamsimReadinessEnv, name: string) {
  const value = env[name]?.trim();
  if (!value) return false;
  return !["placeholder", "changeme", "change-me", "todo"].includes(value.toLowerCase());
}
