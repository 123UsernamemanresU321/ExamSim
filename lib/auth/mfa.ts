export type MfaFactorSummary = {
  friendly_name?: string | null;
};

export function defaultTotpFriendlyName(now = new Date()) {
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  return `Exam Vault authenticator ${stamp}`;
}

export function normalizeTotpFriendlyName(value: string, now = new Date()) {
  const trimmed = value.trim();
  return trimmed || defaultTotpFriendlyName(now);
}

export function displayTotpFriendlyName(factor: MfaFactorSummary) {
  return factor.friendly_name?.trim() || "Unnamed authenticator";
}

export function mfaEnrollmentErrorMessage(message: string) {
  if (/friendly name/i.test(message) && /already exists/i.test(message)) {
    return "An authenticator with that name already exists. Use a different name, or remove the existing authenticator after verifying MFA.";
  }
  return message;
}
