export function isDemoModeEnabled() {
  return process.env.NODE_ENV !== "production" && process.env.EXAM_VAULT_DEMO_MODE === "1";
}
