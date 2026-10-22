import "server-only";

// Reservas elegíveis para cobrança automática (Milestone 11): aguardando
// resposta do hotel, com menos de 3 tentativas de cobrança já enviadas, e
// há pelo menos 24h desde o último contato (envio inicial ou última
// cobrança) — mesmo padrão de `pending.ts` (Milestone 10).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type TypedClient = SupabaseClient<Database>;

export const MAX_TENTATIVAS_COBRANCA = 3;
export const INTERVALO_COBRANCA_HORAS = 24;

export type ReservaElegivelParaCobranca = {
  reservationId: string;
  emailSendId: string;
  destinatario: string;
  graphMessageId: string | null;
  internetMessageId: string | null;
  localizador: string;
  tentativas: number;
  createdByEnvioOriginal: string | null;
};

export async function listarReservasParaCobranca(
  supabase: TypedClient,
  limite: number
): Promise<ReservaElegivelParaCobranca[]> {
  const limiteTempo = new Date(Date.now() - INTERVALO_COBRANCA_HORAS * 60 * 60 * 1000).toISOString();

  // Inclui deliberadamente `cobranca_tentativas === MAX`: é a reserva que
  // acabou de bater o limite e ainda precisa ser notificada (sla_esgotado)
  // uma única vez por `collection.ts`. Só exclui `> MAX` — o sentinela que
  // `collection.ts` grava depois de notificar, para não notificar de novo
  // no próximo disparo do cron (bug real encontrado no teste de integração
  // manual desta sessão: o filtro `< MAX` aqui matava a reserva antes dela
  // chegar à lógica de esgotamento).
  const { data: pendentes, error: erroAudit } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("reservation_id, last_email_send_id, cobranca_tentativas, cobranca_ultima_em, last_email_send_at")
    .eq("status", "AGUARDANDO_RESPOSTA")
    .not("last_email_send_id", "is", null)
    .lte("cobranca_tentativas", MAX_TENTATIVAS_COBRANCA)
    .limit(limite * 4); // filtro de janela de 24h é feito em memória (coalesce de duas colunas) — margem para não ficar curto após o filtro.

  if (erroAudit) throw erroAudit;
  if (!pendentes || pendentes.length === 0) return [];

  const elegiveis = pendentes.filter((p) => {
    const referencia = p.cobranca_ultima_em ?? p.last_email_send_at;
    return referencia !== null && referencia <= limiteTempo;
  });
  if (elegiveis.length === 0) return [];

  const emailSendIds = elegiveis.map((p) => p.last_email_send_id).filter((id): id is string => id !== null);
  const { data: envios, error: erroEnvios } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("id, reservation_id, destinatario, graph_message_id, internet_message_id, created_by")
    .in("id", emailSendIds);
  if (erroEnvios) throw erroEnvios;

  const { data: reservas, error: erroReservas } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("id, localizador")
    .in(
      "id",
      elegiveis.map((p) => p.reservation_id).filter((id): id is string => id !== null)
    );
  if (erroReservas) throw erroReservas;

  const reservasPorId = new Map((reservas ?? []).map((r) => [r.id, r]));
  const tentativasPorReserva = new Map(elegiveis.map((p) => [p.reservation_id, p.cobranca_tentativas]));

  const resultado: ReservaElegivelParaCobranca[] = [];
  for (const envio of (envios ?? []).slice(0, limite)) {
    const reserva = reservasPorId.get(envio.reservation_id);
    if (!reserva) continue;

    resultado.push({
      reservationId: reserva.id,
      emailSendId: envio.id,
      destinatario: envio.destinatario,
      graphMessageId: envio.graph_message_id,
      internetMessageId: envio.internet_message_id,
      localizador: reserva.localizador,
      tentativas: tentativasPorReserva.get(reserva.id) ?? 0,
      createdByEnvioOriginal: envio.created_by,
    });
  }

  return resultado;
}
