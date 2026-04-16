<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Estúdio Renovo - Agenda

Aplicacao React + backend Express para agendamento com:

- leitura de disponibilidade via feed ICS do Google Calendar;
- confirmacao administrativa de agendamentos;
- persistencia em Supabase (com fallback SQLite local);
- criacao de evento no Google Calendar quando o salao confirma;
- notificacoes via WhatsApp Web com Baileys;
- operacao WhatsApp via Chatwoot (modo empresarial) e inbox legado opcional;
- ponte Chatwoot + Evolution API por tenant (multiempresa).

## Abas do painel (cliente)

- Dashboard
- Agenda
- Disponibilidade
- Clientes
- Leads / CRM
- WhatsApp
- Automacoes
- Servicos
- Profissionais
- Financeiro
- Analytics
- Avaliacoes
- Tarefas
- Configuracoes

## Pré-requisitos

- Node.js 20+
- credencial de conta de servico em `service-account-key.json`

## Arquitetura leve

- Front publico e painel admin carregados separadamente (admin lazy-load)
- API publica em `/api/*`
- API admin em `/api/admin/*`
- Rotas admin protegidas por `ADMIN_API_KEY`

## Configuração

1. Instale dependências:
   `npm install`
2. Copie `.env.example` para `.env` e ajuste os valores.
3. Garanta que a agenda foi compartilhada com o e-mail da conta de serviço como **"Fazer alteracoes em eventos"**.
4. Crie a tabela no Supabase usando `supabase/schema.sql`.
5. Para WhatsApp com Baileys:
   - configure `BAILEYS_*` no `.env`
   - prefira `BAILEYS_AUTH_DIR` fora do repositorio (ex.: `C:\Users\<usuario>\.agendamentorenovo\baileys_auth`)
   - nunca versione os arquivos de sessao do WhatsApp
6. Para operar a aba WhatsApp no modo Chatwoot:
   - configure `VITE_WHATSAPP_PROVIDER=chatwoot`
   - configure `VITE_CHATWOOT_URL`, `VITE_CHATWOOT_ACCOUNT_ID` e `VITE_CHATWOOT_EMAIL`
   - use as configuracoes da aba **Configuracoes** para ajustar por empresa
7. Para Chatwoot + Evolution por tenant (recomendado para GlowSystem):
   - em **Configuracoes**, selecione o tenant e preencha:
     - `chatwootUrl`, `chatwootAccountId`, `chatwootInboxId`, `chatwootApiToken`
     - `evolutionUrl`, `evolutionApiKey`, `evolutionInstance`
     - segredos opcionais: `chatwootWebhookSecret`, `evolutionWebhookSecret`
   - configure webhooks:
     - Evolution -> `POST /api/integrations/evolution/<tenant>/webhook`
     - Chatwoot -> `POST /api/integrations/chatwoot/<tenant>/webhook`
   - opcional via `.env` (fallback global):
     - `CHATWOOT_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_INBOX_ID`, `CHATWOOT_API_TOKEN`
     - `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
8. Configure CORS por allowlist:
   - `CORS_ORIGINS` (ex.: `http://localhost:3000,http://127.0.0.1:3000`)
9. Frontend e API:
   - em desenvolvimento, use `VITE_DEV_API_PROXY_TARGET` (padrão: `http://localhost:3001`)
   - defina `VITE_API_URL` apenas quando frontend e backend estiverem em domínios diferentes
10. Ajuste limites de taxa para rotas de WhatsApp admin (opcional):
   - `WHATSAPP_CONTROL_RATE_LIMIT_WINDOW_MS`
   - `WHATSAPP_CONTROL_RATE_LIMIT_MAX`
   - `WHATSAPP_SEND_RATE_LIMIT_WINDOW_MS`
   - `WHATSAPP_SEND_RATE_LIMIT_MAX`
11. Aplique todas as migrations no banco remoto:
   `npx supabase db push`

### Trocar para outra conta Supabase

1. Login na conta nova:
   `npx supabase login`
2. Link no projeto remoto correto:
   `npx supabase link --project-ref <seu_project_ref> --password <db_password>`
3. Aplicar migration:
   `npx supabase db push --db-url "<SUPABASE_DB_URL>"`
4. No `.env`, preencher ao menos:
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_SERVICE_ROLE_KEY`

> Se a senha tiver caracteres especiais (`@`, `:`, `/`, `#`), use URL encoding na `SUPABASE_DB_URL`.

## Rodar localmente

- Front + back juntos: `npm run start`
- Apenas backend: `npm run render-start`
- Apenas frontend: `npm run dev`

## Acesso ao painel administrativo

- URL: `http://localhost:3000/<VITE_ADMIN_PATH>`
- Exemplo padrao: `http://localhost:3000/renovo-admin`
- Login: digite a `ADMIN_API_KEY` configurada no `.env`
- É possível aceitar mais de uma chave em transição: `ADMIN_API_KEY=chave_nova,chave_antiga`

## Fluxo de negocio

1. Cliente solicita agendamento (status `pending`)
2. Salao confirma/rejeita/remarca no painel admin
3. Ao confirmar, o backend cria evento no Google Calendar
4. Notificacoes:
   - Baileys envia mensagem para salao e cliente
   - mensagens recebidas alimentam inbox interno do painel

## Endpoints administrativos extras

- `GET /api/admin/inbox/conversations`
- `GET /api/admin/inbox/conversations/:id/messages`
- `POST /api/admin/inbox/conversations/:id/messages`
- `GET /api/admin/inbox/stream` (SSE realtime)
- `GET /api/admin/whatsapp/status`
- `POST /api/admin/whatsapp/connect`
- `POST /api/admin/whatsapp/disconnect`
- `POST /api/admin/whatsapp/reconnect`

## Endpoints WhatsApp consolidados (v2)

- `GET /api/whatsapp/instance/status`
- `POST /api/whatsapp/instance/create`
- `GET /api/whatsapp/instance/qr`
- `POST /api/whatsapp/instance/refresh-qr`
- `GET /api/whatsapp/conversations`
- `GET /api/whatsapp/conversations/:id`
- `GET /api/whatsapp/conversations/:id/messages`
- `POST /api/whatsapp/messages`
- `POST /api/whatsapp/messages/attachment` (upload binário base64 + fallback por URL)
- `PATCH /api/whatsapp/conversations/:id/assign`
- `PATCH /api/whatsapp/conversations/:id/status`
- `PATCH /api/whatsapp/conversations/:id/tags`
- `POST /api/whatsapp/conversations/:id/notes`
- `GET /api/whatsapp/contacts`
- `GET /api/whatsapp/contact/:id`
- `GET /api/whatsapp/search?q=`
- `POST /api/whatsapp/sync`
  - aceita `?tenant=<slug>` para sincronização Evolution por tenant
  - usa estratégia de auto-descoberta de endpoint (`POST /chat/findContacts/{instance}` e `POST /chat/findChats/{instance}`)

Observações de uso:

- rotas de leitura/escrita operacional aceitam `?tenant=<slug>` para multiempresa
- `POST /api/whatsapp/messages/attachment` aceita:
  - `attachmentBase64`, `mimeType`, `fileName`, `caption` (upload real)
  - `attachmentUrl`, `caption` (fallback por link)

> Estas rotas usam a mesma autenticação administrativa (`x-admin-key`) e mantêm o Chatwoot como camada operacional invisível.

## Estruturas novas de dados WhatsApp

- `whatsapp_conversation_meta` (assignee/status/tags por conversa)
- `whatsapp_internal_notes` (notas internas por conversa)
- `whatsapp_sync_state` (estado e erros de sincronização)
- `whatsapp_contact_map` (mapeamento phone/jid/evolution/chatwoot/crm)
- `whatsapp_conversation_map` (mapeamento thread/chat ids externos)

## Ajustes recomendados de ambiente

- `EVOLUTION_SYNC_MAX_ROWS` (opcional): limita quantos contatos/chats serão processados por sincronização para evitar timeout em bases muito grandes (padrão: `400`).

## Endpoints workbench (abas operacionais)

- `GET /api/admin/workbench/overview?date=YYYY-MM-DD`
- `GET /api/admin/workbench/:entity`
- `POST /api/admin/workbench/:entity`
- `PATCH /api/admin/workbench/:entity/:id`
- `DELETE /api/admin/workbench/:entity/:id`
- `POST /api/admin/workbench/leads/:id/convert`
- `POST /api/admin/workbench/finance/:id/pay`
- `GET /api/admin/workbench/settings`
- `PUT /api/admin/workbench/settings`
- `GET /api/admin/workbench/tenants`
- `POST /api/admin/workbench/tenants`
- `PATCH /api/admin/workbench/tenants/:slug`

## Webhooks de integração (Chatwoot + Evolution)

- `POST /api/integrations/evolution/:tenantSlug/webhook`
- `POST /api/integrations/chatwoot/:tenantSlug/webhook`

> Se configurar segredo no tenant, envie `x-webhook-secret` (ou `?token=`) com o mesmo valor.

## Verificações

- Tipagem: `npm run lint`
- Build: `npm run build`
- Status da integração: `GET /api/integration-status`

## Deploy e infraestrutura

- Guia de proxy/realtime/systemd/Azure: `deploy/whatsapp-infra.md`

## Configurações no painel

- A aba `Configuracoes` do admin exibe apenas campos basicos da plataforma (empresa, telefone, fuso, politica e janela de atendimento).
- Credenciais sensiveis de integracao (Evolution/Chatwoot, tokens e segredos) permanecem no backend e nao sao retornadas pelo endpoint de settings do admin.

## Segurança operacional (WhatsApp)

- Se arquivos de sessao (`.baileys_auth/`) ou `.env` com credenciais vazarem, revogue e gere novas chaves imediatamente.
- Mantenha `SUPABASE_SERVICE_ROLE_KEY` e `ADMIN_API_KEY` apenas no backend.
- Restrinja acesso às rotas `/api/admin/*` em rede privada/proxy sempre que possível.
- Defina `CORS_ORIGINS` explicitamente em producao e evite usar curingas.
- Revise os limites de taxa do WhatsApp admin para reduzir abuso em envio e reconexao.
