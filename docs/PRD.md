# PRD — Reconfirmação de Hotéis (Web)

**Status:** Rascunho para discussão
**Base de referência:** `reconfirmacao_Hoteis/` (app desktop NiceGUI, em produção)
**Autor:** Mauricio Santos (Snow Operadora) + Claude Code
**Data:** 2026-10-09

---

## 1. Contexto e problema

### 1.1 Como funciona hoje (sistema de referência)

O time de produtos da Snow usa um aplicativo desktop (Python + NiceGUI, empacotado com PyInstaller) instalado localmente em cada máquina, operando sobre uma pasta de rede compartilhada. O fluxo é:

1. O consultor recebe/gera uma planilha **RoomingList** (.xlsx, cabeçalho sempre na linha 5) e a carrega no app.
2. Um módulo (`enviar_email.py`) lê as reservas, monta um e-mail HTML (PT/ES/EN conforme o país do hóspede) pedindo ao hotel que confirme a reserva, o regime alimentar e o HCN (número de confirmação interno do hotel), e informe o status de pagamento. O envio é feito via **Microsoft Graph API** (conta corporativa única, autenticada por **MSAL**).
3. Cada envio é registrado em `enviados.xlsx`, com `conversation_id`/`internet_message_id` do Graph para permitir rastrear a thread depois.
4. Periodicamente (manual ou agendado a cada N minutos), `respostas.py` busca no Graph as mensagens da mesma conversa, filtra respostas automáticas (out-of-office, bounce, etc.), e envia o corpo da resposta para a **OpenAI** (modelo `gpt-5-nano`, JSON Schema estrito) para extrair: reserva confirmada (S/N/indefinido), regime alimentar confirmado, número de confirmação do hotel (inclusive múltiplas confirmações por hóspede, mapeadas por nome), status de pagamento, divergências, pendências e um resumo. Há fallback por regex para respostas em formato estruturado e para extração de número quando a IA não captura.
5. O sistema consolida tudo em `auditoria_reservas.xlsx`, com status calculado (`CONFIRMADA`, `AGUARDANDO RESPOSTA`, `REVISAR`, `REVISAR DIVERGÊNCIA`, `RESPONDIDO AO HOTEL`, `ERRO NO ENVIO`, `NÃO CONFIRMADA`), aba de resumo e formatação condicional.
6. O dashboard (dentro do próprio app) permite filtrar, abrir detalhes de uma reserva, editar status/campos manualmente, e **responder ao hotel diretamente pela interface** (reply preservando a thread do Graph), reabrindo o ciclo de aguardando-resposta.
7. Como múltiplos usuários podem rodar o `.exe` apontando para a mesma pasta de rede, existe um **lock de arquivo manual** (`bloqueio_rede.py`, via `msvcrt`) para serializar operações de escrita e evitar corrupção dos `.xlsx`.
8. Existe ainda um agente auxiliar (`agent.py`) que usa a API Tavily para *tentar* descobrir o e-mail de reservas de um hotel a partir do nome, escrevendo o resultado de volta no mesmo xlsx — mas é um script solto, não integrado ao fluxo principal, sem cache nem persistência entre execuções.
9. **O arquivo RoomingList cru (como o consultor efetivamente recebe, ex. `roomingList.xlsx` na raiz do projeto de referência) não contém as colunas `e-mail` nem `pais`** — essas colunas são exigidas por `enviar_email.py` (`colunas_necessarias`), mas hoje são preenchidas **fora do sistema**, manualmente: o consultor cola o conteúdo do xlsx em uma LLM de chat com um prompt pedindo para pesquisar na web, para cada hotel, o e-mail de reservas **e o país**, e devolver o xlsx com as duas colunas novas adicionadas. Só depois desse passo manual o arquivo é carregado no app. Ou seja, a busca automatizada de e-mail (`agent.py`/Tavily) e esse processo manual via chat coexistem hoje como dois caminhos paralelos e não integrados para o mesmo problema.
10. **O xlsx cru tem granularidade de hóspede, não de reserva**: um mesmo `Localizador` se repete em várias linhas quando há múltiplos hóspedes/quartos na mesma reserva (ex.: 4 linhas com o localizador `9QGJZN`, uma por par de hóspedes). O `enviar_email.py` atual itera linha a linha (`reservas_para_enviar.iterrows()`) sem agrupar por localizador, o que significa que, no exemplo real analisado, o mesmo hotel receberia **4 e-mails separados para a mesma reserva**, cada um citando hóspedes diferentes — um comportamento que gera ruído para o hotel e que precisa de uma decisão de produto na nova versão (ver seção 4.2.7).

### 1.2 Dores identificadas

- **Dados em Excel como banco de dados**: três planilhas (`enviados`, `respostas`, `auditoria`) fazem o papel de tabelas relacionais, sem transações, índices ou integridade referencial. Qualquer leitura/escrita concorrente depende do lock manual de arquivo.
- **"Multiusuário" só por acidente**: não há conceito de usuário, sessão ou permissão — é um `.exe` local por máquina apontando pra uma pasta compartilhada. Dois consultores processando ao mesmo tempo é ativamente desencorajado no próprio README.
- **Sem autenticação de verdade**: a conta de e-mail é fixa e compartilhada (`produtos1@bvgroup.com.br`); não há como saber *qual consultor* enviou ou respondeu o quê.
- **Busca de e-mail e país do hotel é um processo manual via chat, fora do sistema**: antes mesmo de abrir o app, o consultor cola o xlsx cru numa LLM de chat genérica pedindo para pesquisar e-mail de reservas e país de cada hotel; o `agent.py` (Tavily) existe como alternativa mas não é reaproveitado — cada novo roomingList repete a busca do zero para hotéis já contatados antes, inclusive para o país, que normalmente não muda nunca para o mesmo hotel.
- **Sem banco de contatos de hotel**: não existe persistência de "este hotel, este e-mail, este país, confiável/desatualizado", então a cada novo embarque o mesmo hotel é pesquisado de novo — inclusive dado que não muda, como o país.
- **Risco real de duplicidade de envio**: como não há checagem de "esta reserva já foi processada antes", subir a mesma planilha (ou uma planilha com reservas que já apareceram em um envio anterior) por engano reenvia e-mails de reconfirmação duplicados ao hotel — já aconteceu/pode acontecer sem que o sistema avise o consultor.
- **Observabilidade fraca**: logs em arquivo texto local por máquina; sem dashboard operacional de erros, sem alertas.
- **Distribuição operacional pesada**: atualização = recompilar o `.exe` e redistribuir na rede; sem versionamento centralizado, rollback é manual.
- **Risco de segurança grave já identificado**: o arquivo `hoteis.txt` do projeto de referência contém uma **chave de API da OpenAI em texto puro, versionada no repositório git**. Isso deve ser tratado como incidente de segurança (rotacionar a chave assim que possível) e como requisito não funcional inegociável do novo sistema (nenhum segredo em repositório; uso de secret manager / variáveis de ambiente do Supabase).
- **Sem papéis/permissões**: qualquer pessoa com acesso ao `.exe` e à pasta de rede pode editar qualquer campo de qualquer reserva, sem trilha de quem alterou o quê.

### 1.3 O que já funciona bem e deve ser preservado

- O **motor de interpretação de e-mail por IA** (extração estruturada via JSON Schema, detecção de múltiplas confirmações por hóspede, fallback regex, filtro de mensagens automáticas, acúmulo de estado ao longo de tréplicas) é sofisticado e deve ser portado com o mínimo de regressão possível.
- A lógica de **status de auditoria** (regras de quando algo é CONFIRMADA vs REVISAR vs REVISAR DIVERGÊNCIA) encapsula bastante conhecimento de negócio real e deve ser mantida como núcleo de regras, não reescrita do zero.
- O fluxo de **resposta ao hotel preservando a thread** (createReply → patch → send do Graph) funciona e deve ser mantido.
- A textura multilíngue do e-mail (PT/ES/EN por país) é um requisito de negócio real (Snow opera na América Latina).

---

## 2. Objetivo da nova versão

Transformar o aplicativo desktop em um **sistema web multiusuário**, com autenticação real, banco de dados relacional (Supabase/Postgres) no lugar das planilhas, backend de automação robusto, e evoluções de produto que reduzem trabalho manual do consultor — principalmente a descoberta e manutenção de contatos de hotel.

Não é objetivo deste PRD definir milestones de construção (isso virá depois, quando formos implementar) — é objetivo alinhar **o que** construir e **por quê**, para então quebrar em etapas.

---

## 3. Personas e permissões

| Persona | Quem é | Principais necessidades |
|---|---|---|
| **Consultor de produtos** | Time de produtos da Snow que opera reservas no dia a dia | Subir roomingList, acompanhar status de confirmações, responder hotéis, ver pendências que exigem ação |
| **Administrador** | Gestor da área / TI | Convidar e desativar usuários, gerenciar permissões, ver auditoria completa (quem fez o quê), configurar integrações (caixa de e-mail, chaves de API) |

Requisitos de acesso:
- Login obrigatório (Supabase Auth).
- Toda ação sensível (editar status, enviar resposta a hotel, reenviar e-mail) fica associada ao usuário autenticado — auditoria por usuário, não só por timestamp.
- Admin pode desativar usuário sem apagar seu histórico de ações.
- **Visão de dados compartilhada (decidido):** qualquer consultor autenticado vê todas as reservas, envios e respostas do sistema, independentemente de quem os processou — não há escopo "minhas reservas vs. reservas de outros". A permissão diferencia apenas consultor vs. admin (admin acessa também gestão de usuários e configuração de integrações), não visibilidade de dados entre consultores. A autoria (quem enviou, quem editou, quem respondeu) continua registrada para fins de auditoria (seção `audit_log`), mas não limita o que cada consultor pode ver.

---

## 4. Escopo funcional

### 4.1 Preservado do sistema de referência (reimplementado na nova stack)

1. **Upload de RoomingList (.xlsx)** com validação de colunas obrigatórias e preview antes de confirmar o envio em massa.
2. **Envio de e-mails de reconfirmação** multilíngue (PT/ES/EN) via Microsoft Graph, com corpo HTML e assinatura. **Mudança de comportamento em relação ao sistema de referência (decidido):** 1 e-mail por `Localizador`, consolidando todos os hóspedes (pax)/quartos daquele localizador em uma única mensagem — não 1 e-mail por linha do xlsx. O sistema de referência hoje envia 1 e-mail por linha, o que fragmenta uma mesma reserva em múltiplos e-mails quando há vários quartos/hóspedes sob o mesmo localizador (ver seção 1.1, item 10); isso deixa de acontecer na nova versão.
3. **Leitura e interpretação de respostas dos hotéis** via IA, preservando: detecção de múltiplas confirmações por hóspede, fallback regex, filtro de mensagens automáticas (out-of-office/bounce), acúmulo de estado ao longo de tréplicas (a confirmação de uma mensagem anterior não "some" quando a próxima resposta só fala de outro assunto).
4. **Leitura automática agendada** (configurável) além da leitura manual sob demanda.
5. **Dashboard de auditoria** com os mesmos status de negócio (`CONFIRMADA`, `AGUARDANDO RESPOSTA`, `REVISAR`, `REVISAR DIVERGÊNCIA`, `RESPONDIDO AO HOTEL`, `ERRO NO ENVIO`, `NÃO CONFIRMADA`), filtros por status/hotel/localizador/data/pagamento/tipo de pendência, modal de detalhe com histórico cronológico da conversa.
6. **Edição manual de campos de auditoria** (status, confirmação, regime alimentar, pagamento, tipo de pendência) com validação de regra de negócio (ex.: não pode marcar CONFIRMADA sem regime alimentar confirmado).
7. **Resposta ao hotel pela interface**, preservando a thread de e-mail (reply real via Graph, não um novo e-mail solto).
8. **Reenvio de e-mails** para registros com erro ou pendentes, com edição de e-mail/assunto do destinatário antes do reenvio.
9. **Exportação para Excel** das reservas filtradas/selecionadas (uso continua existindo: relatórios para gestão, envio por e-mail para terceiros).

### 4.2 Novas funcionalidades (evolução proposta)

1. **Banco de contatos de hotéis** (nova entidade central)
   - Tabela `hotels` com: nome(s)/variações conhecidas, e-mail(s) de reservas, **país**, idioma preferencial, confiabilidade do contato (confirmado manualmente vs. obtido por busca automática vs. desatualizado), data da última confirmação, histórico de e-mails que já falharam (bounce).
   - Ao processar uma nova RoomingList, o sistema primeiro **busca o hotel na base**; só aciona a busca automática (ver próximo item) para hotéis desconhecidos ou com contato marcado como obsoleto. Isso vale tanto para e-mail quanto para país — um hotel já conhecido não deve gerar nenhuma chamada de busca nova, para nenhum dos dois campos.
   - Matching por nome de hotel é impreciso na prática (varia grafia, acentuação, sufixos tipo "Resort & Spa" vs "Resort"); o sistema deve ter uma etapa de **reconciliação/matching fuzzy** com confirmação humana quando a confiança for baixa, para não duplicar hotéis nem atribuir reserva ao hotel errado.
   - Interface própria para consultores/admin gerenciarem a base de hotéis manualmente (criar, corrigir e-mail/país, mesclar duplicados).

2. **Automação da busca de e-mail e país do hotel (substitui o passo manual via chat + evolui o `agent.py`)**
   - Hoje esse enriquecimento (e-mail de reservas + país) é feito **fora do sistema**, colando o xlsx cru numa LLM de chat genérica antes mesmo de abrir o app (ver seção 1.1, item 9). Isso deixa de existir: o novo sistema deve aceitar o **RoomingList cru**, sem e-mail nem país, e resolver os dois automaticamente no backend.
   - Abordagem recomendada: usar **uma única chamada Tavily por hotel novo** para resolver e-mail e país juntos (ex.: uma busca tipo "e-mail de reservas e país/cidade do hotel X"), em vez de duas chamadas separadas — mantém o padrão de custo já estimado na seção 12 em vez de dobrá-lo. País muda raríssimo para um hotel já cadastrado, então na prática essa chamada só acontece uma vez por hotel na vida do sistema (ao contrário do e-mail, que pode precisar ser revalidado por bounce).
   - Precisa de **confirmação humana antes do primeiro uso** de um e-mail descoberto automaticamente (evita enviar e-mail de reserva sensível para um endereço errado encontrado por busca na web) — ficar como sugestão até o consultor validar, depois o contato vira "confirmado". País tem risco bem menor de erro grave (não aciona envio indevido), então pode ser aceito automaticamente com flag "a confirmar" apenas para revisão posterior, não como bloqueio do fluxo.
   - Registrar qual provedor de busca foi usado e o nível de confiança, para cada um dos dois campos.

3. **Detecção de bounce e e-mail inválido**
   - Hoje o sistema não trata explicitamente "e-mail não existe"/bounce do Graph; isso deveria rebaixar a confiabilidade do contato na base de hotéis automaticamente e sinalizar para revisão humana.

4. **Prevenção de envio duplicado (deduplicação de reserva)**
   - A unidade de envio é o **`Localizador`** (consolidando todos os hóspedes daquele localizador em 1 e-mail — ver item 4.1.2). Logo, a chave de deduplicação também é por localizador: antes de processar qualquer RoomingList (novo upload ou reenvio de um arquivo antigo por engano), o sistema deve checar, para cada `Localizador` presente na planilha, se já existe um envio registrado para aquele hotel + localizador.
   - Reservas (localizadores) já enviados anteriormente devem ser **automaticamente ignorados no envio** (não reenviados) e reportados ao consultor como "já processado anteriormente em [data]" — nunca falhar silenciosamente nem enviar de novo sem avisar.
   - Caso uma nova linha apareça depois para um localizador já enviado (ex.: hóspede adicionado à reserva depois do primeiro envio), o sistema deve sinalizar isso como "reserva alterada, requer reenvio/complemento manual" em vez de simplesmente ignorar ou duplicar — fica como ponto a detalhar na fase de design técnico.
   - Só os localizadores genuinamente novos da planilha devem gerar e-mail e novo registro.

5. **Notificações**
   - Notificar o consultor responsável quando: uma resposta de hotel precisa de revisão humana (`REVISAR`/`REVISAR DIVERGÊNCIA`), um envio falhou, ou um hotel não respondeu depois de X dias (SLA configurável).
   - Canal inicial: notificação in-app + e-mail; Slack/Teams como possível extensão futura (não neste MVP).

6. **Painel administrativo**
   - Gestão de usuários (convidar, desativar, redefinir papel).
   - Configuração de integrações: conta(s) de e-mail do Graph, chave da OpenAI, provedor de busca de contatos — tudo via secret manager, nunca em texto puro no repo ou no banco sem criptografia.
   - Visão de custo de IA (o sistema de referência já calcula custo de tokens OpenAI por execução — preservar e agregar por período/usuário/hotel).

7. **Multiusuário real com dados compartilhados entre o time**
   - Cada consultor pode operar simultaneamente sem lock de arquivo (resolvido naturalmente pelo Postgres).
   - **Decidido**: a visão de dados é compartilhada entre todo o time de produtos — todo consultor vê todas as reservas, envios e respostas, não só os que ele mesmo processou (ver seção 3). O RLS do Supabase deve refletir isso: a política de leitura para `role = consultant` é "todas as linhas", não filtrada por autoria.

### 4.3 Fora de escopo nesta fase (mencionar, não construir)

- Integração com sistemas de reservas/PMS dos hotéis (fica para uma fase futura, se fizer sentido).
- Múltiplas operadoras/tenants (o sistema é para a Snow; multi-tenant não é requisito agora).
- App mobile nativo (web responsivo é suficiente para o caso de uso).

---

## 5. Arquitetura técnica proposta

### 5.1 Stack

| Camada | Tecnologia | Observação |
|---|---|---|
| Hospedagem | **Vercel** (decidido — ver seção 10, item 5) | Define restrições diretas na linha "Jobs em background" abaixo |
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind CSS | SSR/SSG onde fizer sentido para dashboard; client-side para interações de tabela/filtros |
| Backend / API | Next.js API Routes / Route Handlers (Node.js) na Vercel | Processos longos (envio em massa, leitura de e-mails, chamadas de IA) não devem rodar na request HTTP — ver 5.3 |
| Banco de dados | Supabase (Postgres) | Substitui as 3 planilhas; schema relacional com integridade referencial |
| Autenticação | Supabase Auth | E-mail/senha ou SSO corporativo (Microsoft, já que a empresa usa M365) — avaliar login via Microsoft Entra ID para alinhar com a conta já usada no Graph |
| Storage de arquivos | Supabase Storage | Upload de RoomingList original, anexos recebidos de hotéis, export de relatórios |
| Jobs em background | **Vercel Cron Jobs** disparando Route Handlers curtos e idempotentes, ou serviço externo tipo Inngest/Trigger.dev (ambos com integração nativa à Vercel) | Funções serverless da Vercel têm timeout de execução e não suportam worker de longa duração/polling contínuo — envio em massa e leitura periódica de respostas precisam ser desenhados como lotes/páginas processados em execuções curtas e idempotentes, retomáveis a cada disparo do cron, nunca como um processo que fica rodando indefinidamente |
| Integração e-mail | Microsoft Graph API, **app registration dedicado com client credentials flow** (decidido — ver seção 10, item 1) | Única conta de envio/recebimento, `produtos1@bvgroup.com.br`, é requisito mandatório do cliente; substitui o `acquire_token_interactive()` do sistema de referência (inviável num backend web) por autenticação de aplicação (client ID + client secret + tenant ID, permissões de aplicação `Mail.Read`/`Mail.Send` via admin consent) |
| IA de interpretação | OpenAI (mesma lógica de JSON Schema estrito) | Portar prompt e schema do `respostas.py` quase 1:1 inicialmente, para não perder a qualidade já calibrada em produção |
| Busca de contato de hotel | Tavily (ou equivalente) | Mesma API já usada no `agent.py` de referência |

### 5.2 Modelo de dados (rascunho inicial — a refinar na fase de design técnico)

**Decisão de arquitetura (confirmada em 2026-10-13, ver seção 10, itens 8-9): este sistema usará o mesmo projeto Supabase do TripQuote** (outro produto já publicado da mesma empresa), em vez de um projeto Supabase separado. Motivo: login compartilhado (mesmo e-mail/senha nas duas ferramentas) só é natural quando os dois sistemas apontam para o mesmo `auth.users` — Supabase Auth é por projeto, então dois projetos Supabase exigiriam sincronizar usuários/senhas manualmente entre bancos, o que é pior do que compartilhar um projeto só.

Inspecionamos o schema real do projeto Supabase do TripQuote (via API, 2026-10-13) e hoje ele tem 8 tabelas: `audit_log`, `branding_settings`, `generations`, `model_pricing`, `profiles`, `prompt_versions`, `quote_attachments`, `quotes`. Duas delas colidem com nomes que este PRD havia planejado — e nos dois casos a resposta é **reaproveitar a tabela existente, não recriar**:

- **`profiles`** — já existe e já é *exatamente* o modelo necessário aqui: `id` (uuid, FK para `auth.users`), `email`, `full_name`, `role` (enum `public.user_role`: `consultant` | `admin`), `active` (boolean), `created_at`/`updated_at`. Este sistema reusa esta tabela tal como está — nenhuma migration nova para papéis/usuários. Um consultor ou admin já cadastrado no TripQuote automaticamente tem conta (e papel) válidos aqui também.
- **`audit_log`** — já existe e já é genérica por design: `actor_id` (FK para `profiles.id`), `action`, `entity_type`, `entity_id`, `metadata` (jsonb), `created_at`; todo insert é feito via `SUPABASE_SERVICE_ROLE_KEY` no backend (sem policy de INSERT para o client). Este sistema reusa esta tabela, usando um `entity_type` próprio (ex.: `reservation`, `email_send`, `hotel_reply`) para não se confundir com as ações do TripQuote (que hoje usa `entity_type` ligado a `quotes`).

Entidades **novas**, exclusivas deste sistema — todas criadas em um **schema Postgres dedicado (`reconfirmacao`, decidido em 2026-10-13 — ver seção 10, item 9)**, não no `public`, para isolar por completo o domínio de reconfirmação de hotéis do restante do schema do TripQuote e eliminar qualquer risco de colisão de nomes futura:
- `reconfirmacao.hotels` (contato central: nome, variações de nome, e-mail(s), país, idioma, confiabilidade, última confirmação)
- `reconfirmacao.reservations` (dados vindos do RoomingList: localizador, localizador externo, hóspedes, datas, tipo de habitação, regime alimentar, fornecedor, hotel_id)
- `reconfirmacao.email_sends` (substitui `enviados.xlsx`: reserva, destinatário, assunto, graph ids, status, tipo de envio inicial/resposta manual)
- `reconfirmacao.hotel_replies` (substitui `respostas.xlsx`: resposta recebida, campos extraídos pela IA, custo/tokens, método de interpretação)
- `reconfirmacao.audit_status` (view materializada ou tabela derivada, equivalente a `auditoria_reservas.xlsx`, recalculada a cada novo envio/resposta)

`profiles` e `audit_log` continuam no `public` (onde já estão hoje), compartilhadas entre os dois produtos; `actor_id`/FKs em `reconfirmacao.*` apontam de volta para `public.profiles`. Toda tabela nova do domínio de reconfirmação — inclusive qualquer uma que surja depois deste PRD — deve nascer em `reconfirmacao`, nunca em `public`.

### 5.3 Pontos de atenção arquitetural (importantes para não repetir os problemas atuais)

- **Processamento assíncrono de verdade**: envio em massa de e-mails e leitura periódica de respostas precisam rodar como jobs de background (cron/worker), não como chamada bloqueante numa rota HTTP, para suportar volume e múltiplos usuários disparando ações ao mesmo tempo.
- **Idempotência**: o sistema atual já se preocupa com isso (evita duplicar envio/resposta via `internet_message_id`); isso deve virar constraint de banco (unique key), não só verificação em código.
- **Segredos**: toda credencial (Graph client ID/secret/tenant ID, OpenAI key, Tavily key, Supabase service role key/access token, Google Places key etc.) deve viver **exclusivamente em variáveis de ambiente no arquivo `.env` na raiz do projeto** — nunca hardcoded no código-fonte. O `.env` nunca é commitado (precisa estar no `.gitignore` desde o primeiro commit) e nunca é copiado para fora da raiz do projeto. Em produção, as mesmas variáveis são configuradas como env vars do provedor de hosting (Vercel ou equivalente) e do Supabase, a partir do mesmo `.env` local — nunca digitadas direto no painel sem estarem também documentadas no `.env.example` do repositório.
  - Isso corrige dois problemas reais encontrados no sistema de referência: (1) a chave OpenAI em texto puro e versionada em `hoteis.txt` (já registrado como incidente na seção 1.2); (2) `autenticar_email.py` tem `CLIENT_ID`, `TENANT_ID` e `EMAIL_AUTORIZADO` **hardcoded diretamente no código-fonte** (não em variável de ambiente) — mesmo não sendo segredos no sentido estrito (client ID de app público, não um secret), esse padrão de hardcode é exatamente o que a nova versão deve evitar: qualquer dado de configuração/credencial de integração (IDs de tenant, client ID, e-mail de conta de serviço, URLs de API) pertence ao `.env`, não ao código.
  - Nenhum segredo deve aparecer em: código-fonte, migrations SQL versionadas, logs, mensagens de commit ou nomes de arquivo.
- **Rate limit e custo de IA**: preservar o cálculo de custo de tokens já existente e expor no painel admin; considerar cache/fallback regex antes de chamar IA (já existe no sistema de referência — manter essa ordem de prioridade: regex → IA).
- **Isolamento dentro do banco compartilhado**: como este sistema divide o projeto Supabase com o TripQuote, as políticas RLS das tabelas novas (`hotels`, `reservations`, `email_sends`, `hotel_replies`, `audit_status`) precisam ser escritas para este sistema especificamente — nunca copiar/colar uma policy do TripQuote sem revisar, e vice-versa. Um usuário com `role = consultant` em `profiles` deve conseguir usar os dois sistemas, mas os dados de um não podem vazar para telas do outro. Rodar o agente `supabase-rls-reviewer` (já usado no TripQuote) em toda migration nova deste sistema.

---

## 6. Requisitos não funcionais

- **Auditabilidade**: toda alteração de status/campo de reserva deve ser rastreável a um usuário e timestamp.
- **Segurança**: autenticação obrigatória, segredos fora do código, RLS (Row Level Security) do Supabase configurado desde o início — não como retrofit.
- **Confiabilidade de envio**: nenhuma reserva deve ficar "perdida" entre upload e confirmação; cobrir com testes os caminhos de erro do Graph (token expirado, e-mail inválido, rate limit).
- **Internacionalização do conteúdo de e-mail**: manter PT/ES/EN por país do hóspede (requisito de negócio já validado em produção).
- **Performance**: dashboard precisa responder bem com histórico de múltiplas temporadas de reservas (o sistema atual já acumula planilhas grandes) — paginação/filtros no banco, não client-side em dataset completo.

---

## 7. Estratégia de testes e isolamento de ambientes (sem dados/envios reais)

Requisito transversal a toda etapa de implementação: **nenhum teste automatizado ou manual em desenvolvimento pode gerar efeito colateral real em sistemas externos** — nem e-mail de teste chegando a um hotel de verdade, nem gasto real de créditos de API, nem dado de teste poluindo a base de produção. Isso vale para toda integração externa do sistema (Microsoft Graph, OpenAI, Tavily), não só e-mail.

### 7.1 Microsoft Graph (envio/leitura de e-mail)

- **Nunca testar contra a caixa de produção (`produtos1@bvgroup.com.br`) nem contra endereços reais de hotel.** Todo teste de envio (manual ou automatizado) usa uma **conta de e-mail mockada/sandbox dedicada a testes** (ex.: uma caixa de testes própria da BV Group, ou um serviço de e-mail descartável), nunca o endereço de um hotel real copiado de uma reserva de produção.
- Para testes automatizados (CI, testes de integração), o ideal é não chamar o Graph de verdade: usar um **mock da camada de integração** (interceptar as chamadas HTTP ao Graph) para testar a lógica de montagem de e-mail, registro em banco e idempotência sem depender de rede nem de credenciais reais.
- Para testes manuais end-to-end (ex.: validar que o e-mail chega formatado corretamente, que a thread é preservada no reply), usar a conta de teste configurada no `.env` (ver nota já registrada na seção 10, item 1) como destinatário E remetente, nunca um hotel real.
- Dado de reserva usado em teste deve ser **sintético** (hotel fictício, hóspede fictício) — nunca copiar uma linha de um RoomingList real de produção para rodar teste, mesmo que pareça inofensivo, porque campos como e-mail de destinatário podem acabar virando parâmetro real em algum teste futuro por engano.

### 7.2 OpenAI (interpretação de respostas)

- Testes de regressão do prompt/schema de interpretação (ver seção 8/riscos: suíte de casos reais como regressão) devem rodar sobre **corpos de e-mail anonimizados/sintéticos**, armazenados como fixtures no repositório de testes — nunca lendo direto de `respostas.xlsx`/produção durante o teste.
- Testes de unidade da lógica de regras de negócio (ex. `determinar_status_auditoria`) não precisam chamar a OpenAI de verdade — são testáveis com a saída da IA mockada (JSON fixo simulando a resposta do schema), evitando custo e flakiness de depender de rede.
- Apenas um conjunto pequeno e deliberado de testes de integração "de verdade" (chamando a API da OpenAI) deve existir, para validar que o schema/prompt ainda funciem como esperado — com orçamento e frequência controlados (não rodar a cada commit).

### 7.3 Tavily (busca de e-mail/país de hotel)

- Mesma lógica: testes de unidade da lógica de matching/fallback regex não chamam o Tavily de verdade (resposta mockada). Testes de integração reais, quando existirem, devem ser esparsos para não consumir o free tier mensal à toa.

### 7.4 Dados e ambientes

- **Banco de dados separado para desenvolvimento/teste**: usar um projeto/schema Supabase de desenvolvimento distinto do de produção (ou, no mínimo, dados de teste claramente marcados e isolados dentro do schema `reconfirmacao` — ver seção 5.2) para que testes não escrevam em cima de reservas reais de hotéis/hóspedes reais.
- Variáveis de ambiente diferentes por ambiente (`.env` de desenvolvimento vs. produção), nunca o mesmo `.env` apontando simultaneamente para credenciais de produção durante desenvolvimento ativo — reforça a prática já registrada na seção 5.3 sobre segredos.
- Ao escrever testes para cada nova etapa/milestone (seção 11), considerar como critério de aceite: "este teste não envia e-mail real nem chama API paga sem necessidade" deve estar explicitamente verificado antes de considerar a etapa concluída.

---

## 8. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Chave OpenAI exposta no repo de referência | Rotacionar imediatamente; nunca portar o arquivo `hoteis.txt`/`.env` para o novo repo |
| Qualidade da interpretação de IA regredir na migração | Portar prompt/schema quase literalmente na primeira versão; criar suíte de casos reais (anonimizados) como regressão antes de qualquer ajuste de prompt |
| Matching de hotel por nome causar reserva atribuída ao hotel errado | Exigir confirmação humana em matches de baixa confiança antes de reusar contato salvo |
| Dependência de uma única conta de e-mail corporativa (`produtos1@bvgroup.com.br`) — requisito mandatório do cliente, não uma limitação técnica | Sem diversificar contas de envio (fora de escopo por decisão de negócio). Mitigar o que É possível tecnicamente: monitorar quota/rate limit do Graph para essa caixa, e ter um plano de contingência documentado caso a conta fique indisponível (ex.: senha expirada, suspensão) — ver seção 10, item 1 |
| Migração de dados históricos (xlsx → Postgres) | Escrever script de migração único, validado contra uma amostra antes de rodar em todo o histórico |

---

## 9. Métricas de sucesso

- Redução do tempo médio entre "RoomingList recebida" e "todas as reservas com status definitivo".
- Redução de buscas manuais de e-mail de hotel (medido por % de hotéis já resolvidos via banco de contatos vs. busca nova).
- Redução de reservas em `REVISAR`/`REVISAR DIVERGÊNCIA` por falha de extração (qualidade da IA mantida ou melhorada frente ao baseline atual).
- Zero incidentes de segredo exposto em repositório (baseline atual: 1 incidente conhecido).

---

## 10. Perguntas em aberto (decidir com o time antes da fase de milestones)

1. ~~Autenticação de e-mail: conta única vs. por consultor~~ **Decidido (requisito mandatório do cliente Snow): todo envio e recebimento continua exclusivamente pela conta corporativa `produtos1@bvgroup.com.br`.** Não haverá envio por conta individual de cada consultor — essa possibilidade está descartada do escopo. Como consequência direta: o fluxo de autenticação Graph deixa de ser por-usuário (o `acquire_token_interactive()` do `autenticar_email.py` de referência não serve para um backend web, pois exige abrir um browser interativo numa máquina local) e passa a ser um **app registration dedicado com client credentials flow** (client ID + client secret + tenant ID, sem usuário interativo), autorizado via admin consent para agir sobre a caixa `produtos1@bvgroup.com.br` com permissão de aplicação (`Mail.Read`/`Mail.Send` como Application permission, não Delegated). Esta regra pode ser revisitada futuramente se a Snow mudar de ideia, mas por ora a arquitetura é desenhada em torno de uma única conta de envio.
   - **Nota de ambiente de desenvolvimento/teste**: enquanto o app registration com client credentials (e o admin consent correspondente no tenant da BV Group) não estiver configurado, `MS_GRAPH_AUTHORIZED_EMAIL` no `.env` local aponta para uma conta de teste (`maurcio.ti@bvgroup.com.br`) em vez da conta de produção, para permitir validar o fluxo técnico sem depender de aprovação de admin logo de início. Login/senha básico continua inviável mesmo em teste — a Microsoft desativou Basic Authentication para Exchange Online/Graph desde 2022; qualquer autenticação, mesmo de teste, precisa passar por OAuth (device code/interativo nesta fase, client credentials na versão final). Trocar para a conta de produção (`produtos1@bvgroup.com.br`) e para o fluxo client credentials fica como item explícito do checklist antes de ir para produção.
2. ~~Escopo de visão de dados~~ **Decidido: visão totalmente compartilhada.** Todo usuário autenticado (qualquer consultor ou admin) vê todas as reservas, envios e respostas processados por qualquer outro usuário — não existe recorte "minhas reservas". Ver seção 3 e item 4.2.7.
3. **SLA de resposta do hotel**: quantos dias sem resposta deve disparar notificação/escalonamento?
4. ~~Provedor de busca de contato de hotel~~ **Decidido: manter Tavily.** Pesquisa de mercado (10/2026) mostra que usar a busca web nativa da OpenAI (`gpt-4o-search-preview`/`web_search`) sairia **mais caro**, não mais barato: ela cobra ~$30–50 por 1.000 chamadas de busca além dos tokens, enquanto o Tavily oferece 1.000 créditos/mês grátis (1 crédito ≈ 1 hotel pesquisado). Como a busca só roda para hotéis novos/sem contato confirmado na base (não para cada reserva), o volume real da Snow dificilmente estoura o free tier. Alternativas como Brave Search ($5/1000, sem extração de conteúdo) ou Exa (mais voltado a research profundo) não trazem vantagem para este caso de uso pontual de "achar e-mail de reservas por nome do hotel".
5. ~~Hospedagem~~ **Decidido: Vercel** (+ Supabase cloud, já decidido na seção 5.2). Implicação técnica direta na seção 5.1/5.3: funções serverless da Vercel têm timeout de execução e não são feitas para workers de longa duração ou polling contínuo (ex.: ficar escutando respostas de e-mail indefinidamente); o job de leitura periódica de respostas e o envio em massa devem ser desenhados como execuções curtas e idempotentes disparadas por **Vercel Cron Jobs** (ou fila externa tipo Inngest/Trigger.dev, que já oferecem integração nativa com Vercel), nunca como um processo que fica rodando dentro de uma function.
6. **Login corporativo**: vale a pena integrar SSO com Microsoft Entra ID (já que a empresa usa M365), em vez de e-mail/senha via Supabase Auth puro?
7. ~~Granularidade do envio de e-mail por reserva~~ **Decidido: 1 e-mail por `Localizador`.** O xlsx cru traz uma linha por hóspede/quarto, repetindo o mesmo `Localizador` quando há múltiplos hóspedes na mesma reserva (ex.: 4 linhas para o localizador `9QGJZN`, ver seção 1.1, item 10). O sistema de referência envia 1 e-mail por linha, fragmentando a mesma reserva em vários e-mails ao mesmo hotel; a nova versão consolida todos os hóspedes (pax) de um mesmo localizador em **uma única mensagem**. Essa decisão também define a chave de deduplicação de envio (item 4.2.4).
8. ~~Projeto Supabase: compartilhado ou dedicado~~ **Decidido: compartilhar o projeto Supabase do TripQuote** (ver seção 5.2), reaproveitando `profiles` e `audit_log` tal como já existem.
9. ~~Schema `public` vs. schema próprio~~ **Decidido (2026-10-13): schema Postgres dedicado**, ex. `reconfirmacao`, para todas as tabelas novas deste sistema (`hotels`, `reservations`, `email_sends`, `hotel_replies`, `audit_status`). Mantém `profiles` e `audit_log` no `public` (onde já estão, compartilhados com o TripQuote), mas isola todo o resto do domínio de reconfirmação em um namespace próprio — elimina de vez o risco de colisão de nomes com tabelas futuras do TripQuote e deixa claro, ao olhar o banco, o que pertence a qual produto.

---

## 11. Processo de construção (alto nível, sem detalhar milestones ainda)

Conforme solicitado, a quebra em milestones/etapas de entrega será feita em um documento de planejamento separado, após alinhamento deste PRD. A abordagem geral será: priorizar o núcleo (auth + modelo de dados + upload + envio) antes de portar a inteligência de interpretação de respostas, e só então endereçar as evoluções de produto (banco de contatos, automação de busca, notificações).

---

## 12. Estimativa de custos de IA e busca (OpenAI + Tavily)

Esta seção estima o custo variável mensal das duas APIs pagas por uso do sistema: **OpenAI** (interpretação de respostas de hotel) e **Tavily** (busca de e-mail de hotéis novos). Não cobre custo de hospedagem/Supabase, que é à parte.

### 11.1 Premissas assumidas

- **Volume de reservas**: 200 a 1.000 reservas/mês (faixa informada pela operação).
- **Chamadas de IA por reserva**: o sistema de referência já prioriza regex antes de acionar a OpenAI, e nem toda reserva gera tréplica. Assumimos **1 a 1,5 chamada de IA por reserva** (1 para a resposta inicial do hotel; a fração extra cobre tréplicas que não foram resolvidas por regex).
- **Tamanho médio de cada chamada de IA**: com base no prompt de sistema atual (instruções fixas ~700 tokens) + corpo de e-mail do hotel (~150–400 tokens) + histórico de negociação quando houver, estimamos **~1.200 tokens de input** e **~400 tokens de output** por chamada — faixa conservadora acima da média observada em textos curtos de e-mail.
- **Preço OpenAI (`gpt-5-nano`, mesmo modelo já em uso)**: **US$ 0,05 / 1M tokens de input** e **US$ 0,40 / 1M tokens de output** (confirmado como preço de mercado atual, idêntico à constante já hardcoded no `respostas.py`).
- **Preço Tavily pay-as-you-go**: **US$ 0,008 por crédito**, sendo 1 busca básica (`qna_search`, usada hoje no `agent.py`) = 1 crédito. Confirmado como taxa vigente de overage/pay-as-you-go em múltiplas fontes de mercado (10/2026).
- **Hotéis novos por mês**: como não há histórico ainda do banco de contatos, modelamos dois cenários:
  - **Cenário A — "mês 1" (pior caso)**: praticamente todo hotel é novo (~90% das reservas geram 1 busca Tavily; assumindo ~3 reservas por hotel em média, isso equivale a ~30% do volume de reservas em buscas).
  - **Cenário B — "regime permanente" (estável)**: só 10–20% dos hotéis de cada mês são novos/desconhecidos, já que a maior parte já está no banco de contatos — este é o cenário que deve prevalecer a partir do 2º/3º mês de operação, e é o argumento central de ROI do banco de contatos.

### 11.2 Estimativa de custo — OpenAI (interpretação de respostas)

| Volume de reservas/mês | Chamadas de IA (1,0x) | Chamadas de IA (1,5x) | Custo/mês (1,0x) | Custo/mês (1,5x) |
|---:|---:|---:|---:|---:|
| 200 | 200 | 300 | **US$ 0,061** | **US$ 0,091** |
| 1.000 | 1.000 | 1.500 | **US$ 0,305** | **US$ 0,457** |

Cálculo por chamada: `(1.200/1.000.000 × 0,05) + (400/1.000.000 × 0,40) = 0,00006 + 0,00016 = US$ 0,00022/chamada`.

**Leitura**: mesmo no cenário mais caro (1.000 reservas/mês, 1,5 chamada cada), o custo de OpenAI fica **abaixo de US$ 0,50/mês**. Isso é consistente com o próprio sistema de referência já registrar custos de poucos centavos por execução (campo `openai_custo_usd` em `respostas.xlsx`). Na prática, o custo real deve ser ainda menor, pois parte expressiva das respostas estruturadas já é resolvida por regex sem chamar a IA.

### 11.3 Estimativa de custo — Tavily (busca de e-mail de hotel)

Assumindo ~3 reservas por hotel em média (um hotel costuma aparecer em mais de uma reserva por mês):

| Volume de reservas/mês | Hotéis únicos estimados (÷3) | Cenário A — buscas (~30% dos hotéis novos) | Custo Cenário A | Cenário B — buscas (~15% dos hotéis novos) | Custo Cenário B |
|---:|---:|---:|---:|---:|---:|
| 200 | ~67 | ~20 buscas | **US$ 0,16** | ~10 buscas | **US$ 0,08** |
| 1.000 | ~333 | ~100 buscas | **US$ 0,80** | ~50 buscas | **US$ 0,40** |

**Leitura**: mesmo no pior cenário (1.000 reservas/mês, todo mês com 30% de hotéis novos — o que não deveria se sustentar depois dos primeiros meses), o custo fica **abaixo de US$ 1/mês**, e dentro do free tier de 1.000 créditos/mês do Tavily (ou seja, **na prática o custo pode ser zero**, a menos que o volume real seja muito maior que o estimado aqui). O modo pay-as-you-go ($0,008/crédito) citado pelo usuário só passa a gerar cobrança quando o free tier mensal de 1.000 créditos é ultrapassado.

### 11.4 Custo combinado (IA + busca) — cenário de referência

| Cenário | Reservas/mês | OpenAI | Tavily | **Total/mês** |
|---|---:|---:|---:|---:|
| Baixo volume, regime estável | 200 | US$ 0,06–0,09 | US$ 0,08 | **≈ US$ 0,15–0,17** |
| Alto volume, mês 1 (pior caso) | 1.000 | US$ 0,31–0,46 | US$ 0,80 | **≈ US$ 1,11–1,26** |

### 11.5 Observações importantes

- **Estes valores são desprezíveis frente a qualquer outro custo do projeto** (hospedagem, Supabase, tempo de desenvolvimento). O risco financeiro real não está no volume normal de uso, e sim em:
  - **Picos inesperados**: um RoomingList gigante ou um loop de reprocessamento acidental (bug) chamando a IA repetidamente. Recomendação: configurar **limite de gasto mensal (budget alert)** tanto na OpenAI quanto no Tavily, e um *circuit breaker* no job de leitura de respostas (ex.: parar após N chamadas de IA por execução).
  - **Mudança de modelo**: se no futuro for necessário trocar `gpt-5-nano` por um modelo mais caro (ex.: por qualidade de interpretação), o custo pode subir uma ou duas ordens de grandeza — ainda assim, provavelmente continuaria na casa de poucos dólares/mês neste volume.
- **O banco de contatos de hotéis (seção 4.2.1) é o que mantém o custo de Tavily no Cenário B** a longo prazo — reforça que vale a pena investir nessa funcionalidade cedo, inclusive por economia direta, não só por produtividade do consultor.
- Estes números devem ser **recalibrados após os primeiros 1–2 meses em produção**, usando o consumo real de tokens e buscas (ambos já são registrados em métricas: `openai_custo_usd`/`openai_total_tokens` hoje, e deverá existir equivalente para Tavily no novo sistema — ver painel administrativo, item 4.2.5).
