import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ReservaConsolidadaComHotel } from "@/features/reservations/parse-rooming-list";
import { enviarReconfirmacaoInicial } from "@/features/email-sends/send";
import { criarHotelComEnriquecimentoTavily } from "@/features/hotels/enrich";
import { buscarHoteisParaMatch } from "@/features/hotels/queries";
import { encontrarMelhorMatch } from "@/features/hotels/match";

type ConfirmarImportacaoBody = {
  arquivoNome: string;
  reservas: ReservaConsolidadaComHotel[];
};

type ResultadoEnvioRelatorio = {
  localizador: string;
  hotelNome: string;
  sucesso: boolean;
  motivo?: string;
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

  // Resolve o hotel_id real de cada reserva ANTES de checar dedupe — nunca
  // confiar cegamente no reserva.hotelId do payload, que vem do preview
  // gerado no client e pode estar desatualizado (ex. consultor confirma a
  // mesma importação duas vezes sem recarregar a tela: bug real encontrado
  // em teste manual do Milestone 8, que duplicou ~47 hotéis e reservas).
  // Hotel sem match é criado agora, já enriquecido via Tavily numa única
  // chamada por nome de hotel novo distinto neste upload — o matching fuzzy
  // é refeito aqui contra o estado atual do banco, nunca contra o hotelId
  // stale do client, para nunca duplicar um hotel que já existe.
  const hoteisAtuais = await buscarHoteisParaMatch(supabase);
  const hotelIdPorNomeNovo = new Map<string, string>();
  for (const nomeHotel of new Set(
    body.reservas.filter((r) => !r.hotelId).map((r) => r.hotelNome)
  )) {
    const matchAtual = encontrarMelhorMatch(nomeHotel, hoteisAtuais);
    if (matchAtual.hotelId) {
      hotelIdPorNomeNovo.set(nomeHotel, matchAtual.hotelId);
      continue;
    }
    const { hotelId } = await criarHotelComEnriquecimentoTavily(supabase, nomeHotel);
    hotelIdPorNomeNovo.set(nomeHotel, hotelId);
    // Hotel recém-criado entra na lista de candidatos imediatamente — se
    // outro nome novo deste mesmo upload for uma variação de grafia dele
    // (ex. "Hotel X" e "Hotel X Ltda" na mesma planilha), o segundo reusa
    // o hotel que o primeiro acabou de criar em vez de criar de novo.
    hoteisAtuais.push({ id: hotelId, nome: nomeHotel, nomesAlternativos: [] });
  }

  const reservasComHotelResolvido = body.reservas.map((reserva) => ({
    ...reserva,
    hotelId: reserva.hotelId ?? hotelIdPorNomeNovo.get(reserva.hotelNome) ?? null,
  }));

  // Chave de dedupe é (localizador, hotel) — a chave real de consolidação do
  // domínio (Milestone 5), que bate com a constraint unique(hotel_id,
  // localizador) da tabela. Usa sempre o hotel_id já resolvido acima, nunca
  // o nome do hotel como fallback — evita o descasamento de chave que
  // causava a falha de dedupe descrita acima.
  const chaveDedupe = (localizador: string, hotelId: string | null) => `${localizador}::${hotelId ?? "sem-hotel"}`;

  const localizadores = reservasComHotelResolvido.map((reserva) => reserva.localizador);
  const { data: existentes, error: erroConsulta } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador, hotel_id")
    .in("localizador", localizadores);

  if (erroConsulta) {
    return NextResponse.json({ ok: false, erro: "Falha ao checar reservas já existentes." }, { status: 500 });
  }

  const jaExistentes = new Set(
    (existentes ?? []).map((linha) => chaveDedupe(linha.localizador, linha.hotel_id))
  );
  const novasReservas = reservasComHotelResolvido.filter(
    (reserva) => !jaExistentes.has(chaveDedupe(reserva.localizador, reserva.hotelId))
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
    .select("id, localizador, hotel_id");

  if (erroInsercao) {
    return NextResponse.json({ ok: false, erro: "Falha ao gravar reservas." }, { status: 500 });
  }

  // Envio real de e-mail de reconfirmação (Milestone 7) — 1 e-mail por
  // reserva consolidada (localizador+hotel), nunca reenvio silencioso: a
  // dedupe já aconteceu acima por (localizador, hotel_id já resolvido),
  // então toda reserva recém-inserida aqui é de fato nova e deve ser
  // enviada agora.
  const relatorioEnvios: ResultadoEnvioRelatorio[] = [];
  let enviadas = 0;
  let semHotelOuEmail = 0;
  let comErroDeEnvio = 0;

  for (const [indice, inserida] of (inseridas ?? []).entries()) {
    // Índice posicional: novasReservas já tem hotelId resolvido (igual ao
    // hotel_id gravado), insert() preserva a ordem do array enviado.
    const reservaOriginal = novasReservas[indice];
    if (!reservaOriginal) continue;

    if (!inserida.hotel_id) {
      semHotelOuEmail += 1;
      relatorioEnvios.push({
        localizador: inserida.localizador,
        hotelNome: reservaOriginal.hotelNome,
        sucesso: false,
        motivo: "Hotel não cadastrado no banco de contatos — reserva gravada, e-mail não enviado.",
      });
      continue;
    }

    const { data: hotel, error: erroHotel } = await supabase
      .schema("reconfirmacao")
      .from("hotels")
      .select("nome, pais, hotel_emails(email, confiabilidade)")
      .eq("id", inserida.hotel_id)
      .single();

    // Só usa e-mail já confirmado por humano para envio automático — e-mail
    // "sugerido" (descoberto por Tavily, Milestone 8) exige confirmação
    // manual em /hoteis antes do primeiro uso (PRD §4.2, item 2).
    const emailHotel = (hotel?.hotel_emails ?? []).find((e) => e.confiabilidade === "confirmado");

    if (erroHotel || !hotel || !emailHotel) {
      semHotelOuEmail += 1;
      relatorioEnvios.push({
        localizador: inserida.localizador,
        hotelNome: reservaOriginal.hotelNome,
        sucesso: false,
        motivo: "Hotel sem e-mail de contato confirmado — reserva gravada, e-mail não enviado (confirme o contato em /hoteis).",
      });
      continue;
    }

    const resultado = await enviarReconfirmacaoInicial(
      supabase,
      {
        id: inserida.id,
        localizador: reservaOriginal.localizador,
        localizadorExterno: reservaOriginal.localizadorExterno,
        dataCheckin: reservaOriginal.dataCheckin,
        dataCheckout: reservaOriginal.dataCheckout,
        tipoHabitacao: reservaOriginal.tipoHabitacao,
        regimeAlimentar: reservaOriginal.regimeAlimentar,
        fornecedor: reservaOriginal.fornecedor,
        hospedes: reservaOriginal.hospedes,
        hotelNome: hotel.nome,
        hotelPais: hotel.pais,
        destinatario: emailHotel.email,
      },
      user.id
    );

    if (resultado.sucesso) {
      enviadas += 1;
      relatorioEnvios.push({ localizador: inserida.localizador, hotelNome: hotel.nome, sucesso: true });
    } else {
      comErroDeEnvio += 1;
      relatorioEnvios.push({
        localizador: inserida.localizador,
        hotelNome: hotel.nome,
        sucesso: false,
        motivo: resultado.erro,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    importadas: inseridas?.length ?? 0,
    puladas: body.reservas.length - novasReservas.length,
    enviadas,
    semHotelOuEmail,
    comErroDeEnvio,
    relatorioEnvios,
  });
}
