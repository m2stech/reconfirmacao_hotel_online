import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { criarHotel, listarHoteis } from "@/features/hotels/queries";

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const filtroNome = request.nextUrl.searchParams.get("nome") ?? undefined;
  const { data, error } = await listarHoteis(supabase, filtroNome || undefined);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao carregar hotéis." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hoteis: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const corpo = await request.json();
  const nome: string | undefined = corpo.nome?.trim();
  const pais: string | null = corpo.pais?.trim() || null;
  const idioma: string | null = corpo.idioma?.trim() || null;
  const email: string | null = corpo.email?.trim() || null;

  if (!nome) {
    return NextResponse.json({ ok: false, erro: "Nome do hotel é obrigatório." }, { status: 400 });
  }

  try {
    const hotel = await criarHotel(supabase, { nome, pais, idioma, email });

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "hotel_created",
      entity_type: "hotel",
      entity_id: hotel.id,
      metadata: { nome, pais, idioma, email },
    });

    return NextResponse.json({ ok: true, hotel });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao criar hotel." }, { status: 500 });
  }
}
