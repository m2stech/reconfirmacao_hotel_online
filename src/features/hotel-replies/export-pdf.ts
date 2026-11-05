"use client";

// Geração de PDF da resposta do hotel no navegador, para o consultor anexar
// na intranet como comprovante — ver CHANGELOG 2026-11-05.

export type ReservaParaPdf = {
  localizador: string;
  fornecedor: string | null;
  data_checkin: string | null;
  data_checkout: string | null;
  hospedes: { nome: string }[];
  hotels: { nome: string } | null;
};

export type RespostaParaPdf = {
  recebido_em: string;
};

export async function baixarRespostaComoPdf({
  reserva,
  resposta,
  textoExibido,
}: {
  reserva: ReservaParaPdf;
  resposta: RespostaParaPdf;
  textoExibido: string;
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const margemEsquerda = 48;
  const larguraUtil = doc.internal.pageSize.getWidth() - margemEsquerda * 2;
  const alturaPagina = doc.internal.pageSize.getHeight();
  let y = 56;

  function novaLinhaSeNecessario(alturaLinha: number) {
    if (y + alturaLinha > alturaPagina - 48) {
      doc.addPage();
      y = 56;
    }
  }

  function escreverTitulo(texto: string) {
    novaLinhaSeNecessario(22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(texto, margemEsquerda, y);
    y += 22;
  }

  function escreverCampo(rotulo: string, valor: string) {
    novaLinhaSeNecessario(16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${rotulo}:`, margemEsquerda, y);
    doc.setFont("helvetica", "normal");
    doc.text(valor, margemEsquerda + 110, y);
    y += 16;
  }

  escreverTitulo(`Resposta do hotel — reserva ${reserva.localizador}`);
  y += 4;

  escreverCampo("Hotel", reserva.hotels?.nome ?? "—");
  escreverCampo("Fornecedor", reserva.fornecedor ?? "—");
  escreverCampo("Check-in / Check-out", `${reserva.data_checkin ?? "—"} a ${reserva.data_checkout ?? "—"}`);
  escreverCampo("Hóspedes", reserva.hospedes.map((h) => h.nome).join(", ") || "—");
  escreverCampo("Resposta recebida em", new Date(resposta.recebido_em).toLocaleString("pt-BR"));

  y += 8;
  novaLinhaSeNecessario(1);
  doc.setDrawColor(200);
  doc.line(margemEsquerda, y, margemEsquerda + larguraUtil, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const linhas = doc.splitTextToSize(textoExibido, larguraUtil);
  for (const linha of linhas) {
    novaLinhaSeNecessario(14);
    doc.text(linha, margemEsquerda, y);
    y += 14;
  }

  doc.save(`resposta-hotel-${reserva.localizador}.pdf`);
}
