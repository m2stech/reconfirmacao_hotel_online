import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReservaConsolidadaComHotel } from "@/features/reservations/parse-rooming-list";

type ConfirmarImportacaoBody = {
  arquivoNome: string;
  reservas: ReservaConsolidadaComHotel[];
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

  // Chave de dedupe é (localizador, hotel) — a chave real de consolidação do
  // domínio (Milestone 5), que bate com a constraint unique(hotel_id,
  // localizador) da tabela. Reserva sem hotel_id resolvido cai no fallback
  // por nome do hotel, já que não há hotel_id para comparar ainda.
  const chaveDedupe = (localizador: string, hotelId: string | null, hotelNome: string) =>
    `${localizador}::${hotelId ?? `nome:${hotelNome}`}`;

  const localizadores = body.reservas.map((reserva) => reserva.localizador);
  const { data: existentes, error: erroConsulta } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador, hotel_id, hotels(nome)")
    .in("localizador", localizadores);

  if (erroConsulta) {
    return NextResponse.json({ ok: false, erro: "Falha ao checar reservas já existentes." }, { status: 500 });
  }

  const jaExistentes = new Set(
    (existentes ?? []).map((linha) => {
      const hotelRelacionado = Array.isArray(linha.hotels) ? linha.hotels[0] : linha.hotels;
      const nomeHotel = (hotelRelacionado as { nome: string } | undefined)?.nome ?? "";
      return chaveDedupe(linha.localizador, linha.hotel_id, nomeHotel);
    })
  );
  const novasReservas = body.reservas.filter(
    (reserva) => !jaExistentes.has(chaveDedupe(reserva.localizador, reserva.hotelId, reserva.hotelNome))
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
    hotel_id: reserva.hotelId,
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
