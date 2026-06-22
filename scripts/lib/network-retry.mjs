export async function withTransientNetworkRetry(operation, { attempts = 5, delayMs = 500 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === attempts) throw error;
      await sleep(delayMs * attempt);
    }
  }
  throw lastError;
}

export function retryingFetch(input, init) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const request = () => {
    const timeoutSignal = AbortSignal.timeout(20_000);
    const requestSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = requestSignal ? AbortSignal.any([requestSignal, timeoutSignal]) : timeoutSignal;
    return fetch(input, { ...init, signal });
  };
  return ["GET", "HEAD", "OPTIONS"].includes(method) ? withTransientNetworkRetry(request) : request();
}

function isTransientNetworkError(error) {
  const message = [error?.message, error?.cause?.message, error?.cause?.code]
    .filter(Boolean)
    .join(" ");
  return /fetch failed|connect timeout|timed out|timeout|network|socket|econn|und_err/i.test(message);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}
