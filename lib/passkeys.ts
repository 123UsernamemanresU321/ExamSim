type PasskeyApiCandidate = {
  passkey?: {
    register?: (...args: unknown[]) => Promise<unknown>;
    authenticate?: (...args: unknown[]) => Promise<unknown>;
    list?: (...args: unknown[]) => Promise<unknown>;
    delete?: (...args: unknown[]) => Promise<unknown>;
  };
  registerPasskey?: (...args: unknown[]) => Promise<unknown>;
  signInWithPasskey?: (...args: unknown[]) => Promise<unknown>;
};

export type PasskeyApiStatus = {
  available: boolean;
  namespace: "auth.passkey" | "legacy" | "unavailable";
};

export function getPasskeyApiStatus(auth: unknown): PasskeyApiStatus {
  const candidate = auth as PasskeyApiCandidate;
  if (candidate.passkey?.register || candidate.passkey?.authenticate) {
    return { available: true, namespace: "auth.passkey" };
  }
  if (candidate.registerPasskey || candidate.signInWithPasskey) {
    return { available: true, namespace: "legacy" };
  }
  return { available: false, namespace: "unavailable" };
}
