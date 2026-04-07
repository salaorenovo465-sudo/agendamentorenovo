import { Phone, Plus, X } from 'lucide-react';
import { toNumber, toStringValue, ENTITY_FIELDS } from '../AdminUtils';
import { CrudTab } from '../CrudTab';
import ClientDetailPanel from '../ClientDetailPanel';

export function ClientesTab({
  clients,
  loading,
  selectedClient,
  setSelectedClient,
  adminKey,
  onCreateEntity,
  onLoadEntity,
}: {
  clients: Record<string, unknown>[];
  loading: boolean;
  selectedClient: Record<string, unknown> | null;
  setSelectedClient: (client: Record<string, unknown> | null) => void;
  adminKey: string;
  onCreateEntity: (entity: 'clients', payload: Record<string, unknown>) => Promise<void>;
  onLoadEntity: (entity: 'clients') => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--admin-accent)', margin: 0, letterSpacing: '0.02em' }}>Clientes ({clients.length})</h3>
        <button onClick={() => setSelectedClient({ _isNew: true })} className="admin-btn-primary" style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Plus style={{ width: 14, height: 14 }} /> Cadastrar Cliente</button>
      </div>
      {loading ? <p style={{ fontSize: 13, color: 'var(--admin-text-muted)' }}>Carregando...</p> : (
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
                onCreate={async (payload) => { await onCreateEntity('clients', payload); setSelectedClient(null); }}
                onUpdate={async () => {}}
                onDelete={async () => {}}
              />
            </div>
          </div>
        ) : (
          <ClientDetailPanel client={selectedClient} adminKey={adminKey} onClose={() => setSelectedClient(null)} onUpdated={() => { onLoadEntity('clients'); }} />
        )
      )}
    </div>
  );
}
