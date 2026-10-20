# Reconfirmação de Hotéis — Web

Sistema web (Next.js + Supabase) para a Snow Operadora automatizar o envio e acompanhamento de e-mails de reconfirmação de reservas a hotéis. Substitui um app desktop (NiceGUI) que opera sobre planilhas Excel numa pasta de rede.

**Leia `docs/PRD.md` antes de qualquer trabalho de design/arquitetura.** Este arquivo é um briefing operacional; o PRD é a fonte de verdade das decisões de produto, com o "porquê" de cada uma. Toda decisão aqui referenciada como "ver PRD §N" já foi fechada — não reabra a discussão sem o usuário pedir.

## Stack

- **Frontend**: Next.js (App Router) + React + TypeScript + Tailwind CSS
- **Backend**: Next.js Route Handlers (Node.js), hospedado na **Vercel**
- **Banco de dados**: Supabase (Postgres) — **projeto compartilhado com o TripQuote**, outro produto da mesma empresa (ver "Banco de dados" abaixo)
- **Autenticação**: Supabase Auth, reusando `public.profiles` do TripQuote (login único entre os dois produtos)
- **Jobs em background**: Vercel Cron Jobs disparando Route Handlers curtos e idempotentes (a Vercel não suporta worker de longa duração/polling contínuo — nada de loop vivo tipo `while` + `sleep`)
- **Integração de e-mail**: Microsoft Graph API, app registration dedicado com **client credentials flow** (sem login interativo — ver "Microsoft Graph" abaixo)
- **IA de interpretação de respostas**: OpenAI (`gpt-5-nano`, JSON Schema estrito)
- **Busca de contato de hotel**: Tavily

Detalhe e justificativa de cada escolha: `docs/PRD.md` §5 (arquitetura) e §10 (decisões fechadas).

## Banco de dados: projeto Supabase compartilhado

Este sistema **não tem projeto Supabase próprio** — usa o mesmo projeto do TripQuote, para que login/senha funcione identicamente nos dois produtos (mesmo `auth.users`).

- **Schema `public`** — pertence ao TripQuote, mas duas tabelas são **compartilhadas e reusadas por este sistema, sem migration própria**:
  - `public.profiles`: `id` (uuid, FK `auth.users`), `email`, `full_name`, `role` (enum `consultant` | `admin`), `active`, timestamps. Fonte única de usuário/papel para os dois produtos.
  - `public.audit_log`: `actor_id` (FK `profiles.id`), `action`, `entity_type`, `entity_id`, `metadata` (jsonb). Use um `entity_type` próprio deste domínio (ex. `reservation`, `email_send`, `hotel_reply`) para não colidir com os tipos usados pelo TripQuote (ligados a `quotes`). Todo insert é feito com `SUPABASE_SERVICE_ROLE_KEY` no backend — não existe policy de INSERT para o client.
- **Schema `reconfirmacao`** — **todas as tabelas novas deste sistema nascem aqui, nunca em `public`.** Isola por completo o domínio de reconfirmação de hotéis do schema do TripQuote e elimina risco de colisão de nomes. Tabelas previstas (ver PRD §5.2 para o detalhe de cada uma): `hotels`, `reservations`, `email_sends`, `hotel_replies`, `audit_status`.
- Antes de criar qualquer tabela nova, **confirme no schema real via Supabase (API/CLI) que o nome não existe** — o schema do TripQuote pode ter crescido desde a última inspeção (2026-10-13). Nunca suponha.
- RLS é obrigatório em toda tabela de `reconfirmacao` desde a primeira migration — nunca como retrofit. Rode o agente `supabase-rls-reviewer` em toda migration nova. Visão de dados é **compartilhada entre todos os consultores** (qualquer usuário autenticado vê todas as reservas/envios/respostas, não só as que processou — ver PRD §3); a policy de leitura para `role = consultant` deve liberar todas as linhas, não filtrar por autor.

### Credenciais já disponíveis

**Todas as credenciais do Supabase, incluindo `SUPABASE_ACCESS_TOKEN`, já estão no `.env` na raiz do projeto** — isso permite inspecionar/alterar o schema do banco diretamente (migrations, consultas ao catálogo, API REST) sem pedir nada ao usuário. O `.env` também já contém `OPENAI_API_KEY` e `TAVILY_API_KEY`. Leia o `.env` quando precisar de qualquer uma dessas credenciais; não peça ao usuário para colar valores que já estão lá.

Nunca hardcode nenhuma credencial no código-fonte — sempre variável de ambiente, sempre lida do `.env`/`process.env` (ver PRD §5.3). Nunca commit o `.env`.

## Microsoft Graph (envio/leitura de e-mail)

Requisito mandatório do cliente Snow: todo envio e recebimento é **sempre** pela conta `produtos1@bvgroup.com.br` — nunca por conta individual de consultor (PRD §10, item 1).

Isso **não é um login interativo** (nada de abrir aba de navegador pedindo senha, como acontece em apps desktop tipo Power BI). É um backend web rodando em jobs automáticos sem ninguém na tela, então a autenticação é **client credentials flow**: um app registration no Azure AD com client ID + client secret + tenant ID, autorizado via admin consent para agir como aplicação (não como usuário) sobre essa caixa, com permissões de aplicação `Mail.Read`/`Mail.Send`.

Enquanto esse app registration não está configurado, `.env` aponta `MS_GRAPH_AUTHORIZED_EMAIL` para uma conta de teste (não produção) — ver PRD §10 item 1 para o checklist de troca antes de produção. Basic Authentication (usuário/senha simples) está desativado pela Microsoft para Exchange Online/Graph desde 2022 e não é uma alternativa viável em nenhum ambiente.

## Convenções de produto (decisões fechadas — ver PRD §10)

- **1 e-mail por `Localizador`**, consolidando todos os hóspedes/quartos daquele localizador numa única mensagem — nunca 1 e-mail por linha do xlsx (o app de referência faz isso errado; não repita).
- **Deduplicação por hotel + localizador**: antes de processar upload, checar se aquele localizador já foi enviado; se sim, pular e reportar ao consultor, nunca reenviar silenciosamente.
- **País e e-mail do hotel resolvidos automaticamente** via Tavily (uma única chamada por hotel novo, resolvendo os dois campos juntos) — nunca pedir ao consultor para colar o xlsx numa LLM de chat externa (processo manual do sistema antigo, que deixa de existir).
- Multilíngue: corpo do e-mail em PT/ES/EN conforme país do hóspede — preservar essa lógica ao portar do sistema de referência.

## Testes: nunca efeito colateral real (ver PRD §7)

Nenhum teste (automatizado ou manual) pode gerar efeito colateral real: nada de e-mail de teste chegando a hotel de verdade, nada de gasto real de API desnecessário, nada de dado de teste poluindo produção.

- **Graph**: nunca testar contra `produtos1@bvgroup.com.br` nem endereço real de hotel. Mock da chamada HTTP em testes automatizados; conta de teste dedicada para end-to-end manual.
- **OpenAI/Tavily**: lógica de negócio testada com resposta da API mockada (fixture), nunca chamando a API de verdade em teste de unidade. Chamadas reais só em um conjunto pequeno e deliberado de testes de integração.
- Dado de reserva em teste é sempre **sintético** (hotel/hóspede fictício) — nunca copiado de uma reserva real de produção.

## Identidade visual SNOW

Aplicar via skill `snow-theme` (`.claude/skills/snow-theme/`) e agente `ui-snow`. Tokens:

- Navy `#122b45` · Azul `#008fbd` (primário) · Laranja `#f26522` (CTA/acento)
- Fundo `#f3f7fa` · Borda `#d9e4eb` · Texto muted `#5c7180`
- Hero gradiente `#102b43` → `#175171`
- Raio: 9px (inputs), 15px (cards) · Sombra `0 7px 24px #102b4310` · Fonte system-ui/Arial
- Responsivo: ≤650px vira 1 coluna. Verificar contraste.

Mapear como variáveis HSL do tema shadcn em `globals.css`/`tailwind.config`, não hardcoded nos componentes.

## Estrutura de pastas (proposta inicial — ajustar ao iniciar o scaffold)

```
src/
  app/                    # Next.js App Router (páginas + route handlers)
  features/
    reservations/         # upload de RoomingList, parsing, consolidação, status de auditoria
    email-sends/          # montagem e envio de e-mail (Graph), reenvio
    hotel-replies/         # leitura de respostas, interpretação IA, fallback regex
    hotels/                # banco de contatos de hotéis, busca Tavily, matching fuzzy
    audit/                 # dashboard de auditoria, filtros, edição manual
  lib/
    graph/                 # client Microsoft Graph (client credentials)
    openai/                # client OpenAI + schema de interpretação
    tavily/                # client Tavily
    supabase/               # clients Supabase (server/client), tipos gerados
  components/ui/            # componentes shadcn com tema SNOW
supabase/
  migrations/               # toda migration nova no schema `reconfirmacao`
docs/
  PRD.md
```

Convenção de nomes de tabela/coluna: português, snake_case, consistente com o schema de referência do PRD (`hotels`, `reservations`, `email_sends`, `hotel_replies`, `audit_status`).

## Agentes e skills disponíveis neste projeto

- `db-migration` — checklist para toda nova migration (RLS, colunas de auditoria, `supabase-rls-reviewer`)
- `supabase-rls-reviewer` (agente) — revisar toda policy RLS nova
- `ai-prompt-guard` (agente) — auditar vazamento de prompt/chave OpenAI para o client, e uso de IA sem validação Zod
- `snow-theme` (skill) / `ui-snow` (agente) — identidade visual
- `code-reviewer`, `frontend-developer` (agentes genéricos)
- `security-audit`, `senior-secops`, `supabase-postgres-best-practices` (skills de apoio)

Skills/agentes específicos do TripQuote (`add-form-section`, `new-milestone`, `pptx-builder`) foram removidos deste projeto por não se aplicarem aqui.
