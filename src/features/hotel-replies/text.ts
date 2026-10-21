// Limpeza de corpo de e-mail — portado de respostas.py (`html_para_texto`,
// `remover_historico_citado`, `_localizar_bloco_cabecalho_outlook`).
// Converte HTML em texto simples e corta o histórico citado (resposta
// anterior "colada" pelo cliente de e-mail) antes de interpretar.

function limparTexto(valor: string | null | undefined): string {
  if (valor == null) return "";
  return String(valor).replace(/_x000D_/g, "").trim();
}

function unescapeHtml(valor: string): string {
  return valor
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

const TAGS_QUEBRA_LINHA = new Set(["br", "p", "div", "li", "tr"]);

function htmlParaTextoSimples(html: string): string {
  let resultado = "";
  let indice = 0;
  while (indice < html.length) {
    const abreTag = html.indexOf("<", indice);
    if (abreTag === -1) {
      resultado += html.slice(indice);
      break;
    }
    resultado += html.slice(indice, abreTag);
    const fechaTag = html.indexOf(">", abreTag);
    if (fechaTag === -1) break;
    const tag = html.slice(abreTag + 1, fechaTag).trim();
    const nomeTag = tag.replace(/^\//, "").split(/\s/)[0]?.toLowerCase() ?? "";
    if (TAGS_QUEBRA_LINHA.has(nomeTag)) {
      resultado += "\n";
    }
    indice = fechaTag + 1;
  }
  return resultado;
}

function localizarBlocoCabecalhoOutlook(texto: string): number | null {
  const linhas = texto.split("\n");
  const offsets: number[] = [];
  let offset = 0;
  for (const linha of linhas) {
    offsets.push(offset);
    offset += linha.length + 1;
  }

  const gruposMarcadores = [
    ["de", "enviado", "para", "assunto"],
    ["from", "sent", "to", "subject"],
  ];

  for (let indice = 0; indice < linhas.length; indice++) {
    if (!/^\s*(de|from)\s*:/i.test(linhas[indice].trim())) continue;
    const janela = linhas.slice(indice, indice + 6).join("\n");
    for (const marcadores of gruposMarcadores) {
      const todosPresentes = marcadores.every((marcador) =>
        new RegExp(`^\\s*${marcador}\\s*:`, "im").test(janela)
      );
      if (todosPresentes) return offsets[indice];
    }
  }
  return null;
}

function removerHistoricoCitado(texto: string): string {
  const marcadores = [/^[- ]*original message[- ]*$/im, /^[- ]*mensagem original[- ]*$/im, /^on .+ wrote:$/im, /^em .+ escreveu:$/im];
  const posicoes: number[] = [];
  for (const marcador of marcadores) {
    const resultado = marcador.exec(texto);
    if (resultado) posicoes.push(resultado.index);
  }

  const posicaoBloco = localizarBlocoCabecalhoOutlook(texto);
  if (posicaoBloco !== null) posicoes.push(posicaoBloco);

  if (posicoes.length === 0) return texto;
  return texto.slice(0, Math.min(...posicoes)).replace(/\s+$/, "");
}

export function htmlParaTexto(valor: string | null | undefined): string {
  const limpo = unescapeHtml(limparTexto(valor));
  const texto = htmlParaTextoSimples(limpo).replace(/\r/g, "");
  const linhas = texto
    .split("\n")
    .map((linha) => linha.replace(/[ \t]+/g, " ").trim())
    .filter((linha) => linha.length > 0);
  return removerHistoricoCitado(linhas.join("\n"));
}

export { limparTexto };
