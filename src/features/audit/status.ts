// Status de auditoria (PRD §4.1 item 5). A view `reconfirmacao.audit_status`
// calcula um subconjunto automaticamente a partir de email_sends/hotel_replies
// reais (que só existem de verdade a partir dos Milestones 7/9); até lá, ou
// quando o consultor precisa corrigir o cálculo automático, o override manual
// em `reservations.status_manual` tem prioridade (ver migration do Milestone 4).

export const STATUS_AUDITORIA = [
  "CONFIRMADA",
  "AGUARDANDO_RESPOSTA",
  "REVISAR",
  "REVISAR_DIVERGENCIA",
  "RESPONDIDO_AO_HOTEL",
  "ERRO_NO_ENVIO",
  "NAO_CONFIRMADA",
  "NAO_ENVIADO",
  "EMAIL_NAO_ENCONTRADO",
] as const;

export type StatusAuditoria = (typeof STATUS_AUDITORIA)[number];

export const STATUS_LABEL: Record<StatusAuditoria, string> = {
  CONFIRMADA: "Confirmada",
  AGUARDANDO_RESPOSTA: "Aguardando resposta",
  REVISAR: "Revisar",
  REVISAR_DIVERGENCIA: "Revisar divergência",
  RESPONDIDO_AO_HOTEL: "Respondido ao hotel",
  ERRO_NO_ENVIO: "Erro no envio",
  NAO_CONFIRMADA: "Não confirmada",
  NAO_ENVIADO: "Não enviado",
  EMAIL_NAO_ENCONTRADO: "E-mail não encontrado",
};

export const STATUS_BADGE_VARIANT: Record<
  StatusAuditoria,
  "default" | "secondary" | "destructive" | "outline"
> = {
  CONFIRMADA: "default",
  AGUARDANDO_RESPOSTA: "secondary",
  REVISAR: "outline",
  REVISAR_DIVERGENCIA: "outline",
  RESPONDIDO_AO_HOTEL: "secondary",
  ERRO_NO_ENVIO: "destructive",
  NAO_CONFIRMADA: "destructive",
  NAO_ENVIADO: "outline",
  EMAIL_NAO_ENCONTRADO: "destructive",
};

// Subconjunto dos status que o consultor pode definir manualmente — exclui
// NAO_ENVIADO e EMAIL_NAO_ENCONTRADO, que só fazem sentido como ausência de
// override (cálculo automático a partir do que existe ou não em hotel_emails
// e email_sends).
export const STATUS_MANUAL_OPCOES = STATUS_AUDITORIA.filter(
  (status) => status !== "NAO_ENVIADO" && status !== "EMAIL_NAO_ENCONTRADO"
) as Exclude<StatusAuditoria, "NAO_ENVIADO" | "EMAIL_NAO_ENCONTRADO">[];

// PRD §4.1 item 6: não pode marcar CONFIRMADA sem regime alimentar confirmado.
export function validarStatusManual(
  status: StatusAuditoria | null,
  regimeAlimentarConfirmado: boolean | null
): string | null {
  if (status === "CONFIRMADA" && regimeAlimentarConfirmado !== true) {
    return "Não é possível marcar como Confirmada sem o regime alimentar confirmado.";
  }
  return null;
}

export const METRICA_CARDS: { status: StatusAuditoria | "TOTAL"; label: string }[] = [
  { status: "TOTAL", label: "Total" },
  { status: "CONFIRMADA", label: "Confirmadas" },
  { status: "AGUARDANDO_RESPOSTA", label: "Aguardando resposta" },
  { status: "REVISAR", label: "Revisar" },
  { status: "RESPONDIDO_AO_HOTEL", label: "Respondido ao hotel" },
  { status: "ERRO_NO_ENVIO", label: "Erro no envio" },
  { status: "EMAIL_NAO_ENCONTRADO", label: "E-mail não encontrado" },
];
