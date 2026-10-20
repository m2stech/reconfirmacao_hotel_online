import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { mesclarHoteis } from "@/features/hotels/queries";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const corpo = await request.json();
  const hotelPrincipalId: string | undefined = corpo.hotelPrincipalId;

  if (!hotelPrincipalId) {
    return NextResponse.json({ ok: false, erro: "Hotel principal é obrigatório." }, { status: 400 });
  }

  try {
    await mesclarHoteis(supabase, hotelPrincipalId, id);

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "hotels_merged",
      entity_type: "hotel",
      entity_id: hotelPrincipalId,
      metadata: { hotel_principal_id: hotelPrincipalId, hotel_duplicado_id: id },
    });

    return NextResponse.json({ ok: true });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Falha ao mesclar hotéis.";
    return NextResponse.json({ ok: false, erro: mensagem }, { status: 500 });
  }
}
