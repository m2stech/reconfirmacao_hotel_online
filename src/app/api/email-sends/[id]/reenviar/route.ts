import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buscarEnvioPorId } from "@/features/email-sends/queries";
import { reenviarEmail } from "@/features/email-sends/send";

type ReenviarBody = {
  destinatario?: string;
  assunto?: string;
};

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
  if (envioOriginal.status !== "erro") {
    return NextResponse.json(
      { ok: false, erro: "Só é possível reenviar um envio que terminou em erro." },
      { status: 400 }
    );
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

  const body = (await request.json().catch(() => ({}))) as ReenviarBody;
  const destinatario = body.destinatario?.trim() || envioOriginal.destinatario;
  const assunto = body.assunto?.trim() || envioOriginal.assunto;

  const resultado = await reenviarEmail(
    supabase,
    {
      reservationId: envioOriginal.reservation_id,
      localizador: reserva.localizador,
      destinatario,
      assunto,
      corpoHtml: envioOriginal.corpo_html,
      idioma: envioOriginal.idioma ?? "en",
    },
    user.id
  );

  if (!resultado.sucesso) {
    return NextResponse.json({ ok: false, erro: resultado.erro, emailSendId: resultado.emailSendId }, { status: 502 });
  }

  return NextResponse.json({ ok: true, emailSendId: resultado.emailSendId });
}
