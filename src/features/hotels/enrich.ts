import "server-only";

// Orquestra a busca automática de e-mail/país de hotel via Tavily
// (Milestone 8, PRD §4.2 item 2) — substitui o passo manual de colar o xlsx
// numa LLM de chat externa.
//
// Regra de negócio: só aciona o Tavily para hotel desconhecido ou com
// contato marcado `obsoleto` (PRD §4.2 item 1) — hotel já confirmado/sugerido
// não gera chamada nova, nem para e-mail nem para país.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buscarContatoHotel } from "@/lib/tavily/client";

type TypedClient = SupabaseClient<Database>;

const LIMIAR_CONFIANCA_MINIMA = 0.3;

const EMAIL_FORMATO_VALIDO = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PAIS_FORMATO_VALIDO = /^[A-Za-zÀ-ÿ\s-]{2,60}$/;

export type ResultadoEnriquecimento = {
  emailEncontrado: string | null;
  paisEncontrado: string | null;
};

// Dado vindo da web (Tavily) nunca é confiável por construção, mesmo já
// tendo passado pelo regex de extração em client.ts — valida formato de
// novo aqui, na fronteira com a persistência, descartando (volta a null)
// qualquer valor fora do esperado em vez de gravar lixo na base de hotéis.
function validarEnriquecimento(resultado: {
  email: string | null;
  confiancaEmail: number;
  pais: string | null;
  confiancaPais: number;
}): ResultadoEnriquecimento {
  const emailValido =
    resultado.confiancaEmail >= LIMIAR_CONFIANCA_MINIMA && resultado.email && EMAIL_FORMATO_VALIDO.test(resultado.email)
      ? resultado.email
      : null;
  const paisValido =
    resultado.confiancaPais >= LIMIAR_CONFIANCA_MINIMA && resultado.pais && PAIS_FORMATO_VALIDO.test(resultado.pais)
      ? resultado.pais
      : null;

  return { emailEncontrado: emailValido, paisEncontrado: paisValido };
}

/**
 * Cria um hotel novo já enriquecido via Tavily (1 chamada combinada
 * e-mail+país). E-mail entra como sugestão (`confiabilidade: 'sugerido'`,
 * `fonte: 'tavily'`) — exige confirmação humana antes do primeiro uso
 * (nunca usado para envio automático). País entra com `pais_a_confirmar:
 * true` — não bloqueia o fluxo, só fica marcado para revisão posterior.
 */
export async function criarHotelComEnriquecimentoTavily(
  supabase: TypedClient,
  nomeHotel: string
): Promise<{ hotelId: string; enriquecimento: ResultadoEnriquecimento }> {
  let enriquecimento: ResultadoEnriquecimento = { emailEncontrado: null, paisEncontrado: null };

  try {
    const resultado = await buscarContatoHotel(nomeHotel);
    enriquecimento = validarEnriquecimento(resultado);
  } catch {
    // Busca indisponível não deve bloquear a importação da reserva — hotel
    // é criado sem contato, igual ao comportamento manual pré-Milestone 8.
    enriquecimento = { emailEncontrado: null, paisEncontrado: null };
  }

  const { data: hotel, error: erroHotel } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .insert({
      nome: nomeHotel,
      pais: enriquecimento.paisEncontrado,
      pais_fonte: enriquecimento.paisEncontrado ? "tavily" : null,
      pais_a_confirmar: enriquecimento.paisEncontrado !== null,
      confiabilidade_contato: "sugerido",
    })
    .select("id")
    .single();

  if (erroHotel) throw erroHotel;

  if (enriquecimento.emailEncontrado) {
    const { error: erroEmail } = await supabase
      .schema("reconfirmacao")
      .from("hotel_emails")
      .insert({
        hotel_id: hotel.id,
        email: enriquecimento.emailEncontrado,
        fonte: "tavily",
        confiabilidade: "sugerido",
      });
    if (erroEmail) throw erroEmail;
  }

  return { hotelId: hotel.id, enriquecimento };
}

/**
 * Reenriquece um hotel cujo contato foi marcado `obsoleto` (ex. após bounce
 * — PRD §4.2 item 3): busca de novo via Tavily e adiciona o e-mail
 * encontrado como nova sugestão, sem apagar o histórico de e-mails antigos.
 */
export async function reenriquecerHotelObsoleto(
  supabase: TypedClient,
  hotelId: string,
  nomeHotel: string
): Promise<ResultadoEnriquecimento> {
  let enriquecimento: ResultadoEnriquecimento;
  try {
    const resultado = await buscarContatoHotel(nomeHotel);
    enriquecimento = validarEnriquecimento(resultado);
  } catch {
    // Busca indisponível não deve propagar erro cru (ex. detalhe HTTP da
    // Tavily) para quem chamou — hotel permanece obsoleto, tentativa de
    // reenriquecimento pode ser repetida depois.
    return { emailEncontrado: null, paisEncontrado: null };
  }

  if (enriquecimento.emailEncontrado) {
    const { error } = await supabase
      .schema("reconfirmacao")
      .from("hotel_emails")
      .insert({
        hotel_id: hotelId,
        email: enriquecimento.emailEncontrado,
        fonte: "tavily",
        confiabilidade: "sugerido",
      });
    if (error) throw error;
  }

  return enriquecimento;
}
