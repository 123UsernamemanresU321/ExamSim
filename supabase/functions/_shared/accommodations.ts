export type StudentAccommodationPolicy = {
  font_scale_percent: 100 | 125 | 150;
  dyslexia_font: boolean;
  contrast_mode: "standard" | "high";
  rest_break_allowed: boolean;
  rest_break_max_minutes: number;
  calculator_policy: "none" | "basic" | "scientific" | "graphing";
  formula_booklet_allowed: boolean;
  allowed_materials: string[];
};

const DEFAULT_POLICY: StudentAccommodationPolicy = {
  font_scale_percent: 100,
  dyslexia_font: false,
  contrast_mode: "standard",
  rest_break_allowed: false,
  rest_break_max_minutes: 0,
  calculator_policy: "none",
  formula_booklet_allowed: false,
  allowed_materials: [],
};

export async function loadAttemptAccommodationPolicy(
  admin: any,
  attempt: { roster_entry_id?: string | null; exam_session_id?: string | null },
): Promise<StudentAccommodationPolicy> {
  const [rosterResult, sessionResult] = await Promise.all([
    attempt.roster_entry_id
      ? admin.from("student_roster_entries").select("accommodations_json").eq("id", attempt.roster_entry_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    attempt.exam_session_id
      ? admin.from("exam_sessions").select("settings_json").eq("id", attempt.exam_session_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (rosterResult.error) throw rosterResult.error;
  if (sessionResult.error) throw sessionResult.error;
  const sessionSettings = record(sessionResult.data?.settings_json);
  const sessionPolicy = record(sessionSettings.accommodations);
  const rosterPolicy = record(rosterResult.data?.accommodations_json);
  return normalizePolicy({ ...sessionPolicy, ...rosterPolicy });
}

function normalizePolicy(source: Record<string, unknown>): StudentAccommodationPolicy {
  const fontScale = [100, 125, 150].includes(Number(source.font_scale_percent))
    ? Number(source.font_scale_percent) as 100 | 125 | 150
    : DEFAULT_POLICY.font_scale_percent;
  const calculator = ["none", "basic", "scientific", "graphing"].includes(String(source.calculator_policy))
    ? String(source.calculator_policy) as StudentAccommodationPolicy["calculator_policy"]
    : DEFAULT_POLICY.calculator_policy;
  return {
    font_scale_percent: fontScale,
    dyslexia_font: source.dyslexia_font === true,
    contrast_mode: source.contrast_mode === "high" ? "high" : "standard",
    rest_break_allowed: source.rest_break_allowed === true,
    rest_break_max_minutes: clampInteger(source.rest_break_max_minutes, 0, 240),
    calculator_policy: calculator,
    formula_booklet_allowed: source.formula_booklet_allowed === true,
    allowed_materials: Array.isArray(source.allowed_materials)
      ? source.allowed_materials.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [],
  };
}

function clampInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

