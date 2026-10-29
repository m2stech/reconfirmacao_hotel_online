import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";

const bodySchema = z.object({
  email: z.string().trim().email(),
  pais: z.string().trim().min(1),
});

/**
 * Corrige o e-mail E o país de contato do hotel (status REVISAR por contato
 * errado, ex. resposta vazando de domínio/fornecedor diferente do esperado —
 * sintoma de que o hotel cadastrado é outro, então tanto e-mail quanto país
 * podem estar errados) e reenvia a reconfirmação original para o e-mail
 * corrigido — não é um `reenvio` de um email_send específico, é um novo
 * ciclo do zero. E-mails ativos anteriores do hotel (confirmado ou sugerido)
 * são marcados como obsoletos para não concorrerem com o novo no próximo
 * envio automático de outras reservas do mesmo hotel. País corrigido ganha
 * `pais_fonte: 'manual'`/`pais_a_confirmar: false` (mesmo padrão de
 * confirmação manual usado em `criarHotel`) — o idioma do e-mail reenviado é
 * derivado automaticamente do novo país (`idiomaPorPais`, Milestone 7), sem
 * lógica extra.
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
    return NextResponse.json({ ok: false, erro: "E-mail e país são obrigatórios." }, { status: 400 });
  }
  const { email, pais } = payload.data;

  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select(
      "id, localizador, localizador_externo, data_checkin, data_checkout, tipo_habitacao, regime_alimentar, fornecedor, hospedes, hotel_id, hotels(nome, pais)"
    )
    .eq("id", id)
    .single();

  if (erroReserva || !reserva) {
    return NextResponse.json({ ok: false, erro: "Reserva não encontrada." }, { status: 404 });
  }
  const hotel = Array.isArray(reserva.hotels) ? reserva.hotels[0] : reserva.hotels;
  if (!reserva.hotel_id || !hotel) {
    return NextResponse.json({ ok: false, erro: "Reserva sem hotel vinculado." }, { status: 400 });
  }

  const { error: erroPais } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .update({ pais, pais_fonte: "manual", pais_a_confirmar: false })
    .eq("id", reserva.hotel_id);
  if (erroPais) {
    return NextResponse.json({ ok: false, erro: "Falha ao corrigir país do hotel." }, { status: 500 });
  }

  const { error: erroObsoletar } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .update({ confiabilidade: "obsoleto", bounced_em: new Date().toISOString() })
    .eq("hotel_id", reserva.hotel_id)
    .neq("confiabilidade", "obsoleto");
  if (erroObsoletar) {
    return NextResponse.json({ ok: false, erro: "Falha ao marcar e-mail anterior como obsoleto." }, { status: 500 });
  }

  const { error: erroEmail } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .insert({
      hotel_id: reserva.hotel_id,
      email,
      fonte: "manual",
      confiabilidade: "confirmado",
    });
  const erroEhDuplicataDeEmail = erroEmail?.code === "23505";
  if (erroEmail && !erroEhDuplicataDeEmail) {
    return NextResponse.json({ ok: false, erro: "Falha ao salvar e-mail do hotel." }, { status: 500 });
  }
  if (erroEhDuplicataDeEmail) {
    const { error: erroReconfirmar } = await supabase
      .schema("reconfirmacao")
      .from("hotel_emails")
      .update({ confiabilidade: "confirmado", bounced_em: null })
      .eq("hotel_id", reserva.hotel_id)
      .eq("email", email);
    if (erroReconfirmar) {
      return NextResponse.json({ ok: false, erro: "Falha ao confirmar e-mail do hotel." }, { status: 500 });
    }
  }

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
      hospedes: reserva.hospedes as { nome: string }[],
      hotelNome: hotel.nome,
      hotelPais: pais,
      destinatario: email,
    },
    user.id
  );

  if (!resultado.sucesso) {
    return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 502 });
  }

  // Limpa o override manual (ex. REVISAR setado pelo cálculo automático a
  // partir da resposta divergente anterior) para o status voltar a refletir
  // o novo ciclo de envio (AGUARDANDO_RESPOSTA, calculado pela view
  // audit_status a partir do email_send recém-criado).
  await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .update({
      status_manual: null,
      auditoria_atualizada_em: new Date().toISOString(),
      auditoria_atualizada_por: user.id,
    })
    .eq("id", id);

  const supabaseServiceRole = createServiceRoleClient();
  await supabaseServiceRole.from("audit_log").insert({
    actor_id: user.id,
    action: "hotel_email_corrected_and_resent",
    entity_type: "reservation",
    entity_id: id,
    metadata: { localizador: reserva.localizador, novo_email: email, novo_pais: pais, pais_anterior: hotel.pais },
  });

  return NextResponse.json({ ok: true, emailSendId: resultado.emailSendId });
}
