import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

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
    res.status(401).json({ error: 'Não autorizado para área administrativa.' });
    return;
  }

  next();
};
