import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { marcarComoLida } from "@/features/notifications/queries";

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  await marcarComoLida(supabase, id);
  return NextResponse.json({ ok: true });
}
