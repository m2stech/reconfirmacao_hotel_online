// Montagem de e-mail HTML multilíngue (PT/ES/EN), portado de
// reconfirmacao_Hoteis/enviar_email.py (`montar_assunto`/`montar_corpo_html`).
//
// Diferença em relação ao original: lá o idioma vinha do país do hóspede
// (1 e-mail por linha/hóspede); aqui 1 e-mail consolida todos os hóspedes de
// um localizador+hotel (PRD §4.1.2), então não há "o" hóspede para definir o
// idioma — o idioma passa a ser o do hotel (reconfirmacao.hotels.idioma),
// que já é o campo correto para isso no schema (PRD §4.2.1).

export type Idioma = "pt" | "es" | "en";

const PAISES_PORTUGUES = new Set(["brasil", "portugal"]);
const PAISES_ESPANHOL = new Set([
  "espana",
  "espanha",
  "argentina",
  "chile",
  "mexico",
  "uruguay",
  "paraguay",
  "colombia",
  "peru",
  "bolivia",
  "ecuador",
  "venezuela",
  "costa rica",
  "panama",
  "guatemala",
  "honduras",
  "el salvador",
  "nicaragua",
  "republica dominicana",
]);

function normalizarSemAcentos(valor: string): string {
  return valor
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Deriva o idioma do e-mail a partir do país do hotel. Default: inglês. */
export function idiomaPorPais(pais: string | null | undefined): Idioma {
  const valor = normalizarSemAcentos(pais ?? "");
  if (!valor) return "en";
  if (PAISES_PORTUGUES.has(valor)) return "pt";
  if (PAISES_ESPANHOL.has(valor)) return "es";
  return "en";
}

function escapeHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatarDataBr(isoDate: string | null | undefined): string {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate;
  return `${dia}/${mes}/${ano}`;
}

export type DadosEmailReconfirmacao = {
  hotelNome: string;
  localizador: string;
  localizadorExterno: string | null;
  dataCheckin: string | null;
  dataCheckout: string | null;
  hospedes: { nome: string }[];
  tipoHabitacao: string | null;
  regimeAlimentar: string | null;
  fornecedor: string | null;
  pais: string | null;
};

export function montarAssunto(dados: DadosEmailReconfirmacao): string {
  const idioma = idiomaPorPais(dados.pais);
  const entrada = formatarDataBr(dados.dataCheckin);
  const prefixo =
    idioma === "pt"
      ? "Confirmação de reserva"
      : idioma === "es"
        ? "Confirmación de reserva"
        : "Reservation confirmation";

  return `${prefixo} - ${dados.hotelNome} - Checkin: ${entrada}`;
}

export function montarCorpoHtml(dados: DadosEmailReconfirmacao): string {
  const idioma = idiomaPorPais(dados.pais);
  const entrada = escapeHtml(formatarDataBr(dados.dataCheckin));
  const saida = escapeHtml(formatarDataBr(dados.dataCheckout));
  const hospedes = escapeHtml(dados.hospedes.map((hospede) => hospede.nome).join("\n")).replace(/\n/g, "<br>");
  const apartamento = escapeHtml(dados.tipoHabitacao ?? "");
  const regimeAlimentar = escapeHtml(dados.regimeAlimentar ?? "");
  const fornecedor = escapeHtml(dados.fornecedor ?? "");
  const localizadorBroker = escapeHtml(dados.localizadorExterno ?? dados.localizador);
  const referenciaSnow = escapeHtml(dados.localizador);

  let corpo: string;
  if (idioma === "pt") {
    corpo = `<p>Prezados,</p>
<p>Espero que esta mensagem os encontre bem.</p>
<br>
<p>Meu nome é Evelyn, e faço parte do time de Vendas da Snow Operadora.</p>
<p>Gostaria de confirmar se está tudo correto com a seguinte reserva:</p>
<p><strong>Período de estadia:</strong> de ${entrada} a ${saida}</p>
<p><strong>Hóspede:</strong> ${hospedes}</p>
<p><strong>Apartamento:</strong> ${apartamento}</p>
<p><strong>Regime alimentar de todos os passageiros:</strong> ${regimeAlimentar}</p>
<p><strong>Essa reserva foi realizada através do broker parceiro: ${fornecedor}</strong></p>
<p><strong>Localizador Broker:</strong> ${localizadorBroker}</p>
<p><strong>Referência Snow Operadora:</strong> ${referenciaSnow}</p>
<br>
<p>Estamos realizando esta verificação como parte de um procedimento interno, com o objetivo de garantir que tudo esteja em ordem e evitar qualquer imprevisto para nossos passageiros.</p>
<p><strong>Poderia nos informar o número de confirmação (HCN) interno do hotel para esta reserva?</strong></p>
<p><strong>Sobre o status do pagamento, poderiam nos informar se já houve processamento ou se há alguma pendência que precise ser tratada de nossa parte?</strong></p>
<br>
<p>Agradeço antecipadamente pela atenção e colaboração.</p>
<p>Fico no aguardo de seu retorno.</p>
<p>Obrigada.</p>
<p><strong><br>Evelyn Travassos<br><br>Analista de Produtos / Product Analyst<br><br>Tel: +55 (31) 3303-7615</strong></p>`;
  } else if (idioma === "es") {
    corpo = `<p>Estimados,</p>
<p>Espero que se encuentren bien.</p>
<br>
<p>Mi nombre es Evelyn y formo parte del equipo de Ventas de Snow Operadora.</p>
<p>Me gustaría confirmar que todo esté correcto con la siguiente reserva:</p>
<p><strong>Período de estadía:</strong> del ${entrada} al ${saida}</p>
<p><strong>Huésped:</strong> ${hospedes}</p>
<p><strong>Habitación:</strong> ${apartamento}</p>
<p><strong>Régimen alimentario de todos los pasajeros:</strong> ${regimeAlimentar}</p>
<p><strong>Esta reserva fue realizada a través de nuestro broker asociado: ${fornecedor}</strong></p>
<p><strong>Localizador del broker:</strong> ${localizadorBroker}</p>
<p><strong>Referencia Snow Operadora:</strong> ${referenciaSnow}</p>
<br>
<p>Estamos realizando esta verificación como parte de un procedimiento interno, con el objetivo de garantizar que todo esté en orden y evitar cualquier inconveniente para nuestros pasajeros.</p>
<p><strong>¿Podrían informarnos el número de confirmación (HCN) interno del hotel para esta reserva?</strong></p>
<p><strong>Sobre el estado del pago, ¿podrían informarnos si ya fue procesado o si existe alguna pendiente que debamos gestionar?</strong></p>
<br>
<p>Agradezco de antemano su atención y colaboración.</p>
<p>Quedo a la espera de su respuesta.</p>
<p>Gracias.</p>
<p><strong><br>Evelyn Travassos<br><br>Analista de Productos / Product Analyst<br><br>Tel: +55 (31) 3303-7615</strong></p>`;
  } else {
    corpo = `<p>Dear Hotel Team,</p>
<p>I hope this message finds you well.</p>
<br>
<p>My name is Evelyn, and I am part of the Sales team at Snow Operadora.</p>
<p>I would like to confirm that everything is in order with the following reservation:</p>
<p><strong>Stay period:</strong> from ${entrada} to ${saida}</p>
<p><strong>Guest:</strong> ${hospedes}</p>
<p><strong>Room:</strong> ${apartamento}</p>
<p><strong>Meal plan for all passengers:</strong> ${regimeAlimentar}</p>
<p><strong>This reservation was made through our partner broker: ${fornecedor}</strong></p>
<p><strong>Broker locator:</strong> ${localizadorBroker}</p>
<p><strong>Snow Operadora reference:</strong> ${referenciaSnow}</p>
<br>
<p>We are carrying out this verification as part of an internal procedure to ensure that everything is in order and to avoid any inconvenience for our passengers.</p>
<p><strong>Could you please provide us with the hotel's internal confirmation number (HCN) for this reservation?</strong></p>
<p><strong>Regarding the payment status, could you please let us know whether it has already been processed or if there is any pending issue that needs to be handled on our end?</strong></p>
<br>
<p>Thank you in advance for your attention and cooperation.</p>
<p>I look forward to your reply.</p>
<p>Thank you.</p>
<p><strong><br>Evelyn Travassos<br><br>Product Analyst<br><br>Tel: +55 (31) 3303-7615</strong></p>`;
  }

  return corpo;
}

export const ASSINATURA_CONTENT_ID = "assinatura-snow";

export function envolverComAssinatura(corpoHtml: string): string {
  return (
    '<div style="font-family:Aptos,Calibri,Arial,sans-serif;font-size:11pt;">' +
    `${corpoHtml}<p><img src="cid:${ASSINATURA_CONTENT_ID}" ` +
    'alt="Assinatura Snow Operadora" width="476" ' +
    'style="max-width:100%;height:auto;"></p></div>'
  );
}
