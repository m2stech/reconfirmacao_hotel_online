// Teste de integração MANUAL — chama a Graph API de verdade contra a conta
// de teste do .env (MS_GRAPH_AUTHORIZED_EMAIL é só o REMETENTE/autenticação;
// o destinatário abaixo é fixo, nunca lido do .env, para nunca disparar a um
// hotel real por engano). Nunca roda em CI/suite automática (fora de
// src/**/*.test.ts, não é descoberto pelo Vitest) e nunca usa dado de
// reserva real (CLAUDE.md / PRD §7.1, §7.4).
//
// Objetivo: permitir revisão humana do assunto/corpo oficiais nos 3 idiomas
// (PT/ES/EN) antes de qualquer envio real a hotel.
//
// Uso: npx tsx src/lib/graph/__integration__/send-mail-multilingue.manual.ts

import { loadEnvFile } from "node:process";
import path from "node:path";

// Script standalone (fora do Next.js/Vitest) — carrega o .env manualmente.
try {
  loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // Next.js/Vitest já carregam .env por conta própria; nada a fazer aqui.
}

import { montarAssunto, montarCorpoHtml, envolverComAssinatura } from "../email-template";
import { enviarEmail } from "../send-mail";

const DESTINATARIO_REVISAO = "mauricio@m2stech.tur.br";

const CASOS = [
  {
    idioma: "PT",
    dados: {
      hotelNome: "Hotel Fictício Praia Azul",
      localizador: "9QGJZN",
      localizadorExterno: "EXT-TESTE-123",
      dataCheckin: "2026-12-10",
      dataCheckout: "2026-12-15",
      hospedes: [{ nome: "Hóspede Fictício Um" }, { nome: "Hóspede Fictício Dois" }],
      tipoHabitacao: "Standard Duplo",
      regimeAlimentar: "Café da manhã",
      fornecedor: "Fornecedor Fictício Turismo",
      pais: "Brasil",
    },
  },
  {
    idioma: "ES",
    dados: {
      hotelNome: "Hotel Ficticio Playa Azul",
      localizador: "7XQRST",
      localizadorExterno: "EXT-TESTE-456",
      dataCheckin: "2026-12-10",
      dataCheckout: "2026-12-15",
      hospedes: [{ nome: "Huésped Ficticio Uno" }, { nome: "Huésped Ficticio Dos" }],
      tipoHabitacao: "Standard Doble",
      regimeAlimentar: "Desayuno",
      fornecedor: "Proveedor Ficticio Turismo",
      pais: "Argentina",
    },
  },
  {
    idioma: "EN",
    dados: {
      hotelNome: "Fictitious Blue Beach Hotel",
      localizador: "4MNPQR",
      localizadorExterno: "EXT-TESTE-789",
      dataCheckin: "2026-12-10",
      dataCheckout: "2026-12-15",
      hospedes: [{ nome: "Fictitious Guest One" }, { nome: "Fictitious Guest Two" }],
      tipoHabitacao: "Standard Double",
      regimeAlimentar: "Breakfast",
      fornecedor: "Fictitious Tour Operator",
      pais: "Estados Unidos",
    },
  },
] as const;

async function main() {
  console.log(`Enviando 3 e-mails de teste (PT/ES/EN) para ${DESTINATARIO_REVISAO}...\n`);

  let algumFalhou = false;
  for (const caso of CASOS) {
    const assunto = `[TESTE Milestone 9 — revisão ${caso.idioma}] ${montarAssunto(caso.dados)}`;
    const corpoHtml = envolverComAssinatura(montarCorpoHtml(caso.dados));

    console.log(`[${caso.idioma}] Assunto: ${assunto}`);
    const resultado = await enviarEmail({
      destinatario: DESTINATARIO_REVISAO,
      assunto,
      corpoHtmlComAssinatura: corpoHtml,
    });
    console.log(`[${caso.idioma}] Resultado:`, JSON.stringify(resultado, null, 2), "\n");

    if (!resultado.sucesso) algumFalhou = true;
  }

  if (algumFalhou) process.exitCode = 1;
}

main();
