import type { Json } from "@/types/database";

export type RosterAccommodationPolicy = {
  extra_time_percent: number;
  upload_extension_minutes: number;
  rest_break_allowed: boolean;
  rest_break_max_minutes: number;
  font_scale_percent: 100 | 125 | 150;
  dyslexia_font: boolean;
  contrast_mode: "standard" | "high";
  calculator_policy: "none" | "basic" | "scientific" | "graphing";
  formula_booklet_allowed: boolean;
  allowed_materials: string[];
  access_open_at_utc: string | null;
  access_close_at_utc: string | null;
};

export type StudentAccommodationPolicy = Pick<
  RosterAccommodationPolicy,
  | "font_scale_percent"
  | "dyslexia_font"
  | "contrast_mode"
  | "rest_break_allowed"
  | "rest_break_max_minutes"
  | "calculator_policy"
  | "formula_booklet_allowed"
  | "allowed_materials"
>;

export const DEFAULT_STUDENT_ACCOMMODATIONS: StudentAccommodationPolicy = {
  font_scale_percent: 100,
  dyslexia_font: false,
  contrast_mode: "standard",
  rest_break_allowed: false,
  rest_break_max_minutes: 0,
  calculator_policy: "none",
  formula_booklet_allowed: false,
  allowed_materials: [],
};

export const DEFAULT_ROSTER_ACCOMMODATIONS: RosterAccommodationPolicy = {
  extra_time_percent: 0,
  upload_extension_minutes: 0,
  rest_break_allowed: false,
  rest_break_max_minutes: 0,
  font_scale_percent: 100,
  dyslexia_font: false,
  contrast_mode: "standard",
  calculator_policy: "none",
  formula_booklet_allowed: false,
  allowed_materials: [],
  access_open_at_utc: null,
  access_close_at_utc: null,
};

export function parseRosterAccommodationPolicy(value: Json | unknown): RosterAccommodationPolicy {
  const source = isRecord(value) ? value : {};
  const fontScale = [100, 125, 150].includes(Number(source.font_scale_percent))
    ? Number(source.font_scale_percent) as 100 | 125 | 150
    : 100;
  const calculator = ["none", "basic", "scientific", "graphing"].includes(String(source.calculator_policy))
    ? String(source.calculator_policy) as RosterAccommodationPolicy["calculator_policy"]
    : "none";
  return {
    extra_time_percent: clampInteger(source.extra_time_percent, 0, 200),
    upload_extension_minutes: clampInteger(source.upload_extension_minutes, 0, 240),
    rest_break_allowed: source.rest_break_allowed === true,
    rest_break_max_minutes: clampInteger(source.rest_break_max_minutes, 0, 240),
    font_scale_percent: fontScale,
    dyslexia_font: source.dyslexia_font === true,
    contrast_mode: source.contrast_mode === "high" ? "high" : "standard",
    calculator_policy: calculator,
    formula_booklet_allowed: source.formula_booklet_allowed === true,
    allowed_materials: Array.isArray(source.allowed_materials)
      ? source.allowed_materials.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20)
      : [],
    access_open_at_utc: readIso(source.access_open_at_utc),
    access_close_at_utc: readIso(source.access_close_at_utc),
  };
}

function readIso(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function clampInteger(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
