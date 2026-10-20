-- Milestone 2 — modelo de dados do domínio de reconfirmação de hotéis.
-- Todas as tabelas nascem em `reconfirmacao` (nunca em `public`, que pertence
-- ao TripQuote — ver CLAUDE.md "Banco de dados" e PRD §5.2).
-- RLS obrigatório desde este primeiro commit das tabelas (nunca retrofit).

-- ============================================================================
-- Enums
-- ============================================================================

create type reconfirmacao.contact_reliability as enum (
  'confirmado',          -- confirmado manualmente por um consultor/admin
  'sugerido',             -- obtido por busca automática (Tavily), ainda não confirmado por humano
  'obsoleto'              -- marcado como desatualizado (ex. após bounce)
);

create type reconfirmacao.contact_source as enum (
  'manual',
  'tavily'
);

create type reconfirmacao.email_send_kind as enum (
  'reconfirmacao_inicial',  -- primeiro e-mail de reconfirmação para o localizador
  'reenvio',                -- reenvio de um envio anterior com erro
  'resposta_manual'         -- reply do consultor numa thread já aberta com o hotel
);

create type reconfirmacao.email_send_status as enum (
  'enviado',
  'erro',
  'bounce'
);

create type reconfirmacao.hotel_reply_interpretation_method as enum (
  'regex',
  'ia',
  'manual'
);

-- ============================================================================
-- reconfirmacao.hotels
-- ============================================================================

create table reconfirmacao.hotels (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  nomes_alternativos text[] not null default '{}',
  pais text,
  pais_fonte reconfirmacao.contact_source,
  pais_a_confirmar boolean not null default false,
  idioma text,
  confiabilidade_contato reconfirmacao.contact_reliability not null default 'sugerido',
  ultima_confirmacao_em timestamptz,
  ultima_confirmacao_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table reconfirmacao.hotels is 'Banco de contatos de hotéis (PRD §4.2.1). Email vive em reconfirmacao.hotel_emails.';

create table reconfirmacao.hotel_emails (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references reconfirmacao.hotels(id) on delete cascade,
  email text not null,
  fonte reconfirmacao.contact_source not null default 'manual',
  confiabilidade reconfirmacao.contact_reliability not null default 'sugerido',
  bounced_em timestamptz,
  created_at timestamptz not null default now(),
  unique (hotel_id, email)
);

comment on table reconfirmacao.hotel_emails is 'E-mail(s) de reservas por hotel, com histórico de bounce (PRD §4.2.1, §4.2.3).';

create index hotel_emails_hotel_id_idx on reconfirmacao.hotel_emails (hotel_id);

-- ============================================================================
-- reconfirmacao.reservations
-- ============================================================================

create table reconfirmacao.reservations (
  id uuid primary key default gen_random_uuid(),
  localizador text not null,
  localizador_externo text,
  hotel_id uuid references reconfirmacao.hotels(id),
  fornecedor text,
  data_checkin date,
  data_checkout date,
  tipo_habitacao text,
  regime_alimentar text,
  hospedes jsonb not null default '[]',
  roomlist_arquivo text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hotel_id, localizador)
);

comment on table reconfirmacao.reservations is 'Reserva consolidada por Localizador (1 linha = todos os hóspedes/quartos daquele localizador — PRD §4.1.2). hospedes é array jsonb com {nome, pais, idioma}.';

create index reservations_localizador_idx on reconfirmacao.reservations (localizador);
create index reservations_hotel_id_idx on reconfirmacao.reservations (hotel_id);

-- ============================================================================
-- reconfirmacao.email_sends
-- ============================================================================

create table reconfirmacao.email_sends (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reconfirmacao.reservations(id) on delete cascade,
  tipo reconfirmacao.email_send_kind not null,
  status reconfirmacao.email_send_status not null,
  destinatario text not null,
  assunto text not null,
  corpo_html text not null,
  idioma text,
  erro_detalhe text,
  graph_message_id text,
  graph_conversation_id text,
  internet_message_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- idempotência real (PRD §5.3): nunca duas linhas para a mesma mensagem do Graph.
  unique (internet_message_id)
);

comment on table reconfirmacao.email_sends is 'Substitui enviados.xlsx. 1 e-mail por Localizador (PRD §4.1.2); deduplicação bloqueante por reservation_id+tipo tratada em código no Milestone 7, constraint de internet_message_id garante idempotência de registro.';

create index email_sends_reservation_id_idx on reconfirmacao.email_sends (reservation_id);
create index email_sends_graph_conversation_id_idx on reconfirmacao.email_sends (graph_conversation_id);

-- ============================================================================
-- reconfirmacao.hotel_replies
-- ============================================================================

create table reconfirmacao.hotel_replies (
  id uuid primary key default gen_random_uuid(),
  email_send_id uuid not null references reconfirmacao.email_sends(id) on delete cascade,
  internet_message_id text not null,
  recebido_em timestamptz not null,
  corpo_texto text not null,
  metodo_interpretacao reconfirmacao.hotel_reply_interpretation_method not null,
  reserva_confirmada boolean,
  regime_alimentar_confirmado boolean,
  numeros_confirmacao jsonb not null default '[]',
  status_pagamento text,
  divergencias text,
  pendencias text,
  resumo text,
  confianca numeric(3,2),
  openai_tokens_input integer,
  openai_tokens_output integer,
  openai_custo_usd numeric(10,6),
  created_at timestamptz not null default now(),
  -- idempotência real (PRD §5.3): mesma mensagem do Graph nunca gera duas respostas interpretadas.
  unique (internet_message_id)
);

comment on table reconfirmacao.hotel_replies is 'Substitui respostas.xlsx. numeros_confirmacao é array jsonb {hospede, numero} para múltiplas confirmações por hóspede (PRD §4.1.3).';

create index hotel_replies_email_send_id_idx on reconfirmacao.hotel_replies (email_send_id);

-- ============================================================================
-- reconfirmacao.audit_status (view derivada, não tabela — ver PLAN.md Milestone 2)
-- ============================================================================
-- Status básico calculado a partir do estado atual de email_sends/hotel_replies.
-- A lógica completa de regras de negócio (CONFIRMADA exige regime alimentar
-- confirmado, REVISAR DIVERGÊNCIA, etc. — determinar_status_auditoria do
-- sistema de referência) é portada em TypeScript no Milestone 9; esta view
-- cobre o necessário para os Milestones 3-6 operarem sobre dados de seed.

create view reconfirmacao.audit_status as
select
  r.id as reservation_id,
  r.localizador,
  r.hotel_id,
  h.nome as hotel_nome,
  last_send.id as last_email_send_id,
  last_send.status as last_email_send_status,
  last_send.created_at as last_email_send_at,
  last_reply.id as last_hotel_reply_id,
  last_reply.reserva_confirmada,
  last_reply.regime_alimentar_confirmado,
  last_reply.recebido_em as last_hotel_reply_at,
  case
    when last_send.id is null then 'NAO_ENVIADO'
    when last_send.status = 'erro' then 'ERRO_NO_ENVIO'
    when last_reply.id is null then 'AGUARDANDO_RESPOSTA'
    when last_reply.reserva_confirmada is true and last_reply.regime_alimentar_confirmado is true then 'CONFIRMADA'
    when last_reply.reserva_confirmada is false then 'NAO_CONFIRMADA'
    else 'REVISAR'
  end as status
from reconfirmacao.reservations r
left join reconfirmacao.hotels h on h.id = r.hotel_id
left join lateral (
  select * from reconfirmacao.email_sends es
  where es.reservation_id = r.id
  order by es.created_at desc
  limit 1
) last_send on true
left join lateral (
  select hr.* from reconfirmacao.hotel_replies hr
  where hr.email_send_id = last_send.id
  order by hr.recebido_em desc
  limit 1
) last_reply on true;

comment on view reconfirmacao.audit_status is 'Status consolidado por reserva (equivalente a auditoria_reservas.xlsx). Status final de negócio é recalculado em TypeScript no Milestone 9 — esta view cobre apenas o básico para as telas dos Milestones 3-6.';

-- ============================================================================
-- Trigger genérico de updated_at
-- ============================================================================

create function reconfirmacao.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger hotels_set_updated_at
  before update on reconfirmacao.hotels
  for each row execute function reconfirmacao.set_updated_at();

create trigger reservations_set_updated_at
  before update on reconfirmacao.reservations
  for each row execute function reconfirmacao.set_updated_at();

-- ============================================================================
-- RLS — visão de leitura compartilhada entre todo consultor autenticado
-- (PRD §3, §4.2.7, §5.3): nunca filtrar linha por autor.
-- Escrita: qualquer usuário autenticado ativo pode gravar (operação normal do
-- consultor); somente service role insere em audit_log (já é assim hoje, fora
-- desta migration). Não há aqui "configuração sensível" de escrita restrita a
-- admin — essa necessidade só aparece no Milestone 6 (painel administrativo).
-- ============================================================================

alter table reconfirmacao.hotels enable row level security;
alter table reconfirmacao.hotel_emails enable row level security;
alter table reconfirmacao.reservations enable row level security;
alter table reconfirmacao.email_sends enable row level security;
alter table reconfirmacao.hotel_replies enable row level security;

create function reconfirmacao.is_active_authenticated_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  );
$$;

create policy hotels_select on reconfirmacao.hotels
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy hotels_insert on reconfirmacao.hotels
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

create policy hotels_update on reconfirmacao.hotels
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

create policy hotel_emails_select on reconfirmacao.hotel_emails
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy hotel_emails_insert on reconfirmacao.hotel_emails
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

create policy hotel_emails_update on reconfirmacao.hotel_emails
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

create policy reservations_select on reconfirmacao.reservations
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy reservations_insert on reconfirmacao.reservations
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

create policy reservations_update on reconfirmacao.reservations
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

create policy email_sends_select on reconfirmacao.email_sends
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy email_sends_insert on reconfirmacao.email_sends
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

create policy hotel_replies_select on reconfirmacao.hotel_replies
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy hotel_replies_insert on reconfirmacao.hotel_replies
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

-- audit_status é view sobre tabelas com RLS própria — já herda a restrição
-- das tabelas base, não precisa (e não pode) ter RLS própria.

-- ============================================================================
-- Seed de dados sintéticos (PRD §7.4 — nunca dado real de produção)
-- ============================================================================

insert into reconfirmacao.hotels (id, nome, pais, pais_fonte, idioma, confiabilidade_contato, ultima_confirmacao_em)
values (
  '00000000-0000-0000-0000-000000000001',
  'Hotel Fictício Praia Azul',
  'Brasil',
  'manual',
  'pt',
  'confirmado',
  now()
);

insert into reconfirmacao.hotel_emails (hotel_id, email, fonte, confiabilidade)
values (
  '00000000-0000-0000-0000-000000000001',
  'reservas@hotelficticio-exemplo.test',
  'manual',
  'confirmado'
);

insert into reconfirmacao.reservations (
  id, localizador, hotel_id, fornecedor, data_checkin, data_checkout,
  tipo_habitacao, regime_alimentar, hospedes, roomlist_arquivo
)
values (
  '00000000-0000-0000-0000-000000000002',
  '9QGJZN',
  '00000000-0000-0000-0000-000000000001',
  'Fornecedor Fictício Turismo',
  '2026-12-10',
  '2026-12-15',
  'Standard Duplo',
  'Café da manhã',
  '[{"nome": "Hóspede Fictício Um", "pais": "Brasil", "idioma": "pt"}, {"nome": "Hóspede Fictício Dois", "pais": "Brasil", "idioma": "pt"}]',
  'seed-milestone-02.xlsx'
);
