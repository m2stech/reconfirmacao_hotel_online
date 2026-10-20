import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReservaConsolidada } from "@/features/reservations/parse-rooming-list";

type ConfirmarImportacaoBody = {
  arquivoNome: string;
  reservas: ReservaConsolidada[];
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const body = (await request.json()) as ConfirmarImportacaoBody;
  if (!Array.isArray(body.reservas) || body.reservas.length === 0) {
    return NextResponse.json({ ok: false, erro: "Nenhuma reserva para importar." }, { status: 400 });
  }

  // Chave de dedupe é (localizador, check-in, check-out) — não só
  // localizador: um mesmo Localizador pode cobrir um roteiro multi-hotel
  // (ver parseRoomingList), então duas linhas com o mesmo localizador mas
  // datas diferentes são hotéis/trechos distintos, não duplicata. hotel_id
  // ainda não está disponível como critério (fica nulo até o Milestone 5).
  const chaveDedupe = (localizador: string, checkin: string | null, checkout: string | null) =>
    `${localizador}::${checkin ?? ""}::${checkout ?? ""}`;

  const localizadores = body.reservas.map((reserva) => reserva.localizador);
  const { data: existentes, error: erroConsulta } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador, data_checkin, data_checkout")
    .in("localizador", localizadores);

  if (erroConsulta) {
    return NextResponse.json({ ok: false, erro: "Falha ao checar reservas já existentes." }, { status: 500 });
  }

  const jaExistentes = new Set(
    (existentes ?? []).map((linha) => chaveDedupe(linha.localizador, linha.data_checkin, linha.data_checkout))
  );
  const novasReservas = body.reservas.filter(
    (reserva) => !jaExistentes.has(chaveDedupe(reserva.localizador, reserva.dataCheckin, reserva.dataCheckout))
  );

  if (novasReservas.length === 0) {
    return NextResponse.json({
      ok: true,
      importadas: 0,
      puladas: body.reservas.length,
      mensagem: "Todos os localizadores já existem no banco — nada foi importado.",
    });
  }

  const linhasParaInserir = novasReservas.map((reserva) => ({
    localizador: reserva.localizador,
    localizador_externo: reserva.localizadorExterno,
    fornecedor: reserva.fornecedor,
    data_checkin: reserva.dataCheckin,
    data_checkout: reserva.dataCheckout,
    tipo_habitacao: reserva.tipoHabitacao,
    regime_alimentar: reserva.regimeAlimentar,
    hospedes: reserva.hospedes,
    roomlist_arquivo: body.arquivoNome,
    created_by: user.id,
  }));

  const { data: inseridas, error: erroInsercao } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .insert(linhasParaInserir)
    .select("id");

  if (erroInsercao) {
    return NextResponse.json({ ok: false, erro: "Falha ao gravar reservas." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    importadas: inseridas?.length ?? 0,
    puladas: body.reservas.length - novasReservas.length,
  });
}
