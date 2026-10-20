-- Milestone 4 — dashboard de auditoria: edição manual de status/campos.
-- A view `audit_status` (Milestone 2) só calcula um status básico a partir de
-- email_sends/hotel_replies reais, que ainda não existem (Milestone 7/9). Até
-- lá, o status de negócio completo (PRD §4.1 item 5: CONFIRMADA, AGUARDANDO
-- RESPOSTA, REVISAR, REVISAR DIVERGÊNCIA, RESPONDIDO AO HOTEL, ERRO NO ENVIO,
-- NÃO CONFIRMADA) precisa de edição manual pelo consultor (PRD §4.1 item 6).
--
-- Guardado como override em `reconfirmacao.reservations`, não em tabela
-- separada: é 1:1 com a reserva, e a view já teria que fazer join de qualquer
-- forma. Quando a lógica real de `determinar_status_auditoria` entrar no
-- Milestone 9, o override manual continua existindo para os casos em que um
-- consultor precisa corrigir o status calculado automaticamente.

create type reconfirmacao.audit_status_manual as enum (
  'CONFIRMADA',
  'AGUARDANDO_RESPOSTA',
  'REVISAR',
  'REVISAR_DIVERGENCIA',
  'RESPONDIDO_AO_HOTEL',
  'ERRO_NO_ENVIO',
  'NAO_CONFIRMADA'
);

alter table reconfirmacao.reservations
  add column status_manual reconfirmacao.audit_status_manual,
  add column regime_alimentar_confirmado_manual boolean,
  add column pagamento_manual text,
  add column tipo_pendencia_manual text,
  add column auditoria_atualizada_em timestamptz,
  add column auditoria_atualizada_por uuid references public.profiles(id);

comment on column reconfirmacao.reservations.status_manual is 'Override manual do status de auditoria (PRD §4.1 item 6). Nulo = segue o cálculo automático da view audit_status.';

-- Recria a view para expor os campos manuais e preferi-los ao cálculo
-- automático quando presentes (CREATE OR REPLACE View não permite remover
-- colunas existentes sem DROP, mas aqui só estamos adicionando).
drop view reconfirmacao.audit_status;

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

comment on view reconfirmacao.audit_status is 'Status consolidado por reserva. status_manual (se setado pelo consultor) tem prioridade sobre o cálculo automático — ver Milestone 4.';

grant select on reconfirmacao.audit_status to authenticated, service_role;
