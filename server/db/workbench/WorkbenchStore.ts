import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import '../../loadEnv';
import { bookingStore } from '../bookingStore';
import { normalizeWhatsappPhoneWithPlus } from '../../utils/phone';

import type { WorkbenchEntity, OverviewData, TenantRecord } from './workbenchTypes';
import { ENTITY_CONFIG } from './workbenchTypes';
import {
  TENANT_REGISTRY_KEY,
  LEGACY_SETTINGS_KEY,
  DEFAULT_TENANT_SLUG,
  DEFAULT_TENANT_NAME,
  TENANT_SETTINGS_PREFIX,
  normalizeTenantSlug,
  normalizeTenantName,
  toIsoNow,
  mapTenantRegistry,
  toTenantRegistryValue,
  settingsKeyForTenant,
} from './workbenchHelpers';

class WorkbenchStore {
  private supabase: SupabaseClient | null;

  constructor() {
    const supabaseProjectRef = process.env.SUPABASE_PROJECT_REF;
    const supabaseUrl = process.env.SUPABASE_URL || (supabaseProjectRef ? `https://${supabaseProjectRef}.supabase.co` : undefined);
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      this.supabase = null;
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }

  isEnabled(): boolean {
    return Boolean(this.supabase);
  }

  private getSupabase(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Modulo workbench indisponivel: configure SUPABASE_URL/SUPABASE_PROJECT_REF e SUPABASE_SERVICE_ROLE_KEY.');
    }

    return this.supabase;
  }

  private async deleteAllFromTable(table: string): Promise<number> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase.from(table).delete().gte('id', 0).select('id');
    if (error) {
      throw error;
    }
    return (data || []).length;
  }

  private sanitizePayload(entity: WorkbenchEntity, payload: Record<string, unknown>, includeDefaults: boolean): Record<string, unknown> {
    const config = ENTITY_CONFIG[entity];
    const sanitized: Record<string, unknown> = {};

    for (const key of config.fields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        sanitized[key] = payload[key];
      }
    }

    if (includeDefaults && config.defaults) {
      for (const [key, value] of Object.entries(config.defaults)) {
        if (sanitized[key] === undefined) {
          sanitized[key] = value;
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'price')) {
      sanitized.price = Number(sanitized.price || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'amount')) {
      sanitized.amount = Number(sanitized.amount || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'base_commission')) {
      sanitized.base_commission = Number(sanitized.base_commission || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'score')) {
      sanitized.score = Math.max(1, Math.min(5, Number(sanitized.score || 1)));
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'duration_min')) {
      sanitized.duration_min = Number(sanitized.duration_min || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'limit_per_day')) {
      sanitized.limit_per_day = Number(sanitized.limit_per_day || 0);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'active')) {
      sanitized.active = Boolean(sanitized.active);
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'phone')) {
      const normalizedPhone = normalizeWhatsappPhoneWithPlus(String(sanitized.phone || ''));
      sanitized.phone = normalizedPhone || String(sanitized.phone || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(sanitized, 'commission_profile') && !Array.isArray(sanitized.commission_profile)) {
      sanitized.commission_profile = [];
    }

    return sanitized;
  }

  async list(entity: WorkbenchEntity): Promise<Record<string, unknown>[]> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];

    const { data, error } = await supabase
      .from(config.table)
      .select('*')
      .order(config.orderBy, { ascending: config.orderAscending ?? false });

    if (error) {
      throw error;
    }

    return (data || []) as Record<string, unknown>[];
  }

  async create(entity: WorkbenchEntity, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const sanitized = this.sanitizePayload(entity, payload, true);

    const { data, error } = await supabase.from(config.table).insert(sanitized).select('*').single();
    if (error) {
      throw error;
    }

    return data as Record<string, unknown>;
  }

  async update(entity: WorkbenchEntity, id: number, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const sanitized = this.sanitizePayload(entity, payload, false);

    if (Object.keys(sanitized).length === 0) {
      return null;
    }

    sanitized.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from(config.table).update(sanitized).eq('id', id).select('*').maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Record<string, unknown> | null) || null;
  }

  async remove(entity: WorkbenchEntity, id: number): Promise<void> {
    const supabase = this.getSupabase();
    const config = ENTITY_CONFIG[entity];
    const { error } = await supabase.from(config.table).delete().eq('id', id);

    if (error) {
      throw error;
    }
  }

  async convertLeadToClient(leadId: number): Promise<{ lead: Record<string, unknown>; client: Record<string, unknown> }> {
    const supabase = this.getSupabase();
    const { data: lead, error: leadError } = await supabase.from('leads').select('*').eq('id', leadId).maybeSingle();

    if (leadError) {
      throw leadError;
    }

    if (!lead) {
      throw new Error('Lead não encontrado.');
    }

    const clientPayload = {
      name: lead.name,
      phone: lead.phone,
      notes: lead.notes,
      status: 'ativo',
      tags: 'convertido-do-lead',
    };

    const { data: client, error: clientError } = await supabase.from('clients').insert(clientPayload).select('*').single();
    if (clientError) {
      throw clientError;
    }

    const { data: updatedLead, error: updateLeadError } = await supabase
      .from('leads')
      .update({ stage: 'convertido', updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select('*')
      .single();

    if (updateLeadError) {
      throw updateLeadError;
    }

    return {
      lead: updatedLead as Record<string, unknown>,
      client: client as Record<string, unknown>,
    };
  }

  async markFinancePaid(financeId: number, paymentMethod?: string): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const updates: Record<string, unknown> = {
      status: 'pago',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (paymentMethod) {
      updates.payment_method = paymentMethod;
    }

    const { data, error } = await supabase
      .from('financial_entries')
      .update(updates)
      .eq('id', financeId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Record<string, unknown> | null) || null;
  }

  async findClientByPhone(phone: string): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;

    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .like('phone', `%${digits.slice(-9)}%`)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Record<string, unknown> | null) || null;
  }

  async confirmBookingPayment(bookingId: number, paymentMethod: string): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();

    const { data: existing, error: findError } = await supabase
      .from('financial_entries')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (findError) throw findError;

    const now = new Date().toISOString();

    if (existing) {
      const { data, error } = await supabase
        .from('financial_entries')
        .update({
          status: 'pago',
          payment_method: paymentMethod,
          paid_at: now,
          updated_at: now,
        })
        .eq('id', (existing as Record<string, unknown>).id)
        .select('*')
        .single();

      if (error) throw error;
      return data as Record<string, unknown>;
    }

    throw new Error('Entrada financeira não encontrada para este agendamento. Confirme o agendamento primeiro.');
  }

  private async fetchAppSettingByKey(key: string): Promise<Record<string, unknown> | null> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase.from('app_settings').select('*').eq('key', key).maybeSingle();

    if (error) {
      throw error;
    }

    return (data as Record<string, unknown> | null) || null;
  }

  private async upsertAppSettingByKey(key: string, value: Record<string, unknown>): Promise<Record<string, unknown>> {
    const supabase = this.getSupabase();
    const payload = {
      key,
      value_json: value,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('app_settings').upsert(payload, { onConflict: 'key' }).select('*').single();

    if (error) {
      throw error;
    }

    return (data as Record<string, unknown>) || {};
  }

  private async ensureTenantBootstrap(): Promise<TenantRecord[]> {
    const registryRow = await this.fetchAppSettingByKey(TENANT_REGISTRY_KEY);
    const parsedRegistry = mapTenantRegistry(registryRow?.value_json);
    if (parsedRegistry.length > 0) {
      return parsedRegistry;
    }

    const legacySettingsRow = await this.fetchAppSettingByKey(LEGACY_SETTINGS_KEY);
    const legacySettings = (legacySettingsRow?.value_json as Record<string, unknown>) || {};
    const defaultSlug = normalizeTenantSlug(DEFAULT_TENANT_SLUG) || 'renovo';
    const defaultName = normalizeTenantName(
      (legacySettings.companyName as string | undefined) ||
        (legacySettings.salonName as string | undefined) ||
        DEFAULT_TENANT_NAME,
    );
    const now = toIsoNow();

    const defaultTenant: TenantRecord = {
      slug: defaultSlug,
      name: defaultName,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue([defaultTenant]) as Record<string, unknown>);

    const tenantSettingsKey = settingsKeyForTenant(defaultSlug);
    const tenantSettingsRow = await this.fetchAppSettingByKey(tenantSettingsKey);
    if (!tenantSettingsRow && Object.keys(legacySettings).length > 0) {
      await this.upsertAppSettingByKey(tenantSettingsKey, legacySettings);
    }

    return [defaultTenant];
  }

  async listTenants(): Promise<TenantRecord[]> {
    const tenants = await this.ensureTenantBootstrap();
    return [...tenants].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  async createTenant(input: { slug: string; name: string; active?: boolean }): Promise<TenantRecord> {
    const slug = normalizeTenantSlug(input.slug);
    if (!slug) {
      throw new Error('Slug do tenant invalido. Use letras minusculas, numeros e hifen.');
    }

    const tenants = await this.ensureTenantBootstrap();
    if (tenants.some((tenant) => tenant.slug === slug)) {
      throw new Error('Ja existe uma empresa com este slug.');
    }

    const now = toIsoNow();
    const created: TenantRecord = {
      slug,
      name: normalizeTenantName(input.name),
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    };

    const nextTenants = [...tenants, created];
    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue(nextTenants) as Record<string, unknown>);
    await this.upsertAppSettingByKey(settingsKeyForTenant(slug), {});
    return created;
  }

  async updateTenant(slug: string, patch: { name?: string; active?: boolean }): Promise<TenantRecord | null> {
    const normalizedSlug = normalizeTenantSlug(slug);
    if (!normalizedSlug) {
      return null;
    }

    const tenants = await this.ensureTenantBootstrap();
    const index = tenants.findIndex((tenant) => tenant.slug === normalizedSlug);
    if (index === -1) {
      return null;
    }

    const current = tenants[index];
    const updated: TenantRecord = {
      ...current,
      name: patch.name ? normalizeTenantName(patch.name) : current.name,
      active: typeof patch.active === 'boolean' ? patch.active : current.active,
      updatedAt: toIsoNow(),
    };

    const nextTenants = [...tenants];
    nextTenants[index] = updated;
    await this.upsertAppSettingByKey(TENANT_REGISTRY_KEY, toTenantRegistryValue(nextTenants) as Record<string, unknown>);
    return updated;
  }

  async getSettings(tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const key = settingsKeyForTenant(tenantSlug || null);
    const row = await this.fetchAppSettingByKey(key);

    if (row?.value_json) {
      return row.value_json as Record<string, unknown>;
    }

    if (key !== LEGACY_SETTINGS_KEY) {
      const legacyRow = await this.fetchAppSettingByKey(LEGACY_SETTINGS_KEY);
      if (legacyRow?.value_json) {
        return legacyRow.value_json as Record<string, unknown>;
      }
    }

    return {};
  }

  async saveSettings(value: Record<string, unknown>, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const key = settingsKeyForTenant(tenantSlug || null);
    const data = await this.upsertAppSettingByKey(key, value);
    return (data?.value_json as Record<string, unknown>) || {};
  }

  private buildScopedSettingKey(scope: string, tenantSlug?: string): string {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    if (!normalizedScope) {
      throw new Error('Escopo de app_settings invalido.');
    }

    const normalizedTenant = normalizeTenantSlug(tenantSlug || null);
    return normalizedTenant
      ? `${TENANT_SETTINGS_PREFIX}${normalizedTenant}:${normalizedScope}`
      : `${LEGACY_SETTINGS_KEY}:${normalizedScope}`;
  }

  async getScopedSetting(scope: string, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const row = await this.fetchAppSettingByKey(this.buildScopedSettingKey(scope, tenantSlug));
    return (row?.value_json as Record<string, unknown>) || {};
  }

  async saveScopedSetting(scope: string, value: Record<string, unknown>, tenantSlug?: string): Promise<Record<string, unknown>> {
    await this.ensureTenantBootstrap();

    const data = await this.upsertAppSettingByKey(this.buildScopedSettingKey(scope, tenantSlug), value);
    return (data?.value_json as Record<string, unknown>) || {};
  }

  async resetFinance(date?: string): Promise<number> {
    const supabase = this.getSupabase();
    let query = supabase.from('financial_entries').delete();
    if (date) {
      query = query.eq('due_date', date);
    } else {
      query = query.gte('id', 0);
    }
    const { data, error } = await query.select('id');
    if (error) throw error;
    return (data || []).length;
  }

  async resetBookingLinkedFinance(): Promise<number> {
    const supabase = this.getSupabase();
    const { data, error } = await supabase
      .from('financial_entries')
      .delete()
      .not('booking_id', 'is', null)
      .select('id');

    if (error) {
      throw error;
    }

    return (data || []).length;
  }

  async resetAnalyticsHistory(): Promise<{
    finance: number;
    leads: number;
    reviews: number;
    tasks: number;
  }> {
    const [finance, leads, reviews, tasks] = await Promise.all([
      this.deleteAllFromTable('financial_entries'),
      this.deleteAllFromTable('leads'),
      this.deleteAllFromTable('reviews'),
      this.deleteAllFromTable('tasks'),
    ]);

    return {
      finance,
      leads,
      reviews,
      tasks,
    };
  }

  async getOverview(filters?: { startDate?: string; endDate?: string }): Promise<OverviewData> {
    const supabase = this.getSupabase();
    const startDate = filters?.startDate?.trim() || null;
    const endDate = filters?.endDate?.trim() || null;
    const hasDateFilter = Boolean(startDate);
    const bookings = !hasDateFilter
      ? await bookingStore.listAll()
      : endDate && endDate !== startDate
        ? await bookingStore.listByDateRange(startDate, endDate)
        : await bookingStore.listByDate(startDate);

    const bookingStats = {
      total: bookings.length,
      pending: bookings.filter((booking) => booking.status === 'pending').length,
      confirmed: bookings.filter((booking) => booking.status === 'confirmed').length,
      rejected: bookings.filter((booking) => booking.status === 'rejected').length,
    };

    const { data: leads, error: leadsError } = await supabase.from('leads').select('stage');
    if (leadsError) {
      throw leadsError;
    }

    const leadsByStage: Record<string, number> = {};
    (leads || []).forEach((lead) => {
      const stage = String((lead as { stage?: string }).stage || 'novo');
      leadsByStage[stage] = (leadsByStage[stage] || 0) + 1;
    });

    const { data: tasks, error: tasksError } = await supabase.from('tasks').select('status');
    if (tasksError) {
      throw tasksError;
    }

    const pendingTasks = (tasks || []).filter((task) => String((task as { status?: string }).status || '') !== 'concluida').length;

    let financeQuery = supabase
      .from('financial_entries')
      .select('amount,status,due_date,paid_at');

    if (startDate) {
      financeQuery = financeQuery.gte('due_date', startDate);
      financeQuery = financeQuery.lte('due_date', endDate || startDate);
    }

    const { data: financeRows, error: financeError } = await financeQuery;

    if (financeError) {
      throw financeError;
    }

    const expected = (financeRows || []).reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0);
    const received = (financeRows || [])
      .filter((item) => String((item as { status?: string }).status || '') === 'pago')
      .reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0);

    return {
      date: startDate || 'all',
      bookingStats,
      leads: {
        total: (leads || []).length,
        byStage: leadsByStage,
      },
      tasks: {
        total: (tasks || []).length,
        pending: pendingTasks,
        done: (tasks || []).length - pendingTasks,
      },
      finance: {
        expected,
        received,
        pending: expected - received,
      },
    };
  }

  async getActiveAvailabilityRules(weekday?: number): Promise<Record<string, unknown>[]> {
    try {
      const supabase = this.getSupabase();
      let query = supabase
        .from('availability_rules')
        .select('*')
        .eq('active', true);

      if (weekday !== undefined) {
        query = query.eq('weekday', weekday);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    } catch {
      return [];
    }
  }

  async getServiceDuration(serviceName: string): Promise<number | null> {
    try {
      const supabase = this.getSupabase();
      const { data, error } = await supabase
        .from('services_catalog')
        .select('duration_min')
        .ilike('name', serviceName)
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      const duration = Number(data.duration_min);
      return Number.isFinite(duration) && duration > 0 ? duration : null;
    } catch {
      return null;
    }
  }
}

export const workbenchStore = new WorkbenchStore();
