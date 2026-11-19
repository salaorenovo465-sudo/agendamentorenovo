import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  Lock,
  Search,
  Table2,
  Trash2,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';

import { toast } from '../AdminHelpers';
import { formatDateBR, formatDateTimeBR, getTodayDate } from '../AdminUtils';
import { MoneyEyeButton, useMoneyPrivacy } from '../MoneyPrivacyContext';
import type {
  DashboardFinanceGroupBy,
  DashboardFinanceResponse,
  DashboardFinanceSeriesPoint,
  DashboardFinanceStatusFilter,
} from '../types';

type Props = {
  data: DashboardFinanceResponse | null;
  loading: boolean;
  error: string;
  scopeLabel: string;
  defaultResetDate: string;
  groupBy: DashboardFinanceGroupBy | 'auto';
  page: number;
  entryStatus?: DashboardFinanceStatusFilter;
  searchTerm?: string;
  exportingCsv?: boolean;
  onGroupByChange: (next: DashboardFinanceGroupBy | 'auto') => void;
  onPageChange: (nextPage: number) => void;
  onEntryStatusChange?: (next: DashboardFinanceStatusFilter) => void;
  onSearchChange?: (next: string) => void;
  onExportCsv?: () => void;
  onOpenPaymentsTab?: () => void;
  onRetry: () => void;
  onResetFinance: (password: string, date?: string) => Promise<boolean>;
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  debito: 'Débito',
  credito: 'Crédito',
};

const formatPaymentMethod = (value: string | null): string => {
  if (!value) return 'Não informado';
  const normalized = value.trim().toLowerCase();
  return PAYMENT_METHOD_LABELS[normalized] || value;
};

export function DashboardFinanceSection({
  data,
  loading,
  error,
  scopeLabel,
  defaultResetDate,
  groupBy,
  page,
  entryStatus = 'all',
  searchTerm = '',
  exportingCsv = false,
  onGroupByChange,
  onPageChange,
  onEntryStatusChange,
  onSearchChange,
  onExportCsv,
  onOpenPaymentsTab,
  onRetry,
  onResetFinance,
}: Props) {
  const headingId = useId();
  const resetHeadingId = useId();
  const { hideMoney, maskCurrency } = useMoneyPrivacy();
  const [chartType, setChartType] = useState<'bars' | 'lines'>('bars');
  const [showDataTable, setShowDataTable] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetScope, setResetScope] = useState<'date' | 'all'>('date');
  const [resetTargetDate, setResetTargetDate] = useState(defaultResetDate || getTodayDate());
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement | null>(null);
  const resetInputRef = useRef<HTMLInputElement | null>(null);

  const summary = data?.summary;
  const series = data?.series ?? [];
  const entries = data?.entries ?? [];
  const pagination = data?.pagination;
  const hasAnyFinanceData = Boolean(
    summary && (summary.totalCount > 0 || summary.expected !== 0 || summary.received !== 0),
  );

  useEffect(() => {
    setActiveIndex(series.length > 0 ? series.length - 1 : null);
  }, [series.length, data?.groupBy, data?.startDate, data?.endDate, data?.scope]);

  useEffect(() => {
    if (!showResetModal) return;
    setResetTargetDate(defaultResetDate || getTodayDate());
    const timer = window.setTimeout(() => {
      resetInputRef.current?.focus();
    }, 30);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !resetLoading) {
        setShowResetModal(false);
        resetTriggerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [showResetModal, defaultResetDate, resetLoading]);

  const closeResetModal = () => {
    if (resetLoading) return;
    setShowResetModal(false);
    window.setTimeout(() => {
      resetTriggerRef.current?.focus();
    }, 0);
  };

  const handleConfirmReset = async () => {
    if (resetLoading) return;
    if (resetScope === 'date' && !resetTargetDate) {
      setResetError('Selecione uma data válida para limpar.');
      return;
    }
    if (!resetPassword.trim()) {
      setResetError('Digite a senha master para confirmar.');
      return;
    }

    setResetLoading(true);
    setResetError('');
    try {
      const ok = await onResetFinance(
        resetPassword.trim(),
        resetScope === 'date' ? resetTargetDate : undefined,
      );
      if (ok) {
        setShowResetModal(false);
        setResetPassword('');
        setResetError('');
        toast.success(
          resetScope === 'date'
            ? `Lançamentos de ${formatDateBR(resetTargetDate)} removidos.`
            : 'Base financeira do estabelecimento zerada com sucesso.',
        );
        window.setTimeout(() => {
          resetTriggerRef.current?.focus();
        }, 0);
      } else {
        setResetError('Senha master inválida ou falha ao remover os registros.');
      }
    } catch {
      setResetError('Erro ao comunicar com o servidor ao zerar financeiro.');
    } finally {
      setResetLoading(false);
    }
  };

  const chartGeometry = useMemo(() => {
    const svgWidth = Math.max(640, series.length * 64 + 80);
    const svgHeight = 250;
    const padLeft = 72;
    const padRight = 24;
    const padTop = 20;
    const padBottom = 42;
    const plotWidth = svgWidth - padLeft - padRight;
    const plotHeight = svgHeight - padTop - padBottom;

    let minValue = 0;
    let maxValue = 0;
    for (const point of series) {
      minValue = Math.min(minValue, point.expected, point.received, point.pending);
      maxValue = Math.max(maxValue, point.expected, point.received, point.pending);
    }
    if (maxValue === minValue) {
      maxValue = minValue + 100;
    } else {
      maxValue = maxValue * 1.12;
      if (minValue < 0) {
        minValue = minValue * 1.12;
      }
    }

    const span = maxValue - minValue || 1;
    const yForValue = (value: number): number =>
      padTop + ((maxValue - value) / span) * plotHeight;
    const zeroY = yForValue(0);

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
      const val = minValue + span * (1 - ratio);
      return {
        value: val,
        y: padTop + ratio * plotHeight,
        label: maskCurrency(val),
      };
    });

    const stepX = series.length > 0 ? plotWidth / series.length : plotWidth;
    return {
      svgWidth,
      svgHeight,
      padLeft,
      padRight,
      padTop,
      padBottom,
      plotWidth,
      plotHeight,
      zeroY,
      yForValue,
      ticks,
      stepX,
    };
  }, [series, maskCurrency]);

  const activePoint: DashboardFinanceSeriesPoint | null =
    activeIndex !== null && activeIndex >= 0 && activeIndex < series.length
      ? series[activeIndex]
      : null;

  const linePaths = useMemo(() => {
    if (series.length <= 1) {
      return { expected: '', received: '', pending: '' };
    }
    const buildPath = (picker: (p: DashboardFinanceSeriesPoint) => number): string =>
      series
        .map((point, index) => {
          const x = chartGeometry.padLeft + chartGeometry.stepX * (index + 0.5);
          const y = chartGeometry.yForValue(picker(point));
          return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
        .join(' ');

    return {
      expected: buildPath((p) => p.expected),
      received: buildPath((p) => p.received),
      pending: buildPath((p) => p.pending),
    };
  }, [chartGeometry, series]);

  const effectiveGroupBy = data?.groupBy || 'month';
  const showSkeleton = loading && !data;

  return (
    <section className="dash-surface dash-finance-section" aria-labelledby={headingId}>
      <div className="dash-section-head">
        <div>
          <h3 id={headingId}>
            <WalletCards className="w-4 h-4" aria-hidden="true" />
            <span>Painel financeiro</span>
          </h3>
          <p>
            Escopo: <strong>{scopeLabel}</strong> · Valores agrupados pela data de vencimento (<code>due_date</code>).
          </p>
        </div>

        <div className="dash-finance-head-meta">
          <MoneyEyeButton variant="compact" />
          {loading && data && <span className="dash-updating-pill">Atualizando financeiro...</span>}
          {summary && summary.zeroAmountCount > 0 && (
            <span className="dash-pill-muted" title="Lançamentos registrados com valor zerado (ex.: serviços sob consulta)">
              {hideMoney ? `${summary.zeroAmountCount} com valor oculto` : `${summary.zeroAmountCount} com valor R$ 0,00`}
            </span>
          )}
        </div>
      </div>

      {error && !data ? (
        <div className="dash-empty-state is-error" role="alert">
          <div className="dash-state-inline">
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button type="button" className="admin-btn-outline dash-sm-btn" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : showSkeleton ? (
        <div className="dash-skeleton-stack" aria-busy="true" aria-label="Carregando dados financeiros">
          <div className="dash-finance-kpis">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="dash-finance-kpi-box">
                <div className="dash-skeleton-line w-20" />
                <div className="dash-skeleton-value" />
              </div>
            ))}
          </div>
          <div className="dash-skeleton-chart" />
        </div>
      ) : (
        <>
          {error && data && (
            <div className="dash-section-alert" role="alert">
              <div className="dash-state-inline">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />
                <span>Erro ao atualizar painel financeiro: {error}</span>
              </div>
              <button type="button" className="admin-btn-outline dash-sm-btn" onClick={onRetry}>
                Tentar novamente
              </button>
            </div>
          )}

          {/* Totais Financeiros em formato brasileiro */}
          <div className={`dash-finance-kpis${loading && data ? ' is-updating' : ''}`}>
            <article className="dash-finance-kpi-box">
              <span>Previsto (vencimento no recorte)</span>
              <strong>{maskCurrency(summary?.expected ?? 0)}</strong>
              <small>{(summary?.totalCount ?? 0).toLocaleString('pt-BR')} lançamento(s) registrado(s)</small>
            </article>
            <article className="dash-finance-kpi-box tone-paid">
              <span>Recebido (status pago)</span>
              <strong>{maskCurrency(summary?.received ?? 0)}</strong>
              <small>{(summary?.paidCount ?? 0).toLocaleString('pt-BR')} título(s) liquidado(s)</small>
            </article>
            <article className="dash-finance-kpi-box tone-pending">
              <span>Pendente (em aberto)</span>
              <strong>{maskCurrency(summary?.pending ?? 0)}</strong>
              <small>{(summary?.pendingCount ?? 0).toLocaleString('pt-BR')} título(s) pendente(s)</small>
            </article>
          </div>

          {summary && summary.negativeCount > 0 && (
            <p className="dash-inline-note">
              Observação: existem {summary.negativeCount} lançamento(s) com valor negativo (ajustes/estornos) incluídos nos totais acima.
            </p>
          )}

          {/* Gráfico Interativo */}
          <div className="dash-chart-panel">
            <div className="dash-chart-toolbar">
              <div className="dash-chart-legend" aria-label="Legenda das séries do gráfico financeiro">
                <span className="dash-legend-item">
                  <i className="swatch-expected" aria-hidden="true" />
                  <span>Previsto</span>
                </span>
                <span className="dash-legend-item">
                  <i className="swatch-received" aria-hidden="true" />
                  <span>Recebido</span>
                </span>
                <span className="dash-legend-item">
                  <i className="swatch-pending" aria-hidden="true" />
                  <span>Pendente</span>
                </span>
              </div>

              <div className="dash-chart-controls">
                <div className="dash-segmented-control" role="group" aria-label="Agrupamento temporal do gráfico">
                  {([
                    { id: 'day', label: 'Dia' },
                    { id: 'week', label: 'Semana' },
                    { id: 'month', label: 'Mês' },
                  ] as const).map((item) => {
                    const isSelected = groupBy === 'auto' ? effectiveGroupBy === item.id : groupBy === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={isSelected ? 'active' : ''}
                        aria-pressed={isSelected}
                        onClick={() => onGroupByChange(item.id)}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>

                <div className="dash-segmented-control" role="group" aria-label="Tipo de visualização do gráfico">
                  <button
                    type="button"
                    className={chartType === 'bars' ? 'active' : ''}
                    aria-pressed={chartType === 'bars'}
                    onClick={() => setChartType('bars')}
                  >
                    <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Barras</span>
                  </button>
                  <button
                    type="button"
                    className={chartType === 'lines' ? 'active' : ''}
                    aria-pressed={chartType === 'lines'}
                    onClick={() => setChartType('lines')}
                  >
                    <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Linhas</span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`dash-table-toggle-btn${showDataTable ? ' active' : ''}`}
                  aria-expanded={showDataTable}
                  onClick={() => setShowDataTable((prev) => !prev)}
                >
                  <Table2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{showDataTable ? 'Ocultar tabela' : 'Tabela de valores'}</span>
                </button>
              </div>
            </div>

            {data?.autoAdjustedGroupBy && (
              <p className="dash-inline-note">
                O agrupamento foi ajustado automaticamente para <strong>{effectiveGroupBy === 'month' ? 'Mês' : 'Semana'}</strong> porque o período possui muitos dias para exibição legível.
              </p>
            )}

            {series.length === 0 ? (
              <div className="dash-empty-state">
                <strong>Sem dados financeiros para o gráfico</strong>
                <p>Não há lançamentos em <code>financial_entries</code> com vencimento neste período.</p>
              </div>
            ) : (
              <>
                {/* Barra de Tooltip / Leitura ativa */}
                <div className="dash-chart-tooltip-bar" aria-live="polite">
                  {activePoint ? (
                    <>
                      <span className="dash-tooltip-period">
                        Período: <strong>{activePoint.fullLabel}</strong> ({activePoint.count} título(s))
                      </span>
                      <div className="dash-tooltip-metrics">
                        <span className="metric-expected">Previsto: <strong>{maskCurrency(activePoint.expected)}</strong></span>
                        <span className="metric-received">Recebido: <strong>{maskCurrency(activePoint.received)}</strong></span>
                        <span className="metric-pending">Pendente: <strong>{maskCurrency(activePoint.pending)}</strong></span>
                      </div>
                    </>
                  ) : (
                    <span>Passe o mouse ou navegue via teclado sobre o gráfico para inspecionar os valores.</span>
                  )}
                </div>

                {series.length === 1 && chartType === 'lines' && (
                  <p className="dash-inline-note">
                    Apenas 1 período possui lançamentos neste recorte; exibindo marcador pontual.
                  </p>
                )}

                <div className="dash-svg-scroll">
                  <svg
                    viewBox={`0 0 ${chartGeometry.svgWidth} ${chartGeometry.svgHeight}`}
                    className="dash-finance-svg"
                    role="img"
                    aria-label="Gráfico comparando valores financeiros previsto, recebido e pendente por período"
                  >
                    {chartGeometry.ticks.map((tick, index) => (
                      <g key={index}>
                        <line
                          x1={chartGeometry.padLeft}
                          x2={chartGeometry.svgWidth - chartGeometry.padRight}
                          y1={tick.y}
                          y2={tick.y}
                          stroke="#e5e7eb"
                          strokeDasharray={index === chartGeometry.ticks.length - 1 ? undefined : '3 3'}
                        />
                        <text
                          x={chartGeometry.padLeft - 8}
                          y={tick.y + 3}
                          textAnchor="end"
                          fontSize="10"
                          fill="#64748b"
                          fontWeight="600"
                        >
                          {tick.label}
                        </text>
                      </g>
                    ))}

                    {chartType === 'lines' && series.length > 1 && (
                      <>
                        <path d={linePaths.expected} fill="none" stroke="#3a0a1e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={linePaths.received} fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d={linePaths.pending} fill="none" stroke="#d97706" strokeWidth="2.2" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
                      </>
                    )}

                    {series.map((point, index) => {
                      const centerX = chartGeometry.padLeft + chartGeometry.stepX * (index + 0.5);
                      const isActive = activeIndex === index;
                      const colWidth = Math.min(44, chartGeometry.stepX * 0.78);
                      const barWidth = Math.max(6, Math.min(13, (colWidth - 6) / 3));

                      const renderBarRect = (val: number, offsetIdx: number, fill: string) => {
                        const yVal = chartGeometry.yForValue(val);
                        const y = Math.min(yVal, chartGeometry.zeroY);
                        const height = Math.max(val === 0 ? 1.5 : 3, Math.abs(chartGeometry.zeroY - yVal));
                        const x = centerX - (barWidth * 1.5 + 2) + offsetIdx * (barWidth + 2);
                        return (
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={height}
                            rx="3"
                            fill={fill}
                            opacity={isActive || activeIndex === null ? 1 : 0.65}
                          />
                        );
                      };

                      const showTickLabel =
                        series.length <= 16 ||
                        index === 0 ||
                        index === series.length - 1 ||
                        index % Math.ceil(series.length / 12) === 0;

                      return (
                        <g
                          key={point.key}
                          className="dash-chart-point-group"
                          tabIndex={0}
                          role="button"
                          aria-label={
                            hideMoney
                              ? `${point.fullLabel}: valores financeiros ocultos`
                              : `${point.fullLabel}: Previsto ${maskCurrency(point.expected)}, Recebido ${maskCurrency(point.received)}, Pendente ${maskCurrency(point.pending)}`
                          }
                          onMouseEnter={() => setActiveIndex(index)}
                          onFocus={() => setActiveIndex(index)}
                          onClick={() => setActiveIndex(index)}
                        >
                          <rect
                            x={centerX - chartGeometry.stepX * 0.45}
                            y={chartGeometry.padTop}
                            width={chartGeometry.stepX * 0.9}
                            height={chartGeometry.plotHeight}
                            rx="6"
                            fill={isActive ? 'rgba(58, 10, 30, 0.05)' : 'transparent'}
                          />

                          {chartType === 'bars' ? (
                            <>
                              {renderBarRect(point.expected, 0, '#3a0a1e')}
                              {renderBarRect(point.received, 1, '#047857')}
                              {renderBarRect(point.pending, 2, '#d97706')}
                            </>
                          ) : (
                            <>
                              <circle cx={centerX} cy={chartGeometry.yForValue(point.expected)} r={isActive ? 5.5 : 4} fill="#3a0a1e" stroke="#ffffff" strokeWidth="1.5" />
                              <circle cx={centerX} cy={chartGeometry.yForValue(point.received)} r={isActive ? 5.5 : 4} fill="#047857" stroke="#ffffff" strokeWidth="1.5" />
                              <circle cx={centerX} cy={chartGeometry.yForValue(point.pending)} r={isActive ? 5 : 3.5} fill="#d97706" stroke="#ffffff" strokeWidth="1.5" />
                            </>
                          )}

                          {showTickLabel && (
                            <text
                              x={centerX}
                              y={chartGeometry.svgHeight - 14}
                              textAnchor="middle"
                              fontSize="10"
                              fill={isActive ? '#3a0a1e' : '#64748b'}
                              fontWeight={isActive ? '800' : '600'}
                            >
                              {point.label}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {showDataTable && (
                  <div className="dash-table-wrap dash-series-table-wrap">
                    <table className="dash-table">
                      <caption>Valores agregados no gráfico ({effectiveGroupBy === 'day' ? 'por dia' : effectiveGroupBy === 'week' ? 'por semana' : 'por mês'})</caption>
                      <thead>
                        <tr>
                          <th>Período</th>
                          <th>Lançamentos</th>
                          <th>Previsto</th>
                          <th>Recebido</th>
                          <th>Pendente</th>
                        </tr>
                      </thead>
                      <tbody>
                        {series.map((point) => (
                          <tr key={point.key}>
                            <td>{point.fullLabel}</td>
                            <td>{point.count}</td>
                            <td>{maskCurrency(point.expected)}</td>
                            <td className="is-money-in">{maskCurrency(point.received)}</td>
                            <td className="is-money-pending">{maskCurrency(point.pending)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Detalhamento paginado dos lançamentos */}
          <div className="dash-finance-details">
            <div className="dash-details-head">
              <div>
                <h4>Detalhamento de lançamentos financeiros</h4>
                <span>
                  {pagination
                    ? `${pagination.total.toLocaleString('pt-BR')} título(s) · Página ${pagination.page} de ${pagination.totalPages}`
                    : '0 títulos'}
                </span>
              </div>
              <div className="dash-details-head-actions">
                {onExportCsv && (
                  <button
                    type="button"
                    className="admin-btn-outline dash-sm-btn"
                    disabled={loading || exportingCsv || !pagination || pagination.total === 0}
                    onClick={onExportCsv}
                    title={hideMoney ? 'Exporta os títulos do filtro atual em CSV (valores reais)' : 'Baixar lançamentos filtrados em CSV'}
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{exportingCsv ? 'Exportando...' : 'Exportar CSV'}</span>
                  </button>
                )}
                {onOpenPaymentsTab && (
                  <button
                    type="button"
                    className="admin-btn-outline dash-sm-btn"
                    onClick={onOpenPaymentsTab}
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Abrir em Pagamentos</span>
                  </button>
                )}
              </div>
            </div>

            {(onEntryStatusChange || onSearchChange) && (
              <div className="dash-details-toolbar">
                {onEntryStatusChange && (
                  <div className="dash-segmented" role="group" aria-label="Filtrar lançamentos por status">
                    {([
                      { id: 'all', label: 'Todos' },
                      { id: 'pago', label: 'Pagos' },
                      { id: 'pendente', label: 'Pendentes' },
                    ] as const).map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={entryStatus === option.id}
                        className={`dash-seg-btn${entryStatus === option.id ? ' is-active' : ''}`}
                        onClick={() => onEntryStatusChange(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {onSearchChange && (
                  <div className="dash-table-search-wrap">
                    <Search className="w-3.5 h-3.5 dash-table-search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(event) => onSearchChange(event.target.value)}
                      placeholder="Buscar cliente, serviço ou #ID..."
                      aria-label="Buscar lançamentos financeiros"
                      className="dash-table-search-input"
                    />
                    {searchTerm && (
                      <button
                        type="button"
                        className="dash-table-search-clear"
                        onClick={() => onSearchChange('')}
                        aria-label="Limpar busca financeira"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {entries.length === 0 ? (
              <div className="dash-empty-state">
                <strong>
                  {entryStatus !== 'all' || searchTerm.trim()
                    ? 'Nenhum lançamento encontrado para esse filtro'
                    : 'Nenhum lançamento encontrado'}
                </strong>
                <p>
                  {entryStatus !== 'all' || searchTerm.trim()
                    ? 'Tente ajustar o status ou o termo de busca para visualizar outros títulos do período.'
                    : 'Não existem registros financeiros com vencimento dentro do período selecionado.'}
                </p>
                {(entryStatus !== 'all' || searchTerm.trim()) && (onEntryStatusChange || onSearchChange) && (
                  <div>
                    <button
                      type="button"
                      className="admin-btn-outline dash-sm-btn"
                      onClick={() => {
                        onEntryStatusChange?.('all');
                        onSearchChange?.('');
                      }}
                    >
                      Limpar filtros da tabela
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Vencimento</th>
                        <th>Cliente & Serviço</th>
                        <th>Pagamento</th>
                        <th>Status</th>
                        <th className="text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap">
                            <strong>{entry.dueDate ? formatDateBR(entry.dueDate) : '--'}</strong>
                            {entry.paidAt && (
                              <small className="dash-table-sub">Pago em {formatDateTimeBR(entry.paidAt)}</small>
                            )}
                          </td>
                          <td>
                            <div className="dash-table-client" title={`${entry.clientName} — ${entry.serviceName}`}>
                              <strong>{entry.clientName}</strong>
                              <span>{entry.serviceName}</span>
                            </div>
                          </td>
                          <td>{formatPaymentMethod(entry.paymentMethod)}</td>
                          <td>
                            <span className={`dash-status-pill ${entry.status === 'pago' ? 'is-paid' : 'is-pending'}`}>
                              {entry.status === 'pago' ? (
                                <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                              ) : (
                                <Clock3 className="w-3 h-3" aria-hidden="true" />
                              )}
                              <span>{entry.status === 'pago' ? 'Pago' : 'Pendente'}</span>
                            </span>
                          </td>
                          <td className="text-right whitespace-nowrap">
                            <strong className={entry.status === 'pago' ? 'is-money-in' : ''}>
                              {maskCurrency(entry.amount)}
                            </strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination && pagination.totalPages > 1 && (
                  <div className="dash-pagination-row">
                    <button
                      type="button"
                      className="admin-btn-outline dash-sm-btn"
                      disabled={page <= 1 || loading}
                      onClick={() => onPageChange(page - 1)}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Anterior</span>
                    </button>
                    <span>
                      Página <strong>{pagination.page}</strong> de <strong>{pagination.totalPages}</strong>
                    </span>
                    <button
                      type="button"
                      className="admin-btn-outline dash-sm-btn"
                      disabled={!pagination.hasMore || loading}
                      onClick={() => onPageChange(page + 1)}
                    >
                      <span>Próxima</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Zona de manutenção destrutiva separada para evitar cliques acidentais */}
          {hasAnyFinanceData && (
            <div className="dash-maintenance-bar">
              <div>
                <strong>Manutenção financeira</strong>
                <p>A remoção de lançamentos exige confirmação por senha master e não apaga agendamentos.</p>
              </div>
              <button
                ref={resetTriggerRef}
                type="button"
                className="admin-btn-danger dash-sm-btn"
                onClick={() => {
                  setResetPassword('');
                  setResetError('');
                  setResetScope('date');
                  setShowResetModal(true);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Zerar financeiro</span>
              </button>
            </div>
          )}
        </>
      )}

      {showResetModal && (
        <div
          className="admin-modal-root admin-modal-root-critical"
          onClick={closeResetModal}
        >
          <div className="admin-modal-overlay" />
          <div
            className="admin-modal-card admin-modal-card-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={resetHeadingId}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="dash-danger-icon-box">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <h3 id={resetHeadingId} style={{ fontSize: 16, fontWeight: 800, color: 'var(--admin-text)', margin: 0 }}>
                    Zerar financeiro
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>
                    Ação irreversível protegida por senha master
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetLoading}
                aria-label="Fechar modal de confirmação"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="dash-danger-callout">
                <strong>Impacto real da operação:</strong>
                <p>
                  {resetScope === 'date'
                    ? `Remove exclusivamente os registros financeiros com vencimento em ${resetTargetDate ? formatDateBR(resetTargetDate) : '--'} neste estabelecimento. Os agendamentos são mantidos.`
                    : 'Remove TODOS os lançamentos financeiros (financial_entries) deste estabelecimento e reinicia o status de pagamento quando aplicável. Os agendamentos em si são mantidos.'}
                </p>
              </div>

              <div className="dash-reset-fields">
                <div>
                  <span className="dash-field-caption">Escopo exato da remoção</span>
                  <div className="dash-reset-scope-grid">
                    <button
                      type="button"
                      className={`dash-reset-scope-btn${resetScope === 'date' ? ' active' : ''}`}
                      onClick={() => setResetScope('date')}
                      disabled={resetLoading}
                    >
                      Data específica
                    </button>
                    <button
                      type="button"
                      className={`dash-reset-scope-btn is-all${resetScope === 'all' ? ' active' : ''}`}
                      onClick={() => setResetScope('all')}
                      disabled={resetLoading}
                    >
                      Toda a base do estabelecimento
                    </button>
                  </div>
                </div>

                {resetScope === 'date' && (
                  <div>
                    <label htmlFor="dash-reset-date-input" className="dash-field-caption">
                      Data de vencimento a remover
                    </label>
                    <input
                      id="dash-reset-date-input"
                      type="date"
                      value={resetTargetDate}
                      onChange={(event) => {
                        setResetTargetDate(event.target.value);
                        if (resetError) setResetError('');
                      }}
                      disabled={resetLoading}
                      className="admin-input"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="dash-reset-password-input" className="dash-field-caption">
                    Senha master
                  </label>
                  <input
                    id="dash-reset-password-input"
                    ref={resetInputRef}
                    type="password"
                    value={resetPassword}
                    onChange={(event) => {
                      setResetPassword(event.target.value);
                      if (resetError) setResetError('');
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void handleConfirmReset();
                      }
                    }}
                    placeholder="Digite a senha master"
                    disabled={resetLoading}
                    className="admin-input"
                  />
                </div>

                {resetError && (
                  <p className="dash-inline-error" role="alert">
                    {resetError}
                  </p>
                )}
              </div>
            </div>

            <div className="admin-modal-footer admin-modal-footer-split">
              <button
                type="button"
                onClick={closeResetModal}
                disabled={resetLoading}
                className="admin-btn-outline"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmReset()}
                disabled={resetLoading || !resetPassword.trim()}
                className="admin-btn-danger"
              >
                {resetLoading ? 'Removendo...' : 'Confirmar remoção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
