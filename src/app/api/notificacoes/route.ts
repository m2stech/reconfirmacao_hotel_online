import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contarNaoLidas, listarRecentes } from "@/features/notifications/queries";

const LIMITE_RECENTES = 20;

/** Indicador in-app do Milestone 11 — RLS libera leitura a qualquer usuário autenticado ativo (PRD §3). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const [naoLidas, recentes] = await Promise.all([contarNaoLidas(supabase), listarRecentes(supabase, LIMITE_RECENTES)]);

  return NextResponse.json({ ok: true, naoLidas, notificacoes: recentes });
}
