-- Pedido do usuário: novo status manual "Reserva cancelada" (dashboard de
-- auditoria), para marcar reservas que o cliente cancelou e não devem mais
-- ser cobradas automaticamente nem verificadas quanto a resposta do hotel.
--
-- Igual aos demais status de STATUS_MANUAL_OPCOES (CONFIRMADA, REVISAR, ...):
-- só existe como override em `reservations.status_manual`, nunca calculado
-- automaticamente pela view — o sistema não tem como inferir cancelamento
-- sozinho, é sempre uma decisão do consultor.
--
-- Os jobs de cobrança (`collection-pending.ts`) e de busca de resposta
-- (`pending.ts`) já filtram por `audit_status.status = 'AGUARDANDO_RESPOSTA'`;
-- como o override manual sobrepõe o cálculo automático na view, uma reserva
-- com status_manual = 'RESERVA_CANCELADA' já fica automaticamente fora dos
-- dois jobs, sem precisar alterá-los.

alter type reconfirmacao.audit_status_manual add value 'RESERVA_CANCELADA';
