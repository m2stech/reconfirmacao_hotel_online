import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { enviarEmail } from "@/lib/graph/send-mail";
import { upsertBroker, registrarEnvioBroker } from "@/features/brokers/queries";

const bodySchema = z.object({
  email: z.string().trim().email(),
  pais: z.string().trim().min(1),
});

/**
 * Envia uma cópia da reconfirmação (mesmo assunto/corpo já montados para o
 * hotel no último envio registrado) ao Broker da reserva — o fornecedor
 * (reservations.fornecedor). Cadastra/atualiza o broker por nome de
 * fornecedor (1 linha reaproveitada entre reservas) e grava o envio em
 * `broker_sends`, separado de `email_sends` de propósito: ação manual e
 * repetível do consultor, sem dedup nem participação no fluxo de
 * leitura/cobrança automática do hotel.
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

  const payload = bodySchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ ok: false, erro: "E-mail e país do broker são obrigatórios." }, { status: 400 });
  }
  const { email, pais } = payload.data;

  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("id, localizador, fornecedor")
    .eq("id", id)
    .single();

  if (erroReserva || !reserva) {
    return NextResponse.json({ ok: false, erro: "Reserva não encontrada." }, { status: 404 });
  }
  if (!reserva.fornecedor) {
    return NextResponse.json({ ok: false, erro: "Reserva sem fornecedor (Broker) cadastrado." }, { status: 400 });
  }

  const { data: ultimoEnvio, error: erroUltimoEnvio } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("assunto, corpo_html")
    .eq("reservation_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroUltimoEnvio || !ultimoEnvio) {
    return NextResponse.json(
      { ok: false, erro: "Nenhum e-mail de reconfirmação enviado ainda para esta reserva — envie ao hotel primeiro." },
      { status: 400 }
    );
  }

  let broker;
  try {
    broker = await upsertBroker(supabase, { nome: reserva.fornecedor, email, pais }, user.id);
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao salvar contato do broker." }, { status: 500 });
  }

  const resultadoEnvio = await enviarEmail({
    destinatario: email,
    assunto: ultimoEnvio.assunto,
    corpoHtmlComAssinatura: ultimoEnvio.corpo_html,
  });

  let registro;
  try {
    registro = await registrarEnvioBroker(supabase, {
      reservation_id: id,
      broker_id: broker.id,
      destinatario: email,
      assunto: ultimoEnvio.assunto,
      corpo_html: ultimoEnvio.corpo_html,
      status: resultadoEnvio.sucesso ? "enviado" : "erro",
      erro_detalhe: resultadoEnvio.sucesso ? null : resultadoEnvio.erro,
      graph_message_id: resultadoEnvio.sucesso ? resultadoEnvio.graphMessageId : null,
      graph_conversation_id: resultadoEnvio.sucesso ? resultadoEnvio.conversationId : null,
      internet_message_id: resultadoEnvio.sucesso ? resultadoEnvio.internetMessageId : null,
      created_by: user.id,
    });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao registrar envio ao broker." }, { status: 500 });
  }

  const supabaseServiceRole = createServiceRoleClient();
  await supabaseServiceRole.schema("reconfirmacao").from("audit_log").insert({
    actor_id: user.id,
    action: resultadoEnvio.sucesso ? "broker_send_succeeded" : "broker_send_failed",
    entity_type: "broker_send",
    entity_id: registro.id,
    metadata: {
      localizador: reserva.localizador,
      fornecedor: reserva.fornecedor,
      destinatario: email,
      erro: resultadoEnvio.sucesso ? null : resultadoEnvio.erro,
    },
  });

  if (!resultadoEnvio.sucesso) {
    return NextResponse.json({ ok: false, erro: resultadoEnvio.erro }, { status: 502 });
  }

  return NextResponse.json({ ok: true, brokerSendId: registro.id });
}
