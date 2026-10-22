-- Milestone 11 — cobrança automática ao hotel (3 tentativas, 24h de
-- intervalo entre elas) e notificações (revisão humana, erro de envio,
-- SLA de cobrança esgotado). Decisão fechada com o usuário nesta sessão:
-- sem SLA configurável por admin nem escalonamento a broker (e-mail do
-- broker ainda não tem origem definida) — só os 3 lembretes ao hotel.

alter table reconfirmacao.reservations
  add column cobranca_tentativas integer not null default 0,
  add column cobranca_ultima_em timestamptz;

comment on column reconfirmacao.reservations.cobranca_tentativas is 'Quantas cobranças automáticas de 24h já foram enviadas ao hotel (máx. 3 — Milestone 11). Zera implicitamente: uma vez respondida, a reserva sai de AGUARDANDO_RESPOSTA e o job de cobrança para de considerá-la.';
comment on column reconfirmacao.reservations.cobranca_ultima_em is 'Quando a última cobrança automática (ou o envio inicial, antes da primeira cobrança) foi feita — referência para o intervalo de 24h.';

create type reconfirmacao.notificacao_tipo as enum (
  'revisao_humana',   -- resposta do hotel caiu em REVISAR/REVISAR_DIVERGENCIA
  'erro_envio',        -- envio de e-mail (inicial, cobrança ou reenvio) falhou
  'sla_esgotado'       -- 3 cobranças automáticas sem resposta do hotel
);

create table reconfirmacao.notificacoes (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references reconfirmacao.reservations(id) on delete cascade,
  tipo reconfirmacao.notificacao_tipo not null,
  mensagem text not null,
  lida_em timestamptz,
  created_at timestamptz not null default now()
);

comment on table reconfirmacao.notificacoes is 'Notificações in-app (Milestone 11): revisão humana pendente, erro de envio ou 3 cobranças sem resposta do hotel. Gravada sempre por service_role (jobs/rotas de servidor), nunca pelo client.';

create index notificacoes_reservation_id_idx on reconfirmacao.notificacoes (reservation_id);
create index notificacoes_nao_lidas_idx on reconfirmacao.notificacoes (created_at) where lida_em is null;

alter table reconfirmacao.notificacoes enable row level security;

-- Leitura compartilhada entre todo consultor autenticado ativo (PRD §3),
-- mesmo padrão de todas as outras tabelas de reconfirmacao.
create policy notificacoes_select on reconfirmacao.notificacoes
  for select to authenticated
  using (reconfirmacao.is_active_authenticated_user());

-- Marcar como lida é a única escrita permitida ao client (qualquer usuário
-- ativo pode marcar qualquer notificação como lida — visão compartilhada,
-- não há "notificação de um usuário específico"). INSERT fica só para
-- service_role: notificação sempre nasce de lógica de servidor (job de
-- cobrança, persistência de resposta, envio de e-mail), nunca de uma ação
-- direta do client.
create policy notificacoes_update on reconfirmacao.notificacoes
  for update to authenticated
  using (reconfirmacao.is_active_authenticated_user())
  with check (reconfirmacao.is_active_authenticated_user());

grant select, update (lida_em) on reconfirmacao.notificacoes to authenticated;
grant select, insert, update, delete on reconfirmacao.notificacoes to service_role;

-- Recria a view para expor os contadores de cobrança (necessário para a UI
-- do dashboard mostrar "2ª cobrança enviada há Xh", por exemplo).
drop view reconfirmacao.audit_status;

create view reconfirmacao.audit_status as
select
  r.id as reservation_id,
  r.localizador,
  r.hotel_id,
  h.nome as hotel_nome,
  r.data_checkin,
  r.data_checkout,
  r.cobranca_tentativas,
  r.cobranca_ultima_em,
  last_send.id as last_email_send_id,
  last_send.status as last_email_send_status,
  last_send.created_at as last_email_send_at,
  last_reply.id as last_hotel_reply_id,
  last_reply.reserva_confirmada,
  coalesce(r.regime_alimentar_confirmado_manual, last_reply.regime_alimentar_confirmado) as regime_alimentar_confirmado,
  last_reply.recebido_em as last_hotel_reply_at,
  r.pagamento_manual,
  r.tipo_pendencia_manual,
  r.auditoria_atualizada_em,
  r.auditoria_atualizada_por,
  coalesce(
    r.status_manual::text,
    case
      when last_send.id is null then 'NAO_ENVIADO'
      when last_send.status = 'erro' then 'ERRO_NO_ENVIO'
      when last_reply.id is null then 'AGUARDANDO_RESPOSTA'
      when last_reply.reserva_confirmada is true and last_reply.regime_alimentar_confirmado is true then 'CONFIRMADA'
      when last_reply.reserva_confirmada is false then 'NAO_CONFIRMADA'
      else 'REVISAR'
    end
  ) as status
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

comment on view reconfirmacao.audit_status is 'Status consolidado por reserva. status_manual (se setado pelo consultor) tem prioridade sobre o cálculo automático — ver Milestone 4. cobranca_tentativas/cobranca_ultima_em alimentam o job de cobrança automática — ver Milestone 11.';

grant select on reconfirmacao.audit_status to authenticated, service_role;
