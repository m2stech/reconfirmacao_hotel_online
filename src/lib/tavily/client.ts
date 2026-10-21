import "server-only";

// Client Tavily — busca combinada de e-mail de reservas + país de um hotel
// numa única chamada (PRD §4.2, item 2: nunca duas chamadas separadas).
// Evolui o `agent.py` de referência (que só buscava e-mail, via qna_search e
// regex) adicionando o país e um nível de confiança por campo.

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// E-mails genéricos de plataforma (não é "o e-mail de reservas do hotel") —
// aparecem com frequência em páginas de OTA/agregador/da própria Tavily
// indexadas na busca (confirmado em teste de integração real: buscar um
// nome de hotel inexistente faz a Tavily retornar sua própria página
// institucional como resultado de baixo score, com support@tavily.com).
const DOMINIOS_IGNORADOS = [
  "booking.com",
  "expedia.com",
  "tripadvisor.com",
  "google.com",
  "sentry.io",
  "wixpress.com",
  "tavily.com",
];

// Resultado com score de relevância abaixo disso é ruído (página genérica
// sem relação real com o hotel buscado) — não deve contribuir para extração
// de e-mail/país. Observado em teste real: resultados irrelevantes vêm com
// score ~0.02–0.2, resultado relevante do próprio hotel tende a score > 0.4.
const SCORE_MINIMO_RESULTADO = 0.3;

export type ResultadoBuscaContatoHotel = {
  email: string | null;
  confiancaEmail: number; // 0 a 1
  pais: string | null;
  confiancaPais: number; // 0 a 1
};

type TavilySearchResult = {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
};

type TavilySearchResponse = {
  answer?: string;
  results?: TavilySearchResult[];
};

// Resposta sintetizada do Tavily costuma ter frases mistas: algumas negam
// ter encontrado o dado ("sources do not provide X"), outras, na mesma
// resposta, citam um e-mail/país real de outro contexto. Descartar a
// resposta inteira por ter 1 frase de negação perderia o dado real (caso
// observado: Hilton Lisbon); descartar só a frase negada evita tanto o
// falso-positivo (hotel sintético, resposta 100% negada) quanto o
// falso-negativo (hotel real, negação seguida de dado real válido).
const NEGACAO = /(?:does|do) not (?:provide|mention|list|include)/i;

function removerFrasesComNegacao(texto: string): string {
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => !NEGACAO.test(frase))
    .join(" ");
}

function extrairEmails(texto: string): string[] {
  const encontrados = texto.match(EMAIL_REGEX) ?? [];
  return Array.from(new Set(encontrados)).filter(
    (email) => !DOMINIOS_IGNORADOS.some((dominio) => email.toLowerCase().endsWith(`@${dominio}`))
  );
}

/**
 * Busca e-mail de reservas e país de um hotel numa única chamada Tavily,
 * combinando a resposta sintetizada (`answer`) com os resultados brutos
 * (`results`) para extrair e-mail por regex. Nunca chamar isto para um hotel
 * já conhecido com contato não-obsoleto — ver `enrich.ts`.
 */
export async function buscarContatoHotel(nomeHotel: string): Promise<ResultadoBuscaContatoHotel> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY não configurada.");
  }

  const resposta = await fetch(TAVILY_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query: `reservations email address and country (not city) of "${nomeHotel}" hotel`,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!resposta.ok) {
    // Nunca propagar o corpo bruto da resposta de erro para quem chama: ele
    // pode conter detalhe de infraestrutura que não deve chegar à UI caso o
    // chamador devolva error.message cru numa resposta de API.
    throw new Error(`Falha ao consultar Tavily (HTTP ${resposta.status}).`);
  }

  const dados = (await resposta.json()) as TavilySearchResponse;
  const resultadosRelevantes = (dados.results ?? []).filter(
    (r) => (r.score ?? 0) >= SCORE_MINIMO_RESULTADO
  );
  const conteudoRelevante = resultadosRelevantes.map((r) => r.content ?? "").join("\n");

  // Remove frases de negação ("sources do not provide...") antes de extrair
  // — mantém frases vizinhas que de fato citam um dado real.
  const respostaUtil = dados.answer ? removerFrasesComNegacao(dados.answer) : "";

  const emails = extrairEmails([respostaUtil, conteudoRelevante].join("\n"));
  const email = emails[0] ?? null;
  // Confiança heurística: resposta sintetizada do Tavily (answer) mencionando
  // o e-mail é mais confiável do que só aparecer em conteúdo bruto de página.
  const confiancaEmail = email ? (respostaUtil.includes(email) ? 0.7 : 0.5) : 0;

  const pais = extrairPais(respostaUtil);
  const confiancaPais = pais ? 0.6 : 0;

  return { email, confiancaEmail, pais, confiancaPais };
}

// Heurística sobre a resposta em linguagem natural do Tavily (país errado
// aqui não bloqueia envio, só fica marcado "a confirmar" — PRD §4.2 item 2).
// Prioriza padrões explícitos de país ("country of/is X", "country: X"),
// recorrendo a "located in X"/"in X" só se nenhum padrão explícito aparecer
// — captar a primeira cidade mencionada ("in Lisbon") é pior do que nada.
// Nomes de país compostos ("United States", "South Africa") têm a 2ª palavra
// também capitalizada; nomes de cidade/frase comum que vêm depois não — daí
// exigir que a 2ª palavra opcional também comece maiúscula. Sem flag "i":
// precisa ficar case-sensitive aqui, senão "is"/"in" minúsculos também
// casariam [A-ZÀ-Ý].
const PADRAO_EXPLICITO = /[Cc]ountry\s+(?:of|is|:)\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s[A-ZÀ-Ý][a-zà-ÿ]+)?)/;
const PADRAO_GENERICO = /(?:located in|in)\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s[A-ZÀ-Ý][a-zà-ÿ]+)?)/;

function extrairPais(respostaTavily: string): string | null {
  const matchExplicito = respostaTavily.match(PADRAO_EXPLICITO);
  if (matchExplicito) return matchExplicito[1];

  const matchGenerico = respostaTavily.match(PADRAO_GENERICO);
  return matchGenerico ? matchGenerico[1] : null;
}
