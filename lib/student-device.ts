import { createHash } from "node:crypto";

export type StudentDeviceRecord = {
  student_profile_id: string;
  device_id_hash: string;
  user_agent_hash: string | null;
  browser_label: string | null;
  last_check_status: "passed" | "warning" | "failed";
  last_seen_at: string;
};

export function buildStudentDeviceRecord(input: {
  studentProfileId: string;
  checks: Record<string, unknown>;
  status: "passed" | "warning" | "failed";
  nowUtc: string;
}): StudentDeviceRecord {
  const userAgent = String(input.checks.user_agent ?? "");
  const deviceIdentity = String(input.checks.device_id ?? (userAgent || "device"));
  return {
    student_profile_id: input.studentProfileId,
    device_id_hash: hashStable(deviceIdentity),
    user_agent_hash: userAgent ? hashStable(userAgent) : null,
    browser_label: browserLabelFromUserAgent(userAgent),
    last_check_status: input.status,
    last_seen_at: input.nowUtc,
  };
}

export function browserLabelFromUserAgent(userAgent: string): string | null {
  const ua = userAgent.toLowerCase();
  if (!ua) return null;
  if (ua.includes("edg/")) return "Microsoft Edge";
  if (ua.includes("firefox/")) return "Firefox";
  if (ua.includes("chrome/") && !ua.includes("chromium")) return "Chrome";
  if (ua.includes("safari/") && ua.includes("version/") && !ua.includes("chrome/")) return "Safari";
  return "Unknown browser";
}

export function hashStable(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
