import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { atualizarHotel } from "@/features/hotels/queries";
import type { Database } from "@/lib/supabase/types";

type ConfiabilidadeContato = Database["reconfirmacao"]["Enums"]["contact_reliability"];
const CONFIABILIDADES: ConfiabilidadeContato[] = ["confirmado", "sugerido", "obsoleto"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const corpo = await request.json();
  const nome: string | undefined = corpo.nome?.trim() || undefined;
  const pais: string | null | undefined = corpo.pais === undefined ? undefined : corpo.pais?.trim() || null;
  const idioma: string | null | undefined = corpo.idioma === undefined ? undefined : corpo.idioma?.trim() || null;
  const confiabilidadeContato: ConfiabilidadeContato | undefined = corpo.confiabilidadeContato;

  if (confiabilidadeContato !== undefined && !CONFIABILIDADES.includes(confiabilidadeContato)) {
    return NextResponse.json({ ok: false, erro: "Confiabilidade inválida." }, { status: 400 });
  }

  try {
    const hotel = await atualizarHotel(
      supabase,
      id,
      {
        ...(nome !== undefined ? { nome } : {}),
        ...(pais !== undefined ? { pais } : {}),
        ...(idioma !== undefined ? { idioma } : {}),
        ...(confiabilidadeContato !== undefined ? { confiabilidade_contato: confiabilidadeContato } : {}),
      },
      user.id
    );

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "hotel_updated",
      entity_type: "hotel",
      entity_id: id,
      metadata: { nome, pais, idioma, confiabilidade_contato: confiabilidadeContato },
    });

    return NextResponse.json({ ok: true, hotel });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar hotel." }, { status: 500 });
  }
}
