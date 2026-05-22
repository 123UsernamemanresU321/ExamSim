export const SUBJECT_PRESETS = [
  "Maths AA HL",
  "Maths AA SL",
  "Maths AI HL",
  "Maths AI SL",
  "Chemistry",
  "Physics",
  "Biology",
  "Computer Science",
  "Olympiad",
  "School Test",
] as const;

export type SubjectPreset = (typeof SUBJECT_PRESETS)[number];

export function normalizeSubject(value: FormDataEntryValue | string | null | undefined) {
  const subject = String(value ?? "").trim();
  return subject.length ? subject : null;
}

export function splitTags(value: FormDataEntryValue | string | null | undefined) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, tags) => tags.findIndex((candidate) => candidate.toLowerCase() === tag.toLowerCase()) === index);
}
