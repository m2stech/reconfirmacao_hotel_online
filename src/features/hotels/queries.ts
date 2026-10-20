import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { encontrarMelhorMatch, type HotelParaMatch } from "./match";

type TypedClient = SupabaseClient<Database>;

export type HotelComEmails = Database["reconfirmacao"]["Tables"]["hotels"]["Row"] & {
  hotel_emails: Database["reconfirmacao"]["Tables"]["hotel_emails"]["Row"][];
};

export async function listarHoteis(supabase: TypedClient, filtroNome?: string) {
  let query = supabase
    .schema("reconfirmacao")
    .from("hotels")
    .select("*, hotel_emails(*)")
    .order("nome", { ascending: true });

  if (filtroNome) {
    query = query.ilike("nome", `%${filtroNome}%`);
  }

  return query.returns<HotelComEmails[]>();
}

export async function buscarHoteisParaMatch(supabase: TypedClient): Promise<HotelParaMatch[]> {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .select("id, nome, nomes_alternativos");

  if (error) throw error;

  return (data ?? []).map((hotel) => ({
    id: hotel.id,
    nome: hotel.nome,
    nomesAlternativos: hotel.nomes_alternativos ?? [],
  }));
}

/**
 * Resolve o hotel correspondente a cada nome importado do RoomingList contra
 * o banco de contatos (match exato → fuzzy). Usado no preview de importação
 * (Milestone 3) para ligar a reserva ao hotel antes de gravar.
 */
export function resolverHotelPorNome(nomesImportados: string[], hoteis: HotelParaMatch[]) {
  const porNome = new Map<string, { hotelId: string | null; confianca: number }>();
  for (const nome of new Set(nomesImportados)) {
    porNome.set(nome, encontrarMelhorMatch(nome, hoteis));
  }
  return porNome;
}

export async function criarHotel(
  supabase: TypedClient,
  input: {
    nome: string;
    pais?: string | null;
    idioma?: string | null;
    email?: string | null;
  }
) {
  const { data: hotel, error: erroHotel } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .insert({
      nome: input.nome,
      pais: input.pais ?? null,
      pais_fonte: input.pais ? "manual" : null,
      idioma: input.idioma ?? null,
      confiabilidade_contato: "confirmado",
      ultima_confirmacao_em: new Date().toISOString(),
    })
    .select()
    .single();

  if (erroHotel) throw erroHotel;

  if (input.email) {
    const { error: erroEmail } = await supabase.schema("reconfirmacao").from("hotel_emails").insert({
      hotel_id: hotel.id,
      email: input.email,
      fonte: "manual",
      confiabilidade: "confirmado",
    });
    if (erroEmail) throw erroEmail;
  }

  return hotel;
}

export async function atualizarHotel(
  supabase: TypedClient,
  hotelId: string,
  input: {
    nome?: string;
    pais?: string | null;
    idioma?: string | null;
    confiabilidade_contato?: Database["reconfirmacao"]["Enums"]["contact_reliability"];
  },
  userId: string
) {
  const marcandoConfirmado = input.confiabilidade_contato === "confirmado";

  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .update({
      ...input,
      ...(marcandoConfirmado
        ? { ultima_confirmacao_em: new Date().toISOString(), ultima_confirmacao_por: userId }
        : {}),
    })
    .eq("id", hotelId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function adicionarEmailHotel(
  supabase: TypedClient,
  hotelId: string,
  email: string
) {
  const { data, error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .insert({ hotel_id: hotelId, email, fonte: "manual", confiabilidade: "confirmado" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function marcarEmailObsoleto(supabase: TypedClient, emailId: string) {
  const { error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .update({ confiabilidade: "obsoleto", bounced_em: new Date().toISOString() })
    .eq("id", emailId);

  if (error) throw error;
}

/**
 * Mescla `hotelDuplicadoId` em `hotelPrincipalId`: reatribui e-mails e
 * reservas para o principal, acrescenta o nome do duplicado como nome
 * alternativo (preserva o matching fuzzy de futuras importações) e remove o
 * registro duplicado.
 */
export async function mesclarHoteis(
  supabase: TypedClient,
  hotelPrincipalId: string,
  hotelDuplicadoId: string
) {
  if (hotelPrincipalId === hotelDuplicadoId) {
    throw new Error("Não é possível mesclar um hotel com ele mesmo.");
  }

  const { data: duplicado, error: erroDuplicado } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .select("nome, nomes_alternativos")
    .eq("id", hotelDuplicadoId)
    .single();
  if (erroDuplicado) throw erroDuplicado;

  const { data: principal, error: erroPrincipal } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .select("nomes_alternativos")
    .eq("id", hotelPrincipalId)
    .single();
  if (erroPrincipal) throw erroPrincipal;

  const { error: erroReservas } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .update({ hotel_id: hotelPrincipalId })
    .eq("hotel_id", hotelDuplicadoId);
  if (erroReservas) throw erroReservas;

  const { error: erroEmails } = await supabase
    .schema("reconfirmacao")
    .from("hotel_emails")
    .update({ hotel_id: hotelPrincipalId })
    .eq("hotel_id", hotelDuplicadoId);
  if (erroEmails) throw erroEmails;

  const nomesAlternativosMesclados = Array.from(
    new Set([...(principal.nomes_alternativos ?? []), duplicado.nome, ...(duplicado.nomes_alternativos ?? [])])
  );

  const { error: erroAtualizarPrincipal } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .update({ nomes_alternativos: nomesAlternativosMesclados })
    .eq("id", hotelPrincipalId);
  if (erroAtualizarPrincipal) throw erroAtualizarPrincipal;

  const { error: erroExcluir } = await supabase
    .schema("reconfirmacao")
    .from("hotels")
    .delete()
    .eq("id", hotelDuplicadoId);
  if (erroExcluir) throw erroExcluir;
}
