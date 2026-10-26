-- CHANGELOG 2026-10-26 (segunda parte): a trava de "só confirmado dispara
-- envio automático" (PRD §4.2 item 2) foi removida a pedido explícito do
-- usuário — volume real de reservas torna inviável revisar e-mail por
-- e-mail em /hoteis antes de cada import. Agora qualquer e-mail cadastrado
-- (confirmado ou sugerido pelo Tavily) dispara o envio automático; o novo
-- status EMAIL_NAO_ENCONTRADO (migration 20261026130000) deve refletir
-- isso: só aparece quando não há NENHUM e-mail, não mais quando falta
-- confirmação humana.

drop view reconfirmacao.audit_status;

create view reconfirmacao.audit_status as
select
  r.id as reservation_id,
  r.localizador,
  r.hotel_id,
  h.nome as hotel_nome,
  r.data_checkin,
  r.data_checkout,
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
      when last_send.id is null and algum_email.email is null then 'EMAIL_NAO_ENCONTRADO'
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
) last_reply on true
left join lateral (
  select he.email from reconfirmacao.hotel_emails he
  where he.hotel_id = r.hotel_id
  limit 1
) algum_email on true;

comment on view reconfirmacao.audit_status is 'Status consolidado por reserva. status_manual (se setado pelo consultor) tem prioridade sobre o cálculo automático. EMAIL_NAO_ENCONTRADO: hotel sem NENHUM e-mail cadastrado (confirmado ou sugerido), nunca houve tentativa de envio — ver CHANGELOG 2026-10-26.';

grant select on reconfirmacao.audit_status to authenticated, service_role;
