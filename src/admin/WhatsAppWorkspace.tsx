import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, QrCode, RefreshCw } from 'lucide-react';

import {
  createWhatsappInstanceForAdmin,
  getWhatsappInstanceQrForAdmin,
  getWhatsappInstanceStatusForAdmin,
  refreshWhatsappInstanceQrForAdmin,
  runWhatsappSyncForAdmin,
} from './api';
import WhatsAppInboxV2 from './whatsapp/WhatsAppInboxV2';
import './whatsapp/whatsapp-v2.css';
import type { AdminEvolutionInstanceStatus, AdminSettings } from './types';

type Props = {
  adminKey: string;
  settings: AdminSettings;
  tenantSlug: string;
};

export default function WhatsAppWorkspace({ adminKey, settings, tenantSlug }: Props) {
  const [instanceStatus, setInstanceStatus] = useState<AdminEvolutionInstanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const autoSyncDoneRef = useRef(false);

  const companyName = useMemo(() => {
    const value = typeof settings.companyName === 'string' ? settings.companyName.trim() : '';
    return value || 'Empresa de estetica';
  }, [settings.companyName]);

  const loadInstanceStatus = async (includeQr = false) => {
    const payload = includeQr
      ? await getWhatsappInstanceQrForAdmin(adminKey, tenantSlug)
      : await getWhatsappInstanceStatusForAdmin(adminKey, tenantSlug);

    setInstanceStatus((current) => {
      if (
        !includeQr
        && payload.connected === false
        && !payload.qrDataUrl
        && current
        && current.instanceName === payload.instanceName
        && current.qrDataUrl
      ) {
        return { ...payload, qrDataUrl: current.qrDataUrl };
      }
      return payload;
    });

    return payload;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    const run = async () => {
      try {
        const status = await loadInstanceStatus(false);
        if (cancelled) return;
        if (status.exists && !status.connected) {
          await loadInstanceStatus(true);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Erro ao consultar instancia WhatsApp.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey, tenantSlug]);

  useEffect(() => {
    if (!instanceStatus?.exists || instanceStatus.connected) return;
    const timer = window.setInterval(() => {
      void loadInstanceStatus(false).catch((err) => console.warn('Erro ao verificar status da instância:', err));
    }, 5000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceStatus?.exists, instanceStatus?.connected, tenantSlug]);

  useEffect(() => {
    if (!instanceStatus?.connected || autoSyncDoneRef.current) return;
    autoSyncDoneRef.current = true;
    setSyncing(true);
    void runWhatsappSyncForAdmin(adminKey, tenantSlug)
      .catch((err) => console.warn('Erro ao sincronizar WhatsApp:', err))
      .finally(() => setSyncing(false));
  }, [adminKey, instanceStatus?.connected, tenantSlug]);

  const handleCreateInstance = async () => {
    setBusy(true);
    setError('');
    try {
      const status = await createWhatsappInstanceForAdmin(adminKey, tenantSlug, companyName);
      setInstanceStatus(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao criar instancia.');
    } finally {
      setBusy(false);
    }
  };

  const handleLoadQr = async () => {
    setBusy(true);
    setError('');
    try {
      const status = await getWhatsappInstanceQrForAdmin(adminKey, tenantSlug);
      setInstanceStatus(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao carregar QR Code.');
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshQr = async () => {
    setBusy(true);
    setError('');
    try {
      const status = await refreshWhatsappInstanceQrForAdmin(adminKey, tenantSlug);
      setInstanceStatus(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao atualizar QR Code.');
    } finally {
      setBusy(false);
    }
  };

  const renderConnectionSetup = () => {
    if (loading) {
      return (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-600 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Carregando estado da instancia WhatsApp...</span>
        </div>
      );
    }

    if (instanceStatus && !instanceStatus.configured) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Configure a Evolution no backend antes de conectar.</p>
          <p className="mt-1">
            {instanceStatus.lastError || 'As credenciais da Evolution estao ausentes para este tenant.'}
          </p>
        </div>
      );
    }

    if (!instanceStatus?.exists) {
      return (
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <QrCode className="h-5 w-5 text-emerald-600 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-900">Crie a instancia WhatsApp do tenant</p>
              <p className="text-sm text-neutral-600">
                A instancia sera criada com base no nome da empresa ({companyName}) e no slug da empresa ({tenantSlug}).
              </p>
              <button
                onClick={() => void handleCreateInstance()}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                <span>Criar instancia</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (instanceStatus && !instanceStatus.connected) {
      return (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Escaneie o QR para conectar o WhatsApp</p>
              <p className="text-sm text-neutral-600">
                Instancia: <span className="font-mono text-xs">{instanceStatus.instanceName}</span>
              </p>
              <p className="mt-1 text-xs text-neutral-500">Status Evolution: {instanceStatus.connectionState}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void handleLoadQr()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
                Gerar QR
              </button>
              <button
                onClick={() => void handleRefreshQr()}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700 disabled:opacity-60"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Atualizar
              </button>
            </div>
          </div>

          {instanceStatus.lastError && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {instanceStatus.lastError}
            </div>
          )}

          {instanceStatus.qrDataUrl ? (
            <div className="flex justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4">
              <img src={instanceStatus.qrDataUrl} alt="QR Code WhatsApp Evolution" className="h-64 w-64 rounded-md bg-white p-2" />
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-4 text-center text-sm text-neutral-600">
              QR indisponivel no momento. Clique em <span className="font-semibold">Gerar QR</span>.
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {error && (
        <div style={{ padding: '8px 14px', background: 'rgba(251,113,133,0.06)', borderBottom: '1px solid rgba(251,113,133,0.15)', color: '#e11d48', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {!instanceStatus?.connected ? (
        renderConnectionSetup()
      ) : (
        <WhatsAppInboxV2 adminKey={adminKey} tenantSlug={tenantSlug} />
      )}
    </div>
  );
}
