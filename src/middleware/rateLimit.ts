import { Request, Response, NextFunction } from 'express';
import { RateLimitConfig } from '../types';
import { AuthenticatedRequest } from './auth';

interface BucketEntry {
  tokens: number;
  lastRefill: number;
}

/**
 * Token-bucket rate limiter — O(1) per request, no Redis dependency.
 * Each key gets `maxRequests` tokens, refilled fully every `windowMs`.
 */
export class RateLimiter {
  private buckets = new Map<string, BucketEntry>();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Periodically evict stale buckets
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const key = this.resolveKey(req);
      const allowed = this.consume(key);

      // Always set headers so clients can adapt
      const bucket = this.buckets.get(key)!;
      res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.floor(bucket.tokens));
      res.setHeader(
        'X-RateLimit-Reset',
        Math.ceil((bucket.lastRefill + this.config.windowMs) / 1000)
      );

      if (!allowed) {
        res.status(429).json({
          error: 'Too Many Requests',
          retryAfterMs: this.config.windowMs,
        });
        return;
      }
      next();
    };
  }

  private consume(key: string): boolean {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      // New key — full bucket, minus one token for this request
      this.buckets.set(key, { tokens: this.config.maxRequests - 1, lastRefill: now });
      return true;
    }

    // Refill proportionally to elapsed time
    const elapsed = now - entry.lastRefill;
    if (elapsed >= this.config.windowMs) {
      entry.tokens = this.config.maxRequests;
      entry.lastRefill = now;
    } else {
      // Fractional refill
      const refill = (elapsed / this.config.windowMs) * this.config.maxRequests;
      entry.tokens = Math.min(this.config.maxRequests, entry.tokens + refill);
      entry.lastRefill = now;
    }

    if (entry.tokens < 1) {
      return false;
    }

    entry.tokens -= 1;
    return true;
  }

  private resolveKey(req: Request): string {
    const authReq = req as AuthenticatedRequest;
    switch (this.config.keyBy) {
      case 'user':
        return `u:${authReq.ctx?.userId || this.getIP(req)}`;
      case 'api-key':
        return `k:${req.headers['x-api-key'] || this.getIP(req)}`;
      case 'ip':
      default:
        return `ip:${this.getIP(req)}`;
    }
  }

  private getIP(req: Request): string {
    return (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.config.windowMs * 2;
    for (const [key, entry] of this.buckets) {
      if (entry.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
  }
}
