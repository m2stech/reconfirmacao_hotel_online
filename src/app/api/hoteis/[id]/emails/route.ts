import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { adicionarEmailHotel } from "@/features/hotels/queries";

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
  const email: string | undefined = corpo.email?.trim();

  if (!email) {
    return NextResponse.json({ ok: false, erro: "E-mail é obrigatório." }, { status: 400 });
  }

  try {
    const hotelEmail = await adicionarEmailHotel(supabase, id, email);

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "hotel_email_added",
      entity_type: "hotel",
      entity_id: id,
      metadata: { email },
    });

    return NextResponse.json({ ok: true, email: hotelEmail });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao adicionar e-mail." }, { status: 500 });
  }
}
