-- Bug encontrado em producao (2026-10-29, reserva 7FX157): o hotel confirmou
-- a reserva fornecendo o numero de confirmacao em texto corrido ("reserva
-- confirmada bajo el codigo 40399990202"), mas a IA preencheu
-- reserva_confirmada = NAO mesmo tendo extraido o numero corretamente em
-- numeros_confirmacao (comportamento incorreto da IA, corrigido a parte no
-- prompt de src/lib/openai/client.ts). O status calculado por esta view, no
-- entanto, tratava QUALQUER reserva_confirmada = false como 'NAO_CONFIRMADA'
-- definitivo, sem chance de cair em REVISAR mesmo havendo pendencia
-- (pendencias/divergencias preenchidas) -- resultado: o dashboard mostrava
-- "Nao confirmada" enquanto o resumo da propria IA dizia que a reserva
-- "corre para revisao". Essa ambiguidade existe no design mesmo sem o erro
-- da IA: 'NAO_CONFIRMADA' deveria significar recusa/cancelamento claro do
-- hotel, nao "ha uma pendencia que a IA registrou via reserva_confirmada=NAO
-- por engano". Rede de seguranca contra erro futuro da IA nesse campo: so
-- marca 'NAO_CONFIRMADA' quando NAO ha pendencia/divergencia nenhuma
-- registrada em hotel_replies (recusa limpa); havendo pendencias ou
-- divergencias, cai em 'REVISAR' para revisao humana, igual ao que ja
-- acontece com reserva_confirmada = true + pendencia.

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
      when last_send.id is null and algum_email.email is null then 'EMAIL_NAO_ENCONTRADO'
      when last_send.id is null then 'NAO_ENVIADO'
      when last_send.status = 'erro' then 'ERRO_NO_ENVIO'
      when last_reply.id is null then 'AGUARDANDO_RESPOSTA'
      when last_reply.reserva_confirmada is true and last_reply.regime_alimentar_confirmado is true then 'CONFIRMADA'
      when last_reply.reserva_confirmada is false
        and last_reply.pendencias is null
        and last_reply.divergencias is null
        then 'NAO_CONFIRMADA'
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

comment on view reconfirmacao.audit_status is 'Status consolidado por reserva. status_manual (se setado pelo consultor) tem prioridade sobre o calculo automatico. EMAIL_NAO_ENCONTRADO: hotel sem NENHUM e-mail cadastrado (confirmado ou sugerido), nunca houve tentativa de envio. NAO_CONFIRMADA exige ausencia de pendencia/divergencia (recusa limpa do hotel) -- reserva_confirmada=false COM pendencia/divergencia cai em REVISAR, nao NAO_CONFIRMADA (corrigido em 2026-10-29 apos caso real onde a IA preencheu reserva_confirmada=NAO por engano apesar de pendencia/HCN extraido). cobranca_tentativas/cobranca_ultima_em alimentam o job de cobranca automatica (Milestone 11).';

grant select on reconfirmacao.audit_status to authenticated, service_role;
