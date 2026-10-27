import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { traduzirTextoIA } from "@/lib/openai/client";

/**
 * Tradução sob demanda do corpo_texto de uma resposta de hotel para o
 * consultor conferir o e-mail original sem depender só do resumo da IA.
 * `:id` é hotel_replies.id. Não registra audit_log — ação de leitura, sem
 * efeito sobre o estado da reserva.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const { data: resposta, error } = await supabase
    .schema("reconfirmacao")
    .from("hotel_replies")
    .select("corpo_texto")
    .eq("id", id)
    .single();

  if (error || !resposta) {
    return NextResponse.json({ ok: false, erro: "Resposta não encontrada." }, { status: 404 });
  }

  try {
    const { textoTraduzido } = await traduzirTextoIA(resposta.corpo_texto);
    return NextResponse.json({ ok: true, textoTraduzido });
  } catch (erro) {
    return NextResponse.json(
      { ok: false, erro: erro instanceof Error ? erro.message : "Falha ao traduzir." },
      { status: 502 }
    );
  }
}
