import "server-only";

// Interpretação de resposta de hotel via OpenAI — portado de
// `interpretar_resposta`/`validar_interpretacao` em respostas.py quase 1:1
// (CLAUDE.md: não reescrever prompt/schema nesta etapa).

import { SCHEMA_INTERPRETACAO, type InterpretacaoResposta } from "./schema";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5-nano";

export const OPENAI_INPUT_USD_POR_MILHAO = 0.05;
export const OPENAI_OUTPUT_USD_POR_MILHAO = 0.4;

export type ConsumoOpenAI = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  custoUsd: number;
};

export const CONSUMO_VAZIO: ConsumoOpenAI = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  custoUsd: 0,
};

export function calcularCustoOpenAI(inputTokens: number, outputTokens: number): ConsumoOpenAI {
  const custoInputUsd = (inputTokens / 1_000_000) * OPENAI_INPUT_USD_POR_MILHAO;
  const custoOutputUsd = (outputTokens / 1_000_000) * OPENAI_OUTPUT_USD_POR_MILHAO;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    custoUsd: custoInputUsd + custoOutputUsd,
  };
}

// Instruções portadas quase 1:1 de respostas.py (`interpretar_resposta`) —
// mesma prioridade de análise e as mesmas regras de negócio já calibradas em
// produção. Mudanças de prompt ficam para depois, com suíte de regressão.
const INSTRUCOES = `Analise exclusivamente os dados fornecidos. Não invente informações. A prioridade é: 1) verificar se a resposta corresponde à reserva consultada; 2) identificar divergências; 3) determinar confirmação; 4) EXTRAIR números de confirmação; 5) identificar pagamento; 6) identificar pendências; 7) resumir tudo em português brasileiro. O novo modelo de e-mail pode solicitar em texto corrido o HCN (número de confirmação interno do hotel) e perguntar se o pagamento já foi processado ou se existe alguma pendência. Leia também os campos Localizador Broker e Referência Snow Operadora quando aparecerem na resposta; eles são identificadores de apoio e não substituem o número de confirmação do hotel. REGRA ABSOLUTA: a reserva só pode ser considerada CONFIRMADA nos relatórios se NÃO existir nenhuma pendência na resposta. Pagamento pendente, divergência, informação solicitada pelo hotel ou qualquer ação ainda necessária deve resultar em revisão, mesmo que o hotel diga que a reserva está confirmada. O regime alimentar de todos os passageiros também é obrigatório: preencha regime_alimentar_confirmado como SIM somente se a resposta confirmar claramente o regime informado em DADOS DA RESERVA; use NAO se houver divergência e INDEFINIDO se o hotel não mencionar ou não confirmar o regime. Sem SIM, a reserva deve ficar em revisão. Não basta identificar que o texto fala de uma reserva confirmada. Você deve determinar se as informações presentes na resposta são compatíveis com a reserva apresentada em DADOS DA RESERVA. Nunca ignore nomes de hóspedes ou datas conflitantes. Uma afirmação de confirmação referente claramente a outros hóspedes não confirma a reserva consultada. Use correspondencia_reserva = CONFIRMADA quando a resposta trouxer elementos suficientes compatíveis com a reserva, como localizador, hóspedes, datas, hotel ou mais de um elemento coincidente sem contradições. Use PROVAVEL quando a resposta estiver claramente dentro da conversa correta e confirmar 'a reserva', 'your booking' ou equivalente, sem dados suficientes e sem contradições. Use DIVERGENTE quando houver contradição material: hóspedes diferentes, datas diferentes, hotel diferente, ou resposta referente a outra reserva. O localizador em DADOS DA RESERVA é apenas um identificador interno nosso; o número de confirmação informado pelo hotel normalmente será diferente e isso NÃO é divergência. Se hóspedes ou datas divergirem, detalhe em divergencias. Use NAO_VERIFICAVEL quando a mensagem não tiver elementos nem contexto semântico suficiente. Retorne reserva_confirmada = SIM quando houver evidência clara de que a reserva existe e está ativa: frases como reserva confirmada, booking confirmed, reservation registered in our system, reserva activa, ou evidências fortes como número interno, hospedagem paga, taxa turística, instruções de chegada ou solicitação de horário. Use reserva_confirmada = NAO somente para reserva inexistente, não localizada, cancelada, recusada ou não ativa. Use INDEFINIDO somente quando realmente não for possível concluir; não use INDEFINIDO apenas por falta de número, pagamento não informado ou resposta curta. Pagamento pendente deve ser registrado como pendência e impedir a confirmação final nos relatórios. Fornecedor diferente deve ser registrado como observação/divergência, mas não invalida sozinho uma confirmação. Não confunda o localizador com o número de confirmação do hotel. CRÍTICO - EXTRAÇÃO DE NÚMEROS: Procure ativamente por números de confirmação no texto. Frases como 'número de confirmação é X', 'confirmation number X', 'reservation number is X', 'número de reserva X', 'localizador interno X', 'booking reference X' indicam número de confirmação. SEMPRE preencha numero_confirmacao_hotel quando houver um número identificado, mesmo que seja o único número mencionado. Se houver MÚLTIPLOS números para diferentes hóspedes: 1) Preencha confirmacoes_multiplas com TODOS os números encontrados (array de {hospede, numero_confirmacao}); 2) Compare hóspedes da resposta com DADOS DA RESERVA; 3) Se conseguir mapear o hóspede consultado a um número específico, coloque em numero_confirmacao_hotel; 4) Se não conseguir mapear mas houver só 1 número, coloque esse número em numero_confirmacao_hotel; 5) Se houver múltiplos números e nenhum mapeável ao hóspede consultado, use 'MULTIPLAS_CONFIRMACOES' em numero_confirmacao_hotel. Números podem aparecer em formatos variados: numéricos puros, alfanuméricos, com espaços, com prefixos. Classifique mensagens automáticas com baixa confiança e não assuma confirmação. O resumo_resposta deve ser operacional, objetivo, em português brasileiro e não ocultar divergências importantes. Retorne somente o JSON conforme o schema.`;

export type DadosReservaParaIA = {
  hotel: string;
  localizador: string;
  hospedes: string;
  dataCheckin: string;
  dataCheckout: string;
  regimeAlimentar: string;
  fornecedor: string;
  mensagemUsuario?: string;
};

export function montarDadosIA(reserva: DadosReservaParaIA, corpo: string): string {
  const contextoNegociacao = reserva.mensagemUsuario
    ? `\n\nNOSSA ÚLTIMA MENSAGEM ENVIADA AO HOTEL (considere que esta resposta do hotel pode estar respondendo a estes pontos, e não apenas à mensagem original)\n${reserva.mensagemUsuario}`
    : "";
  return `DADOS DA RESERVA
Hotel: ${reserva.hotel}
Localizador: ${reserva.localizador}
Hóspedes: ${reserva.hospedes}
Entrada: ${reserva.dataCheckin}
Saída: ${reserva.dataCheckout}
Regime alimentar de todos os passageiros: ${reserva.regimeAlimentar}
Provedor: ${reserva.fornecedor}${contextoNegociacao}

RESPOSTA RECEBIDA DO HOTEL
${corpo}`;
}

export type ResultadoInterpretacaoIA = {
  analise: InterpretacaoResposta;
  consumo: ConsumoOpenAI;
};

function validarInterpretacao(dados: unknown): InterpretacaoResposta {
  if (typeof dados !== "object" || dados === null) {
    throw new Error("Resposta da OpenAI não é um objeto JSON válido.");
  }
  const registro = dados as Record<string, unknown>;
  for (const campo of SCHEMA_INTERPRETACAO.required) {
    if (!(campo in registro)) {
      throw new Error("Resposta da OpenAI sem todos os campos obrigatórios.");
    }
  }
  if (!["SIM", "NAO", "INDEFINIDO"].includes(registro.reserva_confirmada as string)) {
    throw new Error("reserva_confirmada inválida.");
  }
  if (!["SIM", "NAO", "INDEFINIDO"].includes(registro.regime_alimentar_confirmado as string)) {
    throw new Error("regime_alimentar_confirmado inválido.");
  }
  if (
    !["PAGO", "PENDENTE", "PAGAMENTO_NO_CHECKIN", "NAO_INFORMADO", "OUTRO"].includes(
      registro.status_pagamento as string
    )
  ) {
    throw new Error("status_pagamento inválido.");
  }
  if (
    !["CONFIRMADA", "PROVAVEL", "DIVERGENTE", "NAO_VERIFICAVEL"].includes(
      registro.correspondencia_reserva as string
    )
  ) {
    throw new Error("correspondencia_reserva inválida.");
  }
  if (
    !["NENHUMA", "OPERACIONAL", "PAGAMENTO", "DIVERGENCIA", "INFORMACAO_INCOMPLETA", "OUTRA"].includes(
      registro.tipo_pendencia as string
    )
  ) {
    throw new Error("tipo_pendencia inválido.");
  }
  for (const campo of ["divergencias", "evidencias_confirmacao"]) {
    const valor = registro[campo];
    if (!Array.isArray(valor) || !valor.every((item) => typeof item === "string")) {
      throw new Error(`${campo} inválido.`);
    }
  }
  if (!Array.isArray(registro.confirmacoes_multiplas)) {
    throw new Error("confirmacoes_multiplas inválido.");
  }
  const confianca = Number(registro.confianca);
  if (Number.isNaN(confianca) || confianca < 0 || confianca > 1) {
    throw new Error("confianca fora do intervalo permitido.");
  }

  return { ...registro, confianca } as InterpretacaoResposta;
}

/**
 * Chama a OpenAI (`gpt-5-nano`, JSON Schema estrito) para interpretar uma
 * resposta de hotel. Nunca chamar em teste de unidade — mockar a resposta
 * (PRD §7.2). Pós-processamento (fallback de número, correção de divergência,
 * mapeamento de confirmação múltipla) fica em `interpret.ts`.
 */
export async function interpretarRespostaIA(
  reserva: DadosReservaParaIA,
  corpo: string
): Promise<ResultadoInterpretacaoIA> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const resposta = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: INSTRUCOES },
        { role: "user", content: montarDadosIA(reserva, corpo) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "analise_resposta_hotel",
          strict: true,
          schema: SCHEMA_INTERPRETACAO,
        },
      },
    }),
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.text();
    throw new Error(`Falha ao consultar OpenAI (HTTP ${resposta.status}): ${corpoErro}`);
  }

  const dados = (await resposta.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const conteudo = dados.choices?.[0]?.message?.content;
  if (!conteudo) {
    throw new Error("Resposta da OpenAI sem conteúdo.");
  }

  const analise = validarInterpretacao(JSON.parse(conteudo));
  const consumo = calcularCustoOpenAI(dados.usage?.prompt_tokens ?? 0, dados.usage?.completion_tokens ?? 0);

  return { analise, consumo };
}

export type ResultadoTraducaoIA = {
  textoTraduzido: string;
  consumo: ConsumoOpenAI;
};

/**
 * Tradução sob demanda do corpo integral de uma resposta de hotel, para o
 * consultor conferir o e-mail original sem depender só do resumo da IA. Só
 * chamada quando o usuário clica no botão "Traduzir" (nunca em todo envio) —
 * mesmo client/modelo de interpretarRespostaIA, sem JSON Schema.
 */
export async function traduzirTextoIA(texto: string): Promise<ResultadoTraducaoIA> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada.");
  }

  const resposta = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "Traduza o texto a seguir para português brasileiro. Preserve o sentido, os números, nomes próprios e a formatação em linhas. Retorne apenas o texto traduzido, sem comentários nem aspas.",
        },
        { role: "user", content: texto },
      ],
    }),
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.text();
    throw new Error(`Falha ao consultar OpenAI (HTTP ${resposta.status}): ${corpoErro}`);
  }

  const dados = (await resposta.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const textoTraduzido = dados.choices?.[0]?.message?.content;
  if (!textoTraduzido) {
    throw new Error("Resposta da OpenAI sem conteúdo.");
  }

  const consumo = calcularCustoOpenAI(dados.usage?.prompt_tokens ?? 0, dados.usage?.completion_tokens ?? 0);

  return { textoTraduzido, consumo };
}
