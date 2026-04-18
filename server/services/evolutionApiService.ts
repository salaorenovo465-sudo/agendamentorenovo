import { type GenericObject, asArray, asObject, getPositiveInt, getString } from '../utils/helpers';

export type EvolutionInstanceResolution =
  | 'configured'
  | 'trimmed'
  | 'open-fallback'
  | 'single-fallback'
  | 'missing';

export type EvolutionResolvedInstance = {
  instanceName: string;
  row: GenericObject | null;
  resolution: EvolutionInstanceResolution;
  availableInstances: string[];
};

const normalizeInstanceKey = (value: string): string => value.trim().toLowerCase();

export const toEvolutionBaseUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) {
    return '';
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
    return `${parsed.origin}${pathname}`;
  } catch {
    return '';
  }
};

export const parseEvolutionConnectionState = (value: unknown): string => {
  const normalized = getString(value).toLowerCase();
  if (!normalized) {
    return 'unknown';
  }

  if (normalized === 'starting') {
    return 'connecting';
  }

  if (normalized === 'closed') {
    return 'close';
  }

  return normalized;
};

export const extractEvolutionInstanceName = (row: GenericObject | null): string => {
  if (!row) {
    return '';
  }

  const nestedInstance = asObject(row.instance);
  return (
    getString(row.name) ||
    getString(row.instanceName) ||
    getString(nestedInstance?.name) ||
    getString(nestedInstance?.instanceName)
  );
};

export const extractEvolutionInstanceCounts = (row: GenericObject | null): {
  messages: number;
  contacts: number;
  chats: number;
} => {
  const counters = asObject(row?._count);
  return {
    messages: getPositiveInt(counters?.Message ?? counters?.message ?? counters?.messages),
    contacts: getPositiveInt(counters?.Contact ?? counters?.contact ?? counters?.contacts),
    chats: getPositiveInt(counters?.Chat ?? counters?.chat ?? counters?.chats),
  };
};

export const unwrapEvolutionCollection = (value: unknown): GenericObject[] => {
  const rootArray = asArray(value)
    .map((item) => asObject(item))
    .filter((item): item is GenericObject => Boolean(item));
  if (rootArray.length > 0) {
    return rootArray;
  }

  const rootObject = asObject(value);
  if (!rootObject) {
    return [];
  }

  const candidates = [
    rootObject.data,
    rootObject.contacts,
    rootObject.chats,
    rootObject.result,
    rootObject.rows,
    rootObject.payload,
    rootObject.instances,
  ];

  for (const candidate of candidates) {
    const rows = asArray(candidate)
      .map((item) => asObject(item))
      .filter((item): item is GenericObject => Boolean(item));
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
};

export const evolutionApiRequest = async (
  baseUrl: string,
  apiKey: string,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<unknown> => {
  const response = await fetch(`${toEvolutionBaseUrl(baseUrl)}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let payload: unknown = {};
  try {
    payload = raw ? (JSON.parse(raw) as unknown) : {};
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`Evolution ${method} ${path} -> ${response.status}: ${message || 'erro desconhecido'}`);
  }

  return payload;
};

export const fetchEvolutionInstances = async (baseUrl: string, apiKey: string): Promise<GenericObject[]> => {
  const payload = await evolutionApiRequest(baseUrl, apiKey, 'GET', '/instance/fetchInstances');
  return unwrapEvolutionCollection(payload);
};

const matchesConfiguredInstance = (rows: GenericObject[], configuredInstance: string): EvolutionResolvedInstance | null => {
  const availableInstances = rows.map((entry) => extractEvolutionInstanceName(entry)).filter(Boolean);
  const configuredRaw = configuredInstance.trim();
  const configuredKey = normalizeInstanceKey(configuredInstance);
  if (!configuredKey) {
    return null;
  }

  for (const row of rows) {
    const instanceName = extractEvolutionInstanceName(row);
    if (!instanceName) {
      continue;
    }

    if (instanceName === configuredRaw) {
      return {
        instanceName,
        row,
        resolution: 'configured',
        availableInstances,
      };
    }
  }

  for (const row of rows) {
    const instanceName = extractEvolutionInstanceName(row);
    const candidateKey = normalizeInstanceKey(instanceName);
    if (!candidateKey) {
      continue;
    }

    if (candidateKey === configuredKey) {
      return {
        instanceName,
        row,
        resolution: 'trimmed',
        availableInstances,
      };
    }
  }

  return null;
};

export const resolveEvolutionInstance = (
  rows: GenericObject[],
  configuredInstance: string,
): EvolutionResolvedInstance => {
  const availableInstances = rows.map((row) => extractEvolutionInstanceName(row)).filter(Boolean);
  const matched = matchesConfiguredInstance(rows, configuredInstance);
  if (matched) {
    return matched;
  }

  const openCandidates = rows.filter((row) => {
    const state = parseEvolutionConnectionState(row.connectionStatus || row.state || row.status);
    return state === 'open' || state === 'connecting';
  });

  if (openCandidates.length === 1) {
    return {
      instanceName: extractEvolutionInstanceName(openCandidates[0]),
      row: openCandidates[0],
      resolution: 'open-fallback',
      availableInstances,
    };
  }

  if (rows.length === 1) {
    return {
      instanceName: extractEvolutionInstanceName(rows[0]),
      row: rows[0],
      resolution: 'single-fallback',
      availableInstances,
    };
  }

  return {
    instanceName: configuredInstance,
    row: null,
    resolution: 'missing',
    availableInstances,
  };
};
