# Deploy WhatsApp Module (Nginx + systemd + Azure)

Este guia cobre os ajustes de infraestrutura para o workspace WhatsApp v2 (`/api/whatsapp/*`) com SSE realtime.

## 1) Variaveis de ambiente

Backend (`.env`):

- `PORT=3001`
- `CORS_ORIGINS=https://seu-dominio.com,https://admin.seu-dominio.com`
- `ADMIN_API_KEY=<chave-forte>`
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
- `BAILEYS_ENABLED=true`
- `BAILEYS_AUTO_CONNECT=true`
- `BAILEYS_AUTH_DIR=/var/lib/agendamentorenovo/baileys_auth`
- `WHATSAPP_CONTROL_RATE_LIMIT_WINDOW_MS=60000`
- `WHATSAPP_CONTROL_RATE_LIMIT_MAX=20`
- `WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS=60000`
- `WHATSAPP_SEND_RATE_LIMIT_MAX=40`
- `EVOLUTION_SYNC_MAX_ROWS=400`
- `CHATWOOT_OPERATIONAL_MAX_PAGES=20`

Frontend build:

- `VITE_API_URL=https://seu-dominio.com`

## 2) Nginx (proxy reverso)

Exemplo de bloco para API com SSE em `/api/admin/inbox/stream`:

```nginx
server {
  listen 443 ssl http2;
  server_name seu-dominio.com;

  location / {
    root /var/www/agendamentorenovo/dist;
    try_files $uri $uri/ /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }

  location /api/admin/inbox/stream {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache off;
    gzip off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
  }
}
```

## 3) systemd (backend)

Arquivo sugerido: `/etc/systemd/system/agendamentorenovo.service`

```ini
[Unit]
Description=Agendamentorenovo Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/agendamentorenovo
EnvironmentFile=/opt/agendamentorenovo/.env
ExecStart=/usr/bin/npm run render-start
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Comandos:

```bash
sudo systemctl daemon-reload
sudo systemctl enable agendamentorenovo
sudo systemctl restart agendamentorenovo
sudo systemctl status agendamentorenovo
```

## 4) Azure (App VM / App Service)

- Habilitar healthcheck em `/health`.
- Garantir porta backend liberada apenas internamente (Nginx publica 443; backend fica local em 3001).
- Persistir `BAILEYS_AUTH_DIR` em disco duravel (nao efemero).
- Definir `WEBSITE_NODE_DEFAULT_VERSION` (se App Service) para Node 20+.
- Configurar restart controlado (slot swap com warmup) para nao derrubar SSE durante deploy.

## 5) Checklist pos-deploy

- `npx supabase db push` aplicado (inclui tabelas `whatsapp_sync_state`, `whatsapp_contact_map`, `whatsapp_conversation_map`)
- `GET /health` retorna `ok: true`
- `GET /api/whatsapp/conversations` autenticado com `x-admin-key`
- stream SSE funcionando em `/api/admin/inbox/stream`
- envio de mensagem em `/api/whatsapp/messages`
- notas/tags/status funcionando no painel
- migração `20260406130000_add_whatsapp_conversation_meta.sql` aplicada
