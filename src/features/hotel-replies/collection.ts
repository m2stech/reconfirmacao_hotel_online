import "server-only";

// Cobrança automática ao hotel (Milestone 11): até 3 lembretes com 24h de
// intervalo cada, preservando a thread original (mesmo mecanismo de
// resposta do Milestone 7 — `responderHotel`). Esgotadas as 3 tentativas
// sem resposta, dispara notificação (`sla_esgotado`) em vez de enviar de
// novo — decisão fechada com o usuário: sem escalonamento a broker ainda
// (origem do e-mail do broker não definida).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { responderHotel } from "@/lib/graph/reply";
import { registrarEnvio } from "@/features/email-sends/queries";
import { notificar } from "@/features/notifications/notify";
import { listarReservasParaCobranca, MAX_TENTATIVAS_COBRANCA, type ReservaElegivelParaCobranca } from "./collection-pending";

type TypedClient = SupabaseClient<Database>;

function descreverErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "object" && erro !== null) {
    try {
      return JSON.stringify(erro);
    } catch {
      return String(erro);
    }
  }
  return String(erro);
}

function textoCobranca(numeroTentativa: number, localizador: string): string {
  return `Olá, ainda não recebemos sua resposta de reconfirmação da reserva ${localizador}. Esta é a cobrança nº ${numeroTentativa} — pedimos a confirmação o quanto antes para seguirmos com o atendimento.`;
}

async function cobrarUmaReserva(supabase: TypedClient, reserva: ReservaElegivelParaCobranca): Promise<"cobrada" | "esgotada" | "erro"> {
  const proximaTentativa = reserva.tentativas + 1;

  if (proximaTentativa > MAX_TENTATIVAS_COBRANCA) {
    await notificar(supabase, {
      reservationId: reserva.reservationId,
      tipo: "sla_esgotado",
      mensagem: `Reserva ${reserva.localizador}: 3 cobranças automáticas enviadas ao hotel sem resposta.`,
      assuntoEmail: `[Reconfirmação] Hotel sem resposta após 3 cobranças — ${reserva.localizador}`,
      corpoEmail: `<p>A reserva <strong>${reserva.localizador}</strong> não teve resposta do hotel após 3 cobranças automáticas (24h entre cada). Nenhuma nova cobrança será enviada automaticamente — avalie contato manual.</p>`,
      createdByEnvioOriginal: reserva.createdByEnvioOriginal,
    });

    // Sentinela (MAX + 1): sem isso, esta mesma reserva voltaria a ser
    // "elegível" no próximo disparo do cron (ainda AGUARDANDO_RESPOSTA,
    // janela de 24h já vencida) e notificaria sla_esgotado de novo, todo
    // dia, para sempre. listarReservasParaCobranca exclui tentativas > MAX.
    const { error: erroSentinela } = await supabase
      .schema("reconfirmacao")
      .from("reservations")
      .update({ cobranca_tentativas: MAX_TENTATIVAS_COBRANCA + 1 })
      .eq("id", reserva.reservationId);
    if (erroSentinela) throw erroSentinela;

    return "esgotada";
  }

  const resultado = await responderHotel({
    graphMessageIdOriginal: reserva.graphMessageId,
    internetMessageIdOriginal: reserva.internetMessageId,
    destinatario: reserva.destinatario,
    novoAssunto: `RE: Reconfirmação de reserva ${reserva.localizador} — cobrança ${proximaTentativa}/${MAX_TENTATIVAS_COBRANCA}`,
    textoUsuario: textoCobranca(proximaTentativa, reserva.localizador),
  });

  const agora = new Date().toISOString();

  if (!resultado.sucesso) {
    await registrarEnvio(supabase, {
      reservation_id: reserva.reservationId,
      tipo: "reenvio",
      status: "erro",
      destinatario: reserva.destinatario,
      assunto: `Cobrança ${proximaTentativa}/${MAX_TENTATIVAS_COBRANCA} — ${reserva.localizador}`,
      corpo_html: textoCobranca(proximaTentativa, reserva.localizador),
      erro_detalhe: resultado.erro,
    });

    await notificar(supabase, {
      reservationId: reserva.reservationId,
      tipo: "erro_envio",
      mensagem: `Reserva ${reserva.localizador}: falha ao enviar cobrança automática nº ${proximaTentativa}.`,
      assuntoEmail: `[Reconfirmação] Falha ao enviar cobrança — ${reserva.localizador}`,
      corpoEmail: `<p>A cobrança automática nº ${proximaTentativa} da reserva <strong>${reserva.localizador}</strong> falhou: ${resultado.erro}</p>`,
      createdByEnvioOriginal: reserva.createdByEnvioOriginal,
    });
    return "erro";
  }

  await registrarEnvio(supabase, {
    reservation_id: reserva.reservationId,
    tipo: "reenvio",
    status: "enviado",
    destinatario: reserva.destinatario,
    assunto: `Cobrança ${proximaTentativa}/${MAX_TENTATIVAS_COBRANCA} — ${reserva.localizador}`,
    corpo_html: resultado.corpoHtml,
    graph_message_id: resultado.graphMessageId,
    graph_conversation_id: resultado.conversationId,
    internet_message_id: resultado.internetMessageId,
  });

  const { error: erroUpdate } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .update({ cobranca_tentativas: proximaTentativa, cobranca_ultima_em: agora })
    .eq("id", reserva.reservationId);
  if (erroUpdate) throw erroUpdate;

  return "cobrada";
}

export type ResumoCobranca = {
  reservasVerificadas: number;
  cobrancasEnviadas: number;
  slaEsgotado: number;
  erros: { reservationId: string; erro: string }[];
};

export type OpcoesCobranca = { limiteReservas: number };
export const OPCOES_COBRANCA_PADRAO: OpcoesCobranca = { limiteReservas: 25 };

/**
 * Processa um lote de reservas elegíveis para cobrança automática —
 * execução curta e idempotente, disparada por Vercel Cron (CLAUDE.md: nada
 * de loop vivo). Isolamento de erro por reserva, mesmo padrão de
 * `process-batch.ts` (Milestone 10).
 */
export async function processarLoteDeCobranca(
  supabase: TypedClient,
  opcoes: OpcoesCobranca = OPCOES_COBRANCA_PADRAO
): Promise<ResumoCobranca> {
  const resumo: ResumoCobranca = { reservasVerificadas: 0, cobrancasEnviadas: 0, slaEsgotado: 0, erros: [] };

  const elegiveis = await listarReservasParaCobranca(supabase, opcoes.limiteReservas);

  for (const reserva of elegiveis) {
    resumo.reservasVerificadas += 1;
    try {
      const resultado = await cobrarUmaReserva(supabase, reserva);
      if (resultado === "cobrada") resumo.cobrancasEnviadas += 1;
      if (resultado === "esgotada") resumo.slaEsgotado += 1;
    } catch (erro) {
      resumo.erros.push({ reservationId: reserva.reservationId, erro: descreverErro(erro) });
    }
  }

  return resumo;
}
