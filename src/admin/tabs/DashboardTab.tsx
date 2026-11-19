import { useCallback, useEffect, useState } from 'react';

import { toast } from '../AdminHelpers';
import { getDashboardFinanceForAdmin, getSupabaseReadinessForAdmin } from '../api';
import { type TabId, formatDateBR, getTodayDate } from '../AdminUtils';
import { useMoneyPrivacy } from '../MoneyPrivacyContext';
import {
  DashboardHeader,
  resolvePresetDates,
  type DashboardPeriodPreset,
} from '../dashboard/DashboardHeader';
import { DashboardKpiGrid } from '../dashboard/DashboardKpiGrid';
import { DashboardFinanceSection } from '../dashboard/DashboardFinanceSection';
import { DashboardCalendarAgenda } from '../dashboard/DashboardCalendarAgenda';
import { DashboardLeadsSection } from '../dashboard/DashboardLeadsSection';
import { DashboardOperationsSection } from '../dashboard/DashboardOperationsSection';
import type {
  DashboardFinanceEntryRow,
  DashboardFinanceGroupBy,
  DashboardFinanceResponse,
  DashboardFinanceStatusFilter,
  SupabaseReadinessReport,
  WorkbenchOverview,
} from '../types';
import '../dashboard/dashboard.css';

type Props = {
  adminKey: string;
  tenantSlug: string;
  tenantName: string;
  overview: WorkbenchOverview;
  overviewLoading: boolean;
  overviewHasLoadedOnce: boolean;
  overviewError: string;
  dateFilter: string;
  dateFilterEnd: string;
  dateScope: 'all' | 'range';
  stageSummary: [string, unknown][];
  onApplyDatePeriod: (next: { scope: 'all' | 'range'; startDate: string; endDate: string }) => void;
  onReloadOverview: () => void;
  onOpenAgendaForDate: (date: string) => void;
  onNavigateTab?: (tabId: TabId) => void;
  onResetFinance: (password: string, date?: string) => Promise<boolean>;
};

const escapeCsvCell = (raw: string | number | null | undefined): string => {
  const str = String(raw ?? '').replace(/\r?\n/g, ' ');
  return `"${str.replace(/"/g, '""')}"`;
};

const inferMatchingPreset = (
  scope: 'all' | 'range',
  startDate: string,
  endDate: string,
): DashboardPeriodPreset => {
  if (scope === 'all') {
    return 'all';
  }
  const normalizedEnd = endDate || startDate;
  for (const preset of ['today', 'last7', 'thisMonth', 'prevMonth'] as const) {
    const resolved = resolvePresetDates(preset);
    if (resolved.startDate === startDate && resolved.endDate === normalizedEnd) {
      return preset;
    }
  }
  return 'custom';
};

export function DashboardTab({
  adminKey,
  tenantSlug,
  tenantName,
  overview,
  overviewLoading,
  overviewHasLoadedOnce,
  overviewError,
  dateFilter,
  dateFilterEnd,
  dateScope,
  stageSummary,
  onApplyDatePeriod,
  onReloadOverview,
  onOpenAgendaForDate,
  onNavigateTab,
  onResetFinance,
}: Props) {
  const { hideMoney } = useMoneyPrivacy();
  const [activePreset, setActivePreset] = useState<DashboardPeriodPreset>(() =>
    inferMatchingPreset(dateScope, dateFilter, dateFilterEnd),
  );
  const [financeGroupBy, setFinanceGroupBy] = useState<DashboardFinanceGroupBy | 'auto'>('auto');
  const [financeEntryStatus, setFinanceEntryStatus] = useState<DashboardFinanceStatusFilter>('all');
  const [financeSearchInput, setFinanceSearchInput] = useState<string>('');
  const [financeSearch, setFinanceSearch] = useState<string>('');
  const [financePage, setFinancePage] = useState<number>(1);
  const [financeData, setFinanceData] = useState<DashboardFinanceResponse | null>(null);
  const [financeLoading, setFinanceLoading] = useState<boolean>(true);
  const [financeError, setFinanceError] = useState<string>('');
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseReadinessReport | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState<boolean>(true);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  useEffect(() => {
    const trimmed = financeSearchInput.trim();
    if (trimmed === financeSearch) return;
    const timer = window.setTimeout(() => {
      setFinanceSearch(trimmed);
      setFinancePage(1);
    }, 240);
    return () => window.clearTimeout(timer);
  }, [financeSearch, financeSearchInput]);

  useEffect(() => {
    setActivePreset(inferMatchingPreset(dateScope, dateFilter, dateFilterEnd));
    setFinancePage(1);
  }, [dateScope, dateFilter, dateFilterEnd]);

  const fetchDashboardFinance = useCallback(async (signal?: AbortSignal) => {
    if (!adminKey) return;
    setFinanceLoading(true);
    setFinanceError('');
    try {
      const response = await getDashboardFinanceForAdmin(
        adminKey,
        {
          scope: dateScope,
          startDate: dateScope === 'range' ? dateFilter : undefined,
          endDate: dateScope === 'range' ? (dateFilterEnd || dateFilter) : undefined,
          groupBy: financeGroupBy,
          entryStatus: financeEntryStatus,
          search: financeSearch,
          page: financePage,
          limit: 10,
          signal,
        },
        tenantSlug,
      );
      if (signal?.aborted) return;
      setFinanceData(response);
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      setFinanceError(err instanceof Error ? err.message : 'Erro ao carregar dados financeiros.');
    } finally {
      if (!signal?.aborted) {
        setFinanceLoading(false);
      }
    }
  }, [adminKey, dateFilter, dateFilterEnd, dateScope, financeEntryStatus, financeGroupBy, financePage, financeSearch, tenantSlug]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchDashboardFinance(controller.signal);
    return () => {
      controller.abort();
    };
  }, [fetchDashboardFinance, refreshTick]);

  useEffect(() => {
    if (!adminKey) return;
    const controller = new AbortController();
    setSupabaseLoading(true);
    getSupabaseReadinessForAdmin(adminKey, tenantSlug, controller.signal)
      .then((report) => {
        if (!controller.signal.aborted) {
          setSupabaseStatus(report);
        }
      })
      .catch(() => {
        // Silently ignore transient readiness errors so Dashboard remains uncluttered
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSupabaseLoading(false);
        }
      });
    return () => controller.abort();
  }, [adminKey, tenantSlug, refreshTick]);

  const handleExportFinanceCsv = async () => {
    if (exportingCsv || !adminKey) return;
    if (
      hideMoney &&
      !window.confirm(
        'Os valores monetários estão ocultos na tela pelo modo de privacidade. O arquivo CSV conterá os valores reais dos lançamentos. Deseja exportar mesmo assim?',
      )
    ) {
      return;
    }

    setExportingCsv(true);
    try {
      const collected: DashboardFinanceEntryRow[] = [];
      let currentPage = 1;
      let totalPages = 1;

      do {
        const res = await getDashboardFinanceForAdmin(
          adminKey,
          {
            scope: dateScope,
            startDate: dateScope === 'range' ? dateFilter : undefined,
            endDate: dateScope === 'range' ? (dateFilterEnd || dateFilter) : undefined,
            groupBy: financeGroupBy,
            entryStatus: financeEntryStatus,
            search: financeSearch,
            page: currentPage,
            limit: 50,
          },
          tenantSlug,
        );
        collected.push(...res.entries);
        totalPages = Math.min(res.pagination.totalPages, 40);
        currentPage += 1;
      } while (currentPage <= totalPages);

      const header = [
        'ID',
        'Agendamento',
        'Vencimento',
        'Pago em',
        'Cliente',
        'Serviço',
        'Forma de Pagamento',
        'Status',
        'Valor (BRL)',
      ]
        .map(escapeCsvCell)
        .join(';');

      const rows = collected.map((entry) =>
        [
          entry.id,
          entry.bookingId ?? '',
          entry.dueDate ? formatDateBR(entry.dueDate) : '',
          entry.paidAt ? entry.paidAt.slice(0, 10) : '',
          entry.clientName,
          entry.serviceName,
          entry.paymentMethod || 'Não informado',
          entry.status === 'pago' ? 'Pago' : 'Pendente',
          entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]
          .map(escapeCsvCell)
          .join(';'),
      );

      const csvContent = `\uFEFF${[header, ...rows].join('\r\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const scopeSuffix = dateScope === 'all' ? 'geral' : `${dateFilter}_a_${dateFilterEnd || dateFilter}`;
      anchor.href = url;
      anchor.download = `financeiro-${tenantSlug}-${scopeSuffix}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      toast.success(`${collected.length} lançamento(s) exportado(s) em CSV.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar lançamentos financeiros.');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleApplyPeriod = (next: {
    preset: DashboardPeriodPreset;
    scope: 'all' | 'range';
    startDate: string;
    endDate: string;
  }) => {
    setActivePreset(next.preset);
    setFinancePage(1);
    onApplyDatePeriod({
      scope: next.scope,
      startDate: next.startDate,
      endDate: next.endDate,
    });
  };

  const handleManualRefresh = () => {
    onReloadOverview();
    setRefreshTick((tick) => tick + 1);
  };

  const handleResetFinanceAndReload = async (password: string, date?: string): Promise<boolean> => {
    const success = await onResetFinance(password, date);
    if (success) {
      setFinancePage(1);
      setRefreshTick((tick) => tick + 1);
    }
    return success;
  };

  const financeScopeLabel = dateScope === 'all'
    ? 'Visão geral (todo o histórico)'
    : dateFilter === (dateFilterEnd || dateFilter)
      ? formatDateBR(dateFilter)
      : `${formatDateBR(dateFilter)} até ${formatDateBR(dateFilterEnd || dateFilter)}`;

  return (
    <div className="dash-shell">
      <DashboardHeader
        tenantName={tenantName}
        dateScope={dateScope}
        dateFilter={dateFilter}
        dateFilterEnd={dateFilterEnd || dateFilter}
        activePreset={activePreset}
        isRefreshing={overviewLoading || financeLoading}
        onApplyPeriod={handleApplyPeriod}
        onRefresh={handleManualRefresh}
      />

      <DashboardKpiGrid
        overview={overview}
        loading={overviewLoading}
        hasLoadedOnce={overviewHasLoadedOnce}
        error={overviewError}
        dateScope={dateScope}
        onRetry={onReloadOverview}
      />

      <DashboardFinanceSection
        data={financeData}
        loading={financeLoading}
        error={financeError}
        scopeLabel={financeScopeLabel}
        defaultResetDate={dateScope === 'range' ? dateFilter : getTodayDate()}
        groupBy={financeGroupBy}
        page={financePage}
        entryStatus={financeEntryStatus}
        searchTerm={financeSearchInput}
        exportingCsv={exportingCsv}
        onGroupByChange={(nextGroupBy) => {
          setFinanceGroupBy(nextGroupBy);
          setFinancePage(1);
        }}
        onPageChange={(nextPage) => setFinancePage(Math.max(1, nextPage))}
        onEntryStatusChange={(nextStatus) => {
          setFinanceEntryStatus(nextStatus);
          setFinancePage(1);
        }}
        onSearchChange={(nextSearch) => setFinanceSearchInput(nextSearch)}
        onExportCsv={() => void handleExportFinanceCsv()}
        onOpenPaymentsTab={onNavigateTab ? () => onNavigateTab('pagamentos') : undefined}
        onRetry={() => setRefreshTick((tick) => tick + 1)}
        onResetFinance={handleResetFinanceAndReload}
      />

      <DashboardCalendarAgenda
        adminKey={adminKey}
        tenantSlug={tenantSlug}
        refreshSignal={refreshTick}
        onOpenAgendaForDate={onOpenAgendaForDate}
      />

      <div className="dash-bottom-grid">
        <DashboardLeadsSection
          stageSummary={stageSummary}
          totalLeads={overview.leads.total}
          filteredByPeriod={Boolean(overview.leads.filteredByPeriod)}
          loading={overviewLoading}
          hasLoadedOnce={overviewHasLoadedOnce}
          error={overviewError}
          onRetry={onReloadOverview}
        />

        <DashboardOperationsSection
          overview={overview}
          dateScope={dateScope}
          supabaseStatus={supabaseStatus}
          supabaseLoading={supabaseLoading}
          onNavigateTab={onNavigateTab}
        />
      </div>
    </div>
  );
}
