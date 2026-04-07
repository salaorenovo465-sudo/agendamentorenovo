import type { NextFunction, Request, Response } from 'express';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix?: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const SWEEP_INTERVAL_MS = 30_000;

const sweepExpiredBuckets = (): void => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
};

const enforceMaxBuckets = (): void => {
  if (buckets.size <= MAX_BUCKETS) {
    return;
  }

  const sorted = Array.from(buckets.entries()).sort(([, a], [, b]) => a.resetAt - b.resetAt);
  const toDelete = sorted.slice(0, buckets.size - MAX_BUCKETS);
  for (const [key] of toDelete) {
    buckets.delete(key);
  }

  if (buckets.size > MAX_BUCKETS) {
    const excess = buckets.size - MAX_BUCKETS;
    const keysToDelete = Array.from(buckets.keys()).slice(0, excess);
    for (const key of keysToDelete) {
      buckets.delete(key);
    }
  }
};

const sweepAndEnforce = (): void => {
  sweepExpiredBuckets();
  enforceMaxBuckets();
};

const sweepTimer = setInterval(sweepAndEnforce, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

import { toPositiveInt } from '../utils/helpers';

const getRequesterId = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown';
  }

  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return forwardedFor[0];
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
};

export const createRateLimit = (options: RateLimitOptions) => {
  const windowMs = toPositiveInt(options.windowMs, 60_000);
  const max = toPositiveInt(options.max, 20);
  const message = options.message || 'Muitas requisicoes. Tente novamente em alguns instantes.';
  const keyPrefix = options.keyPrefix?.trim() || 'default';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const now = Date.now();
    const requesterId = getRequesterId(req);
    const routeKey = `${req.method}:${req.baseUrl || ''}${req.path}`;
    const bucketKey = `${keyPrefix}:${requesterId}:${routeKey}`;

    const existingBucket = buckets.get(bucketKey);
    let bucket: Bucket;

    if (!existingBucket || existingBucket.resetAt <= now) {
      bucket = {
        count: 1,
        resetAt: now + windowMs,
      };
      buckets.set(bucketKey, bucket);
    } else {
      existingBucket.count += 1;
      bucket = existingBucket;
    }

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        error: message,
        retryAfterSeconds,
      });
      return;
    }

    next();
  };
};
