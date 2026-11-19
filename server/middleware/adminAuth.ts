import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

type FailedAttempt = {
  count: number;
  blockedUntil: number;
  updatedAt: number;
};

const failedAttempts = new Map<string, FailedAttempt>();
const MAX_FAILURES = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos de bloqueio
const MAX_TRACKED_IPS = 1000;

const pruneFailedAttempts = (now: number): void => {
  for (const [ip, entry] of failedAttempts.entries()) {
    const blockExpired = entry.blockedUntil > 0 && entry.blockedUntil <= now;
    const staleFailure = entry.blockedUntil === 0 && now - entry.updatedAt > BLOCK_DURATION_MS;
    if (blockExpired || staleFailure) {
      failedAttempts.delete(ip);
    }
  }

  while (failedAttempts.size >= MAX_TRACKED_IPS) {
    const oldestKey = failedAttempts.keys().next().value;
    if (!oldestKey) {
      break;
    }
    failedAttempts.delete(oldestKey);
  }
};

const getClientIp = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const getAdminKeyFromRequest = (req: Request): string | null => {
  const headerKey = req.header('x-admin-key');
  if (headerKey) {
    return headerKey;
  }

  const authHeader = req.header('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.replace('Bearer ', '').trim();
};

export const adminAuth = (req: Request, res: Response, next: NextFunction): void => {
  const clientIp = getClientIp(req);
  const now = Date.now();
  const attempt = failedAttempts.get(clientIp);

  const expectedAdminKey = process.env.ADMIN_API_KEY;
  const validAdminKeys = (expectedAdminKey || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (validAdminKeys.length === 0) {
    res.status(500).json({ error: 'ADMIN_API_KEY não configurada no servidor.' });
    return;
  }

  const receivedAdminKey = getAdminKeyFromRequest(req);
  const isValidAdminKey = receivedAdminKey
    ? validAdminKeys.some((validKey) => {
        const expected = Buffer.from(validKey);
        const received = Buffer.from(receivedAdminKey);
        return expected.length === received.length && crypto.timingSafeEqual(expected, received);
      })
    : false;

  if (!isValidAdminKey) {
    if (attempt && attempt.blockedUntil > now) {
      const remainingSeconds = Math.ceil((attempt.blockedUntil - now) / 1000);
      res.status(429).json({
        error: `Muitas tentativas inválidas de autenticação. Tente novamente em ${remainingSeconds} segundos.`,
      });
      return;
    }

    const isExpiredBlock = attempt && attempt.blockedUntil > 0 && attempt.blockedUntil <= now;
    const current: FailedAttempt = isExpiredBlock
      ? { count: 0, blockedUntil: 0, updatedAt: now }
      : (attempt ? { ...attempt, updatedAt: now } : { count: 0, blockedUntil: 0, updatedAt: now });
    current.count += 1;
    if (current.count >= MAX_FAILURES) {
      current.blockedUntil = now + BLOCK_DURATION_MS;
    }
    pruneFailedAttempts(now);
    failedAttempts.set(clientIp, current);

    res.status(401).json({ error: 'Não autorizado para área administrativa.' });
    return;
  }

  if (attempt) {
    failedAttempts.delete(clientIp);
  }

  next();
};
