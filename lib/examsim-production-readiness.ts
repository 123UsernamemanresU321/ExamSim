export type ExamsimProductionFeatureKey =
  | "smart_import_compiler"
  | "ocr_question_detection"
  | "markscheme_rubrics"
  | "ai_answer_grouping"
  | "guest_seb_lockdown"
  | "paper_mode"
  | "stem_handwriting_ocr"
  | "collaborative_grading"
  | "institution_role_matrix"
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
  | "adaptive_revision"
  | "qti_moodle_interop"
  | "version_history_rollback"
  | "school_reporting"
  | "deployment_validation";

export type ExamsimProductionStatus =
  | "ready"
  | "provider_required"
  | "manual_fallback"
  | "blocked"
  | "live_validation_required"
  | "staging_required"
  | "v4_future";

export type ExamsimReadinessEnv = Partial<Record<string, string | undefined>>;

export type ExamsimReadinessEvidence = {
  routes?: string[];
  tests?: string[];
  migrations?: string[];
  components?: string[];
  serverActions?: string[];
  edgeFunctions?: string[];
  browserVerification?: string[];
  seededQa?: string[];
  providerValidation?: string[];
};

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
  evidence: ExamsimReadinessEvidence;
};

export type ExamsimReleaseCandidateReadiness = {
  readyForFullV3: boolean;
  ownerMessage: string;
  blockingCount: number;
  providerGatedCount: number;
  liveValidationRequiredCount: number;
  stagingRequiredCount: number;
  v4FutureCount: number;
  manualFallbackCount: number;
  remainingItems: ExamsimProductionReadinessItem[];
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
  "institution_role_matrix",
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
  "adaptive_revision",
  "qti_moodle_interop",
  "version_history_rollback",
  "school_reporting",
  "deployment_validation",
] as const satisfies readonly ExamsimProductionFeatureKey[];

const EXAMSIM_READINESS_EVIDENCE: Record<ExamsimProductionFeatureKey, ExamsimReadinessEvidence> = {
  smart_import_compiler: {
    routes: ["/owner/assessments/[id]/authoring/compiler"],
    tests: ["tests/examsim-v2-compiler-readiness.test.ts", "tests/examsim-v3-provider-readiness.test.ts"],
    edgeFunctions: ["ai-parse-assessment", "mineru-submit-hosted-job", "mineru-poll-hosted-job"],
    providerValidation: ["Owner Security > Smart Import sample QA"],
  },
  ocr_question_detection: {
    components: ["components/owner/source-region-editor.tsx", "components/owner/provider-readiness-dashboard.tsx"],
    tests: ["tests/examsim-v3-provider-readiness.test.ts", "tests/pdf-region-editor-pipeline.test.ts"],
    edgeFunctions: ["simpletex-ocr-source-page", "mineru-submit-hosted-job"],
  },
  markscheme_rubrics: {
    routes: ["/owner/assessments/[id]/markscheme"],
    components: ["components/owner/markscheme-mapper-panel.tsx"],
    tests: ["tests/rubric-readiness.test.ts", "tests/marking-scoring.test.ts"],
    edgeFunctions: ["markscheme-mapper", "save-marking", "release-feedback"],
  },
  ai_answer_grouping: {
    components: ["components/owner/answer-grouping-review-panel.tsx"],
    tests: ["tests/examsim-v3-answer-grouping-review.test.ts"],
    migrations: ["supabase/migrations/20260619000600_v3_answer_grouping_review.sql"],
    providerValidation: ["DeepSeek semantic grouping sample with owner approval"],
  },
  guest_seb_lockdown: {
    tests: ["tests/examsim-limitations.test.ts", "tests/edge-security.test.ts"],
    edgeFunctions: ["guest-get-attempt-package", "seb-handshake", "seb-verify-session"],
  },
  paper_mode: {
    routes: ["/owner/paper-mode", "/owner/paper-mode/[jobId]"],
    tests: ["tests/examsim-v3-paper-mode.test.ts"],
    migrations: ["supabase/migrations/20260621082532_v3_paper_mode.sql"],
    edgeFunctions: ["owner-issue-paper-scan-upload", "owner-confirm-paper-scan-upload", "owner-sign-storage-url"],
  },
  stem_handwriting_ocr: {
    tests: ["tests/examsim-v3-provider-readiness.test.ts"],
    migrations: ["supabase/migrations/20260619000300_v3_simpletex_ocr_results.sql"],
    edgeFunctions: ["simpletex-ocr-source-page"],
    providerValidation: ["SimpleTeX equation, handwriting, and table sample review"],
  },
  collaborative_grading: {
    routes: ["/owner/marking", "/owner/marking/moderation"],
    tests: ["tests/examsim-v3-collaborative-marking.test.ts"],
    migrations: ["supabase/migrations/20260619000500_v3_collaborative_marking.sql"],
  },
  institution_role_matrix: {
    routes: ["/owner/security"],
    tests: ["tests/examsim-v3-institution-roles.test.ts", "tests/examsim-v3-route-permissions.test.ts"],
    migrations: ["supabase/migrations/20260618140348_institution_role_matrix.sql", "supabase/migrations/20260619000400_v3_institution_permission_rollout.sql"],
  },
  live_invigilation: {
    routes: ["/owner/exam-sessions/[id]/live"],
    tests: ["tests/examsim-v3-invigilation-reliability.test.ts", "tests/attempt-state.test.ts"],
    migrations: ["supabase/migrations/20260620211840_v3_invigilation_acknowledgements.sql"],
    edgeFunctions: ["attempt-intervention", "record-attempt-event", "guest-send-invigilation-message", "acknowledge-invigilation-message", "guest-acknowledge-invigilation-message"],
    seededQa: ["Twenty-attempt classroom simulation"],
  },
  guest_upload_recovery: {
    tests: ["tests/upload-slots.test.ts", "tests/security-remediation.test.ts"],
    edgeFunctions: ["guest-issue-upload-slot-url", "guest-confirm-upload-slot", "guest-finalize-attempt", "attempt-recovery"],
  },
  offline_resilience: {
    components: ["components/exam/guest-exam-workspace.tsx"],
    tests: ["tests/student-experience.test.ts", "tests/examsim-v3-response-capabilities.test.ts"],
    browserVerification: ["Refresh, reconnect, and local typed-draft recovery"],
  },
  teacher_analytics: {
    routes: ["/owner/analytics"],
    tests: ["tests/examsim-v2-analytics.test.ts"],
    components: ["lib/examsim/analytics.ts"],
  },
  question_bank_generator: {
    routes: ["/owner/question-bank", "/owner/paper-generator"],
    tests: ["tests/examsim-v3-question-library-generator.test.ts", "tests/question-bank-source-preview.test.ts"],
    migrations: ["supabase/migrations/20260621080646_v3_question_library_blueprints.sql"],
  },
  student_claim_flow: {
    routes: ["/exam/link-account", "/owner/exam-sessions/[id]/reconcile"],
    tests: ["tests/examsim-v3-student-claim.test.ts"],
    migrations: ["supabase/migrations/20260619000100_v3_student_claim_flow.sql"],
    edgeFunctions: ["owner-issue-attempt-claim-code", "claim-guest-attempt"],
  },
  source_pdf_health: {
    components: ["components/owner/source-region-editor.tsx"],
    tests: ["tests/examsim-v2-compiler-readiness.test.ts", "tests/pdf-region-editor-pipeline.test.ts"],
    migrations: ["supabase/migrations/20260616165023_examsim_product_expansion.sql"],
  },
  accommodations_matrix: {
    components: ["components/owner/roster-accommodations-control.tsx", "components/exam/accommodation-summary.tsx"],
    tests: ["tests/examsim-v3-accommodations.test.ts", "tests/examsim-v3-rest-breaks.test.ts"],
    migrations: ["supabase/migrations/20260619000200_v3_rest_break_timing.sql", "supabase/migrations/20260620211544_v3_accommodation_policy_enforcement.sql"],
    edgeFunctions: ["attempt-intervention", "get-attempt-state", "guest-get-attempt-state"],
  },
  subject_tools: {
    tests: ["tests/examsim-v3-response-capabilities.test.ts"],
    components: ["components/structured-response-control.tsx", "components/response-capability-inputs.tsx"],
  },
  curriculum_alignment: {
    routes: ["/owner/topics", "/owner/standards"],
    tests: ["tests/examsim-v3-standards-analytics.test.ts"],
    migrations: ["supabase/migrations/20260621075807_v3_curriculum_standards.sql"],
  },
  adaptive_revision: {
    routes: ["/owner/revision", "/student/revision"],
    tests: ["tests/examsim-v3-adaptive-revision.test.ts"],
    migrations: ["supabase/migrations/20260621091000_v3_adaptive_revision.sql"],
    serverActions: ["app/owner/revision/actions.ts"],
  },
  qti_moodle_interop: {
    routes: ["/owner/export-hub"],
    tests: ["tests/examsim-v3-export-hub.test.ts", "tests/examsim-v3-export-governance.test.ts"],
    migrations: ["supabase/migrations/20260621093000_v3_export_governance.sql"],
    edgeFunctions: ["qti-export-assessment", "qti-import-assessment", "moodle-export-assessment"],
  },
  version_history_rollback: {
    routes: ["/owner/assessments/[id]/history"],
    tests: ["tests/examsim-v3-version-governance.test.ts"],
    migrations: ["supabase/migrations/20260620203637_v3_version_history_governance.sql", "supabase/migrations/20260620204344_v3_version_approval_governance.sql"],
  },
  school_reporting: {
    routes: ["/owner/analytics/cohorts", "/owner/cohorts", "/owner/export-hub"],
    tests: ["tests/examsim-v3-cohort-reporting.test.ts", "tests/examsim-v3-export-governance.test.ts"],
  },
  deployment_validation: {
    routes: ["/owner/security"],
    tests: ["tests/examsim-v3-deployment-readiness.test.ts", "tests/edge-security.test.ts"],
    browserVerification: ["Actual website guest, authenticated student, owner, marking, and release flow"],
  },
};

export function getExamsimProductionReadiness(env: ExamsimReadinessEnv = process.env) {
  const hasDeepSeek = hasEnv(env, "DEEPSEEK_API_KEY");
  const hasMineru = hasEnv(env, "MINERU_API_KEY") || hasEnv(env, "MINERU_WORKER_HMAC_SECRET");
  const hasSimpleTex = hasEnv(env, "SIMPLETEX_APP_ID") && hasEnv(env, "SIMPLETEX_APP_SECRET");
  const hasOcrProvider = hasMineru || hasSimpleTex;
  const hasMathpix = hasEnv(env, "MATHPIX_API_KEY");

  const items: Array<Omit<ExamsimProductionReadinessItem, "evidence">> = [
    {
      key: "smart_import_compiler",
      title: "Smart Import / Exam Compiler",
      status: hasDeepSeek && hasOcrProvider ? "staging_required" : "provider_required",
      ownerMessage: hasDeepSeek && hasOcrProvider
        ? "Provider-backed Smart Import can run through the configured DeepSeek and OCR paths, but a reviewed sample run, owner review, and batch-import preflight are still required before publishing."
        : "Smart Import has a manual PDF/LaTeX/JSON fallback plus sample QA and batch-PDF guardrails, but provider-backed OCR and AI extraction require configured DeepSeek and OCR credentials.",
      productionPath: "Upload PDF or LaTeX, run batch/source preflight, create source pages, repair regions, generate question cards, review sample QA and health, then publish.",
      fallback: "Teachers can upload PDFs, draw regions manually, edit question cards, run batch duplicate/size checks, and use deterministic LaTeX parsing without AI/OCR.",
      requiredEnvVars: ["DEEPSEEK_API_KEY", "SIMPLETEX_APP_ID + SIMPLETEX_APP_SECRET, or MINERU_API_KEY / MINERU_WORKER_HMAC_SECRET"],
      qaChecklist: ["Import a PDF", "Review sample-paper QA fixtures", "Check batch duplicate/size/provider guardrails", "Review low-confidence regions", "Publish only after health check warnings are handled"],
    },
    {
      key: "ocr_question_detection",
      title: "AI/OCR Question Detection",
      status: hasOcrProvider ? "staging_required" : "provider_required",
      ownerMessage: "Question and source extraction is provider-backed when MinerU or SimpleTeX credentials exist; all OCR output remains review-required and region boxes stay manually editable.",
      productionPath: "MinerU can extract layout; SimpleTeX can extract page/formula/table/handwriting content; deterministic repair and teacher review produce the question tree.",
      fallback: "Manual PDF Region Editor remains the production-safe workflow when providers are missing or low confidence.",
      requiredEnvVars: ["SIMPLETEX_APP_ID + SIMPLETEX_APP_SECRET, or MINERU_API_KEY / MINERU_WORKER_HMAC_SECRET", "Optional DEEPSEEK_API_KEY for semantic repair"],
      qaChecklist: ["Verify provider failure state", "Verify low-confidence queue", "Verify manual correction before publish"],
    },
    {
      key: "markscheme_rubrics",
      title: "Markscheme Mapping and Rubric Drafting",
      status: "ready",
      ownerMessage: "Markscheme mapping, rubric templates, rubric items, reusable feedback, per-rubric awards, owner-facing total warnings, and Edge-enforced question maximums are available with owner review boundaries.",
      productionPath: "Map markscheme blocks to question nodes, convert mark codes into editable rubric points, review rubric total warnings, mark with rubric clicks, then release feedback.",
      fallback: "Manual rubric authoring remains available if automatic markscheme parsing is low confidence.",
      requiredEnvVars: [],
      qaChecklist: ["Map a markscheme section", "Review rubric readiness warnings", "Award rubric items", "Confirm Edge rejects totals above question marks"],
    },
    {
      key: "ai_answer_grouping",
      title: "AI Answer Grouping",
      status: hasDeepSeek ? "staging_required" : "manual_fallback",
      ownerMessage: "Deterministic/manual grouping is safe today, including typed normalization, blank manual-review buckets, table/whiteboard manual-review groups, and numeric unit/tolerance grouping; semantic grouping remains provider-backed and review-required.",
      productionPath: "Group typed, numeric, table, whiteboard, and short text answers; teacher reviews groups before marks are applied.",
      fallback: "Manual and deterministic grouping are used when semantic AI grouping is not configured.",
      requiredEnvVars: ["DEEPSEEK_API_KEY"],
      qaChecklist: ["Create typed groups", "Verify numeric unit/tolerance grouping", "Review manual table/whiteboard buckets", "Audit group marking decisions"],
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
      status: "ready",
      ownerMessage: "Paper Mode now generates stable roster booklets and frozen paper attempts, verifies private scan PDFs server-side, supports audited manual page mapping, and renders mapped scans in digital marking. Automated OCR/barcode matching remains optional and provider-gated.",
      productionPath: "Generate personalized booklet packs, collect and privately upload scans, map each page to a booklet attempt and question, then mark through the normal rubric workflow.",
      fallback: "Manual page mapping is the supported production path whenever automatic OCR/barcode matching is unavailable or uncertain.",
      requiredEnvVars: ["Optional OCR/barcode provider credentials"],
      qaChecklist: ["Generate printable identifiers", "Upload scans", "Manually repair failed mappings"],
    },
    {
      key: "stem_handwriting_ocr",
      title: "Handwriting / STEM / Table / Diagram OCR",
      status: hasMathpix || hasOcrProvider ? "staging_required" : "provider_required",
      ownerMessage: "Advanced STEM OCR requires a capable provider; the app must keep manual transcription and region editing as the fallback.",
      productionPath: "Provider extracts handwriting, equations, tables, chemistry, and diagrams into review-required suggestions.",
      fallback: "Manual transcription, source-page preview, and teacher-edited question cards remain available.",
      requiredEnvVars: ["SIMPLETEX_APP_ID + SIMPLETEX_APP_SECRET, MATHPIX_API_KEY, or MINERU_API_KEY"],
      qaChecklist: ["Test equations", "Test handwritten proof", "Test table extraction", "Review provider confidence"],
    },
    {
      key: "collaborative_grading",
      title: "Anonymous and Collaborative Grading",
      status: "live_validation_required",
      ownerMessage: "Marker assignment and review surfaces exist, and V3 role permissions now have a server-side matrix. Full anonymous grading still needs real marker/reviewer validation on the actual website.",
      productionPath: "Assign marking work, hide student identity where configured, flag review conflicts, and audit grading decisions.",
      fallback: "Owner-led marking and review flags remain safe until anonymous/double-marking workflows are validated.",
      requiredEnvVars: [],
      qaChecklist: ["Assign a marker", "Hide student name", "Review a flagged mark", "Confirm students see released data only"],
    },
    {
      key: "institution_role_matrix",
      title: "Institution Role Matrix",
      status: "live_validation_required",
      ownerMessage: "Owner/admin, teacher, marker, reviewer, invigilator, and read-only roles now have an owner-scoped permission matrix, RLS-protected membership table, and role-aware owner navigation.",
      productionPath: "Create institution memberships, enforce server permission checks on sensitive owner actions, filter routes/navigation by permission, then validate each role with real accounts on the actual website.",
      fallback: "Owner-only top-level route guards remain the safest default until every data loader and sensitive flow is workspace-context aware.",
      requiredEnvVars: [],
      qaChecklist: ["Create teacher account", "Create marker account", "Verify denied publish/export/security access", "Verify owner-only membership management"],
    },
    {
      key: "live_invigilation",
      title: "Live Invigilation Dashboard",
      status: "live_validation_required",
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
      ownerMessage: "Server autosave/retry, recovery states, and attempt-token-bound local typed-response backup exist, but selected upload files cannot be retained after browser/process termination.",
      productionPath: "Recover typed/table/whiteboard responses through server autosaves and a local in-browser backup for the same guest attempt.",
      fallback: "Show honest recovery instructions and require file re-selection after browser/process restart.",
      requiredEnvVars: [],
      qaChecklist: ["Refresh during exam", "Recover local typed draft", "Reconnect after offline", "Verify no false offline-submission claim"],
    },
    {
      key: "teacher_analytics",
      title: "Teacher Analytics",
      status: "ready",
      ownerMessage: "Teacher analytics now summarize real stored attempts, marks, question nodes, topic links, and rubric awards; school-scale exports still need live validation with synthetic records.",
      productionPath: "Show score distribution, weakest questions, topic weaknesses, rubric loss, and low-score support flags from stored marking data.",
      fallback: "Owner can still review marking queue, attempts, results, and exports if a dataset is too sparse for meaningful analytics.",
      requiredEnvVars: [],
      qaChecklist: ["Mark several attempts", "Link topic tags", "Verify score distribution", "Verify rubric loss breakdown"],
    },
    {
      key: "question_bank_generator",
      title: "Question Bank and Mock Generator",
      status: "live_validation_required",
      ownerMessage: "Question library, extraction, subject filters, source previews, and mock generator exist; generated papers still need health-check validation before publish.",
      productionPath: "Extract approved root questions, preserve source references, filter by topic/marks/difficulty, generate draft, review, publish code.",
      fallback: "Manual assessment creation remains available if generator criteria cannot satisfy a paper exactly.",
      requiredEnvVars: [],
      qaChecklist: ["Extract from an approved paper", "Generate a mock by topic mix", "Replace one question", "Run publish health check"],
    },
    {
      key: "student_claim_flow",
      title: "Student Account Claim Flow",
      status: "live_validation_required",
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
      ownerMessage: "Health checks now cover missing source regions, unlinked question and supporting boxes, overlapping boxes, low confidence, missing marks/response types, failed PDF processing, and weighted readiness scoring.",
      productionPath: "Run health before publish; review the weighted score breakdown, block critical errors, and require warning acknowledgement.",
      fallback: "Teachers can manually repair source regions and question cards in the visual editor.",
      requiredEnvVars: [],
      qaChecklist: ["Check unlinked question regions", "Check unlinked diagram/table/instruction regions", "Check missing marks", "Check overlap warning", "Review score breakdown", "Acknowledge non-critical warnings"],
    },
    {
      key: "accommodations_matrix",
      title: "Accommodations Matrix",
      status: "live_validation_required",
      ownerMessage: "Per-student and session policies cover server-enforced extra time, upload extensions, access windows, rest breaks, display preferences, calculator/formula policies, and allowed materials. Session policies add teacher-approved subject tools; read-aloud uses the browser Web Speech API and must be checked on the actual student devices.",
      productionPath: "Apply per-student/session timing, access, font, tools, materials, and audit history.",
      fallback: "Standard presentation and no optional tools remain the fail-closed defaults when an accommodation is absent.",
      requiredEnvVars: [],
      qaChecklist: ["Apply extra time", "Verify server timer changes", "Review accommodation audit log"],
    },
    {
      key: "subject_tools",
      title: "Built-in Subject Tools",
      status: "live_validation_required",
      ownerMessage: "Browser Web Speech API read-aloud, Desmos graphing, GeoGebra geometry with CAS disabled, and self-hosted Ketcher are available only when explicitly enabled in the server-issued session policy.",
      productionPath: "Teacher enables only the permitted session tools; students open them from the exam response sidebar. Ketcher stays local, while Desmos and GeoGebra require internet access.",
      fallback: "Typed answers, table responses, whiteboard strokes, manual working uploads, and approved physical materials remain available when an external math tool cannot load.",
      requiredEnvVars: ["NEXT_PUBLIC_DESMOS_API_KEY when Desmos is enabled"],
      qaChecklist: ["Verify disabled-by-default policy", "Test browser TTS on student devices", "Load Desmos with production key", "Verify GeoGebra geometry has no CAS", "Export Ketcher SMILES and MOL", "Save a table response", "Save a whiteboard response"],
    },
    {
      key: "curriculum_alignment",
      title: "Curriculum / Standard Alignment",
      status: "ready",
      ownerMessage: "Owner-scoped hierarchical standards, question/rubric links, sample IB/MYP/IGCSE/Olympiad-SAMO starters, and standards mastery analytics are implemented. Starter content remains owner-reviewed rather than claiming official completeness.",
      productionPath: "Attach subject, topic, subtopic, standard, command term, and difficulty to questions/rubrics.",
      fallback: "Owners can import or manage their own verified standard tree and continue using manual topic tags.",
      requiredEnvVars: [],
      qaChecklist: ["Seed standards", "Tag questions", "Verify analytics by tag"],
    },
    {
      key: "adaptive_revision",
      title: "Adaptive Revision Generator",
      status: "ready",
      ownerMessage: "Teacher-reviewed revision sets are generated only from released mark, topic, and standard evidence, matched to reviewed Question Library items, and exposed to the linked student through a checked safe projection.",
      productionPath: "Generate a draft for a linked student, remove unsuitable questions, assign the frozen set, and let the student view it in the results portal.",
      fallback: "Teachers can create a manually curated Question Library set when released evidence is sparse or tagging is incomplete.",
      requiredEnvVars: [],
      qaChecklist: ["Generate from released marks", "Remove a suggestion", "Assign the reviewed set", "Verify another student cannot read it"],
    },
    {
      key: "qti_moodle_interop",
      title: "QTI / Moodle / XML Interoperability",
      status: "live_validation_required",
      ownerMessage: "Export Hub provides audited CSV/JSON/PDF handoffs, assessment-scoped QTI, and conservative Moodle XML. Unsupported Moodle interactions are converted to review-required essay questions with explicit fidelity warnings.",
      productionPath: "Export/import without losing marks, response types, topics, or source metadata silently; keep lossy formats visibly warned.",
      fallback: "Use normalized JSON or assessment-scoped QTI when Moodle cannot preserve an Exam Vault interaction without loss.",
      requiredEnvVars: [],
      qaChecklist: ["Export CSV/JSON handoff", "Export QTI from an assessment", "Check unsupported-feature warnings", "Validate normalized JSON"],
    },
    {
      key: "version_history_rollback",
      title: "Version History and Rollback",
      status: "live_validation_required",
      ownerMessage: "Published versions are frozen; owners can compare historical question, rubric, topic, standard, and source-region changes and restore a historical snapshot only as a new draft with an audit trail.",
      productionPath: "Duplicate from old version, compare text/marks/rubrics/topics/source regions, and publish a new version.",
      fallback: "Create a new draft version rather than mutating live attempts.",
      requiredEnvVars: [],
      qaChecklist: ["Publish version", "Create draft from existing", "Compare source-region changes", "Confirm live attempts stay attached"],
    },
    {
      key: "school_reporting",
      title: "School-level Reporting",
      status: "live_validation_required",
      ownerMessage: "The owner-scoped cohort dashboard reports performance, completion, marking completion, topic and standards mastery, paper comparison, support flags, CSV, and PDF exports. Multi-account isolation still requires live validation.",
      productionPath: "Show group comparisons, completion rates, topic weaknesses, support flags, progress, and exports.",
      fallback: "Use Export Hub owner-scoped cohort CSV/PDF handoffs when the dataset is too small for meaningful dashboard comparison.",
      requiredEnvVars: [],
      qaChecklist: ["Check owner-only data boundaries", "Export group report", "Verify no cross-workspace leakage"],
    },
    {
      key: "deployment_validation",
      title: "Deployment Validation",
      status: "live_validation_required",
      ownerMessage: "The repo can pass static checks locally, but the actual website still needs migrations, Edge deployment, env vars, private buckets, and synthetic workflow QA verified live.",
      productionPath: "Run migrations, deploy Edge Functions, set secrets, confirm buckets private, then run the end-to-end workflow on the actual website with synthetic test records.",
      fallback: "Do not launch high-stakes exams until the live validation checklist passes.",
      requiredEnvVars: ["APP_ALLOWED_ORIGINS", "ATTEMPT_STATE_TOKEN_SECRET", "MINERU_WORKER_HMAC_SECRET"],
      qaChecklist: ["Run lint/typecheck/test/build", "Deploy Edge Functions", "Apply migrations", "Run synthetic guest and authenticated flows"],
    },
  ];

  return items.map((item) => ({
    ...item,
    evidence: EXAMSIM_READINESS_EVIDENCE[item.key],
  }));
}

export function summarizeExamsimProductionReadiness(items: ExamsimProductionReadinessItem[]) {
  return {
    total: items.length,
    ready: countStatus(items, "ready"),
    providerRequired: countStatus(items, "provider_required"),
    manualFallback: countStatus(items, "manual_fallback"),
    blocked: countStatus(items, "blocked"),
    liveValidationRequired: countStatus(items, "live_validation_required"),
    stagingRequired: countStatus(items, "staging_required"),
    v4Future: countStatus(items, "v4_future"),
  };
}

export function buildReleaseCandidateReadiness(items: ExamsimProductionReadinessItem[]): ExamsimReleaseCandidateReadiness {
  const remainingItems = items.filter((item) => item.status !== "ready");
  const blockingCount = countStatus(items, "blocked");
  const providerGatedCount = countStatus(items, "provider_required");
  const liveValidationRequiredCount = countStatus(items, "live_validation_required");
  const stagingRequiredCount = countStatus(items, "staging_required");
  const v4FutureCount = countStatus(items, "v4_future");
  const manualFallbackCount = countStatus(items, "manual_fallback");
  const readyForFullV3 = remainingItems.length === 0;

  return {
    readyForFullV3,
    ownerMessage: readyForFullV3
      ? "Full V3 is ready for release-candidate validation."
      : "Full V3 is not ready. Resolve blocked, provider-gated, live-validation-required, and manual-fallback items before making a production-ready V3 claim.",
    blockingCount,
    providerGatedCount,
    liveValidationRequiredCount,
    stagingRequiredCount,
    v4FutureCount,
    manualFallbackCount,
    remainingItems,
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
