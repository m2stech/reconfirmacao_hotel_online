-- Nova feature: envio de cópia da reconfirmação ao Broker (fornecedor da
-- reserva, ex. Ratehawk, Expedia — reconfirmacao.reservations.fornecedor).
-- Pedido do usuário (2026-11-03): ação manual por reserva no dialog de
-- detalhe, 1 broker cadastrado por nome de fornecedor (reaproveitado entre
-- reservas, mesmo padrão de reconfirmacao.hotels), e-mail/país inseridos
-- pelo consultor no primeiro envio e atualizados em envios seguintes se
-- editados. Cópia é um e-mail novo (reaproveita assunto/corpo já montado
-- para o hotel), não forward real via Graph — broker não participa do fluxo
-- de leitura de resposta/cobrança automática do hotel, então não usa
-- reconfirmacao.email_sends (que tem unique(internet_message_id) e
-- alimenta audit_status/collection pensados só para o lado hotel).

create table reconfirmacao.brokers (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  email text,
  pais text,
  ultima_confirmacao_em timestamptz,
  ultima_confirmacao_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table reconfirmacao.brokers is 'Cadastro de contato do Broker (fornecedor da reserva — reservations.fornecedor) para envio de cópia da reconfirmação. 1 linha por nome de fornecedor, reaproveitada entre reservas (igual a hotels, mas sem hotel_emails/Tavily: e-mail único, sempre inserido manualmente).';

create trigger brokers_set_updated_at
  before update on reconfirmacao.brokers
  for each row execute function reconfirmacao.set_updated_at();

create table reconfirmacao.broker_sends (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reconfirmacao.reservations(id) on delete cascade,
  broker_id uuid not null references reconfirmacao.brokers(id),
  destinatario text not null,
  assunto text not null,
  corpo_html text not null,
  status reconfirmacao.email_send_status not null,
  erro_detalhe text,
  graph_message_id text,
  graph_conversation_id text,
  internet_message_id text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

comment on table reconfirmacao.broker_sends is 'Histórico de cópias da reconfirmação enviadas ao Broker, por reserva. Separado de email_sends de propósito: sem dedup/bloqueio de reenvio (ação deliberada do consultor, pode repetir), sem participação no cálculo de audit_status nem no fluxo de leitura de resposta/cobrança automática (que são só hotel).';

create index broker_sends_reservation_id_idx on reconfirmacao.broker_sends (reservation_id);
create index broker_sends_broker_id_idx on reconfirmacao.broker_sends (broker_id);

alter table reconfirmacao.brokers enable row level security;
alter table reconfirmacao.broker_sends enable row level security;

create policy brokers_select on reconfirmacao.brokers
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy brokers_insert on reconfirmacao.brokers
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

create policy brokers_update on reconfirmacao.brokers
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

create policy broker_sends_select on reconfirmacao.broker_sends
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

create policy broker_sends_insert on reconfirmacao.broker_sends
  for insert to authenticated
  with check (reconfirmacao.is_active_authenticated_user());

-- RLS por si só não libera acesso sem os GRANTs de tabela/schema
-- correspondentes (lição repetida nos Milestones 2/3/5/8/11 — ver CHANGELOG).
grant select, insert, update on reconfirmacao.brokers to authenticated, service_role;
grant select, insert on reconfirmacao.broker_sends to authenticated, service_role;
