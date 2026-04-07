import type { Dispatch, SetStateAction } from 'react';
import { toStringValue, normalizeTenantSlug } from '../AdminUtils';
import type { AdminSettings, AdminTenant } from '../types';

export function ConfiguracoesTab({
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
}: {
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
}) {
  return (
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
            <button disabled={savingTenant} onClick={onCreateTenant} className="admin-btn-primary" style={{ padding: '6px 14px', fontSize: 12 }}>
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

      <div style={{ padding: '10px 14px', borderRadius: 'var(--admin-radius-xs)', background: 'var(--admin-surface-2)', border: '1px solid var(--admin-border)', fontSize: 12, color: 'var(--admin-text-muted)' }}>
        As integrações sensíveis (Evolution e Chatwoot) são gerenciadas somente no backend e não aparecem nesta tela.
      </div>

      <button disabled={savingSettings} onClick={onSaveSettings} className="admin-btn-primary" style={{ alignSelf: 'flex-start', padding: '10px 24px' }}>
        {savingSettings ? 'Salvando...' : 'Salvar configuracoes'}
      </button>
    </div>
  );
}
