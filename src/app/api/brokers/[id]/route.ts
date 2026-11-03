import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { atualizarBroker } from "@/features/brokers/queries";

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
  const email: string | null | undefined = corpo.email === undefined ? undefined : corpo.email?.trim() || null;
  const pais: string | null | undefined = corpo.pais === undefined ? undefined : corpo.pais?.trim() || null;

  try {
    const broker = await atualizarBroker(
      supabase,
      id,
      {
        ...(email !== undefined ? { email } : {}),
        ...(pais !== undefined ? { pais } : {}),
      },
      user.id
    );

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "broker_updated",
      entity_type: "broker",
      entity_id: id,
      metadata: { email, pais },
    });

    return NextResponse.json({ ok: true, broker });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao atualizar broker." }, { status: 500 });
  }
}
