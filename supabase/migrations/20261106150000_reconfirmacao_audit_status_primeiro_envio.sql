-- Adiciona first_email_send_at (data do primeiro envio) à view reconfirmacao.audit_status.
-- Recriação completa (drop + create) porque a view já existe com colunas incompatíveis
-- (CREATE OR REPLACE VIEW não permite inserir coluna no meio da lista de SELECT).
-- Partiu-se da definição atual obtida via pg_get_viewdef, não de uma migration anterior
-- (ver CHANGELOG.md, entrada 2026-10-28, "Lição para próximas migrations que recriam audit_status").

drop view if exists reconfirmacao.audit_status;

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
  first_send.created_at as first_email_send_at,
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
      when last_send.id is null and algum_email.email is null then 'EMAIL_NAO_ENCONTRADO'::text
      when last_send.id is null then 'NAO_ENVIADO'::text
      when last_send.status = 'erro'::reconfirmacao.email_send_status then 'ERRO_NO_ENVIO'::text
      when last_reply.id is null then 'AGUARDANDO_RESPOSTA'::text
      when last_reply.reserva_confirmada is true and last_reply.regime_alimentar_confirmado is true then 'CONFIRMADA'::text
      when last_reply.reserva_confirmada is false and last_reply.pendencias is null and last_reply.divergencias is null then 'NAO_CONFIRMADA'::text
      else 'REVISAR'::text
    end
  ) as status
from reconfirmacao.reservations r
  left join reconfirmacao.hotels h on h.id = r.hotel_id
  left join lateral (
    select es.created_at
    from reconfirmacao.email_sends es
    where es.reservation_id = r.id
    order by es.created_at asc
    limit 1
  ) first_send on true
  left join lateral (
    select
      es.id,
      es.reservation_id,
      es.tipo,
      es.status,
      es.destinatario,
      es.assunto,
      es.corpo_html,
      es.idioma,
      es.erro_detalhe,
      es.graph_message_id,
      es.graph_conversation_id,
      es.internet_message_id,
      es.created_by,
      es.created_at
    from reconfirmacao.email_sends es
    where es.reservation_id = r.id
    order by es.created_at desc
    limit 1
  ) last_send on true
  left join lateral (
    select
      hr.id,
      hr.email_send_id,
      hr.internet_message_id,
      hr.recebido_em,
      hr.corpo_texto,
      hr.metodo_interpretacao,
      hr.reserva_confirmada,
      hr.regime_alimentar_confirmado,
      hr.numeros_confirmacao,
      hr.status_pagamento,
      hr.divergencias,
      hr.pendencias,
      hr.resumo,
      hr.confianca,
      hr.openai_tokens_input,
      hr.openai_tokens_output,
      hr.openai_custo_usd,
      hr.created_at
    from reconfirmacao.hotel_replies hr
    where hr.email_send_id = last_send.id
    order by hr.recebido_em desc
    limit 1
  ) last_reply on true
  left join lateral (
    select he.email
    from reconfirmacao.hotel_emails he
    where he.hotel_id = r.hotel_id
    limit 1
  ) algum_email on true;

grant select on reconfirmacao.audit_status to authenticated;
grant select on reconfirmacao.audit_status to service_role;
