import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";

const bodySchema = z.object({
  email: z.string().trim().email(),
});

// Usado quando o Tavily não encontrou e-mail de contato do hotel na
// importação (status EMAIL_NAO_ENCONTRADO — ver migration
// 20261026130000). O consultor insere o e-mail manualmente aqui; ele entra
// em hotel_emails já como 'confirmado' (humano validou na hora, mesmo nível
// de confiança de uma confirmação em /hoteis) e o envio inicial é disparado
// imediatamente, sem exigir um segundo passo em outra tela.
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
    return NextResponse.json({ ok: false, erro: "E-mail inválido." }, { status: 400 });
  }
  const email = payload.data.email;

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

  // Guarda contra duplo-clique / retry de rede: sem isso, uma segunda
  // chamada desta rota para a mesma reserva dispararia um segundo e-mail
  // real de reconfirmação ao hotel — email_sends não tem constraint de
  // banco que impeça duas linhas reconfirmacao_inicial para a mesma
  // reserva (achado do supabase-rls-reviewer, 2026-10-26).
  const { count: enviosExistentes } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("id", { count: "exact", head: true })
    .eq("reservation_id", reserva.id)
    .eq("tipo", "reconfirmacao_inicial");

  if ((enviosExistentes ?? 0) > 0) {
    return NextResponse.json(
      { ok: false, erro: "Esta reserva já teve um envio de reconfirmação inicial — use reenviar em vez de enviar de novo." },
      { status: 409 }
    );
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

  // unique(hotel_id, email) pode falhar em corrida (dois consultores
  // confirmando o mesmo hotel) ou duplo-clique — não é uma falha real,
  // o e-mail já está confirmado no banco, então segue para o envio.
  const erroEhDuplicataDeEmail = erroEmail?.code === "23505";
  if (erroEmail && !erroEhDuplicataDeEmail) {
    return NextResponse.json({ ok: false, erro: "Falha ao salvar e-mail do hotel." }, { status: 500 });
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
      hotelPais: hotel.pais,
      destinatario: email,
    },
    user.id
  );

  if (!resultado.sucesso) {
    return NextResponse.json({ ok: false, erro: resultado.erro }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSendId: resultado.emailSendId });
}
