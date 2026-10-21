import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buscarEnvioPorId, registrarEnvio } from "@/features/email-sends/queries";
import { responderHotel } from "@/lib/graph/reply";

type ResponderBody = {
  textoUsuario: string;
  assunto?: string;
  destinatario?: string;
};

/**
 * Resposta manual do consultor numa thread já aberta com o hotel (reply
 * preservando o histórico via createReply -> patch -> send, portado de
 * enviar_email.py `responder_hotel` — PLAN Milestone 7). `:id` é o
 * `email_sends.id` da mensagem (nossa ou do hotel) à qual se está
 * respondendo; a mensagem do Graph é localizada por graph_message_id,
 * com fallback por internet_message_id.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const envioOriginal = await buscarEnvioPorId(supabase, id);
  if (!envioOriginal) {
    return NextResponse.json({ ok: false, erro: "Envio não encontrado." }, { status: 404 });
  }

  const body = (await request.json()) as ResponderBody;
  if (!body.textoUsuario?.trim()) {
    return NextResponse.json({ ok: false, erro: "Texto da resposta é obrigatório." }, { status: 400 });
  }

  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador")
    .eq("id", envioOriginal.reservation_id)
    .single();
  if (erroReserva || !reserva) {
    return NextResponse.json({ ok: false, erro: "Reserva relacionada não encontrada." }, { status: 404 });
  }

  const destinatario = body.destinatario?.trim() || envioOriginal.destinatario;
  const assunto = body.assunto?.trim() || envioOriginal.assunto;

  const resultado = await responderHotel({
    graphMessageIdOriginal: envioOriginal.graph_message_id,
    internetMessageIdOriginal: envioOriginal.internet_message_id,
    destinatario,
    novoAssunto: assunto,
    textoUsuario: body.textoUsuario,
  });

  if (!resultado.sucesso) {
    const registro = await registrarEnvio(supabase, {
      reservation_id: envioOriginal.reservation_id,
      tipo: "resposta_manual",
      status: "erro",
      destinatario,
      assunto,
      corpo_html: body.textoUsuario,
      idioma: envioOriginal.idioma,
      erro_detalhe: resultado.erro,
      created_by: user.id,
    });

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "email_send_failed",
      entity_type: "email_send",
      entity_id: registro.id,
      metadata: { localizador: reserva.localizador, destinatario, tipo: "resposta_manual", erro: resultado.erro },
    });

    return NextResponse.json({ ok: false, erro: resultado.erro, emailSendId: registro.id }, { status: 502 });
  }

  const registro = await registrarEnvio(supabase, {
    reservation_id: envioOriginal.reservation_id,
    tipo: "resposta_manual",
    status: "enviado",
    destinatario,
    assunto,
    corpo_html: resultado.corpoHtml,
    idioma: envioOriginal.idioma,
    graph_message_id: resultado.graphMessageId,
    graph_conversation_id: resultado.conversationId,
    internet_message_id: resultado.internetMessageId,
    created_by: user.id,
  });

  const supabaseServiceRole = createServiceRoleClient();
  await supabaseServiceRole.from("audit_log").insert({
    actor_id: user.id,
    action: "email_send_succeeded",
    entity_type: "email_send",
    entity_id: registro.id,
    metadata: { localizador: reserva.localizador, destinatario, tipo: "resposta_manual" },
  });

  return NextResponse.json({ ok: true, emailSendId: registro.id });
}
