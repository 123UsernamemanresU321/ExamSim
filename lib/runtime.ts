export function isDemoModeEnabled() {
  return process.env.NEXT_PUBLIC_STATIC_EXPORT === "1" || (process.env.NODE_ENV !== "production" && process.env.EXAM_VAULT_DEMO_MODE === "1");
}
