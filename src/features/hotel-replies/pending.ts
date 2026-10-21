import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DadosReservaParaIA } from "@/lib/openai/client";
import type { EnvioParaBuscaDeResposta } from "@/lib/graph/read-mail";

type TypedClient = SupabaseClient<Database>;

export type ReservaPendenteDeResposta = {
  emailSendId: string;
  reservationId: string;
  envio: EnvioParaBuscaDeResposta;
  dadosParaIA: DadosReservaParaIA;
};

/**
 * Reservas com último envio concluído (`status = 'enviado'`) e ainda sem
 * resposta registrada (`status` da view `audit_status` = AGUARDANDO_RESPOSTA
 * — PRD/Milestone 2). Usado pelo job de leitura periódica (Milestone 10)
 * para saber quais conversas checar no Graph.
 *
 * `limite` existe para o job processar em lotes pequenos por disparo (nunca
 * um loop ilimitado numa única execução de Cron Job).
 */
export async function listarReservasAguardandoResposta(
  supabase: TypedClient,
  limite: number
): Promise<ReservaPendenteDeResposta[]> {
  const { data: pendentes, error: erroAudit } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("reservation_id, last_email_send_id")
    .eq("status", "AGUARDANDO_RESPOSTA")
    .not("last_email_send_id", "is", null)
    .limit(limite);

  if (erroAudit) throw erroAudit;
  if (!pendentes || pendentes.length === 0) return [];

  const emailSendIds = pendentes.map((p) => p.last_email_send_id).filter((id): id is string => id !== null);

  const { data: envios, error: erroEnvios } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("id, reservation_id, destinatario, assunto, graph_conversation_id, internet_message_id, graph_message_id, created_at")
    .in("id", emailSendIds);
  if (erroEnvios) throw erroEnvios;

  const reservationIds = (envios ?? []).map((e) => e.reservation_id);
  const { data: reservas, error: erroReservas } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("id, localizador, data_checkin, data_checkout, regime_alimentar, fornecedor, hospedes, hotel_id")
    .in("id", reservationIds);
  if (erroReservas) throw erroReservas;

  const hotelIds = (reservas ?? []).map((r) => r.hotel_id).filter((id): id is string => id !== null);
  const { data: hoteis, error: erroHoteis } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .select("id, nome")
    .in("id", hotelIds);
  if (erroHoteis) throw erroHoteis;

  const reservasPorId = new Map((reservas ?? []).map((r) => [r.id, r]));
  const hoteisPorId = new Map((hoteis ?? []).map((h) => [h.id, h]));

  const resultado: ReservaPendenteDeResposta[] = [];
  for (const envio of envios ?? []) {
    const reserva = reservasPorId.get(envio.reservation_id);
    if (!reserva) continue;
    const hotel = reserva.hotel_id ? hoteisPorId.get(reserva.hotel_id) : undefined;
    const hospedesArray = Array.isArray(reserva.hospedes) ? (reserva.hospedes as { nome?: string }[]) : [];

    resultado.push({
      emailSendId: envio.id,
      reservationId: reserva.id,
      envio: {
        destinatario: envio.destinatario,
        conversationId: envio.graph_conversation_id,
        internetMessageId: envio.internet_message_id,
        graphMessageId: envio.graph_message_id,
        assunto: envio.assunto,
        localizador: reserva.localizador,
        dataEnvio: envio.created_at,
      },
      dadosParaIA: {
        hotel: hotel?.nome ?? "",
        localizador: reserva.localizador,
        hospedes: hospedesArray.map((h) => h.nome ?? "").join(", "),
        dataCheckin: reserva.data_checkin ?? "",
        dataCheckout: reserva.data_checkout ?? "",
        regimeAlimentar: reserva.regime_alimentar ?? "",
        fornecedor: reserva.fornecedor ?? "",
      },
    });
  }

  return resultado;
}
