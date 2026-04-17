import { requestAdmin, withTenantQuery } from './apiCore';

export type ClientAgentIntervalUnit = 'days' | 'weeks' | 'months';
export type ClientAgentChannel = 'whatsapp' | 'email' | 'manual';

export type ClientAgentRule = {
  id: string;
  clientId: number;
  clientName: string;
  serviceName: string;
  intervalValue: number;
  intervalUnit: ClientAgentIntervalUnit;
  channel: ClientAgentChannel;
  messageTemplate: string;
  enabled: boolean;
  referenceDate: string;
  nextRunDate: string;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt: string | null;
};

export type ClientAgentEvent = {
  id: string;
  ruleId: string;
  clientId: number;
  clientName: string;
  serviceName: string;
  channel: ClientAgentChannel;
  scheduledFor: string;
  messagePreview: string;
  createdAt: string;
  taskId: number | null;
  status: 'queued' | 'skipped';
  reason: string | null;
};

type ClientAgentStateResponse = {
  rules: ClientAgentRule[];
  events: ClientAgentEvent[];
};

export const getClientAgentStateForAdmin = async (
  adminKey: string,
  tenantSlug?: string,
): Promise<ClientAgentStateResponse> => {
  return requestAdmin<ClientAgentStateResponse>(
    withTenantQuery('/api/admin/workbench/client-agents', tenantSlug),
    adminKey,
    { method: 'GET' },
  );
};

export const saveClientAgentStateForAdmin = async (
  payload: { rules: ClientAgentRule[]; events: ClientAgentEvent[] },
  adminKey: string,
  tenantSlug?: string,
): Promise<ClientAgentStateResponse> => {
  return requestAdmin<ClientAgentStateResponse>(
    withTenantQuery('/api/admin/workbench/client-agents', tenantSlug),
    adminKey,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
};

