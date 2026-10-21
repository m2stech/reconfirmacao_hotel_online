// Leitura de mensagens recebidas via Graph — portado de respostas.py
// (`buscar_mensagens`, `mensagem_corresponde`, `mensagem_e_posterior`,
// `extrair_cabecalhos`, `endereco_remetente`). Usado pelo job de leitura
// periódica (Milestone 10) para encontrar respostas novas de um hotel numa
// conversa já registrada em `email_sends`.

import { graphFetch, caixaAutorizada } from "./client";

const CAMPOS_GRAPH =
  "id,conversationId,internetMessageId,subject,from,toRecipients,receivedDateTime,body,bodyPreview,internetMessageHeaders";

export type MensagemGraph = {
  id: string;
  conversationId: string | null;
  internetMessageId: string | null;
  subject: string | null;
  receivedDateTime: string | null;
  bodyContent: string | null;
  bodyPreview: string | null;
  remetente: string;
  cabecalhoAutoSubmitted: string | null;
  cabecalhoPrecedence: string | null;
  cabecalhoInReplyTo: string | null;
  cabecalhoReferences: string | null;
};

type MensagemGraphBruta = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  body?: { content?: string };
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string } };
  internetMessageHeaders?: { name?: string; value?: string }[];
};

function extrairCabecalhos(mensagem: MensagemGraphBruta): Record<string, string> {
  const cabecalhos: Record<string, string> = {};
  for (const cabecalho of mensagem.internetMessageHeaders ?? []) {
    if (cabecalho.name) cabecalhos[cabecalho.name.toLowerCase()] = cabecalho.value ?? "";
  }
  return cabecalhos;
}

function normalizarMensagem(bruta: MensagemGraphBruta): MensagemGraph {
  const cabecalhos = extrairCabecalhos(bruta);
  return {
    id: bruta.id,
    conversationId: bruta.conversationId ?? null,
    internetMessageId: bruta.internetMessageId ?? null,
    subject: bruta.subject ?? null,
    receivedDateTime: bruta.receivedDateTime ?? null,
    bodyContent: bruta.body?.content ?? null,
    bodyPreview: bruta.bodyPreview ?? null,
    remetente: (bruta.from?.emailAddress?.address ?? "").toLowerCase(),
    cabecalhoAutoSubmitted: cabecalhos["auto-submitted"] ?? null,
    cabecalhoPrecedence: cabecalhos["precedence"] ?? null,
    cabecalhoInReplyTo: cabecalhos["in-reply-to"] ?? null,
    cabecalhoReferences: cabecalhos["references"] ?? null,
  };
}

export type EnvioParaBuscaDeResposta = {
  destinatario: string;
  conversationId: string | null;
  internetMessageId: string | null;
  graphMessageId: string | null;
  assunto: string;
  localizador: string;
  dataEnvio: string;
};

/**
 * Uma resposta só é do hotel se o remetente for exatamente o destinatário
 * para quem enviamos — /me/messages também devolve nossas próprias
 * mensagens da conversa (original e respostas manuais).
 */
function mensagemCorresponde(mensagem: MensagemGraph, envio: EnvioParaBuscaDeResposta): boolean {
  const destinatarioHotel = envio.destinatario.toLowerCase();
  if (!mensagem.remetente || !destinatarioHotel || mensagem.remetente !== destinatarioHotel) return false;

  if (envio.conversationId && mensagem.conversationId === envio.conversationId) return true;

  const referencias = `${mensagem.cabecalhoInReplyTo ?? ""} ${mensagem.cabecalhoReferences ?? ""}`;
  if (envio.internetMessageId && (referencias.includes(envio.internetMessageId) || mensagem.cabecalhoInReplyTo === envio.internetMessageId)) {
    return true;
  }

  const assuntoMensagem = (mensagem.subject ?? "").toLowerCase();
  const assuntoEnvio = envio.assunto.toLowerCase();
  const localizador = envio.localizador.toLowerCase();
  return assuntoMensagem.includes(localizador) || assuntoMensagem.includes(assuntoEnvio);
}

function mensagemEPosterior(mensagem: MensagemGraph, envio: EnvioParaBuscaDeResposta): boolean {
  const recebido = mensagem.receivedDateTime ? Date.parse(mensagem.receivedDateTime) : NaN;
  const enviado = Date.parse(envio.dataEnvio);
  if (Number.isNaN(recebido) || Number.isNaN(enviado)) return true;
  return recebido >= enviado;
}

/**
 * Busca mensagens novas de um hotel numa conversa já registrada, filtrando
 * fora as nossas próprias mensagens, mensagens anteriores ao envio e
 * mensagens já conhecidas (`internetIdsJaConhecidos` — dedupe real contra
 * `hotel_replies`, sem repetir chamada de IA em mensagem já processada para
 * outro envio da mesma conversa longa).
 */
export async function buscarMensagensDaConversa(
  envio: EnvioParaBuscaDeResposta,
  internetIdsJaConhecidos: Set<string>
): Promise<MensagemGraph[]> {
  const caixa = caixaAutorizada();
  const params = new URLSearchParams({ $select: CAMPOS_GRAPH, $top: "50" });

  if (envio.conversationId) {
    params.set("$filter", `conversationId eq '${envio.conversationId.replace(/'/g, "''")}'`);
  } else {
    const dataEnvio = new Date(envio.dataEnvio);
    if (!Number.isNaN(dataEnvio.getTime())) {
      params.set("$filter", `receivedDateTime ge ${dataEnvio.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
    }
  }

  const resposta = await graphFetch(`/users/${caixa}/messages?${params.toString()}`);
  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(`Falha ao buscar mensagens (HTTP ${resposta.status}): ${corpo}`);
  }

  const dados = (await resposta.json()) as { value?: MensagemGraphBruta[] };
  const mensagens = (dados.value ?? []).map(normalizarMensagem);

  return mensagens
    .filter((mensagem) => mensagemCorresponde(mensagem, envio))
    .filter((mensagem) => mensagemEPosterior(mensagem, envio))
    .filter((mensagem) => mensagem.id !== envio.graphMessageId)
    .filter((mensagem) => mensagem.internetMessageId !== envio.internetMessageId)
    .filter((mensagem) => !(mensagem.internetMessageId && internetIdsJaConhecidos.has(mensagem.internetMessageId)))
    .sort((a, b) => (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""));
}
