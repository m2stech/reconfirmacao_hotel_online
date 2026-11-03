import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarBrokers } from "@/features/brokers/queries";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const filtroNome = request.nextUrl.searchParams.get("nome") ?? undefined;
  const { data, error } = await listarBrokers(supabase, filtroNome || undefined);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao carregar brokers." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, brokers: data ?? [] });
}
