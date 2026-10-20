import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { marcarEmailObsoleto } from "@/features/hotels/queries";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => ({}));
  const acao: string = corpo.acao ?? "marcar_obsoleto";

  if (acao !== "marcar_obsoleto") {
    return NextResponse.json({ ok: false, erro: "Ação inválida." }, { status: 400 });
  }

  try {
    await marcarEmailObsoleto(supabase, emailId);

    const supabaseServiceRole = createServiceRoleClient();
    await supabaseServiceRole.from("audit_log").insert({
      actor_id: user.id,
      action: "hotel_email_marked_obsolete",
      entity_type: "hotel",
      entity_id: id,
      metadata: { email_id: emailId },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, erro: "Falha ao marcar e-mail como obsoleto." }, { status: 500 });
  }
}
