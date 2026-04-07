import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  FileCheck,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Stethoscope,
  UserCircle2,
  Users,
  X,
  XCircle,
  Phone,
  Mail,
  AlertTriangle,
  MapPin,
  Percent,
  Save,
  User,
  Scissors,
  Palette,
  Heart,
  Eye,
  Flower2,
  Trash2,
  Zap,
  Menu,
} from 'lucide-react';

import {
  ADMIN_AUTH_ERROR_EVENT,
  ADMIN_KEY_STORAGE,
  ADMIN_TENANT_STORAGE,
  completeAdminBooking,
  confirmAdminBooking,
  createAdminTenant,
  createWorkbenchEntityForAdmin,
  deleteAdminBooking,
  deleteWorkbenchEntityForAdmin,
  getAdminSettings,
  getWorkbenchOverviewForAdmin,
  listAdminTenants,
  listAdminBookings,
  listWorkbenchEntityForAdmin,
  rejectAdminBooking,
  rescheduleAdminBooking,
  saveAdminSettings,
  updateAdminTenant,
  updateWorkbenchEntityForAdmin,
} from './api';
import { ActivityTimeline, AnalyticsPanel, MostProfitableService, OccupancyBar, StatusPieChart, WeeklyCalendar, exportBookingsCSV } from './AdminFeatures';
import { toast, ToastContainer, RejectModal, useKeyboardShortcuts, triggerConfetti } from './AdminHelpers';
import ClientDetailPanel from './ClientDetailPanel';
import PaymentConfirmationTab from './PaymentConfirmationTab';
import WhatsAppWorkspace from './WhatsAppWorkspace';
import type { AdminBooking, AdminSettings, AdminTenant, WorkbenchEntity, WorkbenchOverview } from './types';
import { services as publicServicesOriginal } from '../data/services';

type TabId =
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

type FieldType = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'checkbox';

type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
};

const getTodayDate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateBR = (date: string): string => {
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim()) return Number(value);
  return 0;
};

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
};

const defaultOverview: WorkbenchOverview = {
  date: getTodayDate(),
  bookingStats: { total: 0, pending: 0, confirmed: 0, rejected: 0 },
  leads: { total: 0, byStage: {} },
  tasks: { total: 0, pending: 0, done: 0 },
  finance: { expected: 0, received: 0, pending: 0 },
};

const DEFAULT_TENANT_SLUG = (import.meta.env.VITE_DEFAULT_TENANT || 'renovo').toLowerCase();

const normalizeTenantSlug = (value: string): string => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '-');
  return normalized.replace(/[^a-z0-9-]/g, '');
};

const ENTITY_BY_TAB: Partial<Record<TabId, WorkbenchEntity>> = {
  disponibilidade: 'availability',
  clientes: 'clients',
  servicos: 'services',
  profissionais: 'professionals',
  avaliacoes: 'reviews',
  tarefas: 'tasks',
};

const ENTITY_FIELDS: Record<WorkbenchEntity, FieldConfig[]> = {
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

const INITIAL_ENTITY_ROWS: Record<WorkbenchEntity, Record<string, unknown>[]> = {
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

function FormField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const baseClass = 'admin-input';

  if (field.type === 'textarea') {
    return <textarea className={baseClass} rows={3} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)} />;
  }

  if (field.type === 'select') {
    return (
      <select className={baseClass} value={toStringValue(value)} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecione</option>
        {(field.options || []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }

  const htmlType = field.type === 'number' ? 'number' : field.type;

  return (
    <input
      className={baseClass}
      type={htmlType}
      value={toStringValue(value)}
      onChange={(event) => onChange(field.type === 'number' ? Number(event.target.value || 0) : event.target.value)}
    />
  );
}

function CrudTab({
  title,
  fields,
  rows,
  loading,
  onCreate,
  onUpdate,
  onDelete,
  rowActions,
}: {
  title: string;
  fields: FieldConfig[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: number, payload: Record<string, unknown>) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  rowActions?: (row: Record<string, unknown>) => ReactNode;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<Record<string, unknown>>({});

  const resetDraft = () => {
    setDraft({});
  };

  const handleCreate = async () => {
    await onCreate(draft);
    resetDraft();
  };

  const openEdit = (row: Record<string, unknown>) => {
    const id = Number(row.id || 0);
    if (!id) return;
    setEditingId(id);
    setEditingDraft(row);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await onUpdate(editingId, editingDraft);
    setEditingId(null);
    setEditingDraft({});
  };

  return (
    <div className="space-y-4">
      <div className="admin-analytics-card">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 12 }}>Novo registro — {title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              {field.type !== 'checkbox' && <label className="text-xs font-medium text-neutral-600">{field.label}</label>}
              <FormField
                field={field}
                value={draft[field.key]}
                onChange={(value) => setDraft((current) => ({ ...current, [field.key]: value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={() => void handleCreate()} className="admin-btn-success" style={{ padding: '8px 16px' }}>
            Salvar
          </button>
          <button onClick={resetDraft} className="admin-btn-outline" style={{ padding: '8px 16px' }}>
            Limpar
          </button>
        </div>
      </div>

      <div className="admin-analytics-card">
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 12 }}>Registros</h3>
        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p>
        ) : rows.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum registro encontrado.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const id = Number(row.id || 0);
              const isEditing = editingId === id;

              return (
                <div key={id} className="admin-booking-card" style={{ padding: 14 }}>
                  {!isEditing ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {fields.map((field) => (
                          <div key={field.key}>
                            <p className="text-[11px] font-semibold uppercase text-neutral-500">{field.label}</p>
                            <p className="text-sm text-neutral-800">{toStringValue(row[field.key]) || '-'}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <button onClick={() => openEdit(row)} className="admin-btn-outline">
                          Editar
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm('Deseja remover este registro?')) {
                              void onDelete(id);
                            }
                          }}
                          className="admin-btn-danger"
                        >
                          Excluir
                        </button>
                        {rowActions ? rowActions(row) : null}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        {fields.map((field) => (
                          <div key={field.key} className="space-y-1">
                            {field.type !== 'checkbox' && <label className="text-xs font-medium text-neutral-600">{field.label}</label>}
                            <FormField
                              field={field}
                              value={editingDraft[field.key]}
                              onChange={(value) => setEditingDraft((current) => ({ ...current, [field.key]: value }))}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => void handleSaveEdit()} className="admin-btn-success" style={{ padding: '8px 16px' }}>
                          Salvar alteracoes
                        </button>
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditingDraft({});
                          }}
                          className="admin-btn-outline" style={{ padding: '8px 16px' }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const [dateFilter, setDateFilter] = useState(getTodayDate());
  const [dateFilterEnd, setDateFilterEnd] = useState(getTodayDate());
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [rescheduleMap, setRescheduleMap] = useState<Record<number, { date: string; time: string }>>({});
  const [rejectModal, setRejectModal] = useState<{ open: boolean; booking: AdminBooking | null }>({ open: false, booking: null });

  const [overview, setOverview] = useState<WorkbenchOverview>(defaultOverview);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const [entityRows, setEntityRows] = useState<Record<WorkbenchEntity, Record<string, unknown>[]>>(INITIAL_ENTITY_ROWS);
  const [entityLoading, setEntityLoading] = useState<Record<WorkbenchEntity, boolean>>({
    availability: false,
    clients: false,
    leads: false,
    services: false,
    professionals: false,
    finance: false,
    reviews: false,
    tasks: false,
    automations: false,
  });

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Record<string, unknown> | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewProf, setShowNewProf] = useState(false);
  const [selectedProf, setSelectedProf] = useState<Record<string, unknown> | null>(null);
  const [editingProf, setEditingProf] = useState<Record<string, unknown>>({});
  const [showNewRule, setShowNewRule] = useState(false);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'geral' | 'colaboradores'>('geral');
  const [localServices, setLocalServices] = useState(() => publicServicesOriginal.map((cat) => ({ ...cat, items: cat.items.map((item) => ({ ...item })) })));
  const [editingService, setEditingService] = useState<{ catIdx: number; itemIdx: number; name: string; price: string; desc: string; priceType: 'fixed' | 'from' | 'consult'; priceValue: string } | null>(null);

  const [settings, setSettings] = useState<AdminSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [activeTenant, setActiveTenant] = useState(() => sessionStorage.getItem(ADMIN_TENANT_STORAGE) || DEFAULT_TENANT_SLUG);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);

  const navItems = useMemo(
    () => [
      { id: 'dashboard' as TabId, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'agenda' as TabId, label: 'Agenda', icon: Calendar },
      { id: 'whatsapp' as TabId, label: 'WhatsApp', icon: MessageSquare },
      { id: 'clientes' as TabId, label: 'Clientes', icon: Users },
      { id: 'servicos' as TabId, label: 'Servicos', icon: Sparkles },
      { id: 'profissionais' as TabId, label: 'Colaboradores', icon: UserCircle2 },
      { id: 'tarefas' as TabId, label: 'Tarefas', icon: Bell },
      { id: 'disponibilidade' as TabId, label: 'Disponibilidade', icon: Clock },
      { id: 'analytics' as TabId, label: 'Analytics', icon: BarChart3 },
      { id: 'pagamentos' as TabId, label: 'Pagamentos', icon: CreditCard },
      { id: 'avaliacoes' as TabId, label: 'Avaliacoes', icon: FileCheck },
      { id: 'configuracoes' as TabId, label: 'Configuracoes', icon: Settings2 },
    ],
    [],
  );

  const loadBookings = async () => {
    if (!adminKey) return;
    setBookingsLoading(true);
    setError('');
    try {
      const rows = await listAdminBookings(dateFilter, adminKey, dateFilterEnd !== dateFilter ? dateFilterEnd : undefined);
      setBookings(rows);
      setRescheduleMap((current) => {
        const next = { ...current };
        rows.forEach((row) => {
          if (!next[row.id]) {
            next[row.id] = { date: row.date, time: row.time };
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar agenda.');
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadOverview = async () => {
    if (!adminKey) return;
    setOverviewLoading(true);
    try {
      const data = await getWorkbenchOverviewForAdmin(dateFilter, adminKey);
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard.');
      setOverview(defaultOverview);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadEntity = async (entity: WorkbenchEntity) => {
    if (!adminKey) return;
    setEntityLoading((current) => ({ ...current, [entity]: true }));
    try {
      const rows = await listWorkbenchEntityForAdmin(entity, adminKey);
      setEntityRows((current) => ({ ...current, [entity]: rows }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Erro ao carregar ${entity}.`);
      setEntityRows((current) => ({ ...current, [entity]: [] }));
    } finally {
      setEntityLoading((current) => ({ ...current, [entity]: false }));
    }
  };

  const loadTenants = async (): Promise<AdminTenant[]> => {
    if (!adminKey) return [];

    try {
      const rows = await listAdminTenants(adminKey);
      setTenants(rows);

      if (rows.length === 0) {
        return [];
      }

      const normalizedActive = normalizeTenantSlug(activeTenant) || DEFAULT_TENANT_SLUG;
      const exists = rows.some((tenant) => tenant.slug === normalizedActive);
      if (!exists) {
        const fallback = rows[0]?.slug || DEFAULT_TENANT_SLUG;
        setActiveTenant(fallback);
        sessionStorage.setItem(ADMIN_TENANT_STORAGE, fallback);
      }

      return rows;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar empresas.');
      setTenants([]);
      return [];
    }
  };

  const loadSettings = async () => {
    if (!adminKey) return;
    try {
      const data = await getAdminSettings(adminKey, activeTenant);
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configuracoes.');
      setSettings({});
    }
  };

  const refreshAll = useCallback(() => {
    void loadBookings();
    void loadOverview();
  }, [adminKey, activeTenant, dateFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeyboardShortcuts(useMemo(() => ({
    refresh: refreshAll,
  }), [refreshAll]));

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const onAuthError = (event: Event) => {
      const customEvent = event as CustomEvent<{ message?: string }>;
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      sessionStorage.removeItem(ADMIN_TENANT_STORAGE);
      setAdminKey('');
      setAdminKeyInput('');
      setActiveTenant(DEFAULT_TENANT_SLUG);
      setTenants([]);
      setSettings({});
      setEntityRows(INITIAL_ENTITY_ROWS);
      setBookings([]);
      setError(customEvent.detail?.message || 'Sessao administrativa expirada. Informe a chave novamente.');
    };

    window.addEventListener(ADMIN_AUTH_ERROR_EVENT, onAuthError as EventListener);
    return () => {
      window.removeEventListener(ADMIN_AUTH_ERROR_EVENT, onAuthError as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!adminKey) return;
    void loadTenants();
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    void loadBookings();
    void loadOverview();
  }, [adminKey, dateFilter, dateFilterEnd]);

  useEffect(() => {
    if (!adminKey) return;
    const entity = ENTITY_BY_TAB[activeTab];
    if (entity) {
      void loadEntity(entity);
    }
  }, [activeTab, adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    void loadSettings();
  }, [adminKey, activeTenant]);

  useEffect(() => {
    if (!activeTenant) {
      return;
    }

    sessionStorage.setItem(ADMIN_TENANT_STORAGE, activeTenant);
  }, [activeTenant]);

  const handleLogin = () => {
    const key = adminKeyInput.trim();
    if (!key) {
      setError('Informe a chave administrativa.');
      return;
    }

    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    setAdminKey(key);
    setError('');
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    sessionStorage.removeItem(ADMIN_TENANT_STORAGE);
    setAdminKey('');
    setAdminKeyInput('');
    setActiveTenant(DEFAULT_TENANT_SLUG);
    setTenants([]);
    setSettings({});
    setEntityRows(INITIAL_ENTITY_ROWS);
    setBookings([]);
  };

  const withAgendaRefresh = async (callback: () => Promise<void>) => {
    await callback();
    await loadBookings();
    await loadOverview();
  };

  const handleConfirmBooking = async (booking: AdminBooking) => {
    if (!adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await confirmAdminBooking(booking.id, adminKey);
      });
      toast.success('Agendamento confirmado!');
      triggerConfetti();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar agendamento.');
      toast.error('Erro ao confirmar agendamento.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCompleteBooking = async (booking: AdminBooking) => {
    if (!adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await completeAdminBooking(booking.id, adminKey);
      });
      toast.success('Serviço finalizado!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao finalizar agendamento.');
      toast.error('Erro ao finalizar.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRejectBooking = async (booking: AdminBooking) => {
    if (!adminKey) return;
    setRejectModal({ open: true, booking });
  };

  const handleConfirmReject = async (reason: string) => {
    const booking = rejectModal.booking;
    setRejectModal({ open: false, booking: null });
    if (!booking || !adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await rejectAdminBooking(booking.id, reason, adminKey);
      });
      toast.info('Agendamento rejeitado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar agendamento.');
      toast.error('Erro ao rejeitar agendamento.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleDeleteBooking = async (booking: AdminBooking) => {
    if (!adminKey || !window.confirm(`Excluir permanentemente o agendamento de ${booking.name}? Esta ação não pode ser desfeita.`)) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await deleteAdminBooking(booking.id, adminKey);
      });
      toast.success('Agendamento excluído.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir agendamento.');
      toast.error('Erro ao excluir.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleRescheduleBooking = async (booking: AdminBooking) => {
    if (!adminKey) return;
    const schedule = rescheduleMap[booking.id] || { date: booking.date, time: booking.time };

    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await rescheduleAdminBooking(booking.id, schedule.date, schedule.time, adminKey);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remarcar agendamento.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCreateEntity = async (entity: WorkbenchEntity, payload: Record<string, unknown>) => {
    if (!adminKey) return;
    await createWorkbenchEntityForAdmin(entity, payload, adminKey);
    await loadEntity(entity);
    if (entity === 'finance' || entity === 'tasks' || entity === 'leads') {
      await loadOverview();
    }
  };

  const handleUpdateEntity = async (entity: WorkbenchEntity, id: number, payload: Record<string, unknown>) => {
    if (!adminKey) return;
    await updateWorkbenchEntityForAdmin(entity, id, payload, adminKey);
    await loadEntity(entity);
    if (entity === 'finance' || entity === 'tasks' || entity === 'leads') {
      await loadOverview();
    }
  };

  const handleDeleteEntity = async (entity: WorkbenchEntity, id: number) => {
    if (!adminKey) return;
    await deleteWorkbenchEntityForAdmin(entity, id, adminKey);
    await loadEntity(entity);
    if (entity === 'finance' || entity === 'tasks' || entity === 'leads') {
      await loadOverview();
    }
  };

  const handleSaveSettings = async () => {
    if (!adminKey) return;
    setSavingSettings(true);
    setError('');
    try {
      const saved = await saveAdminSettings(settings, adminKey, activeTenant);
      setSettings(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar configuracoes.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateTenant = async () => {
    if (!adminKey) return;

    const slug = normalizeTenantSlug(newTenantSlug);
    const name = newTenantName.trim();

    if (!slug || !name) {
      setError('Preencha nome e slug da empresa para criar o tenant.');
      return;
    }

    setSavingTenant(true);
    setError('');
    try {
      const created = await createAdminTenant({ slug, name, active: true }, adminKey);
      setNewTenantName('');
      setNewTenantSlug('');
      setTenants((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setActiveTenant(created.slug);
      const tenantSettings = await getAdminSettings(adminKey, created.slug);
      setSettings(tenantSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar empresa.');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleToggleTenantActive = async (tenant: AdminTenant) => {
    if (!adminKey) return;

    try {
      const updated = await updateAdminTenant(tenant.slug, { active: !tenant.active }, adminKey);
      setTenants((current) => current.map((item) => (item.slug === tenant.slug ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar empresa.');
    }
  };

  const stageSummary = useMemo(
    () => Object.entries(overview.leads.byStage).sort((a, b) => Number(b[1]) - Number(a[1])),
    [overview.leads.byStage],
  );

  const activeTenantName = useMemo(() => {
    const fromList = tenants.find((tenant) => tenant.slug === activeTenant)?.name;
    return fromList || toStringValue(settings.companyName) || 'GlowSystem';
  }, [activeTenant, settings.companyName, tenants]);

  if (!adminKey) {
    return (
      <div className="admin-login-bg">
        <div className="admin-orb admin-orb-1" />
        <div className="admin-orb admin-orb-2" />
        <div className="admin-orb admin-orb-3" />
        <div className="admin-login-card">
          <div className="admin-login-accent" />
          <div style={{ padding: '36px 32px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
              <div className="admin-login-icon-ring">
                <Stethoscope style={{ width: 28, height: 28, color: '#d4af37' }} />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.03em' }}>Estúdio Renovo</h1>
                <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', margin: '2px 0 0', fontWeight: 500 }}>Painel administrativo</p>
              </div>
            </div>
            <label className="admin-label">Chave administrativa</label>
            <input
              type="password"
              value={adminKeyInput}
              onChange={(event) => setAdminKeyInput(event.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="admin-input"
              placeholder="Digite sua chave de acesso"
            />
            <button onClick={handleLogin} className="admin-btn-primary" style={{ width: '100%', marginTop: 20, padding: '12px 20px' }}>
              Entrar no painel
            </button>
            {error && <p style={{ marginTop: 14, fontSize: 13, color: '#fb7185', fontWeight: 500 }}>{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <div className={`admin-sidebar-overlay${sidebarOpen ? ' admin-sidebar-overlay-visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`admin-sidebar${sidebarOpen ? ' admin-sidebar-open' : ''}`} style={{ width: 260 }}>
        <div className="admin-sidebar-brand">
          <div className="admin-brand-icon">
            <Stethoscope style={{ width: 22, height: 22, color: 'var(--admin-gold, #d4af37)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--admin-gold, #d4af37)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '0.04em' }}>Estúdio Renovo</p>
            <p style={{ fontSize: 10, color: 'rgba(212,175,55,0.5)', margin: 0, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Premium Beauty</p>
          </div>
        </div>

        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }} className="admin-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                className={`admin-nav-item${active ? ' active' : ''}`}
              >
                <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span style={{ fontSize: 14.5, fontWeight: active ? 700 : 500, letterSpacing: '0.01em' }}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: '1px solid var(--admin-border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => {
              void loadBookings();
              void loadOverview();
              const entity = ENTITY_BY_TAB[activeTab];
              if (entity) {
                void loadEntity(entity);
              }
            }}
            className="admin-btn-outline"
            style={{ width: '100%', padding: '9px 14px', justifyContent: 'center' }}
          >
            <RefreshCw style={{ width: 14, height: 14 }} /> Atualizar
          </button>
          <button onClick={handleLogout} className="admin-btn-danger" style={{ width: '100%', padding: '9px 14px', justifyContent: 'center' }}>
            <LogOut style={{ width: 14, height: 14 }} /> Sair
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <div className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="admin-hamburger" onClick={() => setSidebarOpen(true)}>
              <Menu style={{ width: 24, height: 24 }} />
            </button>
            <div>
            <h1 style={{ fontSize: 19, fontWeight: 700, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>{navItems.find((item) => item.id === activeTab)?.label}</h1>
            <p style={{ fontSize: 12, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>Estúdio Renovo — Gestão Premium</p>
          </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <select
              value={activeTenant}
              onChange={(event) => setActiveTenant(event.target.value)}
              className="admin-input-sm"
            >
              {tenants.map((tenant) => (
                <option key={tenant.slug} value={tenant.slug}>
                  {tenant.name}
                </option>
              ))}
              {tenants.length === 0 && <option value={activeTenant}>{activeTenant}</option>}
            </select>
            {(activeTab === 'dashboard' || activeTab === 'agenda' || activeTab === 'analytics') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', fontWeight: 600 }}>De</span>
                <input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); if (e.target.value > dateFilterEnd) setDateFilterEnd(e.target.value); }} className="admin-input-sm" />
                <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Até</span>
                <input type="date" value={dateFilterEnd} onChange={(e) => { if (e.target.value >= dateFilter) setDateFilterEnd(e.target.value); }} className="admin-input-sm" />
              </div>
            )}
          </div>
        </div>

        <div className="admin-content">
          {error && <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--admin-radius-sm)', background: 'rgba(251,113,133,0.08)', border: '1px solid rgba(251,113,133,0.2)', color: '#fb7185', fontSize: 13, fontWeight: 500 }}>{error}</div>}

          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #3a0a1e, #4e1028)' }}><Calendar style={{ width: 20, height: 20, color: '#d4af37' }} /></div>
                  <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Agendamentos</p><p style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-accent)', marginTop: 2 }}>{overview.bookingStats.total}</p></div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #d97706, #f59e0b)' }}><Clock style={{ width: 20, height: 20, color: '#fff' }} /></div>
                  <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Pendentes</p><p style={{ fontSize: 24, fontWeight: 800, color: '#d97706', marginTop: 2 }}>{overview.bookingStats.pending}</p></div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}><CheckCircle2 style={{ width: 20, height: 20, color: '#fff' }} /></div>
                  <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Confirmados</p><p style={{ fontSize: 24, fontWeight: 800, color: '#059669', marginTop: 2 }}>{overview.bookingStats.confirmed}</p></div>
                </div>
                <div className="admin-stat-card">
                  <div className="admin-stat-icon" style={{ background: 'linear-gradient(135deg, #3a0a1e, #220610)' }}><Users style={{ width: 20, height: 20, color: '#d4af37' }} /></div>
                  <div><p style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--admin-text-muted)' }}>Leads totais</p><p style={{ fontSize: 24, fontWeight: 800, color: 'var(--admin-accent)', marginTop: 2 }}>{overview.leads.total}</p></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <div className="admin-analytics-card">
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Financeiro do dia ({formatDateBR(dateFilter)})</h3>
                  <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12 }}>
                    <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Previsto</p><p style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', marginTop: 2 }}>R$ {overview.finance.expected.toFixed(2)}</p></div>
                    <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Recebido</p><p style={{ fontSize: 16, fontWeight: 700, color: '#059669', marginTop: 2 }}>R$ {overview.finance.received.toFixed(2)}</p></div>
                    <div><p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>Pendente</p><p style={{ fontSize: 16, fontWeight: 700, color: '#d97706', marginTop: 2 }}>R$ {overview.finance.pending.toFixed(2)}</p></div>
                  </div>
                </div>

                <div className="admin-analytics-card">
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Leads por etapa</h3>
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {stageSummary.length === 0 ? (
                      <p style={{ fontSize: 12, color: 'var(--admin-text-muted)' }}>Sem leads cadastrados.</p>
                    ) : (
                      stageSummary.map(([stage, count]) => (
                        <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ textTransform: 'capitalize', color: 'var(--admin-text)' }}>{stage}</span>
                          <span style={{ fontWeight: 700, color: 'var(--admin-accent)', background: 'var(--admin-accent-glow)', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-analytics-card">
                <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Proximos agendamentos</h3>
                {bookingsLoading ? (
                  <p style={{ marginTop: 10, fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando agenda...</p>
                ) : bookings.length === 0 ? (
                  <p style={{ marginTop: 10, fontSize: 13, color: 'var(--admin-text-muted)' }}>Sem agendamentos para esta data.</p>
                ) : (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bookings.slice(0, 8).map((booking) => (
                      <div key={booking.id} className="admin-booking-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="admin-avatar">{booking.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)' }}>{booking.name}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>{booking.service} • {booking.time}</p>
                          </div>
                        </div>
                        <span style={{
                          padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                          background: booking.status === 'confirmed' ? 'rgba(52,211,153,0.1)' : booking.status === 'rejected' ? 'rgba(251,113,133,0.1)' : 'rgba(251,191,36,0.1)',
                          color: booking.status === 'confirmed' ? '#059669' : booking.status === 'rejected' ? '#e11d48' : '#d97706',
                          border: `1px solid ${booking.status === 'confirmed' ? 'rgba(52,211,153,0.2)' : booking.status === 'rejected' ? 'rgba(251,113,133,0.2)' : 'rgba(251,191,36,0.2)'}`,
                        }}>{booking.status === 'confirmed' ? 'Confirmado' : booking.status === 'rejected' ? 'Rejeitado' : 'Pendente'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ AGENDA — Kanban por status ══ */}
          {activeTab === 'agenda' && (() => {
            const now = new Date();
            const isOverdue = (b: AdminBooking) => {
              if (b.status === 'completed' || b.status === 'rejected') return false;
              const bookingDate = new Date(`${b.date}T${b.time}`);
              return bookingDate < now;
            };
            const pending = bookings.filter((b) => b.status === 'pending' && !isOverdue(b));
            const confirmed = bookings.filter((b) => b.status === 'confirmed' && !isOverdue(b));
            const overdue = bookings.filter((b) => isOverdue(b));
            const completed = bookings.filter((b) => b.status === 'completed');
            const rejected = bookings.filter((b) => b.status === 'rejected');
            const renderBookingCard = (booking: AdminBooking, showOverdueAlert?: boolean) => {
              const schedule = rescheduleMap[booking.id] || { date: booking.date, time: booking.time };
              const busy = busyBookingId === booking.id;
              return (
                <div key={booking.id} className={`admin-pipeline-card ${showOverdueAlert ? 'admin-pipeline-card-pending' : `admin-pipeline-card-${booking.status}`}`} style={showOverdueAlert ? { borderLeft: '4px solid #dc2626', background: 'rgba(220,38,38,0.03)' } : undefined}>
                  {showOverdueAlert && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, padding: '3px 8px', borderRadius: 6, background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.15)', fontSize: 10, fontWeight: 700, color: '#dc2626' }}>
                      <AlertTriangle style={{ width: 11, height: 11 }} /> Atrasado — sem finalização
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div className="admin-avatar">{booking.name.charAt(0).toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{booking.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>{booking.service} • {formatDateBR(booking.date)} {booking.time}</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '0 0 8px' }}>{booking.phone} • {booking.servicePrice || 'Sob consulta'}</p>
                  {booking.status !== 'completed' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      <input type="date" className="admin-input-sm" style={{ fontSize: 10, padding: '2px 6px', width: 110 }} value={schedule.date} onChange={(e) => setRescheduleMap((c) => ({ ...c, [booking.id]: { ...schedule, date: e.target.value } }))} />
                      <input type="time" className="admin-input-sm" style={{ fontSize: 10, padding: '2px 6px', width: 80 }} value={schedule.time} onChange={(e) => setRescheduleMap((c) => ({ ...c, [booking.id]: { ...schedule, time: e.target.value } }))} />
                    </div>
                  )}
                  <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {booking.status !== 'completed' && <button disabled={busy} onClick={() => void handleRescheduleBooking(booking)} className="admin-btn-outline" style={{ fontSize: 11, padding: '6px 10px' }}>Remarcar</button>}
                    {booking.status !== 'confirmed' && booking.status !== 'completed' && <button disabled={busy} onClick={() => void handleConfirmBooking(booking)} className="admin-btn-success" style={{ fontSize: 11, padding: '6px 10px' }}><CheckCircle2 style={{ width: 12, height: 12 }} /> Confirmar</button>}
                    {(booking.status === 'confirmed' || isOverdue(booking)) && <button disabled={busy} onClick={() => void handleCompleteBooking(booking)} className="admin-btn-primary" style={{ fontSize: 11, padding: '6px 10px' }}><Sparkles style={{ width: 12, height: 12 }} /> Finalizar</button>}
                    {booking.status !== 'rejected' && booking.status !== 'completed' && <button disabled={busy} onClick={() => void handleRejectBooking(booking)} className="admin-btn-danger" style={{ fontSize: 11, padding: '6px 10px' }}><XCircle style={{ width: 12, height: 12 }} /> Rejeitar</button>}
                    <button disabled={busy} onClick={() => void handleDeleteBooking(booking)} className="admin-btn-outline" style={{ fontSize: 11, padding: '6px 10px', color: '#dc2626', borderColor: '#dc2626' }}><Trash2 style={{ width: 12, height: 12 }} /> Excluir</button>
                  </div>
                </div>
              );
            };
            const dateLabel = dateFilter === dateFilterEnd ? formatDateBR(dateFilter) : `${formatDateBR(dateFilter)} — ${formatDateBR(dateFilterEnd)}`;
            return (
              <div>
                {overdue.length > 0 && (
                  <div style={{ marginBottom: 16, padding: '12px 16px', borderRadius: 'var(--admin-radius-sm)', background: 'rgba(220,38,38,0.06)', border: '1.5px solid rgba(220,38,38,0.15)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#dc2626' }}>{overdue.length} agendamento(s) atrasado(s) — passaram da data/hora e não foram finalizados nem rejeitados</span>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Agenda — {dateLabel}</h3>
                  {bookings.length > 0 && (
                    <button onClick={() => exportBookingsCSV(bookings)} className="admin-btn-outline" style={{ fontSize: 11, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 4 }}><Download className="w-3 h-3" /> CSV</button>
                  )}
                </div>
                {bookingsLoading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
                  <div className="admin-pipeline" style={{ gridTemplateColumns: overdue.length > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
                    {overdue.length > 0 && (
                      <div className="admin-pipeline-col" style={{ borderTop: '3px solid #dc2626' }}>
                        <div className="admin-pipeline-col-header" style={{ color: '#dc2626' }}>Atrasados <span className="admin-pipeline-count" style={{ background: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>{overdue.length}</span></div>
                        <div className="admin-pipeline-cards">{overdue.map((b) => renderBookingCard(b, true))}</div>
                      </div>
                    )}
                    <div className="admin-pipeline-col admin-pipeline-pending">
                      <div className="admin-pipeline-col-header">Pendentes <span className="admin-pipeline-count">{pending.length}</span></div>
                      <div className="admin-pipeline-cards">{pending.map((b) => renderBookingCard(b))}</div>
                    </div>
                    <div className="admin-pipeline-col admin-pipeline-confirmed">
                      <div className="admin-pipeline-col-header">Confirmados <span className="admin-pipeline-count">{confirmed.length}</span></div>
                      <div className="admin-pipeline-cards">{confirmed.map((b) => renderBookingCard(b))}</div>
                    </div>
                    <div className="admin-pipeline-col" style={{ borderTop: '3px solid #6366f1', background: 'linear-gradient(135deg, rgba(99,102,241,0.04), transparent)' }}>
                      <div className="admin-pipeline-col-header" style={{ color: '#6366f1' }}>Finalizados <span className="admin-pipeline-count" style={{ background: 'rgba(99,102,241,0.08)', color: '#6366f1' }}>{completed.length}</span></div>
                      <div className="admin-pipeline-cards">{completed.map((b) => renderBookingCard(b))}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ SERVIÇOS — Catálogo premium por categoria ══ */}
          {activeTab === 'servicos' && (() => {
            const categoryIconMap: Record<string, typeof Sparkles> = {
              'Transformação & Alinhamento': Sparkles,
              'Tratamentos Premium': Heart,
              'Corte & Finalização': Scissors,
              'Coloração & Mechas': Palette,
              'Unhas & SPA': Flower2,
              'Sobrancelhas & Cílios': Eye,
              'Depilação': Zap,
            };
            const parsePriceToEdit = (price: string): { priceType: 'fixed' | 'from' | 'consult'; priceValue: string } => {
              if (price.toLowerCase().includes('sob consulta')) return { priceType: 'consult', priceValue: '' };
              if (price.toLowerCase().includes('a partir de')) {
                const match = price.match(/[\d.,]+/);
                return { priceType: 'from', priceValue: match ? match[0].replace('.', '').replace(',', '.') : '' };
              }
              const match = price.match(/[\d.,]+/);
              return { priceType: 'fixed', priceValue: match ? match[0].replace('.', '').replace(',', '.') : '' };
            };
            const formatPriceFromEdit = (priceType: string, priceValue: string): string => {
              if (priceType === 'consult') return 'Sob consulta';
              const num = parseFloat(priceValue);
              if (isNaN(num)) return priceType === 'from' ? 'a partir de R$ 0,00' : 'R$ 0,00';
              const formatted = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              return priceType === 'from' ? `a partir de R$ ${formatted}` : `R$ ${formatted}`;
            };
            return (
            <div className="space-y-6">
              {localServices.map((cat, catIdx) => {
                const IconComp = categoryIconMap[cat.category] || Sparkles;
                return (
                <div key={cat.category} className="admin-analytics-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 18px', borderBottom: '2px solid var(--admin-accent)', paddingBottom: 10 }}>
                    <IconComp style={{ width: 20, height: 20, color: 'var(--admin-accent)' }} />
                    <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cat.category}</h3>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--admin-text-muted)', background: 'var(--admin-surface-2)', padding: '2px 8px', borderRadius: 10 }}>{cat.items.length} {cat.items.length === 1 ? 'serviço' : 'serviços'}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                    {cat.items.map((svc, itemIdx) => {
                      const parsed = parsePriceToEdit(svc.price);
                      return (
                      <div key={svc.name} onClick={() => setEditingService({ catIdx, itemIdx, name: svc.name, price: svc.price, desc: svc.desc, ...parsed })} style={{ padding: 20, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1.5px solid var(--admin-border)', transition: 'all 0.25s ease', cursor: 'pointer', position: 'relative' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--admin-accent)'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(155,123,78,0.12)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--admin-border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                          <div style={{ width: 48, height: 48, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-accent-glow)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <IconComp style={{ width: 22, height: 22, color: 'var(--admin-accent)' }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--admin-text)', margin: 0, lineHeight: 1.3 }}>{svc.name}</p>
                            <p style={{ fontSize: 12.5, color: 'var(--admin-text-muted)', margin: '5px 0 0', lineHeight: 1.5 }}>{svc.desc}</p>
                          </div>
                        </div>
                        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'var(--admin-bg)', display: 'inline-block' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--admin-accent)' }}>{svc.price}</span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
                );
              })}
              {editingService && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(4px)' }} onClick={() => setEditingService(null)}>
                  <div style={{ background: 'var(--admin-surface)', border: '2px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 28, width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                      <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--admin-accent)', margin: 0 }}>Editar Serviço</h3>
                      <button onClick={() => setEditingService(null)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div>
                        <label className="admin-label">Nome do serviço</label>
                        <input className="admin-input" value={editingService.name} onChange={(e) => setEditingService((c) => c ? { ...c, name: e.target.value } : null)} />
                      </div>
                      <div>
                        <label className="admin-label">Tipo de preço</label>
                        <select className="admin-input" value={editingService.priceType} onChange={(e) => setEditingService((c) => c ? { ...c, priceType: e.target.value as 'fixed' | 'from' | 'consult' } : null)} style={{ cursor: 'pointer' }}>
                          <option value="fixed">Valor fixo</option>
                          <option value="from">A partir de</option>
                          <option value="consult">Sob consulta</option>
                        </select>
                      </div>
                      {editingService.priceType !== 'consult' && (
                        <div>
                          <label className="admin-label">Valor (R$)</label>
                          <input className="admin-input" type="number" step="0.01" min="0" value={editingService.priceValue} onChange={(e) => setEditingService((c) => c ? { ...c, priceValue: e.target.value } : null)} placeholder="Ex: 199.99" />
                        </div>
                      )}
                      <div>
                        <label className="admin-label">Descrição</label>
                        <textarea className="admin-input" rows={3} value={editingService.desc} onChange={(e) => setEditingService((c) => c ? { ...c, desc: e.target.value } : null)} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 22 }}>
                      <button
                        onClick={() => {
                          if (!editingService) return;
                          const finalPrice = formatPriceFromEdit(editingService.priceType, editingService.priceValue);
                          setLocalServices((prev) => {
                            const next = prev.map((cat, ci) => ci === editingService.catIdx ? { ...cat, items: cat.items.map((item, ii) => ii === editingService.itemIdx ? { ...item, name: editingService.name, price: finalPrice, desc: editingService.desc } : item) } : cat);
                            return next;
                          });
                          setEditingService(null);
                        }}
                        className="admin-btn-primary" style={{ padding: '10px 24px', fontSize: 13.5 }}
                      >Salvar alterações</button>
                      <button onClick={() => setEditingService(null)} className="admin-btn-outline" style={{ padding: '10px 24px', fontSize: 13 }}>Cancelar</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          {/* ══ CLIENTES — Kanban premium ══ */}
          {activeTab === 'clientes' && (() => {
            const clients = entityRows.clients;
            const clientsByStatus: Record<string, Record<string, unknown>[]> = { novo: [], ativo: [], VIP: [], outros: [] };
            clients.forEach((c) => {
              const s = toStringValue(c.status).toLowerCase();
              if (s === 'novo') clientsByStatus.novo.push(c);
              else if (s === 'ativo' || s === 'recorrente') clientsByStatus.ativo.push(c);
              else if (s === 'vip') clientsByStatus.VIP.push(c);
              else clientsByStatus.outros.push(c);
            });
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Clientes ({clients.length})</h3>
                  <button onClick={() => setSelectedClient({ _isNew: true })} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Cadastrar Cliente</button>
                </div>
                {entityLoading.clients ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                    {clients.map((client) => (
                      <div key={toNumber(client.id)} onClick={() => setSelectedClient(client)} className="admin-pipeline-card" style={{ cursor: 'pointer', borderLeft: `3px solid ${toStringValue(client.status) === 'VIP' ? '#9b7b4e' : toStringValue(client.status) === 'ativo' ? '#10b981' : '#6366f1'}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div className="admin-avatar">{toStringValue(client.name).charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toStringValue(client.name)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}><Phone style={{ width: 10, height: 10 }} /> {toStringValue(client.phone)}</p>
                          </div>
                        </div>
                        <span style={{ marginTop: 6, display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700, background: 'var(--admin-accent-glow)', color: 'var(--admin-accent)' }}>{toStringValue(client.status) || 'novo'}</span>
                      </div>
                    ))}
                  </div>
                )}
                {selectedClient && (
                  selectedClient._isNew ? (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedClient(null)}>
                      <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Cadastrar Cliente</h3>
                          <button onClick={() => setSelectedClient(null)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
                        </div>
                        <CrudTab
                          title="Cliente"
                          fields={ENTITY_FIELDS.clients}
                          rows={[]}
                          loading={false}
                          onCreate={async (payload) => { await handleCreateEntity('clients', payload); setSelectedClient(null); }}
                          onUpdate={async () => {}}
                          onDelete={async () => {}}
                        />
                      </div>
                    </div>
                  ) : (
                    <ClientDetailPanel client={selectedClient} adminKey={adminKey} onClose={() => setSelectedClient(null)} onUpdated={() => { void loadEntity('clients'); }} />
                  )
                )}
              </div>
            );
          })()}

          {/* ══ TAREFAS — Kanban premium ══ */}
          {activeTab === 'tarefas' && (() => {
            const tasks = entityRows.tasks;
            const pending = tasks.filter((t) => toStringValue(t.status).toLowerCase() !== 'concluida');
            const done = tasks.filter((t) => toStringValue(t.status).toLowerCase() === 'concluida');
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Tarefas ({tasks.length})</h3>
                  <button onClick={() => setShowNewTask(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Nova Tarefa</button>
                </div>
                {showNewTask && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowNewTask(false)}>
                    <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Nova Tarefa</h3>
                        <button onClick={() => setShowNewTask(false)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
                      </div>
                      <CrudTab
                        title="Tarefa"
                        fields={ENTITY_FIELDS.tasks}
                        rows={[]}
                        loading={false}
                        onCreate={async (payload) => { await handleCreateEntity('tasks', { ...payload, status: payload.status || 'pendente' }); setShowNewTask(false); }}
                        onUpdate={async () => {}}
                        onDelete={async () => {}}
                      />
                    </div>
                  </div>
                )}
                {entityLoading.tasks ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
                  <div className="admin-pipeline" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="admin-pipeline-col admin-pipeline-pending">
                      <div className="admin-pipeline-col-header">Pendentes <span className="admin-pipeline-count">{pending.length}</span></div>
                      <div className="admin-pipeline-cards">
                        {pending.map((task) => (
                          <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(task.title)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(task.owner) && `${toStringValue(task.owner)} • `}{toStringValue(task.due_date) && formatDateBR(toStringValue(task.due_date))}</p>
                            {toStringValue(task.priority) && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: toStringValue(task.priority) === 'alta' ? 'rgba(239,68,68,0.1)' : toStringValue(task.priority) === 'media' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)', color: toStringValue(task.priority) === 'alta' ? '#ef4444' : toStringValue(task.priority) === 'media' ? '#f59e0b' : '#6366f1' }}>{toStringValue(task.priority)}</span>}
                            <div style={{ marginTop: 8 }}>
                              <button onClick={() => void handleUpdateEntity('tasks', toNumber(task.id), { status: 'concluida' })} className="admin-btn-success" style={{ fontSize: 10, padding: '3px 8px' }}><CheckCircle2 style={{ width: 11, height: 11 }} /> Concluir</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="admin-pipeline-col admin-pipeline-confirmed">
                      <div className="admin-pipeline-col-header">Concluidas <span className="admin-pipeline-count">{done.length}</span></div>
                      <div className="admin-pipeline-cards">
                        {done.map((task) => (
                          <div key={toNumber(task.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0, textDecoration: 'line-through', opacity: 0.7 }}>{toStringValue(task.title)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(task.owner)}</p>
                            <button onClick={() => void handleUpdateEntity('tasks', toNumber(task.id), { status: 'pendente' })} className="admin-btn-outline" style={{ fontSize: 10, padding: '3px 8px', marginTop: 4 }}>Reabrir</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ COLABORADORES — Kanban premium ══ */}
          {activeTab === 'profissionais' && (() => {
            const profs = entityRows.professionals;
            const active = profs.filter((p) => p.active !== false);
            const inactive = profs.filter((p) => p.active === false);
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Colaboradores ({profs.length})</h3>
                  <button onClick={() => setShowNewProf(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Cadastrar Colaborador</button>
                </div>
                {showNewProf && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setShowNewProf(false)}>
                    <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Cadastrar Colaborador</h3>
                        <button onClick={() => setShowNewProf(false)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
                      </div>
                      <CrudTab
                        title="Colaborador"
                        fields={ENTITY_FIELDS.professionals}
                        rows={[]}
                        loading={false}
                        onCreate={async (payload) => { await handleCreateEntity('professionals', { ...payload, active: payload.active ?? true }); setShowNewProf(false); }}
                        onUpdate={async () => {}}
                        onDelete={async () => {}}
                      />
                    </div>
                  </div>
                )}
                {entityLoading.professionals ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                    {profs.map((prof) => (
                      <div key={toNumber(prof.id)} className="admin-pipeline-card" style={{ borderLeft: `3px solid ${prof.active !== false ? '#10b981' : '#94a3b8'}`, cursor: 'pointer' }} onClick={() => { setSelectedProf(prof); setEditingProf({ ...prof }); }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          <div className="admin-avatar">{toStringValue(prof.name).charAt(0).toUpperCase()}</div>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(prof.name)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-accent)', margin: 0, fontWeight: 500 }}>{toStringValue(prof.specialties) || 'Geral'}</p>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: prof.active !== false ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)', color: prof.active !== false ? '#10b981' : '#94a3b8' }}>{prof.active !== false ? 'Ativo' : 'Inativo'}</span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--admin-text-muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {toStringValue(prof.email) && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail style={{ width: 10, height: 10 }} /> {toStringValue(prof.email)}</span>}
                          {toStringValue(prof.cpf) && <span>CPF: {toStringValue(prof.cpf)}</span>}
                          {toNumber(prof.commission) > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Percent style={{ width: 10, height: 10 }} /> Comissão: {toNumber(prof.commission)}%</span>}
                          {(toStringValue(prof.work_start) || toStringValue(prof.work_end)) && <span>Jornada: {toStringValue(prof.work_start)} - {toStringValue(prof.work_end)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Painel de edição do colaborador */}
                {selectedProf && (
                  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedProf(null)}>
                    <div style={{ background: 'var(--admin-surface)', border: '1px solid var(--admin-border)', borderRadius: 'var(--admin-radius-md)', padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="admin-avatar" style={{ width: 44, height: 44, fontSize: 18 }}>{toStringValue(editingProf.name).charAt(0).toUpperCase()}</div>
                          <div>
                            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(editingProf.name) || 'Colaborador'}</h3>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>Editar informações</p>
                          </div>
                        </div>
                        <button onClick={() => setSelectedProf(null)} className="admin-btn-outline" style={{ padding: 4 }}><X style={{ width: 16, height: 16 }} /></button>
                      </div>
                      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr' }}>
                        <div><label className="admin-label">Nome</label><input className="admin-input" value={toStringValue(editingProf.name)} onChange={(e) => setEditingProf((c) => ({ ...c, name: e.target.value }))} /></div>
                        <div><label className="admin-label">CPF</label><input className="admin-input" value={toStringValue(editingProf.cpf)} onChange={(e) => setEditingProf((c) => ({ ...c, cpf: e.target.value }))} /></div>
                        <div><label className="admin-label">Data de Nascimento</label><input type="date" className="admin-input" value={toStringValue(editingProf.birth_date)} onChange={(e) => setEditingProf((c) => ({ ...c, birth_date: e.target.value }))} /></div>
                        <div><label className="admin-label">Email</label><input className="admin-input" value={toStringValue(editingProf.email)} onChange={(e) => setEditingProf((c) => ({ ...c, email: e.target.value }))} /></div>
                        <div style={{ gridColumn: '1 / -1' }}><label className="admin-label">Endereço</label><input className="admin-input" value={toStringValue(editingProf.address)} onChange={(e) => setEditingProf((c) => ({ ...c, address: e.target.value }))} /></div>
                        <div><label className="admin-label">Especialidades</label><input className="admin-input" value={toStringValue(editingProf.specialties)} onChange={(e) => setEditingProf((c) => ({ ...c, specialties: e.target.value }))} /></div>
                        <div>
                          <label className="admin-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Percent style={{ width: 12, height: 12, color: 'var(--admin-accent)' }} /> Comissão (%)</label>
                          <input type="number" min="0" max="100" className="admin-input" value={toStringValue(editingProf.commission)} onChange={(e) => setEditingProf((c) => ({ ...c, commission: Number(e.target.value || 0) }))} placeholder="Ex: 30" />
                        </div>
                        <div><label className="admin-label">Início jornada</label><input type="time" className="admin-input" value={toStringValue(editingProf.work_start)} onChange={(e) => setEditingProf((c) => ({ ...c, work_start: e.target.value }))} /></div>
                        <div><label className="admin-label">Fim jornada</label><input type="time" className="admin-input" value={toStringValue(editingProf.work_end)} onChange={(e) => setEditingProf((c) => ({ ...c, work_end: e.target.value }))} /></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label className="admin-label" style={{ margin: 0 }}>Ativo</label>
                          <input type="checkbox" checked={editingProf.active !== false} onChange={(e) => setEditingProf((c) => ({ ...c, active: e.target.checked }))} />
                        </div>
                      </div>
                      <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                        <button
                          onClick={async () => {
                            const id = toNumber(selectedProf.id);
                            if (!id) return;
                            await handleUpdateEntity('professionals', id, editingProf);
                            setSelectedProf(null);
                          }}
                          className="admin-btn-success" style={{ padding: '10px 20px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
                        ><Save style={{ width: 14, height: 14 }} /> Salvar alterações</button>
                        <button
                          onClick={() => {
                            if (window.confirm('Deseja remover este colaborador?')) {
                              const id = toNumber(selectedProf.id);
                              if (id) { void handleDeleteEntity('professionals', id); setSelectedProf(null); }
                            }
                          }}
                          className="admin-btn-danger" style={{ padding: '10px 20px', fontSize: 13 }}
                        >Excluir</button>
                        <button onClick={() => setSelectedProf(null)} className="admin-btn-outline" style={{ padding: '10px 20px', fontSize: 13 }}>Cancelar</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ DISPONIBILIDADE — Kanban folgas/férias/faltas ══ */}
          {activeTab === 'disponibilidade' && (() => {
            const rules = entityRows.availability;
            const folgas = rules.filter((r) => toStringValue(r.type) === 'folga');
            const horarios = rules.filter((r) => toStringValue(r.type) === 'horario' || toStringValue(r.type) === 'pausa');
            const bloqueios = rules.filter((r) => toStringValue(r.type) === 'feriado' || toStringValue(r.type) === 'bloqueio');
            const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Disponibilidade</h3>
                  <button onClick={() => setShowNewRule(true)} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Nova Regra</button>
                </div>
                {showNewRule && (
                  <div className="admin-analytics-card" style={{ marginBottom: 16 }}>
                    <CrudTab title="Regra" fields={ENTITY_FIELDS.availability} rows={[]} loading={false} onCreate={async (p) => { await handleCreateEntity('availability', p); setShowNewRule(false); }} onUpdate={async () => {}} onDelete={async () => {}} />
                  </div>
                )}
                {entityLoading.availability ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
                  <div className="admin-pipeline">
                    <div className="admin-pipeline-col admin-pipeline-confirmed">
                      <div className="admin-pipeline-col-header">Horarios <span className="admin-pipeline-count">{horarios.length}</span></div>
                      <div className="admin-pipeline-cards">
                        {horarios.map((r) => (
                          <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-confirmed">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{weekdays[toNumber(r.weekday)] || ''} • {toStringValue(r.start_time)} - {toStringValue(r.end_time)}</p>
                            <button onClick={() => { if (window.confirm('Remover?')) void handleDeleteEntity('availability', toNumber(r.id)); }} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="admin-pipeline-col admin-pipeline-pending">
                      <div className="admin-pipeline-col-header">Folgas <span className="admin-pipeline-count">{folgas.length}</span></div>
                      <div className="admin-pipeline-cards">
                        {folgas.map((r) => (
                          <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-pending">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{weekdays[toNumber(r.weekday)] || 'Todos'}</p>
                            <button onClick={() => { if (window.confirm('Remover?')) void handleDeleteEntity('availability', toNumber(r.id)); }} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="admin-pipeline-col admin-pipeline-rejected">
                      <div className="admin-pipeline-col-header">Feriados/Bloqueios <span className="admin-pipeline-count">{bloqueios.length}</span></div>
                      <div className="admin-pipeline-cards">
                        {bloqueios.map((r) => (
                          <div key={toNumber(r.id)} className="admin-pipeline-card admin-pipeline-card-rejected">
                            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{toStringValue(r.title)}</p>
                            <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0' }}>{toStringValue(r.type)} • {weekdays[toNumber(r.weekday)] || ''}</p>
                            <button onClick={() => { if (window.confirm('Remover?')) void handleDeleteEntity('availability', toNumber(r.id)); }} className="admin-btn-danger" style={{ fontSize: 10, padding: '2px 6px', marginTop: 4 }}>Remover</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ AVALIACOES — CrudTab padrão ══ */}
          {activeTab === 'avaliacoes' && (
            <CrudTab
              title="Avaliacoes"
              fields={ENTITY_FIELDS.reviews}
              rows={entityRows.reviews}
              loading={entityLoading.reviews}
              onCreate={(payload) => handleCreateEntity('reviews', payload)}
              onUpdate={(id, payload) => handleUpdateEntity('reviews', id, payload)}
              onDelete={(id) => handleDeleteEntity('reviews', id)}
            />
          )}

          {activeTab === 'pagamentos' && <PaymentConfirmationTab adminKey={adminKey} />}

          {activeTab === 'whatsapp' && <WhatsAppWorkspace adminKey={adminKey} settings={settings} tenantSlug={activeTenant} />}

          {/* ══ ANALYTICS — com sub-aba Colaboradores ══ */}
          {activeTab === 'analytics' && (() => {
            const profs = entityRows.professionals;
            return (
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <button onClick={() => setAnalyticsSubTab('geral')} className={analyticsSubTab === 'geral' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Visao Geral</button>
                  <button onClick={() => setAnalyticsSubTab('colaboradores')} className={analyticsSubTab === 'colaboradores' ? 'admin-btn-primary' : 'admin-btn-outline'} style={{ padding: '6px 16px', fontSize: 12 }}>Por Colaborador</button>
                </div>
                {analyticsSubTab === 'geral' ? (
                  <div className="space-y-4">
                    <AnalyticsPanel bookings={bookings} />
                    <div className="grid gap-4 lg:grid-cols-2">
                      <WeeklyCalendar bookings={bookings} />
                      <ActivityTimeline bookings={bookings} />
                    </div>
                    <div className="grid gap-4 lg:grid-cols-3">
                      <StatusPieChart bookings={bookings} />
                      <OccupancyBar bookings={bookings} />
                      <MostProfitableService bookings={bookings} />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profs.length === 0 ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Nenhum colaborador cadastrado.</p> : profs.map((prof) => {
                      const profName = toStringValue(prof.name).toLowerCase();
                      const profBookings = bookings.filter((b) => b.service?.toLowerCase().includes(profName) || b.name?.toLowerCase().includes(profName));
                      const totalValue = profBookings.reduce((sum, b) => {
                        const price = parseFloat((b.servicePrice || '0').replace(/[^\d.,]/g, '').replace(',', '.'));
                        return sum + (Number.isFinite(price) ? price : 0);
                      }, 0);
                      return (
                        <div key={toNumber(prof.id)} className="admin-analytics-card">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="admin-avatar">{toStringValue(prof.name).charAt(0).toUpperCase()}</div>
                              <div>
                                <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>{toStringValue(prof.name)}</p>
                                <p style={{ fontSize: 11, color: 'var(--admin-accent)', margin: 0 }}>{toStringValue(prof.specialties) || 'Geral'}</p>
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: 0 }}>Servicos: {profBookings.length}</p>
                              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--admin-accent)', margin: 0 }}>R$ {totalValue.toFixed(2)}</p>
                            </div>
                          </div>
                          {profBookings.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {profBookings.slice(0, 10).map((b) => (
                                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', background: 'var(--admin-surface-2)', borderRadius: 'var(--admin-radius-xs)', border: '1px solid var(--admin-border)' }}>
                                  <span style={{ color: 'var(--admin-text)' }}>{b.service} — {b.name}</span>
                                  <span style={{ color: 'var(--admin-accent)', fontWeight: 600 }}>{b.servicePrice || '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {activeTab === 'configuracoes' && (
            <div className="admin-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--admin-text)', margin: 0 }}>Configuracoes gerais</h3>

              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                <div style={{ padding: 14, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                  <p className="admin-label">Tenant ativo</p>
                  <p style={{ fontSize: 13, color: 'var(--admin-text)', margin: '4px 0 0' }}><span style={{ fontWeight: 600 }}>Slug:</span> {activeTenant}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>Ajustes desta tela serão salvos apenas para esta empresa.</p>
                </div>

                <div style={{ padding: 14, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                  <p className="admin-label">Criar nova empresa</p>
                  <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr auto' }}>
                    <input className="admin-input-sm" value={newTenantName} onChange={(event) => setNewTenantName(event.target.value)} placeholder="Nome da empresa" />
                    <input className="admin-input-sm" value={newTenantSlug} onChange={(event) => setNewTenantSlug(normalizeTenantSlug(event.target.value))} placeholder="slug-da-empresa" />
                    <button disabled={savingTenant} onClick={() => void handleCreateTenant()} className="admin-btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>
                      {savingTenant ? 'Criando...' : 'Criar'}
                    </button>
                  </div>
                </div>
              </div>

              {tenants.length > 0 && (
                <div style={{ padding: 14, borderRadius: 'var(--admin-radius-sm)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                  <p className="admin-label">Empresas cadastradas</p>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {tenants.map((tenant) => (
                      <div key={tenant.slug} className="admin-booking-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{tenant.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>{tenant.slug}</p>
                        </div>
                        <button onClick={() => void handleToggleTenantActive(tenant)} className={tenant.active ? 'admin-btn-success' : 'admin-btn-outline'} style={{ padding: '4px 12px', fontSize: 11 }}>
                          {tenant.active ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
                <div><label className="admin-label">Nome da empresa</label><input className="admin-input" value={toStringValue(settings.companyName)} onChange={(event) => setSettings((current) => ({ ...current, companyName: event.target.value }))} /></div>
                <div><label className="admin-label">Telefone da empresa</label><input className="admin-input" value={toStringValue(settings.companyPhone)} onChange={(event) => setSettings((current) => ({ ...current, companyPhone: event.target.value }))} /></div>
                <div><label className="admin-label">Fuso horario</label><input className="admin-input" value={toStringValue(settings.timezone)} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} placeholder="America/Bahia" /></div>
                <div><label className="admin-label">Politica de cancelamento</label><input className="admin-input" value={toStringValue(settings.cancelPolicy)} onChange={(event) => setSettings((current) => ({ ...current, cancelPolicy: event.target.value }))} /></div>
                <div><label className="admin-label">Inicio atendimento WhatsApp</label><input type="time" className="admin-input" value={toStringValue(settings.whatsappOpenTime)} onChange={(event) => setSettings((current) => ({ ...current, whatsappOpenTime: event.target.value }))} /></div>
                <div><label className="admin-label">Fim atendimento WhatsApp</label><input type="time" className="admin-input" value={toStringValue(settings.whatsappCloseTime)} onChange={(event) => setSettings((current) => ({ ...current, whatsappCloseTime: event.target.value }))} /></div>
              </div>

              <div style={{ padding: '10px 14px', borderRadius: 'var(--admin-radius-xs)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', fontSize: 12, color: 'var(--admin-text-muted)' }}>
                As integrações sensíveis (Evolution e Chatwoot) são gerenciadas somente no backend e não aparecem nesta tela.
              </div>

              <button disabled={savingSettings} onClick={() => void handleSaveSettings()} className="admin-btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
                {savingSettings ? 'Salvando...' : 'Salvar configuracoes'}
              </button>
            </div>
          )}

          {overviewLoading && activeTab === 'dashboard' && <p style={{ marginTop: 12, fontSize: 13, color: 'var(--admin-text-muted)' }}>Atualizando dashboard...</p>}
        </div>
      </div>
      <ToastContainer />
      <RejectModal
        isOpen={rejectModal.open}
        onClose={() => setRejectModal({ open: false, booking: null })}
        onConfirm={(reason) => void handleConfirmReject(reason)}
      />
    </div>
  );
}
