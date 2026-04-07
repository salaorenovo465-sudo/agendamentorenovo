import { useCallback, useEffect, useMemo, useState } from 'react';
import './admin.css';
import {
  BarChart3,
  Bell,
  Calendar,
  Clock,
  CreditCard,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  RefreshCw,
  Settings2,
  Sparkles,
  Stethoscope,
  UserCircle2,
  Users,
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
  resetFinanceForAdmin,
  updateAdminTenant,
  updateWorkbenchEntityForAdmin,
} from './api';
import { toast, ToastContainer, RejectModal, useKeyboardShortcuts, triggerConfetti } from './AdminHelpers';
import PaymentConfirmationTab from './PaymentConfirmationTab';
import WhatsAppWorkspace from './WhatsAppWorkspace';
import type { AdminBooking, AdminSettings, AdminTenant, WorkbenchEntity, WorkbenchOverview } from './types';
import { services as publicServicesOriginal } from '../data/services';

import {
  type TabId,
  getTodayDate,
  toStringValue,
  defaultOverview,
  DEFAULT_TENANT_SLUG,
  normalizeTenantSlug,
  ENTITY_BY_TAB,
  ENTITY_FIELDS,
  INITIAL_ENTITY_ROWS,
} from './AdminUtils';
import { CrudTab } from './CrudTab';

import { DashboardTab } from './tabs/DashboardTab';
import { AgendaTab } from './tabs/AgendaTab';
import { ServicosTab } from './tabs/ServicosTab';
import { ClientesTab } from './tabs/ClientesTab';
import { TarefasTab } from './tabs/TarefasTab';
import { ProfissionaisTab } from './tabs/ProfissionaisTab';
import { DisponibilidadeTab } from './tabs/DisponibilidadeTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { ConfiguracoesTab } from './tabs/ConfiguracoesTab';

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

  const handleResetFinance = async (password: string, date?: string): Promise<boolean> => {
    if (!adminKey || password !== adminKey) return false;
    try {
      await resetFinanceForAdmin(adminKey, date);
      toast.success('Financeiro zerado com sucesso!');
      void loadOverview();
      return true;
    } catch {
      return false;
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
            <DashboardTab
              overview={overview}
              bookings={bookings}
              bookingsLoading={bookingsLoading}
              overviewLoading={overviewLoading}
              dateFilter={dateFilter}
              stageSummary={stageSummary}
              onResetFinance={handleResetFinance}
            />
          )}

          {activeTab === 'agenda' && (
            <AgendaTab
              bookings={bookings}
              bookingsLoading={bookingsLoading}
              dateFilter={dateFilter}
              dateFilterEnd={dateFilterEnd}
              busyBookingId={busyBookingId}
              rescheduleMap={rescheduleMap}
              setRescheduleMap={setRescheduleMap}
              onConfirm={handleConfirmBooking}
              onComplete={handleCompleteBooking}
              onReject={handleRejectBooking}
              onDelete={handleDeleteBooking}
              onReschedule={handleRescheduleBooking}
            />
          )}

          {activeTab === 'servicos' && (
            <ServicosTab
              localServices={localServices}
              setLocalServices={setLocalServices}
              editingService={editingService}
              setEditingService={setEditingService}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesTab
              clients={entityRows.clients}
              loading={entityLoading.clients}
              selectedClient={selectedClient}
              setSelectedClient={setSelectedClient}
              adminKey={adminKey}
              onCreateEntity={handleCreateEntity}
              onLoadEntity={(entity) => { void loadEntity(entity); }}
            />
          )}

          {activeTab === 'tarefas' && (
            <TarefasTab
              tasks={entityRows.tasks}
              loading={entityLoading.tasks}
              showNewTask={showNewTask}
              setShowNewTask={setShowNewTask}
              onCreateEntity={handleCreateEntity}
              onUpdateEntity={handleUpdateEntity}
            />
          )}

          {activeTab === 'profissionais' && (
            <ProfissionaisTab
              profs={entityRows.professionals}
              loading={entityLoading.professionals}
              showNewProf={showNewProf}
              setShowNewProf={setShowNewProf}
              selectedProf={selectedProf}
              setSelectedProf={setSelectedProf}
              editingProf={editingProf}
              setEditingProf={setEditingProf}
              onCreateEntity={handleCreateEntity}
              onUpdateEntity={handleUpdateEntity}
              onDeleteEntity={handleDeleteEntity}
            />
          )}

          {activeTab === 'disponibilidade' && (
            <DisponibilidadeTab
              rules={entityRows.availability}
              loading={entityLoading.availability}
              showNewRule={showNewRule}
              setShowNewRule={setShowNewRule}
              onCreateEntity={handleCreateEntity}
              onDeleteEntity={handleDeleteEntity}
            />
          )}

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

          {activeTab === 'analytics' && (
            <AnalyticsTab
              bookings={bookings}
              profs={entityRows.professionals}
              analyticsSubTab={analyticsSubTab}
              setAnalyticsSubTab={setAnalyticsSubTab}
            />
          )}

          {activeTab === 'configuracoes' && (
            <ConfiguracoesTab
              activeTenant={activeTenant}
              settings={settings}
              setSettings={setSettings}
              savingSettings={savingSettings}
              onSaveSettings={() => void handleSaveSettings()}
              tenants={tenants}
              newTenantName={newTenantName}
              setNewTenantName={setNewTenantName}
              newTenantSlug={newTenantSlug}
              setNewTenantSlug={setNewTenantSlug}
              savingTenant={savingTenant}
              onCreateTenant={() => void handleCreateTenant()}
              onToggleTenantActive={(tenant) => void handleToggleTenantActive(tenant)}
            />
          )}
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
