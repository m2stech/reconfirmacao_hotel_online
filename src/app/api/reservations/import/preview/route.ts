import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseRoomingList } from "@/features/reservations/parse-rooming-list";
import { buscarHoteisParaMatch, resolverHotelPorNome } from "@/features/hotels/queries";

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

  // Liga cada reserva ao hotel do banco de contatos (match exato → fuzzy,
  // Milestone 5). Matching mais sofisticado (Tavily) fica para o Milestone 8.
  const hoteisParaMatch = await buscarHoteisParaMatch(supabase);
  const matchesPorNome = resolverHotelPorNome(
    resultado.reservas.map((reserva) => reserva.hotelNome),
    hoteisParaMatch
  );

  // Dedupe por (hotel_id, localizador) — a chave real de consolidação do
  // domínio (PRD/PLAN Milestone 5), que bate com a constraint
  // unique(hotel_id, localizador) da tabela. Reserva sem hotel resolvido
  // ainda (hotel novo/sem match) cai no fallback por (localizador, hotelNome)
  // já que não há hotel_id para comparar.
  const localizadores = resultado.reservas.map((reserva) => reserva.localizador);
  const { data: existentes, error } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador, hotel_id, created_at, hotels(nome)")
    .in("localizador", localizadores.length > 0 ? localizadores : [""]);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao consultar reservas existentes." }, { status: 500 });
  }

  const existentesPorHotelId = new Map<string, string>();
  const existentesPorNomeHotel = new Map<string, string>();
  for (const linha of existentes ?? []) {
    if (linha.hotel_id) {
      existentesPorHotelId.set(`${linha.localizador}::${linha.hotel_id}`, linha.created_at);
    }
    const hotelRelacionado = Array.isArray(linha.hotels) ? linha.hotels[0] : linha.hotels;
    const nomeHotel = (hotelRelacionado as { nome: string } | undefined)?.nome;
    if (nomeHotel) {
      existentesPorNomeHotel.set(`${linha.localizador}::${nomeHotel}`, linha.created_at);
    }
  }

  const reservas = resultado.reservas.map((reserva) => {
    const match = matchesPorNome.get(reserva.hotelNome) ?? { hotelId: null, confianca: 0 };
    const jaProcessadoEm = match.hotelId
      ? existentesPorHotelId.get(`${reserva.localizador}::${match.hotelId}`) ?? null
      : existentesPorNomeHotel.get(`${reserva.localizador}::${reserva.hotelNome}`) ?? null;

    return {
      ...reserva,
      hotelId: match.hotelId,
      hotelMatchConfianca: match.confianca,
      jaProcessado: jaProcessadoEm !== null,
      jaProcessadoEm,
    };
  });

  return NextResponse.json({ ok: true, arquivoNome: arquivo.name, reservas });
}
