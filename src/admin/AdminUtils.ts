import type { WorkbenchEntity, WorkbenchOverview } from './types';

export type TabId =
  | 'dashboard'
  | 'agenda'
  | 'historico'
  | 'disponibilidade'
  | 'clientes'
  | 'servicos'
  | 'profissionais'
  | 'analytics'
  | 'avaliacoes'
  | 'tarefas'
  | 'pagamentos'
  | 'configuracoes';

export type FieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox';

export type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
};

const BRL_CURRENCY_FORMATTER = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const formatCurrencyBRL = (value: number): string =>
  BRL_CURRENCY_FORMATTER.format(Number.isFinite(value) ? value : 0);

export const getTodayDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const isLeapYearLocal = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export const getDaysInMonthLocal = (year: number, month1Based: number): number => {
  if (month1Based === 2) return isLeapYearLocal(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month1Based)) return 30;
  return 31;
};

export const parseIsoDateLocal = (value: string | null | undefined): { year: number; month: number; day: number } | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d) || m < 1 || m > 12) {
    return null;
  }
  if (d < 1 || d > getDaysInMonthLocal(y, m)) {
    return null;
  }
  return { year: y, month: m, day: d };
};

export const isValidIsoDateLocal = (value: string | null | undefined): boolean =>
  parseIsoDateLocal(value) !== null;

export const formatIsoDateLocal = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export const shiftIsoDays = (isoDate: string, deltaDays: number): string => {
  const parts = parseIsoDateLocal(isoDate);
  if (!parts) return isoDate;
  const dt = new Date(parts.year, parts.month - 1, parts.day + deltaDays);
  return formatIsoDateLocal(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
};

export const getMonthRangeFromDate = (isoDate: string): { year: number; month: number; startDate: string; endDate: string; monthKey: string } => {
  const parts = parseIsoDateLocal(isoDate) || parseIsoDateLocal(getTodayDate())!;
  const days = getDaysInMonthLocal(parts.year, parts.month);
  return {
    year: parts.year,
    month: parts.month,
    monthKey: `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}`,
    startDate: formatIsoDateLocal(parts.year, parts.month, 1),
    endDate: formatIsoDateLocal(parts.year, parts.month, days),
  };
};

export const getPreviousMonthRangeFromDate = (isoDate: string): { startDate: string; endDate: string } => {
  const parts = parseIsoDateLocal(isoDate) || parseIsoDateLocal(getTodayDate())!;
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const days = getDaysInMonthLocal(prevYear, prevMonth);
  return {
    startDate: formatIsoDateLocal(prevYear, prevMonth, 1),
    endDate: formatIsoDateLocal(prevYear, prevMonth, days),
  };
};

export const shiftYearMonth = (year: number, month1Based: number, deltaMonths: number): { year: number; month: number; monthKey: string } => {
  const total = year * 12 + (month1Based - 1) + deltaMonths;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12 + 1;
  return {
    year: nextYear,
    month: nextMonth,
    monthKey: `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}`,
  };
};

export const formatMonthYearPT = (year: number, month1Based: number): string =>
  `${MONTH_NAMES_PT[month1Based - 1] || String(month1Based)} de ${year}`;

export const formatDateBR = (date: string): string => {
  const parts = date.slice(0, 10).split('-');
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

export const formatDateTimeBR = (isoTimestamp: string | null | undefined): string => {
  if (!isoTimestamp) return '--';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return formatDateBR(isoTimestamp);
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return 0;
};

export const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

export const normalizePhoneDigits = (value: string): string => value.replace(/\D/g, '');

export const formatBrazilWhatsappInput = (value: string): string => {
  const digits = normalizePhoneDigits(value);
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits;
  const limited = withoutCountry.slice(0, 11);
  const ddd = limited.slice(0, 2);
  const number = limited.slice(2);

  let formatted = '+55';
  if (!ddd) {
    return formatted;
  }

  formatted += ` (${ddd}`;
  if (ddd.length === 2) {
    formatted += ')';
  }

  if (!number) {
    return formatted;
  }

  if (number.length <= 4) {
    return `${formatted} ${number}`;
  }

  if (number.length <= 8) {
    return `${formatted} ${number.slice(0, 4)}-${number.slice(4)}`;
  }

  return `${formatted} ${number.slice(0, 5)}-${number.slice(5, 9)}`;
};

export const defaultOverview: WorkbenchOverview = {
  date: getTodayDate(),
  bookingStats: { total: 0, pending: 0, confirmed: 0, completed: 0, rejected: 0 },
  leads: { total: 0, byStage: {}, filteredByPeriod: false },
  tasks: { total: 0, pending: 0, done: 0, filteredByPeriod: false },
  finance: { expected: 0, received: 0, pending: 0, totalCount: 0, paidCount: 0, pendingCount: 0, temporalBasis: 'due_date' },
};

export const DEFAULT_TENANT_SLUG = (import.meta.env?.VITE_DEFAULT_TENANT || 'renovo').toLowerCase();

export const normalizeTenantSlug = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return normalized.replace(/[^a-z0-9-]/g, '');
};

export const ENTITY_BY_TAB: Partial<Record<TabId, WorkbenchEntity>> = {
  disponibilidade: 'availability',
  clientes: 'clients',
  servicos: 'services',
  profissionais: 'professionals',
  avaliacoes: 'reviews',
  tarefas: 'tasks',
};

export const ENTITY_FIELDS: Record<WorkbenchEntity, FieldConfig[]> = {
  availability: [
    { key: 'title', label: 'Titulo', type: 'text', required: true },
    { key: 'type', label: 'Tipo', type: 'select', options: ['horario', 'pausa', 'folga', 'feriado', 'bloqueio'] },
    { key: 'weekday', label: 'Dia semana (0-6)', type: 'number' },
    { key: 'start_time', label: 'Inicio', type: 'time' },
    { key: 'end_time', label: 'Fim', type: 'time' },
    { key: 'limit_per_day', label: 'Limite dia', type: 'number' },
    { key: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  clients: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'phone', label: 'Telefone', type: 'text', required: true },
    { key: 'cpf', label: 'CPF', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'address', label: 'Endereco', type: 'text' },
    { key: 'birth_date', label: 'Nascimento', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['novo', 'ativo', 'recorrente', 'VIP', 'inativo', 'em risco'] },
    { key: 'preferred_service', label: 'Servico preferido', type: 'text' },
    { key: 'preferred_professional', label: 'Profissional preferido', type: 'text' },
    { key: 'notes', label: 'Observacoes', type: 'textarea' },
  ],
  leads: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'phone', label: 'Telefone', type: 'text', required: true },
    { key: 'source', label: 'Origem', type: 'text' },
    {
      key: 'stage',
      label: 'Etapa',
      type: 'select',
      options: ['novo', 'contato iniciado', 'interessado', 'aguardando resposta', 'convertido', 'perdido'],
    },
    { key: 'owner', label: 'Responsavel', type: 'text' },
    { key: 'next_contact_at', label: 'Proximo contato', type: 'date' },
    { key: 'notes', label: 'Observacoes', type: 'textarea' },
  ],
  services: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'category', label: 'Categoria', type: 'text' },
    { key: 'duration_min', label: 'Duracao min', type: 'number' },
    { key: 'price', label: 'Valor', type: 'number' },
    { key: 'description', label: 'Descricao', type: 'textarea' },
    { key: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  professionals: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    { key: 'phone', label: 'Telefone', type: 'text' },
    { key: 'cpf', label: 'CPF', type: 'text' },
    { key: 'birth_date', label: 'Data de Nascimento', type: 'date' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'address', label: 'Endereco', type: 'text' },
    { key: 'notes', label: 'Observacoes', type: 'textarea' },
    { key: 'specialties', label: 'Especialidades', type: 'text' },
    { key: 'work_start', label: 'Inicio jornada', type: 'time' },
    { key: 'work_end', label: 'Fim jornada', type: 'time' },
    { key: 'base_commission', label: 'Comissao base (%)', type: 'number' },
    { key: 'active', label: 'Ativo', type: 'checkbox' },
  ],
  finance: [
    { key: 'client_name', label: 'Cliente', type: 'text', required: true },
    { key: 'service_name', label: 'Servico', type: 'text' },
    { key: 'amount', label: 'Valor', type: 'number', required: true },
    { key: 'payment_method', label: 'Metodo', type: 'select', options: ['pix', 'dinheiro', 'debito', 'credito'] },
    { key: 'status', label: 'Status', type: 'select', options: ['pendente', 'pago', 'parcial', 'cancelado', 'estornado'] },
    { key: 'due_date', label: 'Vencimento', type: 'date' },
  ],
  reviews: [
    { key: 'client_name', label: 'Cliente', type: 'text', required: true },
    { key: 'professional_name', label: 'Profissional', type: 'text' },
    { key: 'score', label: 'Nota (1-5)', type: 'number', required: true },
    { key: 'comment', label: 'Comentario', type: 'textarea' },
  ],
  tasks: [
    { key: 'title', label: 'Titulo', type: 'text', required: true },
    { key: 'owner', label: 'Responsavel', type: 'text' },
    { key: 'due_date', label: 'Prazo', type: 'date' },
    { key: 'priority', label: 'Prioridade', type: 'select', options: ['baixa', 'media', 'alta'] },
    { key: 'status', label: 'Status', type: 'select', options: ['pendente', 'concluida'] },
    { key: 'related_client', label: 'Cliente', type: 'text' },
    { key: 'notes', label: 'Observacoes', type: 'textarea' },
  ],
  automations: [
    { key: 'name', label: 'Nome', type: 'text', required: true },
    {
      key: 'trigger_type',
      label: 'Gatilho',
      type: 'select',
      options: ['novo_agendamento', 'confirmacao', 'cancelamento', 'reagendamento', 'no_show', 'pagamento'],
    },
    { key: 'message_template', label: 'Mensagem', type: 'textarea' },
    { key: 'active', label: 'Ativo', type: 'checkbox' },
  ],
};

export const INITIAL_ENTITY_ROWS: Record<WorkbenchEntity, Record<string, unknown>[]> = {
  availability: [],
  clients: [],
  leads: [],
  services: [],
  professionals: [],
  finance: [],
  reviews: [],
  tasks: [],
  automations: [],
};
