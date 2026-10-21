import "server-only";

// Orquestração da interpretação de uma resposta de hotel — portado de
// respostas.py (`processar_mensagem`). Ordem: filtro de mensagem automática
// -> fallback regex -> IA (PRD §12.5, reduz custo de IA). Pós-processamento
// (fallback de número, correção de divergência, mapeamento de confirmação
// múltipla) sempre aplicado, independente do método.

import { interpretarRespostaIA, type DadosReservaParaIA } from "@/lib/openai/client";
import { ehMensagemAutomatica, type MensagemGraphParaFiltro } from "./automatic-message";
import { interpretarRespostaRegex, type InterpretacaoComMetadados } from "./regex-fallback";
import { aplicarFallbackExtracao, corrigirDivergenciaDeIdentificadores, mapearConfirmacaoCorreta } from "./postprocess";
import { analiseMensagemAutomatica, determinarStatusInterpretacao, type StatusInterpretacao } from "./status";
import { htmlParaTexto } from "./text";

export type ResultadoInterpretacao = {
  analise: InterpretacaoComMetadados;
  corpoTexto: string;
  statusInterpretacao: StatusInterpretacao;
};

/**
 * Interpreta uma mensagem recebida do hotel, já decidindo e aplicando o
 * método correto (automática / regex / IA) e todo o pós-processamento.
 * Nunca chama a IA para mensagem automática nem quando o regex reconhece o
 * formato estruturado — só o estritamente necessário.
 */
export async function interpretarResposta(
  mensagem: MensagemGraphParaFiltro & { corpoHtmlOuPreview: string },
  reserva: DadosReservaParaIA
): Promise<ResultadoInterpretacao> {
  if (ehMensagemAutomatica(mensagem)) {
    const analise = analiseMensagemAutomatica();
    const corpoTexto = htmlParaTexto(mensagem.corpoHtmlOuPreview);
    return { analise, corpoTexto, statusInterpretacao: determinarStatusInterpretacao(analise) };
  }

  const corpoTexto = htmlParaTexto(mensagem.corpoHtmlOuPreview);

  const analiseRegex = interpretarRespostaRegex(corpoTexto);
  let analise: InterpretacaoComMetadados;
  if (analiseRegex !== null) {
    analise = analiseRegex;
  } else {
    const { analise: analiseIA, consumo } = await interpretarRespostaIA(reserva, corpoTexto);
    analise = { ...analiseIA, _metodoInterpretacao: "OPENAI", _consumo: consumo };
  }

  analise = { ...corrigirDivergenciaDeIdentificadores(aplicarFallbackExtracao(analise, corpoTexto)), _metodoInterpretacao: analise._metodoInterpretacao, _consumo: analise._consumo };

  const numeroFinal = mapearConfirmacaoCorreta(analise, reserva.hospedes);
  if (numeroFinal !== analise.numero_confirmacao_hotel) {
    analise = { ...analise, numero_confirmacao_hotel: numeroFinal };
  }

  return { analise, corpoTexto, statusInterpretacao: determinarStatusInterpretacao(analise) };
}
