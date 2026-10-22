import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { montarAssunto, montarCorpoHtml, envolverComAssinatura, idiomaPorPais } from "@/lib/graph/email-template";
import { enviarEmail } from "@/lib/graph/send-mail";
import { notificar } from "@/features/notifications/notify";
import { registrarEnvio } from "./queries";

type TypedClient = SupabaseClient<Database>;
type EmailSendKind = Database["reconfirmacao"]["Enums"]["email_send_kind"];

export type ReservaParaEnvio = {
  id: string;
  localizador: string;
  localizadorExterno: string | null;
  dataCheckin: string | null;
  dataCheckout: string | null;
  tipoHabitacao: string | null;
  regimeAlimentar: string | null;
  fornecedor: string | null;
  hospedes: { nome: string }[];
  hotelNome: string;
  hotelPais: string | null;
  destinatario: string;
};

export type ResultadoEnvioReserva =
  | { reservationId: string; sucesso: true; emailSendId: string }
  | { reservationId: string; sucesso: false; erro: string; emailSendId: string | null };

async function executarEnvioEregistrar(
  supabase: TypedClient,
  params: {
    reservationId: string;
    localizador: string;
    tipo: EmailSendKind;
    destinatario: string;
    assunto: string;
    corpoHtml: string;
    idioma: string;
  },
  userId: string
): Promise<ResultadoEnvioReserva> {
  const resultadoEnvio = await enviarEmail({
    destinatario: params.destinatario,
    assunto: params.assunto,
    corpoHtmlComAssinatura: params.corpoHtml,
  });

  const registro = await registrarEnvio(supabase, {
    reservation_id: params.reservationId,
    tipo: params.tipo,
    status: resultadoEnvio.sucesso ? "enviado" : "erro",
    destinatario: params.destinatario,
    assunto: params.assunto,
    corpo_html: params.corpoHtml,
    idioma: params.idioma,
    erro_detalhe: resultadoEnvio.sucesso ? null : resultadoEnvio.erro,
    graph_message_id: resultadoEnvio.sucesso ? resultadoEnvio.graphMessageId : null,
    graph_conversation_id: resultadoEnvio.sucesso ? resultadoEnvio.conversationId : null,
    internet_message_id: resultadoEnvio.sucesso ? resultadoEnvio.internetMessageId : null,
    created_by: userId,
  });

  const supabaseServiceRole = createServiceRoleClient();
  await supabaseServiceRole.from("audit_log").insert({
    actor_id: userId,
    action: resultadoEnvio.sucesso ? "email_send_succeeded" : "email_send_failed",
    entity_type: "email_send",
    entity_id: registro.id,
    metadata: {
      localizador: params.localizador,
      destinatario: params.destinatario,
      tipo: params.tipo,
      erro: resultadoEnvio.sucesso ? null : resultadoEnvio.erro,
    },
  });

  if (!resultadoEnvio.sucesso) {
    await notificar(supabase, {
      reservationId: params.reservationId,
      tipo: "erro_envio",
      mensagem: `Reserva ${params.localizador}: falha ao enviar e-mail (${params.tipo}).`,
      assuntoEmail: `[Reconfirmação] Falha no envio de e-mail — ${params.localizador}`,
      corpoEmail: `<p>O envio de e-mail (${params.tipo}) da reserva <strong>${params.localizador}</strong> falhou: ${resultadoEnvio.erro}</p>`,
      createdByEnvioOriginal: userId,
    });
    return { reservationId: params.reservationId, sucesso: false, erro: resultadoEnvio.erro, emailSendId: registro.id };
  }
  return { reservationId: params.reservationId, sucesso: true, emailSendId: registro.id };
}

/**
 * Envia o e-mail de reconfirmação inicial de uma reserva já consolidada
 * (1 e-mail por localizador+hotel — PRD §4.1.2) e registra o resultado em
 * `email_sends`, sempre (sucesso ou erro) — nunca falha silenciosamente.
 */
export async function enviarReconfirmacaoInicial(
  supabase: TypedClient,
  reserva: ReservaParaEnvio,
  userId: string
): Promise<ResultadoEnvioReserva> {
  const idioma = idiomaPorPais(reserva.hotelPais);
  const dadosTemplate = {
    hotelNome: reserva.hotelNome,
    localizador: reserva.localizador,
    localizadorExterno: reserva.localizadorExterno,
    dataCheckin: reserva.dataCheckin,
    dataCheckout: reserva.dataCheckout,
    hospedes: reserva.hospedes,
    tipoHabitacao: reserva.tipoHabitacao,
    regimeAlimentar: reserva.regimeAlimentar,
    fornecedor: reserva.fornecedor,
    pais: reserva.hotelPais,
  };

  const assunto = montarAssunto(dadosTemplate);
  const corpoHtml = envolverComAssinatura(montarCorpoHtml(dadosTemplate));

  return executarEnvioEregistrar(
    supabase,
    {
      reservationId: reserva.id,
      localizador: reserva.localizador,
      tipo: "reconfirmacao_inicial",
      destinatario: reserva.destinatario,
      assunto,
      corpoHtml,
      idioma,
    },
    userId
  );
}

/**
 * Reenvia um e-mail que falhou anteriormente, com destinatário/assunto
 * opcionalmente editados antes do reenvio (PLAN Milestone 7). Nunca
 * sobrescreve o envio anterior — grava uma nova linha em `email_sends` com
 * `tipo = 'reenvio'`, mesmo padrão de `enviados.xlsx` no sistema de
 * referência (histórico nunca é sobrescrito).
 */
export async function reenviarEmail(
  supabase: TypedClient,
  params: {
    reservationId: string;
    localizador: string;
    destinatario: string;
    assunto: string;
    corpoHtml: string;
    idioma: string;
  },
  userId: string
): Promise<ResultadoEnvioReserva> {
  return executarEnvioEregistrar(
    supabase,
    {
      reservationId: params.reservationId,
      localizador: params.localizador,
      tipo: "reenvio",
      destinatario: params.destinatario,
      assunto: params.assunto,
      corpoHtml: params.corpoHtml,
      idioma: params.idioma,
    },
    userId
  );
}
