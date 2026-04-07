import { Router, type Request } from 'express';

import { workbenchStore } from '../db/workbenchStore';
import {
  forwardChatwootOutgoingToEvolution,
  forwardEvolutionInboundToChatwoot,
  resolveTenantBridgeConfig,
  validateWebhookSecret,
} from '../services/chatwootEvolutionBridge';

const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}$/;

const parseTenantSlug = (raw: string | undefined): string | null => {
  const normalized = (raw || '').trim().toLowerCase();
  if (!normalized || !TENANT_SLUG_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const getWebhookSecret = (req: Request): string | null => {
  const fromHeader = req.headers['x-webhook-secret'];
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }

  if (Array.isArray(fromHeader) && fromHeader[0]?.trim()) {
    return fromHeader[0].trim();
  }

  const fromQuery = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return fromQuery || null;
};

const isWorkbenchUnavailable = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('modulo workbench indisponivel');

export const integrationRoutes = Router();

integrationRoutes.post('/evolution/:tenantSlug/webhook', async (req, res) => {
  const tenantSlug = parseTenantSlug(req.params.tenantSlug);
  if (!tenantSlug) {
    return res.status(400).json({ error: 'Tenant inválido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenantSlug);
    const resolved = resolveTenantBridgeConfig(tenantSlug, settings, 'chatwoot');
    if (resolved.ok === false) {
      return res.status(400).json({ error: resolved.error });
    }

    const secretValidation = validateWebhookSecret(resolved.config.evolutionWebhookSecret, getWebhookSecret(req));
    if (secretValidation.ok === false) {
      return res.status(401).json({ error: secretValidation.error });
    }

    const result = await forwardEvolutionInboundToChatwoot(resolved.config, req.body);
    return res.json({ ok: true, delivered: result.delivered, reason: result.reason || null });
  } catch (error) {
    console.error(`Erro no webhook Evolution (${tenantSlug}):`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Falha ao processar webhook da Evolution.' });
  }
});

integrationRoutes.post('/chatwoot/:tenantSlug/webhook', async (req, res) => {
  const tenantSlug = parseTenantSlug(req.params.tenantSlug);
  if (!tenantSlug) {
    return res.status(400).json({ error: 'Tenant inválido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenantSlug);
    const resolved = resolveTenantBridgeConfig(tenantSlug, settings, 'evolution');
    if (resolved.ok === false) {
      return res.status(400).json({ error: resolved.error });
    }

    const secretValidation = validateWebhookSecret(resolved.config.chatwootWebhookSecret, getWebhookSecret(req));
    if (secretValidation.ok === false) {
      return res.status(401).json({ error: secretValidation.error });
    }

    const result = await forwardChatwootOutgoingToEvolution(resolved.config, req.body);
    return res.json({ ok: true, delivered: result.delivered, reason: result.reason || null });
  } catch (error) {
    console.error(`Erro no webhook Chatwoot (${tenantSlug}):`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Falha ao processar webhook do Chatwoot.' });
  }
});
