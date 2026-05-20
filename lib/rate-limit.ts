type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type InMemoryRateLimitOptions = {
  storeKey: string;
  windowMs: number;
  maxRequests: number;
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __pinpointRateLimitStores?: Map<string, Map<string, RateLimitBucket>>;
};

function getStore(storeKey: string): Map<string, RateLimitBucket> {
  const stores =
    globalForRateLimit.__pinpointRateLimitStores
    ?? (globalForRateLimit.__pinpointRateLimitStores = new Map<string, Map<string, RateLimitBucket>>());

  const store = stores.get(storeKey);
  if (store) return store;

  const nextStore = new Map<string, RateLimitBucket>();
  stores.set(storeKey, nextStore);
  return nextStore;
}

export function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRequestRateLimitKey(req: Request): string {
  const cfConnectingIp = req.headers.get("cf-connecting-ip")?.trim();
  const forwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = req.headers.get("x-real-ip")?.trim();
  const userAgent = req.headers.get("user-agent")?.trim() || "unknown";
  return `${cfConnectingIp || forwardedFor || realIp || "unknown"}::${userAgent}`;
}

export function createInMemoryRateLimiter(options: InMemoryRateLimitOptions) {
  const store = getStore(options.storeKey);

  return function getRateLimitRetryAfter(req: Request): number | null {
    const now = Date.now();

    for (const [key, bucket] of store.entries()) {
      if (bucket.resetAt <= now) {
        store.delete(key);
      }
    }

    const rateLimitKey = getRequestRateLimitKey(req);
    const currentBucket = store.get(rateLimitKey);
    if (!currentBucket || currentBucket.resetAt <= now) {
      store.set(rateLimitKey, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return null;
    }

    if (currentBucket.count >= options.maxRequests) {
      return Math.max(1, Math.ceil((currentBucket.resetAt - now) / 1000));
    }

    currentBucket.count += 1;
    store.set(rateLimitKey, currentBucket);
    return null;
  };
}
