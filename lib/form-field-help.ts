export type FieldHelpInput = {
  name?: string | null;
  type?: string | null;
  placeholder?: string | null;
  label?: string | null;
  tagName?: string | null;
};

const HELP_BY_KEY: Record<string, string> = {
  assessment_kind: "Choose the type of assessment this will become. This controls default workflow labels and filters.",
  assessment_version_id: "Choose the published or draft assessment version this action should use.",
  assessment_version_selection: "Choose the assessment and version for this exam session.",
  class_group: "Enter the class or group label, such as DP1 or Group A. This helps match and filter students.",
  code: "Enter a custom exam code or leave it blank to generate one. Students use this code to enter the exam.",
  count: "Enter how many records to generate. This controls the number of new rows created.",
  description: "Enter a short explanation. This appears in owner workflows and helps distinguish similar items.",
  display_name: "Enter the name shown in the app. This identifies the student or account in owner workflows.",
  display_timezone: "Choose the timezone displayed to users. Stored timestamps remain server-controlled UTC.",
  duration_minutes: "Enter the writing time in minutes. The server uses this to compute the official end time.",
  duration_seconds: "Enter the writing time in seconds. Server-side attempt state uses this value.",
  email: "Enter an optional email address for reference. Do not put passwords or private identifiers here.",
  feedback_text: "Enter reusable student-facing feedback. It can be inserted while marking.",
  first_ordinal: "Enter the first number in the generated sequence, for example 1 for DP1-001.",
  label: "Enter a short label. This is used in lists, menus, and quick selection controls.",
  mark_code: "Enter the mark code, such as M1, A1, or B1. This identifies the rubric point.",
  marks: "Enter the marks available for this question. Parent totals are computed from child questions when applicable.",
  max_marks: "Enter the maximum marks for this rubric point.",
  name: "Enter a clear name. This is used to identify the item in lists and filters.",
  node_key: "Enter the question key, such as Q3(a). This links the source region to the question tree.",
  page_number: "Enter the source PDF page number for this region.",
  paper_code: "Enter the paper or exam code, such as CHEM-P2-047. This helps identify the assessment later.",
  prefix: "Enter the student-number prefix, such as DP1, MYP5, G11, or E. Generated numbers use this prefix.",
  question_node_id: "Choose the question this item belongs to. This connects marks, uploads, or regions to the question tree.",
  response_mode: "Choose how students answer this question, such as typed text, numerical answer, or PDF upload.",
  source_kind: "Choose the source type. This decides whether the PDF, LaTeX, or JSON workflow is used.",
  source_page_end: "Enter the last PDF page that belongs to this question.",
  source_page_start: "Enter the first PDF page that belongs to this question.",
  start_at_utc: "Enter when writing time begins. The server uses this official start time.",
  status: "Choose the workflow status. This controls review, visibility, or queue behavior.",
  student_number: "Enter the teacher-issued student number, such as DP1-007 or E001. This identifies the student; it is not a password.",
  subject: "Enter or choose the subject. This powers filters, question library metadata, and paper generation.",
  tags: "Enter short comma-separated tags. Tags make items easier to find and reuse.",
  title: "Enter the title shown to users. Use a clear assessment, session, or question name.",
  upload_grace_minutes: "Enter extra upload-only time after writing ends. Writing stays disabled during this period.",
};

export function buildFieldHelp(input: FieldHelpInput) {
  const key = normalizeKey(input.name) || normalizeKey(input.label) || normalizeKey(input.placeholder);
  if (key && HELP_BY_KEY[key]) return HELP_BY_KEY[key];

  const label = cleanText(input.label || input.placeholder || input.name || input.tagName || "this field");
  const type = String(input.type || "").toLowerCase();
  const tag = String(input.tagName || "").toLowerCase();

  if (type === "email") return `Enter an email address for ${label}. This is used for contact or account identification when supported.`;
  if (type === "password") return `Enter the password for ${label}. Keep it private and do not share it.`;
  if (type === "datetime-local" || type === "date") return `Choose the date or time for ${label}. Server-side workflows use this value for scheduling or records.`;
  if (type === "number") return `Enter a number for ${label}. This value controls the related count, timing, marks, or limit.`;
  if (type === "file") return `Choose the file for ${label}. The upload is validated before it is accepted.`;
  if (type === "checkbox") return `Turn this setting on or off. This changes how ${label} behaves.`;
  if (type === "radio") return `Choose this option for ${label}. Only one option in the group can be selected.`;
  if (tag === "select") return `Choose the option for ${label}. This controls how the related workflow is handled.`;
  if (tag === "textarea") return `Enter the details for ${label}. This text is saved with the related record or workflow.`;

  return `Enter ${label}. This field is used to identify, configure, or save the related item.`;
}

function normalizeKey(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cleanText(value: string | null | undefined) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
