// Resposta ao hotel preservando thread — portado de enviar_email.py
// `responder_hotel`/`localizar_graph_message_id`.
// Fluxo: createReply (rascunho já citando a mensagem original) -> patch
// (injeta o texto do consultor antes da citação + ajusta destinatário/
// assunto) -> send.

import { graphFetch, caixaAutorizada } from "./client";

export type ResultadoReply =
  | {
      sucesso: true;
      graphMessageId: string;
      conversationId: string | null;
      internetMessageId: string | null;
      corpoHtml: string;
    }
  | { sucesso: false; erro: string };

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function localizarGraphMessageId(internetMessageId: string): Promise<string | null> {
  const caixa = caixaAutorizada();
  const internetIdEscapado = internetMessageId.replace(/'/g, "''");
  const resposta = await graphFetch(
    `/users/${caixa}/messages?$filter=internetMessageId eq '${internetIdEscapado}'&$select=id,internetMessageId&$top=1`
  );
  if (!resposta.ok) return null;
  const dados = (await resposta.json()) as { value?: { id: string }[] };
  return dados.value?.[0]?.id ?? null;
}

export async function responderHotel(params: {
  graphMessageIdOriginal: string | null;
  internetMessageIdOriginal: string | null;
  destinatario: string;
  novoAssunto: string;
  textoUsuario: string;
}): Promise<ResultadoReply> {
  const caixa = caixaAutorizada();

  let graphMessageId = params.graphMessageIdOriginal;
  if (!graphMessageId && params.internetMessageIdOriginal) {
    graphMessageId = await localizarGraphMessageId(params.internetMessageIdOriginal);
  }
  if (!graphMessageId) {
    return { sucesso: false, erro: "Mensagem original não encontrada para responder (sem graphMessageId/internetMessageId válidos)." };
  }

  let respostaCriacao = await graphFetch(`/users/${caixa}/messages/${graphMessageId}/createReply`, {
    method: "POST",
    body: JSON.stringify({}),
  });

  if (respostaCriacao.status === 404 && params.internetMessageIdOriginal) {
    const idAtualizado = await localizarGraphMessageId(params.internetMessageIdOriginal);
    if (idAtualizado && idAtualizado !== graphMessageId) {
      graphMessageId = idAtualizado;
      respostaCriacao = await graphFetch(`/users/${caixa}/messages/${graphMessageId}/createReply`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    }
  }

  if (respostaCriacao.status !== 201) {
    const corpo = await respostaCriacao.text();
    return { sucesso: false, erro: `Falha ao criar rascunho de resposta (HTTP ${respostaCriacao.status}): ${corpo}` };
  }

  const rascunho = (await respostaCriacao.json()) as {
    id?: string;
    body?: { content?: string };
    conversationId?: string;
    internetMessageId?: string;
  };

  const rascunhoId = rascunho.id;
  if (!rascunhoId) {
    return { sucesso: false, erro: "O rascunho de resposta não contém o campo 'id'." };
  }

  const corpoCitado = rascunho.body?.content ?? "";
  const textoUsuarioHtml = `<p>${escapeHtml(params.textoUsuario).replace(/\n/g, "<br>")}</p>`;
  const correspondenciaBody = /<body[^>]*>/i.exec(corpoCitado);
  const corpoFinal = correspondenciaBody
    ? corpoCitado.slice(0, correspondenciaBody.index + correspondenciaBody[0].length) +
      textoUsuarioHtml +
      corpoCitado.slice(correspondenciaBody.index + correspondenciaBody[0].length)
    : textoUsuarioHtml + corpoCitado;

  const respostaPatch = await graphFetch(`/users/${caixa}/messages/${rascunhoId}`, {
    method: "PATCH",
    body: JSON.stringify({
      subject: params.novoAssunto,
      toRecipients: [{ emailAddress: { address: params.destinatario } }],
      body: { contentType: "HTML", content: corpoFinal },
    }),
  });

  if (respostaPatch.status !== 200 && respostaPatch.status !== 201) {
    const corpo = await respostaPatch.text();
    return { sucesso: false, erro: `Falha ao atualizar rascunho de resposta (HTTP ${respostaPatch.status}): ${corpo}` };
  }

  const respostaEnvio = await graphFetch(`/users/${caixa}/messages/${rascunhoId}/send`, {
    method: "POST",
  });

  if (respostaEnvio.status !== 202) {
    const corpo = await respostaEnvio.text();
    return { sucesso: false, erro: `Falha ao enviar resposta (HTTP ${respostaEnvio.status}): ${corpo}` };
  }

  return {
    sucesso: true,
    graphMessageId: rascunhoId,
    conversationId: rascunho.conversationId ?? null,
    internetMessageId: rascunho.internetMessageId ?? null,
    corpoHtml: corpoFinal,
  };
}
