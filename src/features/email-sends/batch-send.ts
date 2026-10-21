import "server-only";

// Envio em massa de reconfirmação inicial — cobre reservas gravadas sem
// envio (`audit_status.status = 'NAO_ENVIADO'`, ex: hotel ainda sem e-mail
// confirmado no momento do upload, mas confirmado depois em /hoteis — ver
// PLAN.md Milestone 8). Em lotes idempotentes: nunca reenvia quem já tem
// `email_sends` (dedupe bloqueante já garantido pela própria condição
// `NAO_ENVIADO`), e nunca bloqueia a request de upload (chamado por um
// Route Handler de job, não pelo fluxo síncrono de importação).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { enviarReconfirmacaoInicial } from "./send";

type TypedClient = SupabaseClient<Database>;

export type ResumoEnvioEmMassa = {
  reservasVerificadas: number;
  enviadas: number;
  semEmailConfirmado: number;
  comErroDeEnvio: { reservationId: string; erro: string }[];
};

/** `limite` processa em lotes pequenos por disparo — nunca a fila inteira numa única execução de Cron Job. */
export async function enviarReconfirmacoesPendentes(
  supabase: TypedClient,
  userId: string,
  limite: number
): Promise<ResumoEnvioEmMassa> {
  const resumo: ResumoEnvioEmMassa = {
    reservasVerificadas: 0,
    enviadas: 0,
    semEmailConfirmado: 0,
    comErroDeEnvio: [],
  };

  const { data: pendentes, error: erroAudit } = await supabase
    .schema("reconfirmacao")
    .from("audit_status")
    .select("reservation_id")
    .eq("status", "NAO_ENVIADO")
    .limit(limite);
  if (erroAudit) throw erroAudit;
  if (!pendentes || pendentes.length === 0) return resumo;

  const reservationIds = pendentes.map((p) => p.reservation_id).filter((id): id is string => id !== null);

  const { data: reservas, error: erroReservas } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("id, localizador, localizador_externo, data_checkin, data_checkout, tipo_habitacao, regime_alimentar, fornecedor, hospedes, hotel_id")
    .in("id", reservationIds);
  if (erroReservas) throw erroReservas;

  for (const reserva of reservas ?? []) {
    resumo.reservasVerificadas += 1;

    if (!reserva.hotel_id) {
      resumo.semEmailConfirmado += 1;
      continue;
    }

    const { data: hotel, error: erroHotel } = await supabase
      .schema("reconfirmacao")
      .from("hotels")
      .select("nome, pais, hotel_emails(email, confiabilidade)")
      .eq("id", reserva.hotel_id)
      .single();
    if (erroHotel || !hotel) {
      resumo.semEmailConfirmado += 1;
      continue;
    }

    const emailHotel = (hotel.hotel_emails ?? []).find((e) => e.confiabilidade === "confirmado");
    if (!emailHotel) {
      resumo.semEmailConfirmado += 1;
      continue;
    }

    const hospedesArray = Array.isArray(reserva.hospedes) ? (reserva.hospedes as { nome?: string }[]) : [];

    const resultado = await enviarReconfirmacaoInicial(
      supabase,
      {
        id: reserva.id,
        localizador: reserva.localizador,
        localizadorExterno: reserva.localizador_externo,
        dataCheckin: reserva.data_checkin,
        dataCheckout: reserva.data_checkout,
        tipoHabitacao: reserva.tipo_habitacao,
        regimeAlimentar: reserva.regime_alimentar,
        fornecedor: reserva.fornecedor,
        hospedes: hospedesArray.map((h) => ({ nome: h.nome ?? "" })),
        hotelNome: hotel.nome,
        hotelPais: hotel.pais,
        destinatario: emailHotel.email,
      },
      userId
    );

    if (resultado.sucesso) {
      resumo.enviadas += 1;
    } else {
      resumo.comErroDeEnvio.push({ reservationId: reserva.id, erro: resultado.erro });
    }
  }

  return resumo;
}
