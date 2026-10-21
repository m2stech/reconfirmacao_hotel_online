// Conversão entre a representação de domínio da IA (enums SIM/NAO/INDEFINIDO,
// igual ao sistema de referência) e a representação de persistência em
// `reconfirmacao.hotel_replies` (boolean | null — ver migration do Milestone 2).
// INDEFINIDO vira null: "não sabemos" não é o mesmo que "não confirmado".

import type { ReservaConfirmada } from "@/lib/openai/schema";

export function simNaoParaBooleano(valor: ReservaConfirmada): boolean | null {
  if (valor === "SIM") return true;
  if (valor === "NAO") return false;
  return null;
}

export function booleanoParaSimNao(valor: boolean | null): ReservaConfirmada {
  if (valor === true) return "SIM";
  if (valor === false) return "NAO";
  return "INDEFINIDO";
}
