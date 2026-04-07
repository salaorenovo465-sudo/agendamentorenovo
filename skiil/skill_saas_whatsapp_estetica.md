# Skill — SaaS de Gestão, Agenda, CRM e WhatsApp para Estética

## Objetivo da skill
Esta skill define a arquitetura funcional de um SaaS voltado para clínicas, estúdios e operações de estética, com foco em:

- gestão operacional do dia a dia
- agenda inteligente
- cadastro e histórico de clientes
- funil de leads e CRM
- atendimento centralizado no WhatsApp
- automações operacionais
- acompanhamento financeiro básico
- analytics operacional
- painel master para gestão da operação SaaS

## Diretriz principal do produto
O sistema **não** deve ser tratado como plataforma de campanhas ou marketing.
O sistema deve ser posicionado como um produto de:

- gestão
- atendimento
- automação operacional
- relacionamento via WhatsApp

## Exclusões obrigatórias
Remover ou evitar módulos separados de:

- campanhas
- marketing
- disparo promocional
- ROI de campanha
- segmentação promocional
- integrações como aba independente

## Regra estrutural obrigatória
Tudo relacionado ao WhatsApp deve ficar centralizado no módulo **WhatsApp**.

Esse módulo deve reunir:

- conversas
- atendimento
- automações de WhatsApp
- conexão do número
- configurações do canal
- logs e monitoramento do canal

A conexão deve considerar uso da biblioteca **Baileys**.

---

# Estrutura do painel do cliente

## 1. Dashboard
### Finalidade
Exibir visão rápida da operação do dia.

### Cards principais
- total de agendamentos do dia
- pendentes
- confirmados
- concluídos
- cancelados
- no-show
- receita prevista do dia
- receita recebida do dia
- taxa de ocupação
- horário de pico

### Blocos recomendados
- próximos atendimentos
- atividade recente
- alertas operacionais
- clientes recorrentes
- top serviços
- top profissionais
- ocupação do dia
- distribuição por status

### Alertas recomendados
- cliente aguardando confirmação
- cliente atrasado
- cancelamento recente
- pagamento pendente
- retorno vencido
- profissional indisponível
- agenda lotada
- cliente VIP chegando

### Ações rápidas
- novo agendamento
- novo cliente
- abrir WhatsApp
- cadastrar serviço
- cadastrar profissional
- registrar pagamento
- bloquear horário

---

## 2. Agenda
### Finalidade
Gerenciar toda a operação de agendamento.

### Funções
- visualização diária
- visualização semanal
- visualização mensal
- visão por profissional
- visão por sala
- visão por unidade
- arrastar e soltar agendamento
- reagendar
- criar encaixe
- bloquear horário
- confirmar presença
- check-in
- marcar como concluído
- cancelar com motivo
- marcar falta/no-show
- adicionar observações internas
- abrir ficha do cliente direto do agendamento
- registrar pagamento dentro do atendimento

### Recursos de apoio
- cores por status
- cores por profissional
- filtros por serviço
- filtros por status
- duração por serviço
- intervalo entre atendimentos
- histórico de alterações do agendamento
- impressão da agenda

---

## 3. Disponibilidade
### Finalidade
Definir regras de ocupação e funcionamento.

### Funções
- horário de funcionamento da empresa
- horários por profissional
- pausas
- folgas
- feriados
- bloqueios manuais
- limite de encaixes
- antecedência mínima
- antecedência máxima
- limite de atendimentos por dia
- tempo de preparação
- tempo de organização entre serviços

---

## 4. Clientes
### Finalidade
Ser o CRM principal da base ativa.

### Funções
- cadastro completo do cliente
- nome
- telefone
- e-mail
- data de nascimento
- observações
- histórico de atendimentos
- histórico de pagamentos
- histórico de mensagens
- preferências
- profissional preferido
- serviço preferido
- tags
- origem do cliente
- status do cliente

### Status recomendados
- novo
- ativo
- recorrente
- VIP
- inativo
- em risco

### Ações dentro da ficha
- abrir conversa no WhatsApp
- criar agendamento
- reagendar
- registrar observação
- ver frequência de retorno
- registrar pagamento
- marcar prioridade
- bloquear cliente
- ver histórico completo

---

## 5. Leads / CRM
### Finalidade
Organizar interessados antes da conversão em cliente.

### Funções
- funil de leads
- novo lead
- contato iniciado
- interessado
- aguardando resposta
- convertido
- perdido
- responsável pelo lead
- origem do lead
- próximo contato
- observações internas
- histórico de movimentações

### Ações
- mover no funil
- abrir conversa no WhatsApp
- converter em cliente
- criar agendamento
- registrar perda com motivo
- criar tarefa de retorno

### Métricas
- total de leads
- total convertidos
- taxa de conversão
- origem com maior conversão
- tempo médio até conversão

---

## 6. WhatsApp
### Finalidade
Centralizar tudo que envolve relacionamento e operação via WhatsApp.

## 6.1 Subaba: Conversas
### Funções
- lista de conversas
- busca por nome, telefone e tag
- histórico completo
- anexos, imagem, áudio e documento
- conversa vinculada ao cliente
- conversa vinculada ao lead
- respostas rápidas
- modelos de mensagem
- notas internas
- etiquetas
- assumir atendimento
- transferir atendimento
- fechar conversa
- reabrir conversa

## 6.2 Subaba: Atendimento
### Funções
- fila de atendimento
- distribuição por atendente
- status da conversa
- aguardando equipe
- aguardando cliente
- encerrada
- prioridade
- tempo de primeira resposta
- tempo médio de atendimento
- histórico de transferência
- visão por operador

## 6.3 Subaba: Automação WhatsApp
### Funções
- confirmação de agendamento
- lembrete automático
- aviso de reagendamento
- aviso de cancelamento
- pós-atendimento
- pedido de avaliação
- reativação de cliente inativo
- mensagem para ausência/no-show
- mensagens por gatilho operacional

## 6.4 Subaba: Conexão
### Regra técnica
A conexão deve considerar uso da biblioteca **Baileys**.

### Funções
- status da conexão
- conectar número
- desconectar número
- reconectar sessão
- QR Code
- nome da instância
- telefone conectado
- data da última conexão
- status da sessão
- logs de conexão
- logs de envio
- logs de erro
- reiniciar sessão
- validar sessão ativa

## 6.5 Subaba: Configurações
### Funções
- mensagem padrão inicial
- mensagem de ausência
- mensagem fora do horário
- mensagens rápidas
- assinatura padrão
- nome do atendente
- horário de atendimento do WhatsApp
- roteamento de conversas
- regras de atendimento
- vinculação automática com cliente/lead

## 6.6 Indicadores do módulo WhatsApp
- conversas abertas
- aguardando resposta
- atendimentos encerrados
- tempo médio de resposta
- mensagens enviadas
- falhas de envio
- operadores ativos

---

## 7. Automações
### Finalidade
Executar fluxos operacionais automáticos do sistema.

### Funções
- criar fluxo
- editar fluxo
- ativar/desativar
- testar automação
- histórico de execução
- logs
- erros por fluxo

### Gatilhos
- novo agendamento
- confirmação de agendamento
- cancelamento
- reagendamento
- novo lead
- novo cliente
- cliente inativo
- atendimento concluído
- pagamento registrado
- no-show

### Ações
- enviar mensagem no WhatsApp
- atualizar status
- adicionar tag
- criar tarefa
- mover lead
- registrar observação
- abrir atendimento
- criar lembrete interno

### Fluxos principais
- confirmação automática
- lembrete pré-atendimento
- aviso de reagendamento
- recuperação de cliente inativo
- solicitação de avaliação
- retorno sugerido
- mensagem de ausência

---

## 8. Serviços
### Finalidade
Organizar o catálogo operacional dos serviços.

### Funções
- nome do serviço
- categoria
- duração
- valor
- descrição
- status ativo/inativo
- profissionais habilitados
- sala/equipamento necessário
- tempo de preparo
- intervalo entre atendimentos
- retorno recomendado

### Extras úteis
- combos
- pacotes
- serviços relacionados
- observações internas
- ordem de exibição

---

## 9. Profissionais
### Finalidade
Gerenciar equipe e capacidade operacional.

### Funções
- cadastro do profissional
- especialidades
- serviços que executa
- agenda individual
- jornada de trabalho
- folgas
- status ativo/inativo
- meta individual
- observações
- usuário vinculado ao sistema

### Indicadores
- total de atendimentos
- taxa de ocupação
- receita gerada
- serviços mais feitos
- cancelamentos
- no-show na agenda dele
- avaliação média

---

## 10. Financeiro
### Finalidade
Acompanhamento básico, sem complexidade contábil.

### Funções
- receita prevista
- receita recebida
- pagamentos pendentes
- pagamentos por período
- valor por atendimento
- forma de pagamento
- status do pagamento

### Status
- pendente
- pago
- parcial
- cancelado
- estornado

### Filtros
- data
- profissional
- serviço
- cliente
- status

### Resumos
- total do dia
- total da semana
- total do mês
- valor pendente
- valor recebido
- quantidade de pagamentos

### Ações
- registrar pagamento
- alterar status
- ver histórico
- exportar CSV simples

### Exclusões
Não incluir:
- contas a pagar
- DRE
- impostos
- conciliação complexa
- centro de custo
- caixa avançado

---

## 11. Analytics
### Finalidade
Acompanhar desempenho operacional e indicadores do negócio.

### Subabas
- geral
- agenda
- clientes
- serviços
- profissionais
- WhatsApp
- financeiro básico

### Métricas principais
- total de agendamentos
- taxa de confirmação
- taxa de cancelamento
- taxa de no-show
- taxa de conclusão
- receita prevista
- receita recebida
- ticket médio
- clientes novos
- clientes recorrentes
- frequência de retorno
- serviço mais agendado
- profissional com maior ocupação
- horários de pico
- dias mais fortes
- tempo médio de resposta no WhatsApp

### Filtros
- período
- profissional
- serviço
- unidade
- status

### Exportação
- CSV
- PDF simples

---

## 12. Avaliações
### Finalidade
Medir satisfação e qualidade do atendimento.

### Funções
- pesquisa de satisfação
- nota por atendimento
- nota por profissional
- histórico de avaliações
- comentários
- alerta de nota baixa
- média geral
- NPS simples

### Ações automáticas
- solicitar avaliação após atendimento
- alertar equipe em caso de nota baixa

---

## 13. Tarefas
### Finalidade
Organizar pendências operacionais e follow-ups.

### Funções
- criar tarefa
- definir responsável
- prazo
- prioridade
- checklist
- observações
- vincular cliente
- vincular lead
- vincular atendimento
- tarefa recorrente
- pendente / concluída

### Usos práticos
- retornar cliente
- confirmar atendimento manual
- resolver pendência
- conferir pagamento
- acompanhar lead parado

---

## 14. Configurações
### Finalidade
Controlar parâmetros do sistema do cliente.

### Subabas
- empresa
- agenda
- serviços
- usuários
- permissões
- notificações
- automações
- branding
- segurança

### Funções
- nome da empresa
- logo
- cores do sistema
- horários
- política de cancelamento
- mensagens padrão do sistema
- dados da unidade
- fuso horário
- permissões por perfil
- auditoria simples

---

# Menu lateral final do painel do cliente
1. Dashboard
2. Agenda
3. Disponibilidade
4. Clientes
5. Leads / CRM
6. WhatsApp
7. Automações
8. Serviços
9. Profissionais
10. Financeiro
11. Analytics
12. Avaliações
13. Tarefas
14. Configurações

---

# Estrutura do painel master

## 1. Visão Geral
### Funções
- total de empresas ativas
- empresas em trial
- empresas bloqueadas
- total de usuários
- total de mensagens
- total de agendamentos processados
- falhas do sistema
- saúde geral da plataforma

---

## 2. Empresas
### Funções
- listar empresas
- criar empresa
- editar empresa
- ativar/desativar
- vincular plano
- domínio/subdomínio
- ver uso da conta
- acessar conta do cliente
- histórico de alterações

---

## 3. Onboarding
### Funções
- checklist de implantação
- cadastro inicial
- configuração de agenda
- configuração dos serviços
- configuração dos profissionais
- ativação do WhatsApp
- ativação das automações
- status do onboarding
- responsável interno

---

## 4. Planos e Assinaturas
### Funções
- criar planos
- definir limites
- recursos liberados
- quantidade de usuários
- quantidade de atendentes
- quantidade de conexões
- valor do plano
- trial
- vencimento
- bloqueio por inadimplência

---

## 5. WhatsApp Manager
### Finalidade
Gerir tecnicamente as conexões e sessões de WhatsApp de todos os clientes.

### Subabas
- conexões
- sessões
- QR Codes
- logs
- monitoramento
- filas
- falhas

### Funções
- status das conexões
- reconectar sessão
- desconectar sessão
- reiniciar sessão
- visualizar número conectado
- verificar sessão inválida
- logs de envio
- logs de recebimento
- logs de erro
- monitoramento por empresa

---

## 6. Automações Globais
### Funções
- templates de fluxos
- clonar automação entre clientes
- biblioteca de fluxos
- ativar/desativar padrão
- versionamento
- logs de execução

---

## 7. Templates do Sistema
### Funções
- respostas rápidas globais
- mensagens padrão
- mensagens de confirmação
- mensagens de lembrete
- mensagens pós-atendimento
- mensagens de avaliação
- mensagens de ausência

---

## 8. Logs e Monitoramento
### Funções
- logs do sistema
- logs de mensagens
- logs de automações
- logs de erro
- histórico de eventos
- reprocessamento
- filtro por empresa
- filtro por período

---

## 9. Suporte
### Funções
- tickets
- status
- prioridade
- responsável
- histórico
- empresa vinculada
- base de conhecimento interna

---

## 10. Cobrança
### Finalidade
Acompanhamento básico da mensalidade dos clientes do SaaS.

### Funções
- mensalidade do cliente
- status do pagamento
- vencimento
- histórico de cobrança
- bloquear/desbloquear acesso
- trial
- renovação

---

## 11. Usuários e Permissões
### Funções
- usuários internos
- perfis
- permissões
- acesso por módulo
- auditoria de acesso

---

## 12. White-label
### Funções
- logo por cliente
- cor principal
- nome do sistema
- domínio personalizado
- favicon
- tela de login personalizada

---

## 13. Configurações Globais
### Funções
- parâmetros do sistema
- regras padrão
- segurança
- limite de uso
- variáveis globais
- configurações de ambiente
- auditoria global

---

# Menu lateral final do painel master
1. Visão Geral
2. Empresas
3. Onboarding
4. Planos e Assinaturas
5. WhatsApp Manager
6. Automações Globais
7. Templates do Sistema
8. Logs e Monitoramento
9. Suporte
10. Cobrança
11. Usuários e Permissões
12. White-label
13. Configurações Globais

---

# Regras de UX e arquitetura

## Organização do produto
- o sistema deve priorizar clareza visual
- o menu lateral deve ser curto, limpo e hierárquico
- as informações do dia devem aparecer primeiro
- as ações rápidas devem estar sempre visíveis
- os status devem usar cores consistentes
- o módulo WhatsApp deve ser tratado como hub operacional

## Regras de nomenclatura
Usar nomes simples e fortes:
- Dashboard
- Agenda
- Disponibilidade
- Clientes
- Leads / CRM
- WhatsApp
- Automações
- Serviços
- Profissionais
- Financeiro
- Analytics
- Avaliações
- Tarefas
- Configurações

Evitar nomes genéricos ou confusos para o usuário final.

## Regra de centralização do WhatsApp
Qualquer função ligada a:
- mensagens
- atendimento
- QR Code
- conexão
- sessão
- respostas rápidas
- fila
- roteamento
- logs do canal

deve ficar dentro do módulo **WhatsApp**, e não espalhada pelo restante do sistema.

---

# Fases sugeridas de implementação

## Fase 1
- Dashboard
- Agenda
- Disponibilidade
- Clientes
- Serviços
- Profissionais
- WhatsApp

## Fase 2
- Leads / CRM
- Automações
- Financeiro básico
- Analytics
- Configurações

## Fase 3
- Avaliações
- Tarefas
- painel master
- white-label
- logs avançados

---

# Posicionamento final do produto
Este SaaS deve ser apresentado como:

**um sistema de gestão, atendimento e automação via WhatsApp para negócios de estética**

Não como plataforma de campanhas, nem como ERP contábil.

O diferencial do produto deve estar em:
- operação do dia a dia
- agenda inteligente
- relacionamento com cliente
- atendimento centralizado no WhatsApp
- automações úteis e práticas
- visão clara do negócio
