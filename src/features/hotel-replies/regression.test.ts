import { describe, expect, it, vi } from "vitest";
import { CASOS_REGRESSAO } from "./fixtures/regression-cases";

// Suíte de regressão (PRD §7.2) — roda todos os fixtures sintéticos contra o
// motor de interpretação completo (automática -> regex -> IA mockada ->
// pós-processamento -> status). Qualquer ajuste futuro de prompt/schema deve
// manter estes casos passando, ou a mudança precisa ser deliberada.
describe("suíte de regressão do motor de interpretação de respostas", () => {
  for (const caso of CASOS_REGRESSAO) {
    it(caso.nome, async () => {
      vi.resetModules();
      if (caso.requerIA) {
        vi.doMock("@/lib/openai/client", async () => {
          const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
          return {
            ...real,
            interpretarRespostaIA: vi.fn().mockResolvedValue({
              analise: caso.respostaIAMockada,
              consumo: { inputTokens: 400, outputTokens: 100, totalTokens: 500, custoUsd: 0.00006 },
            }),
          };
        });
      } else {
        vi.doMock("@/lib/openai/client", async () => {
          const real = await vi.importActual<typeof import("@/lib/openai/client")>("@/lib/openai/client");
          return { ...real, interpretarRespostaIA: vi.fn().mockRejectedValue(new Error("IA não deveria ser chamada neste caso")) };
        });
      }

      const { interpretarResposta } = await import("./interpret");
      const resultado = await interpretarResposta(caso.mensagem, caso.reserva);

      expect(resultado.analise._metodoInterpretacao).toBe(caso.esperado.metodoInterpretacao);
      expect(resultado.statusInterpretacao).toBe(caso.esperado.statusInterpretacao);
      expect(resultado.analise.reserva_confirmada).toBe(caso.esperado.reservaConfirmada);

      vi.doUnmock("@/lib/openai/client");
    });
  }
});
