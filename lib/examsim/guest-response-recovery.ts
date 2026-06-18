export const GUEST_RESPONSE_BACKUP_VERSION = 1;
export const GUEST_RESPONSE_BACKUP_PREFIX = "examvault_guest_response_backup";

export type GuestResponseBackup = {
  version: typeof GUEST_RESPONSE_BACKUP_VERSION;
  attemptId: string;
  tokenBinding: string;
  answers: Record<string, string>;
  savedAt: string;
};

export function buildGuestResponseBackupKey(attemptId: string, tokenBinding: string) {
  return `${GUEST_RESPONSE_BACKUP_PREFIX}:${attemptId}:${tokenBinding}`;
}

export function createGuestResponseBackup(input: {
  attemptId: string;
  tokenBinding: string;
  answers: Record<string, string>;
  now?: Date;
}): GuestResponseBackup {
  return {
    version: GUEST_RESPONSE_BACKUP_VERSION,
    attemptId: input.attemptId,
    tokenBinding: input.tokenBinding,
    answers: sanitizeGuestResponseAnswers(input.answers),
    savedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function parseGuestResponseBackup(raw: string | null, attemptId: string, tokenBinding: string): GuestResponseBackup | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GuestResponseBackup>;
    if (parsed.version !== GUEST_RESPONSE_BACKUP_VERSION) return null;
    if (parsed.attemptId !== attemptId || parsed.tokenBinding !== tokenBinding) return null;
    if (!parsed.answers || typeof parsed.answers !== "object") return null;
    return {
      version: GUEST_RESPONSE_BACKUP_VERSION,
      attemptId,
      tokenBinding,
      answers: sanitizeGuestResponseAnswers(parsed.answers as Record<string, unknown>),
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function shouldRestoreGuestResponseBackup(backup: GuestResponseBackup | null, currentAnswers: Record<string, string>) {
  if (!backup) return false;
  if (!Object.values(backup.answers).some((answer) => answer.trim().length > 0)) return false;
  return !Object.values(currentAnswers).some((answer) => answer.trim().length > 0);
}

function sanitizeGuestResponseAnswers(answers: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(answers)
      .filter(([key]) => key.trim().length > 0)
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 250_000) : ""]),
  );
}
