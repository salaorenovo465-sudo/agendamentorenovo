import { useEffect, useState } from 'react';
import { CalendarRange, Check, RefreshCw } from 'lucide-react';

import { MoneyEyeButton } from '../MoneyPrivacyContext';
import {
  formatDateBR,
  getMonthRangeFromDate,
  getPreviousMonthRangeFromDate,
  getTodayDate,
  isValidIsoDateLocal,
  shiftIsoDays,
} from '../AdminUtils';

export type DashboardPeriodPreset = 'all' | 'today' | 'last7' | 'thisMonth' | 'prevMonth' | 'custom';

type Props = {
  tenantName: string;
  dateScope: 'all' | 'range';
  dateFilter: string;
  dateFilterEnd: string;
  activePreset: DashboardPeriodPreset;
  isRefreshing: boolean;
  onApplyPeriod: (next: { preset: DashboardPeriodPreset; scope: 'all' | 'range'; startDate: string; endDate: string }) => void;
  onRefresh: () => void;
};

const PRESET_OPTIONS: { id: DashboardPeriodPreset; label: string }[] = [
  { id: 'all', label: 'Geral' },
  { id: 'today', label: 'Hoje' },
  { id: 'last7', label: 'Últimos 7 dias' },
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'prevMonth', label: 'Mês anterior' },
  { id: 'custom', label: 'Personalizado' },
];

export function resolvePresetDates(preset: DashboardPeriodPreset): {
  scope: 'all' | 'range';
  startDate: string;
  endDate: string;
} {
  const today = getTodayDate();
  if (preset === 'all') {
    return { scope: 'all', startDate: today, endDate: today };
  }
  if (preset === 'today') {
    return { scope: 'range', startDate: today, endDate: today };
  }
  if (preset === 'last7') {
    return { scope: 'range', startDate: shiftIsoDays(today, -6), endDate: today };
  }
  if (preset === 'thisMonth') {
    const bounds = getMonthRangeFromDate(today);
    return { scope: 'range', startDate: bounds.startDate, endDate: bounds.endDate };
  }
  if (preset === 'prevMonth') {
    const prev = getPreviousMonthRangeFromDate(today);
    return { scope: 'range', startDate: prev.startDate, endDate: prev.endDate };
  }
  return { scope: 'range', startDate: today, endDate: today };
}

export function DashboardHeader({
  tenantName,
  dateScope,
  dateFilter,
  dateFilterEnd,
  activePreset,
  isRefreshing,
  onApplyPeriod,
  onRefresh,
}: Props) {
  const [customExpanded, setCustomExpanded] = useState(activePreset === 'custom');
  const [draftStart, setDraftStart] = useState(dateFilter);
  const [draftEnd, setDraftEnd] = useState(dateFilterEnd || dateFilter);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setDraftStart(dateFilter);
    setDraftEnd(dateFilterEnd || dateFilter);
    if (activePreset === 'custom') {
      setCustomExpanded(true);
    } else {
      setCustomExpanded(false);
    }
    setValidationError('');
  }, [activePreset, dateFilter, dateFilterEnd]);

  const appliedPeriodText = dateScope === 'all'
    ? 'Visão geral (todo o histórico)'
    : dateFilter === (dateFilterEnd || dateFilter)
      ? `${formatDateBR(dateFilter)} (inclusivo)`
      : `${formatDateBR(dateFilter)} até ${formatDateBR(dateFilterEnd || dateFilter)} (inclusivo)`;

  const handleSelectPreset = (preset: DashboardPeriodPreset) => {
    setValidationError('');
    if (preset === 'custom') {
      setCustomExpanded(true);
      setDraftStart(dateFilter);
      setDraftEnd(dateFilterEnd || dateFilter);
      return;
    }

    const resolved = resolvePresetDates(preset);
    setCustomExpanded(false);
    onApplyPeriod({
      preset,
      scope: resolved.scope,
      startDate: resolved.startDate,
      endDate: resolved.endDate,
    });
  };

  const handleApplyCustom = () => {
    if (!isValidIsoDateLocal(draftStart) || !isValidIsoDateLocal(draftEnd)) {
      setValidationError('Informe datas válidas para o início e o fim do período.');
      return;
    }

    if (draftEnd < draftStart) {
      setValidationError('A data final não pode ser anterior à data inicial.');
      return;
    }

    setValidationError('');
    onApplyPeriod({
      preset: 'custom',
      scope: 'range',
      startDate: draftStart,
      endDate: draftEnd,
    });
  };

  return (
    <header className="dash-header-card">
      <div className="dash-header-top">
        <div className="dash-header-copy">
          <span className="dash-eyebrow">{tenantName} · Visão executiva</span>
          <h2>Dashboard</h2>
          <p>Indicadores operacionais, desempenho financeiro e agenda integrada com calendário mensal.</p>
        </div>

        <div className="dash-header-actions">
          <div className="dash-active-period-badge" title="Filtro compartilhado entre Dashboard e Agenda">
            <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Período ativo: <strong>{appliedPeriodText}</strong></span>
          </div>
          <MoneyEyeButton variant="default" />
          <button
            type="button"
            className="admin-btn-outline dash-refresh-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Atualizar dados da Dashboard"
          >
            <RefreshCw className={`w-3.5 h-3.5${isRefreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
            <span>{isRefreshing ? 'Atualizando...' : 'Atualizar'}</span>
          </button>
        </div>
      </div>

      <div className="dash-filter-bar">
        <div className="dash-preset-pills" role="group" aria-label="Atalhos de período da Dashboard">
          {PRESET_OPTIONS.map((option) => {
            const isActive = option.id === 'custom'
              ? customExpanded || activePreset === 'custom'
              : !customExpanded && activePreset === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`dash-preset-btn${isActive ? ' active' : ''}`}
                aria-pressed={isActive}
                onClick={() => handleSelectPreset(option.id)}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="dash-scope-note">
          Agendamentos e financeiro seguem este filtro (compartilhado com a aba Agenda).
        </p>
      </div>

      {customExpanded && (
        <div className="dash-custom-range-row">
          <div className="dash-date-field">
            <label htmlFor="dash-filter-start">Data inicial</label>
            <input
              id="dash-filter-start"
              type="date"
              value={draftStart}
              onChange={(event) => {
                setDraftStart(event.target.value);
                if (validationError) setValidationError('');
              }}
              className="admin-input-sm"
            />
          </div>
          <div className="dash-date-field">
            <label htmlFor="dash-filter-end">Data final</label>
            <input
              id="dash-filter-end"
              type="date"
              value={draftEnd}
              onChange={(event) => {
                setDraftEnd(event.target.value);
                if (validationError) setValidationError('');
              }}
              className="admin-input-sm"
            />
          </div>
          <button
            type="button"
            className="admin-btn-primary dash-apply-range-btn"
            onClick={handleApplyCustom}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Aplicar período</span>
          </button>
          {validationError && (
            <p className="dash-inline-error" role="alert">
              {validationError}
            </p>
          )}
        </div>
      )}
    </header>
  );
}
