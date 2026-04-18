import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  PlugZap,
  QrCode,
  RadioTower,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { normalizeTenantSlug, toStringValue } from '../AdminUtils';
import {
  createEvolutionInstanceForAdmin,
  getEvolutionInstanceQrForAdmin,
  getEvolutionIntegrationForAdmin,
  refreshEvolutionInstanceQrForAdmin,
  saveEvolutionIntegrationForAdmin,
  sendEvolutionTestMessageForAdmin,
  testEvolutionIntegrationForAdmin,
} from '../api/integrationApi';
import type {
  AdminEvolutionChecklistItem,
  AdminEvolutionIntegrationDiagnostics,
  AdminEvolutionIntegrationState,
  AdminEvolutionIntegrationTestResult,
  AdminEvolutionTestMessageResult,
  AdminSettings,
  AdminTenant,
} from '../types';

type SettingsSection = 'geral' | 'integracoes' | 'seguranca';

type EvolutionFormState = {
  evolutionUrl: string;
  evolutionInstance: string;
  evolutionSendPath: string;
  evolutionApiKey: string;
  evolutionWebhookSecret: string;
};

const DEFAULT_EVOLUTION_SEND_PATH = '/message/sendText/{instance}';

const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  description: string;
}> = [
  {
    id: 'geral',
    label: 'Geral',
    description: 'Dados da empresa e operacao base.',
  },
  {
    id: 'integracoes',
    label: 'Integracoes',
    description: 'Conexao, diagnostico e operacao tecnica.',
  },
  {
    id: 'seguranca',
    label: 'Seguranca',
    description: 'Senha master e blindagem interna.',
  },
];

const buildEmptyEvolutionForm = (): EvolutionFormState => ({
  evolutionUrl: '',
  evolutionInstance: '',
  evolutionSendPath: DEFAULT_EVOLUTION_SEND_PATH,
  evolutionApiKey: '',
  evolutionWebhookSecret: '',
});

const humanizeConnectionState = (value: string): string => {
  if (value === 'open') return 'Conectada';
  if (value === 'connecting') return 'Conectando';
  if (value === 'close') return 'Fechada';
  if (value === 'disconnected') return 'Desconectada';
  if (value === 'missing') return 'Nao criada';
  return 'Indefinida';
};

const humanizeOverallStatus = (value: AdminEvolutionIntegrationDiagnostics['overallStatus'] | undefined): string => {
  if (value === 'ready') return 'Pronta';
  if (value === 'attention') return 'Atencao';
  if (value === 'error') return 'Erro';
  return 'Nao configurada';
};

const overallStatusTone = (value: AdminEvolutionIntegrationDiagnostics['overallStatus'] | undefined): 'ok' | 'warn' | 'error' => {
  if (value === 'ready') return 'ok';
  if (value === 'attention') return 'warn';
  return 'error';
};

const checklistTone = (status: AdminEvolutionChecklistItem['status']): 'ok' | 'warn' | 'error' | 'pending' => status;

const getChecklistSummary = (items: AdminEvolutionChecklistItem[]) => ({
  ok: items.filter((item) => item.status === 'ok').length,
  warn: items.filter((item) => item.status === 'warn').length,
  error: items.filter((item) => item.status === 'error').length,
  pending: items.filter((item) => item.status === 'pending').length,
});

export function ConfiguracoesTab({
  adminKey,
  activeTenant,
  settings,
  setSettings,
  savingSettings,
  onSaveSettings,
  tenants,
  newTenantName,
  setNewTenantName,
  newTenantSlug,
  setNewTenantSlug,
  savingTenant,
  onCreateTenant,
  onToggleTenantActive,
  onUpdateMasterPassword,
}: {
  adminKey: string;
  activeTenant: string;
  settings: AdminSettings;
  setSettings: Dispatch<SetStateAction<AdminSettings>>;
  savingSettings: boolean;
  onSaveSettings: () => void;
  tenants: AdminTenant[];
  newTenantName: string;
  setNewTenantName: (value: string) => void;
  newTenantSlug: string;
  setNewTenantSlug: (value: string) => void;
  savingTenant: boolean;
  onCreateTenant: () => void;
  onToggleTenantActive: (tenant: AdminTenant) => void;
  onUpdateMasterPassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
}) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('geral');
  const [currentMasterPassword, setCurrentMasterPassword] = useState('');
  const [newMasterPassword, setNewMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [masterPasswordSaving, setMasterPasswordSaving] = useState(false);
  const [masterPasswordError, setMasterPasswordError] = useState('');
  const [masterPasswordSuccess, setMasterPasswordSuccess] = useState('');

  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationSaving, setIntegrationSaving] = useState(false);
  const [integrationTesting, setIntegrationTesting] = useState(false);
  const [integrationAction, setIntegrationAction] = useState<'create' | 'qr' | 'refresh' | null>(null);
  const [integrationPanelOpen, setIntegrationPanelOpen] = useState(false);
  const [integrationError, setIntegrationError] = useState('');
  const [integrationSuccess, setIntegrationSuccess] = useState('');
  const [integrationState, setIntegrationState] = useState<AdminEvolutionIntegrationState | null>(null);
  const [integrationTestResult, setIntegrationTestResult] = useState<AdminEvolutionIntegrationTestResult | null>(null);
  const [evolutionForm, setEvolutionForm] = useState<EvolutionFormState>(() => buildEmptyEvolutionForm());
  const [testMessagePhone, setTestMessagePhone] = useState('');
  const [testMessageText, setTestMessageText] = useState('Ola, este e um teste operacional da Evolution API na central Renovo.');
  const [testMessageSending, setTestMessageSending] = useState(false);
  const [testMessageResult, setTestMessageResult] = useState<AdminEvolutionTestMessageResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  const companyName = useMemo(() => {
    const value = typeof settings.companyName === 'string' ? settings.companyName.trim() : '';
    return value || tenants.find((tenant) => tenant.slug === activeTenant)?.name || 'Empresa';
  }, [activeTenant, settings.companyName, tenants]);

  const integrationDiagnostics = integrationState?.diagnostics || null;
  const checklistSummary = useMemo(
    () => getChecklistSummary(integrationDiagnostics?.checklist || []),
    [integrationDiagnostics?.checklist],
  );

  const integrationConfigured = integrationState?.integration.configured === true;
  const integrationConnected = integrationState?.status.connected === true;
  const integrationBadge = integrationConnected
    ? 'Integrado'
    : integrationConfigured
      ? 'Configurado'
      : 'Nao conectado';
  const integrationActionLabel = integrationConnected
    ? 'Gerenciar'
    : integrationConfigured
      ? 'Finalizar conexao'
      : 'Conectar';

  const syncEvolutionForm = (payload: AdminEvolutionIntegrationState) => {
    setEvolutionForm({
      evolutionUrl: payload.integration.evolutionUrl || '',
      evolutionInstance: payload.integration.evolutionInstance || '',
      evolutionSendPath: payload.integration.evolutionSendPath || DEFAULT_EVOLUTION_SEND_PATH,
      evolutionApiKey: '',
      evolutionWebhookSecret: '',
    });
  };

  const loadEvolutionIntegration = async () => {
    setIntegrationLoading(true);
    setIntegrationError('');

    try {
      const payload = await getEvolutionIntegrationForAdmin(adminKey, activeTenant);
      setIntegrationState(payload);
      syncEvolutionForm(payload);
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Erro ao carregar integracao Evolution.');
    } finally {
      setIntegrationLoading(false);
    }
  };

  useEffect(() => {
    setIntegrationPanelOpen(false);
    setIntegrationError('');
    setIntegrationSuccess('');
    setIntegrationTestResult(null);
    setIntegrationState(null);
    setEvolutionForm(buildEmptyEvolutionForm());
    setTestMessagePhone('');
    setTestMessageResult(null);
    setCopyFeedback('');
  }, [activeTenant]);

  useEffect(() => {
    if (activeSection !== 'integracoes') {
      return;
    }

    void loadEvolutionIntegration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, activeTenant]);

  useEffect(() => {
    if (activeSection !== 'integracoes' || !integrationPanelOpen) {
      return;
    }

    const handle = window.setInterval(() => {
      void loadEvolutionIntegration();
    }, 15000);

    return () => window.clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, integrationPanelOpen, activeTenant]);

  const handleMasterPasswordUpdate = async () => {
    setMasterPasswordError('');
    setMasterPasswordSuccess('');

    const currentPassword = currentMasterPassword.trim();
    const nextPassword = newMasterPassword.trim();
    const confirmation = confirmMasterPassword.trim();

    if (!currentPassword || !nextPassword || !confirmation) {
      setMasterPasswordError('Preencha a senha atual, a nova senha e a confirmacao.');
      return;
    }

    if (nextPassword.length < 4) {
      setMasterPasswordError('A nova senha master precisa ter pelo menos 4 caracteres.');
      return;
    }

    if (nextPassword !== confirmation) {
      setMasterPasswordError('A confirmacao nao confere com a nova senha master.');
      return;
    }

    setMasterPasswordSaving(true);
    const updated = await onUpdateMasterPassword(currentPassword, nextPassword);
    setMasterPasswordSaving(false);

    if (!updated) {
      setMasterPasswordError('Nao foi possivel redefinir a senha master. Confira a senha atual.');
      return;
    }

    setCurrentMasterPassword('');
    setNewMasterPassword('');
    setConfirmMasterPassword('');
    setMasterPasswordSuccess('Senha master redefinida. As abas protegidas vao exigir a nova senha.');
  };

  const handleOpenEvolutionPanel = async () => {
    setActiveSection('integracoes');
    setIntegrationPanelOpen(true);

    if (!integrationState && !integrationLoading) {
      await loadEvolutionIntegration();
    }
  };

  const handleSaveEvolutionIntegration = async () => {
    setIntegrationError('');
    setIntegrationSuccess('');
    setIntegrationTestResult(null);
    setTestMessageResult(null);

    setIntegrationSaving(true);
    try {
      const payload = await saveEvolutionIntegrationForAdmin(
        {
          evolutionUrl: evolutionForm.evolutionUrl.trim(),
          evolutionInstance: evolutionForm.evolutionInstance.trim(),
          evolutionSendPath: evolutionForm.evolutionSendPath.trim() || DEFAULT_EVOLUTION_SEND_PATH,
          evolutionApiKey: evolutionForm.evolutionApiKey.trim() || undefined,
          evolutionWebhookSecret: evolutionForm.evolutionWebhookSecret.trim() || undefined,
        },
        adminKey,
        activeTenant,
      );

      setIntegrationState(payload);
      syncEvolutionForm(payload);
      setSettings((current) => ({
        ...current,
        whatsappProvider: 'evolution',
        evolutionUrl: payload.integration.evolutionUrl,
        evolutionInstance: payload.integration.evolutionInstance,
        evolutionSendPath: payload.integration.evolutionSendPath,
      }));
      setIntegrationSuccess(
        payload.status.connected
          ? 'Evolution integrada com sucesso. O canal do agente ja esta pronto.'
          : 'Credenciais salvas. Agora finalize o vinculo da instancia para deixar o canal operacional.',
      );
      setIntegrationPanelOpen(true);
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Erro ao salvar integracao Evolution.');
    } finally {
      setIntegrationSaving(false);
    }
  };

  const stagedSettings = useMemo(
    () => ({
      evolutionUrl: evolutionForm.evolutionUrl.trim(),
      evolutionInstance: evolutionForm.evolutionInstance.trim(),
      evolutionSendPath: evolutionForm.evolutionSendPath.trim() || DEFAULT_EVOLUTION_SEND_PATH,
      evolutionApiKey: evolutionForm.evolutionApiKey.trim() || undefined,
      evolutionWebhookSecret: evolutionForm.evolutionWebhookSecret.trim() || undefined,
    }),
    [evolutionForm.evolutionApiKey, evolutionForm.evolutionInstance, evolutionForm.evolutionSendPath, evolutionForm.evolutionUrl, evolutionForm.evolutionWebhookSecret],
  );

  const handleTestEvolutionIntegration = async () => {
    setIntegrationTesting(true);
    setIntegrationError('');
    setIntegrationSuccess('');

    try {
      const result = await testEvolutionIntegrationForAdmin(adminKey, stagedSettings, activeTenant);
      setIntegrationTestResult(result);
      setIntegrationState((current) => current ? { ...current, diagnostics: result.diagnostics } : current);
      if (result.ok) {
        setIntegrationSuccess('A Evolution respondeu e a instancia configurada foi localizada.');
      } else {
        setIntegrationError(result.error || 'A Evolution respondeu, mas a configuracao ainda nao ficou valida.');
      }
      await loadEvolutionIntegration();
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Erro ao testar integracao Evolution.');
    } finally {
      setIntegrationTesting(false);
    }
  };

  const runEvolutionInstanceAction = async (action: 'create' | 'qr' | 'refresh') => {
    setIntegrationAction(action);
    setIntegrationError('');
    setIntegrationSuccess('');

    try {
      const payload = action === 'create'
        ? await createEvolutionInstanceForAdmin(adminKey, activeTenant, companyName)
        : action === 'qr'
          ? await getEvolutionInstanceQrForAdmin(adminKey, activeTenant)
          : await refreshEvolutionInstanceQrForAdmin(adminKey, activeTenant);

      setIntegrationState((current) =>
        current
          ? { ...current, status: payload }
          : {
              integration: {
                provider: 'evolution',
                configured: payload.configured,
                evolutionUrl: evolutionForm.evolutionUrl.trim(),
                evolutionInstance: payload.instanceName,
                evolutionSendPath: evolutionForm.evolutionSendPath.trim() || DEFAULT_EVOLUTION_SEND_PATH,
                hasApiKey: Boolean(evolutionForm.evolutionApiKey.trim()),
                apiKeyPreview: null,
                hasWebhookSecret: Boolean(evolutionForm.evolutionWebhookSecret.trim()),
                webhookSecretPreview: null,
              },
              status: payload,
              diagnostics: {
                checkedAt: new Date().toISOString(),
                tenantSlug: activeTenant,
                overallStatus: 'attention',
                readinessScore: 0,
                apiReachable: false,
                secureUrl: false,
                sendPathResolved: DEFAULT_EVOLUTION_SEND_PATH,
                sendUrlPreview: null,
                webhookUrl: null,
                instanceFound: payload.exists,
                availableInstances: [],
                instancesCount: 0,
                checklist: [],
                issues: [],
                warnings: [],
                recommendations: [],
              },
            },
      );

      setIntegrationSuccess(
        action === 'create'
          ? 'Instancia criada na Evolution. Agora escaneie o QR para concluir o vinculo.'
          : action === 'qr'
            ? 'QR carregado. Vincule o numero dentro da sua conta Evolution.'
            : 'QR atualizado com sucesso.',
      );
      setIntegrationPanelOpen(true);
      await loadEvolutionIntegration();
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Erro ao operar a instancia Evolution.');
    } finally {
      setIntegrationAction(null);
    }
  };

  const handleSendEvolutionTestMessage = async () => {
    setIntegrationError('');
    setIntegrationSuccess('');
    setTestMessageResult(null);

    setTestMessageSending(true);
    try {
      const result = await sendEvolutionTestMessageForAdmin(
        adminKey,
        {
          phone: testMessagePhone.trim(),
          text: testMessageText.trim(),
          settings: stagedSettings,
        },
        activeTenant,
      );

      setTestMessageResult(result);
      setIntegrationSuccess(`Mensagem de teste enviada para ${result.normalizedPhone}.`);
      await loadEvolutionIntegration();
    } catch (error) {
      setIntegrationError(error instanceof Error ? error.message : 'Erro ao enviar mensagem de teste.');
    } finally {
      setTestMessageSending(false);
    }
  };

  const handleCopyValue = async (value: string, label: string) => {
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(`${label} copiado.`);
      window.setTimeout(() => setCopyFeedback(''), 2200);
    } catch {
      setCopyFeedback(`Nao foi possivel copiar ${label.toLowerCase()}.`);
      window.setTimeout(() => setCopyFeedback(''), 2200);
    }
  };

  const renderGeneralSection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="settings-hero-card">
        <div>
          <span className="settings-section-kicker">Base operacional</span>
          <h3>Configuracoes gerais</h3>
          <p>Dados estruturais da empresa ativa. Tudo salvo por tenant.</p>
        </div>
        <div className="settings-hero-chip">
          <Building2 style={{ width: 16, height: 16 }} />
          <span>{activeTenant}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="settings-surface-card">
          <p className="admin-label">Tenant ativo</p>
          <p style={{ fontSize: 13, color: 'var(--admin-text)', margin: '4px 0 0' }}><span style={{ fontWeight: 600 }}>Slug:</span> {activeTenant}</p>
          <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '4px 0 0' }}>Ajustes desta tela serao salvos apenas para esta empresa.</p>
        </div>

        <div className="settings-surface-card">
          <p className="admin-label">Criar nova empresa</p>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr auto' }}>
            <input className="admin-input-sm" value={newTenantName} onChange={(event) => setNewTenantName(event.target.value)} placeholder="Nome da empresa" />
            <input className="admin-input-sm" value={newTenantSlug} onChange={(event) => setNewTenantSlug(normalizeTenantSlug(event.target.value))} placeholder="slug-da-empresa" />
            <button disabled={savingTenant} onClick={onCreateTenant} className="admin-btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>
              {savingTenant ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>

      {tenants.length > 0 && (
        <div className="settings-surface-card">
          <p className="admin-label">Empresas cadastradas</p>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tenants.map((tenant) => (
              <div key={tenant.slug} className="admin-booking-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--admin-text)', margin: 0 }}>{tenant.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--admin-text-muted)', margin: '2px 0 0' }}>{tenant.slug}</p>
                </div>
                <button onClick={() => onToggleTenantActive(tenant)} className={tenant.active ? 'admin-btn-success' : 'admin-btn-outline'} style={{ padding: '4px 12px', fontSize: 11 }}>
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

      <button disabled={savingSettings} onClick={onSaveSettings} className="admin-btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
        {savingSettings ? 'Salvando...' : 'Salvar configuracoes'}
      </button>
    </div>
  );

  const renderDiagnosticIssueList = (title: string, items: string[], tone: 'issue' | 'warning' | 'hint') => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div className={`settings-diagnostic-list ${tone}`}>
        <strong>{title}</strong>
        <div>
          {items.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    );
  };

  const renderChecklistItem = (item: AdminEvolutionChecklistItem) => (
    <div key={item.id} className={`settings-checklist-item ${checklistTone(item.status)}`}>
      <div className="settings-checklist-icon">
        {item.status === 'ok' ? <CheckCircle2 style={{ width: 16, height: 16 }} /> : item.status === 'warn' ? <AlertTriangle style={{ width: 16, height: 16 }} /> : item.status === 'pending' ? <Activity style={{ width: 16, height: 16 }} /> : <AlertTriangle style={{ width: 16, height: 16 }} />}
      </div>
      <div>
        <strong>{item.label}</strong>
        <p>{item.detail}</p>
      </div>
    </div>
  );

  const renderIntegrationSection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="settings-hero-card">
        <div>
          <span className="settings-section-kicker">Marketplace interno</span>
          <h3>Integracoes</h3>
          <p>Conexao, diagnostico, QR, checklist de prontidao e teste operacional real no mesmo workspace.</p>
        </div>
        <div className="settings-hero-chip">
          <Sparkles style={{ width: 16, height: 16 }} />
          <span>Evolution only</span>
        </div>
      </div>

      <div className="settings-integrations-grid">
        <div className={`settings-integration-card ${integrationConnected ? 'connected' : integrationConfigured ? 'configured' : ''}`}>
          <div className="settings-integration-card-top">
            <div className="settings-integration-brand evolution">
              <span>EV</span>
            </div>
            <div className="settings-integration-copy">
              <span className="settings-integration-kicker">Canal do agente</span>
              <h4>Evolution API</h4>
              <p>Conexao dedicada para disparos do agente, teste de envio e monitoramento tecnico por tenant.</p>
            </div>
            <span className={`settings-integration-badge ${overallStatusTone(integrationDiagnostics?.overallStatus)}`}>{integrationBadge}</span>
          </div>

          <div className="settings-integration-metrics">
            <div>
              <span>Prontidao</span>
              <strong>{integrationDiagnostics ? `${integrationDiagnostics.readinessScore}%` : '0%'}</strong>
            </div>
            <div>
              <span>Instancia</span>
              <strong>{integrationState?.status.instanceName || 'Nao definida'}</strong>
            </div>
            <div>
              <span>Saude</span>
              <strong>{humanizeOverallStatus(integrationDiagnostics?.overallStatus)}</strong>
            </div>
          </div>

          <div className="settings-integration-footer">
            <p>
              {integrationConnected
                ? 'A conta esta vinculada e o agente pode operar pela Evolution.'
                : 'Conecte a Evolution, valide a API e conclua a instancia para liberar o canal.'}
            </p>
            <button
              className={integrationConnected ? 'admin-btn-outline' : 'admin-btn-primary'}
              onClick={() => void handleOpenEvolutionPanel()}
              disabled={integrationLoading}
            >
              {integrationLoading ? 'Carregando...' : integrationActionLabel}
            </button>
          </div>
        </div>
      </div>

      {integrationError && <p className="settings-inline-error">{integrationError}</p>}
      {integrationSuccess && <p className="settings-inline-success">{integrationSuccess}</p>}
      {copyFeedback && <p className="settings-inline-success">{copyFeedback}</p>}

      {(integrationPanelOpen || integrationConnected || integrationConfigured) && (
        <div className="settings-integration-console">
          <div className="settings-integration-console-header">
            <div>
              <span className="settings-section-kicker">Painel de operacao</span>
              <h4>Evolution API</h4>
              <p>Diagnostico em tempo real, checklist de prontidao, configuracao segura e teste real de envio.</p>
            </div>
            <div className="settings-inline-actions">
              <button className="admin-btn-outline" onClick={() => void loadEvolutionIntegration()} disabled={integrationLoading}>
                {integrationLoading ? 'Atualizando...' : 'Atualizar status'}
              </button>
              <button className="admin-btn-outline" onClick={() => setIntegrationPanelOpen((current) => !current)}>
                {integrationPanelOpen ? 'Recolher' : 'Expandir'}
              </button>
            </div>
          </div>

          {integrationPanelOpen && (
            <>
              <div className="settings-health-band">
                <div className={`settings-health-score ${overallStatusTone(integrationDiagnostics?.overallStatus)}`}>
                  <span>Readiness score</span>
                  <strong>{integrationDiagnostics ? `${integrationDiagnostics.readinessScore}%` : '0%'}</strong>
                  <small>{humanizeOverallStatus(integrationDiagnostics?.overallStatus)}</small>
                </div>
                <div className="settings-health-progress">
                  <div>
                    <span>Checklist</span>
                    <strong>{checklistSummary.ok} ok / {checklistSummary.warn} alerta / {checklistSummary.error} erro</strong>
                  </div>
                  <div className="settings-progress-bar">
                    <span style={{ width: `${integrationDiagnostics?.readinessScore || 0}%` }} />
                  </div>
                </div>
              </div>

              <div className="settings-integration-status-grid">
                <div className="settings-status-card">
                  <Link2 style={{ width: 16, height: 16 }} />
                  <div>
                    <span>Conexao API</span>
                    <strong>{integrationDiagnostics?.apiReachable ? 'Respondendo' : integrationConfigured ? 'Mapeada' : 'Sem credencial'}</strong>
                  </div>
                </div>
                <div className="settings-status-card">
                  <RadioTower style={{ width: 16, height: 16 }} />
                  <div>
                    <span>Estado da instancia</span>
                    <strong>{integrationState ? humanizeConnectionState(integrationState.status.connectionState) : 'Indefinida'}</strong>
                  </div>
                </div>
                <div className="settings-status-card">
                  <BadgeCheck style={{ width: 16, height: 16 }} />
                  <div>
                    <span>Canal do agente</span>
                    <strong>Evolution exclusiva</strong>
                  </div>
                </div>
                <div className="settings-status-card">
                  <Activity style={{ width: 16, height: 16 }} />
                  <div>
                    <span>Instancias visiveis</span>
                    <strong>{integrationDiagnostics?.instancesCount || 0}</strong>
                  </div>
                </div>
              </div>

              <div className="settings-diagnostics-grid">
                <div className="settings-diagnostic-card">
                  <div className="settings-diagnostic-card-top">
                    <strong>Rota de envio resolvida</strong>
                    {integrationDiagnostics?.sendUrlPreview && (
                      <button className="admin-btn-outline" onClick={() => void handleCopyValue(integrationDiagnostics.sendUrlPreview || '', 'URL de envio')}>
                        <Copy style={{ width: 13, height: 13 }} />
                        Copiar
                      </button>
                    )}
                  </div>
                  <p>{integrationDiagnostics?.sendUrlPreview || 'A rota final aparece aqui quando a URL e a instancia estiverem definidas.'}</p>
                </div>
                <div className="settings-diagnostic-card">
                  <div className="settings-diagnostic-card-top">
                    <strong>Webhook URL</strong>
                    {integrationDiagnostics?.webhookUrl && (
                      <button className="admin-btn-outline" onClick={() => void handleCopyValue(integrationDiagnostics.webhookUrl || '', 'Webhook URL')}>
                        <Copy style={{ width: 13, height: 13 }} />
                        Copiar
                      </button>
                    )}
                  </div>
                  <p>{integrationDiagnostics?.webhookUrl || 'Configure uma URL publica da aplicacao para gerar o endpoint do webhook.'}</p>
                </div>
              </div>

              <div className="settings-checklist-grid">
                {(integrationDiagnostics?.checklist || []).map(renderChecklistItem)}
              </div>

              {renderDiagnosticIssueList('Bloqueios atuais', integrationDiagnostics?.issues || [], 'issue')}
              {renderDiagnosticIssueList('Pontos de atencao', integrationDiagnostics?.warnings || [], 'warning')}
              {renderDiagnosticIssueList('Recomendacoes tecnicas', integrationDiagnostics?.recommendations || [], 'hint')}

              <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
                <div>
                  <label className="admin-label">URL da Evolution</label>
                  <input
                    className="admin-input"
                    value={evolutionForm.evolutionUrl}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, evolutionUrl: event.target.value }))}
                    placeholder="https://sua-evolution.exemplo.com"
                  />
                </div>
                <div>
                  <label className="admin-label">Nome da instancia</label>
                  <input
                    className="admin-input"
                    value={evolutionForm.evolutionInstance}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, evolutionInstance: event.target.value }))}
                    placeholder="renovo-salao"
                  />
                </div>
                <div>
                  <label className="admin-label">Send Path</label>
                  <input
                    className="admin-input"
                    value={evolutionForm.evolutionSendPath}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, evolutionSendPath: event.target.value }))}
                    placeholder={DEFAULT_EVOLUTION_SEND_PATH}
                  />
                </div>
                <div>
                  <label className="admin-label">Webhook Secret</label>
                  <input
                    className="admin-input"
                    value={evolutionForm.evolutionWebhookSecret}
                    onChange={(event) => setEvolutionForm((current) => ({ ...current, evolutionWebhookSecret: event.target.value }))}
                    placeholder={integrationState?.integration.hasWebhookSecret ? `Ja cadastrado: ${integrationState.integration.webhookSecretPreview}` : 'Opcional'}
                  />
                  <small className="settings-field-help">
                    {integrationState?.integration.hasWebhookSecret ? 'Deixe vazio para manter o secret atual.' : 'Opcional, mas recomendado para callbacks.'}
                  </small>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="admin-label">API Key</label>
                  <div className="settings-secret-input">
                    <KeyRound style={{ width: 15, height: 15, color: 'var(--admin-text-muted)' }} />
                    <input
                      className="admin-input"
                      value={evolutionForm.evolutionApiKey}
                      onChange={(event) => setEvolutionForm((current) => ({ ...current, evolutionApiKey: event.target.value }))}
                      placeholder={integrationState?.integration.hasApiKey ? `Ja cadastrada: ${integrationState.integration.apiKeyPreview}` : 'Cole aqui a API Key da Evolution'}
                    />
                  </div>
                  <small className="settings-field-help">
                    {integrationState?.integration.hasApiKey ? 'Deixe vazio para preservar a API Key atual.' : 'A API Key fica mascarada no retorno e nao volta aberta para a tela.'}
                  </small>
                </div>
              </div>

              <div className="settings-integration-actions">
                <button className="admin-btn-primary" onClick={() => void handleSaveEvolutionIntegration()} disabled={integrationSaving}>
                  {integrationSaving ? 'Salvando...' : 'Salvar integracao'}
                </button>
                <button className="admin-btn-outline" onClick={() => void handleTestEvolutionIntegration()} disabled={integrationTesting || integrationSaving}>
                  {integrationTesting ? 'Testando...' : 'Testar conexao'}
                </button>
                <button className="admin-btn-outline" onClick={() => void runEvolutionInstanceAction('create')} disabled={integrationAction !== null || integrationSaving}>
                  {integrationAction === 'create' ? 'Criando...' : 'Criar instancia'}
                </button>
                <button className="admin-btn-outline" onClick={() => void runEvolutionInstanceAction('qr')} disabled={integrationAction !== null || integrationSaving}>
                  {integrationAction === 'qr' ? 'Gerando...' : 'Gerar QR'}
                </button>
                <button className="admin-btn-outline" onClick={() => void runEvolutionInstanceAction('refresh')} disabled={integrationAction !== null || integrationSaving}>
                  {integrationAction === 'refresh' ? 'Atualizando...' : 'Atualizar QR'}
                </button>
              </div>

              {integrationTestResult && (
                <div className={`settings-test-result ${integrationTestResult.ok ? 'ok' : 'warn'}`}>
                  <strong>{integrationTestResult.ok ? 'Teste concluido' : 'Teste parcial'}</strong>
                  <span>
                    API acessivel: {integrationTestResult.reachable ? 'sim' : 'nao'} | instancia encontrada: {integrationTestResult.instanceFound ? 'sim' : 'nao'} | instancias lidas: {integrationTestResult.instancesCount}
                  </span>
                </div>
              )}

              {integrationState?.status.lastError && (
                <div className="settings-test-result warn">
                  <strong>Ultimo retorno da Evolution</strong>
                  <span>{integrationState.status.lastError}</span>
                </div>
              )}

              {integrationDiagnostics?.availableInstances && integrationDiagnostics.availableInstances.length > 0 && (
                <div className="settings-instance-list">
                  <div className="settings-diagnostic-card-top">
                    <strong>Instancias localizadas</strong>
                    <span>{integrationDiagnostics.instancesCount} encontrada(s)</span>
                  </div>
                  <div className="settings-instance-pill-row">
                    {integrationDiagnostics.availableInstances.map((instanceName) => (
                      <span
                        key={instanceName}
                        className={`settings-instance-pill ${instanceName === integrationState?.status.instanceName ? 'active' : ''}`}
                      >
                        {instanceName}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="settings-test-message-card">
                <div className="settings-diagnostic-card-top">
                  <strong>Teste real de envio</strong>
                  <span>Use as credenciais atuais ou as digitadas no formulario</span>
                </div>
                <div className="settings-test-message-grid">
                  <div>
                    <label className="admin-label">Telefone de teste</label>
                    <input
                      className="admin-input"
                      value={testMessagePhone}
                      onChange={(event) => setTestMessagePhone(event.target.value)}
                      placeholder="+55 71 99999-9999"
                    />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="admin-label">Mensagem</label>
                    <textarea
                      className="admin-input"
                      rows={4}
                      value={testMessageText}
                      onChange={(event) => setTestMessageText(event.target.value)}
                      placeholder="Mensagem operacional para validar a Evolution."
                    />
                  </div>
                </div>
                <div className="settings-inline-actions">
                  <button className="admin-btn-primary" onClick={() => void handleSendEvolutionTestMessage()} disabled={testMessageSending}>
                    <Send style={{ width: 14, height: 14 }} />
                    {testMessageSending ? 'Enviando...' : 'Enviar teste'}
                  </button>
                </div>
                {testMessageResult && (
                  <div className="settings-test-result ok">
                    <strong>Teste enviado</strong>
                    <span>Destino normalizado: {testMessageResult.normalizedPhone} | provider id: {testMessageResult.providerMessageId || 'nao informado'}</span>
                  </div>
                )}
              </div>

              {integrationState?.status.qrDataUrl ? (
                <div className="settings-qr-shell">
                  <div className="settings-qr-copy">
                    <span className="settings-section-kicker">Vinculo da instancia</span>
                    <h5>QR Code da Evolution</h5>
                    <p>Escaneie o QR dentro do fluxo da sua conta Evolution para concluir o canal deste tenant.</p>
                  </div>
                  <div className="settings-qr-frame">
                    <img src={integrationState.status.qrDataUrl} alt="QR Code Evolution" />
                  </div>
                </div>
              ) : (
                <div className="settings-empty-qr">
                  <QrCode style={{ width: 18, height: 18 }} />
                  <span>Quando o QR estiver disponivel, ele aparece aqui no mesmo painel.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );

  const renderSecuritySection = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="settings-hero-card">
        <div>
          <span className="settings-section-kicker">Blindagem</span>
          <h3>Seguranca interna</h3>
          <p>Controle a senha master que libera areas protegidas e operacoes sensiveis do painel.</p>
        </div>
        <div className="settings-hero-chip">
          <ShieldCheck style={{ width: 16, height: 16 }} />
          <span>Master lock</span>
        </div>
      </div>

      <div className="settings-master-password-panel">
        <div>
          <span className="settings-security-kicker">Seguranca interna</span>
          <h4>Redefinir senha master</h4>
          <p>
            Esta senha libera as abas protegidas da central. A aba Configuracoes tambem permanece bloqueada e so abre depois da confirmacao da senha master.
          </p>
          {settings.masterPasswordUpdatedAt && (
            <small>Ultima atualizacao: {new Date(settings.masterPasswordUpdatedAt).toLocaleString('pt-BR')}</small>
          )}
        </div>

        <div className="settings-master-password-form">
          <div>
            <label className="admin-label">Senha master atual</label>
            <input
              type="password"
              className="admin-input"
              value={currentMasterPassword}
              onChange={(event) => {
                setCurrentMasterPassword(event.target.value);
                setMasterPasswordError('');
                setMasterPasswordSuccess('');
              }}
              placeholder="Digite a senha atual"
            />
          </div>
          <div>
            <label className="admin-label">Nova senha master</label>
            <input
              type="password"
              className="admin-input"
              value={newMasterPassword}
              onChange={(event) => {
                setNewMasterPassword(event.target.value);
                setMasterPasswordError('');
                setMasterPasswordSuccess('');
              }}
              placeholder="Minimo 4 caracteres"
            />
          </div>
          <div>
            <label className="admin-label">Confirmar nova senha</label>
            <input
              type="password"
              className="admin-input"
              value={confirmMasterPassword}
              onChange={(event) => {
                setConfirmMasterPassword(event.target.value);
                setMasterPasswordError('');
                setMasterPasswordSuccess('');
              }}
              placeholder="Repita a nova senha"
            />
          </div>
          {masterPasswordError && <p className="settings-master-error">{masterPasswordError}</p>}
          {masterPasswordSuccess && <p className="settings-master-success">{masterPasswordSuccess}</p>}
          <button disabled={masterPasswordSaving} onClick={() => void handleMasterPasswordUpdate()} className="admin-btn-primary" style={{ justifySelf: 'flex-start', padding: '10px 18px' }}>
            {masterPasswordSaving ? 'Redefinindo...' : 'Redefinir senha master'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-analytics-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="settings-header">
        <div>
          <span className="settings-section-kicker">Central administrativa</span>
          <h2>Configuracoes da operacao</h2>
          <p>Organizacao por seccao, integracao em cards e ajustes persistidos por empresa ativa.</p>
        </div>
      </div>

      <div className="settings-section-tabs">
        {SETTINGS_SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`settings-section-tab ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="settings-section-tab-icon">
              {section.id === 'geral'
                ? <Settings2 style={{ width: 15, height: 15 }} />
                : section.id === 'integracoes'
                  ? <PlugZap style={{ width: 15, height: 15 }} />
                  : <ShieldCheck style={{ width: 15, height: 15 }} />}
            </span>
            <span>
              <strong>{section.label}</strong>
              <small>{section.description}</small>
            </span>
          </button>
        ))}
      </div>

      {activeSection === 'geral' && renderGeneralSection()}
      {activeSection === 'integracoes' && renderIntegrationSection()}
      {activeSection === 'seguranca' && renderSecuritySection()}
    </div>
  );
}
