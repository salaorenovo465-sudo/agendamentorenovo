import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';

import {
  addDaysIso,
  aggregateFinanceSeries,
  aggregateFinanceSeriesWithScale,
  computeFinanceSummary,
  diffDaysIso,
  filterFinanceEntriesForTable,
  formatDateBrFromIso,
  getDaysInMonth,
  getMondayWeekStartIso,
  getMonthBounds,
  isLeapYear,
  isValidIsoDate,
  resolveFinanceReferenceDate,
  resolveRecommendedFinanceGroupBy,
  summarizeBookingsByDate,
} from '../server/db/workbench/dashboardHelpers';
import { checkSupabaseReadiness, SUPABASE_SCHEMA_TABLES } from '../server/db/supabaseReadiness';
import { isTransientNetworkError, withTransientRetry } from '../server/db/retryHelper';
import type { DashboardFinanceEntryRow } from '../server/db/workbench/workbenchTypes';
import { adminAuth } from '../server/middleware/adminAuth';
import { adminRoutes } from '../server/routes/adminRoutes';
import { adminWorkbenchRoutes } from '../server/routes/adminWorkbenchRoutes';
import { workbenchStore } from '../server/db/workbenchStore';
import { bookingStore } from '../server/db/bookingStore';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatMonthYearPT,
  getDaysInMonthLocal,
  getMonthRangeFromDate,
  getPreviousMonthRangeFromDate,
  isLeapYearLocal,
  isValidIsoDateLocal,
  shiftIsoDays,
  shiftYearMonth,
} from '../src/admin/AdminUtils';
import {
  MASKED_CURRENCY_LABEL,
  maskCurrencyValue,
  maskMoneyTextValue,
} from '../src/admin/MoneyPrivacyContext';

const makeEntry = (overrides: Partial<DashboardFinanceEntryRow>): DashboardFinanceEntryRow => ({
  id: 1,
  bookingId: null,
  clientName: 'Cliente Teste',
  serviceName: 'Serviço Teste',
  amount: 100,
  paymentMethod: 'pix',
  status: 'pendente',
  dueDate: '2026-11-10',
  paidAt: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  ...overrides,
});

const withServer = async (fn: (baseUrl: string) => Promise<void>) => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminAuth, adminRoutes);
  app.use('/api/admin/workbench', adminAuth, adminWorkbenchRoutes);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
};

test('Calendario e datas locais: anos bissextos, virada de ano e datas invalidas sem shift UTC', () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2028), true);
  assert.equal(isLeapYear(2000), true);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2026), false);

  assert.equal(getDaysInMonth(2024, 2), 29);
  assert.equal(getDaysInMonth(2026, 2), 28);
  assert.equal(getDaysInMonthLocal(2024, 2), 29);
  assert.equal(getDaysInMonthLocal(2026, 2), 28);
  assert.equal(isLeapYearLocal(2024), true);

  assert.equal(isValidIsoDate('2024-02-29'), true);
  assert.equal(isValidIsoDate('2026-02-29'), false);
  assert.equal(isValidIsoDate('2026-04-31'), false);
  assert.equal(isValidIsoDate('2026-13-01'), false);
  assert.equal(isValidIsoDateLocal('2024-02-29'), true);
  assert.equal(isValidIsoDateLocal('2026-02-29'), false);

  assert.deepEqual(getMonthBounds('2024-02'), {
    month: '2024-02',
    year: 2024,
    monthNumber: 2,
    startDate: '2024-02-01',
    endDate: '2024-02-29',
    daysInMonth: 29,
  });

  // Virada de ano no frontend
  assert.deepEqual(shiftYearMonth(2025, 12, 1), { year: 2026, month: 1, monthKey: '2026-01' });
  assert.deepEqual(shiftYearMonth(2026, 1, -1), { year: 2025, month: 12, monthKey: '2025-12' });
  assert.deepEqual(getPreviousMonthRangeFromDate('2026-01-15'), {
    startDate: '2025-12-01',
    endDate: '2025-12-31',
  });
  assert.deepEqual(getMonthRangeFromDate('2024-02-15'), {
    year: 2024,
    month: 2,
    monthKey: '2024-02',
    startDate: '2024-02-01',
    endDate: '2024-02-29',
  });

  assert.equal(addDaysIso('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftIsoDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDaysIso('2026-11-01', '2026-11-10'), 9);
  assert.equal(getMondayWeekStartIso('2026-11-15'), '2026-11-09'); // Domingo -> segunda-feira anterior
  assert.equal(formatDateBrFromIso('2026-11-05'), '05/11/2026');
  assert.equal(formatDateBR('2026-11-05'), '05/11/2026');
  assert.equal(formatMonthYearPT(2026, 11), 'Novembro de 2026');
});

test('Financeiro: formatacao BRL e calculos com zerados, negativos, 0/1/muitos pontos sem truncamento silencioso', () => {
  const formatted = formatCurrencyBRL(1234.56).replace(/\u00a0/g, ' ');
  assert.equal(formatted, 'R$ 1.234,56');
  assert.equal(formatCurrencyBRL(0).replace(/\u00a0/g, ' '), 'R$ 0,00');

  const emptySummary = computeFinanceSummary([]);
  assert.deepEqual(emptySummary, {
    expected: 0,
    received: 0,
    pending: 0,
    totalCount: 0,
    paidCount: 0,
    pendingCount: 0,
    zeroAmountCount: 0,
    negativeCount: 0,
  });

  const sampleEntries: DashboardFinanceEntryRow[] = [
    makeEntry({ id: 1, amount: 150.5, status: 'pago', dueDate: '2026-10-01' }),
    makeEntry({ id: 2, amount: 99.5, status: 'pendente', dueDate: '2026-10-01' }),
    makeEntry({ id: 3, amount: 0, status: 'pendente', dueDate: '2026-10-15' }),
    makeEntry({ id: 4, amount: -20, status: 'pago', dueDate: '2026-11-02' }),
  ];

  const summary = computeFinanceSummary(sampleEntries);
  assert.equal(summary.expected, 230);
  assert.equal(summary.received, 130.5);
  assert.equal(summary.pending, 99.5);
  assert.equal(summary.totalCount, 4);
  assert.equal(summary.paidCount, 2);
  assert.equal(summary.pendingCount, 2);
  assert.equal(summary.zeroAmountCount, 1);
  assert.equal(summary.negativeCount, 1);

  // 0 pontos
  assert.deepEqual(aggregateFinanceSeries([], 'day'), []);

  // 1 ponto
  const singlePoint = aggregateFinanceSeries([sampleEntries[0]], 'day');
  assert.equal(singlePoint.length, 1);
  assert.equal(singlePoint[0].expected, 150.5);
  assert.equal(singlePoint[0].received, 150.5);

  // Consistencia entre soma da serie mensal e KPIs totais
  const monthly = aggregateFinanceSeries(sampleEntries, 'month');
  assert.equal(monthly.length, 2);
  const sumExpected = monthly.reduce((acc, p) => acc + p.expected, 0);
  const sumReceived = monthly.reduce((acc, p) => acc + p.received, 0);
  const sumPending = monthly.reduce((acc, p) => acc + p.pending, 0);
  assert.equal(sumExpected, summary.expected);
  assert.equal(sumReceived, summary.received);
  assert.equal(sumPending, summary.pending);

  // Muitos dias (>45 pontos diarios distintos) auto-escala sem perder dinheiro
  const manyDaysEntries: DashboardFinanceEntryRow[] = Array.from({ length: 65 }, (_, idx) => {
    const dueDate = addDaysIso('2026-01-01', idx * 2);
    return makeEntry({
      id: idx + 1,
      amount: 100,
      status: idx % 2 === 0 ? 'pago' : 'pendente',
      dueDate,
    });
  });

  const scaled = aggregateFinanceSeriesWithScale(manyDaysEntries, 'day', '2026-01-01', '2026-05-15', 45);
  assert.equal(scaled.groupBy, 'week');
  assert.equal(scaled.autoAdjusted, true);
  assert.equal(
    scaled.series.reduce((sum, p) => sum + p.expected, 0),
    6500,
  );
  assert.equal(resolveRecommendedFinanceGroupBy([], 'auto', '2026-01-01', '2026-12-31'), 'month');
  assert.equal(resolveFinanceReferenceDate({ dueDate: null, createdAt: '2026-11-05T12:00:00Z' }), '2026-11-05');
});

test('Calendario mensal: sumarizacao de todos os status sem corte arbitrario', () => {
  const sampleBookings = [
    ...Array.from({ length: 25 }, () => ({ date: '2026-11-10', status: 'completed' as const })),
    { date: '2026-11-10', status: 'pending' as const },
    { date: '2026-11-10', status: 'confirmed' as const },
    { date: '2026-11-11', status: 'rejected' as const },
  ];

  const counts = summarizeBookingsByDate(sampleBookings);
  assert.equal(counts['2026-11-10'].total, 27);
  assert.equal(counts['2026-11-10'].completed, 25);
  assert.equal(counts['2026-11-10'].pending, 1);
  assert.equal(counts['2026-11-10'].confirmed, 1);
  assert.equal(counts['2026-11-11'].rejected, 1);
});

test('Seguranca e validacao de endpoints da Dashboard (sem tocar em dados reais)', async () => {
  const previousKey = process.env.ADMIN_API_KEY;
  const previousMaster = process.env.ADMIN_MASTER_PASSWORD;
  process.env.ADMIN_API_KEY = 'test-admin-key';
  process.env.ADMIN_MASTER_PASSWORD = 'TestMaster@123';

  // Stubs isolados para testar validacao HTTP, auth, tenant isolation e fluxo destrutivo sem alterar banco real
  const origListTenants = workbenchStore.listTenants.bind(workbenchStore);
  const origGetOverview = workbenchStore.getOverview.bind(workbenchStore);
  const origGetDashboardFinance = workbenchStore.getDashboardFinance.bind(workbenchStore);
  const origResetFinance = workbenchStore.resetFinance.bind(workbenchStore);
  const origGetSettings = workbenchStore.getSettings.bind(workbenchStore);
  const origListCalendar = bookingStore.listCalendarBookings.bind(bookingStore);
  const origResetPayments = bookingStore.resetAllPaymentStatuses.bind(bookingStore);

  let lastOverviewTenant: string | undefined;
  let lastFinanceTenant: string | null | undefined;
  let lastCalendarTenant: string | null | undefined;
  let lastResetCall: { date?: string; tenant?: string } | null = null;
  let resetPaymentTenant: string | null | undefined;

  (workbenchStore as unknown as Record<string, unknown>).listTenants = async () => [
    { slug: 'renovo', name: 'Estudio Renovo', active: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ];
  (workbenchStore as unknown as Record<string, unknown>).getOverview = async (filters?: { tenantSlug?: string }) => {
    lastOverviewTenant = filters?.tenantSlug;
    return {
      date: 'all',
      tenantSlug: filters?.tenantSlug || 'renovo',
      bookingStats: { total: 10, pending: 2, confirmed: 1, completed: 6, rejected: 1 },
      leads: { total: 4, byStage: { novo: 4 }, filteredByPeriod: false },
      tasks: { total: 0, pending: 0, done: 0, filteredByPeriod: false },
      finance: { expected: 500, received: 200, pending: 300, totalCount: 2, paidCount: 1, pendingCount: 1, temporalBasis: 'due_date' },
    };
  };
  (workbenchStore as unknown as Record<string, unknown>).getDashboardFinance = async (filters?: { tenantSlug?: string | null }) => {
    lastFinanceTenant = filters?.tenantSlug;
    return {
      tenantSlug: filters?.tenantSlug || 'renovo',
      scope: 'all',
      startDate: null,
      endDate: null,
      temporalBasis: 'due_date',
      groupBy: 'month',
      autoAdjustedGroupBy: false,
      summary: computeFinanceSummary([]),
      series: [],
      entries: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasMore: false },
    };
  };
  (workbenchStore as unknown as Record<string, unknown>).getSettings = async () => ({});
  (workbenchStore as unknown as Record<string, unknown>).resetFinance = async (date?: string, tenantSlug?: string) => {
    lastResetCall = { date, tenant: tenantSlug };
    return 2;
  };
  (bookingStore as unknown as Record<string, unknown>).listCalendarBookings = async (input: { startDate: string; endDate: string; tenantSlug?: string | null }) => {
    lastCalendarTenant = input.tenantSlug;
    return { startDate: input.startDate, endDate: input.endDate, tenantSlug: input.tenantSlug || null, total: 0, countsByDate: {}, bookings: [] };
  };
  (bookingStore as unknown as Record<string, unknown>).resetAllPaymentStatuses = async (tenantSlug?: string | null) => {
    resetPaymentTenant = tenantSlug;
    return 0;
  };

  try {
    await withServer(async (baseUrl) => {
      // 1. Bloqueia sem autenticacao
      const unauth = await fetch(`${baseUrl}/api/admin/workbench/overview?scope=all`);
      assert.equal(unauth.status, 401);

      const unauthCal = await fetch(`${baseUrl}/api/admin/bookings/calendar?month=2026-11`);
      assert.equal(unauthCal.status, 401);

      const headers = { 'x-admin-key': 'test-admin-key', 'content-type': 'application/json' };

      // 2. Bloqueia tenant nao cadastrado (isolamento)
      const forbiddenTenant = await fetch(`${baseUrl}/api/admin/workbench/overview?scope=all&tenant=outro-salao`, { headers });
      assert.equal(forbiddenTenant.status, 403);

      const forbiddenCal = await fetch(`${baseUrl}/api/admin/bookings/calendar?month=2026-11&tenant=outro-salao`, { headers });
      assert.equal(forbiddenCal.status, 403);

      // 3. Rejeita parametros invalidos com 400
      const badDates = await fetch(`${baseUrl}/api/admin/workbench/dashboard/finance?scope=range&date=2026-11-20&endDate=2026-11-10&tenant=renovo`, { headers });
      assert.equal(badDates.status, 400);

      const badLeap = await fetch(`${baseUrl}/api/admin/workbench/overview?scope=range&date=2026-02-29&tenant=renovo`, { headers });
      assert.equal(badLeap.status, 400);

      const badGroup = await fetch(`${baseUrl}/api/admin/workbench/dashboard/finance?scope=all&groupBy=hour&tenant=renovo`, { headers });
      assert.equal(badGroup.status, 400);

      const badMonth = await fetch(`${baseUrl}/api/admin/bookings/calendar?month=2026-13&tenant=renovo`, { headers });
      assert.equal(badMonth.status, 400);

      const tooWideCal = await fetch(`${baseUrl}/api/admin/bookings/calendar?startDate=2026-01-01&endDate=2026-06-01&tenant=renovo`, { headers });
      assert.equal(tooWideCal.status, 400);

      // 4. Fluxo valido preserva tenantSlug
      const okOverview = await fetch(`${baseUrl}/api/admin/workbench/overview?scope=all&tenant=renovo`, { headers });
      assert.equal(okOverview.status, 200);
      assert.equal(lastOverviewTenant, 'renovo');

      const okFinance = await fetch(`${baseUrl}/api/admin/workbench/dashboard/finance?scope=all&tenant=renovo`, { headers });
      assert.equal(okFinance.status, 200);
      assert.equal(lastFinanceTenant, 'renovo');

      const okCal = await fetch(`${baseUrl}/api/admin/bookings/calendar?month=2024-02&tenant=renovo`, { headers });
      assert.equal(okCal.status, 200);
      assert.equal(lastCalendarTenant, 'renovo');

      // 5. Protecao destrutiva Zerar financeiro
      const noPassReset = await fetch(`${baseUrl}/api/admin/workbench/finance/reset?tenant=renovo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      assert.equal(noPassReset.status, 400);

      const wrongPassReset = await fetch(`${baseUrl}/api/admin/workbench/finance/reset?tenant=renovo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ masterPassword: 'wrong-password' }),
      });
      assert.equal(wrongPassReset.status, 403);
      assert.equal(lastResetCall, null);

      const okDateReset = await fetch(`${baseUrl}/api/admin/workbench/finance/reset?tenant=renovo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ masterPassword: 'TestMaster@123', date: '2026-11-10' }),
      });
      assert.equal(okDateReset.status, 200);
      assert.deepEqual(lastResetCall, { date: '2026-11-10', tenant: 'renovo' });

      const okAllReset = await fetch(`${baseUrl}/api/admin/workbench/finance/reset?tenant=renovo`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ masterPassword: 'TestMaster@123' }),
      });
      assert.equal(okAllReset.status, 200);
      assert.deepEqual(lastResetCall, { date: undefined, tenant: 'renovo' });
      assert.equal(resetPaymentTenant, 'renovo');
    });
  } finally {
    process.env.ADMIN_API_KEY = previousKey;
    process.env.ADMIN_MASTER_PASSWORD = previousMaster;
    (workbenchStore as unknown as Record<string, unknown>).listTenants = origListTenants;
    (workbenchStore as unknown as Record<string, unknown>).getOverview = origGetOverview;
    (workbenchStore as unknown as Record<string, unknown>).getDashboardFinance = origGetDashboardFinance;
    (workbenchStore as unknown as Record<string, unknown>).resetFinance = origResetFinance;
    (workbenchStore as unknown as Record<string, unknown>).getSettings = origGetSettings;
    (bookingStore as unknown as Record<string, unknown>).listCalendarBookings = origListCalendar;
    (bookingStore as unknown as Record<string, unknown>).resetAllPaymentStatuses = origResetPayments;
  }
});

test('Privacidade financeira: mascara valores monetarios em Real quando oculto', () => {
  assert.equal(maskCurrencyValue(1234.56, false).replace(/\u00a0/g, ' '), 'R$ 1.234,56');
  assert.equal(maskCurrencyValue(1234.56, true), MASKED_CURRENCY_LABEL);
  assert.equal(maskCurrencyValue(0, true), MASKED_CURRENCY_LABEL);
  assert.equal(maskMoneyTextValue('Total estimado R$ 99,98 + itens sob consulta', true), 'Total estimado R$ ••••• + itens sob consulta');
  assert.equal(maskMoneyTextValue('a partir de R$ 49,99', true), 'a partir de R$ •••••');
  assert.equal(maskMoneyTextValue('Sob consulta', true), 'Sob consulta');
  assert.equal(maskMoneyTextValue('R$ 80,00', false), 'R$ 80,00');
});

test('Tabela financeira: filtro por status e busca textual preservam consistencia', () => {
  const rows: DashboardFinanceEntryRow[] = [
    makeEntry({ id: 10, bookingId: 301, clientName: 'Maria Silva', serviceName: 'Hidratação', status: 'pago', paymentMethod: 'pix', dueDate: '2026-11-05' }),
    makeEntry({ id: 11, bookingId: 302, clientName: 'Joana Souza', serviceName: 'Corte Feminino', status: 'pendente', paymentMethod: 'dinheiro', dueDate: '2026-11-06' }),
    makeEntry({ id: 12, bookingId: 303, clientName: 'Carla Mendes', serviceName: 'Escova', status: 'pago', paymentMethod: 'credito', dueDate: '2026-11-07' }),
  ];

  assert.equal(filterFinanceEntriesForTable(rows, { entryStatus: 'all', search: '' }).length, 3);
  assert.deepEqual(
    filterFinanceEntriesForTable(rows, { entryStatus: 'pago', search: '' }).map((r) => r.id),
    [10, 12],
  );
  assert.deepEqual(
    filterFinanceEntriesForTable(rows, { entryStatus: 'pendente', search: '' }).map((r) => r.id),
    [11],
  );
  assert.deepEqual(
    filterFinanceEntriesForTable(rows, { entryStatus: 'all', search: '#302' }).map((r) => r.id),
    [11],
  );
  assert.deepEqual(
    filterFinanceEntriesForTable(rows, { entryStatus: 'pago', search: 'hidratação' }).map((r) => r.id),
    [10],
  );
  assert.deepEqual(
    filterFinanceEntriesForTable(rows, { entryStatus: 'pago', search: 'dinheiro' }),
    [],
  );
});

test('Resiliencia Supabase: retry transitorio, deteccao de colunas e rota /supabase/status', async () => {
  assert.equal(isTransientNetworkError({ message: 'TypeError: fetch failed', details: 'ECONNRESET' }), true);
  assert.equal(isTransientNetworkError({ code: '42703', message: 'column does not exist' }), false);

  let transientAttempts = 0;
  const recovered = await withTransientRetry(async () => {
    transientAttempts += 1;
    if (transientAttempts < 2) {
      throw new Error('fetch failed ECONNRESET');
    }
    return 'ok';
  });
  assert.equal(recovered, 'ok');
  assert.equal(transientAttempts, 2);

  let permanentAttempts = 0;
  await assert.rejects(
    withTransientRetry(async () => {
      permanentAttempts += 1;
      throw { code: '42703', message: 'column bookings.payment_status does not exist' };
    }),
  );
  assert.equal(permanentAttempts, 1);

  const createFakeSupabase = (missingBookingPaymentColumn: boolean) => {
    const buildQuery = (table: string, cols?: string, isHead = false) => {
      const response = (() => {
        if (table === 'bookings' && cols && cols.includes('payment_status') && missingBookingPaymentColumn) {
          return { data: null, error: { code: '42703', message: 'column bookings.payment_status does not exist' } };
        }
        if (table === 'app_settings' && !isHead) {
          return {
            data: { value_json: { tenants: [{ slug: 'renovo', active: true }] } },
            error: null,
          };
        }
        return { data: [], count: 1, error: null };
      })();

      const chain: Record<string, unknown> = {
        eq: () => chain,
        limit: () => Promise.resolve(response),
        maybeSingle: () => Promise.resolve(response),
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
          Promise.resolve(response).then(resolve, reject),
      };
      return chain;
    };

    return {
      from: (table: string) => ({
        select: (cols: string, opts?: { head?: boolean }) => buildQuery(table, cols, Boolean(opts?.head)),
      }),
    };
  };

  const pendingReport = await checkSupabaseReadiness(
    createFakeSupabase(true) as unknown as Parameters<typeof checkSupabaseReadiness>[0],
    'renovo',
  );
  assert.equal(pendingReport.connected, true);
  assert.equal(pendingReport.tablesReady, SUPABASE_SCHEMA_TABLES.length);
  assert.equal(pendingReport.tenantRegistered, true);
  assert.equal(pendingReport.readyForProduction, false);
  assert.equal(pendingReport.missingColumns.some((c) => c.table === 'bookings' && c.column === 'payment_status'), true);

  const readyReport = await checkSupabaseReadiness(
    createFakeSupabase(false) as unknown as Parameters<typeof checkSupabaseReadiness>[0],
    'renovo',
  );
  assert.equal(readyReport.missingColumns.length, 0);

  // Rota /supabase/status exige auth e valida entryStatus em /dashboard/finance
  const previousKey = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = 'test-admin-key';
  const origListTenants = workbenchStore.listTenants.bind(workbenchStore);
  const origCheckHealth = workbenchStore.checkSupabaseHealth.bind(workbenchStore);
  (workbenchStore as unknown as Record<string, unknown>).listTenants = async () => [
    { slug: 'renovo', name: 'Estúdio Renovo', active: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  ];
  (workbenchStore as unknown as Record<string, unknown>).checkSupabaseHealth = async () => pendingReport;

  try {
    await withServer(async (baseUrl) => {
      const unauth = await fetch(`${baseUrl}/api/admin/workbench/supabase/status`);
      assert.equal(unauth.status, 401);

      const headers = { 'x-admin-key': 'test-admin-key' };
      const okStatus = await fetch(`${baseUrl}/api/admin/workbench/supabase/status?tenant=renovo`, { headers });
      assert.equal(okStatus.status, 200);
      const body = (await okStatus.json()) as { tablesReady: number; missingColumns: unknown[] };
      assert.equal(body.tablesReady, SUPABASE_SCHEMA_TABLES.length);

      const badEntryStatus = await fetch(
        `${baseUrl}/api/admin/workbench/dashboard/finance?scope=all&entryStatus=cancelado&tenant=renovo`,
        { headers },
      );
      assert.equal(badEntryStatus.status, 400);
    });
  } finally {
    process.env.ADMIN_API_KEY = previousKey;
    (workbenchStore as unknown as Record<string, unknown>).listTenants = origListTenants;
    (workbenchStore as unknown as Record<string, unknown>).checkSupabaseHealth = origCheckHealth;
  }
});
