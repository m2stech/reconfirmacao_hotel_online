"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ResumoVerificacao = {
  reservasVerificadas: number;
  mensagensEncontradas: number;
  respostasProcessadas: number;
  chamadasIA: number;
  circuitBreakerAcionado: boolean;
  erros: { reservationId: string; erro: string }[];
};

/**
 * Dispara manualmente o mesmo processamento do job de leitura de respostas
 * (Cron Job 1x/dia, limite do plano Vercel Hobby — ver PLAN.md Milestone
 * 10) — para o consultor não precisar esperar até o próximo horário
 * agendado para ver uma resposta de hotel já recebida.
 */
export function VerificarRespostasButton() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(false);

  async function verificar() {
    setVerificando(true);
    try {
      const resposta = await fetch("/api/audit/verificar-respostas", { method: "POST" });
      const dados = (await resposta.json()) as { ok: boolean; erro?: string; resumo?: ResumoVerificacao };

      if (!dados.ok) {
        toast.error(dados.erro ?? "Falha ao verificar respostas.");
        return;
      }

      const resumo = dados.resumo!;
      if (resumo.respostasProcessadas === 0) {
        toast.info(
          resumo.reservasVerificadas === 0
            ? "Nenhuma reserva aguardando resposta no momento."
            : "Nenhuma resposta nova encontrada."
        );
      } else {
        toast.success(
          `${resumo.respostasProcessadas} resposta(s) processada(s) de ${resumo.reservasVerificadas} reserva(s) verificada(s).`
        );
      }

      if (resumo.erros.length > 0) {
        toast.error(`${resumo.erros.length} reserva(s) com erro ao verificar — tente novamente em instantes.`);
      }

      router.refresh();
    } catch {
      toast.error("Falha ao verificar respostas.");
    } finally {
      setVerificando(false);
    }
  }

  return (
    <Button variant="outline" onClick={verificar} disabled={verificando}>
      {verificando ? "Verificando..." : "Verificar respostas agora"}
    </Button>
  );
}
