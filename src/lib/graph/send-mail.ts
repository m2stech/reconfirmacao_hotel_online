// Envio real de e-mail via Graph, portado de enviar_email.py `enviar_email`.
// Fluxo: cria rascunho (POST /messages) -> envia (POST /messages/{id}/send)
// -> busca metadados finais (conversationId/internetMessageId) por GET.

import { readFile } from "fs/promises";
import path from "path";
import { graphFetch, caixaAutorizada } from "./client";
import { ASSINATURA_CONTENT_ID } from "./email-template";

const ASSINATURA_PATH = path.join(process.cwd(), "src/lib/graph/assets/assinatura.png");

let assinaturaBase64Cache: string | null = null;

async function carregarAssinaturaInline() {
  if (!assinaturaBase64Cache) {
    const buffer = await readFile(ASSINATURA_PATH);
    assinaturaBase64Cache = buffer.toString("base64");
  }
  return {
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: "assinatura.png",
    contentType: "image/png",
    contentBytes: assinaturaBase64Cache,
    contentId: ASSINATURA_CONTENT_ID,
    isInline: true,
  };
}

export type ResultadoEnvio =
  | {
      sucesso: true;
      graphMessageId: string;
      conversationId: string | null;
      internetMessageId: string | null;
    }
  | { sucesso: false; erro: string };

export async function enviarEmail(params: {
  destinatario: string;
  assunto: string;
  corpoHtmlComAssinatura: string;
}): Promise<ResultadoEnvio> {
  const caixa = caixaAutorizada();
  const assinaturaInline = await carregarAssinaturaInline();

  const payload = {
    subject: params.assunto,
    body: { contentType: "HTML", content: params.corpoHtmlComAssinatura },
    toRecipients: [{ emailAddress: { address: params.destinatario } }],
    attachments: [assinaturaInline],
  };

  const respostaCriacao = await graphFetch(`/users/${caixa}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (respostaCriacao.status !== 201) {
    const corpo = await respostaCriacao.text();
    return { sucesso: false, erro: `Falha ao criar rascunho (HTTP ${respostaCriacao.status}): ${corpo}` };
  }

  const mensagem = (await respostaCriacao.json()) as { id?: string };
  const messageId = mensagem.id;
  if (!messageId) {
    return { sucesso: false, erro: "Resposta de criação do rascunho não contém o campo 'id'." };
  }

  const respostaEnvio = await graphFetch(`/users/${caixa}/messages/${messageId}/send`, {
    method: "POST",
  });

  if (respostaEnvio.status !== 202) {
    const corpo = await respostaEnvio.text();
    return { sucesso: false, erro: `Falha ao enviar e-mail (HTTP ${respostaEnvio.status}): ${corpo}` };
  }

  const metadados = await buscarMetadadosMensagem(caixa, messageId);

  return {
    sucesso: true,
    graphMessageId: metadados?.id ?? messageId,
    conversationId: metadados?.conversationId ?? null,
    internetMessageId: metadados?.internetMessageId ?? null,
  };
}

async function buscarMetadadosMensagem(caixa: string, messageId: string) {
  try {
    const resposta = await graphFetch(
      `/users/${caixa}/messages/${messageId}?$select=id,conversationId,internetMessageId,subject,sentDateTime`
    );
    if (!resposta.ok) return null;
    return (await resposta.json()) as {
      id: string;
      conversationId: string | null;
      internetMessageId: string | null;
    };
  } catch {
    return null;
  }
}
