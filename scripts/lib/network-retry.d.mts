export function withTransientNetworkRetry<T>(
  operation: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number },
): Promise<T>;

export function retryingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
