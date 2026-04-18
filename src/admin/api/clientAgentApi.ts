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
  sendAt: string;
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
  status: 'queued' | 'sent' | 'failed' | 'skipped' | 'canceled';
  reason: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
};

type ClientAgentStateResponse = {
  rules: ClientAgentRule[];
  events: ClientAgentEvent[];
};

export type ClientAgentRunResponse = ClientAgentStateResponse & {
  outcome: {
    dispatched: boolean;
    mode: 'whatsapp' | 'task' | 'skipped';
    message: string;
    error: string | null;
  };
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

export const runClientAgentRuleForAdmin = async (
  ruleId: string,
  adminKey: string,
  tenantSlug?: string,
): Promise<ClientAgentRunResponse> => {
  return requestAdmin<ClientAgentRunResponse>(
    withTenantQuery(`/api/admin/workbench/client-agents/${encodeURIComponent(ruleId)}/run`, tenantSlug),
    adminKey,
    {
      method: 'POST',
    },
  );
};
