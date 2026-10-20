import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRoomingList } from "@/features/reservations/parse-rooming-list";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const formData = await request.formData();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ ok: false, erro: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const resultado = parseRoomingList(buffer);

  if (!resultado.ok) {
    return NextResponse.json(resultado, { status: 422 });
  }

  // Dedupe por (localizador, check-in, check-out) — não só localizador: um
  // mesmo Localizador pode cobrir um roteiro multi-hotel (ver
  // parseRoomingList), então duas linhas com o mesmo localizador mas datas
  // diferentes são hotéis/trechos distintos, não duplicata. hotel_id ainda
  // não está disponível como critério (fica nulo até o Milestone 5) — é só
  // sinalização visual aqui, o bloqueio real de reenvio é o Milestone 7.
  const chaveDedupe = (localizador: string, checkin: string | null, checkout: string | null) =>
    `${localizador}::${checkin ?? ""}::${checkout ?? ""}`;

  const localizadores = resultado.reservas.map((reserva) => reserva.localizador);
  const { data: existentes, error } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador, data_checkin, data_checkout")
    .in("localizador", localizadores.length > 0 ? localizadores : [""]);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao consultar reservas existentes." }, { status: 500 });
  }

  const chavesExistentes = new Set(
    (existentes ?? []).map((linha) => chaveDedupe(linha.localizador, linha.data_checkin, linha.data_checkout))
  );

  const reservas = resultado.reservas.map((reserva) => ({
    ...reserva,
    jaProcessado: chavesExistentes.has(chaveDedupe(reserva.localizador, reserva.dataCheckin, reserva.dataCheckout)),
  }));

  return NextResponse.json({ ok: true, arquivoNome: arquivo.name, reservas });
}
