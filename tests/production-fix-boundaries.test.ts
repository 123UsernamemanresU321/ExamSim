import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("production deployment boundary", () => {
  it("does not ship the removed GitHub Pages static export path", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts).not.toHaveProperty("build:pages");
    expect(existsSync(".github/workflows/deploy-pages.yml")).toBe(false);
    expect(existsSync("scripts/prepare-github-pages.mjs")).toBe(false);
    expect(read("next.config.ts")).not.toMatch(/output:\s*["']export["']/);
    expect(read("proxy.ts")).toContain("createServerClient");
  });

  it("keeps demo mode local-only", () => {
    expect(read("lib/runtime.ts")).toContain('process.env.NODE_ENV !== "production"');
    expect(read("README.md")).toContain("Vercel SSR is the required production host");
    expect(read("SECURITY.md")).toContain("Static export hosting is not supported");
  });
});

describe("RLS and storage hardening migration", () => {
  it("drops direct student content and result policies", () => {
    const migration = read("supabase/migrations/202605120001_harden_content_release_boundaries.sql");
    expect(migration).toContain('drop policy if exists "student reads assigned assessment package"');
    expect(migration).toContain('drop policy if exists "student manages own answer uploads"');
    expect(migration).toContain('drop policy if exists "student reads released question nodes"');
    expect(migration).toContain('drop policy if exists "student reads released assessment versions"');
    expect(migration).toContain('drop policy if exists "student reads released marks"');
    expect(migration).toContain('drop policy if exists "student reads released feedback annotations"');
    expect(migration).toContain('drop policy if exists "student reads own released feedback"');
  });

  it("does not leave the old student result policy migration active", () => {
    const migration = read("supabase/migrations/202605090001_student_results_rls.sql");
    expect(migration).not.toContain("create policy");
    expect(migration).toContain("Student-visible results are now served through Edge Functions");
  });

  it("tracks optional markscheme sources on assessment versions", () => {
    const migration = read("supabase/migrations/202605140001_markscheme_source_workflow.sql");
    expect(migration).toContain("markscheme_source_kind");
    expect(migration).toContain("markscheme_source_object_path");
    expect(migration).toContain("assessment-sources");
  });

  it("persists original student upload filenames on upload slots", () => {
    expect(read("supabase/migrations/202605160001_upload_slot_original_file_name.sql")).toContain("original_file_name");
    const confirmUpload = read("supabase/functions/confirm-upload-slot/index.ts");
    expect(confirmUpload).toContain("file_name?: string");
    expect(confirmUpload).toContain("original_file_name: originalFileName");
    expect(confirmUpload).toContain("sanitizeOriginalFileName");
  });

  it("creates upload slots only for root/main question nodes", () => {
    const migration = read("supabase/migrations/202605170002_question_hierarchy_root_upload_slots.sql");
    expect(migration).toContain("root.node_type = 'question'");
    expect(migration).toContain("root.parent_node_id is null");
    expect(migration).toContain("subquestions and deeper parts never receive separate student upload slots");
  });
});

describe("Edge state and content release boundaries", () => {
  it("binds state tokens to attempt sessions when provided", () => {
    const source = read("supabase/functions/get-attempt-state/index.ts");
    expect(source).toContain("attempt_session_id?: string");
    expect(source).toContain(".from(\"attempt_sessions\")");
    expect(source).toContain("attempt_session_id: attemptSessionId");
  });

  it("denies package release while waiting and returns server-issued asset urls when released", () => {
    const source = read("supabase/functions/get-attempt-package/index.ts");
    expect(source).toContain('state === "WAITING"');
    expect(source).toContain("Content not available yet");
    expect(source).toContain("asset_urls: assetUrls");
    expect(source).toContain('admin.storage.from("assessment-packages").createSignedUrl');
  });

  it("uses shared structured Edge error responses for formerly inconsistent functions", () => {
    for (const path of [
      "supabase/functions/publish-assessment/index.ts",
      "supabase/functions/export-marks-csv/index.ts",
      "supabase/functions/mineru-submit-hosted-job/index.ts",
      "supabase/functions/mineru-poll-hosted-job/index.ts",
      "supabase/functions/seb-handshake/index.ts",
      "supabase/functions/seb-verify-session/index.ts",
      "supabase/functions/upload-seb-config/index.ts",
    ]) {
      expect(read(path), path).toContain("errorResponse");
    }
    expect(read("supabase/functions/_shared/http.ts")).toContain("invalid jwt");
  });

  it("implements SEB release as server-side request-hash verification", () => {
    const shared = read("supabase/functions/_shared/seb.ts");
    expect(shared).toContain("x-safeexambrowser-requesthash");
    expect(shared).toContain("x-safeexambrowser-configkeyhash");
    expect(shared).toContain("canonicalizeSebUrl");
    expect(shared).toContain("verifySebRequestHashes");
    expect(shared).toContain("APP_ALLOWED_ORIGINS");

    const packageGate = read("supabase/functions/get-attempt-package/index.ts");
    expect(packageGate).toContain("SEB attempts require a session-bound state token");
    expect(packageGate).toContain("sebVerificationTtlSeconds");
    expect(packageGate).not.toContain("seb_browser_exam_key_hash?:");
    expect(packageGate).not.toContain("seb_config_key_hash?:");

    const sessionVerifier = read("supabase/functions/seb-verify-session/index.ts");
    expect(sessionVerifier).toContain("mode?: \"header\" | \"js_api\"");
    expect(sessionVerifier).toContain("validateSebPageUrl");
    expect(sessionVerifier).toContain("verifyStateToken");
    expect(sessionVerifier).toContain("seb_verified_at");
  });

  it("does not use user-agent or body-forged SEB keys in the active exam client", () => {
    const source = read("components/exam/exam-workspace.tsx");
    expect(source).toContain('"seb-verify-session"');
    expect(source).toContain('"get-attempt-package"');
    expect(source).not.toContain("navigator.userAgent");
    expect(source).not.toContain("seb_browser_exam_key_hash:");
    expect(source).not.toContain("seb_config_key_hash:");
  });

  it("routes owner SEB config upload through an AAL2-gated Edge Function", () => {
    const form = read("components/owner/publish-assessment-form.tsx");
    expect(form).toContain('"upload-seb-config"');
    expect(form).not.toContain('.storage\n        .from("assessment-sources")');
    expect(form).toContain("requiresAal2: true");
    expect(read("supabase/functions/upload-seb-config/index.ts")).toContain("requireOwnerAal2");
  });
});

describe("AI parse review boundary", () => {
  it("does not reject PDF/MinerU suggestions solely because a latex prompt is short", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).not.toContain("latex prompt suspiciously short");
    expect(source).toContain("prompt is short; owner should verify PDF/OCR extraction.");
    expect(source).toContain("warnings.push");
  });

  it("instructs DeepSeek to emit semantic tables and delimited math", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain("<table>, <thead>, <tbody>, <tr>, <th>, <td>");
    expect(source).toContain("Use semantic HTML tables for tabular or grid content");
    expect(source).toContain("Do not flatten tables into tabs or spaces");
    expect(source).toContain("wrap all mathematical expressions in $...$ or $$...$$");
  });

  it("instructs DeepSeek to use numerical response mode for numeric answers", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain('Use response_mode \\"numerical\\"');
    expect(source).toContain("expected answer is a number, value, numerator, count, measurement, coordinate, or decimal");
  });

  it("instructs DeepSeek to preserve nested stems and parent-child hierarchy for marking", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain("Preserve the shared question stem");
    expect(source).toContain("Parent marks are display/reference totals only");
    expect(source).toContain('Q3 (parent) -> (a) (child) -> (i) (grandchild)');
    expect(source).toContain("nearest common parent node");
    expect(source).toContain("Never classify a cover page, instruction page, formula sheet");
    expect(source).toContain("Do not map markscheme front-page instructions to Q1");
    expect(source).toContain("ordinal_path");
  });

  it("uses markscheme context to allocate marks and generate marking guidance", () => {
    const source = read("supabase/functions/ai-parse-assessment/index.ts");
    expect(source).toContain("MARKSCHEME AND MARK ALLOCATION RULES");
    expect(source).toContain("Markscheme context (solutions, mark allocations, and marking guidance)");
    expect(source).toContain("assign exact marks to answerable leaf nodes");
    expect(source).toContain("markscheme_html");
    expect(source).toContain("loadMarkschemeContext");
  });
});

describe("markscheme source ingestion", () => {
  it("stores markscheme sources privately and queues separate markscheme OCR jobs", () => {
    const source = read("supabase/functions/ingest-assessment/index.ts");
    expect(source).toContain("markscheme_source_kind");
    expect(source).toContain("resolveMarkschemeSource");
    expect(source).toContain('parse_purpose: "markscheme"');
    expect(source).toContain("mergeMarkschemeIntoPackage");
    expect(source).toContain("markscheme_source_object_path");
  });

  it("persists global markscheme html when a reviewed AI package is saved", () => {
    const source = read("supabase/functions/update-question-tree/index.ts");
    expect(source).toContain("assessmentMarkschemeHtml");
    expect(source).toContain("markscheme_html: assessmentMarkschemeHtml");
  });
});

describe("client sensitive write cleanup", () => {
  it("routes typed responses and flags through Edge Functions", () => {
    expect(read("components/response-text-area.tsx")).toContain('"save-text-response"');
    expect(read("components/response-text-area.tsx")).not.toContain('from("text_responses")');
    expect(read("components/question-paper.tsx")).toContain('"set-question-flag"');
    expect(read("components/question-paper.tsx")).not.toContain('from("submission_annotations")');
  });

  it("routes owner private object viewing through owner-only signed URL Edge Function", () => {
    expect(read("components/owner/parse-review-client.tsx")).toContain('"owner-sign-storage-url"');
    expect(read("components/owner/marking-response-workspace.tsx")).toContain('"owner-sign-storage-url"');
    expect(read("components/owner/marking-workspace-form.tsx")).toContain('"owner-sign-storage-url"');
  });

  it("hydrates released package nodes with database UUIDs before student writes", () => {
    const source = read("supabase/functions/get-attempt-package/index.ts");
    expect(source).toContain("hydratePackageQuestionNodeIds");
    expect(source).toContain(".from(\"question_nodes\")");
    expect(source).toContain("node_key");
    expect(source).toContain("assessmentPackageWithDatabaseIds");
  });

  it("resolves student write question nodes by uuid or node key without direct table writes", () => {
    const saveSource = read("supabase/functions/save-text-response/index.ts");
    expect(saveSource).toContain("question_node_key?: string");
    expect(saveSource).toContain("resolveQuestionNodeForAttempt");
    expect(saveSource).toContain("isUuid");

    const flagSource = read("supabase/functions/set-question-flag/index.ts");
    expect(flagSource).toContain("question_node_key?: string");
    expect(flagSource).toContain("resolveQuestionNodeForAttempt");

    const questionPaper = read("components/question-paper.tsx");
    expect(questionPaper).toContain("question_node_key: node.node_key");
    expect(questionPaper).toContain("questionNodeKey={node.node_key}");
  });

  it("links student question uploads with sidebar upload slot state", () => {
    const screenData = read("lib/attempt-screen-data.ts");
    expect(screenData).toContain("uploadSlots: UploadSlot[]");
    expect(screenData).toContain('.from("upload_slots")');

    const examWorkspace = read("components/exam/exam-workspace.tsx");
    expect(examWorkspace).toContain("handleUploadComplete");
    expect(examWorkspace).toContain("onUploadComplete={handleUploadComplete}");
    expect(examWorkspace).toContain("original_file_name: completion.fileName");

    const questionPaper = read("components/question-paper.tsx");
    expect(questionPaper).toContain("uploadStudentPdfForQuestion");
    expect(questionPaper).toContain("Uploaded - locked");
    expect(questionPaper).toContain("Uploaded:");

    const uploadCard = read("components/upload-slot-card.tsx");
    expect(uploadCard).toContain("Uploaded file:");
    expect(uploadCard).toContain("PDF uploaded and locked for this slot.");
    expect(uploadCard).toContain("onUploadComplete?.(completion)");
  });

  it("serves student results through the checked Edge Function only", () => {
    expect(read("app/student/attempts/[id]/results/page.tsx")).toContain("getStudentAttemptResultsWorkspace");
    expect(read("app/student/results/client.tsx")).toContain('"list-student-results"');
    expect(read("app/student/results/client.tsx")).not.toContain('from("feedback_releases")');
    expect(existsSync("components/student/student-results-client.tsx")).toBe(false);
    expect(read("lib/live-data.ts")).toContain('"get-student-results"');
  });
});

describe("student response type controls", () => {
  it("renders structured response controls through Edge-saved text responses", () => {
    const questionPaper = read("components/question-paper.tsx");
    expect(questionPaper).toContain("ChoiceResponseControl");
    expect(questionPaper).toContain("NumericalResponseControl");

    const structuredControl = read("components/structured-response-control.tsx");
    expect(structuredControl).toContain("type=\"checkbox\"");
    expect(structuredControl).toContain("type=\"radio\"");
    expect(structuredControl).toContain("inputMode=\"decimal\"");
    expect(structuredControl).toContain('"save-text-response"');
    expect(structuredControl).not.toContain('from("text_responses")');
  });

  it("updates database and parser response mode allowlists for numerical responses", () => {
    expect(read("lib/constants.ts")).toContain('"numerical"');
    expect(read("supabase/functions/update-question-tree/index.ts")).toContain('"numerical"');
    expect(read("supabase/functions/ai-parse-assessment/index.ts")).toContain('"numerical"');
    expect(read("supabase/migrations/202605130002_add_numerical_response_mode.sql")).toContain("'numerical'");
  });
});

describe("marking workspace structured scoring", () => {
  it("marks numerical and multiple-choice responses as correct or incorrect", () => {
    const workspace = read("components/owner/marking-response-workspace.tsx");
    expect(workspace).toContain("responseModeUsesBinaryMarking");
    expect(workspace).toContain("Correct - award full marks");
    expect(workspace).toContain("Incorrect - award 0 marks");
    expect(workspace).toContain("markForBinaryDecision");
    expect(workspace).toContain("binaryMarkDecisionFromAwarded");
  });

  it("keeps the legacy marking form binary for structured response modes", () => {
    const workspace = read("components/owner/marking-workspace-form.tsx");
    expect(workspace).toContain("responseModeUsesBinaryMarking");
    expect(workspace).toContain("Correct");
    expect(workspace).toContain("Incorrect");
    expect(workspace).toContain("markForBinaryDecision");
  });

  it("rejects partial structured marks in the save-marking Edge Function", () => {
    const source = read("supabase/functions/save-marking/index.ts");
    expect(source).toContain("validateStructuredMarkRows");
    expect(source).toContain('"multiple_choice"');
    expect(source).toContain('"numerical"');
    expect(source).toContain("must be marked correct or incorrect");
  });

  it("uses a recursive marking tree instead of flat question node pages", () => {
    expect(read("lib/marking-tree.ts")).toContain("buildMarkingTree");
    expect(read("lib/marking-tree.ts")).toContain("inferParentId");
    expect(read("lib/marking-tree.ts")).toContain("computeMarkingTotals");

    const layout = read("components/owner/marking-layout.tsx");
    expect(layout).toContain("getSelectableMarkingGroups");
    expect(layout).toContain("getMarkableLeafNodes");
    expect(layout).not.toContain("workspace.questionNodes.find((n) => n.node_type !== \"section\")");

    const sidebar = read("components/owner/marking-sidebar-tree.tsx");
    expect(sidebar).toContain("SidebarNode");
    expect(sidebar).toContain("mark-node-");
    expect(sidebar).toContain("Leaf progress");
  });

  it("renders question assets and full descendant prompts in the marking workspace", () => {
    const source = read("components/owner/marking-center-panel.tsx");
    expect(source).toContain("QuestionPromptNode");
    expect(source).toContain("QuestionAssets");
    expect(source).toContain('"owner-sign-storage-url"');
    expect(source).toContain('bucket: "assessment-packages"');
  });

  it("rejects direct parent-node marks in the save-marking Edge Function", () => {
    const source = read("supabase/functions/save-marking/index.ts");
    expect(source).toContain("parentIdsWithChildren");
    expect(source).toContain("Parent question marks are derived from child question marks");
  });
});

describe("prompt rendering and AAL2 stability", () => {
  it("does not wrap whole prose prompts in display math in the marking workspace", () => {
    const source = read("components/owner/marking-center-panel.tsx");
    expect(source).not.toContain("$$${node.prompt_latex}$$");
    expect(source).toContain("latex={node.prompt_html ? undefined : node.prompt_latex ?? undefined}");
  });

  it("does not rotate the Supabase session while only checking current AAL2", () => {
    const source = read("lib/supabase/functions-client.ts");
    const helper = source.slice(source.indexOf("export async function assertOwnerAal2"));
    expect(helper).not.toContain("refreshSession");
    expect(helper).toContain("getAuthenticatorAssuranceLevel");
  });

  it("does not rely on post-render DOM mutation for KaTeX prompts", () => {
    const source = read("components/math-renderer.tsx");
    expect(source).toContain("renderMathMarkup");
    expect(source).not.toContain("renderMathInElement");
  });
});

describe("work annotations and mark discussion tickets", () => {
  it("adds annotation and ticket tables without direct student RLS access", () => {
    const migration = read("supabase/migrations/202605140002_work_annotations_and_marking_tickets.sql");
    expect(migration).toContain("create table if not exists public.work_annotations");
    expect(migration).toContain("create table if not exists public.marking_tickets");
    expect(migration).toContain("create table if not exists public.marking_ticket_messages");
    expect(migration).toContain("alter table public.work_annotations enable row level security");
    expect(migration).toContain('create policy "owner manages work annotations"');
    expect(migration).not.toContain("student reads work annotations");
    expect(migration).not.toContain("student reads marking tickets");
  });

  it("keeps marker annotations owner-AAL2 gated and separate from submitted work", () => {
    const edge = read("supabase/functions/save-work-annotation/index.ts");
    expect(edge).toContain("requireOwnerAal2");
    expect(edge).toContain("work_annotations");
    expect(edge).toContain("anchor_json");
    expect(edge).toContain("work_annotation.saved");

    const workspace = read("components/owner/marking-response-workspace.tsx");
    expect(workspace).toContain("Student work - uploaded PDF");
    expect(workspace).toContain("Original submission stays unchanged");
    expect(workspace).toContain('"save-work-annotation"');
  });

  it("provides a full-screen annotation studio for advanced document markup", () => {
    const studio = read("components/owner/work-annotation-studio.tsx");
    expect(studio).toContain("Annotation Studio");
    expect(studio).toContain("PdfAnnotationPage");
    expect(studio).toContain("annotation-v2");
    const toolbar = read("components/owner/annotation-toolbar.tsx");
    expect(toolbar).toContain('"text"');
    expect(toolbar).toContain('"rectangle"');
    expect(toolbar).toContain('"circle"');
    expect(toolbar).toContain('"pen"');
    expect(studio).not.toContain("viewBox=\"0 0 100 100\"");
    expect(studio).toContain('"save-work-annotation"');
    expect(studio).toContain("Open annotation studio");

    const workspace = read("components/owner/marking-response-workspace.tsx");
    expect(workspace).toContain("WorkAnnotationStudio");
  });

  it("uses a direct-on-PDF annotation layer instead of a detached blank placement page", () => {
    const studio = read("components/owner/work-annotation-studio.tsx");
    const page = read("components/owner/pdf-annotation-page.tsx");
    expect(studio).not.toContain("Page/view {pageNumber} annotation layer");
    expect(page).toContain("pdf-canvas");
    expect(page).toContain("annotation-overlay");
    expect(page).toContain("pointerEvents: \"none\"");
    expect(page).toContain("touchAction: \"none\"");
    expect(page).toContain("WebkitUserSelect");
    expect(page).toContain("setPointerCapture");
    expect(page).toContain("screenToNormalized");
  });

  it("keeps annotation dragging local until pointer-up to prevent PDF repaint flashing", () => {
    const page = read("components/owner/pdf-annotation-page.tsx");
    const studio = read("components/owner/work-annotation-studio.tsx");
    expect(page).toContain("dragPreview");
    expect(page).toContain("setDragPreview(updated)");
    expect(page).not.toContain("onUpdateAnnotation(updated);");
    expect(page).toContain("onUpdateAnnotation(interaction.annotation)");
    expect(studio).toContain("isInteracting");
    expect(studio).toContain("onInteractionChange");
    expect(studio).not.toContain("router.refresh();\n      } catch (error) {\n      console.error(\"Annotation autosave failed\"");
  });

  it("does not wipe local annotations from stale props after autosave clears dirty state", () => {
    const studio = read("components/owner/work-annotation-studio.tsx");
    expect(studio).toContain("syncedAnnotationsSourceKeyRef");
    expect(studio).toContain("annotationsSourceKey");
    expect(studio).toContain("syncedAnnotationsSourceKeyRef.current === annotationsSourceKey");
    expect(studio).toContain("setSelectedAnnotationId((current) =>");
    expect(studio).not.toContain("if (!open || isInteracting || dirtyCount || deletedCount) return;\n    const id = window.setTimeout");
  });

  it("hides embedded PDF preview iframes behind the full-screen annotation studio", () => {
    expect(read("components/owner/marking-response-workspace.tsx")).toContain("data-hide-during-annotation-studio");
    expect(read("components/owner/work-annotation-studio.tsx")).toContain("annotationStudioOpen");
    const css = read("app/globals.css");
    expect(css).toContain("[data-annotation-studio-open=\"true\"] iframe[data-hide-during-annotation-studio=\"true\"]");
    expect(css).toContain("visibility: hidden");
    expect(css).toContain("pointer-events: none");
  });

  it("generates annotated PDFs as private copies without mutating the original upload", () => {
    expect(read("supabase/migrations/202605170001_upload_slot_annotated_pdf.sql")).toContain("annotated_object_path");
    const edge = read("supabase/functions/generate-annotated-pdf/index.ts");
    expect(edge).toContain("requireOwnerAal2");
    expect(edge).toContain('storage.from("answer-uploads").download');
    expect(edge).toContain('storage.from("marking-packets").upload');
    expect(edge).toContain("annotated_object_path");
    expect(edge).toContain("pageHeight - clamp(point.y");

    const student = read("components/student/student-results-workspace.tsx");
    expect(student).toContain("Released annotated PDF");
    expect(student).toContain("get-student-original-upload-url");
    expect(student).toContain("Original copy is available on request");
    expect(read("supabase/functions/get-student-results/index.ts")).toContain("annotatedUploadUrls");
  });

  it("supports annotation font size controls in studio rendering and export", () => {
    expect(read("components/owner/annotation-properties-panel.tsx")).toContain("Font size");
    expect(read("components/owner/pdf-annotation-page.tsx")).toContain("annotation.style.font_size");
    expect(read("components/owner/work-annotation-studio.tsx")).toContain("font_size");
    const edge = read("supabase/functions/generate-annotated-pdf/index.ts");
    expect(edge).toContain("const fontSize");
    expect(edge).toContain("lineHeight: fontSize + 2");
  });

  it("separates marking, moderation, and dispute workspaces in the owner UI", () => {
    const layout = read("components/owner/marking-layout.tsx");
    expect(layout).toContain("Marking & Annotations");
    expect(layout).toContain("Moderation & Timeline");
    expect(layout).toContain("Discussion / Appeals");
    expect(layout).toContain("showDiscussion={false}");

    const workspace = read("components/owner/marking-response-workspace.tsx");
    expect(workspace).toContain("MarkingDiscussionWorkspace");
    expect(workspace).toContain("showDiscussion?: boolean");
  });

  it("serves released annotations and uploaded work previews through the results Edge Function", () => {
    const edge = read("supabase/functions/get-student-results/index.ts");
    expect(edge).toContain("work_annotations");
    expect(edge).toContain('workAnnotations: profile.app_role === "owner" ? workAnnotations ?? [] : []');
    expect(edge).toContain("marking_tickets");
    expect(edge).toContain("marking_ticket_messages");
    expect(edge).not.toContain("createSignedUrl(slot.object_path, 300)");
    expect(read("supabase/functions/get-student-original-upload-url/index.ts")).toContain("feedback_releases");
    expect(read("supabase/functions/get-student-original-upload-url/index.ts")).toContain('event_type: "student.original_upload_requested"');
    expect(edge).toContain("uploadUrls");

    const student = read("components/student/student-results-workspace.tsx");
    expect(student).not.toContain("Marker annotations on your work");
    expect(student).not.toContain("Your uploaded PDF");
    expect(student).toContain("Released annotated PDF");
    expect(student).toContain("Discussion / appeals");
    expect(student).toContain('"marking-ticket"');
    expect(student).toContain("Open discussion");
  });

  it("implements a feedback-gated owner/student ticket workflow", () => {
    const source = read("supabase/functions/marking-ticket/index.ts");
    expect(source).toContain('action: "create" | "reply" | "update_status"');
    expect(source).toContain("assertFeedbackReleased");
    expect(source).toContain("owner_review");
    expect(source).toContain("student_reply");
    expect(source).toContain("requireAal2");
    expect(source).toContain("marking_ticket_messages");
  });
});
