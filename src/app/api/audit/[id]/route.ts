import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { STATUS_AUDITORIA, validarStatusManual, type StatusAuditoria } from "@/features/audit/status";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, erro: "Não autenticado." }, { status: 401 });
  }

  const { data: reserva, error: erroReserva } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("*, hotels(nome, pais, idioma)")
    .eq("id", id)
    .single();

  if (erroReserva || !reserva) {
    return NextResponse.json({ ok: false, erro: "Reserva não encontrada." }, { status: 404 });
  }

  const { data: envios } = await supabase
    .schema("reconfirmacao")
    .from("email_sends")
    .select("*, hotel_replies(*)")
    .eq("reservation_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, reserva, envios: envios ?? [] });
}

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
  const statusManual: StatusAuditoria | null = corpo.statusManual ?? null;
  const regimeAlimentarConfirmadoManual: boolean | null = corpo.regimeAlimentarConfirmadoManual ?? null;
  const pagamentoManual: string | null = corpo.pagamentoManual ?? null;
  const tipoPendenciaManual: string | null = corpo.tipoPendenciaManual ?? null;

  if (statusManual !== null && !STATUS_AUDITORIA.includes(statusManual)) {
    return NextResponse.json({ ok: false, erro: "Status inválido." }, { status: 400 });
  }

  const erroValidacao = validarStatusManual(statusManual, regimeAlimentarConfirmadoManual);
  if (erroValidacao) {
    return NextResponse.json({ ok: false, erro: erroValidacao }, { status: 422 });
  }

  const { data: reservaAnterior } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .select("localizador")
    .eq("id", id)
    .single();

  if (!reservaAnterior) {
    return NextResponse.json({ ok: false, erro: "Reserva não encontrada." }, { status: 404 });
  }

  const { error } = await supabase
    .schema("reconfirmacao")
    .from("reservations")
    .update({
      status_manual: statusManual,
      regime_alimentar_confirmado_manual: regimeAlimentarConfirmadoManual,
      pagamento_manual: pagamentoManual,
      tipo_pendencia_manual: tipoPendenciaManual,
      auditoria_atualizada_em: new Date().toISOString(),
      auditoria_atualizada_por: user.id,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ ok: false, erro: "Falha ao salvar auditoria." }, { status: 500 });
  }

  // audit_log não tem policy de INSERT para o client (CLAUDE.md "Banco de
  // dados"): todo insert é feito com a service role no backend.
  const supabaseServiceRole = createServiceRoleClient();
  await supabaseServiceRole.from("audit_log").insert({
    actor_id: user.id,
    action: "audit_status_updated",
    entity_type: "reservation",
    entity_id: id,
    metadata: {
      localizador: reservaAnterior.localizador,
      status_manual: statusManual,
      regime_alimentar_confirmado_manual: regimeAlimentarConfirmadoManual,
      pagamento_manual: pagamentoManual,
      tipo_pendencia_manual: tipoPendenciaManual,
    },
  });

  return NextResponse.json({ ok: true });
}
