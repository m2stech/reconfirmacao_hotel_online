# PLAN — Reconfirmação de Hotéis (Web)

Plano de construção em milestones, derivado de `docs/PRD.md` e `CLAUDE.md`. Cada milestone é incremental, testável e termina com um commit. Ordem: **setup → interface (com dados mockados) → backend real → integrações externas → jobs assíncronos → deploy**, conforme pedido — a UI nasce primeiro, navegável e visualmente completa, e o backend vai substituindo os mocks por trás dela sem redesenhar telas.

Convenção de branch: `milestone/NN-slug`, a partir de `main`. Cada milestone é mergeado em `main` antes de iniciar o próximo (não trabalhar dois milestones em paralelo na mesma branch).

---

## Milestone 0 — Setup do projeto

**Branch:** `milestone/00-setup`

**Objetivo:** Scaffold do projeto rodando localmente, conectado ao Supabase compartilhado, com schema `reconfirmacao` criado (vazio) e identidade visual SNOW aplicada — base para todos os milestones seguintes.

**Entregas:**
- [x] `npx create-next-app` (App Router, TypeScript, Tailwind) na raiz do projeto
- [x] Estrutura de pastas conforme `CLAUDE.md` (`src/app`, `src/features`, `src/lib`, `src/components/ui`, `supabase/migrations`)
- [x] shadcn/ui instalado e configurado
- [x] Tema SNOW aplicado via skill `snow-theme` (tokens de cor em `globals.css`/`tailwind.config`, raio, sombra, fonte)
- [x] Clients Supabase (`src/lib/supabase/`): client de browser (anon key) e client de servidor (service role), lendo credenciais do `.env` da raiz — nunca hardcoded
- [x] `.env.example` criado (mesmas chaves do `.env`, valores vazios/fake) e `.env` confirmado no `.gitignore`
- [x] Migration inicial: `CREATE SCHEMA reconfirmacao` (schema vazio, sem tabelas ainda — ver Milestone 2 para o schema de dados)
- [x] Verificação via Supabase API/CLI de que nenhum nome de tabela planejado (`hotels`, `reservations`, `email_sends`, `hotel_replies`, `audit_status`) colide com o schema `public` atual do TripQuote
- [x] Git inicializado neste diretório (`reconfirmacao/`), primeiro commit com `.gitignore` correto (nunca commitar `.env`, `node_modules`, `.next`)
- [x] README mínimo: como rodar localmente (`npm install`, `npm run dev`), onde estão as credenciais (`.env` na raiz)
- [x] Layout raiz da aplicação renderiza (`/`) com header/nav básico já na identidade SNOW, confirmando que o tema está de fato aplicado

**Commit final:** `chore: scaffold do projeto Next.js + Supabase + tema SNOW`

---

## Milestone 1 — Autenticação e papéis (reuso do TripQuote)

**Branch:** `milestone/01-auth`

**Objetivo:** Login funcional via Supabase Auth, reusando `public.profiles` do TripQuote — qualquer usuário já cadastrado no TripQuote consegue entrar aqui com a mesma conta, e o papel (`consultant`/`admin`) já vem pronto.

**Entregas:**
- [x] Tela de login (`/login`) com e-mail/senha via Supabase Auth, estilo SNOW
- [x] Fluxo de "esqueci minha senha": tela `/esqueci-senha` (solicita e-mail de reset via Supabase Auth) + tela `/redefinir-senha` (define nova senha a partir do link recebido por e-mail)
  - **Atenção (schema compartilhado com o TripQuote):** `Site URL`/`Redirect URLs` em Authentication → URL Configuration são config **por projeto Supabase**, não por schema — não existe "URL por schema". Hoje o `Site URL` aponta para o domínio do TripQuote/SnowQuote (`https://snowquote.vercel.app/`). Para não redirecionar o reset de senha deste sistema para lá, sem mexer no `Site URL` do TripQuote: (1) adicionar `http://localhost:3000/redefinir-senha` (porta do `npm run dev`) na lista de **Redirect URLs** — é o único domínio deste sistema até a Milestone 13 (deploy), não há domínio de produção ainda; (2) toda chamada de `resetPasswordForEmail()` no código deste sistema deve passar `redirectTo` explicitamente apontando para essa URL — nunca depender do `Site URL` padrão. Quando o deploy acontecer (Milestone 13), trocar/adicionar o domínio de produção na mesma lista e no `redirectTo`.
    - **Pendente de ação manual:** a alteração de `Redirect URLs`/`Site URL` do projeto Supabase é uma mudança de infraestrutura compartilhada (afeta também o TripQuote) e foi bloqueada pelo classificador de permissões do Claude Code — precisa ser feita manualmente em Authentication → URL Configuration, adicionando `http://localhost:3000/redefinir-senha` a Redirect URLs, sem alterar o Site URL existente. O código já está pronto (`redirectTo` explícito em `resetPasswordForEmail()`), só falta essa config no painel do Supabase.
  - Revisar o template de e-mail de reset (Authentication → Emails) para confirmar que não menciona "SnowQuote"/TripQuote especificamente, já que agora serve os dois produtos
    - **Pendente:** verificado que o template atual menciona "SnowQuote" explicitamente (assunto "Redefinir sua senha — SnowQuote" e logo/texto no corpo). Como é um template compartilhado entre os dois produtos, ajustar o texto é uma decisão de produto/conteúdo que depende de alinhamento com o time — não alterado nesta sessão, só diagnosticado.
- [x] Middleware/guard de rota: páginas internas exigem sessão válida, redirecionam para `/login` se não autenticado
- [x] Leitura do papel do usuário autenticado a partir de `public.profiles` (sem criar tabela nova — reuso puro)
- [x] Tela/estado de "usuário inativo" (campo `active = false` em `profiles`) — bloqueia acesso com mensagem clara, sem apagar sessão de outros usuários
- [x] Header exibe nome do usuário logado e opção de logout
- [x] Navegação condicional: itens exclusivos de admin (ver Milestone 6) só aparecem para `role = admin`
- [x] Teste manual: logar com um usuário `consultant` existente do TripQuote e confirmar que entra sem precisar criar conta nova

**Commit final:** `feat: autenticação via Supabase Auth reusando profiles do TripQuote`

---

## Milestone 2 — Schema de dados do domínio (schema `reconfirmacao`)

**Branch:** `milestone/02-schema`

**Objetivo:** Todas as tabelas novas do domínio criadas no schema `reconfirmacao`, com RLS desde o primeiro commit — é a base de dados que as telas dos próximos milestones vão consumir (inicialmente com dados de teste inseridos manualmente, antes de qualquer integração externa real).

**Entregas:**
- [x] Migration `reconfirmacao.hotels` (nome, variações de nome, país, idioma, confiabilidade do contato, última confirmação) + `reconfirmacao.hotel_emails` (e-mail(s), histórico de bounce — tabela separada para suportar múltiplos e-mails/fonte por hotel)
- [x] Migration `reconfirmacao.reservations` (localizador, localizador externo, hóspedes/pax em jsonb, datas, tipo de habitação, regime alimentar, fornecedor, `hotel_id` FK)
- [x] Migration `reconfirmacao.email_sends` (reserva/localizador, destinatário, assunto, graph ids, status, tipo de envio inicial/resposta manual, `created_by` FK `profiles`)
- [x] Migration `reconfirmacao.hotel_replies` (resposta recebida, campos extraídos pela IA, custo/tokens, método de interpretação)
- [x] Migration `reconfirmacao.audit_status` — **view** derivada (não tabela), consolidando status básico por reserva a partir de `reservations`/`email_sends`/`hotel_replies`; lógica completa de regras de negócio (CONFIRMADA exige regime alimentar confirmado, REVISAR DIVERGÊNCIA, etc.) fica para o Milestone 9
- [x] Constraint de idempotência: `unique(internet_message_id)` em `email_sends` e `hotel_replies`
- [x] RLS em todas as tabelas (`hotels`, `hotel_emails`, `reservations`, `email_sends`, `hotel_replies`): visão de SELECT compartilhada para todo usuário autenticado ativo (PRD §3), sem filtro por autor; escrita (INSERT/UPDATE) também liberada a qualquer usuário ativo — não há ainda operação restrita a admin neste milestone (entra no Milestone 6)
- [x] Agente `supabase-rls-reviewer` executado — **aprovado com ressalvas**; ressalva bloqueante (ausência de policy de UPDATE em `email_sends` para o fluxo de bounce) corrigida na migration `20261020151500_reconfirmacao_rls_hardening.sql`, que também restringe `EXECUTE` da função auxiliar a `authenticated`. Ressalvas não bloqueantes documentadas abaixo para milestones futuros.
- [x] Seed de dados sintéticos (hotel fictício "Hotel Fictício Praia Azul", reserva fictícia localizador `9QGJZN`) para popular as telas dos próximos milestones sem depender de dado real
- [x] Tipos TypeScript gerados via `supabase gen types` em `src/lib/supabase/types.ts` (schemas `public` + `reconfirmacao`)

**Notas para milestones futuros (não bloqueiam este milestone):**
- `hotel_replies` não tem policy de UPDATE (intencional: resposta do hotel é fato histórico imutável; tréplica gera nova linha).
- Milestone 5 (mesclar hotéis duplicados) vai precisar de policy de DELETE em `hotels`/`hotel_emails`, inexistente hoje.
- Exclusão de usuário em `profiles` é sempre lógica (`active = false`), nunca física — os FKs `created_by`/`ultima_confirmacao_por` sem `on delete` explícito dependem dessa convenção se mantendo.

**Commit final:** `feat: schema reconfirmacao com RLS (hotels, reservations, email_sends, hotel_replies, audit_status)`

---

## Milestone 3 — Interface: upload de RoomingList e preview

**Branch:** `milestone/03-ui-upload`

**Objetivo:** Primeira tela funcional de ponta a ponta na UI — consultor sobe um `.xlsx`, vê o preview parseado e a validação de colunas, ainda **sem enviar e-mail de verdade** (grava reserva no banco, mas o envio real fica para o Milestone 7).

**Entregas:**
- [x] Tela `/reservas/importar` com upload de `.xlsx` (drag & drop + seletor de arquivo), estilo SNOW
- [x] Parsing do xlsx no backend (Route Handler): cabeçalho sempre na linha 5, conforme formato real do RoomingList (ver `reconfirmacao_Hoteis/roomingList.xlsx` de referência)
- [x] Validação de colunas obrigatórias com mensagem de erro clara se faltar alguma
- [x] Consolidação por `Localizador` **+ hotel**: linhas do mesmo localizador E mesmo hotel viram 1 registro de reserva com todos os hóspedes agrupados (PRD §4.1, item 2). **Descoberta ao testar com o xlsx real**: o mesmo `Localizador` pode cobrir um roteiro multi-hotel/multi-cidade (ex. `D4D138`: mesmo casal em 4 hotéis diferentes) — caso não coberto literalmente pelo PRD, que só documenta "mesmo hotel, múltiplos hóspedes/quartos" (ex. `9QGJZN`). Decisão tomada nesta sessão: chave de consolidação é `(localizador, hotel)`, não só `localizador` — cada hotel do roteiro vira reserva e e-mail de reconfirmação separados (bate com a constraint `unique(hotel_id, localizador)` já existente desde o Milestone 2, sem precisar de migration nova).
- [x] Tela de preview: tabela mostrando as reservas que serão importadas, com indicação visual de quais localizadores já existem no banco (dedupe visual simples por `localizador`, já que `hotel_id` fica nulo neste milestone — match real de hotel é Milestone 5)
- [x] Botão "Confirmar importação" grava em `reconfirmacao.reservations` (ainda sem acionar envio de e-mail)
- [x] Teste manual com o `roomingList.xlsx` de referência (dado sintético/anonimizado, nunca o arquivo real de produção — PRD §7), ponta a ponta via Playwright com usuário de teste `consultor@tripquote.dev`: login → upload → preview (58 reservas consolidadas) → confirmar importação (57 gravadas, 1 pulada por dedupe) → limpeza dos dados de teste e da senha temporária ao final

**Gap descoberto e corrigido nesta sessão (fora do escopo original do Milestone 3, mas bloqueava qualquer leitura/escrita em `reconfirmacao` desde o Milestone 2):** o schema `reconfirmacao` nunca tinha sido exposto em Settings → API → Exposed schemas do Supabase (só `public, graphql_public`), e nenhuma migration anterior tinha dado `GRANT USAGE`/`GRANT SELECT,INSERT,UPDATE` para `authenticated`/`service_role`/`anon` nas tabelas novas — RLS por si só não libera acesso sem esses grants de base. Corrigido via Management API (exposed schemas, mudança aditiva) + nova migration `20261020174225_reconfirmacao_schema_grants.sql` (grants). Sem isso, toda query ao schema `reconfirmacao` falhava com `PGRST106`/`42501` mesmo com as policies RLS corretas — só apareceu ao testar de ponta a ponta com sessão real.

**Commit final:** `feat: upload e preview de RoomingList com consolidação por localizador+hotel`

---

## Milestone 4 — Interface: dashboard de auditoria (dados mockados/seed)

**Branch:** `milestone/04-ui-dashboard`

**Objetivo:** Dashboard de auditoria completo visualmente e funcionalmente contra os dados de seed/importados — a tela mais usada do sistema de referência, recriada primeiro na UI antes de qualquer integração de e-mail/IA estar pronta.

**Entregas:**
- [x] Tela `/dashboard` com cards de métricas (total, confirmadas, aguardando, revisar, respondido ao hotel, erro no envio) — mesmos status do sistema de referência (PRD §4.1, item 5)
- [x] Tabela de reservas com paginação/filtro no banco (não client-side — PRD §6), filtros por status/hotel/localizador/data/pagamento/tipo de pendência
- [x] Modal de detalhe da reserva: resumo, dados da hospedagem, histórico cronológico da conversa (hotel x nós)
- [x] Edição manual de campos de auditoria (status, confirmação, regime alimentar, pagamento, tipo de pendência) com a regra de negócio preservada: não permite marcar `CONFIRMADA` sem regime alimentar confirmado
- [x] Toda edição manual grava em `audit_log` com o usuário autenticado (PRD §3 — auditoria por usuário)
- [x] Exportação para Excel das reservas filtradas/selecionadas
- [x] Cliques nos cards de métrica aplicam o filtro de status correspondente (paridade com o app de referência)

**Descoberta de modelagem nesta sessão:** a view `reconfirmacao.audit_status` (Milestone 2) só calcula status a partir de `email_sends`/`hotel_replies` reais, que ainda não existem (Milestones 7/9). Para a edição manual funcionar antes disso — e continuar útil depois, quando o consultor precisar corrigir o cálculo automático —, foram adicionadas colunas de override em `reconfirmacao.reservations` (`status_manual`, `regime_alimentar_confirmado_manual`, `pagamento_manual`, `tipo_pendencia_manual`, `auditoria_atualizada_em/_por`) via migrations `20261020190000` e `20261020191000` (a segunda expõe `data_checkin`/`data_checkout` na view para permitir filtro de data no banco). A view foi ajustada para dar prioridade ao override manual (`coalesce(status_manual, <cálculo automático>)`) sobre o cálculo automático.

**Bugs corrigidos durante o teste manual (Playwright, usuário `consultor@tripquote.dev`):**
- O PATCH de edição manual gravava em `public.audit_log` usando o client de sessão (`anon`/`authenticated`), mas essa tabela não tem policy de INSERT para esses roles (CLAUDE.md: "Todo insert é feito com `SUPABASE_SERVICE_ROLE_KEY` no backend"). O insert falhava silenciosamente (erro do Supabase não checado) e nenhuma auditoria era registrada. Corrigido trocando para `createServiceRoleClient()` nesse insert específico — a atualização da própria reserva continua usando o client de sessão normal (RLS já libera isso para qualquer usuário autenticado ativo).
- `npm run build` falhava em `/dashboard` com "Next.js encountered uncached or runtime data during prerendering" (Cache Components do Next 16): a consulta de métricas (`buscarMetricas`) rodava direto no corpo da página, fora de `<Suspense>`. Corrigido extraindo para um Server Component próprio (`metric-cards.tsx`) envolvido em `<Suspense>`, com fallback de cards "—" enquanto carrega — mesmo padrão já usado para `AuditTable`.
- Label do checkbox "Regime alimentar confirmado" não era clicável (o componente `Label` do shadcn não associa `htmlFor`/`id` automaticamente); trocado por um `<label>` nativo envolvendo o `Checkbox`.

**Commit final:** `feat: dashboard de auditoria com filtros, edição manual e exportação`

---

## Milestone 5 — Interface: banco de contatos de hotéis

**Branch:** `milestone/05-ui-hotels`

**Objetivo:** Tela de gestão do banco de contatos de hotéis (feature nova em relação ao sistema de referência) e a lógica de deduplicação de envio por localizador, ainda com busca de e-mail/país manual (a automação via Tavily entra no Milestone 8).

**Entregas:**
- [x] Tela `/hoteis` listando hotéis cadastrados: nome, e-mail(s), país, idioma, confiabilidade do contato, última confirmação
- [x] CRUD manual de hotel (criar, editar e-mail/país, marcar como confirmado/obsoleto)
- [x] Ação de mesclar hotéis duplicados (mesmo hotel, nomes/grafias diferentes)
- [x] Na tela de preview de importação (Milestone 3), ligar cada reserva ao hotel correspondente na base — exato ou fuzzy match simples (matching mais sofisticado fica para o Milestone 8)
- [x] Reservas cujo localizador já tem envio registrado aparecem marcadas como "já processado em [data]" no preview de importação (deduplicação, PRD §4.2, item 4) — ainda sem bloquear, só sinalizar, até o Milestone 7 implementar o bloqueio real de reenvio

**Mudança de modelagem nesta sessão:** a chave de dedupe do preview/confirmação de importação (`src/app/api/reservations/import/{preview,confirm}/route.ts`) deixou de ser `(localizador, check-in, check-out)` (aproximação provisória do Milestone 3, antes de existir matching de hotel) e passou a ser `(localizador, hotel_id)` — a chave real de consolidação do domínio, que bate com a constraint `unique(hotel_id, localizador)` já existente desde o Milestone 2. Reserva cujo hotel ainda não tem match no banco cai num fallback por `(localizador, nome do hotel)`, já que não há `hotel_id` para comparar.

**Lacuna de RLS corrigida nesta sessão:** a migration `20261020200000_reconfirmacao_hotels_delete_policy.sql` adiciona a policy de DELETE em `hotels`/`hotel_emails` que faltava desde o Milestone 2 (necessária para `mesclarHoteis`). O agente `supabase-rls-reviewer` apontou que a policy sozinha não bastava — faltava também o `GRANT DELETE` correspondente (mesmo padrão de lacuna já visto nas migrations `174225`/`151500` dos Milestones 2/3: RLS só é avaliada depois do GRANT de tabela existir). Corrigido na mesma migration antes do merge. O reviewer também registrou uma assimetria de integridade para avaliar no Milestone 6: DELETE direto em `hotels` fora do fluxo de merge falha com violação de FK se houver reservas vinculadas (seguro, mas erro cru), mas cascateia e apaga e-mails vinculados silenciosamente (sem reatribuição) — nenhum dos dois é "mesclar".

**Bug de UI corrigido durante o teste manual (Playwright, usuário `consultor@tripquote.dev`):** no dialog de mesclagem (`src/app/hoteis/merge-hotel-dialog.tsx`), o `Select` de "hotel principal" usa o `id` (UUID) do hotel como `value` — mas o componente `Select` do projeto (`@base-ui/react/select`) só mostra automaticamente o `value` bruto quando `SelectValue` não recebe `children`, então o UUID aparecia cru na tela em vez do nome do hotel escolhido. Corrigido passando uma função em `SelectValue` (`{(valor) => hoteis.find(...)?.nome}`), conforme a API documentada do Base UI. Os demais `Select` do projeto não tinham esse problema porque usam enums já legíveis como `value` (ex. `confiabilidade_contato`), não UUIDs.

**Teste manual (Playwright, usuário `consultor@tripquote.dev`):** criação de hotel → criação de hotel duplicado → mesclagem (reservas/e-mails reatribuídos, duplicado excluído, confirmado por contagem antes/depois) → upload do `roomingList.xlsx` de referência (58 reservas consolidadas, matching fuzzy confirmado com um hotel cadastrado propositalmente com nome variante — "W Prague Hotel LTDA" casou com "W Prague" do xlsx) → confirmação da importação → reupload do mesmo arquivo confirmando a sinalização "Já processado em [data]" na reserva com hotel resolvido. Dados sintéticos de teste (hotéis e reservas criados durante o teste) removidos ao final; banco voltou ao estado do seed original do Milestone 2.

**Commit final:** `feat: banco de contatos de hotéis e sinalização de reserva já processada`

---

## Milestone 6 — Interface: painel administrativo

**Branch:** `milestone/06-ui-admin`

**Objetivo:** Telas exclusivas de admin — gestão de usuários e visão de custo de IA — fechando a cobertura de UI antes de qualquer integração externa real entrar em cena.

**Entregas:**
- [x] Tela `/admin/usuarios` (somente `role = admin`): listar usuários de `profiles`, convidar novo usuário, desativar/reativar, alterar papel
- [x] Tela `/admin/custos`: visão agregada de custo de IA (tokens/USD) por período — inicialmente vazia/zerada, populada de verdade a partir do Milestone 9
- [x] Guard de rota: página retorna 403/redirect para não-admin
- [x] Toda ação administrativa (desativar usuário, mudar papel) grava em `audit_log`

**Decisões tomadas nesta sessão:**
- Convite de usuário usa `supabase.auth.admin.inviteUserByEmail()` (magic link do próprio Supabase Auth) em vez de criar usuário com senha temporária — mesmo ponto pendente do template de e-mail já registrado no Milestone 1 (menciona "SnowQuote"), não resolvido aqui.
- Guard de admin em duas camadas: middleware (`src/lib/supabase/middleware.ts`) redireciona `/admin/*` para `/dashboard` quando `profile.role !== "admin"` (cobre as páginas); `requireAdmin()` (`src/features/admin/require-admin.ts`) retorna 403 nos Route Handlers `/api/admin/*` (cobre chamadas diretas de API, inclusive de quem contorna a UI).
- Leitura/escrita de `profiles` nas rotas de admin (`src/features/admin/queries.ts`) usa `createServiceRoleClient()`, não o client de sessão — RLS de `profiles` (schema do TripQuote) não foi desenhada para permitir um usuário alterar o papel/status de outro; mesma necessidade do `audit_log` insert, já resolvida nos Milestones 3/4.
- Admin não pode alterar o próprio registro por `/api/admin/usuarios/[id]` (bloqueado com 400) — evita autodesativação ou auto-rebaixamento de papel acidental sem outro admin para reverter.
- `agregarCustoIAporMes()` (`src/features/admin/cost-queries.ts`) já lê `reconfirmacao.hotel_replies` agrupando por mês (`openai_tokens_input/output`, `openai_custo_usd`), mas a tabela só recebe linhas reais a partir do Milestone 9 — a tela funciona e builda normalmente, só aparece vazia até lá (comportamento esperado, testado).

**Gap de prerendering corrigido nesta sessão (mesma classe de bug do Milestone 4):** `getCurrentUserWithProfile()` usa `cookies()`, que bloqueia o prerendering de uma rota se chamado direto no corpo da `page.tsx` (Cache Components do Next 16). Corrigido extraindo o guard (fetch de user/profile + `redirect()`) para um Server Component assíncrono próprio em cada página (`UsersTableGuarded`/`CostsTableGuarded`), envolto em `<Suspense>` — mesmo padrão já usado para `MetricCards`/`AuditTable`.

**Teste manual (sessão real via API, sem Playwright — navegador não disponível neste ambiente):** login via Supabase Auth API como `admin@tripquote.dev` e `consultor@tripquote.dev` (senha já existente, nenhuma credencial trocada), cookies de sessão montados no formato que `@supabase/ssr` espera (`sb-<project-ref>-auth-token`, JSON do objeto `Session` completo, base64url com prefixo `base64-`). Confirmado: (1) consultor acessando `/admin/usuarios` é redirecionado para `/dashboard`; (2) consultor chamando `GET /api/admin/usuarios` recebe 403; (3) admin lista os 7 usuários cadastrados; (4) `GET /api/admin/custos` retorna `{ok: true, custos: []}` sem erro; (5) admin desativa e reativa `produtos2@bvgroup.com.br`, ambas as chamadas gravam em `audit_log` com `actor_id` correto; (6) admin tentando alterar o próprio usuário recebe 400. Nenhum dado de produção alterado além do toggle ativo/inativo revertido ao estado original ao final do teste.

**Commit final:** `feat: painel administrativo (usuários e custos de IA)`

---

## Milestone 7 — Backend: integração Microsoft Graph (envio real de e-mail)

**Branch:** `milestone/07-backend-graph`

**Objetivo:** Primeira integração externa real — troca o botão "Confirmar importação" (que hoje só grava no banco) por envio de e-mail de verdade via Graph, com todas as salvaguardas de ambiente de teste do PRD §7.

**Entregas:**
- [ ] Client Microsoft Graph (`src/lib/graph/`) com client credentials flow (app registration, client ID/secret/tenant ID do `.env`)
- [ ] Montagem de e-mail HTML multilíngue (PT/ES/EN por país do hóspede), portado do `enviar_email.py` de referência — 1 e-mail por `Localizador`, consolidando todos os hóspedes
- [ ] Envio real via Graph, registrando `graph_message_id`/`conversation_id`/`internet_message_id` em `email_sends`
- [ ] Deduplicação real (bloqueante, não só visual): localizador já enviado é ignorado no envio e reportado ao consultor — nunca reenvia silenciosamente (PRD §4.2, item 4)
- [ ] Resposta ao hotel pela interface (reply preservando thread via `createReply` → `patch` → `send`, portado de `enviar_email.py`)
- [ ] Reenvio de e-mail com erro, com edição de destinatário/assunto antes de reenviar
- [ ] Toda chamada de teste usa a conta de teste do `.env` (`MS_GRAPH_AUTHORIZED_EMAIL`), nunca a caixa de produção nem e-mail real de hotel (PRD §7.1)
- [ ] Mock da camada Graph em testes automatizados (nenhum teste de unidade/CI chama a API real)

**Commit final:** `feat: envio e resposta de e-mail via Microsoft Graph (client credentials)`

---

## Milestone 8 — Backend: automação de busca de e-mail/país de hotel (Tavily)

**Branch:** `milestone/08-backend-tavily`

**Objetivo:** Substituir a entrada manual de e-mail/país de hotel (Milestone 5) pela automação via Tavily — elimina de vez o passo manual de colar o xlsx numa LLM de chat externa.

**Entregas:**
- [ ] Client Tavily (`src/lib/tavily/`), lendo `TAVILY_API_KEY` do `.env`
- [ ] Busca combinada e-mail + país numa única chamada por hotel novo/desconhecido (PRD §4.2, item 2 — não duas chamadas separadas)
- [ ] Resultado entra como "sugestão não confirmada" no banco de contatos — e-mail exige confirmação humana antes do primeiro uso; país pode ser aceito automaticamente com flag "a confirmar"
- [ ] Matching fuzzy de nome de hotel (grafia/acentuação/sufixos) com confirmação humana quando a confiança for baixa — evita duplicar hotel ou atribuir reserva ao hotel errado
- [ ] Registro de provedor de busca e nível de confiança por campo (e-mail, país)
- [ ] Testes de unidade da lógica de matching com resposta do Tavily mockada (nunca chamando a API real em teste de unidade — PRD §7.3)

**Commit final:** `feat: busca automática de e-mail e país de hotel via Tavily`

---

## Milestone 9 — Backend: interpretação de respostas via IA (OpenAI)

**Branch:** `milestone/09-backend-openai`

**Objetivo:** Portar o motor de interpretação de respostas de hotel — a peça mais sofisticada do sistema de referência — preservando ao máximo o comportamento já calibrado em produção (`respostas.py`).

**Entregas:**
- [ ] Client OpenAI (`src/lib/openai/`) com o mesmo JSON Schema estrito do `respostas.py` (campos: reserva confirmada, regime alimentar confirmado, número de confirmação do hotel, múltiplas confirmações por hóspede, status de pagamento, divergências, pendências, resumo, confiança)
- [ ] Prompt portado quase 1:1 da versão de referência, sem reescrita — mudanças de prompt ficam para depois, com suíte de regressão (ver abaixo)
- [ ] Fallback regex para respostas em formato estruturado e para extração de número quando a IA não captura (portado de `respostas.py`)
- [ ] Filtro de mensagens automáticas (out-of-office, bounce) antes de gastar chamada de IA
- [ ] Acúmulo de estado ao longo de tréplicas (confirmação de mensagem anterior não "some" se a tréplica só falar de outro assunto)
- [ ] Lógica de status de auditoria (`determinar_status_auditoria` e equivalentes) portada com os mesmos critérios de negócio (CONFIRMADA exige regime alimentar confirmado, etc.)
- [ ] Registro de custo de tokens (input/output/USD) por chamada, alimentando a tela de custos do Milestone 6
- [ ] Suíte de regressão com corpos de e-mail anonimizados/sintéticos como fixtures (PRD §7.2) — base de comparação antes de qualquer ajuste futuro de prompt
- [ ] Testes de unidade da lógica de regras de negócio com saída da IA mockada (sem chamar a API em teste de unidade)
- [ ] Agente `ai-prompt-guard` executado para confirmar que nenhuma chave/prompt vaza para o client

**Commit final:** `feat: interpretação de respostas de hotel via OpenAI com fallback regex`

---

## Milestone 10 — Backend: jobs assíncronos (leitura periódica + envio em massa)

**Branch:** `milestone/10-backend-jobs`

**Objetivo:** Tirar leitura de respostas e envio em massa da request HTTP síncrona, substituindo o `while` + `sleep` do app de referência por Vercel Cron Jobs — peça que fecha a arquitetura de produção.

**Entregas:**
- [ ] Route Handler de leitura de respostas, desenhado como execução curta e idempotente (processa um lote por disparo, não um loop infinito)
- [ ] Vercel Cron Job configurado para disparar a leitura periódica no intervalo desejado (configurável)
- [ ] Route Handler de envio em massa, também em lotes idempotentes (não bloqueia a request do upload)
- [ ] Circuit breaker: job de leitura para após N chamadas de IA por execução, evitando pico de custo por bug/reprocessamento (PRD §12.5)
- [ ] Notificação ao consultor quando: resposta precisa de revisão humana, envio falhou, ou hotel não respondeu depois do SLA configurado (Milestone 11 cobre a tela/config de SLA; aqui entra o disparo)
- [ ] Teste do fluxo completo ponta a ponta em ambiente de teste (conta de e-mail de teste, dados sintéticos) antes de mergear

**Commit final:** `feat: jobs assíncronos via Vercel Cron (leitura periódica e envio em massa)`

---

## Milestone 11 — Notificações e SLA

**Branch:** `milestone/11-notificacoes`

**Objetivo:** Fechar a funcionalidade de notificação começada no Milestone 10 com a configuração de SLA e os canais in-app/e-mail.

**Entregas:**
- [ ] Configuração de SLA de resposta do hotel (quantos dias sem resposta dispara alerta) — valor definido com o time (PRD §10, item 3, ainda em aberto)
- [ ] Notificação in-app (indicador visual no dashboard/header)
- [ ] Notificação por e-mail ao consultor responsável
- [ ] Preferências de notificação por usuário (opcional, se o time quiser)

**Commit final:** `feat: notificações de SLA e revisão pendente`

---

## Milestone 12 — Migração de dados históricos (opcional/paralelo)

**Branch:** `milestone/12-migracao-dados`

**Objetivo:** Trazer o histórico relevante das planilhas do sistema de referência (`enviados.xlsx`, `respostas.xlsx`, `auditoria_reservas.xlsx`) para o Postgres, se o time decidir que vale a pena preservar esse histórico.

**Entregas:**
- [ ] Script de migração único (xlsx → `reconfirmacao.*`), rodado localmente, nunca em produção sem revisão
- [ ] Validação contra uma amostra pequena antes de rodar o histórico completo
- [ ] Dados sensíveis (e-mails reais de hotel, hóspedes) tratados conforme regras de segurança já estabelecidas — nunca usados depois em ambiente de teste

**Commit final:** `chore: migração de histórico xlsx para Postgres`

---

## Milestone 13 — Hardening, testes finais e deploy

**Branch:** `milestone/13-deploy`

**Objetivo:** Fechar lacunas de produção antes do go-live: segurança, observabilidade, checklist de troca de ambiente de teste para produção.

**Entregas:**
- [ ] Checklist de troca de ambiente executado: `MS_GRAPH_AUTHORIZED_EMAIL` trocado da conta de teste para `produtos1@bvgroup.com.br`, app registration com admin consent de produção configurado (PRD §10, item 1)
- [ ] Domínio de produção (Vercel) adicionado em Supabase → Authentication → URL Configuration → Redirect URLs, sem remover o `localhost` ainda em uso por quem desenvolve; `redirectTo` do fluxo de reset de senha (Milestone 1) atualizado para a URL de produção
- [ ] Revisão final de RLS em todas as tabelas de `reconfirmacao` (agente `supabase-rls-reviewer`)
- [ ] Revisão de segurança (`security-audit`/`senior-secops`): nenhum segredo hardcoded, nenhum vazamento de prompt/chave para o client
- [ ] Budget alert configurado na OpenAI e no Tavily (PRD §12.5)
- [ ] Variáveis de ambiente de produção configuradas na Vercel e no Supabase, a partir do `.env` (nunca digitadas direto sem estarem documentadas em `.env.example`)
- [ ] Deploy de produção na Vercel
- [ ] Teste de fumaça em produção: login, upload de reserva sintética, dashboard carrega, sem nenhum envio real disparado no teste de fumaça
- [ ] Observabilidade mínima: logs de erro de job assíncrono visíveis (Vercel dashboard ou equivalente)

**Commit final:** `chore: checklist de produção e deploy inicial`

---

## Notas gerais de execução

- Cada milestone deve ser testado antes do commit final — critério de aceite "este teste não envia e-mail real nem chama API paga sem necessidade" (PRD §7.4) vale para todos os milestones com integração externa.
- Milestones 3–6 (interface) usam dados de seed/sintéticos ou entrada manual — é esperado que funcionalidades como busca de hotel ou interpretação de resposta estejam "mockadas"/manuais até os Milestones 7–9 substituírem por integração real. Isso é intencional (pedido explícito: interface primeiro, backend depois).
- Não pular a ordem dos milestones 7 → 8 → 9 sem necessidade: envio de e-mail (7) é pré-requisito prático para testar a leitura de resposta (9), e a automação de contato (8) reduz o volume de hotéis sem e-mail antes de testar envio em massa.
