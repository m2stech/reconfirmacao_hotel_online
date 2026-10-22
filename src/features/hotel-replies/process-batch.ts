import "server-only";

// Processamento de lote de leitura de respostas — portado do loop principal
// de respostas.py (`main`), mas como execução curta e idempotente disparada
// por Vercel Cron Job (CLAUDE.md: nada de `while` + `sleep` vivo), não um
// processo de longa duração. Cada chamada processa um lote limitado de
// reservas pendentes e retorna um resumo — o próximo disparo do Cron
// continua de onde este parou.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { buscarMensagensDaConversa } from "@/lib/graph/read-mail";
import { notificar } from "@/features/notifications/notify";
import { listarReservasAguardandoResposta } from "./pending";
import { listarInternetMessageIdsConhecidos } from "./queries";
import { interpretarResposta } from "./interpret";
import { persistirInterpretacao } from "./persist";
import { htmlParaTexto } from "./text";

type TypedClient = SupabaseClient<Database>;

function descreverErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (typeof erro === "object" && erro !== null) {
    try {
      return JSON.stringify(erro);
    } catch {
      return String(erro);
    }
  }
  return String(erro);
}

export type ResumoProcessamentoLote = {
  reservasVerificadas: number;
  mensagensEncontradas: number;
  respostasProcessadas: number;
  chamadasIA: number;
  circuitBreakerAcionado: boolean;
  erros: { reservationId: string; erro: string }[];
};

export type OpcoesProcessamentoLote = {
  /** Máximo de reservas pendentes verificadas nesta execução. */
  limiteReservas: number;
  /** Circuit breaker (PRD §12.5): interrompe o lote após N chamadas de IA, mesmo com reservas restantes. */
  limiteChamadasIA: number;
};

export const OPCOES_PADRAO: OpcoesProcessamentoLote = {
  limiteReservas: 25,
  limiteChamadasIA: 20,
};

/**
 * Processa um lote de reservas aguardando resposta: busca mensagens novas no
 * Graph, interpreta (automática/regex/IA) e persiste em `hotel_replies`.
 * Nunca lança por erro de uma reserva individual — cada falha é isolada e
 * reportada no resumo, para não travar o lote inteiro por um problema de
 * Graph/IA pontual numa única conversa.
 */
export async function processarLoteDeRespostas(
  supabase: TypedClient,
  opcoes: OpcoesProcessamentoLote = OPCOES_PADRAO
): Promise<ResumoProcessamentoLote> {
  const resumo: ResumoProcessamentoLote = {
    reservasVerificadas: 0,
    mensagensEncontradas: 0,
    respostasProcessadas: 0,
    chamadasIA: 0,
    circuitBreakerAcionado: false,
    erros: [],
  };

  const pendentes = await listarReservasAguardandoResposta(supabase, opcoes.limiteReservas);
  const internetIdsConhecidos = await listarInternetMessageIdsConhecidos(supabase);

  for (const pendente of pendentes) {
    if (resumo.chamadasIA >= opcoes.limiteChamadasIA) {
      resumo.circuitBreakerAcionado = true;
      break;
    }

    resumo.reservasVerificadas += 1;

    try {
      const mensagens = await buscarMensagensDaConversa(pendente.envio, internetIdsConhecidos);
      resumo.mensagensEncontradas += mensagens.length;

      for (const mensagem of mensagens) {
        if (resumo.chamadasIA >= opcoes.limiteChamadasIA) {
          resumo.circuitBreakerAcionado = true;
          break;
        }

        const resultado = await interpretarResposta(
          {
            assunto: mensagem.subject,
            remetente: mensagem.remetente,
            cabecalhoAutoSubmitted: mensagem.cabecalhoAutoSubmitted,
            cabecalhoPrecedence: mensagem.cabecalhoPrecedence,
            corpoHtmlOuPreview: mensagem.bodyContent ?? htmlParaTexto(mensagem.bodyPreview),
          },
          pendente.dadosParaIA
        );

        if (resultado.analise._metodoInterpretacao === "OPENAI") {
          resumo.chamadasIA += 1;
        }

        if (!mensagem.internetMessageId) continue;

        await persistirInterpretacao(
          supabase,
          pendente.emailSendId,
          { internetMessageId: mensagem.internetMessageId, recebidoEm: mensagem.receivedDateTime ?? new Date().toISOString() },
          resultado
        );
        internetIdsConhecidos.add(mensagem.internetMessageId);
        resumo.respostasProcessadas += 1;

        if (resultado.statusInterpretacao === "REVISAR") {
          await notificar(supabase, {
            reservationId: pendente.reservationId,
            tipo: "revisao_humana",
            mensagem: `Reserva ${pendente.envio.localizador}: resposta do hotel precisa de revisão humana.`,
            assuntoEmail: `[Reconfirmação] Revisão humana pendente — ${pendente.envio.localizador}`,
            corpoEmail: `<p>Uma resposta do hotel para a reserva <strong>${pendente.envio.localizador}</strong> foi interpretada, mas precisa de revisão humana antes de ser considerada confirmada.</p>`,
            createdByEnvioOriginal: pendente.createdByEnvioOriginal,
          });
        }
      }
    } catch (erro) {
      resumo.erros.push({ reservationId: pendente.reservationId, erro: descreverErro(erro) });
    }
  }

  return resumo;
}
