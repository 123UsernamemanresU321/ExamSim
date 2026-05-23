export type ServerTimeDriftStatus = {
  status: "synced" | "minor_drift" | "suspicious_drift" | "unable_to_verify";
  driftSeconds: number | null;
  message: string;
};

export function calculateServerTimeDriftStatus(serverNowUtc: string | null, localNowUtc: string | null): ServerTimeDriftStatus {
  if (!serverNowUtc || !localNowUtc) {
    return { status: "unable_to_verify", driftSeconds: null, message: "Unable to verify official server time." };
  }
  const driftSeconds = Math.round((Date.parse(localNowUtc) - Date.parse(serverNowUtc)) / 1000);
  const abs = Math.abs(driftSeconds);
  if (abs <= 10) return { status: "synced", driftSeconds, message: "Your device clock is close to the official server time." };
  if (abs <= 120) return { status: "minor_drift", driftSeconds, message: "Your device clock differs slightly. Exam timing still uses server time." };
  return { status: "suspicious_drift", driftSeconds, message: "Your device clock differs from the official server time. Exam timing is based on server time." };
}
