import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { simNaoParaBooleano } from "./mapping";
import type { ResultadoInterpretacao } from "./interpret";
import { registrarResposta } from "./queries";

type TypedClient = SupabaseClient<Database>;

export type MensagemGraphParaPersistencia = {
  internetMessageId: string;
  recebidoEm: string;
};

/**
 * Converte o resultado de `interpretarResposta` para o formato de
 * `reconfirmacao.hotel_replies` e grava. `metodo_interpretacao: 'manual'`
 * nunca é gravado aqui — reservado para edição manual de auditoria
 * (Milestone 4), que já grava direto via `audit_log`.
 */
export async function persistirInterpretacao(
  supabase: TypedClient,
  emailSendId: string,
  mensagem: MensagemGraphParaPersistencia,
  resultado: ResultadoInterpretacao
) {
  const { analise, corpoTexto } = resultado;
  const metodo = analise._metodoInterpretacao === "OPENAI" ? "ia" : analise._metodoInterpretacao === "REGEX" ? "regex" : "ia";

  return registrarResposta(supabase, {
    email_send_id: emailSendId,
    internet_message_id: mensagem.internetMessageId,
    recebido_em: mensagem.recebidoEm,
    corpo_texto: corpoTexto,
    metodo_interpretacao: metodo,
    reserva_confirmada: simNaoParaBooleano(analise.reserva_confirmada),
    regime_alimentar_confirmado: simNaoParaBooleano(analise.regime_alimentar_confirmado),
    numeros_confirmacao: analise.confirmacoes_multiplas.length > 0 ? analise.confirmacoes_multiplas : analise.numero_confirmacao_hotel ? [{ hospede: "NAO_INFORMADO", numero_confirmacao: analise.numero_confirmacao_hotel }] : [],
    status_pagamento: analise.status_pagamento,
    divergencias: analise.divergencias.length > 0 ? analise.divergencias.join("; ") : null,
    pendencias: analise.pendencia,
    resumo: analise.resumo_resposta,
    confianca: analise._metodoInterpretacao === "OPENAI" ? analise.confianca : null,
    openai_tokens_input: analise._consumo.inputTokens || null,
    openai_tokens_output: analise._consumo.outputTokens || null,
    openai_custo_usd: analise._consumo.custoUsd || null,
  });
}
