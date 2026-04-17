import { Router } from 'express';

import { workbenchStore, type WorkbenchEntity } from '../db/workbenchStore';
import { bookingStore } from '../db/bookingStore';
import { deleteCalendarEventById } from '../services/calendarService';
import type { BookingRecord } from '../types';
import { getTodayDate, parseId } from '../utils/helpers';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TENANT_SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}$/;
const BASIC_PLATFORM_SETTINGS_KEYS = [
  'companyName',
  'companyPhone',
  'timezone',
  'cancelPolicy',
  'whatsappOpenTime',
  'whatsappCloseTime',
  'masterPasswordUpdatedAt',
] as const;

const MASTER_PASSWORD_MIN_LENGTH = 4;

const pickBasicPlatformSettings = (value: Record<string, unknown>): Record<string, unknown> => {
  const picked: Record<string, unknown> = {};
  for (const key of BASIC_PLATFORM_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      picked[key] = value[key];
    }
  }

  return picked;
};

const isWorkbenchUnavailable = (error: unknown): boolean =>
  error instanceof Error && error.message.toLowerCase().includes('modulo workbench indisponivel');

const deleteCalendarEventsForBookings = async (bookings: BookingRecord[]): Promise<number> => {
  let removed = 0;

  for (const booking of bookings) {
    if (!booking.googleEventId) {
      continue;
    }

    try {
      await deleteCalendarEventById(booking.googleEventId);
      removed += 1;
    } catch (error) {
      console.error('Falha ao remover evento do Google Calendar durante limpeza em massa:', error);
    }
  }

  return removed;
};

const parseTenantFromQuery = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (!TENANT_SLUG_REGEX.test(normalized)) {
    return null;
  }

  return normalized;
};

const getPayloadString = (payload: Record<string, unknown>, key: string): string =>
  typeof payload[key] === 'string' ? payload[key].trim() : '';

const getRequestFallbackMasterPassword = (req: { headers: Record<string, unknown> }): string => {
  const adminHeader = req.headers['x-admin-key'];
  const adminKey = Array.isArray(adminHeader) ? adminHeader[0] : adminHeader;
  return process.env.ADMIN_MASTER_PASSWORD || process.env.WHATSAPP_MASTER_PASSWORD || (typeof adminKey === 'string' ? adminKey.trim() : '');
};

const resolveMasterPassword = (settings: Record<string, unknown>, fallbackPassword: string): string => {
  const configured = typeof settings.masterPassword === 'string' ? settings.masterPassword.trim() : '';
  return configured || fallbackPassword;
};

const ENTITIES: WorkbenchEntity[] = [
  'availability',
  'clients',
  'leads',
  'services',
  'professionals',
  'finance',
  'reviews',
  'tasks',
  'automations',
];

const isValidEntity = (value: string): value is WorkbenchEntity => ENTITIES.includes(value as WorkbenchEntity);

export const adminWorkbenchRoutes = Router();

adminWorkbenchRoutes.get('/overview', async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'range';
  const startDate = typeof req.query.date === 'string' && DATE_REGEX.test(req.query.date) ? req.query.date : getTodayDate();
  const endDate = typeof req.query.endDate === 'string' && DATE_REGEX.test(req.query.endDate) ? req.query.endDate : null;

  try {
    const overview = await workbenchStore.getOverview(
      scope === 'all'
        ? undefined
        : {
            startDate,
            endDate: endDate || startDate,
          },
    );
    return res.json(overview);
  } catch (error) {
    console.error('Erro ao carregar overview do workbench:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar overview.' });
  }
});

adminWorkbenchRoutes.get('/settings', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined);
    return res.json({ settings: pickBasicPlatformSettings(settings) });
  } catch (error) {
    console.error('Erro ao carregar settings:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao carregar configurações.' });
  }
});

adminWorkbenchRoutes.post('/settings/master-password/verify', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para validar senha master.' });
  }

  const password = getPayloadString(payload, 'password');
  if (!password) {
    return res.status(400).json({ error: 'Informe a senha master.' });
  }

  try {
    const settings = await workbenchStore.getSettings(tenant || undefined);
    return res.json({ ok: password === resolveMasterPassword(settings, getRequestFallbackMasterPassword(req)) });
  } catch (error) {
    console.error('Erro ao validar senha master:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao validar senha master.' });
  }
});

adminWorkbenchRoutes.put('/settings/master-password', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload invalido para redefinir senha master.' });
  }

  const currentPassword = getPayloadString(payload, 'currentPassword');
  const newPassword = getPayloadString(payload, 'newPassword');

  if (!currentPassword) {
    return res.status(400).json({ error: 'Informe a senha master atual.' });
  }

  if (newPassword.length < MASTER_PASSWORD_MIN_LENGTH) {
    return res.status(400).json({ error: `A nova senha master deve ter pelo menos ${MASTER_PASSWORD_MIN_LENGTH} caracteres.` });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    if (currentPassword !== resolveMasterPassword(current, getRequestFallbackMasterPassword(req))) {
      return res.status(403).json({ error: 'Senha master atual invalida.' });
    }

    const saved = await workbenchStore.saveSettings(
      {
        ...current,
        masterPassword: newPassword,
        masterPasswordUpdatedAt: new Date().toISOString(),
      },
      tenant || undefined,
    );

    return res.json({ ok: true, settings: pickBasicPlatformSettings(saved) });
  } catch (error) {
    console.error('Erro ao redefinir senha master:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao redefinir senha master.' });
  }
});

adminWorkbenchRoutes.put('/settings', async (req, res) => {
  const tenant = parseTenantFromQuery(req.query.tenant);

  if (typeof req.query.tenant === 'string' && !tenant) {
    return res.status(400).json({ error: 'Slug de tenant invalido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para configurações.' });
  }

  try {
    const current = await workbenchStore.getSettings(tenant || undefined);
    const patch = pickBasicPlatformSettings(payload as Record<string, unknown>);
    const merged: Record<string, unknown> = {
      ...current,
      ...patch,
    };

    const saved = await workbenchStore.saveSettings(merged, tenant || undefined);
    return res.json({ settings: pickBasicPlatformSettings(saved) });
  } catch (error) {
    console.error('Erro ao salvar settings:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao salvar configurações.' });
  }
});

adminWorkbenchRoutes.get('/tenants', async (_req, res) => {
  try {
    const tenants = await workbenchStore.listTenants();
    return res.json({ tenants });
  } catch (error) {
    console.error('Erro ao listar tenants:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao listar empresas.' });
  }
});

adminWorkbenchRoutes.post('/tenants', async (req, res) => {
  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para tenant.' });
  }

  const slug = typeof payload.slug === 'string' ? payload.slug : '';
  const name = typeof payload.name === 'string' ? payload.name : '';
  const active = typeof payload.active === 'boolean' ? payload.active : true;

  if (!TENANT_SLUG_REGEX.test(slug.trim().toLowerCase())) {
    return res.status(400).json({ error: 'Slug inválido. Use letras minúsculas, números e hífen.' });
  }

  if (!name.trim()) {
    return res.status(400).json({ error: 'Nome da empresa é obrigatório.' });
  }

  try {
    const tenant = await workbenchStore.createTenant({ slug, name, active });
    return res.status(201).json({ tenant });
  } catch (error) {
    console.error('Erro ao criar tenant:', error);
    const message = error instanceof Error ? error.message : 'Erro ao criar empresa.';
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: message });
    }
    return res.status(400).json({ error: message });
  }
});

adminWorkbenchRoutes.patch('/tenants/:slug', async (req, res) => {
  const slug = req.params.slug?.trim().toLowerCase();
  if (!slug || !TENANT_SLUG_REGEX.test(slug)) {
    return res.status(400).json({ error: 'Slug inválido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido para tenant.' });
  }

  try {
    const tenant = await workbenchStore.updateTenant(slug, {
      name: typeof payload.name === 'string' ? payload.name : undefined,
      active: typeof payload.active === 'boolean' ? payload.active : undefined,
    });

    if (!tenant) {
      return res.status(404).json({ error: 'Empresa não encontrada.' });
    }

    return res.json({ tenant });
  } catch (error) {
    console.error('Erro ao atualizar tenant:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao atualizar empresa.' });
  }
});

adminWorkbenchRoutes.post('/leads/:id/convert', async (req, res) => {
  const leadId = parseId(req.params.id);
  if (!leadId) {
    return res.status(400).json({ error: 'ID de lead inválido.' });
  }

  try {
    const result = await workbenchStore.convertLeadToClient(leadId);
    return res.json({
      message: 'Lead convertido em cliente com sucesso.',
      lead: result.lead,
      client: result.client,
    });
  } catch (error) {
    console.error('Erro ao converter lead:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao converter lead em cliente.' });
  }
});

adminWorkbenchRoutes.post('/finance/:id/pay', async (req, res) => {
  const financeId = parseId(req.params.id);
  if (!financeId) {
    return res.status(400).json({ error: 'ID financeiro inválido.' });
  }

  const paymentMethod = typeof req.body?.payment_method === 'string' ? req.body.payment_method.trim() : undefined;

  try {
    const entry = await workbenchStore.markFinancePaid(financeId, paymentMethod);
    return res.json({ message: 'Pagamento marcado como pago.', entry });
  } catch (error) {
    console.error('Erro ao marcar pagamento:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao marcar pagamento.' });
  }
});

adminWorkbenchRoutes.get('/clients/by-phone/:phone', async (req, res) => {
  const phone = req.params.phone?.trim();
  if (!phone) {
    return res.status(400).json({ error: 'Telefone é obrigatório.' });
  }

  try {
    const client = await workbenchStore.findClientByPhone(phone);
    return res.json({ client });
  } catch (error) {
    console.error('Erro ao buscar cliente por telefone:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao buscar cliente.' });
  }
});

adminWorkbenchRoutes.post('/finance/reset', async (req, res) => {
  const date = typeof req.body?.date === 'string' && DATE_REGEX.test(req.body.date) ? req.body.date : undefined;
  try {
    const deleted = await workbenchStore.resetFinance(date);
    let bookingsReset = 0;
    if (!date) {
      bookingsReset = await bookingStore.resetAllPaymentStatuses();
    }
    return res.json({
      message: `${deleted} entradas financeiras removidas.`,
      deleted,
      bookingsReset,
    });
  } catch (error) {
    console.error('Erro ao zerar financeiro:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao zerar financeiro.' });
  }
});

adminWorkbenchRoutes.post('/history/reset', async (_req, res) => {
  try {
    if (!workbenchStore.isEnabled()) {
      return res.status(503).json({ error: 'Modulo workbench indisponivel para limpar o historico total.' });
    }

    const currentBookings = await bookingStore.listAll();
    const history = await workbenchStore.resetAnalyticsHistory();
    const bookingsDeleted = await bookingStore.resetAll();
    const calendarEventsRemoved = await deleteCalendarEventsForBookings(currentBookings);

    return res.json({
      message: 'Historico total removido com sucesso.',
      deleted: {
        bookings: bookingsDeleted,
        finance: history.finance,
        leads: history.leads,
        reviews: history.reviews,
        tasks: history.tasks,
        calendarEvents: calendarEventsRemoved,
      },
    });
  } catch (error) {
    console.error('Erro ao limpar historico total (workbench):', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao limpar historico total.' });
  }
});

adminWorkbenchRoutes.post('/finance/confirm-booking-payment', async (req, res) => {
  const bookingId = typeof req.body?.booking_id === 'number' ? req.body.booking_id : null;
  const paymentMethod = typeof req.body?.payment_method === 'string' ? req.body.payment_method.trim() : null;

  if (!bookingId || !paymentMethod) {
    return res.status(400).json({ error: 'booking_id e payment_method são obrigatórios.' });
  }

  const validMethods = ['pix', 'dinheiro', 'debito', 'credito'];
  if (!validMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: `Método inválido. Use: ${validMethods.join(', ')}` });
  }

  try {
    const entry = await workbenchStore.confirmBookingPayment(bookingId, paymentMethod);
    return res.json({ message: 'Pagamento confirmado com sucesso.', entry });
  } catch (error) {
    console.error('Erro ao confirmar pagamento do agendamento:', error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    const message = error instanceof Error ? error.message : 'Erro ao confirmar pagamento.';
    return res.status(500).json({ error: message });
  }
});

adminWorkbenchRoutes.get('/:entity', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  try {
    const rows = await workbenchStore.list(entity);
    return res.json({ rows });
  } catch (error) {
    console.error(`Erro ao listar entidade ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao listar registros.' });
  }
});

adminWorkbenchRoutes.post('/:entity', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.create(entity, payload);
    return res.status(201).json({ row });
  } catch (error) {
    console.error(`Erro ao criar registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao criar registro.' });
  }
});

adminWorkbenchRoutes.patch('/:entity/:id', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  const payload = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : null;
  if (!payload) {
    return res.status(400).json({ error: 'Payload inválido.' });
  }

  try {
    const row = await workbenchStore.update(entity, id, payload);
    return res.json({ row });
  } catch (error) {
    console.error(`Erro ao atualizar registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao atualizar registro.' });
  }
});

adminWorkbenchRoutes.delete('/:entity/:id', async (req, res) => {
  const { entity } = req.params;
  if (!isValidEntity(entity)) {
    return res.status(404).json({ error: 'Entidade não suportada.' });
  }

  const id = parseId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  try {
    await workbenchStore.remove(entity, id);
    return res.json({ message: 'Registro removido com sucesso.' });
  } catch (error) {
    console.error(`Erro ao remover registro ${entity}:`, error);
    if (isWorkbenchUnavailable(error)) {
      return res.status(503).json({ error: (error as Error).message });
    }
    return res.status(500).json({ error: 'Erro ao remover registro.' });
  }
});
