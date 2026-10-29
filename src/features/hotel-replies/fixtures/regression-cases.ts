// Fixtures de regressão (PRD §7.2) — corpos de e-mail sintéticos/anonimizados
// cobrindo os cenários de negócio centrais do motor de interpretação. Servem
// de base de comparação antes de qualquer ajuste futuro de prompt: qualquer
// mudança no prompt/schema deve manter estes casos passando, ou a mudança de
// comportamento deve ser deliberada e documentada.
//
// Casos resolvidos por REGEX ou pelo filtro de mensagem automática não
// chamam IA nenhuma. Casos marcados `requerIA: true` usam uma saída de IA
// mockada representativa do texto (nunca a API real — PRD §7.2/§7.3).

import type { DadosReservaParaIA } from "@/lib/openai/client";
import type { InterpretacaoResposta } from "@/lib/openai/schema";
import type { MensagemGraphParaFiltro } from "../automatic-message";

export type CasoRegressao = {
  nome: string;
  mensagem: MensagemGraphParaFiltro & { corpoHtmlOuPreview: string };
  reserva: DadosReservaParaIA;
  requerIA: boolean;
  respostaIAMockada?: InterpretacaoResposta;
  esperado: {
    metodoInterpretacao: "REGEX" | "OPENAI" | "AUTOMATICA";
    statusInterpretacao: "OK" | "REVISAR";
    reservaConfirmada: InterpretacaoResposta["reserva_confirmada"];
  };
};

const RESERVA_PADRAO: DadosReservaParaIA = {
  hotel: "Hotel Fictício Praia Azul",
  localizador: "9QGJZN",
  hospedes: "Hóspede Fictício Um, Hóspede Fictício Dois",
  dataCheckin: "10/12/2026",
  dataCheckout: "15/12/2026",
  regimeAlimentar: "Café da manhã",
  fornecedor: "Fornecedor Fictício Turismo",
};

function mensagemBase(
  overrides: Partial<MensagemGraphParaFiltro & { corpoHtmlOuPreview: string }>
): MensagemGraphParaFiltro & { corpoHtmlOuPreview: string } {
  return {
    assunto: "Re: Reconfirmação 9QGJZN",
    remetente: "reservas@hotelficticio-exemplo.test",
    cabecalhoAutoSubmitted: null,
    cabecalhoPrecedence: null,
    corpoHtmlOuPreview: "",
    ...overrides,
  };
}

export const CASOS_REGRESSAO: CasoRegressao[] = [
  {
    nome: "out-of-office nunca chega a interpretação de negócio",
    mensagem: mensagemBase({ assunto: "Automatic reply: Out of Office", corpoHtmlOuPreview: "<p>Estarei fora até o dia 20.</p>" }),
    reserva: RESERVA_PADRAO,
    requerIA: false,
    esperado: { metodoInterpretacao: "AUTOMATICA", statusInterpretacao: "REVISAR", reservaConfirmada: "INDEFINIDO" },
  },
  {
    nome: "resposta estruturada: reserva confirmada, pagamento pago, sem pendência -> OK",
    mensagem: mensagemBase({
      corpoHtmlOuPreview:
        "<p>Reserva confirmada: SIM</p><p>Numero de confirmacao: HCN-11223</p><p>Pagamento: Pago</p><p>Observacoes: Sem pendencias</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: false,
    esperado: { metodoInterpretacao: "REGEX", statusInterpretacao: "REVISAR", reservaConfirmada: "SIM" },
    // Nota: REVISAR aqui porque o fallback regex sempre marca
    // regime_alimentar_confirmado = INDEFINIDO (o formato estruturado não
    // tem campo próprio de regime) — mesmo comportamento do sistema de
    // referência (`interpretar_resposta_regex`), exige revisão humana do
    // regime alimentar mesmo com reserva/pagamento OK.
  },
  {
    nome: "resposta estruturada: pagamento pendente -> REVISAR",
    mensagem: mensagemBase({
      corpoHtmlOuPreview: "<p>Reserva confirmada: SIM</p><p>Pagamento: Pendente</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: false,
    esperado: { metodoInterpretacao: "REGEX", statusInterpretacao: "REVISAR", reservaConfirmada: "SIM" },
  },
  {
    nome: "resposta estruturada: reserva não confirmada -> REVISAR com reserva_confirmada NAO",
    mensagem: mensagemBase({
      corpoHtmlOuPreview: "<p>Reserva confirmada: NAO</p><p>Pagamento: Pendente</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: false,
    esperado: { metodoInterpretacao: "REGEX", statusInterpretacao: "REVISAR", reservaConfirmada: "NAO" },
  },
  {
    nome: "texto livre: reserva e regime alimentar confirmados pela IA, sem pendência -> OK",
    mensagem: mensagemBase({
      corpoHtmlOuPreview:
        "<p>Confirmamos a reserva 9QGJZN para os hóspedes informados, com café da manhã incluso. HCN interno: 442211.</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: true,
    respostaIAMockada: {
      reserva_confirmada: "SIM",
      regime_alimentar_confirmado: "SIM",
      numero_confirmacao_hotel: "442211",
      confirmacoes_multiplas: [],
      status_pagamento: "NAO_INFORMADO",
      correspondencia_reserva: "CONFIRMADA",
      divergencias: [],
      evidencias_confirmacao: ["Reserva confirmada citando o localizador e o regime de café da manhã."],
      tipo_pendencia: "NENHUMA",
      pendencia: null,
      resumo_resposta: "Hotel confirmou a reserva e o regime de café da manhã, com HCN 442211.",
      confianca: 0.88,
    },
    esperado: { metodoInterpretacao: "OPENAI", statusInterpretacao: "OK", reservaConfirmada: "SIM" },
  },
  {
    nome: "texto livre: divergência real de datas -> REVISAR com correspondencia DIVERGENTE",
    mensagem: mensagemBase({
      corpoHtmlOuPreview: "<p>Nossa reserva para esses hóspedes está confirmada para o período de 20 a 25/12, não 10 a 15/12.</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: true,
    respostaIAMockada: {
      reserva_confirmada: "SIM",
      regime_alimentar_confirmado: "INDEFINIDO",
      numero_confirmacao_hotel: null,
      confirmacoes_multiplas: [],
      status_pagamento: "NAO_INFORMADO",
      correspondencia_reserva: "DIVERGENTE",
      divergencias: ["Datas de check-in/check-out informadas pelo hotel divergem da reserva consultada."],
      evidencias_confirmacao: [],
      tipo_pendencia: "DIVERGENCIA",
      pendencia: "Confirmar datas corretas com o hotel.",
      resumo_resposta: "Hotel informou datas diferentes das registradas na reserva.",
      confianca: 0.7,
    },
    esperado: { metodoInterpretacao: "OPENAI", statusInterpretacao: "REVISAR", reservaConfirmada: "SIM" },
  },
  {
    nome: "texto livre: divergência de identificador (localizador x HCN) é corrigida e não bloqueia OK",
    mensagem: mensagemBase({
      corpoHtmlOuPreview:
        "<p>Reserva confirmada, café da manhã incluso. O localizador informado não corresponde ao número de confirmação recebido (HCN-9988).</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: true,
    respostaIAMockada: {
      reserva_confirmada: "SIM",
      regime_alimentar_confirmado: "SIM",
      numero_confirmacao_hotel: "HCN-9988",
      confirmacoes_multiplas: [],
      status_pagamento: "PAGO",
      correspondencia_reserva: "DIVERGENTE",
      divergencias: ["O localizador informado não corresponde ao número de confirmação recebido (HCN-9988)."],
      evidencias_confirmacao: ["Reserva confirmada com café da manhã incluso."],
      tipo_pendencia: "DIVERGENCIA",
      pendencia: "Divergência entre identificadores internos.",
      resumo_resposta: "Reserva confirmada pelo hotel. Divergência entre localizador informado e confirmação recebida (HCN-9988).",
      confianca: 0.8,
    },
    esperado: { metodoInterpretacao: "OPENAI", statusInterpretacao: "OK", reservaConfirmada: "SIM" },
    // Este é o caso que exercita `corrigirDivergenciaDeIdentificadores`: a
    // "divergência" é só o localizador interno nosso vs. o HCN do hotel —
    // não é divergência de negócio real, e deve ser neutralizada.
  },
  {
    nome: "texto livre: hotel informa confirmação com código em texto corrido ('bajo el código X') -> REVISAR, nunca NAO_CONFIRMADA",
    mensagem: mensagemBase({
      corpoHtmlOuPreview:
        "<p>Reserva confirmada bajo el codigo 442211. Prepagada. Desayuno incluido. No hay pago de impuestos a pagar.</p>",
    }),
    reserva: RESERVA_PADRAO,
    requerIA: true,
    // Caso real (localizador 7FX157, 2026-10-28): a IA, antes da correção de
    // prompt, preenchia reserva_confirmada=NAO e pendencia="HCN não
    // informado" mesmo tendo extraído o número corretamente — contradição
    // interna. Este fixture representa a saída CORRETA esperada após a
    // correção de prompt (src/lib/openai/client.ts): reserva_confirmada=SIM
    // (hotel confirmou a reserva), com o número extraído e sem pendência de
    // HCN "não informado" (foi informado, só não com o rótulo literal). A
    // pendência real aqui é só a ausência de confirmação do regime
    // alimentar, suficiente para exigir REVISAR.
    respostaIAMockada: {
      reserva_confirmada: "SIM",
      regime_alimentar_confirmado: "INDEFINIDO",
      numero_confirmacao_hotel: "442211",
      confirmacoes_multiplas: [],
      status_pagamento: "PAGO",
      correspondencia_reserva: "CONFIRMADA",
      divergencias: [],
      evidencias_confirmacao: ["Reserva confirmada citando o código 442211, prepaga, café da manhã incluso."],
      tipo_pendencia: "INFORMACAO_INCOMPLETA",
      pendencia: "Regime alimentar não confirmado explicitamente pelo hotel.",
      resumo_resposta: "Hotel confirmou a reserva sob o código 442211, prepaga, com café da manhã incluso.",
      confianca: 0.75,
    },
    esperado: { metodoInterpretacao: "OPENAI", statusInterpretacao: "REVISAR", reservaConfirmada: "SIM" },
  },
];
