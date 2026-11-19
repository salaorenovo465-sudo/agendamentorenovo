import express from 'express';
import cors, { type CorsOptions } from 'cors';

process.on('unhandledRejection', (reason) => {
  console.error('[Process Error] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process Error] Uncaught Exception:', err);
});

import './server/loadEnv';
import { adminAuth } from './server/middleware/adminAuth';
import { adminRoutes } from './server/routes/adminRoutes';
import { adminWorkbenchRoutes } from './server/routes/adminWorkbenchRoutes';
import { integrationRoutes } from './server/routes/integrationRoutes';
import { publicRoutes } from './server/routes/publicRoutes';
import { whatsappRoutes } from './server/routes/whatsappRoutes';
import { startClientAgentScheduler } from './server/services/clientAgentService';
import { initializeWhatsapp } from './server/services/whatsappService';

const app = express();
const trustProxyRaw = process.env.TRUST_PROXY?.trim();
const trustProxyValue = trustProxyRaw
  ? (trustProxyRaw === 'true' ? 1 : trustProxyRaw === 'false' ? false : /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw) : trustProxyRaw)
  : (process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER) ? 1 : false);
app.set('trust proxy', trustProxyValue);
const port = Number(process.env.PORT || 3001);

const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

const resolveAllowedOrigins = (): string[] => {
  const configured = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return configured;
  }

  return DEFAULT_ALLOWED_ORIGINS;
};

const allowedOrigins = new Set(resolveAllowedOrigins());
const allowLocalhostCors =
  process.env.ALLOW_LOCALHOST_CORS === 'true' || process.env.NODE_ENV !== 'production';

const isLocalhostOrigin = (origin: string): boolean => {
  try {
    const parsed = new URL(origin);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
};

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin) || (allowLocalhostCors && isLocalhostOrigin(origin))) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin nao permitida por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ limit: '2mb', extended: true }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'agendamentorenovo-api' });
});

app.use('/api', publicRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/admin', adminAuth, adminRoutes);
app.use('/api/admin/workbench', adminAuth, adminWorkbenchRoutes);
app.use('/api/whatsapp', adminAuth, whatsappRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err || '');
  console.error('[Express Error Handler]', message);

  if (message.includes('Origin nao permitida por CORS')) {
    res.status(403).json({ error: 'Acesso bloqueado pela política de CORS.' });
    return;
  }

  res.status(500).json({ error: 'Erro interno no processamento da requisição.' });
});

void initializeWhatsapp().catch((error) => {
  console.error('Falha ao sincronizar status inicial do WhatsApp (Evolution API):', error);
});

startClientAgentScheduler();

app.listen(port, () => {
  console.log(`Servidor backend rodando na porta ${port}`);

  // Self-ping a cada 14 minutos para evitar que o Render free tier durma
  const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000;
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    setInterval(async () => {
      try {
        const res = await fetch(`${renderUrl}/health`);
        console.log(`[keep-alive] ping ${res.status}`);
      } catch (err) {
        console.warn('[keep-alive] falha no ping:', err);
      }
    }, KEEP_ALIVE_INTERVAL);
    console.log('[keep-alive] ativado — ping a cada 14 min');
  }
});
