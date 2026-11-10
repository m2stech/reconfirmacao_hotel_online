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
 * Uma resposta só é do hotel se não vier da nossa própria caixa — /me/messages
 * também devolve nossas próprias mensagens da conversa (original e respostas
 * manuais do consultor). Não exigimos que o remetente seja exatamente o
 * destinatário do envio: casos reais (C5X24S/Hilton, 9D15X7/Sofitel,
 * 2026-11-04) mostram hotéis respondendo de um atendente específico
 * (ex. Ryan.Wilkinson@Hilton.com) em vez do endereço genérico para o qual
 * mandamos (ex. MCOBU_RES@hilton.com), com conversationId/in-reply-to
 * corretos — exigir igualdade estrita descartava essas respostas antes de
 * avaliar conversationId/in-reply-to.
 */
function mensagemCorresponde(mensagem: MensagemGraph, envio: EnvioParaBuscaDeResposta): boolean {
  const nossaCaixa = caixaAutorizada().toLowerCase();
  if (!mensagem.remetente || mensagem.remetente === nossaCaixa) return false;

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

// Teto de segurança para a paginação abaixo: evita loop extenso/custo
// descontrolado se a caixa autorizada acumular um volume anormal de
// mensagens na janela de tempo de uma única reserva (ex. bug em outro
// lugar inundando a caixa). 1000 mensagens já é uma folga generosa frente
// ao volume real observado (dezenas a poucas centenas por dia).
const LIMITE_PAGINAS_BUSCA_MENSAGENS = 20;

/**
 * Busca todas as páginas de `/messages` a partir da URL inicial, seguindo
 * `@odata.nextLink` até esgotar ou atingir o teto de segurança.
 *
 * Corrige bug real descoberto em produção (2026-11-10, reservas 4PPZGW e
 * B6CZXS): a busca parava sempre no primeiro `$top=50` sem paginar. Com o
 * volume de reservas processadas por dia, a resposta real de um hotel podia
 * cair facilmente fora da primeira página — nesse caso `mensagemCorresponde`
 * nunca chegava a avaliar a mensagem (ela nem saía do Graph), não importa se
 * conversationId/in-reply-to/assunto bateriam. Confirmado nos dois casos:
 * ambas as respostas reais existiam na caixa, com correlação válida, mas
 * ficaram em páginas seguintes que nunca eram buscadas.
 */
async function buscarTodasAsPaginas(urlInicial: string): Promise<MensagemGraphBruta[]> {
  const mensagens: MensagemGraphBruta[] = [];
  let proximaUrl: string | null = urlInicial;
  let paginas = 0;

  while (proximaUrl && paginas < LIMITE_PAGINAS_BUSCA_MENSAGENS) {
    const resposta: Response = await graphFetch(proximaUrl);
    if (!resposta.ok) {
      const corpo = await resposta.text();
      throw new Error(`Falha ao buscar mensagens (HTTP ${resposta.status}): ${corpo}`);
    }

    const dados = (await resposta.json()) as { value?: MensagemGraphBruta[]; "@odata.nextLink"?: string };
    mensagens.push(...(dados.value ?? []));
    proximaUrl = dados["@odata.nextLink"] ?? null;
    paginas += 1;
  }

  return mensagens;
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

  // Filtro sempre por janela de tempo, nunca por conversationId: alguns
  // hotéis respondem de um sistema (helpdesk/Salesforce etc.) que não
  // preserva o conversationId do Exchange, só o header RFC In-Reply-To —
  // caso real da reserva XYBZ9J (2026-11-04), resposta da Universal Orlando
  // via sfdc.net chegou com conversationId novo mas In-Reply-To correto.
  // Um $filter por conversationId na própria query ao Graph descartaria
  // essa mensagem antes dela chegar a mensagemCorresponde(), que é quem
  // sabe avaliar o fallback por in-reply-to/references/assunto.
  const dataEnvio = new Date(envio.dataEnvio);
  if (!Number.isNaN(dataEnvio.getTime())) {
    params.set("$filter", `receivedDateTime ge ${dataEnvio.toISOString().replace(/\.\d{3}Z$/, "Z")}`);
  }

  const mensagensBrutas = await buscarTodasAsPaginas(`/users/${caixa}/messages?${params.toString()}`);
  const mensagens = mensagensBrutas.map(normalizarMensagem);

  return mensagens
    .filter((mensagem) => mensagemCorresponde(mensagem, envio))
    .filter((mensagem) => mensagemEPosterior(mensagem, envio))
    .filter((mensagem) => mensagem.id !== envio.graphMessageId)
    .filter((mensagem) => mensagem.internetMessageId !== envio.internetMessageId)
    .filter((mensagem) => !(mensagem.internetMessageId && internetIdsJaConhecidos.has(mensagem.internetMessageId)))
    .sort((a, b) => (a.receivedDateTime ?? "").localeCompare(b.receivedDateTime ?? ""));
}
