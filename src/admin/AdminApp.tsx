import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { motion } from 'motion/react';
import './admin.css';
import {
  ArrowRight,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Database,
  Eye,
  EyeOff,
  FileCheck,
  LayoutDashboard,
  Loader2,
  Lock,
  LogOut,
  Menu,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserCircle2,
  Users,
  Wifi,
} from 'lucide-react';

import {
  ADMIN_AUTH_ERROR_EVENT,
  ADMIN_KEY_STORAGE,
  ADMIN_TENANT_STORAGE,
  API_BASE,
  assignProfessionalToAdminBooking,
  completeAdminBooking,
  createAdminBooking,
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
  resetAdminBookingsHistory,
  resetAnalyticsHistoryForAdmin,
  rescheduleAdminBooking,
  saveAdminSettings,
  resetFinanceForAdmin,
  startAdminInboxRealtimeStream,
  updateAdminTenant,
  updateMasterPasswordForAdmin,
  updateWorkbenchEntityForAdmin,
  verifyMasterPasswordForAdmin,
} from './api';
import { toast, ToastContainer, RejectModal, useKeyboardShortcuts, triggerConfetti, playAdminAlertSound, primeAdminAudio } from './AdminHelpers';
import PaymentConfirmationTab from './PaymentConfirmationTab';
import type { AdminBooking, AdminCreateBookingPayload, AdminSettings, AdminTenant, WorkbenchEntity, WorkbenchOverview } from './types';
import { services as publicServicesOriginal } from '../data/services';

import {
  type TabId,
  formatDateBR,
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
import { TarefasTab } from './tabs/TarefasTab';
import { ProfissionaisTab } from './tabs/ProfissionaisTab';
import { DisponibilidadeTab } from './tabs/DisponibilidadeTab';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import { ConfiguracoesTab } from './tabs/ConfiguracoesTab';
import type { ServiceCatalogCategory, ServiceCatalogItem } from './collaboratorUtils';

const ClientesModule = lazy(() => import('./clientes/ClientesModule'));

const LOGIN_ATTEMPT_STORAGE = 'renovo_admin_login_attempts';
const LOGIN_LOCK_UNTIL_STORAGE = 'renovo_admin_login_lock_until';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 60_000;

type LoginSystemStatus = {
  loading: boolean;
  apiOnline: boolean | null;
  evolutionReady: boolean | null;
  storageLabel: string;
};

const readStoredNumber = (key: string): number => {
  if (typeof window === 'undefined') return 0;
  const parsed = Number(window.localStorage.getItem(key) || '0');
  return Number.isFinite(parsed) ? parsed : 0;
};

const cloneServiceCatalog = (catalog: ServiceCatalogCategory[]): ServiceCatalogCategory[] =>
  catalog.map((category) => ({
    ...category,
    items: category.items.map((item) => ({ ...item })),
  }));

const DEFAULT_SERVICE_CATALOG = cloneServiceCatalog(publicServicesOriginal as ServiceCatalogCategory[]);

const normalizeCatalogKey = (value: string): string => value.trim().toLocaleLowerCase('pt-BR');

const parseServiceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const match = value.match(/[\d.,]+/);
    const normalized = (match ? match[0] : value).trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const formatServicePrice = (value: unknown): string => {
  const parsed = parseServiceNumber(value);
  if (parsed === null || parsed <= 0) {
    return 'Sob consulta';
  }

  return parsed.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const buildServicePayloadFromCatalogItem = (
  categoryName: string,
  service: ServiceCatalogItem,
): Record<string, unknown> => ({
  category: categoryName.trim(),
  name: service.name.trim(),
  duration_min: Math.max(5, service.durationMin || 60),
  price: (() => {
    const parsed = parseServiceNumber(service.price);
    return parsed !== null && parsed > 0 ? parsed : 0;
  })(),
  description: (service.desc || '').trim(),
  active: service.active !== false,
});

const buildPersistedServiceCatalog = (rows: Record<string, unknown>[]): ServiceCatalogCategory[] => {
  const catalog: ServiceCatalogCategory[] = [];
  const categoryMap = new Map<string, ServiceCatalogCategory>();

  rows.forEach((row) => {
    const serviceName = toStringValue(row.name).trim();
    if (!serviceName) {
      return;
    }

    const categoryName = toStringValue(row.category).trim() || 'Sem categoria';
    const normalizedCategory = normalizeCatalogKey(categoryName);
    const normalizedService = normalizeCatalogKey(serviceName);

    let category = categoryMap.get(normalizedCategory);
    if (!category) {
      category = { category: categoryName, items: [] };
      categoryMap.set(normalizedCategory, category);
      catalog.push(category);
    }

    const persistedItem: ServiceCatalogItem = {
      id: parseServiceNumber(row.id) ?? undefined,
      name: serviceName,
      price: formatServicePrice(row.price),
      desc: toStringValue(row.description).trim(),
      durationMin: parseServiceNumber(row.duration_min) ?? undefined,
      active: row.active !== false && row.active !== 'false',
      persisted: true,
    };

    const existingIndex = category.items.findIndex((item) => normalizeCatalogKey(item.name) === normalizedService);
    if (existingIndex >= 0) {
      category.items[existingIndex] = {
        ...category.items[existingIndex],
        ...persistedItem,
      };
      return;
    }

    category.items.push(persistedItem);
  });

  return catalog.map((category) => ({
    ...category,
    items: [...category.items].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR')),
  }));
};

export default function AdminApp() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || '');
  const [adminKeyInput, setAdminKeyInput] = useState('');
  const [error, setError] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [showAdminKey, setShowAdminKey] = useState(false);
  const [loginErrorPulse, setLoginErrorPulse] = useState(false);
  const [loginAttemptCount, setLoginAttemptCount] = useState(() => readStoredNumber(LOGIN_ATTEMPT_STORAGE));
  const [loginLockUntil, setLoginLockUntil] = useState(() => readStoredNumber(LOGIN_LOCK_UNTIL_STORAGE));
  const [loginClockTick, setLoginClockTick] = useState(() => Date.now());
  const [loginSystemStatus, setLoginSystemStatus] = useState<LoginSystemStatus>({
    loading: true,
    apiOnline: null,
    evolutionReady: null,
    storageLabel: 'Verificando',
  });
  const [activeTab, setActiveTab] = useState<TabId>('agenda');
  const [unlockedProtectedTabs, setUnlockedProtectedTabs] = useState<Partial<Record<TabId, boolean>>>({});
  const [protectedTabRequest, setProtectedTabRequest] = useState<TabId | null>(null);
  const [protectedTabPassword, setProtectedTabPassword] = useState('');
  const [protectedTabError, setProtectedTabError] = useState('');
  const [protectedTabUnlocking, setProtectedTabUnlocking] = useState(false);

  const [dateFilter, setDateFilter] = useState(getTodayDate());
  const [dateFilterEnd, setDateFilterEnd] = useState(getTodayDate());
  const [dateScope, setDateScope] = useState<'all' | 'range'>('all');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [allBookings, setAllBookings] = useState<AdminBooking[]>([]);
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
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewProf, setShowNewProf] = useState(false);
  const [selectedProf, setSelectedProf] = useState<Record<string, unknown> | null>(null);
  const [editingProf, setEditingProf] = useState<Record<string, unknown>>({});
  const [showNewRule, setShowNewRule] = useState(false);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<'geral' | 'colaboradores'>('geral');
  const [localServices, setLocalServices] = useState<ServiceCatalogCategory[]>(() => cloneServiceCatalog(DEFAULT_SERVICE_CATALOG));

  const [settings, setSettings] = useState<AdminSettings>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [activeTenant, setActiveTenant] = useState(() => sessionStorage.getItem(ADMIN_TENANT_STORAGE) || DEFAULT_TENANT_SLUG);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [savingTenant, setSavingTenant] = useState(false);
  const seenAdminNotificationIdsRef = useRef<Set<string>>(new Set());
  const loginFxRef = useRef<HTMLDivElement | null>(null);
  const adminKeyInputRef = useRef<HTMLInputElement | null>(null);

  const navItems = useMemo(
    () => [
      { id: 'dashboard' as TabId, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'agenda' as TabId, label: 'Agenda', icon: Calendar },
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

  const protectedTabs = useMemo<Partial<Record<TabId, string>>>(() => ({
    dashboard: 'Dashboard',
    analytics: 'Analytics',
    pagamentos: 'Pagamentos',
    profissionais: 'Colaboradores',
    configuracoes: 'Configuracoes',
  }), []);

  const handleLoginPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const target = loginFxRef.current || event.currentTarget;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    const tiltX = ((y - 50) / 50) * -4;
    const tiltY = ((x - 50) / 50) * 5;

    target.style.setProperty('--login-x', `${x.toFixed(2)}%`);
    target.style.setProperty('--login-y', `${y.toFixed(2)}%`);
    target.style.setProperty('--login-tilt-x', `${tiltX.toFixed(2)}deg`);
    target.style.setProperty('--login-tilt-y', `${tiltY.toFixed(2)}deg`);
  }, []);

  const handleLoginPointerLeave = useCallback(() => {
    const target = loginFxRef.current;
    if (!target) return;

    target.style.setProperty('--login-x', '50%');
    target.style.setProperty('--login-y', '42%');
    target.style.setProperty('--login-tilt-x', '0deg');
    target.style.setProperty('--login-tilt-y', '0deg');
  }, []);

  const loginLocked = loginLockUntil > loginClockTick;
  const loginLockSeconds = Math.max(0, Math.ceil((loginLockUntil - loginClockTick) / 1000));
  const loginGreeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia, equipe Renovo.';
    if (hour < 18) return 'Boa tarde, equipe Renovo.';
    return 'Boa noite, equipe Renovo.';
  }, []);

  const triggerLoginErrorPulse = useCallback(() => {
    setLoginErrorPulse(false);
    window.setTimeout(() => setLoginErrorPulse(true), 0);
    window.setTimeout(() => setLoginErrorPulse(false), 680);
  }, []);

  const registerLoginFailure = useCallback((message: string) => {
    const nextAttemptCount = loginAttemptCount + 1;

    if (nextAttemptCount >= LOGIN_MAX_ATTEMPTS) {
      const lockUntil = Date.now() + LOGIN_LOCK_MS;
      setLoginAttemptCount(0);
      setLoginLockUntil(lockUntil);
      window.localStorage.setItem(LOGIN_ATTEMPT_STORAGE, '0');
      window.localStorage.setItem(LOGIN_LOCK_UNTIL_STORAGE, String(lockUntil));
      setError(`Muitas tentativas invalidas. Aguarde ${Math.ceil(LOGIN_LOCK_MS / 1000)} segundos para tentar novamente.`);
    } else {
      setLoginAttemptCount(nextAttemptCount);
      window.localStorage.setItem(LOGIN_ATTEMPT_STORAGE, String(nextAttemptCount));
      const remaining = LOGIN_MAX_ATTEMPTS - nextAttemptCount;
      setError(`${message} Restam ${remaining} tentativa(s) antes do bloqueio temporario.`);
    }

    triggerLoginErrorPulse();
  }, [loginAttemptCount, triggerLoginErrorPulse]);

  const protectedTabLabel = protectedTabRequest ? protectedTabs[protectedTabRequest] || 'Area protegida' : 'Area protegida';
  const dateFilterLabel = dateScope === 'all'
    ? 'Visao geral'
    : dateFilter === dateFilterEnd
      ? formatDateBR(dateFilter)
      : `${formatDateBR(dateFilter)} - ${formatDateBR(dateFilterEnd)}`;
  const defaultAgendaDate = dateScope === 'all' ? getTodayDate() : dateFilter;

  const loadBookings = async () => {
    if (!adminKey) return;
    setBookingsLoading(true);
    setError('');
    try {
      const rows = await listAdminBookings(
        adminKey,
        dateScope === 'all'
          ? { scope: 'all' }
          : { scope: 'range', startDate: dateFilter, endDate: dateFilterEnd },
        activeTenant,
      );
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

  const loadAllBookings = async () => {
    if (!adminKey) return;
    try {
      const rows = await listAdminBookings(adminKey, { scope: 'all' }, activeTenant);
      setAllBookings(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar historico global de agendamentos.');
      setAllBookings([]);
    }
  };

  const loadOverview = async () => {
    if (!adminKey) return;
    setOverviewLoading(true);
    try {
      const data = await getWorkbenchOverviewForAdmin(
        adminKey,
        dateScope === 'all'
          ? { scope: 'all' }
          : { scope: 'range', startDate: dateFilter, endDate: dateFilterEnd },
      );
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
    void loadAllBookings();
    void loadOverview();
  }, [adminKey, activeTenant, dateFilter, dateFilterEnd, dateScope]); // eslint-disable-line react-hooks/exhaustive-deps

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
      setActiveTab('agenda');
      setDateScope('all');
      setTenants([]);
      setSettings({});
      setEntityRows(INITIAL_ENTITY_ROWS);
      setBookings([]);
      setAllBookings([]);
      seenAdminNotificationIdsRef.current = new Set();
      setUnlockedProtectedTabs({});
      setProtectedTabRequest(null);
      setProtectedTabPassword('');
      setProtectedTabError('');
      setProtectedTabUnlocking(false);
      setLoginSubmitting(false);
      triggerLoginErrorPulse();
      setError(customEvent.detail?.message || 'Sessao administrativa expirada. Informe a chave novamente.');
    };

    window.addEventListener(ADMIN_AUTH_ERROR_EVENT, onAuthError as EventListener);
    return () => {
      window.removeEventListener(ADMIN_AUTH_ERROR_EVENT, onAuthError as EventListener);
    };
  }, [triggerLoginErrorPulse]);

  useEffect(() => {
    if (adminKey) return;
    const timer = window.setTimeout(() => {
      adminKeyInputRef.current?.focus();
    }, 180);

    return () => window.clearTimeout(timer);
  }, [adminKey]);

  useEffect(() => {
    if (!loginLocked) return;
    const timer = window.setInterval(() => setLoginClockTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [loginLocked]);

  useEffect(() => {
    if (!loginLocked || loginLockUntil > Date.now()) return;

    setLoginLockUntil(0);
    setLoginAttemptCount(0);
    window.localStorage.removeItem(LOGIN_LOCK_UNTIL_STORAGE);
    window.localStorage.removeItem(LOGIN_ATTEMPT_STORAGE);
    setError('');
  }, [loginClockTick, loginLockUntil, loginLocked]);

  useEffect(() => {
    if (adminKey) return;

    const controller = new AbortController();
    setLoginSystemStatus((current) => ({ ...current, loading: true }));

    void (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/integration-status?tenant=${encodeURIComponent(activeTenant || DEFAULT_TENANT_SLUG)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const payload = await response.json() as {
          whatsappConnected?: boolean;
          evolutionStatus?: string;
          storage?: string;
        };

        setLoginSystemStatus({
          loading: false,
          apiOnline: true,
          evolutionReady: payload.whatsappConnected === true || payload.evolutionStatus === 'ready',
          storageLabel: payload.storage === 'supabase' ? 'Supabase ativo' : payload.storage || 'Storage ativo',
        });
      } catch {
        if (controller.signal.aborted) return;
        setLoginSystemStatus({
          loading: false,
          apiOnline: false,
          evolutionReady: null,
          storageLabel: 'Indisponivel',
        });
      }
    })();

    return () => controller.abort();
  }, [adminKey, activeTenant]);

  useEffect(() => {
    if (!adminKey) return;
    void loadTenants();
    void loadAllBookings();
    void loadEntity('clients');
    void loadEntity('professionals');
    void loadEntity('services');
  }, [adminKey]);

  useEffect(() => {
    const serviceCatalogManaged = settings.serviceCatalogManaged === true || entityRows.services.length > 0;
    setLocalServices(
      serviceCatalogManaged
        ? buildPersistedServiceCatalog(entityRows.services)
        : cloneServiceCatalog(DEFAULT_SERVICE_CATALOG),
    );
  }, [entityRows.services, settings.serviceCatalogManaged]);

  useEffect(() => {
    if (!adminKey) return;
    void loadBookings();
    void loadOverview();
  }, [adminKey, dateFilter, dateFilterEnd, dateScope]);

  useEffect(() => {
    if (!adminKey) return;
    if (activeTab === 'agenda') {
      void loadEntity('clients');
      return;
    }
    const entity = ENTITY_BY_TAB[activeTab];
    if (entity && entity !== 'clients') {
      void loadEntity(entity);
    }
  }, [activeTab, adminKey]);

  useEffect(() => {
    if (!adminKey) return;
    void loadSettings();
  }, [adminKey, activeTenant]);

  useEffect(() => {
    if (!adminKey || typeof window === 'undefined') {
      return;
    }

    const unlockAudio = () => {
      void primeAdminAudio();
    };

    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, [adminKey]);

  useEffect(() => {
    if (!adminKey) {
      return;
    }

    const stop = startAdminInboxRealtimeStream(
      adminKey,
      (event) => {
        if (event.type !== 'admin-notification') {
          return;
        }

        if (event.notification.tenantSlug !== activeTenant) {
          return;
        }

        if (seenAdminNotificationIdsRef.current.has(event.notification.id)) {
          return;
        }

        seenAdminNotificationIdsRef.current.add(event.notification.id);
        toast.info(event.notification.message || 'Novo agendamento recebido pela pagina publica.');
        void playAdminAlertSound();
        void refreshAll();
      },
      (streamError) => {
        console.error('Erro no stream administrativo:', streamError);
      },
    );

    return () => {
      stop();
    };
  }, [adminKey, activeTenant, refreshAll]);

  useEffect(() => {
    if (!activeTenant) {
      return;
    }

    sessionStorage.setItem(ADMIN_TENANT_STORAGE, activeTenant);
  }, [activeTenant]);

  const handleLogin = async () => {
    if (loginSubmitting) {
      return;
    }

    if (loginLocked) {
      setError(`Acesso temporariamente bloqueado. Tente novamente em ${loginLockSeconds} segundo(s).`);
      triggerLoginErrorPulse();
      return;
    }

    const key = adminKeyInput.trim();
    if (!key) {
      setError('Informe a chave administrativa.');
      triggerLoginErrorPulse();
      return;
    }

    setLoginSubmitting(true);
    setError('');

    try {
      const tenantRows = await listAdminTenants(key);
      const normalizedActive = normalizeTenantSlug(activeTenant) || DEFAULT_TENANT_SLUG;
      const tenantExists = tenantRows.some((tenant) => tenant.slug === normalizedActive);
      const nextTenant = tenantExists ? normalizedActive : tenantRows[0]?.slug || DEFAULT_TENANT_SLUG;

      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
      sessionStorage.setItem(ADMIN_TENANT_STORAGE, nextTenant);
      window.localStorage.removeItem(LOGIN_ATTEMPT_STORAGE);
      window.localStorage.removeItem(LOGIN_LOCK_UNTIL_STORAGE);
      setLoginAttemptCount(0);
      setLoginLockUntil(0);
      setTenants(tenantRows);
      setActiveTenant(nextTenant);
      setAdminKey(key);
      setActiveTab('agenda');
      setDateScope('all');
      setUnlockedProtectedTabs({});
      setProtectedTabRequest(null);
      setProtectedTabPassword('');
      setProtectedTabError('');
      setProtectedTabUnlocking(false);
      setError('');
    } catch {
      sessionStorage.removeItem(ADMIN_KEY_STORAGE);
      sessionStorage.removeItem(ADMIN_TENANT_STORAGE);
      setAdminKey('');
      registerLoginFailure('Chave invalida. Confira o acesso administrativo.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    sessionStorage.removeItem(ADMIN_TENANT_STORAGE);
    setAdminKey('');
    setAdminKeyInput('');
    setActiveTenant(DEFAULT_TENANT_SLUG);
    setActiveTab('agenda');
    setDateScope('all');
    setTenants([]);
    setSettings({});
    setEntityRows(INITIAL_ENTITY_ROWS);
    setBookings([]);
    setAllBookings([]);
    seenAdminNotificationIdsRef.current = new Set();
    setUnlockedProtectedTabs({});
    setProtectedTabRequest(null);
    setProtectedTabPassword('');
    setProtectedTabError('');
    setProtectedTabUnlocking(false);
  };

  const handleOpenTab = (tabId: TabId) => {
    if (tabId === activeTab) {
      setSidebarOpen(false);
      return;
    }

    if (protectedTabs[tabId] && !unlockedProtectedTabs[tabId]) {
      setProtectedTabRequest(tabId);
      setProtectedTabPassword('');
      setProtectedTabError('');
      setSidebarOpen(false);
      return;
    }

    setUnlockedProtectedTabs((current) => {
      if (!protectedTabs[activeTab]) {
        return current;
      }

      const next = { ...current };
      delete next[activeTab];
      return next;
    });
    setActiveTab(tabId);
    setSidebarOpen(false);
  };

  const handleUnlockProtectedTab = async () => {
    if (!protectedTabRequest || !adminKey || protectedTabUnlocking) return;

    const tabToOpen = protectedTabRequest;
    const password = protectedTabPassword.trim();
    if (!password) {
      setProtectedTabError('Digite a senha master.');
      return;
    }

    setProtectedTabUnlocking(true);
    setProtectedTabError('');

    try {
      const allowed = await verifyMasterPasswordForAdmin(password, adminKey, activeTenant);
      if (!allowed) {
        setProtectedTabError('Senha master invalida.');
        return;
      }

      setUnlockedProtectedTabs((current) => {
        const next = { ...current };
        if (protectedTabs[activeTab] && activeTab !== tabToOpen) {
          delete next[activeTab];
        }
        next[tabToOpen] = true;
        return next;
      });
      setProtectedTabRequest(null);
      setProtectedTabPassword('');
      setProtectedTabError('');
      setActiveTab(tabToOpen);
      toast.success(`${protectedTabs[tabToOpen] || 'Area'} liberado.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao validar senha master.';
      setProtectedTabError(message);
    } finally {
      setProtectedTabUnlocking(false);
    }
  };

  const closeProtectedTabModal = () => {
    if (protectedTabUnlocking) return;
    setProtectedTabRequest(null);
    setProtectedTabPassword('');
    setProtectedTabError('');
  };

  const withAgendaRefresh = async (callback: () => Promise<void>) => {
    await callback();
    await loadBookings();
    await loadAllBookings();
    await loadOverview();
  };

  const handleConfirmBooking = async (booking: AdminBooking) => {
    if (!adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await confirmAdminBooking(booking.id, adminKey, activeTenant);
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
        await completeAdminBooking(booking.id, adminKey, activeTenant);
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
        await rejectAdminBooking(booking.id, reason, adminKey, activeTenant);
      });
      toast.info('Agendamento rejeitado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar agendamento.');
      toast.error('Erro ao rejeitar agendamento.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleDeleteBooking = async (booking: AdminBooking, masterPassword: string) => {
    if (!adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await deleteAdminBooking(booking.id, adminKey, {
          masterPassword,
          tenantSlug: activeTenant,
        });
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
        await rescheduleAdminBooking(booking.id, schedule.date, schedule.time, adminKey, activeTenant);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remarcar agendamento.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleAssignBookingProfessional = async (booking: AdminBooking, professionalId: number | null) => {
    if (!adminKey) return;
    setBusyBookingId(booking.id);
    setError('');
    try {
      await withAgendaRefresh(async () => {
        await assignProfessionalToAdminBooking(booking.id, professionalId, adminKey, activeTenant);
      });
      toast.success(professionalId ? 'Colaborador vinculado ao agendamento.' : 'Colaborador removido do agendamento.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar colaborador do agendamento.');
      toast.error('Erro ao atualizar colaborador.');
    } finally {
      setBusyBookingId(null);
    }
  };

  const handleCreateAgendaBooking = async (payload: AdminCreateBookingPayload) => {
    if (!adminKey) return;
    setError('');

    try {
      const created = await createAdminBooking(payload, adminKey, activeTenant);
      if (payload.status === 'confirmed') {
        await confirmAdminBooking(created.id, adminKey, activeTenant);
        triggerConfetti();
      }

      await loadAllBookings();

      if (dateScope !== 'all' && (payload.date < dateFilter || payload.date > dateFilterEnd)) {
        setDateFilter(payload.date);
        setDateFilterEnd(payload.date);
      } else {
        await loadBookings();
        await loadOverview();
      }

      toast.success(payload.status === 'confirmed' ? 'Agendamento criado e confirmado.' : 'Agendamento criado na agenda.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar agendamento.';
      setError(message);
      toast.error(message);
      throw err;
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

  const handleDeleteEntity = async (entity: WorkbenchEntity, id: number, masterPassword?: string) => {
    if (!adminKey) return;
    await deleteWorkbenchEntityForAdmin(entity, id, adminKey, {
      masterPassword,
      tenantSlug: activeTenant,
    });
    await loadEntity(entity);
    if (entity === 'finance' || entity === 'tasks' || entity === 'leads') {
      await loadOverview();
    }
  };

  const handleServiceCatalogBootstrap = async (catalog: ServiceCatalogCategory[]) => {
    if (!adminKey) return;

    const existingIds = entityRows.services
      .map((row) => parseServiceNumber(row.id))
      .filter((value): value is number => value !== null);

    for (const id of existingIds) {
      await deleteWorkbenchEntityForAdmin('services', id, adminKey);
    }

    for (const category of catalog) {
      for (const service of category.items) {
        await createWorkbenchEntityForAdmin('services', buildServicePayloadFromCatalogItem(category.category, service), adminKey);
      }
    }

    const savedSettings = await saveAdminSettings(
      { ...settings, serviceCatalogManaged: true },
      adminKey,
      activeTenant,
    );
    setSettings(savedSettings);
    await loadEntity('services');
  };

  const handleVerifyServiceDeletePassword = async (password: string): Promise<boolean> => {
    if (!adminKey) return false;
    return verifyMasterPasswordForAdmin(password, adminKey, activeTenant);
  };

  const handleDeleteService = async (id: number, masterPassword: string) => {
    if (!adminKey) return;
    await deleteWorkbenchEntityForAdmin('services', id, adminKey, {
      masterPassword,
      tenantSlug: activeTenant,
    });
    await loadEntity('services');
  };

  const handleDeleteServiceCategory = async (serviceIds: number[], masterPassword: string) => {
    if (!adminKey) return;

    for (const id of serviceIds) {
      await deleteWorkbenchEntityForAdmin('services', id, adminKey, {
        masterPassword,
        tenantSlug: activeTenant,
      });
    }

    await loadEntity('services');
  };

  const handleResetFinance = async (password: string, date?: string): Promise<boolean> => {
    if (!adminKey) return false;
    try {
      await resetFinanceForAdmin(adminKey, {
        date,
        masterPassword: password,
        tenantSlug: activeTenant,
      });
      toast.success('Financeiro zerado com sucesso!');
      void loadOverview();
      return true;
    } catch {
      return false;
    }
  };

  const handleResetPaymentsHistory = async (masterPassword?: string): Promise<void> => {
    if (!adminKey) return;
    setError('');

    try {
      const result = await resetFinanceForAdmin(adminKey, {
        masterPassword,
        tenantSlug: activeTenant,
      });
      toast.success(`${result.deleted} lancamento(s) financeiro(s) removido(s).`);
      await Promise.all([loadOverview(), loadEntity('finance')]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao limpar o historico de pagamentos.';
      setError(message);
      toast.error(message);
      throw err;
    }
  };

  const handleResetAgendaHistory = async (masterPassword?: string): Promise<void> => {
    if (!adminKey) return;
    setError('');

    try {
      const result = await resetAdminBookingsHistory(adminKey, {
        masterPassword,
        tenantSlug: activeTenant,
      });
      setRescheduleMap({});
      toast.success(
        `${result.deleted} agendamento(s) removido(s). ${result.linkedFinanceDeleted || 0} extrato(s) vinculado(s) tambem foram apagados.`,
      );
      await Promise.all([loadBookings(), loadAllBookings(), loadOverview(), loadEntity('finance')]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao limpar o historico da agenda.';
      setError(message);
      toast.error(message);
      throw err;
    }
  };

  const handleResetAnalyticsHistory = async (masterPassword?: string): Promise<void> => {
    if (!adminKey) return;
    setError('');

    try {
      const result = await resetAnalyticsHistoryForAdmin(adminKey, {
        masterPassword,
        tenantSlug: activeTenant,
      });
      setRescheduleMap({});
      toast.success(
        `Historico total limpo: ${result.deleted.bookings} agendamento(s), ${result.deleted.finance} financeiro(s), ${result.deleted.leads} lead(s), ${result.deleted.tasks} tarefa(s) e ${result.deleted.reviews} avaliacao(oes).`,
      );
      await Promise.all([
        loadBookings(),
        loadAllBookings(),
        loadOverview(),
        loadEntity('finance'),
        loadEntity('leads'),
        loadEntity('tasks'),
        loadEntity('reviews'),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao limpar o historico total do analytics.';
      setError(message);
      toast.error(message);
      throw err;
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

  const handleUpdateMasterPassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    if (!adminKey) return false;
    setError('');

    try {
      const saved = await updateMasterPasswordForAdmin({ currentPassword, newPassword }, adminKey, activeTenant);
      setSettings(saved);
      setUnlockedProtectedTabs({ configuracoes: true });
      toast.success('Senha master redefinida.');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao redefinir senha master.';
      setError(message);
      toast.error(message);
      return false;
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
      <div
        ref={loginFxRef}
        className="admin-login-bg"
        onPointerMove={handleLoginPointerMove}
        onPointerLeave={handleLoginPointerLeave}
      >
        <div className="admin-orb admin-orb-1" />
        <div className="admin-orb admin-orb-2" />
        <div className="admin-orb admin-orb-3" />
        <div className="admin-login-live-lines" aria-hidden="true" />
        <div className="admin-login-grid">
          <motion.section
            className="admin-login-hero"
            initial={{ opacity: 0, x: -26 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="admin-login-brandline">
              <span className="admin-login-brand-mark">
                <Stethoscope style={{ width: 26, height: 26 }} />
              </span>
              <div>
                <strong>Estudio Renovo</strong>
                <small>Central de agendamento inteligente</small>
              </div>
            </div>

            <span className="admin-login-eyebrow">
              <Sparkles style={{ width: 15, height: 15 }} />
              Salao, agenda e relacionamento em um unico cockpit
            </span>
            <h1>{loginGreeting} Bem-vindo a Central Renovo.</h1>
            <p>
              Controle sua agenda, encante seus clientes e acompanhe recorrencias, pagamentos e integracoes
              em um painel preparado para uma operacao moderna e previsivel.
            </p>

            <div className="admin-login-highlights">
              <article>
                <Calendar style={{ width: 18, height: 18 }} />
                <strong>Agenda viva</strong>
                <span>Confirmacoes, remarcacoes e alertas em tempo real.</span>
              </article>
              <article>
                <Users style={{ width: 18, height: 18 }} />
                <strong>Clientes 360</strong>
                <span>Historico, retorno e relacionamento recorrente.</span>
              </article>
              <article>
                <ShieldCheck style={{ width: 18, height: 18 }} />
                <strong>Acesso protegido</strong>
                <span>Central bloqueada por chave administrativa.</span>
              </article>
            </div>
          </motion.section>

          <motion.section
            className="admin-login-panel"
            initial={{ opacity: 0, y: 32, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.72, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="admin-login-panel-glow" />
            <div className={`admin-login-card${loginErrorPulse ? ' admin-login-card-shake' : ''}`}>
              <div className="admin-login-accent" />
              <div className="admin-login-card-inner">
                <div className="admin-login-card-head">
                  <div className="admin-login-icon-ring">
                    <Lock style={{ width: 26, height: 26 }} />
                  </div>
                  <div>
                    <span>Acesso administrativo</span>
                    <h2>Entrar na Central Renovo</h2>
                    <p>Valide sua chave para liberar a operacao protegida do Estudio Renovo.</p>
                  </div>
                </div>

                <div className="admin-login-form">
                  <label className="admin-label" htmlFor="admin-access-key">Chave administrativa</label>
                  <div className="admin-login-input-wrap">
                    <Lock style={{ width: 16, height: 16 }} />
                    <input
                      ref={adminKeyInputRef}
                      id="admin-access-key"
                      type={showAdminKey ? 'text' : 'password'}
                      value={adminKeyInput}
                      onChange={(event) => setAdminKeyInput(event.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleLogin();
                      }}
                      className="admin-input admin-login-input"
                      placeholder="Digite sua chave de acesso"
                      disabled={loginSubmitting || loginLocked}
                    />
                    <button
                      type="button"
                      className="admin-login-eye"
                      onClick={() => setShowAdminKey((current) => !current)}
                      aria-label={showAdminKey ? 'Ocultar chave administrativa' : 'Mostrar chave administrativa'}
                      disabled={loginSubmitting}
                    >
                      {showAdminKey ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                    </button>
                  </div>
                  <button
                    onClick={() => void handleLogin()}
                    className="admin-btn-primary admin-login-submit"
                    disabled={loginSubmitting || loginLocked}
                    aria-busy={loginSubmitting}
                  >
                    {loginSubmitting ? (
                      <>
                        <Loader2 className="admin-login-spinner" style={{ width: 17, height: 17 }} />
                        Validando acesso...
                      </>
                    ) : loginLocked ? (
                      `Tente novamente em ${loginLockSeconds}s`
                    ) : (
                      <>
                        Entrar no painel
                        <ArrowRight style={{ width: 17, height: 17 }} />
                      </>
                    )}
                  </button>
                  {error && <p className="admin-login-error">{error}</p>}
                </div>

                <div className="admin-login-status-grid">
                  <span className={loginSystemStatus.apiOnline === false ? 'is-offline' : 'is-online'}>
                    <Wifi style={{ width: 14, height: 14 }} />
                    {loginSystemStatus.loading ? 'API verificando' : loginSystemStatus.apiOnline ? 'API online' : 'API offline'}
                  </span>
                  <span className={loginSystemStatus.evolutionReady === false ? 'is-warning' : 'is-online'}>
                    <CheckCircle2 style={{ width: 14, height: 14 }} />
                    {loginSystemStatus.loading ? 'Mensageria verificando' : loginSystemStatus.evolutionReady ? 'Evolution pronta' : 'Evolution pendente'}
                  </span>
                  <span className={loginSystemStatus.apiOnline === false ? 'is-offline' : 'is-online'}>
                    <Database style={{ width: 14, height: 14 }} />
                    {loginSystemStatus.storageLabel}
                  </span>
                </div>

                <div className="admin-login-trust-row">
                  <span><ShieldCheck style={{ width: 14, height: 14 }} /> Sessao local protegida</span>
                  <span><Clock style={{ width: 14, height: 14 }} /> Operacao em tempo real</span>
                </div>
              </div>
            </div>
          </motion.section>
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
                onClick={() => { handleOpenTab(item.id); }}
                className={`admin-nav-item${active ? ' active' : ''}`}
              >
                <Icon style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span style={{ fontSize: 14.5, fontWeight: active ? 700 : 500, letterSpacing: '0.01em', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {item.label}
                  {protectedTabs[item.id] && !unlockedProtectedTabs[item.id] && <Lock style={{ width: 13, height: 13 }} />}
                </span>
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
              if (entity && entity !== 'clients') {
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 999, background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)' }}>
                  <button
                    type="button"
                    onClick={() => setDateScope('all')}
                    className={dateScope === 'all' ? 'admin-btn-primary' : 'admin-btn-outline'}
                    style={{ padding: '6px 12px', fontSize: 11 }}
                  >
                    Geral
                  </button>
                  <button
                    type="button"
                    onClick={() => setDateScope('range')}
                    className={dateScope === 'range' ? 'admin-btn-primary' : 'admin-btn-outline'}
                    style={{ padding: '6px 12px', fontSize: 11 }}
                  >
                    Periodo
                  </button>
                </div>
                {dateScope === 'range' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', fontWeight: 600 }}>De</span>
                    <input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); if (e.target.value > dateFilterEnd) setDateFilterEnd(e.target.value); }} className="admin-input-sm" />
                    <span style={{ fontSize: 11, color: 'var(--admin-text-muted)', fontWeight: 600 }}>Ate</span>
                    <input type="date" value={dateFilterEnd} onChange={(e) => { if (e.target.value >= dateFilter) setDateFilterEnd(e.target.value); }} className="admin-input-sm" />
                  </div>
                )}
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
              dateScope={dateScope}
              dateLabel={dateFilterLabel}
              stageSummary={stageSummary}
              onResetFinance={handleResetFinance}
            />
          )}

          {activeTab === 'agenda' && (
            <AgendaTab
              bookings={bookings}
              bookingsLoading={bookingsLoading}
              dateScope={dateScope}
              dateLabel={dateFilterLabel}
              busyBookingId={busyBookingId}
              rescheduleMap={rescheduleMap}
              setRescheduleMap={setRescheduleMap}
              onConfirm={handleConfirmBooking}
              onComplete={handleCompleteBooking}
              onReject={handleRejectBooking}
              onDelete={handleDeleteBooking}
              onReschedule={handleRescheduleBooking}
              onCreateBooking={handleCreateAgendaBooking}
              onAssignProfessional={handleAssignBookingProfessional}
              onClearHistory={handleResetAgendaHistory}
              serviceCatalog={localServices}
              clients={entityRows.clients}
              professionals={entityRows.professionals}
              defaultCreateDate={defaultAgendaDate}
            />
          )}

          {activeTab === 'servicos' && (
            <ServicosTab
              localServices={localServices}
              loading={entityLoading.services}
              managedCatalog={settings.serviceCatalogManaged === true || entityRows.services.length > 0}
              onCreateService={(payload) => handleCreateEntity('services', payload)}
              onUpdateService={(id, payload) => handleUpdateEntity('services', id, payload)}
              onDeleteService={handleDeleteService}
              onDeleteCategory={handleDeleteServiceCategory}
              onBootstrapCatalog={handleServiceCatalogBootstrap}
              onVerifyMasterPassword={handleVerifyServiceDeletePassword}
            />
          )}

          {activeTab === 'clientes' && (
            <Suspense fallback={<div style={{ fontSize: 13, color: 'var(--admin-text-muted)', padding: '14px 4px' }}>Carregando modulo de clientes...</div>}>
              <ClientesModule
                adminKey={adminKey}
                tenantSlug={activeTenant}
              />
            </Suspense>
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
              serviceCatalog={localServices}
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

          {activeTab === 'pagamentos' && (
            <PaymentConfirmationTab
              adminKey={adminKey}
              onClearPaymentsHistory={handleResetPaymentsHistory}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsTab
              bookings={bookings}
              allBookings={allBookings}
              profs={entityRows.professionals}
              serviceCatalog={localServices}
              analyticsSubTab={analyticsSubTab}
              setAnalyticsSubTab={setAnalyticsSubTab}
              dateLabel={dateFilterLabel}
              onClearHistory={handleResetAnalyticsHistory}
            />
          )}

          {activeTab === 'configuracoes' && (
            <ConfiguracoesTab
              adminKey={adminKey}
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
              onUpdateMasterPassword={handleUpdateMasterPassword}
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
      {protectedTabRequest && (
        <div className="admin-modal-root" style={{ zIndex: 1390 }}>
          <div className="admin-modal-overlay" />
          <div className="admin-modal-card admin-modal-card-sm admin-lock-modal" role="dialog" aria-modal="true">
            <div className="admin-modal-header admin-modal-header-compact">
              <div className="admin-modal-icon admin-modal-icon-gold">
                <Lock style={{ width: 17, height: 17, color: 'var(--admin-gold, #d4af37)' }} />
              </div>
              <div>
                <h3 className="admin-modal-title">{protectedTabLabel} protegido</h3>
                <p className="admin-modal-subtitle">Acesso restrito dentro da central administrativa.</p>
              </div>
            </div>
            <div className="admin-modal-body">
              <div className="admin-lock-panel">
                <span className="admin-lock-kicker">Confirmacao obrigatoria</span>
                <p>Digite a senha master para abrir esta aba. A liberacao vale somente enquanto esta sessao estiver ativa.</p>
              </div>
              <label className="admin-label">Senha master</label>
              <input
                type="password"
                value={protectedTabPassword}
                onChange={(event) => {
                  setProtectedTabPassword(event.target.value);
                  if (protectedTabError) setProtectedTabError('');
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleUnlockProtectedTab();
                  }
                }}
                className="admin-input"
                placeholder="Digite a senha master"
                disabled={protectedTabUnlocking}
                autoFocus
              />
              {protectedTabError && <p style={{ margin: '8px 0 0', color: '#fb7185', fontSize: 12.5, fontWeight: 700 }}>{protectedTabError}</p>}
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn-outline" onClick={closeProtectedTabModal} disabled={protectedTabUnlocking}>Cancelar</button>
              <button className="admin-btn-primary" onClick={() => void handleUnlockProtectedTab()} disabled={protectedTabUnlocking}>
                {protectedTabUnlocking ? 'Validando...' : 'Desbloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
