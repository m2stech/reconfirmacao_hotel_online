// Filtro de mensagens automáticas (out-of-office, bounce) — portado de
// respostas.py (`e_mensagem_automatica`). Roda antes do fallback regex e
// antes de gastar qualquer chamada de IA (PRD §12.5).

export type MensagemGraphParaFiltro = {
  assunto: string | null;
  remetente: string | null;
  cabecalhoAutoSubmitted: string | null;
  cabecalhoPrecedence: string | null;
};

const PALAVRAS_ASSUNTO_AUTOMATICO = [
  "out of office",
  "automatic reply",
  "resposta automática",
  "resposta automatica",
  "não monitorada",
  "nao monitorada",
  "undeliverable",
  "delivery failure",
  "failure notice",
  "mail delivery",
  "acknowledgement of receipt",
  "aviso de recebimento",
];

const PREFIXOS_REMETENTE_AUTOMATICO = ["no-reply", "noreply", "postmaster", "mailer-daemon"];

export function ehMensagemAutomatica(mensagem: MensagemGraphParaFiltro): boolean {
  const assunto = (mensagem.assunto ?? "").toLowerCase();
  const remetente = (mensagem.remetente ?? "").toLowerCase();
  const autoSubmitted = (mensagem.cabecalhoAutoSubmitted ?? "").toLowerCase();
  const precedence = (mensagem.cabecalhoPrecedence ?? "").toLowerCase();

  const remetenteAutomatico = PREFIXOS_REMETENTE_AUTOMATICO.some((termo) => remetente.includes(termo));
  const assuntoAutomatico = PALAVRAS_ASSUNTO_AUTOMATICO.some((palavra) => assunto.includes(palavra));

  return (
    assuntoAutomatico ||
    remetenteAutomatico ||
    (autoSubmitted !== "" && autoSubmitted !== "no") ||
    ["bulk", "auto_reply", "list"].includes(precedence)
  );
}
