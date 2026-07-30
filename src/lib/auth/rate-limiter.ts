interface RateLimitEntry {
  attempts: number;
  firstAttempt: number; // timestamp ms
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry) return false;

    // Window expired — reset
    if (now - entry.firstAttempt > this.windowMs) {
      this.store.delete(key);
      return false;
    }

    return entry.attempts >= this.maxAttempts;
  }

  recordAttempt(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.firstAttempt > this.windowMs) {
      this.store.set(key, { attempts: 1, firstAttempt: now });
    } else {
      entry.attempts++;
    }
  }

  reset(key: string): void {
    this.store.delete(key);
  }
}

// Login: 5 attempts per 15 minutes
export const loginRateLimiter = new RateLimiter(5, 15 * 60 * 1000);

// Password reset: 3 requests per hour
export const passwordResetRateLimiter = new RateLimiter(3, 60 * 60 * 1000);
