import { Router } from 'express';

import { createEvolutionInstance, getEvolutionInstanceStatus, refreshEvolutionInstanceQr } from '../../services/evolutionInstanceService';
import { resolveTenantSlug } from './whatsappHelpers';

export const instanceRoutes = Router();

instanceRoutes.get('/instance/status', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await getEvolutionInstanceStatus(tenantSlug, { includeQr: false });
    return res.json({ status });
  } catch (error) {
    console.error('Erro ao consultar status da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao consultar status da instancia.' });
  }
});

instanceRoutes.post('/instance/create', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const companyName = typeof req.body?.companyName === 'string' ? req.body.companyName.trim() : '';
    const status = await createEvolutionInstance(tenantSlug, companyName || undefined);
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.status(201).json({ status });
  } catch (error) {
    console.error('Erro ao criar instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao criar instancia na Evolution.' });
  }
});

instanceRoutes.get('/instance/qr', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await getEvolutionInstanceStatus(tenantSlug, { includeQr: true });
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.json({ status });
  } catch (error) {
    console.error('Erro ao gerar QR da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao gerar QR da instancia.' });
  }
});

instanceRoutes.post('/instance/refresh-qr', async (req, res) => {
  try {
    const tenantSlug = resolveTenantSlug(req.query.tenant);
    const status = await refreshEvolutionInstanceQr(tenantSlug);
    if (!status.configured) {
      return res.status(400).json({ error: status.lastError || 'Configuracao da Evolution incompleta.', status });
    }

    return res.json({ status });
  } catch (error) {
    console.error('Erro ao atualizar QR da instancia Evolution:', error);
    return res.status(500).json({ error: 'Erro ao atualizar QR da instancia.' });
  }
});
