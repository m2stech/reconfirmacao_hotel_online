import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { DadosReservaParaIA } from "@/lib/openai/client";
import type { EnvioParaBuscaDeResposta } from "@/lib/graph/read-mail";

type TypedClient = SupabaseClient<Database>;

export type ReservaPendenteDeResposta = {
  emailSendId: string;
  reservationId: string;
  /**
   * Todas as conversas onde uma resposta pode chegar para esta reserva: o
   * envio ao hotel sempre está presente; o último envio ao broker (se
   * existir, via "Enviar para Broker") entra como candidato adicional — caso
   * real YDKM7W/JM1XJW (2026-11-26): a Hotelbeds reconfirmou a reserva por
   * e-mail, mas só em resposta à thread do broker, nunca na do hotel.
   */
  envios: EnvioParaBuscaDeResposta[];
  dadosParaIA: DadosReservaParaIA;
  createdByEnvioOriginal: string | null;
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
    .select("id, reservation_id, destinatario, assunto, graph_conversation_id, internet_message_id, graph_message_id, created_at, created_by")
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

  // Último envio ao broker de cada reserva (se houver) — "Enviar para
  // Broker" é uma ação manual e repetível do consultor (ver
  // `enviar-para-broker/route.ts`), então pode haver mais de um por reserva;
  // só o mais recente importa para localizar a resposta mais atual.
  const { data: enviosBroker, error: erroEnviosBroker } = await supabase
    .schema("reconfirmacao")
    .from("broker_sends")
    .select("reservation_id, destinatario, assunto, graph_conversation_id, internet_message_id, graph_message_id, created_at")
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: false });
  if (erroEnviosBroker) throw erroEnviosBroker;

  const ultimoEnvioBrokerPorReserva = new Map<string, NonNullable<typeof enviosBroker>[number]>();
  for (const envioBroker of enviosBroker ?? []) {
    if (!ultimoEnvioBrokerPorReserva.has(envioBroker.reservation_id)) {
      ultimoEnvioBrokerPorReserva.set(envioBroker.reservation_id, envioBroker);
    }
  }

  const resultado: ReservaPendenteDeResposta[] = [];
  for (const envio of envios ?? []) {
    const reserva = reservasPorId.get(envio.reservation_id);
    if (!reserva) continue;
    const hotel = reserva.hotel_id ? hoteisPorId.get(reserva.hotel_id) : undefined;
    const hospedesArray = Array.isArray(reserva.hospedes) ? (reserva.hospedes as { nome?: string }[]) : [];

    const envios_: EnvioParaBuscaDeResposta[] = [
      {
        destinatario: envio.destinatario,
        conversationId: envio.graph_conversation_id,
        internetMessageId: envio.internet_message_id,
        graphMessageId: envio.graph_message_id,
        assunto: envio.assunto,
        localizador: reserva.localizador,
        dataEnvio: envio.created_at,
      },
    ];

    const envioBroker = ultimoEnvioBrokerPorReserva.get(reserva.id);
    if (envioBroker) {
      envios_.push({
        destinatario: envioBroker.destinatario,
        conversationId: envioBroker.graph_conversation_id,
        internetMessageId: envioBroker.internet_message_id,
        graphMessageId: envioBroker.graph_message_id,
        assunto: envioBroker.assunto,
        localizador: reserva.localizador,
        dataEnvio: envioBroker.created_at,
      });
    }

    resultado.push({
      emailSendId: envio.id,
      reservationId: reserva.id,
      createdByEnvioOriginal: envio.created_by,
      envios: envios_,
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
