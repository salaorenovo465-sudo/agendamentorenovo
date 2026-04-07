import type { WorkbenchEntity, WorkbenchOverview } from './types';

export type TabId =
  | 'dashboard'
  | 'agenda'
  | 'disponibilidade'
  | 'clientes'
  | 'whatsapp'
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

export const getTodayDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const formatDateBR = (date: string): string => {
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

export const defaultOverview: WorkbenchOverview = {
  date: getTodayDate(),
  bookingStats: { total: 0, pending: 0, confirmed: 0, rejected: 0 },
  leads: { total: 0, byStage: {} },
  tasks: { total: 0, pending: 0, done: 0 },
  finance: { expected: 0, received: 0, pending: 0 },
};

export const DEFAULT_TENANT_SLUG = (import.meta.env.VITE_DEFAULT_TENANT || 'renovo').toLowerCase();

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
    { key: 'cpf', label: 'CPF', type: 'text' },
    { key: 'birth_date', label: 'Data de Nascimento', type: 'date' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'address', label: 'Endereco', type: 'text' },
    { key: 'specialties', label: 'Especialidades', type: 'text' },
    { key: 'work_start', label: 'Inicio jornada', type: 'time' },
    { key: 'work_end', label: 'Fim jornada', type: 'time' },
    { key: 'commission', label: 'Comissao (%)', type: 'number' },
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
